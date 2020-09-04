'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var mongoose = require('mongoose');
mongoose.Promise = global.Promise;

var Schema = mongoose.Schema;

var userSchema = new Schema({
  // Visible
  name: String,
  about: String,
  created: Date,

  // A user can link multiple accounts to their OpenUserJS account
  consented: Boolean,
  auths: Array,
  strategies: Array,
  authed: Date, // last logged in

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

var User = mongoose.model('User', userSchema);

exports.User = User;

