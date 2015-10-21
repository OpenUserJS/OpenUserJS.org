'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var userSchema = new Schema({
  // Visible
  name: String,
  about: String,

  // A user can link multiple accounts to their OpenUserJS account
  auths: Array,
  strategies: Array,

  // Store their GitHub username when they import scripts
  ghUsername: String,

  // Moderation
  role: Number,
  flags: {
    critical: Number,
    absolute: Number
  },
  flagged: Boolean,
  sessionIds: [String]
});

userSchema.virtual('_since').get(function () {
  return this._id.getTimestamp();
});

var User = mongoose.model('User', userSchema);

exports.User = User;

