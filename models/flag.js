'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var mongoose = require('mongoose');
mongoose.Promise = global.Promise;

var Schema = mongoose.Schema;

var flagSchema = new Schema({
  model: String,
  reason: String,
  weight: Number,                     // Natural number with the role weight of User at time of flagging
  _contentId: Schema.Types.ObjectId,
  _userId: Schema.Types.ObjectId,

  created: Date
});

var Flag = mongoose.model('Flag', flagSchema);

Flag.syncIndexes(function () {
  Flag.collection.getIndexes({
    full: true
  }).then(function(aIndexes)  {
    console.log('Flag indexes:\n', aIndexes);
  }).catch(console.error);
});

Flag.on('index', function (aErr) {
  if (aErr) {
    console.error(aErr);
  } else {
    console.log('Index event triggered/trapped for Flag model');
  }
});

exports.Flag = Flag;
