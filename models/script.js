var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var scriptSchema = new Schema({
  name: String,
  about: String,
  installs: Number,
  rating: Number,
  votes: Number,
  flags: Number,
  disabled: Boolean,
  removed: Boolean,
  installable: Boolean,
  installName: String,
  updated: Date,
  fork: Array,
  meta: Object,
  author: String,
  _authorId: Schema.Types.ObjectId
});

var Script = mongoose.model('Script', scriptSchema);

exports.Script = Script;
