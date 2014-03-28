var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var userSchema = new Schema({
  // Visible
  name: String,
  about: String,

  // A user can link multiple accounts to their OpenUserJS account
  auths: Array,
  strategies: Array,

  // Store their GitHub username when they import scripts
  ghUsername: String,

  // Moderation
  role: Number,
  flags: Number,
  flagged: Boolean
});

var User = mongoose.model('User', userSchema);

exports.User = User;

