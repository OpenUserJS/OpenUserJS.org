var months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];
var second = 1000;
var minute = second * 60;
var hour = minute * 60;
var day = hour * 24;
var week = day * 7;

// Get a formatted date that can be used everywhere a date is displayed
exports.formatDate = function (date) {
  var difference = new Date().getTime() - date.getTime();
  var ret = '';
  var days = 0;

  function pluralize (number, unit) {
    return number + ' ' + unit + (number > 1 ? 's' : '') + ' ago';
  }

  if (difference > week) {
    ret = date.getDate() +
      ' ' +
      months[date.getMonth()] +
      ' ' +
      date.getFullYear();
  } else if (difference > day) {
    days = Math.round(difference / day);
    if (days <= 1) {
      ret = 'Yesterday';
    } else {
      ret = days + ' days ago';
    }
  } else if (difference > hour) {
    ret = pluralize(Math.round(difference / hour), 'hour');
  } else if (difference > minute) {
    ret = pluralize(Math.round(difference / minute), 'minute');
  } else {
    ret = pluralize(Math.ceil(difference / second), 'second');
  }

  return ret;
};

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
  var cleanName = (filename || '').replace(/[\\\/:*?\'\"<>|#;@=&]/g, '')

  // Make whitespace readable.
  .replace(/(\s|%20)+/g, '_');

  return cleanName || defaultName;
};
