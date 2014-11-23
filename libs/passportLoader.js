'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var passport = require('passport');

var nil = require('../libs/helpers').nil;

var config = require('../config');

exports.strategyInstances = nil();

// This will load a single passport
// Notice it is general so it can load any passport strategy
exports.loadPassport = function (aStrategy) {
  var requireStr = 'passport-' + aStrategy.name;
  var PassportStrategy = require(requireStr).Strategy;
  var instance = null;

  if (aStrategy.openid) {
    instance = new PassportStrategy(
      {
        returnURL: config.authCallbackBaseUrl + '/auth/' + aStrategy.name + '/callback/',
        realm: config.authCallbackBaseUrl + '/',
        audience: config.authCallbackBaseUrl,
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
        callbackURL: config.authCallbackBaseUrl + '/auth/' + aStrategy.name + '/callback/'
      },
      function () { } // we replace this callback later (_verify)
    );
  }

  exports.strategyInstances[aStrategy.name] = instance;
  passport.use(instance);
};
