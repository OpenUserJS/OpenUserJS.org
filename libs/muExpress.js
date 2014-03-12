var mu = require('mu2');

mu.root = __dirname + '/../views';

// This is for easy of use for rendering HTML templates
// If you need to render another file type, do this directly
exports.renderFile = function (path, options, fn) {
  var res = fn();
  res.set('Content-Type', 'text/html; charset=utf-8');
  mu.compileAndRender(path, options).pipe(res);
};
