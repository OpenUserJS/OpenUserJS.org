'use strict';

//
// NOTE: Only use native *node* `require`s in this file
//   since dependencies may not be installed yet
//
var fs = require('fs');

console.log('Attempting to delete `package-lock.json`');
try {
  fs.unlinkSync('./package-lock.json');
} catch (aE) {
  console.warn('`package-lock.json` not found');
}
