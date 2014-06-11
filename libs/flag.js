var Flag = require('../models/flag').Flag;
var User = require('../models/user').User;
var getKarma = require('./collectiveRating').getKarma;
var thresholds = { 'Script': 5, 'User': 10, 'Discussion': 3, 'Comment': 2 };
var maxKarma = 10;

// Determine whether content can be flagged by a user.
// This is heavily commented so that my logic and
// reasoning is documented for myself and others.
function flaggable (model, content, user, callback) {
  // Not logged in.
  if (!user) { return callback(false); }


  // You can't flag yourself
  // Only someone less than an admin can be flagged
  // It is not the responsibility of the community
  // to police the site administration
  if (model.modelName === 'User') {
    return getFlag(model, content, user, function (flag) {
      callback(content._id != user._id && content.role > 2, content, flag);
    });
  }

  getAuthor(content, function (author) {
    // Content without an author shouldn't exist
    if (!author) { return callback(false); }

    // You can't flag your own content
    if (author._id == user._id) { return callback(false); }

    // Content belonging to an admin or above cannot be flagged
    if (author.role < 3) { return callback(author.role > 2, author); }

    // You can't flag something twice
    getFlag(model, content, user, function (flag) {
      return callback(!flag, author, flag);
    });
  });
}
exports.flaggable = flaggable;

function getFlag(model, content, user, callback) {
  Flag.findOne({
    'model': model.modelName,
    '_contentId': content._id,
    '_userId': user._id
  }, function (err, flag) {
    callback(err || !flag ? null : flag);
  });
}

function getAuthor (content, callback) {
  User.findOne({ _id: content._authorId }, function (err, author) {
    // Content without an author shouldn't exist
    if (err || !author) { return callback(null); }

    callback(author);
  });
}
exports.getAuthor = getAuthor;

function getThreshold (model, content, author, callback) {
  // Admins can't be flagged so they have no threshold
  if (author.role < 3) { return callback(null); }

  // Hardcode the threshold at 1.
  // modelQuery.applyModelListQueryFlaggedFilter supports this hardcoded number.
  return callback(1);

  // Moderators have a doubled threshold
  var threshold = thresholds[model.modelName] * (author.role < 4 ? 2 : 1);

  // Calculate karma and add it to the threshold
  getKarma(author, maxKarma, function (karma) {
    return callback(threshold + karma);
  });
}
exports.getThreshold = getThreshold;

function saveContent (model, content, author, flags, callback) {
  if (!content.flags) { content.flags = 0; }
  content.flags += flags;

  if (content.flags >= thresholds[model.modelName] * (author.role < 4 ? 2 : 1)) {
    return getThreshold(model, content, author, function (threshold) {
      content.flagged = content.flags >= threshold;
      content.save(function (err, content) { callback(content.flagged); });
    });
  }

  content.save(function (err, content) { callback(content.flagged); });
}
exports.saveContent = saveContent;

function flag (model, content, user, author, callback) {
  var flag = new Flag({
    'model': model.modelName,
    '_contentId': content._id,
    '_userId': user._id
  });

  flag.save(function (err, flag) {
    if (!content.flags) { content.flags = 0; }
    if (!content.flagged) { content.flagged = false; }

    saveContent(model, content, author, user.role < 4 ? 2 : 1, callback)
  });
}

exports.flag = function (model, content, user, callback) {
  flaggable(model, content, user, function (canFlag, author) {
    if (!canFlag) { return callback(false); }

    flag(model, content, user, author, callback);
  });
};

exports.unflag = function (model, content, user, callback) {
  if (!user) { return callback(null); }

  getFlag(model, content, user, function (flag) {
    if (!flag) { return callback(null); }

    if (!content.flags) { content.flags = 0; }
    if (!content.flagged) { content.flagged = false; }

    function removeFlag (author) {
      flag.remove(function (err) {
        saveContent(model, content, author, user.role < 4 ? -2 : -1, callback);
      });
    }

    if (model.modelName === 'User') {
      removeFlag(content);
    } else {
      getAuthor(content, removeFlag);
    }
  });
};
