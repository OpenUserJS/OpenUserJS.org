'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var mongoose = require('mongoose');
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

exports.Remove = Remove;
