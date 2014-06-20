var marked = require('marked');
var hljs = require('highlight.js');
var sanitizeHtml = require('sanitize-html');
var renderer = new marked.Renderer();

// Automatically generate an anchor for each header
renderer.heading = function (text, level) {
  var escapedText = text.toLowerCase().replace(/<\/?[^>]+?>/g, '')
    .replace(/[^\w]+/g, '-');

  var name = escapedText;
  var html = '<h' + level + '>';
  html += '<a name="' + name + '"></a>'
  html += text;
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
  return marked(sanitizeHtml(text), {
    allowedTags: [
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'h7',
      'h8',
      'p',
      'div',
      'blockquote',
      'pre',
      'b',
      'i',
      'strong',
      'em',
      'tt',
      'code',
      'ins',
      'del',
      'sup',
      'sub',
      'kbd',
      'samp',
      'q',
      'var',
      'ol',
      'ul',
      'li',
      'dl',
      'dt',
      'dd',
      'table',
      'thead',
      'tbody',
      'tfoot',
      'tr',
      'td',
      'th',
      'br',
      'hr',
      'ruby',
      'rt',
      'rp'
    ],
    allowedAttributes: {
      a: [
        'href'
      ],
      img: [
        'src'
      ],
      div: [
        'itemscope',
        'itemtype'
      ]
    },
    // Lots of these won't come up by default because we don't allow them
    selfClosing: [
      'img',
      'br',
      'hr',
      'area',
      'base',
      'basefont',
      'input',
      'link',
      'meta'
    ],
    // URL schemes we permit
    allowedSchemes: [
      'http',
      'https',
      'mailto'
    ]
  });
};
