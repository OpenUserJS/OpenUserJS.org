'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var mongoose = require('mongoose');
mongoose.Promise = global.Promise;

var Schema = mongoose.Schema;

var discussionSchema = new Schema({
  // Visible
  topic: String,
  category: String,
  comments: Number,
  author: String,
  created: Date,
  lastCommentor: String,
  updated: Date,
  rating: Number, // collective rating from comments

  // Moderation
  // true if creator comment is flagged past discussion threshold
  flagged: Boolean,

  // Issue field (yeah that's right, issues are just special discussions)
  issue: Boolean,
  open: Boolean,
  labels: [String],

  // Extra info
  path: String,
  duplicateId: Number,
  _authorId: Schema.Types.ObjectId
});

var Discussion = mongoose.model('Discussion', discussionSchema);

Discussion.syncIndexes(function () {
  Discussion.collection.getIndexes({
    full: true
  }).then(function(aIndexes)  {
    console.log('Discussion indexes:\n', aIndexes);
  }).catch(console.error);
});

Discussion.on('index', function (aErr) {
  if (aErr) {
    console.error(aErr);
  } else {
    console.log('Index event triggered/trapped for Discussion model');
  }
});

exports.Discussion = Discussion;
