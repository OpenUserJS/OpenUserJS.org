'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var scriptSchema = new Schema({
  // Visible
  name: String,
  author: String,
  installs: { type: Number, default: 0 },
  installsSinceUpdate: { type: Number, default: 0 },
  rating: Number,
  about: String,
  updated: { type: Date, default: Date.now },

  // Sync
  githubSyncAbout: { type: Boolean, default: false },
  githubSyncScript: { type: Boolean, default: true },

  // Sync: Github
  githubSyncUserId: { type: String },
  githubSyncRepoName: { type: String },
  githubSyncAboutPath: { type: String },
  githubSyncSourcePath: { type: String },

  // Moderation
  votes: Number, // upvotes negate flags
  flags: Number,
  flagged: Boolean,
  installName: String,

  // Extra info
  fork: Array,
  meta: Object,
  isLib: Boolean,
  uses: [String],
  _groupId: Schema.Types.ObjectId, // The group is script created
  _authorId: Schema.Types.ObjectId
});

var Script = mongoose.model('Script', scriptSchema);

exports.Script = Script;
