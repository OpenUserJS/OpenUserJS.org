var passport = require('passport');
var nil = require('../libs/helpers').nil;
var URL = process.env.NODE_ENV === 'production' ? 
  'openuserjs.org' : 'localhost:8080';

exports.strategyInstances = nil();

// This will load a single passport
exports.loadPassport = function(strategy) {
  var requireStr = 'passport-' + strategy.name;
  var PassportStrategy = require(requireStr).Strategy;
  var instance = null;

  if(strategy.openid) {
    instance = new PassportStrategy(
      {
        returnURL: 'http://' + URL  + '/auth/' + strategy.name + '/callback/',
        realm: 'http://' + URL  + '/',
        profile: false,
        stateless: true
      },
      function() {}
    );
  } else {
    instance = new PassportStrategy(
      {
        consumerKey: strategy.id,
        consumerSecret: strategy.key,
        clientID: strategy.id,
        clientSecret: strategy.key,
        callbackURL: 'http://' + URL  + '/auth/' + strategy.name + '/callback/'
      },
      function() {}
    );
  }

  exports.strategyInstances[strategy.name] = instance;
  passport.use(instance);
};
