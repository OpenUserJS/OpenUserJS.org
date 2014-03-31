var md = require('markdown').markdown;

exports.renderMd = function (text) {
  var tree = md.parse(text);

  tree.forEach(function (el) {
    if (el instanceof Array && el[0] === 'header') {
      el[1]['id'] = 'anchor-' + el[2].replace(/\s+/g, '-')
        .replace(/"/g, '');
    }
  });
  
  return md.renderJsonML(md.toHTMLTree(tree));
};
