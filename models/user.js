'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var moment = require('moment');

var mongoose = require('mongoose');
mongoose.Promise = global.Promise;

var Schema = mongoose.Schema;

var userSchema = new Schema({
  // Visible
  name: String,
  about: String,
  created: Date,
  updated: Date,

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

userSchema.virtual('_probationary').get(function () {
  return !moment().isAfter(moment(this.created).add(1, 'year'));
});

var User = mongoose.model('User', userSchema);

User.syncIndexes(function () {
  User.collection.getIndexes({
    full: true
  }).then(function(aIndexes)  {
    console.log('User indexes:\n', aIndexes);
  }).catch(console.error);
});

User.on('index', function (aErr) {
  if (aErr) {
    console.error(aErr);
  } else {
    console.log('Index event triggered/trapped for User model');
  }
});

exports.User = User;

