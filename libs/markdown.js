'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var marked = require('marked');
var hljs = require('highlight.js');
var sanitizeHtml = require('sanitize-html');

var jsdom = require("jsdom");
var { JSDOM } = jsdom;

var htmlWhitelistPost = require('./htmlWhitelistPost.json');
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
  if (aAttribs.style) {
    switch (aAttribs.style) {
      case 'text-align:center':
        return {
          tagName: aTagName,
          attribs: { class: 'text-center' }
        };
      case 'text-align:left':
        return {
          tagName: aTagName,
          attribs: { class: 'text-left' }
        };
      case 'text-align:right':
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

htmlWhitelistPost.transformTags = {
  'th' : gfmStyleToBootstrapClass,
  'td' : gfmStyleToBootstrapClass
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

  var name = escapedText;
  var html = '<h' + aLevel + '>';
  html += '<a name="' + name + '"></a>';
  html += sanitize(aText);
  html += '<a href="#' + name + '" class="anchor">';
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

    if (aLang && hljs.getLanguage(aLang)) {
      try {
        return hljs.highlight(aLang, aCode).value;
      } catch (aErr) {
      }
    }

    try {
      obj = hljs.highlightAuto(aCode);

      switch (obj.language) {
        // Transform list of auto-detected language highlights
        case 'dust':
        case '1c':
        case 'qml':
          // Narrow auto-detection to something that is more likely
          return hljs.highlightAuto(aCode, ['css', 'html', 'js', 'json']).value;
          break;
        // Any other detected go ahead and return
        default:
          return obj.value;
      }
    } catch (aErr) {
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
