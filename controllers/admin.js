var Strategy = require('../models/strategy.js').Strategy;
var User = require('../models/user.js').User;
var Script = require('../models/script').Script;
var strategies = require('./strategies.json');
var userRoles = require('../models/userRoles.json');
var loadPassport = require('../libs/passportLoader').loadPassport;
var strategyInstances = require('../libs/passportLoader').strategyInstances;
var scriptStorage = require('./scriptStorage');
var help = require('../libs/helpers');
var async = require('async');
var nil = help.nil;

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

exports.userAdmin = function (req, res, next) {
  var options = nil();
  var thisUser = req.session.user;

  if (!userIsAdmin(req)) { return next(); }

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

      options.users.push({ 'name' : user.name, 'roles' : roles });
    });

    res.render('userAdmin', options);
  });
};

exports.userAdminUpdate = function (req, res, next) {
  var users = null;
  var thisUser = null;
  var role = null;
  var remove = null;
  var name = null;

  if (!userIsAdmin(req)) { return next(); }

  users = req.body.user;
  users = Object.keys(users).map(function (name) {
    return { name: name, role: users[name] };
  });
  thisUser = req.session.user;
  remove = req.body.remove || {};
  remove = Object.keys(remove);

  async.parallel([
    function (callback) {
      async.each(users, function (user, cb) {
        role = Number(user.role);

        if (role <= thisUser.role) { cb(); }
        User.find({ 'name' : user.name, role : { $gt: thisUser.role } }, 
          function (err, user) { user.save(cb); });
      }, callback);
    },
    function (callback) {
      async.each(remove, function (name, cb) {
        User.find({ 'name' : name, role : { $gt: thisUser.role } },
          function (err, user) {
            var authorId = user._id;
            user.remove(function (err) {
              Script.find({ _authorId: authorId }, function (err, scripts) {
                async.each(scripts, function (script, innerCb) {
                  scriptStorage.deleteScript(script.installName, innerCb);
                }, cb);
              });
            }); 
        });
      }, callback);
    }
  ],
  function (err) {
    res.redirect('/admin/user');
  });
};

exports.apiAdmin = function (req, res, next) {
  if (!userIsAdmin(req)) { return next(); }

  Strategy.find({}, function (err, strats) {
    var stored = nil();
    var strategies = null;
    var options = null;

    strats.forEach(function (strat) {
      stored[strat.name] = { 'strat' : strat.name,
        'id' : strat.id, 'key' : strat.key };
    });

    strategies = getOAuthStrategies(stored);
    options = { 'strategies' : strategies };

    res.render('apiAdmin', options);
  });
};

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
