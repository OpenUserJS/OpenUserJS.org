'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
// NOTE: Only use native *node* `require`s in this file
//   since dependencies may not be installed yet
//
var fs = require('fs');

var rmFilesExceptHidden = function (dirPath) {
  var files = null;
  var filePath = null;
  var i = null;

  try {
    files = fs.readdirSync(dirPath);
  } catch (aE) {
    console.warn(dirPath, 'path not found');
    return;
  }

  if (files.length > 0) {
    for (i = 0; i < files.length; i++) {
      filePath = dirPath + '/' + files[i];
      if (fs.statSync(filePath).isFile() && files[i].indexOf('.') !== 0) {
        fs.unlinkSync(filePath);
      }
    }
  }
};

console.log('Attempting to clean caches');
rmFilesExceptHidden('./dev/cache/express-minify/release/');


