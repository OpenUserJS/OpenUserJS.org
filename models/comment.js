var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var commentSchema = new Schema({
  // Visible
  content: String,
  author: String,
  created: Date,
  rating: Number,

  // Moderation
  creator: Boolean,
  flags: Number,
  flagged: Boolean,

  // Extra info
  id: String, // Base16 of created.getTime()
  _discussionId: Schema.Types.ObjectId,
  _authorId: Schema.Types.ObjectId
});

var Comment = mongoose.model('Comment', commentSchema);

exports.Comment = Comment;
