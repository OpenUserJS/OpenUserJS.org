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

// Clean filenames but leave them readable
// Based on Greasemonkey modules/remoteScript.js
exports.cleanFilename = function (filename, defaultName) {
  // Blacklist problem characters (slashes, colons, etc.).
  var cleanName = filename.replace(/[\\\/:*?\'\"<>|#;@=&]/g, '')

  // Make whitespace readable.
  .replace(/(\s|%20)+/g, '_');

  return cleanName || defaultName;
};

// Wrap something in an anonymous function
exports.fn = function (something) { 
  return (function () { return something; }); 
};
