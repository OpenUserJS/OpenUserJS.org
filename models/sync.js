'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var mongoose = require('mongoose');
mongoose.Promise = global.Promise;

var Schema = mongoose.Schema;

var syncSchema = new Schema({
  // Visible
  strat: String,    // Currently github (lowercase always)
  id: String,       // Some unique identifier from source
  target: String,   // Fully Qualified URL target (should be encodeURIComponent already)
  response: Number, // HTTP Status Code
  message: String,  // Any message crafted or static
  created: Date,
  updated: Date,

  // Extra info
  _authorId: Schema.Types.ObjectId,
});

var Sync = mongoose.model('Sync', syncSchema);

exports.Sync = Sync;
