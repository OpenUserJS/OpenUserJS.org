'use strict';

var marked = require('marked');
var hljs = require('highlight.js');
var sanitizeHtml = require('sanitize-html');
var htmlWhitelistPost = require('./htmlWhitelistPost.json');
var renderer = new marked.Renderer();
var blockRenderers = [
  'blockquote',
  'html',
  'list',
  'paragraph',
  'table'
];
var allWhitelistAttrs = htmlWhitelistPost.allowedAttributes.all;

// Whitelist a bunch of attributes for all tags
// Doing this until we have an upstream fix
htmlWhitelistPost.allowedTags.forEach(function (aTag) {
  var otherAttrs = htmlWhitelistPost.allowedAttributes[aTag];

  htmlWhitelistPost.allowedAttributes[aTag] = allWhitelistAttrs;
  if (otherAttrs) {
    htmlWhitelistPost.allowedAttributes[aTag] = htmlWhitelistPost
      .allowedAttributes[aTag].concat(otherAttrs);
  }
});
delete htmlWhitelistPost.allowedAttributes.all;

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
    return sanitize(marked.Renderer.prototype[aType].apply(renderer, arguments));
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

// Set the options to use for rendering markdown
// Keep in sync with ./views/includes/scripts/markdownEditor.html
marked.setOptions({
  highlight: function (aCode, aLang) {
    if (aLang && hljs.getLanguage(aLang)) {
      return hljs.highlight(aLang, aCode).value;
    } else {
      return hljs.highlightAuto(aCode).value;
    }
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
