var async = require('async');

var User = require('../models/user.js').User;
var Script = require('../models/script').Script;
var Strategy = require('../models/strategy.js').Strategy;

var userRoles = require('../models/userRoles.json');
var strategies = require('./strategies.json');
var loadPassport = require('../libs/passportLoader').loadPassport;
var strategyInstances = require('../libs/passportLoader').strategyInstances;
var scriptStorage = require('./scriptStorage');
var modelParser = require('../libs/modelParser');
var helpers = require('../libs/helpers');
var statusCodePage = require('../libs/templateHelpers').statusCodePage;
var nil = helpers.nil;

// This controller is only for use by users with a role of admin or above

function userIsAdmin(req) {
  return req.session.user && req.session.user.role < 3;
}

function getOAuthStrategies(stored) {
  var oAuthStrats = [];
  var strategy = null;

  for (var type in strategies) {
    strategy = strategies[type];
    if (strategy.oauth) {
      oAuthStrats.push(stored[type] ||
        nil({ 'strat' : type, 'id' : '', 'key' : ''}));
    }
  }

  return oAuthStrats;
}

// Allow admins to set user roles and delete users
exports.userAdmin = function (req, res, next) {
  var options = nil();
  var thisUser = req.session.user;

  if (!userIsAdmin(req)) { return next(); }

  // You can only see users with a role less than yours
  User.find({ role : { $gt: thisUser.role } }, function (err, users) {
    var i = 0;
    options.users = [];

    users.forEach(function (user) {
      var roles = [];
      userRoles.forEach(function (role, index) {
        roles.push({ 'val' : index, 'display' : role,
          'selected' : index === user.role });
      });
      roles = roles.splice(thisUser.role + 1);
      roles.reverse();

      options.users.push({ 'id' : user._id, 'name' : user.name,
        'roles' : roles });
    });

    res.render('userAdmin', options);
  });
};

// View everything about a particular user
// This is mostly for debugging in production
exports.adminUserView = function (req, res, next) {
  var id = req.route.params.id;
  var thisUser = req.session.user;

  if (!userIsAdmin(req)) { return next(); }

  // Nothing fancy, just the stringified user object
  User.findOne({ '_id' : id, role : { $gt: thisUser.role } },
    function (err, user) {
      if (err || !user) { return next(); }

      res.render('userAdmin', { user: {
        info: JSON.stringify(user.toObject(), null, ' ') } });
  });
};

// Make changes to users listed
exports.adminUserUpdate = function (req, res, next) {
  var authedUser = req.session.user;

  var username = req.route.params.username;

  User.findOne({
    name: username
  }, function (err, userData) {
    if (err || !userData) { return next(); }

    //
    var options = {};
    var tasks = [];

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    if (!options.isAdmin) {
      return statusCodePage(req, res, next, {
        statusCode: 403,
        statusMessage: 'This page is only accessible by admins',
      });
    }

    // User
    var user = options.user = modelParser.parseUser(userData);
    options.isYou = authedUser && user && authedUser._id == user._id;

    //---

    if (req.body.role) {
      var role = Number(req.body.role);
      if (role <= authedUser.role) {
        return statusCodePage(req, res, next, {
          statusCode: 403,
          statusMessage: 'Cannot set a role equal to or higher than yourself.',
        });
      }

      userData.role = role;
    }

    userData.save(function(err) {
      if (err) {
        return statusCodePage(req, res, next, {
          statusMessage: err,
        });
      }

      res.redirect(user.userPageUrl);
    });
  });
};

// Landing Page for admins
exports.adminPage = function (req, res, next) {
  var authedUser = req.session.user;

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!options.isAdmin) {
    return statusCodePage(req, res, next, {
      statusCode: 403,
      statusMessage: 'This page is only accessible by admins',
    });
  }

  // Metadata
  options.title = 'Admin | OpenUserJS.org';
  options.pageMetaDescription = null;
  options.pageMetaKeywords = null;

  //---
  async.parallel(tasks, function(err){
    if (err) return next();
    res.render('pages/adminPage', options);
  });
};

// This page allows admins to set oAuth keys for the available authenticators
exports.adminApiKeysPage = function (req, res, next) {
  var authedUser = req.session.user;

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!options.isAdmin) {
    return statusCodePage(req, res, next, {
      statusCode: 403,
      statusMessage: 'This page is only accessible by admins',
    });
  }

  // Metadata
  options.title = 'Admin: API Keys | OpenUserJS.org';
  options.pageMetaDescription = null;
  options.pageMetaKeywords = null;

  //--- Tasks

  // strategyListQuery
  tasks.push(function(callback){
    Strategy.find({}, function (err, strats) {
      var stored = nil();
      var strategies = null;

      strats.forEach(function (strat) {
        stored[strat.name] = {
          strat: strat.name,
          id: strat.id,
          key: strat.key
        };
      });

      strategies = getOAuthStrategies(stored);
      options.strategies = strategies;

      callback();
    });
  });

  //---
  async.parallel(tasks, function(err){
    if (err) return next();
    res.render('pages/adminApiKeysPage', options);
  });
};

// Manage oAuth strategies without having to restart the server
// When new keys are added, we load the new strategy
// When keys are removed, we remove the strategy
exports.apiAdminUpdate = function (req, res, next) {
  var postStrats = null;

  if (!userIsAdmin(req)) { return next(); }

  postStrats = Object.keys(req.body).map(function (postStrat) {
    var values = req.body[postStrat];
    return { name: postStrat, id: values[0], key: values[1] }
  });

  Strategy.find({}, function (err, strats) {
    var stored = nil();

    strats.forEach(function(strat) {
      stored[strat.name] = strat;
    });
    async.each(postStrats, function (postStrat, cb) {
      var strategy = null;
      var name = postStrat.name;
      var id = postStrat.id;
      var key = postStrat.key;

      if (stored[name] && !id && !key) {
        stored[name].remove(function () {
          delete strategyInstances[name];
          cb();
        });
        return;
      } else if (id && key) {
        if (stored[name]) {
          strategy = stored[name];
          strategy.id = id;
          strategy.key = key;
        } else {
          strategy = new Strategy({
            'id' : id,
            'key' : key,
            'name' : name,
            'display' : strategies[name].name
          });
        }


        return strategy.save(function (err, strategy) {
          loadPassport(strategy);
          cb();
        });
      }

      cb();
    }, function (err) {
      res.redirect('/admin/api');
    });
  });
};
