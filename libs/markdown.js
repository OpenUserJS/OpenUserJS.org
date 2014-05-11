var marked = require('marked');
var hljs = require('highlight.js');
var renderer = new marked.Renderer();

// Automatically generate an anchor for each header
renderer.heading = function (text, level) {
  var escapedText = text.toLowerCase().replace(/<\/?[^>]+?>/g, '')
    .replace(/[^\w]+/g, '-');

  return '<h' + level + '><a name="anchor-' +
    escapedText +
    '" class="anchor" href="#anchor-' +
    escapedText +
    '"><span class="header-link"></span></a>' +
    text + '</h' + level + '>';
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
  sanitize: true,
  smartLists: true,
  smartypants: false
});

exports.renderMd = function (text) {
  return marked(text);
};
