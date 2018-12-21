'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var _ = require('underscore');
var marked = require('marked');
var hljs = require('highlight.js');
var sanitizeHtml = require('sanitize-html');
var colors = require('ansi-colors');

var isSameOrigin = require('./helpers').isSameOrigin;

var jsdom = require("jsdom");
var { JSDOM } = jsdom;

var htmlWhitelistPost = require('./htmlWhitelistPost.json');
var htmlWhitelistFollow = require('./htmlWhitelistFollow.json');
var renderer = new marked.Renderer();
var blockRenderers = [
  'blockquote',
  'html',
  'list',
  'paragraph',
  'table'
];

// Transform exact Github Flavored Markdown generated style tags to bootstrap custom classes
// to allow the sanitizer to whitelist on th and td tags for table alignment
function gfmStyleToBootstrapClass(aTagName, aAttribs) {
  if (aAttribs.align) {
    switch (aAttribs.align) {
      case 'center':
        return {
          tagName: aTagName,
          attribs: { class: 'text-center' }
        };
      case 'left':
        return {
          tagName: aTagName,
          attribs: { class: 'text-left' }
        };
      case 'right':
        return {
          tagName: aTagName,
          attribs: { class: 'text-right' }
        };
    }
  }

  return {
    tagName: aTagName,
    attribs: aAttribs
  };
}

// Transform external content tags for SEO vs Privacy via GDPR
function externalPolicy(aTagName, aAttribs) {
  var attribRelAdd = [];
  var attribRelReject = [
    'dns-prefetch',
    'preconnect',
    'prefetch'
  ];
  var obj = null;
  var dn = null;
  var matches = null;

  switch (aTagName) {
    case 'a':
      obj = isSameOrigin(aAttribs.href);
      if (!obj.result) {
        attribRelAdd.push('external');
        attribRelAdd.push('noreferrer');
        attribRelAdd.push('noopener');

        if (obj.URL) {
          matches = obj.URL.hostname.match(/\.?(.*?\..*)$/);
          if (matches) {
            dn = matches[1];

            if (htmlWhitelistFollow.indexOf(dn) === -1) {
              attribRelAdd.push('nofollow');
            }
          } else {
            attribRelAdd.push('nofollow');
          }
        } else {
          attribRelAdd.push('nofollow');
        }

        return {
          tagName: aTagName,
          attribs: _.extend(aAttribs, {
            rel: aAttribs.rel
              ? _.chain(aAttribs.rel.split(' '))
                   .union(attribRelAdd)
                     .reject(function (aRelItem) {
                       return attribRelReject.indexOf(aRelItem) > -1;
                     }).value()
                .join(' ')
              : attribRelAdd
                .join(' '),
            referrerpolicy: 'same-origin' // NOTE: Experimental adoption
          })
        };
      }
      break;
    case 'img':
      return {
        tagName: aTagName,
        attribs: _.extend(aAttribs, {
          referrerpolicy: 'same-origin' // NOTE: Experimental adoption
        })
      };
  }

  return {
    tagName: aTagName,
    attribs: aAttribs
  };
}

htmlWhitelistPost.transformTags = {
  'a' : externalPolicy,
  'img' : externalPolicy,
  'td' : gfmStyleToBootstrapClass,
  'th' : gfmStyleToBootstrapClass
};

function sanitize(aHtml) {
  return sanitizeHtml(aHtml, htmlWhitelistPost);
}

// Sanitize the output from the block level renderers
blockRenderers.forEach(function (aType) {
  renderer[aType] = function () {
    // Sanitize first to close any tags
    var sanitized = sanitize(marked.Renderer.prototype[aType].apply(renderer, arguments));

    // Autolink most usernames

    var dom = new JSDOM('<div id="sandbox"></div>');
    var win = dom.window;
    var doc = win.document;

    var hookNode = doc.querySelector('#sandbox');

    var xpr = null;
    var i = null;

    var textNode = null;
    var textChunk = null;

    var htmlContainer = null;
    var thisNode = null;

    hookNode.innerHTML = sanitized;

    xpr = doc.evaluate(
      './/text()',
      hookNode,
      null,
      win.XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    if (xpr) {
      for (i = 0; textNode = xpr.snapshotItem(i++);) {
        switch(textNode.parentNode.tagName) {
          case 'PRE':
          case 'CODE':
          case 'A':
            break;
          default:
            // replace all instance of @whatever with autolinked
            textChunk = textNode.textContent.replace(/(^|\s)@([^\s\\\/:*?\'\"<>|#;@=&,]+)/gm,
              '$1<a href="/users/$2">@$2</a>');

            // Import to virtual DOM element
            htmlContainer = doc.createElement('span');
            htmlContainer.classList.add('autolink');
            htmlContainer.innerHTML = textChunk;

            // Clone everything to remove span element
            for (thisNode = htmlContainer.firstChild; thisNode; thisNode = thisNode.nextSibling) {
              textNode.parentNode.insertBefore(thisNode.cloneNode(true), textNode);
            }
            textNode.parentNode.removeChild(textNode);
        }
      }

      sanitized = hookNode.innerHTML
    }

    return sanitized;
  };
});

// Automatically generate an anchor for each header
renderer.heading = function (aText, aLevel) {
  var escapedText = aText.toLowerCase().replace(/<\/?[^>]+?>/g, '')
    .replace(/[^\w]+/g, '-');

  var id = escapedText;
  var html = '<h' + aLevel + '>';
  html += '<a id="' + id + '" rel="bookmark"></a>';
  html += sanitize(aText);
  html += '<a href="#' + id + '" class="anchor">';
  html += '<i class="fa fa-link"></i>';
  html += '</a>';
  html += '</h' + aLevel + '>';
  return html;
};

renderer.link = function (aHref, aTitle, aText) {
  return marked.Renderer.prototype.link.call(renderer, aHref, aTitle, aText);
};

// Set the options to use for rendering markdown
// Keep in sync with ./views/includes/scripts/markdownEditor.html
marked.setOptions({
  highlight: function (aCode, aLang) {
    var obj = null;
    var lang = [ // NOTE: More likely to less likely
      'javascript', 'xpath', 'xml',
        'css', 'less', 'scss',
          'json',
            'diff',
              'shell',
                'bash', 'dos',
                  'vbscript'
    ];

    if (aLang && hljs.getLanguage(aLang)) {
      try {
        return hljs.highlight(aLang, aCode).value;
      } catch (aE) {
        if (isDev) {
          console.error([
            colors.red('Dependency named highlighting failed with:'),
              aE

          ].join('\n'));
        }
      }
    }

    try {
      obj = hljs.highlightAuto(aCode);

      if (lang.indexOf(obj.language) > -1) {
        return obj.value;
      } else {
        if (isDev) {
          console.log([
            colors.yellow('Unusual auto-detected md language code is')
              + '`' + colors.cyan(obj.language) + '`',

          ].join('\n'));
        }
        return hljs.highlightAuto(aCode, lang).value;
      }
    } catch (aE) {
      if (isDev) {
        console.error([
          colors.red('Dependency automatic named highlighting failed with:'),
            aE

        ].join('\n'));
      }
    }

    // If any external package failure don't block return e.g. prevent empty
    return aCode;
  },
  renderer: renderer,
  gfm: true,
  tables: true,
  breaks: true,
  pedantic: false,
  sanitize: false, // we use sanitize-html to sanitize HTML
  smartLists: true,
  smartypants: false
});

exports.renderMd = function (aText) {
  return marked(aText);
};
