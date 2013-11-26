var User = require('../models/user').User;
var RepoManager = require('../libs/repoManager');
var async = require('async');

exports.view = function (username, req, res, next) {
  console.log(username);
  User.findOne({ name: username }, function (err, user) {
    if (err || !user) { next(); }

    res.render('user', { 
      title: user.name, username: user.name, about: user.about 
    }, res);
  });
}

exports.edit = function (req, res) {
  var user = req.session.user;
  var indexOfGH = -1;
  var ghUserId = null;
  var repoManager = null;

  function render(repos) {
    async.filter(repos, function (repo, callback) {
      repo.fetchUserScripts(function() {
        callback(repo.scripts.length > 0);
      });
    }, function (repos) {
      res.render('userEdit', {
        title: 'Edit Yourself', about: user.about, repos: repos
      }, res);
    });
  }

  if (user) {
    indexOfGH = user.strategies.indexOf('github');
    if (indexOfGH > -1) {
      ghUserId = user.auths[indexOfGH];
      repoManager = RepoManager.getManager(ghUserId);
      async.parallel([
        function (callback) {
          repoManager.fetchRepos(callback);
      }], render);
    }
  } else {
    res.redirect('/');
  }
};

exports.update = function (req, res) {
  User.findOneAndUpdate({ _id: req.session.user._id }, 
    { about: req.body.about  },
    function (err, user) {
      if (err) { res.redirect('/'); }

      req.session.user.about = user.about;
      res.redirect('/users/' + user.name);
  });
};
