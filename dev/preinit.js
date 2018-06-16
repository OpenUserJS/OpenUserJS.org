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

console.log('Attempting to delete `package-lock.json`');
try {
  fs.unlinkSync('./package-lock.json');
} catch (aE) {
  console.log('Nothing to delete');
}
