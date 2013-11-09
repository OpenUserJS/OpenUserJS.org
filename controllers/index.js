var User = require('../models/user').User;

exports.home = function(req, res) {
  var user = new User(req.session);
  res.render('index', { 'title': 'Home page', 'user': user.settings }, res);
}

exports.login = function(req, res) {
  var user = new User(req.session);
  user.login(req.body.username, req.body.password);
  res.redirect('/');
}

exports.logout = function(req, res) {
  var user = new User(req.session);
  user.logout();
  res.redirect('/');
}
