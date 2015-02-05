'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var passport = require('passport');

var nil = require('../libs/helpers').nil;

var AUTH_CALLBACK_BASE_URL = 'http://localhost:' + (process.env.PORT || 8080);
if (isPro)
  AUTH_CALLBACK_BASE_URL = 'https://openuserjs.org';
if (process.env.AUTH_CALLBACK_BASE_URL)
  AUTH_CALLBACK_BASE_URL = process.env.AUTH_CALLBACK_BASE_URL;

exports.strategyInstances = nil();

// This will load a single passport
// Notice it is general so it can load any passport strategy
exports.loadPassport = function (aStrategy) {
  var requireStr = 'passport-' + aStrategy.name
    + (aStrategy.name === 'google' ? '-oauth' : '');
  var PassportStrategy = require(requireStr)[
    aStrategy.name === 'google' ? 'OAuth2Strategy' : 'Strategy'];
  var instance = null;
  var authParams = null;

  if (aStrategy.openid) {
    instance = new PassportStrategy(
      {
        returnURL: AUTH_CALLBACK_BASE_URL + '/auth/' + aStrategy.name + '/callback/',
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
        consumerKey: aStrategy.id,
        consumerSecret: aStrategy.key,
        clientID: aStrategy.id,
        clientSecret: aStrategy.key,
        state: 'a bullshit string reddit requires',
        callbackURL: AUTH_CALLBACK_BASE_URL + '/auth/' + aStrategy.name + '/callback/'
      },
      function () { } // we replace this callback later (_verify)
    );
  }

  if (aStrategy.name === 'google') {
    authParams = instance.authorizationParams;
    instance.authorizationParams = function() {
      var val = authParams.apply(this, arguments);
      val['openid.realm'] = AUTH_CALLBACK_BASE_URL + '/';
      return val;
    };
  }

  exports.strategyInstances[aStrategy.name] = instance;
  passport.use(instance);
};
