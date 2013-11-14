var Strategy = require('../models/strategy.js').Strategy;
var User = require('../models/user.js').User;
var strategies = require('./strategies.json');
var userRoles = require('../models/userRoles.json');
var loadPassport = require('../libs/passportLoader').loadPassport;
var strategyInstances = require('../libs/passportLoader').strategyInstances;
var Promise = require("bluebird");

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
  if (!userIsAdmin(req)){
    res.redirect('/');
    return;
  }

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

exports.userAdminUpdate = function(req, res) {
  if (!userIsAdmin(req)){
    res.redirect('/');
    return;
  }

  var queryPromises = [];

  var users = req.body.user;
  for (var name in users) {
    var role = users[name];
    queryPromises.push(User.findOneAndUpdate({ 'name' : name }, {'role' : Number(role)}).exec());
  }

  var remove = req.body.remove || {};
  for (var name in remove) {
    queryPromises.push(User.findOneAndRemove({ 'name' : name }).exec());
  }

  return Promise.all(queryPromises).then(function(){
    res.redirect('/admin/user');
  }).catch(function(e){
    //XXX
  });
};

exports.apiAdmin = function(req, res) {
  if (!userIsAdmin(req)){
    res.redirect('/');
    return;
  }

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
  if (!userIsAdmin(req)){
    res.redirect('/');
    return;
  }

  var postStrats = req.body;

  var tasks = [];

  Strategy.find({}).exec().then(function(strats) {
    var stored = {};
    strats.forEach(function(strat) {
      stored[strat.name] = strat;
    });

    for (var i in postStrats) {
      if(i=='__proto__')
        continue
      var postStrat = postStrats[i];
      var strategy = null;

      if (stored[i] && !postStrat[0] && !postStrat[1]) {
        tasks.push(stored[i].remove().exec().then(function() {
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

        //save doesn't have promises yet, so create one manually
        tasks.push(new Promise(function(resolve, reject){
          strategy.save(function(err){
            if(err) reject(err);
            else resolve();
          })
        }).then(function(){
          loadPassport(strategy);
        }));
      }
    }
  }).then(function(){
    Promise.all(tasks).then(function() {
      res.redirect('/admin/api');
    });
  });
};
