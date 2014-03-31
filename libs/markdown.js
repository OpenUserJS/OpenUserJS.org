var md = require('markdown').markdown;

function getHeaderText (el) {
  var i = 0;
  var text = '';

  if (el instanceof Array) {
    if (el.length === 2) {
      text = getHeaderText(el[1]);
    } else {
      if (el[0] === 'header' || el[0] === 'link') { ++i; }
      for (; i < el.length; ++i) {
        text += getHeaderText(el[i]);
      }
    }
  } else if (typeof el === 'string') {
    text = el;
  }

  return text;
}

exports.renderMd = function (text) {
  var tree = md.parse(text);

  tree.forEach(function (header) {
    var anchorId = null;
    if (header instanceof Array && header[0] === 'header') {
      header[1]['id'] = 'anchor-' + getHeaderText(header)
        .replace(/\s+/g, '-').replace(/"/g, '');
    }
  });
  
  return md.renderJsonML(md.toHTMLTree(tree));
};
