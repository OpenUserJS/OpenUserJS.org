'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//

//--- Dependency inclusions
var passport = require('passport');
var jwt = require('jwt-simple');
var url = require('url');
var colors = require('ansi-colors');

//--- Model inclusions
var Strategy = require('../models/strategy.js').Strategy;
var User = require('../models/user').User;

//--- Controller inclusions

//--- Library inclusions
// var authLib = require('../libs/auth');

var loadPassport = require('../libs/passportLoader').loadPassport;
var strategyInstances = require('../libs/passportLoader').strategyInstances;
var verifyPassport = require('../libs/passportVerify').verify;
var cleanFilename = require('../libs/helpers').cleanFilename;
var addSession = require('../libs/modifySessions').add;

//--- Configuration inclusions
var allStrategies = require('./strategies.json');

//---

// Unused but removing it breaks passport
passport.serializeUser(function (aUser, aDone) {
  aDone(null, aUser._id);
});

// Setup all the auth strategies
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

// Get the referer url for redirect after login/logout
// WARNING: Also found in `./controller/index.js`
function getRedirect(aReq) {
  var referer = aReq.get('Referer');
  var redirect = '/';

  if (referer) {
    referer = url.parse(referer);
    if (referer.hostname === aReq.hostname) {
      redirect = referer.path;
    }
  }

  return redirect;
}

exports.auth = function (aReq, aRes, aNext) {
  function auth() {
    var authenticate = null;

    // Just in case someone tries a bad /auth/* url
    if (!strategyInstances[strategy]) {
      aNext();
      return;
    }

    if (strategy === 'google') {
      authOpts.scope = ['https://www.googleapis.com/auth/plus.login'];
    }
    authenticate = passport.authenticate(strategy, authOpts);

    authenticate(aReq, aRes, aNext);
  }

  var authedUser = aReq.session.user;
  var strategy = aReq.body.auth || aReq.params.strategy;
  var username = aReq.body.username || aReq.session.username ||
    (authedUser ? authedUser.name : null);
  var authOpts = { failureRedirect: '/register?stratfail' };
  var passportKey = aReq._passport.instance._key;

  // Yet another passport hack.
  // Initialize the passport session data only when we need it.
  if (!aReq.session[passportKey] && aReq._passport.session) {
    aReq.session[passportKey] = {};
    aReq._passport.session = aReq.session[passportKey];
  }

  // Save redirect url from the form submission on the session
  aReq.session.redirectTo = aReq.body.redirectTo || getRedirect(aReq);

  // Allow a logged in user to add a new strategy
  if (strategy && authedUser) {
    aReq.session.newstrategy = strategy;
    aReq.session.username = authedUser.name;
  } else if (authedUser) {
    aRes.redirect(aReq.session.redirectTo || '/');
    delete aReq.session.redirectTo;
    return;
  }

  if (!username) {
    aRes.redirect('/register?noname');
    return;
  }
  // Clean the username of leading and trailing whitespace,
  // and other stuff that is unsafe in a url
  username = cleanFilename(username.replace(/^\s+|\s+$/g, ''));

  // The username could be empty after the replacements
  if (!username) {
    aRes.redirect('/register?noname');
    return;
  }

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
          strategy = aReq.session.newstrategy;
        } else if (!strategy) { // use an existing strategy
          strategy = strat;
        } else if (strategies.indexOf(strategy) === -1) {
          // add a new strategy but first authenticate with existing strategy
          aReq.session.newstrategy = strategy;
          strategy = strat;
        } // else use the strategy that was given in the POST
      }

      if (!strategy) {
        aRes.redirect('/register');
        return;
      } else {
        auth();
        return;
      }
    });
};

exports.callback = function (aReq, aRes, aNext) {
  var strategy = aReq.params.strategy;
  var username = aReq.session.username;
  var newstrategy = aReq.session.newstrategy;
  var strategyInstance = null;
  var doneUri = aReq.session.user ? '/user/preferences' : '/';

  // The callback was called improperly
  if (!strategy || !username) {
    aNext();
    return;
  }

  // Get the passport strategy instance so we can alter the _verify method
  strategyInstance = strategyInstances[strategy];

  // Hijack the private verify method so we can mess stuff up freely
  // We use this library for things it was never intended to do
  if (openIdStrategies[strategy]) {
    strategyInstance._verify = function (aId, aDone) {
      verifyPassport(aId, strategy, username, aReq.session.user, aDone);
    };
  } else if (strategy === 'google') { // OpenID to OAuth2 migration
    strategyInstance._verify =
      function(aAccessToken, aRefreshToken, aParams, aProfile, aDone) {
        var openIdId = jwt.decode(aParams.id_token, null, true).openid_id;
        var oAuthId = aProfile.id;

        verifyPassport([openIdId, oAuthId], strategy, username, aReq.session.user, aDone);
      };
  } else {
    strategyInstance._verify =
      function (aToken, aRefreshOrSecretToken, aProfile, aDone) {
        aReq.session.profile = aProfile;
        verifyPassport(aProfile.id, strategy, username, aReq.session.user, aDone);
      };
  }

  // This callback will happen after the verify routine
  var authenticate = passport.authenticate(strategy, function (aErr, aUser, aInfo) {
    if (aErr) {
      // Some possible catastrophic error with *passport*... and/or authentication
      console.error(colors.red(aErr));
      if (aInfo) {
        console.warn(colors.yellow(aInfo));
      }

      aNext(aErr);
      return;
    }

    // If there is some info from *passport*... display it only in development and debug modes
    // This includes, but not limited to, `username is taken`
    if ((isDev || isDbg) && aInfo) {
      console.warn(colors.yellow(aInfo));
    }

    if (!aUser) {
      // If there is no User then authentication could have failed
      // Only display if development or debug modes
      if (isDev || isDbg) {
        console.error(colors.red('`User` not found'));
      }

      aRes.redirect(doneUri + (doneUri === '/' ? 'register' : '') + '?authfail');
      return;
    }

    aReq.logIn(aUser, function (aErr) {
      if (aErr) {
        console.error('Not logged in');
        console.error(aErr);

        aNext(aErr);
        return;
      }

      // Show a console notice that successfully logged in with development and debug modes
      if (isDev || isDbg) {
        console.log(colors.green('Logged in'));
      }

      // Store the user info in the session
      aReq.session.user = aUser;

      // Save the session id on the user model
      aUser.sessionId = aReq.sessionID;

      // Save GitHub username.
      if (aReq.session.profile && aReq.session.profile.provider === 'github') {
        aUser.ghUsername = aReq.session.profile.username;
      }

      addSession(aReq, aUser, function () {
        if (newstrategy && newstrategy !== strategy) {
          // Allow a user to link to another account
          aRes.redirect('/auth/' + newstrategy); // NOTE: Watchpoint... careful with encoding
          return;
        } else {
          // Delete the username that was temporarily stored
          delete aReq.session.username;
          delete aReq.session.newstrategy;
          doneUri = aReq.session.redirectTo;
          delete aReq.session.redirectTo;

          aRes.redirect(doneUri);
          return;
        }
      });
    });
  });

  authenticate(aReq, aRes, aNext);
};

exports.validateUser = function validateUser(aReq, aRes, aNext) {
  if (!aReq.session.user) {
    aRes.location('/login');
    aRes.status(302).send();
    return;
  }
  aNext();
  return;
};
