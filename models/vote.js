'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var mongoose = require('mongoose');
mongoose.Promise = global.Promise;

var Schema = mongoose.Schema;

var voteSchema = new Schema({
  vote: Boolean,
  created: Date,

  _scriptId: Schema.Types.ObjectId,
  _userId: Schema.Types.ObjectId
});

var Vote = mongoose.model('Vote', voteSchema);

Vote.syncIndexes(function () {
  Vote.collection.getIndexes({
    full: true
  }).then(function(aIndexes)  {
    console.log('Vote indexes:\n', aIndexes);
  }).catch(console.error);
});

Vote.on('index', function (aErr) {
  if (aErr) {
    console.error(aErr);
  } else {
    console.log('Index event triggered/trapped for Vote model');
  }
});

exports.Vote = Vote;
