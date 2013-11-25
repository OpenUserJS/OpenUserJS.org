var Strategy = require('../models/strategy.js').Strategy;
var User = require('../models/user.js').User;
var strategies = require('./strategies.json');
var userRoles = require('../models/userRoles.json');
var loadPassport = require('../libs/passportLoader').loadPassport;
var strategyInstances = require('../libs/passportLoader').strategyInstances;
var help = require('../libs/helpers');
var nil = help.nil;
var forIn = help.forIn;
var Wait = help.Wait;

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

  if (!userIsAdmin(req)) return next();

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

    res.render('userAdmin', options, res);
  });
};

exports.userAdminUpdate = function (req, res, next) {
  var wait = new Wait(function() {
    res.redirect('/admin/user');
  });
  var users = null;
  var thisUser = null;
  var role = null;
  var remove = null;
  var name = null;

  if (!userIsAdmin(req)) return next();

  users = req.body.user;
  thisUser = req.session.user;
  for (name in users) {
    role = Number(users[name]);

    if (role <= thisUser.role) { continue; }
    User.findOneAndUpdate({ 'name' : name, 
      role : { $gt: thisUser.role } }, {'role' : role}, wait.add());
  }

  remove = req.body.remove || {};
  for (name in remove) {
   User.findOneAndRemove({ 'name' : name,
     role : { $gt: thisUser.role } }, wait.add());
  }
};

exports.apiAdmin = function (req, res, next) {
  if (!userIsAdmin(req)) return next();

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

    res.render('apiAdmin', options, res);
  });
};

exports.apiAdminUpdate = function (req, res, next) {
  var wait = new Wait(function () {
    res.redirect('/admin/api');
  });
  var postStrats = null;

  if (!userIsAdmin(req)) return next();

  postStrats = req.body;
  Strategy.find({}, function (err, strats) {
    var stored = nil();

    strats.forEach(function(strat) {
      stored[strat.name] = strat;
    });

    forIn(postStrats, function (postStrat, name) {
      var strategy = null;

      if (stored[name] && !postStrat[0] && !postStrat[1]) {
        stored[name].remove(wait.add(function () {
          delete strategyInstances[name];
        }));
        return;
      } else if (postStrat[0] && postStrat[1]) {
        if (stored[name]) {
          strategy = stored[name];
          strategy.id = postStrat[0]
          strategy.key = postStrat[1];
        } else {
          strategy = new Strategy({
            'id' : postStrat[0],
            'key' : postStrat[1],
            'name' : name,
            'display' : strategies[name].name
          });
        }

        
        strategy.save(wait.add(function (err, strategy) {
          loadPassport(strategy);
        }));
      }
    });

    wait.done();
  });
};
