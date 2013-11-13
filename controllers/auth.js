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

  switch (strategy) {
  case 'google':
  case 'yahoo':
  case 'paypla':
    requireStr += '-oauth';
    break;
  }

  var PassportStrategy = require(requireStr)[
    strategy === 'google' ? 'OAuth2Strategy' : 'Strategy'
  ];
  var instance = null;

  if (strategy === 'openid' || strategy === 'aol') {
    instance = new PassportStrategy(
      {
        returnURL: 'http://' + URL  + '/auth/' + strategy  + '/callback/',
        realm: 'http://' + URL  + '/'
      },
      dummyVerify
    );
  } else {
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
  var options = strategy === 'google' ?
    { scope: 'https://www.google.com/m8/feeds' } : {};

  function auth() {
    var authenticate = passport.authenticate(strategy, options);

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
    if (!strategy || !username) return res.redirect('/');
    auth();
  }
};

exports.callback = function(req, res, next) {
  var strategy = req.route.params.strategy;
  var username = req.session.username;
  var newstrategy = req.session.newstrategy;
  if (!strategy) return next();
  var strategyInstance = strategyInstances[strategy];
  
  // Hijak the private verify method
  strategyInstance._verify = 
    function(token, refreshOrSecretToken, profile, done) {
      strategyInstance._verify = dummyVerify;
      var shasum = crypto.createHash('sha256');
      shasum.update(String(profile.id));
      var digest = shasum.digest('hex');

      var findOption = {};
      if (req.user) {
        findOption.name = req.user.name;
      } else {
        findOption.auths = digest;
      }

      User.findOne(findOption, function (err, user) {
        if (!user) {
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
        } else if (req.user) {
          user.auths.push(digest);
          user.strategies.push(strategy);
          user.save(function(err, user) {
            return done(err, user);
          });
        } else {
          return done(err, user);
        }
      });
    }

  var authenticate = passport.authenticate(strategy, 
    function(err, user, info) {
      if (err) { return next(err); }
      if (!user) { return res.redirect('/login'); }
      req.logIn(user, function(err) {
        if (err) { return next(err); }

        if (newstrategy) {
          return res.redirect('/auth/' + newstrategy);
        } else {
          return res.redirect('/');
        }
      });
  });

  authenticate(req, res, next);
}
