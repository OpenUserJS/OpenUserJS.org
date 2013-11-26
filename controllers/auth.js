var passport = require('passport');
var allStrategies = require('./strategies.json');
var loadPassport = require('../libs/passportLoader').loadPassport;
var strategyInstances = require('../libs/passportLoader').strategyInstances;
var Strategy = require('../models/strategy.js').Strategy;
var User = require('../models/user').User;
var userRoles = require('../models/userRoles.json');
var verifyPassport = require('../libs/passportVerify').verify;

// These functions serialize the user model so we can keep 
// the info in the session
passport.serializeUser(function (user, done) {
  done(null, user._id);
});

passport.deserializeUser(function (id, done) {
  User.findOne(id, function (err, user) {
    done(err, user);
  });
});

// Setup all our auth strategies
var openIdStrategies = {};
Strategy.find({}, function (err, strategies) {
  
  // Get OpenId strategies
  for (var name in allStrategies) {
    if (!allStrategies[name].oauth) {
      openIdStrategies[name] = true;
      strategies.push({ 'name' : name, 'openid' : true });
    }
  }
  
  // Load the passport module for each strategy
  strategies.forEach(function (strategy) {
    loadPassport(strategy);
  });
});

exports.auth = function (req, res, next) {
  var strategy = req.body.auth || req.route.params.strategy;
  var username = req.body.username || req.session.username;

  if (!username) { return res.redirect('/?noname'); }
  // Clean the username of leading and trailing whitespace and forward slashes
  username = username.replace(/^\s+|\s+$/g, '').replace(/\//g, '');

  // The username could be empty after the replacements
  if (!username) { return res.redirect('/?noname'); }

  // Store the username in the session to we still have it when they
  // get back from authentication
  if (!req.session.username) {
    req.session.username = username;
  }

  function auth() {
    var authenticate = passport.authenticate(strategy);

    // Just in case some dumbass tries a bad /auth/* url
    if (!strategyInstances[strategy]) { return next(); }

    authenticate(req, res);
  }

  User.findOne({ name : username }, function (err, user) {
    var strategies = null;
    var strat = null;

    if (user) {
      strategies = user.strategies;
      strat = strategies.pop();

      if (req.session.newstrategy) { // authenticate with a new strategy
        delete req.session.newstrategy;
      } else if (!strategy) { // use an existing strategy
        strategy = strat;
      } else if (strategies.indexOf(strategy) === -1) {
        // add a new strategy but first authenticate with existing strategy
        req.session.newstrategy = strategy;
        strategy = strat;
      } // else use the strategy that was given in the POST
    }

    if (!strategy) { 
      return res.redirect('/?nostrategy');
    } else {
      return auth();
    }
  });
};

// Temporary migration code
// Will be removed
User.find({ 'strategies' : 'github' }, function (err, users) {
  users.forEach(function (user) {
    var index = user.strategies.indexOf('github');
    var auth = null;
    if (index > -1) {
      auth = user.auths[index];
      user.strategies.splice(index, 1);
      user.auths.splice(index, 1);
      user.auths.push(auth);
      user.strategies.push('github');
      user.save(function(err, user) {});
    }
  });
});

exports.callback = function (req, res, next) {
  var strategy = req.route.params.strategy;
  var username = req.session.username;
  var newstrategy = req.session.newstrategy;
  var strategyInstance = null;

  // The callback was called inproperly
  if (!strategy || !username) { return next(); }

  // Get the passport strategy instance so we can alter the _verfiy method
  strategyInstance = strategyInstances[strategy];
  

  // Hijak the private verify method so we can fuck shit up freely
  // We use this library for things it was never intended to do
  if (openIdStrategies[strategy]) {
    strategyInstance._verify = function (id, done) {
      verifyPassport(id, strategy, username, req.session.user, done);
    }
  } else {
    strategyInstance._verify = 
      function (token, refreshOrSecretToken, profile, done) {
        verifyPassport(profile.id, strategy, username, req.session.user, done);
      }
  }

  // This callback will happen after the verify routine
  var authenticate = passport.authenticate(strategy, 
    function (err, user, info) {
      if (err) { return next(err); }
      if (!user) { return res.redirect('/?authfail'); }

      req.logIn(user, function(err) {
        if (err) { return next(err); }

        // Store the user info in the session
        req.session.user = user;
        if (newstrategy) {
          // Allow a user to link to another acount
          return res.redirect('/auth/' + newstrategy);
        } else {
          // Delete the username that was temporarily stored
          delete req.session.username;
          return res.redirect('/');
        }
      });
  });

  authenticate(req, res, next);
}
