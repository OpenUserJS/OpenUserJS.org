var User = require('../models/user').User;
var RepoManager = require('../libs/repoManager');
var async = require('async');
var nil = require('../libs/helpers').nil;

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
  var reponame = null;
  var repo = null;
  var repos = null;
  var scriptname = null;
  var loadable = null;

  if (!user) { return res.redirect('/login'); }

  options = { title: 'Edit Scripts', username: user.name };

  indexOfGH = user.strategies.indexOf('github');
  if (indexOfGH > -1) {
    options.hasGH = true;

    if (req.body.importScripts) {
      loadingRepos = true;
      options.showRepos = true;
      ghUserId = user.auths[indexOfGH];
      repoManager = RepoManager.getManager(ghUserId);

      repoManager.fetchRepos(function() {
        // store the vaild repos in the session to prevent hijaking
        req.session.repos = repoManager.repos;

        // convert the repos object to something mustache can use
        options.repos = repoManager.makeRepoArray();
        res.render('scriptsEdit', options, res);
      });
    } else if (req.body.loadScripts && req.session.repos) {
      loadingRepos = true;
      repos = req.session.repos;
      loadable = nil();

      for (reponame in req.body) {
        repo = req.body[reponame];

        // Load all scripts in the repo
        if (typeof repo === 'string' && reponame.substr(-4) === '_all') {
          reponame = repo;
          repo = repos[reponame];

          if (repo) {
            for (scriptname in repo) {
              if (!loadable[reponame]) { loadable[reponame] = nil(); }
              loadable[reponame][scriptname] = repo[scriptname];
            }
          }
        } else if (typeof repo === 'object') { // load individual scripts
          for (scriptname in repo) {
            if (repos[reponame][scriptname]) {
              if (!loadable[reponame]) { loadable[reponame] = nil(); }
              loadable[reponame][scriptname] = repos[reponame][scriptname];
            }
          }
        }
      }

      // Load the scripts onto the site
      RepoManager.getManager(ghUserId, loadable).loadScripts(function () {
        delete req.session.repos;
        res.redirect('/users/' + user.name);
      });
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
