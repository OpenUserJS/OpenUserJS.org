var Strategy = require('../models/strategy.js').Strategy;
var User = require('../models/user').User;
var Script = require('../models/script').Script;
var strategies = require('./strategies.json');
var scriptsList = require('../libs/modelsList');
var userRoles = require('../models/userRoles.json');

exports.home = function (req, res) {
  var user = req.session.user;

  scriptsList.listScripts({}, req.route.params, [], '',
    function (scriptsList) {
      res.render('index', {
        title: 'Home Page',
        username: user ? user.name : null,
        scriptsList: scriptsList
      }, res);
  });
}

exports.login = function (req, res) {
  var options = { 'title': 'Login' };

  if (req.session.user) { res.redirect('/'); }

  Strategy.find({}, function (err, strats) {
    var strategy = null;
    var name = null;

    // Empty option so you can just type in your username
    // when logging in
    options.strategies = [{ 'strat' : '', 'display' : '' }];

    // Get the strategies we have OAuth keys for
    strats.forEach(function (strat) {
      options.strategies.push({ 'strat' : strat.name,
                                'display' : strat.display });
    });

    // Get OpenId strategies
    for (name in strategies) {
      strategy = strategies[name];
      if (!strategy.oauth) {
        options.strategies.push({ 'strat' : name,
                                  'display' : strategy.name });
      }
    }

    res.render('login', options, res);
  });
};

exports.logout = function (req, res) {
  delete req.session.user;
  res.redirect('/');
}
