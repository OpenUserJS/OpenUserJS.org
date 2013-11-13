var passport = require('passport');
var crypto = require('crypto');
var authKeys = require('./authKeys.json');
var strategies = require('./strategies');
var User = require('../models/user').User;

var URL = process.env.NODE_ENV === 'production' ? 
  'openuserjs.org' : 'localhost:8080';

passport.serializeUser(function(user, done) {
  done(null, user._id);
});

passport.deserializeUser(function(id, done) {
  User.findOne(id, function (err, user) {
    done(err, user);
  });
});

var strategyInstances = {};
function dummyVerify(id, done) { console.error('A strategy called dummy.'); } 

// Setup all our auth strategies
strategies.forEach(function(strategy) {
  var requireStr = 'passport-' + strategy;
  var PassportStrategy = require(requireStr).Strategy;
  var instance = null;

  switch (strategy) {
  case 'yahoo':
  case 'paypal':
  case 'google':
  case 'aol':
  case 'openid':
    instance = new PassportStrategy(
      {
        returnURL: 'http://' + URL  + '/auth/' + strategy  + '/callback/',
        realm: 'http://' + URL  + '/'
      },
      dummyVerify
    );
    break;
  default:
    instance = new PassportStrategy(
      {
        consumerKey: authKeys[strategy].id,
        consumerSecret: authKeys[strategy].key,
        clientID: authKeys[strategy].id,
        clientSecret: authKeys[strategy].key,
        callbackURL: 'http://' + URL  + '/auth/' + strategy  + '/callback/'
      },
      dummyVerify
    );
  }

  strategyInstances[strategy] = instance;
  passport.use(instance);
});

exports.auth = function(req, res, next) {
  var strategy = req.route.params.strategy;
  var username = req.session.username;

  function auth() {
    var authenticate = passport.authenticate(strategy);

    // Just in case some dumbass tries a bad /auth/* url
    if (!strategyInstances[strategy]) return next();

    authenticate(req, res);
  }

  if (username) {
    User.findOne({ name : username }, function(err, user) {
      if (user) {
        var strategies = user.strategies;
        var strat = strategies.pop();
        if (req.session.newstrategy) {
          delete req.session.newstrategy;
        } else if (!strategy) {
          strategy = strat;
        } else if (strategies.indexOf(strategy) === -1) { 
          req.session.newstrategy = strategy;
          strategy = strat;
        }
      }
      if (!strategy) return res.redirect('/');
      auth();
    });
  } else {
    if (!strategy) return res.redirect('/');
    auth();
  }
};

exports.callback = function(req, res, next) {
  var strategy = req.route.params.strategy;
  var username = req.session.username;
  var newstrategy = req.session.newstrategy;
  if (!strategy) return next();
  var strategyInstance = strategyInstances[strategy];

  function verify(id, done) {
      var shasum = crypto.createHash('sha256');
      shasum.update(String(id));
      var digest = shasum.digest('hex');

      User.findOne({ 'auths' : digest }, function (err, user) {
        if (!user) {
          User.findOne({ 'name' : username }, function(err, user) {
            if (user && req.session.user) {
              // Add the new strategy to same account
              // This allows linking multiple external accounts to one of ours
              user.auths.push(digest);
              user.strategies.push(strategy);
              user.save(function(err, user) {
                return done(err, user);
              });
            } else {
              // I have no idea where this error message goes
              if (username.length) {
                return done(null, false, 'username must be non-empty');
              }

              // Create a new user
              user = new User({
                'name' : username,
                'auths' : [digest],
                'strategies' : [strategy],
                'role' : 4,
                'about': ''
              });
              user.save(function(err, user) {
                return done(err, user);
              });
            }
          });
        } else {
          return done(err, user);
        }
      });
    }

  // Hijak the private verify method so we can fuck shit up freely
  switch (strategy) {
  case 'yahoo':
  case 'paypal':
  case 'google':
  case 'aol':
  case 'openid':
    strategyInstance._verify = verify;
    break;
  default:
    strategyInstance._verify = 
      function(token, refreshOrSecretToken, profile, done) {
        verify(profile.id, done);
      }
  }

  var authenticate = passport.authenticate(strategy, 
    function(err, user, info) {
      if (err) { return next(err); }
      if (!user) { return res.redirect('/?authfail'); }

      req.logIn(user, function(err) {
        if (err) { return next(err); }

        req.session.user = user;
        if (newstrategy) {
          return res.redirect('/auth/' + newstrategy);
        } else {
          delete req.session.username;
          return res.redirect('/');
        }
      });
  });

  authenticate(req, res, next);
}
