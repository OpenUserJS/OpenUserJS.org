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
// NOTE: Keep in sync with client side JavaScript
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
};

exports.decode = function (aStr) {
  try {
    // Check for bad decoding
    return decodeURIComponent(aStr);

  } catch (aE) {
    return aStr;
  }
};

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
  delete u.search; // https://stackoverflow.com/a/7517673/947742
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

exports.isFQUrl = function (aString, aOptions) {
  var URL = url.parse(aString); // TODO: Convert to non-legacy

  var reTrusty = null;

  var protocol = URL.protocol;
  var username = URL.username; // NOTE: BUG: in current *node*
  var password = URL.password; // NOTE: BUG: in current *node*
  var hostname = URL.hostname;
  var port = URL.port;
  var pathname = URL.pathname;
  var search = URL.search;
  var hash = URL.hash;

  var source = encodeURIComponent(aString);
  var target = null;

  if (!aOptions) {
    aOptions = {};
  }

  reTrusty = aOptions.isSecure ? new RegExp('^https:$') : new RegExp('^https?:$');

  if (protocol && reTrusty.test(protocol)) {
    if (hostname) {
      target = encodeURIComponent(protocol)
        + encodeURIComponent('//')
          + encodeURIComponent(username ? username : '')
            + encodeURIComponent(password ? ':' + password : '')

              + (username || password ? encodeURIComponent('@') : '')

                + encodeURIComponent(hostname)
                  + encodeURIComponent(port ? ':' + port : '')
                    + encodeURIComponent(pathname)
                      + encodeURIComponent(search ? search : '')
                        + encodeURIComponent(hash ? hash : '');

      return target === source;
    }
  } else if (aOptions.canMailto && /^mailto:\S+@\S+/.test(aString)) {
    return true;
  } else if (aOptions.canDataImg && /^data:image\//.test(aString)) {
    return true;
  }

  return false;
};

exports.appendUrlLeaf = function (aUrl, aLeaf) {
  let target = new URL(aUrl);

  target.pathname = target.pathname.replace(/\/$/, '') + '/'
    + aLeaf.replace(/^\//, '').replace(/\/$/);

  return target.href;
}

// Helper function to ensure value is type Integer `number` or `null`
// Please be very careful if this is edited
exports.ensureIntegerOrNull = function (aEnvVar) {
  if (typeof aEnvVar !== 'number') {
    aEnvVar = parseInt(aEnvVar);

    if (aEnvVar !== aEnvVar) { // NOTE: ES6 `Number.isNaN`
      aEnvVar = null;
    }
  } else {
    aEnvVar = parseInt(aEnvVar);
  }

  return aEnvVar;
};

//
exports.port = process.env.PORT || 8080;
exports.securePort = process.env.SECURE_PORT || 8081;

exports.baseOrigin = (isPro ? 'https://openuserjs.org' : 'http://localhost:' + exports.port); // NOTE: Watchpoint

// Absolute pattern and is combined for pro and dev
exports.patternHasSameOrigin =
  '(?:https?://openuserjs\.org(?::' + exports.securePort + ')?' +
    (isDev ? '|http://localhost:' + exports.port + ')' : ')' );

// Possible pattern and is split for pro vs. dev
// NOTE: This re is quite sensitive to changes esp. with `|`
// This routine is fuzzy due to the lack of https on short domain
exports.patternMaybeSameOrigin =
  (isPro
    ? '(?:https?:)?(?://openuserjs\.org(?::' + exports.securePort + ')?|//oujs\.org)?'
    : '(?:http:)?(?://localhost:' + exports.port + ')?')

exports.isSameOrigin = function (aUrl) {
  var url = null;
  var sameOrigin = false;
  var rIsSameOrigin = new RegExp('^' + exports.patternHasSameOrigin + '$', 'i');

  if (aUrl) {
    try {
      url = new URL(aUrl, exports.baseOrigin);

      if (rIsSameOrigin.test(url.origin)) {
        sameOrigin = true;
      }
    } catch (aE) {
    }
  }

  return {
    result: sameOrigin,
    URL: url
  };
}

exports.getRedirect = function (aReq) {
  var referer = aReq.get('Referer');
  var redirect = '/';

  if (referer) {
    referer = url.parse(referer); // NOTE: Legacy
    if (referer.hostname === aReq.hostname) {
      redirect = referer.path;
    }
  }

  return redirect;
}

