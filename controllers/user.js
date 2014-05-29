var fs = require('fs');
var formidable = require('formidable');
var async = require('async');
var _ = require('underscore');

var Flag = require('../models/flag').Flag;
var Script = require('../models/script').Script;
var Strategy = require('../models/strategy.js').Strategy;
var User = require('../models/user').User;

var userRoles = require('../models/userRoles.json');
var scriptStorage = require('./scriptStorage');
var RepoManager = require('../libs/repoManager');
var scriptsList = require('../libs/modelsList');
var modelParser = require('../libs/modelParser');
var modelQuery = require('../libs/modelQuery');
var flagLib = require('../libs/flag');
var removeLib = require('../libs/remove');
var strategies = require('./strategies.json');
var renderMd = require('../libs/markdown').renderMd;
var nil = require('../libs/helpers').nil;
var getDefaultPagination = require('../libs/templateHelpers').getDefaultPagination;

var setupFlagUserUITask = function(options) {
  var user = options.user;
  var authedUser = options.authedUser;

  return function(callback) {
    var flagUrl = '/flag/users/' + user.name;

    // Can't flag when not logged in or when user owns the script.
    if (!user || options.isOwner) {
      callback();
      return;
    }
    flagLib.flaggable(User, user, authedUser, function (canFlag, author, flag) {
      if (flag) {
        flagUrl += '/unflag';
        options.flagged = true;
        options.flaggable = true;
      } else {
        options.flaggable = canFlag;
      }
      options.flagUrl = flagUrl;

      removeLib.removeable(User, user, authedUser, function (canRemove, author) {
        options.moderation = canRemove;
        options.flags = user.flags || 0;
        options.removeUrl = '/remove/users/' + user.name;

        if (!canRemove) { return callback(); }

        flagLib.getThreshold(User, user, author, function (threshold) {
          options.threshold = threshold;
          callback();
        });
      });
    });
  };
};

// View information and scripts of a user
exports.view = function (req, res, next) {
  var authedUser = req.session.user;

  var username = req.route.params.username;

  User.findOne({
    name: username
  }, function (err, userData) {
    if (err || !userData) { return next(); }

    //
    var options = {};
    var tasks = [];

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    //
    var user = options.user = modelParser.parseUser(userData);
    options.isYou = authedUser && user && authedUser._id == user._id;
    options.title = user.name + ' | OpenUserJS.org';
    options.pageMetaDescription = null;
    options.pageMetaKeywords = null; // seperator = ', '
    options.isUserPage = true;

    //
    user.aboutRendered = renderMd(user.about);

    // User
    if (options.isYou) {
      options.userTools = {};
    }

    // Mod
    if (authedUser && authedUser.isMod && authedUser.role < user.role) {
      //options.userTools = {}; // TODO: Support moderator edits of user profiles?
      options.modTools = {};
    }

    // Admin
    if (authedUser && authedUser.isAdmin && authedUser.role < user.role) {
      options.adminTools = {};

      // user.role
      // Allow authedUser to raise target user role to the level below him.
      var roles = _.map(userRoles, function(roleName, index){
        return {
          id: index,
          name: roleName,
          selected: index === user.role,
        };
      });
      roles = roles.splice(authedUser.role + 1);
      roles.reverse();
      options.adminTools.availableRoles = roles;
    }

    // Scripts: Query
    var scriptListQuery = Script.find();

    // Scripts: Query: author=user
    scriptListQuery.find({_authorId: user._id});
    // scriptListQuery.find({author: user.name});

    // Scripts: Query: flagged
    // Only list flagged scripts for author and user >= moderator
    if (options.isYou || options.isMod) {
      // Show
    } else {
      // Script.flagged is undefined by default.
      // This is the result of Script.flagged be added later
      scriptListQuery.find({flagged: {$ne: true}}); 
    }

    //--- Tasks

    // User scripList (count)
    tasks.push(function (callback) {
      Script.count(scriptListQuery._conditions, function(err, scriptListCount){
        if (err) {
          callback();
        } else {
          options.scriptListCount = scriptListCount;
          options.scriptListNumPages = Math.ceil(options.scriptListCount / options.scriptListLimit) || 1;
          callback();
        }
      });
    });

    // Setup the flag user UI
    tasks.push(setupFlagUserUITask(options));

    function preRender(){};
    function render(){ res.render('pages/userPage', options); }
    function asyncComplete(){ preRender(); render(); }
    async.parallel(tasks, asyncComplete);
  });
};

exports.userScriptListPage = function(req, res, next) {
  var authedUser = req.session.user;

  var username = req.route.params.username;

  User.findOne({
    name: username
  }, function (err, userData) {
    if (err || !userData) { return next(); }

    //
    var options = {};
    var tasks = [];

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;


    //
    var user = options.user = modelParser.parseUser(userData);
    options.isYou = authedUser && user && authedUser._id == user._id;
    options.title = user.name + ' | OpenUserJS.org';
    options.pageMetaDescription = null;
    options.pageMetaKeywords = null; // seperator = ', '
    options.isUserScriptListPage = true;

    // Scripts: Query
    var scriptListQuery = Script.find();

    // Scripts: Query: author=user
    scriptListQuery.find({_authorId: user._id});

    // Scripts: Query: flagged
    // Only list flagged scripts for author and user >= moderator
    if (options.isYou || options.isMod) {
      // Show
    } else {
      // Script.flagged is undefined by default.
      scriptListQuery.find({flagged: {$ne: true}}); 
    }

    // Scripts: Query: Search
    if (req.query.q)
      modelQuery.parseScriptSearchQuery(scriptListQuery, req.query.q);

    // Scripts: Query: Sort
    modelQuery.parseModelListSort(scriptListQuery, req.query.orderBy, req.query.orderDir, function(){
      scriptListQuery.sort('-rating -installs -updated');
    });

    // Pagination
    var pagination = getDefaultPagination(req);
    pagination.applyToQuery(scriptListQuery);

    //--- Tasks

    // Pagination
    tasks.push(pagination.getCountTask(scriptListQuery));

    // User scripList
    tasks.push(function (callback) {
      scriptListQuery.exec(function(err, scriptDataList){
        if (err) {
          callback();
        } else {
          options.scriptList = _.map(scriptDataList, modelParser.parseScript);
          callback();
        }
      });
    });
    tasks.push(function (callback) {
      Script.count(scriptListQuery._conditions, function(err, scriptListCount){
        if (err) {
          callback();
        } else {
          options.scriptListCount = scriptListCount;
          options.scriptListNumPages = Math.ceil(options.scriptListCount / options.scriptListLimit) || 1;
          callback();
        }
      });
    });

    function preRender(){
      // Pagination
      options.paginationRendered = pagination.renderDefault(req);
    };
    function render(){ res.render('pages/userScriptListPage', options); }
    function asyncComplete(){ preRender(); render(); }
    async.parallel(tasks, asyncComplete);
  });
};

exports.userEditProfilePage = function (req, res, next) {
  var authedUser = req.session.user;

  if (!authedUser) { return res.redirect('/login'); }

  var username = req.route.params.username;

  User.findOne({
    name: username
  }, function (err, userData) {
    if (err || !userData) { return next(); }

    //
    var options = {};
    var tasks = [];

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;

    //
    var user = options.user = modelParser.parseUser(userData);
    options.isYou = authedUser && user && authedUser._id == user._id;
    options.title = user.name + ' | OpenUserJS.org';

    //
    user.aboutRendered = renderMd(user.about);

    // Scripts: Query
    var scriptListQuery = Script.find();

    // Scripts: Query: author=user
    scriptListQuery.find({_authorId: user._id});
    // scriptListQuery.find({author: user.name});

    // Scripts: Query: flagged
    // Only list flagged scripts for author and user >= moderator
    if (options.isYou || options.isMod) {
      // Show
    } else {
      // Script.flagged is undefined by default.
      scriptListQuery.find({flagged: {$ne: true}}); 
    }

    // User scripList (count)
    tasks.push(function (callback) {
      Script.count(scriptListQuery._conditions, function(err, scriptListCount){
        if (err) {
          callback();
        } else {
          options.scriptListCount = scriptListCount;
          options.scriptListNumPages = Math.ceil(options.scriptListCount / options.scriptListLimit) || 1;
          callback();
        }
      });
    });

    // Setup the flag user UI
    tasks.push(setupFlagUserUITask(options));

    function preRender(){};
    function render(){ res.render('pages/userEditProfilePage', options); }
    function asyncComplete(){ preRender(); render(); }
    async.parallel(tasks, asyncComplete);
  });
};

exports.userEditPreferencesPage = function (req, res, next) {
  var authedUser = req.session.user;

  if (!authedUser) { return res.redirect('/login'); }

  User.findOne({
    _id: authedUser._id
  }, function (err, userData) {
    if (err || !userData) { return next(); }

    //
    var options = {};
    var tasks = [];

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.role < 4;

    //
    var user = options.user = modelParser.parseUser(userData);
    options.isYou = authedUser && user && authedUser._id == user._id;
    options.title = user.name + ' | OpenUserJS.org';

    //
    user.aboutRendered = renderMd(user.about);

    // Scripts: Query
    var scriptListQuery = Script.find();

    // Scripts: Query: author=user
    scriptListQuery.find({_authorId: user._id});
    // scriptListQuery.find({author: user.name});

    // Scripts: Query: flagged
    // Only list flagged scripts for author and user >= moderator
    if (options.isYou || options.isMod) {
      // Show
    } else {
      // Script.flagged is undefined by default.
      scriptListQuery.find({flagged: {$ne: true}}); 
    }

    // User scripList (count)
    tasks.push(function (callback) {
      Script.count(scriptListQuery._conditions, function(err, scriptListCount){
        if (err) {
          callback();
        } else {
          options.scriptListCount = scriptListCount;
          options.scriptListNumPages = Math.ceil(options.scriptListCount / options.scriptListLimit) || 1;
          callback();
        }
      });
    });

    // User edit auth strategies
    tasks.push(function(callback) {
      var userStrats = user.strategies.slice(0);
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

        callback();
      });
    });

    // Setup the flag user UI
    tasks.push(setupFlagUserUITask(options));

    function preRender(){};
    function render(){ res.render('pages/userEditPreferencesPage', options); }
    function asyncComplete(){ preRender(); render(); }
    async.parallel(tasks, asyncComplete);
  });
};

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

  if (!user) { return res.redirect('/login'); }

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

              res.redirect('/libs/' + encodeURI(script.installName
                .replace(jsRegex, '')));
            });
          } else {
            scriptStorage.getMeta(bufs, function (meta) {
              scriptStorage.storeScript(user, meta, Buffer.concat(bufs),
                function (script) {
                  if (!script) { return res.redirect(failUrl); }

                  res.redirect('/scripts/' + encodeURI(script.installName
                    .replace(userjsRegex, '')));
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
exports.submitSource = function (req, res, next) {
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
        var redirectUrl = encodeURI(script ? (script.isLib ? '/libs/'
          + script.installName.replace(jsRegex, '') : '/scripts/'
          + script.installName.replace(userjsRegex, '')) : req.body.url);

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
};

function getExistingScript (req, options, authedUser, callback) {
  options.isLib = req.route.params.isLib;

  if (!req.route.params.scriptname) {

    // A user who isn't logged in can't write a new script
    if (!authedUser) { return callback(null); }

    options.title = 'Write a new ' + (options.isLib ? 'library ' : '') + 'script';
    options.source = '';
    options.url = req.url;
    options.owner = true;
    options.readOnly = false;
    options.newScript = true;

    callback(options);
  } else {
    req.route.params.scriptname += options.isLib ? '.js' : '.user.js';
    scriptStorage.getSource(req, function (script, stream) {
      var bufs = [];
      var collaborators = [];

      if (!script) { return callback(null); }

      if (script.meta.collaborator) {
        if (typeof script.meta.collaborator === 'string') {
          collaborators.push(script.meta.collaborator);
        } else {
          collaborators = script.meta.collaborator;
        }
      }

      stream.on('data', function (d) { bufs.push(d); });
      stream.on('end', function () {
        options.title = 'Edit ' + script.name;
        options.source = Buffer.concat(bufs).toString('utf8');
        options.original = script.installName;
        options.url = req.url;
        options.owner = authedUser && (script._authorId == authedUser._id 
          || collaborators.indexOf(authedUser.name) > -1);
        options.username = authedUser ? authedUser.name : null;
        options.isLib = script.isLib;
        options.scriptName = script.name;
        options.readOnly = !authedUser;

        callback(options);
      });
    });
  }
}

function pageMeta (options) {
  options.title = (options.title || '') + ' | OpenUserJS.org';
  options.pageMetaDescription = 'Download Userscripts to enhance your browser.';
  var pageMetaKeywords = ['userscript', 'greasemonkey'];
  pageMetaKeywords.concat(['web browser']);
  options.pageMetaKeywords = pageMetaKeywords.join(', ');

  return options;
}

exports.editScript = function (req, res, next) {
  var authedUser = req.session.user;

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.role < 4;

  // Metadata
  options = pageMeta(options);

  //--- Tasks
  
  // Get the info and source for an existing script for the editor
  // Also works for writing a new script
  tasks.push(function (callback) {
    getExistingScript(req, options, authedUser, function (opts) {
      options = opts;
      callback(!opts);
    });
  });

  //---
  function preRender (){};
  function render () { res.render('pages/ScriptViewSourcePage', options); }
  function asyncComplete (err) {
    if (err) {
      next();
    } else {
      preRender();
      render();
    }
  }
  async.parallel(tasks, asyncComplete);
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
