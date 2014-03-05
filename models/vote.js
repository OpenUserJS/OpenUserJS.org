var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var voteSchema = new Schema({
  vote: Boolean,
  _scriptId: Schema.Types.ObjectId,
  _userId: Schema.Types.ObjectId
});

var Vote = mongoose.model('Vote', voteSchema);

exports.Vote = Vote;
