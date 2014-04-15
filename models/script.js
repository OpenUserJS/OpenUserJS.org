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
  installName: String,

  // Extra info
  fork: Array,
  meta: Object,
  isLib: Boolean,
  uses: [String],
  _groupId: Schema.Types.ObjectId, // The group is script created
  _authorId: Schema.Types.ObjectId
});

var Script = mongoose.model('Script', scriptSchema);

exports.Script = Script;
