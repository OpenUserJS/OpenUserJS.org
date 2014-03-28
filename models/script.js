var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var scriptSchema = new Schema({
  // Visible
  name: String,
  author: String,
  installs: Number,
  rating: Number,
  about: String,
  updated: Date,

  // Moderation
  votes: Number, // upvotes negate flags
  flags: Number,
  flagged: Boolean,
  installable: Boolean,
  installName: String,

  // Extra info
  fork: Array,
  meta: Object,
  _authorId: Schema.Types.ObjectId
});

var Script = mongoose.model('Script', scriptSchema);

exports.Script = Script;
