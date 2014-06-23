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
htmlWhitelistPost.allowedTags.forEach(function (tag) {
  var otherAttrs = htmlWhitelistPost.allowedAttributes[tag];

  htmlWhitelistPost.allowedAttributes[tag] = allWhitelistAttrs;
  if (otherAttrs) {
    htmlWhitelistPost.allowedAttributes[tag] = htmlWhitelistPost
      .allowedAttributes[tag].concat(otherAttrs);
  }
});
delete htmlWhitelistPost.allowedAttributes.all;

function sanitize(html) {
  return sanitizeHtml(html, htmlWhitelistPost);
}

// Sanitize the output from the block level renderers
blockRenderers.forEach(function (type) {
  renderer[type] = function () {
    return sanitize(marked.Renderer.prototype[type].apply(renderer, arguments));
  };
});

// Automatically generate an anchor for each header
renderer.heading = function (text, level) {
  var escapedText = text.toLowerCase().replace(/<\/?[^>]+?>/g, '')
    .replace(/[^\w]+/g, '-');

  var name = escapedText;
  var html = '<h' + level + '>';
  html += '<a name="' + name + '"></a>'
  html += sanitize(text);
  html += '<a href="#' + name + '" class="anchor">';
  html += '<i class="fa fa-link"></i>';
  html += '</a>';
  html += '</h' + level + '>';
  return html;
};

// Set the options to use for rendering markdown
marked.setOptions({
  highlight: function (code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(lang, code).value;
    } else {
      return hljs.highlightAuto(code).value;
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

exports.renderMd = function (text) {
  return marked(text);
};
