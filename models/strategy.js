'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var mongoose = require('mongoose');
mongoose.Promise = global.Promise;

var Schema = mongoose.Schema;

var strategySchema = new Schema({
  id: String,
  key: String,
  name: String,
  display: String
});

var Strategy = mongoose.model('Strategy', strategySchema);

Strategy.syncIndexes(function () {
  Strategy.collection.getIndexes({
    full: true
  }).then(function(aIndexes)  {
    console.log('Strategy indexes:\n', aIndexes);
  }).catch(console.error);
});

Strategy.on('index', function (aErr) {
  if (aErr) {
    console.error(aErr);
  } else {
    console.log('Index event triggered/trapped for Strategy model');
  }
});

exports.Strategy = Strategy;
