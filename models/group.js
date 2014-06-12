var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var groupSchema = new Schema({
  name: String,
  rating: Number,
  updated: Date,
  _scriptIds: [Schema.Types.ObjectId]
});

var Group = mongoose.model('Group', groupSchema);

exports.Group = Group;
