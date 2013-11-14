var Strategy = require('../models/strategies.js').Strategy;
var User = require('../models/user.js').User;
var strategies = require('./strategies.json');

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

  res.render('index', options, res);
};

exports.apiAdmin = function(req, res) {
  //if (!userIsAdmin(req)) res.redirect('/');

  Strategy.find({}, function(err, strats) {
    var stored = {};
    strats.forEach(function(strat) {
      //strat.remove(function (err, product) {});
      stored[strat.name] = { 'strat' : strat.name,
        'id' : strat.id, 'key' : strat.key };
    });

    var strategies = getOAuthStrategies(stored);
    var options = { 'strategies' : strategies };

    res.render('apiAdmin', options, res);
  });
};

exports.apiAdminUpdate = function(req, res) {
  var postStrats = req.body;
  var doneCount = 0;
  function done() {
    if (!(--doneCount)) res.redirect('/admin/api');
  }

  Strategy.find({}, function(err, strats) {
    var stored = {};
    strats.forEach(function(strat) {
      stored[strat.name] = strat; 
    });

    for (var i in postStrats) {
      var postStrat = postStrats[i];
      var strategy = null;
      if (postStrat[0] && postStrat[1]) {
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

        ++doneCount;
        strategy.save(function() { return done(); });
      }
    }

    ++doneCount;
    done();
  });
};

exports.userAdminUpdate = function(req, res) {
};
