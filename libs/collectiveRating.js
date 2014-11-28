'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var Script = require('../models/script').Script;

function median(aValues) {
  var middle = Math.floor(aValues.length / 2);
  aValues.sort(function (aA, aB) { return aA - aB; });

  return aValues.length % 2 ? aValues[middle] :
    (aValues[middle - 1] + aValues[middle]) / 2;
}

function mean(aValues) {
  var sum = 0;
  var i = 0;
  for (; i < aValues.length; ++i) {
    sum += aValues[i];
  }

  return sum / aValues.length;
}

// Generate a collective rating by averaging the median and mean of
// scripts in a group. I think this gives a more fair rating than just
// using one of them alone.
function getRating(aScripts) {
  var ratings = null;

  if (aScripts.length < 2) { return 0; }

  ratings = aScripts.map(function (aScript) {
    return aScript.rating;
  });

  return Math.round((median(ratings) + mean(ratings)) / 2);
}
exports.getRating = getRating;

// TODO: Memoize this function with an
// expiring cache (either memory or DB based) to
// speed up voting and flagging
exports.getKarma = function (aUser, aMaxKarma, aCallback) {
  var karma = 0;
  Script.find({ _authorId: aUser._id }, 'rating', function (aErr, aScripts) {
    if (aErr) { return aCallback(karma); }

    karma = Math.floor(getRating(aScripts) / 10);
    if (karma > aMaxKarma) { karma = aMaxKarma; }

    aCallback(karma);
  });
};
