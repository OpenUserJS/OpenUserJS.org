var User = require('../models/user').User;
var strategies = require('./strategies.json');

exports.home = function(req, res) {
  var options = { 'title': 'Home page' };
  var user = req.session.user;

  if (!user) {
    /*options.strategies = [{'strat' : '', 'pretty' : ''}];
    strategies.forEach(function(strat, index) {
      options.strategies.push({ 
        'strat' : strat, 'pretty' : prettystrategies[index]});
    });*/
  } else {
    options.username = user.name;
  }

  res.render('index', options, res);
}
