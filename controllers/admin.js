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

  Promise.cast(Strategy.find({}).exec()).then(function(strats) {
    var stored = {};
    strats.forEach(function(strat) {
      stored[strat.name] = strat;
    });

    for (var name in postStrats) {
      if(!Object.hasOwnProperty.call(postStrats, name) || name=='__proto__')
        continue;
      var postStrat = postStrats[name];
      var strategy = null;

      if (stored[name] && !postStrat[0] && !postStrat[1]) {
        tasks.push(stored[name].remove().exec().then(function() {
          delete strategyInstances[name];
        }));
        continue;
      }else if (postStrat[0] && postStrat[1]) {
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

        //save doesn't have promises yet, so create one manually
        //create new scope for strategy
        tasks.push((function(strategy){
          Promise.promisify(strategy.save.bind(strategy))().then(
            function(){
              loadPassport(strategy);
            });
        })(strategy));
      }
    }
  }).then(function(){
    Promise.all(tasks).then(function() {
      res.redirect('/admin/api');
    });
  });
};
