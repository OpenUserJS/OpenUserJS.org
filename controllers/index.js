var Strategy = require('../models/strategy.js').Strategy;
var User = require('../models/user').User;
var strategies = require('./strategies.json');

exports.home = function (req, res) {
  var options = { 'title': 'Home page' };
  var user = req.session.user;

  if (!user) {
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

      res.render('index', options, res);
    });
  } else {
    options.username = user.name;
    res.render('index', options, res);
  }
}
