'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var url = require("url");
var _ = require('underscore');

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
exports.formatDate = function (aDate) {
  var difference = new Date().getTime() - aDate.getTime();
  var ret = '';
  var days = 0;

  function pluralize(aNumber, aUnit) {
    return aNumber + ' ' + aUnit + (aNumber > 1 ? 's' : '') + ' ago';
  }

  if (difference > week) {
    ret = aDate.getDate() + ' '
      + months[aDate.getMonth()] + ' '
      + aDate.getFullYear();
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
exports.nil = function (aObj) {
  var nilObj = Object.create(null);

  if (!aObj) return nilObj;

  exports.forIn(aObj, function (aVal, aKey) {
    nilObj[aKey] = aVal;
  });

  return nilObj;
};

// Safely iterate on an object not create using nil()
exports.forIn = function (aObj, aForProp) {
  var key = null;

  for (key in aObj) {
    if (!Object.prototype.hasOwnProperty.call(aObj, key)) { continue; }
    aForProp(aObj[key], key, aObj);
  }
};

// Clean filenames but leave them readable
// Based on Greasemonkey modules/remoteScript.js
exports.cleanFilename = function (aFilename, aDefaultName) {
  // Blacklist problem characters (slashes, colons, etc.).
  var cleanName = (aFilename || '').replace(/[\\\/:*?\'\"<>|#;@=&]/g, '')

  // Make whitespace readable.
  .replace(/(\s|%20)+/g, '_');

  return cleanName || aDefaultName;
};

// Smarter encoder
exports.encode = function (aStr) {
  try {
    // Check for bad decoding
    decodeURIComponent(aStr);

    return aStr;

  } catch (aE) {
    return encodeURIComponent(aStr);
  }
}

exports.decode = function (aStr) {
  try {
    // Check for bad decoding
    return decodeURIComponent(aStr);

  } catch (aE) {
    return aStr;
  }
}

exports.limitRange = function (aMin, aX, aMax, aDefault) {
  var x = Math.max(Math.min(aX, aMax), aMin);

  // ES5 strict similar check to ES6 Number.isNaN()
  return (x !== x ? aDefault : x);
};

exports.limitMin = function (aMin, aX) {
  return Math.max(aX, aMin);
};

var setUrlQueryValue = function (aBaseUrl, aQueryVarKey, aQueryVarValue) {
  var parseQueryString = true;
  var u = url.parse(aBaseUrl, parseQueryString);
  u.query[aQueryVarKey] = aQueryVarValue;
  delete u.search; // http://stackoverflow.com/a/7517673/947742
  return url.format(u);
};
exports.setUrlQueryValue = setUrlQueryValue;

exports.updateUrlQueryString = function (aBaseUrl, aDict) {
  var url = aBaseUrl;
  _.each(aDict, function (aValue, aKey) {
    url = setUrlQueryValue(url, aKey, aValue);
  });
  return url;
};

// Helper function to ensure value is type `number` or `null`
// Please be very careful if this is edited
exports.ensureNumberOrNull = function (aEnvVar) {
  if (typeof aEnvVar !== 'number') {
    aEnvVar = parseInt(aEnvVar);

    if (aEnvVar !== aEnvVar) { // NOTE: ES6 `Number.isNaN`
      aEnvVar = null;
    }
  }

  return aEnvVar;
}
