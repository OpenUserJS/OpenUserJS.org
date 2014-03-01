var fs = require('fs');
var formidable = require('formidable');
var scriptStorage = require('./scriptStorage');
var User = require('../models/user').User;
var Script = require('../models/script').Script;
var RepoManager = require('../libs/repoManager');
var scriptsList = require('../libs/modelsList');
var async = require('async');
var nil = require('../libs/helpers').nil;
var cleanFilename = require('../libs/helpers').cleanFilename;

exports.view = function (req, res, next) {
  var username = req.route.params.shift();
  var thisUser = req.session.user;

  User.findOne({ name: username }, function (err, user) {
    if (err || !user) { return next(); }

    scriptsList.listScripts({ _authorId: user._id },
      req.route.params, ['author'], '/users/' + username,
      function (scriptsList) {
        res.render('user', { 
          title: user.name,
          name: user.name,
          about: user.about, 
          isYou: thisUser && thisUser.name === user.name,
          scriptsList: scriptsList
      }, res);
    });
  });
}

exports.edit = function (req, res) {
  var user = req.session.user;

  if (!user) { return res.redirect('/login'); }

  scriptsList.listScripts({ _authorId: user._id },
  { size: -1 }, ['author'], '/user/edit',
    function (scriptsList) {
      scriptsList.edit = true;
      res.render('userEdit', { 
        title: 'Edit Yourself',
        name: user.name,
        about: user.about, 
        scriptsList: scriptsList
      }, res);
  });
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
  var form = null;

  if (!user) { return res.redirect('/login'); }

  // TODO: Organize this code
  if (/multipart\/form-data/.test(req.headers['content-type'])) {
    form = new formidable.IncomingForm();
    form.parse(req, function (err, fields, files) {
      var script = files.script;
      var stream = null;
      var bufs = [];

      // Reject non-js and huge files
      if (script.type !== 'application/javascript' && 
          script.size > 500000) { return res.redirect('/user/edit/scripts'); }

      stream = fs.createReadStream(script.path);
      stream.on('data', function (d) { bufs.push(d); });

      // Pardon the depth
      stream.on('end', function () {
        User.findOne({ _id: user._id }, function (err, user) {
          scriptStorage.getMeta(bufs, function (meta) {
            scriptStorage.storeScript(user, meta, Buffer.concat(bufs),
              function(script) {
                res.redirect('/users/' + user.name);
            });
          });
        });
      });
    });
    return;
  }

  options = { title: 'Edit Scripts', username: user.name };

  indexOfGH = user.strategies.indexOf('github');
  if (indexOfGH > -1) {
    options.hasGH = true;

    if (req.body.importScripts) {
      loadingRepos = true;
      options.showRepos = true;
      ghUserId = user.auths[indexOfGH];

      User.findOne({ _id: user._id }, function (err, user) {
        repoManager = RepoManager.getManager(ghUserId, user);

        repoManager.fetchRepos(function() {
          // store the vaild repos in the session to prevent hijaking
          req.session.repos = repoManager.repos;

          // convert the repos object to something mustache can use
          options.repos = repoManager.makeRepoArray();
          res.render('scriptsEdit', options, res);
        });
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

      User.findOne({ _id: user._id }, function (err, user) {
        // Load the scripts onto the site
        RepoManager.getManager(ghUserId, user, loadable).loadScripts(
          function () {
            delete req.session.repos;
            res.redirect('/users/' + user.name);
        });
      });
    }
  }

  if (!loadingRepos) { res.render('scriptsEdit', options, res); }
}

exports.update = function (req, res) {
  var user = req.session.user;
  var scriptUrls = req.body.urls ? Object.keys(req.body.urls) : '';
  var installRegex = null;
  var installNames = [];
  var username = cleanFilename(user.name).toLowerCase();

  if (!user) { return res.redirect('/login'); }

  if (req.body.about) {
    User.findOneAndUpdate({ _id: user._id }, 
      { about: req.body.about  },
      function (err, user) {
        if (err) { res.redirect('/'); }

        req.session.user.about = user.about;
        res.redirect('/users/' + user.name);
    });
  } else {
    installRegex = new RegExp('^\/install\/(' + username + '\/.+)$');
    scriptUrls.forEach(function (url) {
      var matches = installRegex.exec(url);
      if (matches && matches[1]) { installNames.push(matches[1]); }
    });
    async.each(installNames, scriptStorage.deleteScript, function () {
      res.redirect('/users/' + user.name);
    });
  }
};
