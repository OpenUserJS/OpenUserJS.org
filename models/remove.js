'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var mongoose = require('mongoose');
mongoose.Promise = global.Promise;

var Schema = mongoose.Schema;

var removeSchema = new Schema({
  model: String,
  content: Schema.Types.Mixed,
  removed: Date,
  reason: String,
  removerName: String,
  removerRole: Number,
  removerAutomated: Boolean,
  _removerId: Schema.Types.ObjectId
});

var Remove = mongoose.model('Remove', removeSchema);

Remove.syncIndexes(function () {
  Remove.collection.getIndexes({
    full: true
  }).then(function(aIndexes)  {
    console.log('Remove indexes:\n', aIndexes);
  }).catch(console.error);
});

Remove.on('index', function (aErr) {
  if (aErr) {
    console.error(aErr);
  } else {
    console.log('Index event triggered/trapped for Remove model');
  }
});

exports.Remove = Remove;
