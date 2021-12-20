'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//

//--- Dependency inclusions
var passport = require('passport');
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
var getRedirect = require('../libs/helpers').getRedirect;
var isSameOrigin = require('../libs/helpers').isSameOrigin;
var addSession = require('../libs/modifySessions').add;
var expandSession = require('../libs/modifySessions').expand;
var statusCodePage = require('../libs/templateHelpers').statusCodePage;

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
  if (aErr) {
    // Some possible catastrophic error
    console.error(colors.red(aErr));

    process.exit(1);
    return;
  }

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

exports.preauth = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  var username = aReq.body.username;
  var SITEKEY = process.env.HCAPTCHA_SITE_KEY;

  if (!authedUser) {
    if (!username) {
      aRes.redirect('/login?noname');
      return;
    }
    // Clean the username of leading and trailing whitespace,
    // and other stuff that is unsafe in a url
    username = cleanFilename(username.replace(/^\s+|\s+$/g, ''));

    // The username could be empty after the replacements
    if (!username) {
      aRes.redirect('/login?noname');
      return;
    }

    if (username.length > 64) {
      aRes.redirect('/login?toolong');
      return;
    }

    User.findOne({ name: { $regex: new RegExp('^' + username + '$', 'i') } },
      function (aErr, aUser) {
        if (aErr) {
          console.error('Authfail with no User found of', username, aErr);
          aRes.redirect('/login?usernamefail');
          return;
        }

        if (aUser) {
          // Ensure that casing is identical so we still have it, correctly, when they
          // get back from authentication
          aReq.body.username = aUser.name;

          if (aUser) {
            aReq.knownUser = true;
          }

          // Skip captcha for known individual
          exports.auth(aReq, aRes, aNext);
        } else {
          // Match cleansed name and this is the casing they have chosen
          aReq.body.username = username;

          // Validate captcha for unknown individual
          if (!SITEKEY) {
            // Skip captcha for not implemented
            exports.auth(aReq, aRes, aNext);
          } else {
            aNext();
          }
        }
    });
  } else {
    // Skip captcha for already logged in
    exports.auth(aReq, aRes, aNext);
  }

};

exports.errauth = function (aErr, aReq, aRes, aNext) {
  if (aErr) {
    console.error(aErr.status, aErr.message);
    aRes.redirect(302, '/login?authfail');
  } else {
    aNext();
  }
}

exports.auth = function (aReq, aRes, aNext) {
  function auth() {
    var authenticate = null;

    // Just in case someone tries a bad /auth/* url
    // or an auth has been EOL'd
    if (!strategyInstances[strategy]) {
      aRes.redirect('/login?invalidauth');
      return;
    }

    if (strategy === 'google') {
      authOpts.scope = ['profile']; // NOTE: OAuth 2.0 profile
    }
    authenticate = passport.authenticate(strategy, authOpts);

    // Ensure `sameSite` is set to min before authenticating
    // Necessity to demote for authentication
    if (aReq.session.cookie.sameSite !== 'lax') {
      aReq.session.cookie.sameSite = 'lax';
      aReq.session.save(function (aErr) {
        if (aErr) {
          // Some possible catastrophic error
          console.error(colors.red(aErr));

          statusCodePage(aReq, aRes, aNext, {
            statusCode: 500,
            statusMessage: 'Save Session failed.'
          });
          return;
        }

        authenticate(aReq, aRes, aNext);
      });
    } else {
      authenticate(aReq, aRes, aNext);
    }
  }

  function sessionauth() {
    var redirectTo = null;
    var captchaToken = aReq.body['g-captcha-response'] ?? aReq.body['h-captcha-response'];

    // Yet another passport hack.
    // Initialize the passport session data only when we need it. i.e. late binding
    if (!aReq.session[passportKey] && aReq._passport.session) {
      aReq.session[passportKey] = {};
      aReq._passport.session = aReq.session[passportKey];
    }

    // Validate and save redirect url from the form submission on the session
    redirectTo = isSameOrigin(aReq.body.redirectTo || getRedirect(aReq));
    if (redirectTo.result) {
      aReq.session.redirectTo = redirectTo.URL.pathname;
    } else {
      delete aReq.body.redirectTo;
      aReq.session.redirectTo = '/';
    }

    // Save the known user on the session and remove
    aReq.session.knownUser = aReq.knownUser;
    delete aReq.knownUser;

    // Save the token from the captcha on the session and remove from body
    if (captchaToken) {
      aReq.session.captchaToken = captchaToken;
      aReq.session.captchaSuccess = aReq.hcaptcha;

      delete aReq.body['g-captcha-response'];
      delete aReq.body['h-captcha-response'];
      delete aReq.hcaptcha;
    }
  }

  function anteauth() {
    // Store the useragent always so we still have it when they
    // get back from authentication and/or attaching
    aReq.session.useragent = aReq.get('user-agent');

    User.findOne({ name: username },
      function (aErr, aUser) {
        var strategies = null;
        var strat = null;

        if (aErr) { // NOTE: Possible DB error
          console.error('Authfail with no User found of', username, aErr);
          aRes.redirect('/login?usernamefail');
          return;
        }

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
          } // else {
            //   use the strategy that was given in the POST
            // }
        }

        if (!strategy) {
          aRes.redirect('/login?stratfail');
          return;
        } else {
          auth();
          return;
        }
      }
    );
  }

  var authedUser = aReq.session.user;
  var consent = aReq.body.consent;
  var strategy = aReq.body.auth || aReq.params.strategy;
  var username = null;
  var authOpts = { failureRedirect: '/login?stratfail' };
  var passportKey = aReq._passport.instance._key;

  if (!authedUser) {
    // Already validated username
    username = aReq.body.username;

    if (consent !== 'true') {
      aRes.redirect('/login?noconsent');
      return;
    }

    sessionauth();

    // Store the username always so we still have it when they
    // get back from authentication
    aReq.session.username = username;

    anteauth();

  } else {
    // Already validated username
    username = aReq.session.username || (authedUser ? authedUser.name : null);

    sessionauth();

    // Allow a logged in user to add a new strategy
    if (strategy) {
      aReq.session.passport.oujsOptions.authAttach = true;
      aReq.session.newstrategy = strategy;
      aReq.session.username = authedUser.name;
    } else {
      aRes.redirect(aReq.session.redirectTo || '/');
      delete aReq.session.redirectTo;
      return;
    }

    anteauth();
  }
};

exports.callback = function (aReq, aRes, aNext) {
  var strategy = aReq.params.strategy;
  var username = aReq.session.username;
  var newstrategy = aReq.session.newstrategy;
  var knownUser = aReq.session.knownUser;
  var captchaToken = aReq.session.captchaToken;
  var captchaSuccess = aReq.session.captchaSuccess;

  var strategyInstance = null;
  var doneUri = aReq.session.user ? '/user/preferences' : '/';
  var SITEKEY = process.env.HCAPTCHA_SITE_KEY;

  if (SITEKEY && !knownUser && !captchaToken && !captchaSuccess) {
    aRes.redirect('/login?authfail');
    return;
  }

  // The callback was called improperly or sesssion expired
  if (!strategy || !username) {
    aRes.redirect(doneUri + (doneUri === '/' ? 'login' : ''));
    return;
  }

  // Get the passport strategy instance so we can alter the _verify method
  strategyInstance = strategyInstances[strategy];

  // Hijack the private verify method so we can mess stuff up freely
  // We use this library for things it was never intended to do
  if (openIdStrategies[strategy]) {
    switch (strategy) {
      case 'steam':
        strategyInstance._verify = function (aIgnore, aId, aDone) {
          verifyPassport(aId, strategy, username, aReq.session.user, aDone);
        };
        break;
      default:
        strategyInstance._verify = function (aId, aDone) {
          verifyPassport(aId, strategy, username, aReq.session.user, aDone);
        };
    }
  } else {
    switch (strategy) {
      default:
        strategyInstance._verify = function (aToken, aRefreshOrSecretToken, aProfile, aDone) {
          aReq.session.profile = aProfile;
          verifyPassport(aProfile.id, strategy, username, aReq.session.user, aDone);
        };
    }
  }

  // This callback will happen after the verify routine
  var authenticate = passport.authenticate(strategy, function (aErr, aUser, aInfo) {
    if (aErr) {
      // Some possible catastrophic error with *passport*... and/or authentication
      console.error(colors.red(aErr));
      if (aInfo) {
        console.warn(colors.yellow(aInfo));
      }

      statusCodePage(aReq, aRes, aNext, {
        statusCode: 502,
        statusMessage: 'External authentication failed.'
      });
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

      if (aInfo === 'readonly strategy') {
        aRes.redirect(doneUri + (doneUri === '/' ? 'login' : '') + '?roauth');
      } else if (aInfo === 'username recovered') {
        aRes.redirect(doneUri + (doneUri === '/' ? 'login' : '') + '?retryauth');
      } else {
        aRes.redirect(doneUri + (doneUri === '/' ? 'login' : '') + '?authfail');
      }
      return;
    }

    aReq.logIn(aUser, function (aErr) {
      if (aErr) {
        console.error('Not logged in');
        console.error(aErr);

        statusCodePage(aReq, aRes, aNext, {
          statusCode: 502,
          statusMessage: 'External authentication failed to login.'
        });
        return;
      }

      // Show a console notice that successfully logged in
      if (isDev || isDbg) {
        console.log(colors.green('Logged in'));
      }

      // Store the user info in the session
      aReq.session.user = aUser;

      // Store the info in the session passport
      // Currently we do not care to save this info in User
      // as it is volatile, absent, and usually session specific
      if (aReq.session.passport) {
        if (!aReq.session.passport.oujsOptions) {
          aReq.session.passport.oujsOptions = {};
        }
        aReq.session.passport.oujsOptions.remoteAddress = aReq.connection.remoteAddress;
        aReq.session.passport.oujsOptions.userAgent = aReq.session.useragent;
        aReq.session.passport.oujsOptions.since = new Date();
        aReq.session.passport.oujsOptions.strategy = strategy;
      }

      // Save the last date a user sucessfully logged in
      aUser.authed = new Date();

      // Save consent
      aUser.consented = true;

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
        } else {
          // Delete the username that was temporarily stored
          delete aReq.session.username;
          delete aReq.session.useragent;
          delete aReq.session.newstrategy;
          doneUri = aReq.session.redirectTo;
          delete aReq.session.redirectTo;

          if (!aReq.session.passport.oujsOptions.authAttach) {
            expandSession(aReq, aUser, function (aErr) {
              if (aErr) {
                // Some possible catastrophic error
                console.error(colors.red(aErr));

                statusCodePage(aReq, aRes, aNext, {
                  statusCode: 500,
                  statusMessage: 'Expand Session failed.'
                });
                return;
              }

              aRes.redirect(doneUri);
            });
          } else {
            aRes.redirect(doneUri);
          }

          // Ensure `sameSite` is set to max after redirect
          // Elevate for optimal future protection
          setTimeout(function () {
            if (aReq.session.cookie.sameSite !== 'strict') {
              aReq.session.cookie.sameSite = 'strict';
              aReq.session.save();
            }
          }, 250);
        }
      });
    });
  });

  authenticate(aReq, aRes, aNext);
};

exports.validateUser = function validateUser(aReq, aRes, aNext) {
  if (!aReq.session.user) {
    aRes.redirect('/login');
    return;
  }
  aNext();
  return;
};
