var passport = require('passport');

var nil = require('../libs/helpers').nil;

var AUTH_CALLBACK_BASE_URL = 'http://localhost:' + (process.env.PORT || 8080);
if (process.env.NODE_ENV === 'production')
  AUTH_CALLBACK_BASE_URL = 'https://openuserjs.org';
if (process.env.AUTH_CALLBACK_BASE_URL)
  AUTH_CALLBACK_BASE_URL = process.env.AUTH_CALLBACK_BASE_URL;

exports.strategyInstances = nil();

// This will load a single passport
// Notice it is general so it can load any passport strategy
exports.loadPassport = function (strategy) {
  var requireStr = 'passport-' + strategy.name;
  var PassportStrategy = require(requireStr).Strategy;
  var instance = null;

  if (strategy.openid) {
    instance = new PassportStrategy(
      {
        returnURL: AUTH_CALLBACK_BASE_URL + '/auth/' + strategy.name + '/callback/',
        realm: AUTH_CALLBACK_BASE_URL + '/',
        audience: AUTH_CALLBACK_BASE_URL,
        profile: false,
        stateless: true
      },
      function () { } // we replace this callback later (_verify)
    );
  } else {
    instance = new PassportStrategy(
      {
        consumerKey: strategy.id,
        consumerSecret: strategy.key,
        clientID: strategy.id,
        clientSecret: strategy.key,
        state: 'a bullshit string reddit requires',
        callbackURL: AUTH_CALLBACK_BASE_URL + '/auth/' + strategy.name + '/callback/'
      },
      function () { } // we replace this callback later (_verify)
    );
  }

  exports.strategyInstances[strategy.name] = instance;
  passport.use(instance);
};
