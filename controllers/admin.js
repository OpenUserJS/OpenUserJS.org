var Strategy = require('../models/strategy.js').Strategy;
var User = require('../models/user.js').User;
var strategies = require('./strategies.json');
var userRoles = require('../models/userRoles.json');
var loadPassport = require('../libs/passportLoader').loadPassport;
var strategyInstances = require('../libs/passportLoader').strategyInstances;
var Wait = require('../libs/wait').Wait;

function userIsAdmin(req) {
  return req.session.user && req.session.user.role < 3;
}

function getOAuthStrategies(stored) {
  var oAuthStrats = [];
  for (var i in strategies) {
    var strategy = strategies[i];
    if (strategy.oauth) {
      oAuthStrats.push(stored[i] || { 'strat' : i, 'id' : '', 'key' : ''});
    }
  }

  return oAuthStrats;
}

exports.userAdmin = function(req, res) {
  if (!userIsAdmin(req)) res.redirect('/');

  var options = {};
  User.find({}, function(req, users) {
    options.users = [];

    var i = 0;
    users.forEach(function(user) {
      var roles = [];
      userRoles.forEach(function(role, index) {
        roles.push({ 'val' : index, 'display' : role, 
          'selected' : index === user.role });
      });
      roles.reverse();

      options.users.push({ 'name' : user.name, 'roles' : roles });
    });

    res.render('userAdmin', options, res);
  });
};

exports.apiAdmin = function(req, res) {
  if (!userIsAdmin(req)) res.redirect('/');

  Strategy.find({}, function(err, strats) {
    var stored = {};
    strats.forEach(function(strat) {
      stored[strat.name] = { 'strat' : strat.name,
        'id' : strat.id, 'key' : strat.key };
    });

    var strategies = getOAuthStrategies(stored);
    var options = { 'strategies' : strategies };

    res.render('apiAdmin', options, res);
  });
};

exports.apiAdminUpdate = function(req, res) {
  if (!userIsAdmin(req)) res.redirect('/');

  var postStrats = req.body;

  // Setup a function to call once everything is done
  var wait = new Wait(function() {
    res.redirect('/admin/api');
  });

  Strategy.find({}, function(err, strats) {
    var stored = {};
    strats.forEach(function(strat) {
      stored[strat.name] = strat; 
    });

    for (var i in postStrats) {
      var postStrat = postStrats[i];
      var strategy = null;

      if (stored[i] && !postStrat[0] && !postStrat[1]) {
        stored[i].remove(wait.add(function() {
          delete strategyInstances[i]; 
        }));
        continue;
      }
      else if (postStrat[0] && postStrat[1]) {
        if (stored[i]) {
          strategy = stored[i];
          strategy.id = postStrat[0]
          strategy.key = postStrat[1];
        } else {
          strategy = new Strategy({
            'id' : postStrat[0],
            'key' : postStrat[1],
            'name' : i,
            'display' : strategies[i].name
          });
        }

        strategy.save(wait.add(function(err, strategy) {
          loadPassport(strategy);
        }));
      }
    }

    wait.done();
  });
};

exports.userAdminUpdate = function(req, res) {
  if (!userIsAdmin(req)) res.redirect('/');

  // Setup a function to call once everything is done
  var wait = new Wait(function() {
    res.redirect('/admin/user');
  });

  var users = req.body.user;
  for (var name in users) {
    var role = users[name];
    User.findOneAndUpdate({ 'name' : name }, {'role' : Number(role)},
      wait.add(function(err, user) {}));
  }

  var remove = req.body.remove || {};
  for (var name in remove) {
    User.findOneAndRemove({ 'name' : name },
      wait.add(function(err, user) {}));
  }

  wait.done();
};
