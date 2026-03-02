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
  response: String, // HTTP Status Code usually and sometimes text response,
                    //   i.e. ENOTFOUND, with no associated numeric code. Usually from dep
  message: String,  // Any message crafted or static
  created: { type: Date, expires: 60 * 60 * 24 * 30 },
  updated: Date,

  // Extra info
  _authorId: Schema.Types.ObjectId,
});

var Sync = mongoose.model('Sync', syncSchema);

Sync.syncIndexes(function () {
  Sync.collection.getIndexes({
    full: true
  }).then(function(aIndexes)  {
    console.log('Sync indexes:\n', aIndexes);
  }).catch(console.error);
});

Sync.on('index', function (aErr) {
  if (aErr) {
    console.error(aErr);
  } else {
    console.log('Index event triggered/trapped for Sync model');
  }
});

exports.Sync = Sync;
