'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var flagSchema = new Schema({
  model: String,
  reason: String,
  _contentId: Schema.Types.ObjectId,
  _userId: Schema.Types.ObjectId
});

flagSchema.virtual('_since').get(function () {
  return this._id.getTimestamp();
});

var Flag = mongoose.model('Flag', flagSchema);

exports.Flag = Flag;
