var passport = require('passport');
var crypto = require('crypto');
var consumer = require('./consumer.json');
var strategies = require('./strategies');
var User = require('../models/user').User;

passport.serializeUser(function(user, done) {
  done(null, user._id);
});

passport.deserializeUser(function(id, done) {
  User.findOne(id, function (err, user) {
    done(err, user);
  });
});

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

  if (strategy === 'openid' || strategy === 'aol') {
    passport.use(new PassportStrategy(
      {
        returnURL: 'http://localhost:8080/auth/' + strategy  + '/callback',
        realm: 'http://localhost:8080/'
      },
      function(identifier, done) {
        User.findByOpenID({ openId: identifier }, function (err, user) {
          return done(err, user);
        });
      }
    ));
  } else {
    passport.use(new PassportStrategy(
      {
        consumerKey: consumer.keys[strategy],
        consumerSecret: consumer.secrets[strategy],
        clientID: consumer.keys[strategy],
        clientSecret: consumer.secrets[strategy],
        callbackURL: 'http://localhost:8080/auth/' + strategy  + '/callback'
      },
      function(token, refreshOrSecretToken, profile, done) {
        var shasum = crypto.createHash('sha256');
        shasum.update(String(profile.id));
        var digest = shasum.digest('hex');
        User.find({ 'auths' : digest }, function (err, user) {
          if (!user || user.length === 0) {
            user = new User({
              'name' : '',
              'auths' : [digest],
              'strategies' : [strategy],
              'role' : 4,
              'about': ''
            });
            user.save(function(err, user){
              return done(err, user);
            });
          } else {
            /*user.forEach(function(user) {
              user.remove(function (err, user) {
                User.findById(user._id, function (){});
              });
            }); return done('resetting');*/
            //User.remove({strategies: 'facebook'}, function(err, user) {});
            console.log(user.length);
            return done(err, user[0]);
          }
        });
      }
    ));
  }
});

exports.auth = function(req, res, next) {
  var strategy = req.route.params.strategy;
  if (!strategy) next();
  var options = strategy === 'google' ?
    { scope: 'https://www.google.com/m8/feeds' } : {};
  var authenticate = passport.authenticate(strategy, options);

  // Just in case some dumbass tries a bad /auth/* url
  try {
    authenticate(req, res);
  } catch (e) {
    next();
  }
};

exports.callback = function(req, res, next) {
  var strategy = req.route.params.strategy;
  if (!strategy) next();

  var authenticate = passport.authenticate(strategy, function(err, user, info) {
    if (err) { return next(err); }
    if (!user) { return res.redirect('/authfail'); }
    User.findByIdAndUpdate(user._id, { 'name' : req.session.username },
      function (err, user) {
        delete req.session.username;
        req.logIn(user, function(err) {
          if (err) { return next(err); }
          return res.redirect('/');
        });
    });
  });

  try {
    authenticate(req, res, next);
  } catch (e) {
    next();
  }
}
