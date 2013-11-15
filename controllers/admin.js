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
  for (var type in strategies) {
    var strategy = strategies[type];
    if (strategy.oauth) {
      oAuthStrats.push(stored[type] ||
        nil({ 'strat' : type, 'id' : '', 'key' : ''}));
    }
  }

  return oAuthStrats;
}

exports.userAdmin = function(req, res, next) {
  if (!userIsAdmin(req)) return next();

  var options = nil();
  var thisUser = req.session.user;
  User.find({ role : { $gt: thisUser.role } }, function(err, users) {
    options.users = [];

    var i = 0;
    users.forEach(function(user) {
      var roles = [];
      userRoles.forEach(function(role, index) {
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

exports.userAdminUpdate = function(req, res, next) {
  if (!userIsAdmin(req)) return next();

  var wait = new Wait(function() {
    res.redirect('/admin/user');
  });

  var users = req.body.user;
  var thisUser = req.session.user;
  for (var name in users) {
    var role = Number(users[name]);

    if (role <= thisUser.role) { continue; }
    User.findOneAndUpdate({ 'name' : name, 
      role : { $gt: thisUser.role } }, {'role' : role}, wait.add());
  }

  var remove = req.body.remove || {};
  for (var name in remove) {
   User.findOneAndRemove({ 'name' : name,
     role : { $gt: thisUser.role } }, wait.add());
  }
};

exports.apiAdmin = function(req, res, next) {
  if (!userIsAdmin(req)) return next();

  Strategy.find({}, function(err, strats) {
    var stored = nil();
    strats.forEach(function(strat) {
      stored[strat.name] = { 'strat' : strat.name,
        'id' : strat.id, 'key' : strat.key };
    });

    var strategies = getOAuthStrategies(stored);
    var options = { 'strategies' : strategies };

    res.render('apiAdmin', options, res);
  });
};

exports.apiAdminUpdate = function(req, res, next) {
  if (!userIsAdmin(req)) return next();

  var postStrats = req.body;
  var wait = new Wait(function() {
    res.redirect('/admin/api');
  });

  Strategy.find({}, function(err, strats) {
    var stored = nil();
    strats.forEach(function(strat) {
      stored[strat.name] = strat;
    });

    forIn(postStrats, function(postStrat, name) {
      var strategy = null;

      if (stored[name] && !postStrat[0] && !postStrat[1]) {
        stored[name].remove(wait.add(function() {
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

        
        strategy.save(wait.add(function(err, strategy) {
          loadPassport(strategy);
        }));
      }
    });

    wait.done();
  });
};
