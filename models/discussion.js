var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var discussionSchema = new Schema({
  // Visible
  topic: String,
  category: String,
  comments: Number,
  author: String,
  created: Date,
  lastCommentor: String,
  updated: Date,
  rating: Number, // collective rating from comments

  // Moderation
  // true if creator comment is flagged past discussion threshold
  flagged: Boolean,

  // Extra info
  path: String,
  duplicateId: Number,
  _authorId: Schema.Types.ObjectId
});

var Discussion = mongoose.model('Discussion', discussionSchema);

exports.Discussion = Discussion;
