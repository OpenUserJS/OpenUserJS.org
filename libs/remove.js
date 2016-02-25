'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var Remove = require('../models/remove').Remove;
var User = require('../models/user').User;
var async = require('async');

// Get the models for removable content that belongs to a user
var modelNames = ['Script', 'Comment', 'Discussion']; // TODO: , 'Group', 'Comment', 'Discussion', 'Flag', 'Vote' eventually
var models = {};

modelNames.forEach(function (aModelName) {
  models[aModelName] = require('../models/' +
    aModelName.toLowerCase())[aModelName];
});

// Determine whether content can be removed by a user.
function removeable(aModel, aContent, aUser, aCallback) {
  // The user must be logged in
  // The user is a moderator then the content must be flagged
  // If the user is an admin or greater then the content may be removed
  if (!aUser || (!aContent.flagged && aUser.role > 3) || aUser.role > 2) {
    return aCallback(false);
  }

  // You can't remove yourself
  // You can only remove a remove a user with a lesser role than yourself
  if (aModel.modelName === 'User') {
    return aCallback(aContent._id != aUser._id && aContent.role > aUser.role,
      aContent);
  }

  User.findOne({
    _id: aContent._authorId
  }, function (aErr, aAuthor) {
    // Content without an author shouldn't exist
    if (aErr || !aAuthor) {
      return aCallback(false);
    }

    // You can't remove your own content this way
    // When you remove your own content it's removed for good
    if (aAuthor._id == aUser._id) {
      return aCallback(false, aAuthor);
    }

    // You can only remove content by an author with a lesser user role
    aCallback(aAuthor.role > aUser.role, aAuthor);
  });
}
exports.removeable = removeable;

function remove(aModel, aContent, aUser, aReason, aAutomated, aCallback) {

  // TODO: #126, #93
  switch (aModel.modelName) {
    case 'Script':
      // TODO: Remove from any non-owned Groups and decrement that Group counter
      break;
    case 'Group':
      // TODO: Find all Scripts in it and do something
      break;
    case 'Comment':
      // TODO: Find Discussion... if owned do nothing will be caught next...
      //         if non-owned decrement counter and reset the last
      //         commentator with that date
      break;
    case 'Discussion':
      // TODO: Find all Comments in it and do something with non-owned...
      //         probably set `.path` to parent "slug" for non-owned
      break;
    case 'Flag':
      // TODO: Recalculate affected scripts (and any other model) with `.flags`
      break;
    case 'Vote':
      // TODO: Recalculate affected scripts (and any other model) with `.votes`
      break;
    default:
      console.error('Unknown Model not covered in remove');
  }

  var removeModel = new Remove({
    'model': aModel.modelName,
    'content': aContent.toObject(),
    'removed': new Date(),
    'reason': aReason,
    'removerName': aUser.name,
    'removerRole': aUser.role,
    'removerAutomated': aAutomated,
    '_removerId': aUser._id
  });

  removeModel.save(function (aErr, aRemove) {
    if (aErr || !aRemove) {
      console.error('Failed to save to the Graveyard', aModel.modelName, aContent._id);
      aCallback(aErr);
      return;
    }

    aContent.remove(function (aErr) {
      if (aErr) {
        console.error('Failed to remove', aModel.modelName, aContent._id);
        aCallback(aErr); // NOTE: Same as `true` but specific e.g. stop all removal(s)
        return;
      }

      if (aModel.modelName === 'User') {
        aCallback(true); // NOTE: Stop any series removals and done
      } else {
        aCallback(null); // NOTE: Continue any series and non-User single removals
      }
    });
  });
}

exports.remove = function (aModel, aContent, aUser, aReason, aCallback) {
  removeable(aModel, aContent, aUser, function (aCanRemove, aAuthor) {
    if (!aCanRemove) {
      aCallback(false);
      return;
    }

    if (aModel.modelName !== 'User') {
      remove(aModel, aContent, aUser, aReason, false, function (aErr) {
        if (aErr) {
          console.warn('Failed to remove', aModel.modelName, '\n', aErr);
          aCallback(false);
          return;
        }

        aCallback(true);
      });
    } else {
      // Remove all the user's content
      async.eachSeries(modelNames, function (aModelName, aEachOuterCallback) {
        var model = models[aModelName];
        model.find({
          _authorId: aContent._id
        },
          function (aErr, aContentArr) {
            async.eachSeries(aContentArr, function (aContent, aEachInnerCallback) {
              remove(model, aContent, aUser, '', true, aEachInnerCallback);
            }, aEachOuterCallback);
          });
      }, function () {
        remove(aModel, aContent, aUser, aReason, false, aCallback);
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
exports.findDeadorAlive = function (aModel, aQuery, aUser, aCallback) {
  var modelName = aModel.modelName;

  aModel.findOne(aQuery, function (aErr, aContent) {
    var name = null;
    var rmQuery = { model: modelName };

    if (!aErr && aContent) {
      return aCallback(true, aContent, null);
    }

    if (modelName !== 'User' && -1 === modelNames.indexOf(modelName)) {
      return aCallback(null, null, null);
    }

    for (name in aQuery) {
      rmQuery['content.' + name] = aQuery[name];
    }

    Remove.findOne(rmQuery, function (aErr, aRemoved) {
      if (aErr || !aRemoved) {
        return aCallback(null, null, null);
      }

      if (!aUser || (aUser !== true && aUser.role > aRemoved.removerRole)) {
        return aCallback(false, null, aRemoved);
      }

      aCallback(false, new aModel(aRemoved.content), aRemoved);
    });
  });
};
