'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var pkg = require('../package.json');

var async = require('async');
var exec = require('child_process').exec;

var Comment = require('../models/comment').Comment;
var Discussion = require('../models/discussion').Discussion;
var Flag = require('../models/flag').Flag;
var Group = require('../models/group').Group;
var Script = require('../models/script').Script;
var Strategy = require('../models/strategy').Strategy;
var User = require('../models/user').User;
var Vote = require('../models/vote').Vote;

var userRoles = require('../models/userRoles.json');
var strategies = require('./strategies.json');
var loadPassport = require('../libs/passportLoader').loadPassport;
var strategyInstances = require('../libs/passportLoader').strategyInstances;
var modelParser = require('../libs/modelParser');
var helpers = require('../libs/helpers');
var statusCodePage = require('../libs/templateHelpers').statusCodePage;
var updateSessions = require('../libs/modifySessions').update;
var nil = helpers.nil;
var pageMetadata = require('../libs/templateHelpers').pageMetadata;

// This controller is only for use by users with a role of admin or above

function userIsAdmin(aReq) {
  return aReq.session.user && aReq.session.user.role < 3;
}

function getOAuthStrategies(aStored) {
  var oAuthStrats = [];
  var strategy = null;

  for (var type in strategies) {
    strategy = strategies[type];
    if (strategy.oauth) {
      oAuthStrats.push(aStored[type] ||
        nil({
          'strat': type,
          'id': '',
          'key': ''
        }));
    }
  }

  return oAuthStrats;
}

// Allow admins to set user roles and delete users
exports.userAdmin = function (aReq, aRes, aNext) {
  var options = nil();
  var authedUser = aReq.session.user;

  if (!userIsAdmin(aReq)) { return aNext(); }

  // You can only see users with a role less than yours
  User.find({ role: { $gt: authedUser.role } }, function (aErr, aUsers) {
    options.users = [];

    aUsers.forEach(function (aUser) {
      var roles = [];
      userRoles.forEach(function (aRole, aIndex) {
        roles.push({
          'val': aIndex,
          'display': aRole,
          'selected': aIndex === aUser.role
        });
      });
      roles = roles.splice(authedUser.role + 1);
      roles.reverse();

      options.users.push({
        'id': aUser._id,
        'name': aUser.name,
        'roles': roles
      });
    });

    aRes.render('userAdmin', options);
  });
};

// View everything about a particular user
// This is mostly for debugging in production
exports.adminUserView = function (aReq, aRes, aNext) {
  var id = aReq.params.id;
  var authedUser = aReq.session.user;

  if (!userIsAdmin(aReq)) { return aNext(); }

  // Nothing fancy, just the stringified user object
  User.findOne({ '_id': id, role: { $gt: authedUser.role } },
    function (aErr, aUser) {
      if (aErr || !aUser) { return aNext(); }

      aRes.render('userAdmin', {
        user: {
          info: JSON.stringify(aUser.toObject(), null, ' ')
        }
      });
    });
};

var jsonModelMap = {
  'User': User,
  'Script': Script,
  'Group': Group,
  'Discussion': Discussion,
  'Comment': Comment,
  'Vote': Vote,
  'Flag': Flag
};
// View everything about a particular user
// This is mostly for debugging in production
exports.adminJsonView = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  var modelname = aReq.query.model;
  var id = aReq.query.id;

  //
  var options = {};

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!options.isAdmin)
    return aRes.status(403).send({ status: 403, message: 'Not an admin.' });

  var model = jsonModelMap[modelname];
  if (!model)
    return aRes.status(400).send({ status: 400, message: 'Invalid model.' });

  model.findOne({
    _id: id
  }, function (aErr, aObj) {
    if (aErr || !aObj)
      return aRes.status(404).send({ status: 404, message: 'Id doesn\'t exist.' });

    aRes.json(aObj);
  });
};

// Make changes to users listed
exports.adminUserUpdate = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  var username = aReq.params.username;

  User.findOne({
    name: username
  }, function (aErr, aUserData) {
    if (aErr || !aUserData) { return aNext(); }

    //
    var options = {};

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    if (!options.isAdmin) {
      return statusCodePage(aReq, aRes, aNext, {
        statusCode: 403,
        statusMessage: 'This page is only accessible by admins',
      });
    }

    // User
    var user = options.user = modelParser.parseUser(aUserData);
    options.isYou = authedUser && user && authedUser._id == user._id;

    //---

    if (aReq.body.role) {
      var role = Number(aReq.body.role);
      if (role <= authedUser.role) {
        return statusCodePage(aReq, aRes, aNext, {
          statusCode: 403,
          statusMessage: 'Cannot set a role equal to or higher than yourself.',
        });
      }

      aUserData.role = role;
    }

    aUserData.save(function (aErr) {
      if (aErr) {
        return statusCodePage(aReq, aRes, aNext, {
          statusMessage: aErr,
        });
      }

      // Make sure the change is reflected in the session store
      updateSessions(aReq, aUserData, function (aErr, aSess) {
        aRes.redirect(user.userPageUrl);
      });
    });
  });
};

// Landing Page for admins
exports.adminPage = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!options.isAdmin) {
    return statusCodePage(aReq, aRes, aNext, {
      statusCode: 403,
      statusMessage: 'This page is only accessible by admins',
    });
  }

  // Page metadata
  pageMetadata(options, 'Admin');

  //---
  async.parallel(tasks, function (aErr) {
    if (aErr) return aNext();
    aRes.render('pages/adminPage', options);
  });
};

// This page allows admins to set oAuth keys for the available authenticators
exports.adminApiKeysPage = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!options.isAdmin) {
    return statusCodePage(aReq, aRes, aNext, {
      statusCode: 403,
      statusMessage: 'This page is only accessible by admins',
    });
  }

  // Page metadata
  pageMetadata(options, ['Site API Keys', 'Admin']);

  //--- Tasks

  // strategyListQuery
  tasks.push(function (aCallback) {
    Strategy.find({}, function (aErr, aStrats) {
      var stored = nil();
      var strategies = null;

      aStrats.forEach(function (aStrat) {
        stored[aStrat.name] = {
          strat: aStrat.name,
          id: aStrat.id,
          key: aStrat.key
        };
      });

      strategies = getOAuthStrategies(stored);
      options.strategies = strategies;

      aCallback();
    });
  });

  //---
  async.parallel(tasks, function (aErr) {
    if (aErr) return aNext();
    aRes.render('pages/adminApiKeysPage', options);
  });
};

// View everything about current deployed `./package.json`
// This is mostly for debugging in production
exports.adminNpmPackageView = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  //
  var options = {};

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!options.isAdmin)
    return aRes.status(403).send({ status: 403, message: 'Not an admin.' });

  aRes.json(pkg);
};

// View everything about current modules for the server
// This is mostly for debugging in production
exports.adminNpmListView = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  //
  var options = {};

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!options.isAdmin)
    return aRes.status(403).send({ status: 403, message: 'Not an admin.' });

  exec('npm ls --json', function (aErr, aStdout, aStderr) {
    if (aErr) return aRes.status(501).send({ status: 501, message: 'Not implemented.' });
    aRes.json(JSON.parse(aStdout));
  });
};

// View current version of npm
// This is mostly for debugging in production
exports.adminNpmVersionView = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  //
  var options = {};

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!options.isAdmin)
    return aRes.status(403).send({ status: 403, message: 'Not an admin.' });

  exec('npm --version', function (aErr, aStdout, aStderr) {
    if (aErr) return aRes.status(501).send({ status: 501, message: 'Not implemented.' });

    aRes.set('Content-Type', 'text/plain; charset=UTF-8');
    aRes.write(aStdout + '\n');
    aRes.end();
  });
};

// Manage oAuth strategies without having to restart the server
// When new keys are added, we load the new strategy
// When keys are removed, we remove the strategy
exports.apiAdminUpdate = function (aReq, aRes, aNext) {
  var postStrats = null;

  if (!userIsAdmin(aReq)) { return aNext(); }

  postStrats = Object.keys(aReq.body).filter(function (aEl) {
    return /\[0\]$/.test(aEl);
  }).map(function (aPostStrat) {
    var strat = aPostStrat.replace(/\[0\]$/, '');
    return {
      name: strat,
      id: aReq.body[strat + '[0]'] || '',
      key: aReq.body[strat + '[1]'] || ''
    };
  });

  Strategy.find({}, function (aErr, aStrats) {
    var stored = nil();

    aStrats.forEach(function (aStrat) {
      stored[aStrat.name] = aStrat;
    });

    async.each(postStrats, function (aPostStrat, aCallback) {
      var strategy = null;
      var name = aPostStrat.name;
      var id = aPostStrat.id;
      var key = aPostStrat.key;

      if (stored[name] && !id && !key) {
        stored[name].remove(function () {
          delete strategyInstances[name];
          aCallback();
        });
        return;
      } else if (id && key) {
        if (stored[name]) {
          strategy = stored[name];
          strategy.id = id;
          strategy.key = key;
        } else {
          strategy = new Strategy({
            'id': id,
            'key': key,
            'name': name,
            'display': strategies[name].name
          });
        }

        return strategy.save(function (aErr, aStrategy) {
          loadPassport(aStrategy);
          aCallback();
        });
      }

      aCallback();
    }, function (aErr) {
      aRes.redirect('/admin/api');
    });
  });
};

// Landing Page for admins
exports.authAsUser = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  //
  var options = {};

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!options.isAdmin) {
    return statusCodePage(aReq, aRes, aNext, {
      statusCode: 403,
      statusMessage: 'This page is only accessible by admins',
    });
  }

  var username = aReq.query.username;

  if (!username) {
    return statusCodePage(aReq, aRes, aNext, {
      statusCode: 400,
      statusMessage: '<code>username</code> must be set.',
    });
  }

  // You can only see users with a role less than yours
  User.findOne({
    name: username
  }, function (aErr, aUserData) {
    if (aErr || !aUserData) { return aNext(); }

    // User
    var user = options.user = modelParser.parseUser(aUserData);

    if (authedUser.role >= user.role) {
      return statusCodePage(aReq, aRes, aNext, {
        statusCode: 403,
        statusMessage: authedUser.role == user.role
          ? 'Cannot auth as a user with the same rank.'
          : 'Cannot auth as a user with a higher rank.',
      });
    }

    aReq.session.user = user;

    aRes.redirect(user.userPageUrl);
  });
};
