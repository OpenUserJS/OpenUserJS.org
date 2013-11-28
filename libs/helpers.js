// Create an object with no properties
exports.nil = function (obj) {
  var nilObj = Object.create(null);

  if (!obj) return nilObj;

  exports.forIn(obj, function (val, key) {
    nilObj[key] = val;
  });
  
  return nilObj;
};

// Safely iterate on an object not create using nil()
exports.forIn = function (obj, forProp) {
  var key = null;

  for (key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) { continue; }
    forProp(obj[key], key, obj);
  }
};

// A simple way of waiting for a bunch of async calls to finish
// Call the constructor with the function you want run when everything is done
// Add functions that you want to wait to get called 
// Basically callbacks to async functions

// So instead of:
// asyncFunction(callback);

// Do:
// var wait = new Wait(function() { console.log('done'); });
// asyncFunction(wait.add(callback));

function Wait(last) {
  this.counter = 0;
  this.done = function () {
    if (this.counter) { return; }
    last();
  };
}

Wait.prototype.add = function (task) {
  var wait = this;
  ++this.counter;

  return (function () {
    if (task) {
      task.apply(null, Array.prototype.slice.apply(arguments));
    }

    --wait.counter;
    wait.done();
  });
}

exports.Wait = Wait;

// Clean filenames but leave them readable
// Based on Greasemonkey modules/remoteScript.js
exports.cleanFilename = function (filename, defaultName) {
  // Blacklist problem characters (slashes, colons, etc.).
  var cleanName = filename.replace(/[\\\/:*?\'\"<>|]/g, '')

  // Make whitespace readable.
  .replace(/(\s|%20)+/g, '_');

  return cleanName || defaultName;
}
