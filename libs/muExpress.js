var mu = require('mu2');

mu.root = __dirname + '/../views';

function renderFile(res, path, options) {
  // If you need to render a file with a different content
  // type, do it directly on the response object
  if (process.env.NODE_ENV !== 'production') { mu.clearCache(); }
  res.set('Content-Type', 'text/html; charset=UTF-8');
  mu.compileAndRender(path, options).pipe(res);
}

// Express doesn't have stream support for rendering templates
// Hack express to add support for rendering a template with Mu
exports.renderFile = function (app) {
  var render = app.response.__proto__.render;

  app.response.__proto__.render = function (view, options, fn) {
    var self = this;

    if (!fn && app.get('view engine') === 'html') {
      fn = function (path, options) { renderFile(self, path, options); };
    }

    render.call(self, view, options, fn);
  };

  return (function (path, options, fn) { fn(path, options); });
};
