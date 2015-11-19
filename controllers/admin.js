'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//

//--- Dependency inclusions
var async = require('async');
var exec = require('child_process').exec;

//--- Model inclusions
var Comment = require('../models/comment').Comment;
var Discussion = require('../models/discussion').Discussion;
var Flag = require('../models/flag').Flag;
var Group = require('../models/group').Group;
var Script = require('../models/script').Script;
var Strategy = require('../models/strategy').Strategy;
var User = require('../models/user').User;
var Vote = require('../models/vote').Vote;

//--- Controller inclusions

//--- Library inclusions
// var adminLib = require('../libs/admin');

var modelParser = require('../libs/modelParser');

var nil = require('../libs/helpers').nil;

var loadPassport = require('../libs/passportLoader').loadPassport;
var strategyInstances = require('../libs/passportLoader').strategyInstances;
var statusCodePage = require('../libs/templateHelpers').statusCodePage;
var updateSessions = require('../libs/modifySessions').update;
var pageMetadata = require('../libs/templateHelpers').pageMetadata;

//--- Configuration inclusions
var pkg = require('../package.json');
var userRoles = require('../models/userRoles.json');
var strategies = require('./strategies.json');

//---

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

// View everything about a particular user
// This is mostly for debugging in production
exports.adminUserView = function (aReq, aRes, aNext) {
  var id = aReq.params.id;
  var authedUser = aReq.session.user;

  if (!userIsAdmin(aReq)) {
    aNext();
    return;
  }

  // Nothing fancy, just the stringified user object
  User.findOne({ '_id': id, role: { $gt: authedUser.role } },
    function (aErr, aUser) {
      if (aErr || !aUser) {
        aNext();
        return;
      }

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
  //
  var authedUser = aReq.session.user;
  var modelname = aReq.query.model;
  var id = aReq.query.id;

  if (!userIsAdmin(aReq)) {
    aRes.status(403).send({ status: 403, message: 'Not an admin.' });
    return;
  }

  var model = jsonModelMap[modelname];
  if (!model) {
    aRes.status(400).send({ status: 400, message: 'Invalid model.' });
    return;
  }

  model.findOne({
    _id: id
  }, function (aErr, aObj) {
    if (aErr || !aObj) {
      aRes.status(404).send({ status: 404, message: 'Id doesn\'t exist.' });
      return;
    }

    aRes.json(aObj);
  });
};

// Make changes to users listed
exports.adminUserUpdate = function (aReq, aRes, aNext) {
  var username = aReq.params.username;

  User.findOne({
    name: username
  }, function (aErr, aUser) {
    if (aErr || !aUser) {
      aNext();
      return;
    }

    //
    var options = {};
    var authedUser = aReq.session.user;
    var user = null;
    var role = null;

    // Session
    options.authedUser = authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    if (!options.isAdmin) {
      statusCodePage(aReq, aRes, aNext, {
        statusCode: 403,
        statusMessage: 'This page is only accessible by admins',
      });
      return;
    }

    // User
    options.user = user = modelParser.parseUser(aUser);
    options.isYou = authedUser && user && authedUser._id == user._id;

    //---

    if (aReq.body.role) {
      role = Number(aReq.body.role);
      if (role <= authedUser.role) {
        statusCodePage(aReq, aRes, aNext, {
          statusCode: 403,
          statusMessage: 'Cannot set a role equal to or higher than yourself.',
        });
        return;
      }

      aUser.role = role;
    }

    aUser.save(function (aErr) {
      if (aErr) {
        statusCodePage(aReq, aRes, aNext, {
          statusMessage: aErr,
        });
        return;
      }

      // Make sure the change is reflected in the session store
      updateSessions(aReq, aUser, function (aErr, aSess) {
        aRes.redirect(user.userPageUrl);
      });
    });
  });
};

// Landing Page for admins
exports.adminPage = function (aReq, aRes, aNext) {
  function preRender() {
  }

  function render() {
    aRes.render('pages/adminPage', options);
  }

  function asyncComplete(aErr) {
    if (aErr) {
      aNext();
      return;
    }

    preRender();
    render();
  }

  //
  var options = {};
  var authedUser = aReq.session.user;
  var tasks = [];

  // Session
  options.authedUser = authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!options.isAdmin) {
    statusCodePage(aReq, aRes, aNext, {
      statusCode: 403,
      statusMessage: 'This page is only accessible by admins',
    });
    return;
  }

  // Page metadata
  pageMetadata(options, 'Admin');

  //---
  async.parallel(tasks, asyncComplete);
};

// This page allows admins to set oAuth keys for the available authenticators
exports.adminApiKeysPage = function (aReq, aRes, aNext) {
  function preRender() {
  }

  function render() {
    aRes.render('pages/adminApiKeysPage', options);
  }

  function asyncComplete(aErr) {
    if (aErr) {
      aNext();
      return;
    }

    preRender();
    render();
  }

  //
  var options = {};
  var authedUser = aReq.session.user;
  var tasks = [];

  // Session
  options.authedUser = authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!options.isAdmin) {
    statusCodePage(aReq, aRes, aNext, {
      statusCode: 403,
      statusMessage: 'This page is only accessible by admins',
    });
    return;
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
  async.parallel(tasks, asyncComplete);
};

// View everything about current deployed `./package.json`
// This is mostly for debugging in production
exports.adminNpmPackageView = function (aReq, aRes, aNext) {
  //

  if (!userIsAdmin(aReq)) {
    aRes.status(403).send({ status: 403, message: 'Not an admin.' });
    return;
  }

  aRes.json(pkg);
};

// View everything about current modules for the server
// This is mostly for debugging in production
exports.adminNpmListView = function (aReq, aRes, aNext) {
  //

  if (!userIsAdmin(aReq)) {
    aRes.status(403).send({ status: 403, message: 'Not an admin.' });
    return;
  }

  exec('npm ls --json', function (aErr, aStdout, aStderr) {
    if (aErr) {
      console.warn(aErr);
    }

    try {
      aRes.json(JSON.parse(aStdout));
    } catch (aE) {
      aRes.status(520).send({ status: 520, message: 'Unknown error.' });
    }
  });
};

// View current version of npm
// This is mostly for debugging in production
exports.adminNpmVersionView = function (aReq, aRes, aNext) {
  //

  if (!userIsAdmin(aReq)) {
    aRes.status(403).send({ status: 403, message: 'Not an admin.' });
    return;
  }

  exec('npm --version', function (aErr, aStdout, aStderr) {
    if (aErr) {
      aRes.status(501).send({ status: 501, message: 'Not implemented.' });
      return;
    }

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

  if (!userIsAdmin(aReq)) {
    aNext();
    return;
  }

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

        strategy.save(function (aErr, aStrategy) {
          loadPassport(aStrategy);
          aCallback();
        });

        return;
      }

      aCallback();
    }, function (aErr) {
      aRes.redirect('/admin/api');
    });
  });
};

// Landing Page for admins
exports.authAsUser = function (aReq, aRes, aNext) {
  //
  var options = {};
  var authedUser = aReq.session.user;
  var username = null;

  // Session
  options.authedUser = authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!options.isAdmin) {
    statusCodePage(aReq, aRes, aNext, {
      statusCode: 403,
      statusMessage: 'This page is only accessible by admins',
    });
    return;
  }

  username = aReq.query.username;

  if (!username) {
    statusCodePage(aReq, aRes, aNext, {
      statusCode: 400,
      statusMessage: '<code>username</code> must be set.',
    });
    return;
  }

  // You can only see users with a role less than yours
  User.findOne({
    name: username
  }, function (aErr, aUser) {
    var user = null;

    if (aErr || !aUser) {
      aNext();
      return;
    }

    // User
    options.user = user = modelParser.parseUser(aUser);

    if (authedUser.role >= user.role) {
      statusCodePage(aReq, aRes, aNext, {
        statusCode: 403,
        statusMessage: authedUser.role == user.role
          ? 'Cannot auth as a user with the same rank.'
          : 'Cannot auth as a user with a higher rank.',
      });
      return;
    }

    aReq.session.user = user;

    aRes.redirect(encodeURI(user.userPageUrl)); // NOTE: Watchpoint
  });
};
