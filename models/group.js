'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var mongoose = require('mongoose');
mongoose.Promise = global.Promise;

var Schema = mongoose.Schema;
var ObjectId = Schema.Types.ObjectId;

var groupSchema = new Schema({
  name: { type: String },
  rating: { type: Number, default: 0 },
  created: { type: Date },
  updated: { type: Date },
  _scriptIds: [{ type: ObjectId, ref: 'Script' }],
  size: { type: Number, default: 0 }
});

var Group = mongoose.model('Group', groupSchema);

Group.syncIndexes(function () {
  Group.collection.getIndexes({
    full: true
  }).then(function(aIndexes)  {
    console.log('Group indexes:\n', aIndexes);
  }).catch(console.error);
});

Group.on('index', function (aErr) {
  if (aErr) {
    console.error(aErr);
  } else {
    console.log('Index event triggered/trapped for Group model');
  }
});

exports.Group = Group;
