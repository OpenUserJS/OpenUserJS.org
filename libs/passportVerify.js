var crypto = require('crypto');
var User = require('../models/user').User;
var findDeadorAlive = require('../libs/remove').findDeadorAlive;
var userRoles = require('../models/userRoles.json');

// This is a custom verification function used for Passports because
// we needed something more powerful than what they provided
exports.verify = function (id, strategy, username, loggedIn, done) {
  var shasum = crypto.createHash('sha256');
  var digest = null;

  // We only keep plaintext ids for GH since that's all we need
  if (strategy === 'github') {
    digest = id;
  } else {
    // Having these ids would allow us to do things with the user's
    // account and that is something we DO NOT want to do
    shasum.update(String(id));
    digest = shasum.digest('hex');
  }

  findDeadorAlive(User, { 'auths': digest }, true,
    function (alive, user, removed) {
      var pos = user ? user.auths.indexOf(digest) : -1;
      if (removed) { done(null, false, 'user was removed'); }

      if (!user) {
        User.findOne({ 'name': username }, function (err, user) {
          if (user && loggedIn) {
            // Add the new strategy to same account
            // This allows linking multiple external accounts to one of ours
            user.auths.push(digest);
            user.strategies.push(strategy);
            user.save(function (err, user) {
              return done(err, user);
            });
          } else if (user) {
            // user was found matching name but not can't be authenticated
            return done(null, false, 'username is taken');
          } else {
            // Create a new user
            user = new User({
              'name': username,
              'auths': [digest],
              'strategies': [strategy],
              'role': userRoles.length - 1,
              'about': '',
              'ghUsername': null
            });
            user.save(function (err, user) {
              return done(err, user);
            });
          }
        });
      } else if (pos > -1 && pos < user.auths.length - 1) {
        // Set the default strategy
        user.strategies.splice(pos, 1);
        user.auths.splice(pos, 1);
        user.strategies.push(strategy);
        user.auths.push(digest);
        user.save(function (err, user) {
          return done(err, user);
        });
      } else {
        // The user was authenticated
        return done(null, user);
      }
    }
  );
}
