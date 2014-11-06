'use strict';

var express = require('express');
var path = require('path');

module.exports = function (aApp) {
  var day = 1000 * 60 * 60 * 24;

  // Static Files
  function serveModule(aRoot, aModuleName, aModuleOption) {
    var moduleRoot = path.join(__dirname, 'node_modules');
    var moduleFile = null;

    if (!aModuleOption || typeof aModuleOption === 'number') {
      aApp.use(
        path.join(aRoot, aModuleName),
        express.static(
          path.join(moduleRoot, aModuleName),
          { maxage: aModuleOption }
        )
      );
    } else {
      for (moduleFile in aModuleOption) {
        aApp.use(
          path.join(aRoot, aModuleName, moduleFile),
          express.static(
            path.join(moduleRoot, aModuleName, moduleFile),
            { maxage: aModuleOption[moduleFile].maxage }
          )
        );
      }
    }
  }

  aApp.use(express.static(path.join(__dirname, 'public'), { maxage: day * 1 }));

  serveModule('/redist/npm', 'bootstrap', {
    'dist/js/bootstrap.js': { maxage: day * 1 }
  });

  serveModule('/redist/npm', 'bootstrap-markdown', {
    'js/bootstrap-markdown.js': { maxage: day * 1 },
    'css/bootstrap-markdown.min.css': { maxage: day * 1 }
  });

  serveModule('/redist/npm', 'font-awesome', {
    'css/font-awesome.min.css': { maxage: day * 1 },
    'fonts/fontawesome-webfont.eot': { maxage: day * 7 },
    'fonts/fontawesome-webfont.svg': { maxage: day * 7 },
    'fonts/fontawesome-webfont.ttf': { maxage: day * 7 },
    'fonts/fontawesome-webfont.woff': { maxage: day * 7 },
    'fonts/FontAwesome.otf': { maxage: day * 7 },
  });

  serveModule('/redist/npm', 'jquery', {
    'dist/jquery.js': { maxage: day * 7 },
    'dist/jquery.min.map': { maxage: day * 7 }
  });

  serveModule('/redist/npm', 'marked', {
    'lib/marked.js': { maxage: day * 1 }
  });

  serveModule('/redist/npm', 'octicons', {
    'octicons/octicons.css': { maxage: day * 1 },
    'octicons/octicons-local.ttf': { maxage: day * 7 },
    'octicons/octicons.eot': { maxage: day * 7 },
    'octicons/octicons.svg': { maxage: day * 7 },
    'octicons/octicons.ttf': { maxage: day * 7 },
    'octicons/octicons.woff': { maxage: day * 7 }
  });

  serveModule('/redist/npm', 'select2', {
    'select2.js': { maxage: day * 1 },
    'select2.css': { maxage: day * 1 },
    'select2.png': { maxage: day * 30 },
    'select2x2.png': { maxage: day * 30 },
    'select2-spinner.gif': { maxage: day * 30 }
  });

  serveModule('/redist/npm', 'select2-bootstrap-css', {
    'select2-bootstrap.css': { maxage: day * 1 }
  });

};
