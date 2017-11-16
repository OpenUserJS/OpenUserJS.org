'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var User = require('../models/user').User;

// Determine whether content can be edited by a user.
function editable(aModel, aContent, aUser, aCallback) {
  // The user must be logged in
  if (!aUser) {
    return aCallback(false);
  }

  // You can't edit yourself #233
  if (aModel.modelName === 'User') {
    return aCallback(false);
  }

  User.findOne({
    _id: aContent._authorId
  }, function (aErr, aAuthor) {
    // Content without an author shouldn't exist
    if (aErr || !aAuthor) {
      return aCallback(false);
    }

    // You can only edit content by yourself
    aCallback(aAuthor._id == aUser._id);
  });
}
exports.editable = editable;
