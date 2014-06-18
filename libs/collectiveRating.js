var Script = require('../models/script').Script;

function median(values) {
  var middle = Math.floor(values.length / 2);
  values.sort(function(a, b) { return a - b; });

  return values.length % 2 ? values[middle] :
    (values[middle - 1] + values[middle]) / 2;
}

function mean(values) {
  var sum = 0;
  var i = 0;
  for (; i < values.length; ++i) {
    sum += values[i];
  }

  return sum / values.length;
}

// Generate a collective rating by averaging the median and mean of
// scripts in a group. I think this gives a more fair rating than just
// using one of them alone.
function getRating(scripts) {
  var ratings = null;

  if (scripts.length < 2) { return 0; }

  ratings = scripts.map(function(script) {
    return script.rating;
  });

  return Math.round((median(ratings) + mean(ratings)) / 2);
}
exports.getRating = getRating;

// TODO: Memoize this function with an
// expiring cache (either memory or DB based) to
// speed up voting and flagging
exports.getKarma = function(user, maxKarma, callback) {
  var ratings = [];
  var karma = 0;
  Script.find({ _authorId: user._id }, 'rating', function(err, scripts) {
    if (err) { return callback(karma); }

    karm = Math.floor(getRating(scripts) / 10);
    if (karma > maxKarma) { karma = maxKarma; }

    callback(karma);
  });
};
