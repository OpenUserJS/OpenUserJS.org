var passport = require('passport');
var nil = require('../libs/helpers').nil;
var URL = process.env.NODE_ENV === 'production' ? 
  'https://openuserjs.org' : 'http://localhost:' + (process.env.PORT || 8080);

exports.strategyInstances = nil();

// This will load a single passport
exports.loadPassport = function (strategy) {
  var requireStr = 'passport-' + strategy.name;
  var PassportStrategy = require(requireStr).Strategy;
  var instance = null;

  if (strategy.openid) {
    instance = new PassportStrategy(
      {
        returnURL: URL  + '/auth/' + strategy.name + '/callback/',
        realm: URL  + '/',
        profile: false,
        stateless: true
      },
      function () {} // we replace this call back later (_verify)
    );
  } else {
    instance = new PassportStrategy(
      {
        consumerKey: strategy.id,
        consumerSecret: strategy.key,
        clientID: strategy.id,
        clientSecret: strategy.key,
        state: 'a bullshit string reddit requires',
        callbackURL: URL  + '/auth/' + strategy.name + '/callback/'
      },
      function () {} // we replace this call back later (_verify)
    );
  }

  exports.strategyInstances[strategy.name] = instance;
  passport.use(instance);
};
