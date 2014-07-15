'use strict';

var mu = require('mu2');

mu.root = __dirname + '/../views';

function renderFile(aRes, aPath, aOptions) {
  // If you need to render a file with a different content
  // type, do it directly on the response object
  if (process.env.NODE_ENV !== 'production') { mu.clearCache(); }
  aRes.set('Content-Type', 'text/html; charset=UTF-8');
  mu.compileAndRender(aPath, aOptions).pipe(aRes);
}

// Express doesn't have stream support for rendering templates
// Hack express to add support for rendering a template with Mu
exports.renderFile = function (aApp) {
  var render = aApp.response.__proto__.render;

  aApp.response.__proto__.render = function (aView, aOptions, aFn) { // TODO: Short parm
    var self = this;

    if (!aFn && aApp.get('view engine') === 'html') {
      aFn = function (aPath, aOptions) { renderFile(self, aPath, aOptions); };
    }

    render.call(self, aView, aOptions, aFn);
  };

  return (function (aPath, aOptions, aFn) { aFn(aPath, aOptions); });
};
