var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var scriptSchema = new Schema({
  // Visible
  name: String,
  author: String,
  installs: Number,
  rating: Number,
  about: String,

  // Moderation
  votes: Number, // votes negate flags
  flags: Number,
  flagged: Boolean,
  removed: Boolean,
  installable: Boolean,
  installName: String,

  // Extra info
  updated: Date,
  fork: Array,
  meta: Object,
  _authorId: Schema.Types.ObjectId
});

var Script = mongoose.model('Script', scriptSchema);

exports.Script = Script;
