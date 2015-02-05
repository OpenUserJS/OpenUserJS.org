'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var crypto = require('crypto');
var User = require('../models/user').User;
var findDeadorAlive = require('../libs/remove').findDeadorAlive;
var userRoles = require('../models/userRoles.json');

// This is a custom verification function used for Passports because
// we needed something more powerful than what they provided
exports.verify = function (aId, aStrategy, aUsername, aLoggedIn, aDone) {
  var shasum = crypto.createHash('sha256');
  var digest = null;
  var query = {};
  var aIds = [];

  if (aId instanceof Array) {
    aIds = aId.map(function (aId) {
      var shasum = crypto.createHash('sha256');
      shasum.update(String(aId));
      return shasum.digest('hex');
    });
    query.auths = { '$in': aIds };
  } else if (aStrategy === 'github') {
    // We only keep plaintext ids for GH since that's all we need
    digest = aId;
  } else {
    // Having these ids would allow us to do things with the user's
    // account and that is something we DO NOT want to do
    shasum.update(String(aId));
    digest = shasum.digest('hex');
  }

  if (!query.auths) {
    query.auths = digest;
  }

  findDeadorAlive(User, query, true,
    function (aAlive, aUser, aRemoved) {
      var pos = aUser ? aUser.auths.indexOf(digest || aIds[0]) : -1;
      if (aRemoved) { aDone(null, false, 'user was removed'); }

      if (!aUser) {
        User.findOne({ 'name': aUsername }, function (aErr, aUser) {
          if (aUser && aLoggedIn) {
            // Add the new strategy to same account
            // This allows linking multiple external accounts to one of ours
            aUser.auths.push(digest);
            aUser.strategies.push(aStrategy);
            aUser.save(function (aErr, aUser) {
              return aDone(aErr, aUser);
            });
          } else if (aUser) {
            // user was found matching name but not can't be authenticated
            return aDone(null, false, 'username is taken');
          } else {
            // Create a new user
            aUser = new User({
              'name': aUsername,
              'auths': [digest],
              'strategies': [aStrategy],
              'role': userRoles.length - 1,
              'about': '',
              'ghUsername': null
            });
            aUser.save(function (aErr, aUser) {
              return aDone(aErr, aUser);
            });
          }
        });
      } else if (pos > -1 && pos < aUser.auths.length - 1) {
        // Set the default strategy
        aUser.strategies.splice(pos, 1);
        aUser.auths.splice(pos, 1);
        aUser.strategies.push(aStrategy);
        aUser.auths.push(digest);
        aUser.save(function (aErr, aUser) {
          return aDone(aErr, aUser);
        });
      } else if (aIds.length > 0 && pos > -1) {
        // Migrate from OpenID to OAuth
        aUser.auths[pos] = aIds[1];
        aUser.save(function (aErr, aUser) {
          return aDone(aErr, aUser);
        });
      } else {
        // The user was authenticated
        return aDone(null, aUser);
      }
    }
  );
};
