var fs = require('fs');
var formidable = require('formidable');
var scriptStorage = require('./scriptStorage');
var User = require('../models/user').User;
var Script = require('../models/script').Script;
var Strategy = require('../models/strategy.js').Strategy;
var RepoManager = require('../libs/repoManager');
var scriptsList = require('../libs/modelsList');
var Flag = require('../models/flag').Flag;
var flagLib = require('../libs/flag');
var removeLib = require('../libs/remove');
var strategies = require('./strategies.json');
var async = require('async');
var renderMd = require('../libs/markdown').renderMd;
var nil = require('../libs/helpers').nil;

// View information and scripts of a user
exports.view = function (req, res, next) {
  var username = req.route.params.shift();
  var thisUser = req.session.user;

  User.findOne({ name: username }, function (err, user) {
    var options = { isYou: thisUser && user && thisUser.name === user.name };
    options.isMod = options.isYou && thisUser.role < 4;

    if (err || !user) { return next(); }

    function render () {
      var query = { _authorId: user._id, isLib: null };
      req.route.params.push('author');

      // Only list flagged scripts for author and user >= moderator
      if (options.isYou || (thisUser && thisUser.role < 4)) {
        query.flagged = null;
      }

      // list the user's scripts
      scriptsList.listScripts(query, req.route.params, '/users/' + username,
        function (scriptsList) {
          options.title = user.name;
          options.name = user.name;
          options.about = renderMd(user.about);
          options.scriptsList = scriptsList;
          options.username = thisUser ? thisUser.name : null;
          res.render('user', options);
      });
    }

    if (!thisUser || options.isYou) {
      return render();
    }

    // Display the flag user UI
    flagLib.flaggable(User, user, thisUser, function (canFlag, author, flag) {
      var flagUrl = '/flag/users/' + user.name;

      if (flag) {
        flagUrl += '/unflag';
        options.flagged = true;
        options.flaggable = true;
      } else {
        options.flaggable = canFlag;
      }
      options.flagUrl = flagUrl;

      removeLib.removeable(User, user, thisUser, function (canRemove, author) {
        options.moderation = canRemove;
        options.flags = user.flags || 0;
        options.removeUrl = '/remove/users/' + user.name;

        if (!canRemove) { return render(); }

        flagLib.getThreshold(User, user, author, function (threshold) {
          options.threshold = threshold;
          render();
        });
      });
    });
  });
}

// Let a user edit their account
exports.edit = function (req, res) {
  var user = req.session.user;
  var userStrats = req.session.user.strategies.slice(0);
  var options = {
    title: 'Edit Yourself',
    name: user.name,
    about: user.about,
    username: user ? user.name : null
  };

  if (!user) { return res.redirect('/login'); }

  req.route.params.push('author');

  Strategy.find({}, function (err, strats) {
    var defaultStrategy = userStrats[userStrats.length - 1];
    var strategy = null;
    var name = null;
    options.openStrategies = [];
    options.usedStrategies = [];

    // Get the strategies we have OAuth keys for
    strats.forEach(function (strat) {
      if (strat.name === defaultStrategy) { return; }

      if (userStrats.indexOf(strat.name) > -1) {
        options.usedStrategies.push({ 'strat' : strat.name,
          'display' : strat.display });
      } else {
        options.openStrategies.push({ 'strat' : strat.name,
          'display' : strat.display });
      }
    });

    // Get OpenId strategies
    if (process.env.NODE_ENV === 'production') {
      for (name in strategies) {
        strategy = strategies[name];

        if (!strategy.oauth && name !== defaultStrategy) {
          if (userStrats.indexOf(name) > -1) {
            options.usedStrategies.push({ 'strat' : name,
              'display' : strategy.name });
          } else {
            options.openStrategies.push({ 'strat' : name,
              'display' : strategy.name });
          }
        }
      }
    }

    options.defaultStrategy = strategies[defaultStrategy].name;
    options.haveOtherStrategies = options.usedStrategies.length > 0;

    scriptsList.listScripts({ _authorId: user._id, isLib: null, flagged: null },
      { size: -1 }, '/user/edit',
      function (scriptsList) {
        scriptsList.edit = true;
        options.scriptsList = scriptsList;
        res.render('userEdit', options);
    });
  });
};

// Sloppy code to let a user add scripts to their acount
exports.scripts = function (req, res) {
  var user = req.session.user;
  var isLib = req.route.params.isLib;
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

  options = { title: 'Edit Scripts', username: user.name, isLib: isLib };

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
          res.render('addScripts', options);
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

  if (!loadingRepos) { res.render('addScripts', options); }
};

exports.uploadScript = function (req, res, next) {
  var user = req.session.user;
  var isLib = req.route.params.isLib;
  var userjsRegex = /\.user\.js$/;
  var jsRegex = /\.js$/;
  var form = null;

  if (!user) { return res.redirect('/login'); }
  if (!/multipart\/form-data/.test(req.headers['content-type'])) {
    return next();
  }

  form = new formidable.IncomingForm();
  form.parse(req, function (err, fields, files) {
    var script = files.script;
    var stream = null;
    var bufs = [];
    var failUrl = '/user/add/' + (isLib ? 'lib' : 'scripts');

    // Reject non-js and huge files
    if (script.type !== 'application/javascript' && 
      script.size > 500000) { 
      return res.redirect(failUrl); 
    }

    stream = fs.createReadStream(script.path);
    stream.on('data', function (d) { bufs.push(d); });

    stream.on('end', function () {
      User.findOne({ _id: user._id }, function (err, user) {
        var scriptName = fields.script_name;
        if (isLib) {
          scriptStorage.storeScript(user, scriptName, Buffer.concat(bufs),
            function (script) {
              if (!script) { return res.redirect(failUrl); }

              res.redirect('/libs/' + script.installName
                .replace(jsRegex, ''));
            });
          } else {
            scriptStorage.getMeta(bufs, function (meta) {
              scriptStorage.storeScript(user, meta, Buffer.concat(bufs),
                function (script) {
                  if (!script) { return res.redirect(failUrl); }

                  res.redirect('/scripts/' + script.installName
                    .replace(userjsRegex, ''));
                });
            });
          }
      });
    });
  });
};

// post route to update a user's account
exports.update = function (req, res) {
  var user = req.session.user;
  var scriptUrls = req.body.urls ? Object.keys(req.body.urls) : '';
  var installRegex = null;
  var installNames = [];
  var username = user.name.toLowerCase();
  if (!user) { return res.redirect('/login'); }

  if (req.body.about) {
    // Update the about section of a user's profile
    User.findOneAndUpdate({ _id: user._id }, 
      { about: req.body.about  },
      function (err, user) {
        if (err) { res.redirect('/'); }

        req.session.user.about = user.about;
        res.redirect('/users/' + user.name);
    });
  } else {
    // Remove scripts (currently no UI)
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

// Submit a script through the web editor
exports.newScript = function (req, res, next) {
  var user = req.session.user;
  var isLib = req.route.params.isLib;
  var source = null;
  var url = null;

  if (!user) { return res.redirect('/login'); }

  function storeScript(meta, source) {
    var userjsRegex = /\.user\.js$/;
    var jsRegex = /\.js$/;

    User.findOne({ _id: user._id }, function (err, user) {
      scriptStorage.storeScript(user, meta, source, function (script) {
        var redirectUrl = script ? (script.isLib ? '/libs/'
          + script.installName.replace(jsRegex, '') : '/scripts/'
          + script.installName.replace(userjsRegex, '')) : req.body.url;

        if (!script || !req.body.original) {
          return res.redirect(redirectUrl);
        }

        Script.findOne({ installName: req.body.original }, 
          function (err, origScript) {
            var fork = null;
            if (err || !origScript) { return res.redirect(redirectUrl); }

            fork = origScript.fork || [];
            fork.unshift({ author: origScript.author, url: origScript
              .installName.replace(origScript.isLib ? jsRegex : userjsRegex, '')
            });
            script.fork = fork;

            script.save(function (err, script) {
              res.redirect(redirectUrl);
            });
        });
      });
    });
  }

  if (req.body.url) {
    source = new Buffer(req.body.source);
    url = req.body.url;

    if (isLib) {
      storeScript(req.body.script_name, source);
    } else {
      scriptStorage.getMeta([source], function (meta) {
        if (!meta || !meta.name) { return res.redirect(url); }
        storeScript(meta, source);
      });
    }
  } else {
    res.render('scriptEditor', {
      title: 'Write a new ' + (isLib ? 'library ' : '') + 'script',
      source: '',
      url: req.url,
      owner: true,
      readOnly: false,
      isLib: isLib,
      newScript: true,
      username: user ? user.name : null
    });
  }
};

// Show a script in the web editor
exports.editScript = function (req, res, next) {
  var user = req.session.user;
  var isLib = req.route.params.isLib;
  var installName = null;

  req.route.params.scriptname += isLib ? '.js' : '.user.js';
  scriptStorage.getSource(req, function (script, stream) {
    var bufs = [];
    var collaborators = [];

    if (!script) { return next(); }

    if (script.meta.collaborator) {
      if (typeof script.meta.collaborator === 'string') {
        collaborators.push(script.meta.collaborator);
      } else {
        collaborators = script.meta.collaborator;
      }
    }

    stream.on('data', function (d) { bufs.push(d); });
    stream.on('end', function () {
      res.render('scriptEditor', {
        title: 'Edit ' + script.name,
        source: Buffer.concat(bufs).toString('utf8'),
        original: script.installName,
        url: req.url,
        owner: user && (script._authorId == user._id 
          || collaborators.indexOf(user.name) > -1),
        username: user ? user.name : null,
        isLib: script.isLib,
        scriptName: script.name,
        readOnly: !user
      });
    });
  });
};

// route to flag a user
exports.flag = function (req, res, next) {
  var username = req.route.params.username;
  var unflag = req.route.params.unflag;

  User.findOne({ name: username }, function (err, user) {
    var fn = flagLib[unflag && unflag === 'unflag' ? 'unflag' : 'flag'];
    if (err || !user) { return next(); }

    fn(User, user, req.session.user, function (flagged) {
      res.redirect('/users/' + username);
    });
  });
};
