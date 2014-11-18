'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var strategySchema = new Schema({
  id: String,
  key: String,
  name: String,
  display: String
});

var Strategy = mongoose.model('Strategy', strategySchema);

exports.Strategy = Strategy;
