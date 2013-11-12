var User = require('../models/user').User;
var strategies = require('./strategies.json');
var prettystrategies = require('./prettyStrategies.json');

exports.home = function(req, res) {
  var options = { 'title': 'Home page' };

  if (!req.user) {
    options.strategies = [{'strat' : '', 'pretty' : ''}];
    strategies.forEach(function(strat, index) {
      options.strategies.push({ 
        'strat' : strat, 'pretty' : prettystrategies[index]});
    });
  } else {
    options.username = req.user.name;
  }

  res.render('index', options, res);
}
