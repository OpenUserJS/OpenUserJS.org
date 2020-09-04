'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var mongoose = require('mongoose');
mongoose.Promise = global.Promise;

var Schema = mongoose.Schema;

var scriptSchema = new Schema({
  // Visible
  name: String,
  _description: String,
  author: String,
  installs: { type: Number, default: 0 },
  installsSinceUpdate: { type: Number, default: 0 },
  rating: Number,
  about: String,
  _about: String,
  created: Date,
  updated: Date,
  hash: String,

  // Moderation
  votes: Number, // upvotes negate flags.critical. Always a whole number and summation of Vote.count
  flags: {
    critical: Number,
    absolute: Number
  },
  flagged: Boolean,
  installName: String,

  // Extra info
  fork: Array,
  meta: Object,
  isLib: Boolean,
  uses: [String],
  _groupId: Schema.Types.ObjectId, // The group is script created
  _authorId: Schema.Types.ObjectId
},
{
  autoIndex: false
});

/*
 * Manual-indexed
 */

scriptSchema.index({
  isLib: 1,         // A lot of hits
  author: 1,        // Some hits
  name: 1           // Very few hits
//   about: 'text'  // No hits period when included... only one allowed per Schema
});  // NOTE: Array indexing isn't supported with *mongoose* (yet?)


/*
 * Auto-indexed copy
 */

// scriptSchema.index({ // NOTE: This index is currently covered in above manual compound index
//   isLib: 1
// });

scriptSchema.index({
  installName: 1
});

scriptSchema.index({
  _authorId: 1,
  flagged: 1,
  isLib: 1
});

// --

var Script = mongoose.model('Script', scriptSchema);

Script.syncIndexes(function () {
  Script.collection.getIndexes({
    full: true
  }).then(function(aIndexes)  {
    console.log('Script indexes:\n', aIndexes);
  }).catch(console.error);
});

Script.on('index', function (aErr) {
  if (aErr) {
    console.error(aErr);
  } else {
    console.log('Index event triggered/trapped for Script model');
  }
});

exports.Script = Script;
