'use strict';

// Define some pseudo module globals
var isPro = require('./libs/debug').isPro;
var isDev = require('./libs/debug').isDev;
var isDbg = require('./libs/debug').isDbg;

//
var path = require('path');
var url = require('url');

var express = require('express');

module.exports = function (aApp) {
  var day = 1000 * 60 * 60 * 24;

  // Static Files
  function serveModule(aModuleBase, aModuleBaseName, aModuleOption) {
    var dirname = path.join(__dirname, 'node_modules');
    var basename = null;

    if (!aModuleOption || typeof aModuleOption === 'number') {
      aApp.use(
        url.resolve(aModuleBase, aModuleBaseName),
        express.static(
          path.join(dirname, aModuleBaseName),
          { maxage: aModuleOption }
        )
      );
    } else {
      for (basename in aModuleOption) {
        aApp.use(
          url.resolve(aModuleBase, url.resolve(aModuleBaseName, basename)),
          express.static(
            path.join(dirname, aModuleBaseName, basename),
            { maxage: aModuleOption[basename].maxage }
          )
        );
      }
    }
  }

  aApp.use(express.static(path.join(__dirname, 'public'), { maxage: day * 1 }));

  serveModule('/redist/npm/', 'ace-builds/src/', 7);

  serveModule('/redist/npm/', 'bootstrap/', {
    'dist/js/bootstrap.js': { maxage: day * 1 }
  });

  serveModule('/redist/npm/', 'bootstrap-markdown/', {
    'js/bootstrap-markdown.js': { maxage: day * 1 },
    'css/bootstrap-markdown.min.css': { maxage: day * 1 }
  });

  serveModule('/redist/npm/', 'clipboard/', {
    'dist/clipboard.js': { maxage: day * 7 }
  });

  serveModule('/redist/npm/', 'font-awesome/', {
    'css/font-awesome.min.css': { maxage: day * 1 },
    'fonts/fontawesome-webfont.eot': { maxage: day * 7 },
    'fonts/fontawesome-webfont.svg': { maxage: day * 7 },
    'fonts/fontawesome-webfont.ttf': { maxage: day * 7 },
    'fonts/fontawesome-webfont.woff': { maxage: day * 7 },
    'fonts/fontawesome-webfont.woff2': { maxage: day * 7 },
    'fonts/FontAwesome.otf': { maxage: day * 7 }
  });

  serveModule('/redist/npm/', 'highlight.js/', {
    'styles/github.css': { maxage: day * 1 }
  });

  serveModule('/redist/npm/', 'jquery/', {
    'dist/jquery.js': { maxage: day * 7 }
  });

  serveModule('/redist/npm/', 'marked/', {
    'lib/marked.js': { maxage: day * 1 }
  });

  serveModule('/redist/npm/', 'octicons/', {
    'build/font/octicons.css': { maxage: day * 1 },
    'build/font/octicons.eot': { maxage: day * 7 },
    'build/font/octicons.svg': { maxage: day * 7 },
    'build/font/octicons.ttf': { maxage: day * 7 },
    'build/font/octicons.woff': { maxage: day * 7 },
    'build/font/octicons.woff2': { maxage: day * 7 }
  });

  serveModule('/redist/npm/', 'select2/', {
    'select2.js': { maxage: day * 1 },
    'select2.css': { maxage: day * 1 },
    'select2.png': { maxage: day * 30 },
    'select2x2.png': { maxage: day * 30 },
    'select2-spinner.gif': { maxage: day * 30 }
  });

  serveModule('/redist/npm/', 'select2-bootstrap-css/', {
    'select2-bootstrap.css': { maxage: day * 1 }
  });
};
