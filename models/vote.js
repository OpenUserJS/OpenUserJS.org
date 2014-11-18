'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var voteSchema = new Schema({
  vote: Boolean,
  _scriptId: Schema.Types.ObjectId,
  _userId: Schema.Types.ObjectId
});

var Vote = mongoose.model('Vote', voteSchema);

exports.Vote = Vote;
