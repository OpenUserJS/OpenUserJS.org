'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var passport = require('passport');
var allStrategies = require('./strategies.json');
var loadPassport = require('../libs/passportLoader').loadPassport;
var strategyInstances = require('../libs/passportLoader').strategyInstances;
var Strategy = require('../models/strategy.js').Strategy;
var User = require('../models/user').User;
var userRoles = require('../models/userRoles.json');
var verifyPassport = require('../libs/passportVerify').verify;
var cleanFilename = require('../libs/helpers').cleanFilename;
var addSession = require('../libs/modifySessions').add;

// Unused but removing it breaks passport
passport.serializeUser(function (aUser, aDone) {
  aDone(null, aUser._id);
});

// Setup all our auth strategies
var openIdStrategies = {};
Strategy.find({}, function (aErr, aStrategies) {

  // Get OpenId strategies
  for (var name in allStrategies) {
    if (!allStrategies[name].oauth) {
      openIdStrategies[name] = true;
      aStrategies.push({ 'name': name, 'openid': true });
    }
  }

  // Load the passport module for each strategy
  aStrategies.forEach(function (aStrategy) {
    loadPassport(aStrategy);
  });
});

exports.auth = function (aReq, aRes, aNext) {
  var user = aReq.session.user;
  var strategy = aReq.body.auth || aReq.params.strategy;
  var username = aReq.body.username || aReq.session.username;

  function auth() {
    var authenticate = passport.authenticate(strategy);

    // Just in case some dumbass tries a bad /auth/* url
    if (!strategyInstances[strategy]) { return aNext(); }

    authenticate(aReq, aRes);
  }

  // Allow a logged in user to add a new strategy
  if (strategy && user) {
    aReq.session.username = user.name;
    return auth();
  } else if (user) {
    return aNext();
  }

  if (!username) { return aRes.redirect('/register?noname'); }
  // Clean the username of leading and trailing whitespace,
  // and other stuff that is unsafe in a url
  username = cleanFilename(username.replace(/^\s+|\s+$/g, ''));

  // The username could be empty after the replacements
  if (!username) { return aRes.redirect('/register?noname'); }

  // Store the username in the session so we still have it when they
  // get back from authentication
  if (!aReq.session.username) {
    aReq.session.username = username;
  }

  User.findOne({ name: { $regex: new RegExp('^' + username + '$', 'i') } },
    function (aErr, aUser) {
      var strategies = null;
      var strat = null;

      if (aUser) {
        strategies = aUser.strategies;
        strat = strategies.pop();

        if (aReq.session.newstrategy) { // authenticate with a new strategy
          delete aReq.session.newstrategy;
        } else if (!strategy) { // use an existing strategy
          strategy = strat;
        } else if (strategies.indexOf(strategy) === -1) {
          // add a new strategy but first authenticate with existing strategy
          aReq.session.newstrategy = strategy;
          strategy = strat;
        } // else use the strategy that was given in the POST
      }

      if (!strategy) {
        return aRes.redirect('/register');
      } else {
        return auth();
      }
    });
};

exports.callback = function (aReq, aRes, aNext) {
  var strategy = aReq.params.strategy;
  var username = aReq.session.username;
  var newstrategy = aReq.session.newstrategy;
  var strategyInstance = null;
  var doneUrl = aReq.session.user ? '/user/edit' : '/';

  // The callback was called improperly
  if (!strategy || !username) { return aNext(); }

  // Get the passport strategy instance so we can alter the _verfiy method
  strategyInstance = strategyInstances[strategy];

  // Hijak the private verify method so we can fuck shit up freely
  // We use this library for things it was never intended to do
  if (openIdStrategies[strategy]) {
    strategyInstance._verify = function (aId, aDone) {
      verifyPassport(aId, strategy, username, aReq.session.user, aDone);
    }
  } else {
    strategyInstance._verify =
      function (aToken, aRefreshOrSecretToken, aProfile, aDone) {
        aReq.session.profile = aProfile;
        verifyPassport(aProfile.id, strategy, username, aReq.session.user, aDone);
      };
  }

  // This callback will happen after the verify routine
  var authenticate = passport.authenticate(strategy, function (aErr, aUser, aInfo) {
    if (aErr) { return aNext(aErr); }
    if (!aUser) {
      return aRes.redirect(doneUrl + (doneUrl === '/' ? 'register' : '')
        + '?authfail');
    }

    aReq.logIn(aUser, function (aErr) {
      if (aErr) { return aNext(aErr); }

      // Store the user info in the session
      aReq.session.user = aUser;

      // Save the session id on the user model
      aUser.sessionId = aReq.sessionID;

      // Save GitHub username.
      if (aReq.session.profile && aReq.session.profile.provider === 'github') {
        aUser.ghUsername = aReq.session.profile.username;
      }

      addSession(aReq, aUser, function () {
        if (newstrategy) {
          // Allow a user to link to another acount
          return aRes.redirect('/auth/' + newstrategy);
        } else {
          // Delete the username that was temporarily stored
          delete aReq.session.username;
          return aRes.redirect(doneUrl);
        }
      });
    });
  });

  authenticate(aReq, aRes, aNext);
};
