'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var removeSchema = new Schema({
  model: String,
  content: Schema.Types.Mixed,
  removed: Date,
  reason: String,
  removerName: String,
  removerRole: Number,
  _removerId: Schema.Types.ObjectId
});

var Remove = mongoose.model('Remove', removeSchema);

exports.Remove = Remove;
