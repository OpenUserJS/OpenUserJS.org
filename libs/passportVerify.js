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

//--- Configuration inclusions
var allStrategies = require('../controllers/strategies.json');

// This is a custom verification function used for Passports because
// we needed something more powerful than what they provided
exports.verify = function (aId, aStrategy, aUsername, aLoggedIn, aDone) {
  var shasum = crypto.createHash('sha256');
  var digest = null;

  if (aStrategy === 'github') {
    // We only keep plaintext ids for GH since that's all we need
    digest = aId;
  } else if (aStrategy === 'steam') {
    // Having these forced secure ids would allow us to do things with the user's
    // account and that is something we DO NOT want to do
    shasum.update(String(aId).replace(/^http:/, 'https:'));
    digest = shasum.digest('hex');
  } else {
    // Having these ids would allow us to do things with the user's
    // account and that is something we DO NOT want to do
    shasum.update(String(aId));
    digest = shasum.digest('hex');
  }

  findDeadorAlive(User, { 'auths': digest }, true,
    function (aAlive, aUser, aRemoved) {
      var pos = aUser ? aUser.auths.indexOf(digest) : -1;
      if (aRemoved) {
        aDone(null, false, 'User was removed');

        // Always return if production... allows for testing in dev with or without dbg
        if (isPro) {
          return;
        }
      }

      if (!aUser) {
        User.findOne({ 'name': aUsername }, function (aErr, aUser) {
          // WARNING: No err handling

          if (aUser && aLoggedIn) {
            if (allStrategies[aStrategy].readonly) {
              aDone(null, false, 'readonly strategy');
              return;
            } else {
              // Add the new strategy to same account
              // This allows linking multiple external accounts to one of ours
              aUser.auths.push(digest);
              aUser.strategies.push(aStrategy);
              aUser.save(function (aErr, aUser) {
                aDone(aErr, aUser);
                return;
              });
            }
          } else if (aUser) {
            // user was found matching name but can't be authenticated
            aDone(null, false, 'username is taken');
            return;
          } else {
            // Check for strategy readonly
            if (allStrategies[aStrategy].readonly) {
              aDone(null, false, 'readonly strategy');
              return;
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
                aDone(aErr, aUser);
                return;
              });
            }
          }
        });
      } else if (pos > -1 && pos < aUser.auths.length - 1) {
        // Set current strategy to use as default
        aUser.strategies.splice(pos, 1);
        aUser.auths.splice(pos, 1);
        aUser.strategies.push(aStrategy);
        aUser.auths.push(digest);

        aUser.markModified('strategies');
        aUser.markModified('auths');
        aUser.save(function (aErr, aUser) {
          aDone(aErr, aUser);
          return;
        });
      } else {
        // The user was authenticated
        aDone(null, aUser);
        return;
      }
    }
  );
};
