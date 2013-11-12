var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var userSchema = new Schema({
  name: String,
  role: Number,
  about: String,

  // A user can link multiple accounts to their OpenUserJS account
  auths: Array,
  strategies: Array
});

var User = mongoose.model('User', userSchema);

exports.User = User;
/*
function User(session) {
  this.settings = session.user || {};
  this.session = session;
}

User.prototype = {
  login: function(username, password) {
    // Replace with a DB lookup
    if (username == "user" && password === "pass")
    {
      this.settings = {
        loggedIn: true, 
        username: username
      }

      this.session.user = this.settings;
    }
  },

  logout: function() {
    delete this.session.user;
    this.settings = {};
  },

  register: function() {
    // do registration jazz here
    // maybe a seperate model since it's complex?
  }
};
*/
