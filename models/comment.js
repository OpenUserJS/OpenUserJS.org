'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var commentSchema = new Schema({
  // Visible
  content: String,
  author: String,
  created: Date,
  rating: Number,

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

exports.Comment = Comment;
