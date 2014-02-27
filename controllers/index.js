var Strategy = require('../models/strategy.js').Strategy;
var User = require('../models/user').User;
var Script = require('../models/script').Script;
var strategies = require('./strategies.json');
var scriptsList = require('../libs/modelsList');

// Temporary code to set new author value on scripts
// Will be removed once deployed in production
Script.find({}, function (err, scripts) {
  scripts.forEach(function (script) {
    User.findOne({ _id : script._authorId }, function (err, user) {
      script.author = user.name;
      script.save(function (err, script) {});
    });
  });
});

exports.home = function (req, res) {
  var options = { 'title': 'Home page' };
  var user = req.session.user;
  
  if (user) {
    options.username = user.name;
  }

  scriptsList.listScripts({}, req.route.params, [], '',
    function (scriptsList) {
      res.render('index', {
        title: 'Home Page',
        username: user ? user.name : null,
        scriptsList: scriptsList
      }, res);
  });
  //res.render('index', options, res);
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
