var Script = require('../models/script').Script;

function median (values) {
  var middle = Math.floor(values.length / 2);
  values.sort(function (a, b) { return a - b; });

  return values.length % 2 ? values[middle] : 
    (values[middle - 1] + values[middle]) / 2;
}

function mean (values) {
  var sum = 0;
  var i = 0;
  for (; i < values.length; ++i) {
    sum += values[i];
  }

  return sum / values.length;
}

// TODO: Memoize this function with an 
// expiring cache (either memory or DB based) to
// speed up voting and flagging
exports.getKarma = function (user, maxKarma, callback) {
  var ratings = [];
  var karma = 0;
  Script.find({ _authorId: user._id }, 'rating', function (err, scripts) {
    if (err || scripts.length < 2) { return callback(karma); }

    scripts.forEach(function (script) {
      ratings.push(script.rating);
    });

    karma = Math.floor((median(ratings) + mean(ratings)) / 2 / 10);
    if (karma > maxKarma) { karma = maxKarma; }

    callback(karma);
  });
};
