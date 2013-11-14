// Create an object with no properties
exports.nil = function(obj) {
  var nilObj = Object.create(null);

  if (!obj) return nilObj;

  exports.forIn(obj, function(val, key) {
    nilObj[key] = val;
  });
  
  return nilObj;
};

// Safely iterate on an object not create using nil()
exports.forIn = function(obj, forProp) {
  for (var key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    forProp(obj[key], key, obj);
  }
};
