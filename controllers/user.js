var User = require('../models/user').User;
var RepoManager = require('../libs/repoManager');
var async = require('async');

exports.view = function (req, res, next) {
  var username = req.route.params.username;
  User.findOne({ name: username }, function (err, user) {
    if (err || !user) { next(); }

    res.render('user', { 
      title: user.name, username: user.name, about: user.about, 
      isYou: username === user.name
    }, res);
  });
}

exports.edit = function (req, res) {
  var user = req.session.user;

  if (user) {
    res.render('userEdit', { title: 'Edit Yourself', username: user.name,
      about: user.about }, res);
  } else {
    res.redirect('/login');
  }
};

exports.scripts = function (req, res) {
  var user = req.session.user;
  var indexOfGH = -1;
  var ghUserId = null;
  var repoManager = null;
  var options = null;
  var loadingRepos = false;

  if (!user) { return res.redirect('/login'); }

  options = { title: 'Edit Scripts', username: user.name };

  function render(repos) {
    async.filter(repos, function (repo, callback) {
      repo.fetchUserScripts(function() {
        callback(repo.scripts.length > 0);
      });
    }, function (repos) {
      options.repos = repos;
      res.render('scriptsEdit', options, res);
    });
  }

  indexOfGH = user.strategies.indexOf('github');
  if (indexOfGH > -1) {
    if (req.body.importScripts) {
      loadingRepos = true;
      ghUserId = user.auths[indexOfGH];
      repoManager = RepoManager.getManager(ghUserId);
      async.parallel([
        function (callback) {
          repoManager.fetchRepos(callback);
        }], render);
    } else {
      options.hasGH = true;
    }
  }

  if (!loadingRepos) { res.render('scriptsEdit', options, res); }
}

exports.update = function (req, res) {
  User.findOneAndUpdate({ _id: req.session.user._id }, 
    { about: req.body.about  },
    function (err, user) {
      if (err) { res.redirect('/'); }

      req.session.user.about = user.about;
      res.redirect('/users/' + user.name);
  });
};
