'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var mongoose = require('mongoose');
mongoose.Promise = global.Promise;

var Schema = mongoose.Schema;

var commentSchema = new Schema({
  // Visible
  content: String,
  author: String,
  created: Date,
  rating: Number,
  updated: Date,
  userAgent: String,

  // Moderation
  creator: Boolean,
  flags: {
    critical: Number,
    absolute: Number
  },
  flagged: Boolean,

  // Extra info
  id: String, // Base16 of created.getTime()
  _discussionId: Schema.Types.ObjectId,
  _authorId: Schema.Types.ObjectId
});

var Comment = mongoose.model('Comment', commentSchema);

Comment.syncIndexes(function () {
  Comment.collection.getIndexes({
    full: true
  }).then(function(aIndexes)  {
    console.log('Comment indexes:\n', aIndexes);
  }).catch(console.error);
});

Comment.on('index', function (aErr) {
  if (aErr) {
    console.error(aErr);
  } else {
    console.log('Index event triggered/trapped for Comment model');
  }
});

exports.Comment = Comment;
