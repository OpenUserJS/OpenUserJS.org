var Remove = require('../models/remove').Remove;
var User = require('../models/user').User;
var async = require('async');

// Get the models for removable content that belongs to a user
var modelNames = ['Script'];
var models = {};

modelNames.forEach(function (modelName) {
  models[modelName] = require('../models/' +
    modelName.toLowerCase())[modelName];
});

// Determine whether content can be removed by a user.
function removeable(model, content, user, callback) {
  // The user must be logged in
  // The user is a moderator then the content must be flagged
  // If the user is an admin or greater then the content may be removed
  if (!user || (!content.flagged && user.role > 3) || user.role > 2) {
    return callback(false);
  }

  // You can't remove yourself
  // You can only remove a remove a user with a lesser role than yourself
  if (model.modelName === 'User') {
    return callback(content._id != user._id && content.role > user.role,
      content);
  }

  User.findOne({ _id: content._authorId }, function (err, author) {
    // Content without an author shouldn't exist
    if (err || !author) { return callback(false); }

    // You can't remove your own content this way
    // When you remove your own content it's removed for good
    if (author._id == user._id) { return callback(false, author); }

    // You can only remove content by an author with a lesser user role
    callback(author.role > user.role, author);
  });
}
exports.removeable = removeable;

function remove(model, content, user, reason, callback) {
  var remove = new Remove({
    'model': model.modelName,
    'content': content.toObject(),
    'removed': new Date(),
    'reason': reason,
    'removerName': user.name,
    'removerRole': user.role,
    '_removerId': user._id
  });

  remove.save(function (err, remove) {
    content.remove(function (err) { callback(remove); });
  });
}

exports.remove = function (model, content, user, reason, callback) {
  removeable(model, content, user, function (canRemove, author) {
    if (!canRemove) { return callback(false); }

    if (model.modelName !== 'User') {
      remove(model, content, user, reason, callback);
    } else {
      // Remove all the user's content
      async.each(modelNames, function (modelName, cb) {
        var model = models[modelName];
        model.find({ _authorId: content._id },
          function (err, contentArr) {
            async.each(contentArr, function (content, innerCb) {
              remove(model, content, user, null, innerCb);
            }, cb);
          });
      }, function () {
        remove(model, content, user, reason, callback);
      });
    }
  });
};

// This function is similar to findOne but expands
// the search to removed content
// You pass it the model of the content, the search query,
// the user making the query (or boolean true for internal usage),
// and a callback function with parameters (alive, content, removed)
//
// Alive can be true, false, or null. Alive is true if the content
// was found and wasn't removed. It's false if the content exists but
// was removed, and null if the content doesn't exist.
//
// The content parameter is what you get via the findOne callback even
// if the content is removed (it gets temporarily resurrected).
// You might get null back if the user doesn't have proper permissions.
//
// The removed parameter is the Remove document containing the content
// and is always returned if found, regardless of permissions.
exports.findDeadorAlive = function (model, query, user, callback) {
  var modelName = model.modelName;

  model.findOne(query, function (err, content) {
    var name = null;
    var rmQuery = { model: modelName };

    if (!err && content) { return callback(true, content, null); }
    if (modelName != 'User' && -1 === modelNames.indexOf(modelName)) {
      return callback(null, null, null);
    }

    for (name in query) {
      rmQuery['content.' + name] = query[name];
    }

    Remove.findOne(rmQuery, function (err, removed) {
      if (err || !removed) { return callback(null, null, null); }
      if (!user || (user !== true && user.role > removed.removerRole)) {
        return callback(false, null, removed);
      }

      callback(false, new model(removed.content), removed);
    });
  });
};
