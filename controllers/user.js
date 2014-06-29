var fs = require('fs');
var formidable = require('formidable');
var async = require('async');
var _ = require('underscore');
var util = require('util');

var Comment = require('../models/comment').Comment;
var Flag = require('../models/flag').Flag;
var Script = require('../models/script').Script;
var Strategy = require('../models/strategy').Strategy;
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
var helpers = require('../libs/helpers');
var nil = require('../libs/helpers').nil;
var getDefaultPagination = require('../libs/templateHelpers').getDefaultPagination;
var statusCodePage = require('../libs/templateHelpers').statusCodePage;
var execQueryTask = require('../libs/tasks').execQueryTask;
var countTask = require('../libs/tasks').countTask;
var settings = require('../models/settings.json');
var github = require('./../libs/githubClient');
var pageMetadata = require('../libs/templateHelpers').pageMetadata;

function caseInsensitive (str) {
  return new RegExp('^' + (str || '').replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1")
    + '$', 'i');
}

var setupUserModerationUITask = function (options) {
  var user = options.user;
  var authedUser = options.authedUser;

  return function (callback) {
    var flagUrl = '/flag/users/' + user.name;

    // Can't flag when not logged in or when is authedUser.
    if (!authedUser || options.isYou) {
      callback();
      return;
    }
    flagLib.flaggable(User, user, authedUser, function (canFlag, author, flag) {
      if (flag) {
        flagUrl += '/unflag';
        options.flagged = true;
        options.canFlag = true;
      } else {
        options.canFlag = canFlag;
      }
      options.flagUrl = flagUrl;

      removeLib.removeable(User, user, authedUser, function (canRemove, author) {
        options.canRemove = canRemove;
        options.flags = user.flags || 0;

        if (!canRemove) { return callback(); }

        flagLib.getThreshold(User, user, author, function (threshold) {
          options.threshold = threshold;
          callback();
        });
      });
    });
  };
};

var getUserSidePanelTasks = function (options) {
  var tasks = [];

  //--- Tasks

  // Setup the flag user UI
  tasks.push(setupUserModerationUITask(options));

  return tasks;
};

var getUserPageTasks = function (options) {
  var tasks = [];

  // Shortcuts
  var user = options.user;
  var authedUser = options.authedUser;

  //--- Tasks

  // userScriptListCountQuery
  var userScriptListCountQuery = Script.find({ _authorId: user._id, flagged: { $ne: true } });
  tasks.push(countTask(userScriptListCountQuery, options, 'scriptListCount'));

  // userCommentListCountQuery
  var userCommentListCountQuery = Comment.find({ _authorId: user._id, flagged: { $ne: true } });
  tasks.push(countTask(userCommentListCountQuery, options, 'commentListCount'));

  return tasks;
};

var setupUserSidePanel = function (options) {
  // Shortcuts
  var user = options.user;
  var authedUser = options.authedUser;

  // User
  if (options.isYou) {
    options.userTools = {};
  }

  // Mod
  if (authedUser && authedUser.isMod && (authedUser.role < user.role || options.isYou)) {
    //options.userTools = {}; // TODO: Support moderator edits of user profiles?
    options.modTools = {};
  }

  // Admin
  if (authedUser && authedUser.isAdmin && (authedUser.role < user.role || options.isYou)) {
    options.adminTools = {};

    // Auth As This User
    options.adminTools.authAsUserUrl = '/admin/authas?username=' + encodeURIComponent(user.name);

    // user.role
    // Allow authedUser to raise target user role to the level below him.
    var roles = _.map(userRoles, function (roleName, index) {
      return {
        id: index,
        name: roleName,
        selected: index === user.role
      };
    });

    if (options.isYou) {
      // Only have your current role selectable.
      roles = [roles[authedUser.role]];
    } else {
      roles = roles.splice(authedUser.role + 1);
      roles.reverse();
    }

    options.adminTools.availableRoles = roles;
  }
};

exports.userListPage = function (req, res, next) {
  var authedUser = req.session.user;

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // Page metadata
  pageMetadata(options, 'Users');

  // userListQuery
  var userListQuery = User.find();

  // userListQuery: Defaults
  modelQuery.applyUserListQueryDefaults(userListQuery, options, req);

  // userListQuery: Pagination
  var pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

  //--- Tasks

  // Pagination
  tasks.push(pagination.getCountTask(userListQuery));

  // userListQuery
  tasks.push(execQueryTask(userListQuery, options, 'userList'));

  //---
  function preRender() {
    // userList
    options.userList = _.map(options.userList, modelParser.parseUser);

    // Pagination
    options.paginationRendered = pagination.renderDefault(req);

    // Empty list
    options.userListIsEmptyMessage = 'No users.';
    if (options.isFlagged) {
      options.userListIsEmptyMessage = 'No flagged users.';
    } else if (options.searchBarValue) {
      options.userListIsEmptyMessage = 'We couldn\'t find any users by this name.';
    }

    // Heading
    options.pageHeading = options.isFlagged ? 'Flagged Users' : 'Users';

    // Page metadata
    if (options.isFlagged) {
      pageMetadata(options, ['Flagged Users', 'Moderation']);
    }
  };
  function render() { res.render('pages/userListPage', options); }
  function asyncComplete(err) { if (err) { return next(); } else { preRender(); render(); } };
  async.parallel(tasks, asyncComplete);
};

// View information and scripts of a user
exports.view = function (req, res, next) {
  var authedUser = req.session.user;

  var username = req.route.params.username;

  User.findOne({
    name: caseInsensitive(username)
  }, function (err, userData) {
    if (err || !userData) { return next(); }

    //
    var options = {};
    var tasks = [];

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    // User
    var user = options.user = modelParser.parseUser(userData);
    user.aboutRendered = renderMd(user.about);
    options.isYou = authedUser && user && authedUser._id == user._id;

    // Page metadata
    pageMetadata(options, [user.name, 'Users']);
    options.isUserPage = true;

    // UserSidePanel
    setupUserSidePanel(options);

    // scriptListQuery
    var scriptListQuery = Script.find();

    // scriptListQuery: author=user
    scriptListQuery.find({ _authorId: user._id });

    // scriptListQuery: Defaults
    modelQuery.applyScriptListQueryDefaults(scriptListQuery, options, req);

    // scriptListQuery: Pagination
    var pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

    //--- Tasks

    // UserPage tasks
    tasks = tasks.concat(getUserPageTasks(options));

    // UserSidePanel tasks
    tasks = tasks.concat(getUserSidePanelTasks(options));

    //---
    function preRender() { };
    function render() { res.render('pages/userPage', options); }
    function asyncComplete() { preRender(); render(); }
    async.parallel(tasks, asyncComplete);
  });
};

exports.userCommentListPage = function (req, res, next) {
  var authedUser = req.session.user;

  var username = req.route.params.username;

  User.findOne({
    name: caseInsensitive(username)
  }, function (err, userData) {
    if (err || !userData) { return next(); }

    //
    var options = {};
    var tasks = [];

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    // User
    var user = options.user = modelParser.parseUser(userData);
    options.isYou = authedUser && user && authedUser._id == user._id;

    // Page metadata
    pageMetadata(options, [user.name, 'Users']);
    options.isUserCommentListPage = true;

    // commentListQuery
    var commentListQuery = Comment.find();

    // commentListQuery: author=user
    commentListQuery.find({ _authorId: user._id });

    // commentListQuery: Defaults
    modelQuery.applyCommentListQueryDefaults(commentListQuery, options, req);
    commentListQuery.sort('-created');

    // commentListQuery: Pagination
    var pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

    // commentListQuery: Populate: discussion
    commentListQuery.populate({
      path: '_discussionId',
      model: 'Discussion'
    });

    // SearchBar
    options.searchBarPlaceholder = 'Search User\'s Comments';
    options.searchBarFormAction = '';

    //--- Tasks

    // Pagination
    tasks.push(pagination.getCountTask(commentListQuery));

    // commentListQuery
    tasks.push(execQueryTask(commentListQuery, options, 'commentList'));

    // UserPage tasks
    tasks = tasks.concat(getUserPageTasks(options));

    //--
    function preRender() {
      // commentList
      options.commentList = _.map(options.commentList, modelParser.parseComment);
      _.map(options.commentList, function (comment) {
        comment.author = modelParser.parseUser(comment._authorId);
      });
      _.map(options.commentList, modelParser.renderComment);

      // comment.discussion
      _.map(options.commentList, function (comment) {
        comment.discussion = modelParser.parseDiscussion(comment._discussionId);
      });

      // Pagination
      options.paginationRendered = pagination.renderDefault(req);
    };
    function render() { res.render('pages/userCommentListPage', options); }
    function asyncComplete() { preRender(); render(); }
    async.parallel(tasks, asyncComplete);
  });
};

exports.userScriptListPage = function (req, res, next) {
  var authedUser = req.session.user;

  var username = req.route.params.username;

  User.findOne({
    name: caseInsensitive(username)
  }, function (err, userData) {
    if (err || !userData) { return next(); }

    //
    var options = {};
    var tasks = [];

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    // User
    var user = options.user = modelParser.parseUser(userData);
    options.isYou = authedUser && user && authedUser._id == user._id;

    // Page metadata
    pageMetadata(options, [user.name, 'Users']);
    options.isUserScriptListPage = true;

    // scriptListQuery
    var scriptListQuery = Script.find();

    // scriptListQuery: author=user
    scriptListQuery.find({ _authorId: user._id });

    // scriptListQuery: Defaults
    modelQuery.applyScriptListQueryDefaults(scriptListQuery, options, req);

    // scriptListQuery: Pagination
    var pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

    // SearchBar
    options.searchBarPlaceholder = 'Search User\'s Scripts';
    options.searchBarFormAction = '';

    //--- Tasks

    // Pagination
    tasks.push(pagination.getCountTask(scriptListQuery));

    // scriptListQuery
    tasks.push(execQueryTask(scriptListQuery, options, 'scriptList'));

    // UserPage tasks
    tasks = tasks.concat(getUserPageTasks(options));

    //---
    function preRender() {
      // scriptList
      options.scriptList = _.map(options.scriptList, modelParser.parseScript);

      // Pagination
      options.paginationRendered = pagination.renderDefault(req);

      // Empty list
      options.scriptListIsEmptyMessage = 'No scripts.';
      if (options.isFlagged) {
        if (options.librariesOnly) {
          options.scriptListIsEmptyMessage = 'No flagged libraries.';
        } else {
          options.scriptListIsEmptyMessage = 'No flagged scripts.';
        }
      } else if (options.searchBarValue) {
        if (options.librariesOnly) {
          options.scriptListIsEmptyMessage = 'We couldn\'t find any libraries with this search value.';
        } else {
          options.scriptListIsEmptyMessage = 'We couldn\'t find any scripts with this search value.';
        }
      } else if (options.isUserScriptListPage) {
        options.scriptListIsEmptyMessage = 'This user hasn\'t added any scripts yet.';
      }
    };
    function render() { res.render('pages/userScriptListPage', options); }
    function asyncComplete() { preRender(); render(); }
    async.parallel(tasks, asyncComplete);
  });
};

exports.userEditProfilePage = function (req, res, next) {
  var authedUser = req.session.user;

  if (!authedUser) { return res.redirect('/login'); }

  var username = req.route.params.username;

  User.findOne({
    _id: authedUser._id
  }, function (err, userData) {
    if (err || !userData) { return next(); }

    //
    var options = {};
    var tasks = [];

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    // User
    var user = options.user = modelParser.parseUser(userData);
    options.isYou = authedUser && user && authedUser._id == user._id;

    // Page metadata
    pageMetadata(options, [user.name, 'Users']);

    // UserSidePanel
    setupUserSidePanel(options);

    // Scripts: Query
    var scriptListQuery = Script.find();

    // Scripts: Query: author=user
    scriptListQuery.find({ _authorId: user._id });

    // Scripts: Query: flagged
    // Only list flagged scripts for author and user >= moderator
    if (options.isYou || options.isMod) {
      // Show
    } else {
      // Script.flagged is undefined by default.
      scriptListQuery.find({ flagged: { $ne: true } });
    }

    //--- Tasks

    // UserPage tasks
    tasks = tasks.concat(getUserPageTasks(options));

    // UserSidePanel tasks
    tasks = tasks.concat(getUserSidePanelTasks(options));

    //---
    function preRender() { };
    function render() { res.render('pages/userEditProfilePage', options); }
    function asyncComplete() { preRender(); render(); }
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
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    // User
    var user = options.user = modelParser.parseUser(userData);
    options.isYou = authedUser && user && authedUser._id == user._id;

    // Page metadata
    pageMetadata(options, [user.name, 'Users']);

    // UserSidePanel
    setupUserSidePanel(options);

    // Scripts: Query
    var scriptListQuery = Script.find();

    // Scripts: Query: author=user
    scriptListQuery.find({ _authorId: user._id });

    // Scripts: Query: flagged
    // Only list flagged scripts for author and user >= moderator
    if (options.isYou || options.isMod) {
      // Show
    } else {
      // Script.flagged is undefined by default.
      scriptListQuery.find({ flagged: { $ne: true } });
    }

    //--- Tasks

    // User edit auth strategies
    tasks.push(function (callback) {
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
            options.usedStrategies.push({
              'strat': strat.name,
              'display': strat.display
            });
          } else {
            options.openStrategies.push({
              'strat': strat.name,
              'display': strat.display
            });
          }
        });

        // Get OpenId strategies
        if (process.env.NODE_ENV === 'production') {
          for (name in strategies) {
            strategy = strategies[name];

            if (!strategy.oauth && name !== defaultStrategy) {
              if (userStrats.indexOf(name) > -1) {
                options.usedStrategies.push({
                  'strat': name,
                  'display': strategy.name
                });
              } else {
                options.openStrategies.push({
                  'strat': name,
                  'display': strategy.name
                });
              }
            }
          }
        }

        options.defaultStrategy = strategies[defaultStrategy].name;
        options.haveOtherStrategies = options.usedStrategies.length > 0;

        callback();
      });
    });

    // UserPage tasks
    tasks = tasks.concat(getUserPageTasks(options));

    // UserSidePanel tasks
    tasks = tasks.concat(getUserSidePanelTasks(options));

    function preRender() { };
    function render() { res.render('pages/userEditPreferencesPage', options); }
    function asyncComplete() { preRender(); render(); }
    async.parallel(tasks, asyncComplete);
  });
};

// Let a user edit their account
exports.edit = function (req, res, next) {
  var user = req.session.user;
  var userStrats = null;
  var options = null;

  if (!user) { return res.redirect('/login'); }

  userStrats = req.session.user.strategies.slice(0);
  options = {
    name: user.name,
    about: user.about,
    username: user.name
  };

  // Page metadata
  pageMetadata(options, ['Edit Yourself', 'Users']);

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
        options.usedStrategies.push({
          'strat': strat.name,
          'display': strat.display
        });
      } else {
        options.openStrategies.push({
          'strat': strat.name,
          'display': strat.display
        });
      }
    });

    // Get OpenId strategies
    if (process.env.NODE_ENV === 'production') {
      for (name in strategies) {
        strategy = strategies[name];

        if (!strategy.oauth && name !== defaultStrategy) {
          if (userStrats.indexOf(name) > -1) {
            options.usedStrategies.push({
              'strat': name,
              'display': strategy.name
            });
          } else {
            options.openStrategies.push({
              'strat': name,
              'display': strategy.name
            });
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

exports.newScriptPage = function (req, res, next) {
  var authedUser = req.session.user;

  if (!authedUser) return res.redirect('/login');

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  //
  options.newUserJS = true;
  options.newScriptEditorPageUrl = '/user/add/scripts/new';
  options.uploadNewScriptPageUrl = '/user/add/scripts/upload';

  // Page metadata
  pageMetadata(options, 'New Script');

  //---
  async.parallel(tasks, function (err) {
    if (err) return next();

    res.render('pages/newScriptPage', options);
  });
};

exports.newLibraryPage = function (req, res, next) {
  var authedUser = req.session.user;

  if (!authedUser) return res.redirect('/login');

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  //
  options.newJSLibrary = true;
  options.newScriptEditorPageUrl = '/user/add/lib/new';
  options.uploadNewScriptPageUrl = '/user/add/lib/upload';

  // Page metadata
  pageMetadata(options, 'New Library');

  //---
  async.parallel(tasks, function (err) {
    if (err) return next();

    res.render('pages/newScriptPage', options);
  });
};

exports.userGitHubRepoListPage = function (req, res, next) {
  var authedUser = req.session.user;

  if (!authedUser) return res.redirect('/login');

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // GitHub
  var githubUserId = options.githubUserId = req.query.user || authedUser.ghUsername || authedUser.githubUserId();

  // Page metadata
  pageMetadata(options, ['Repositories', 'GitHub']);

  var pagination = getDefaultPagination(req);
  pagination.itemsPerPage = 30; // GitHub Default

  //--- Tasks
  tasks.push(function (callback) {
    async.waterfall([

      // githubUser
      function (callback) {
        github.user.getFrom({
          user: encodeURIComponent(githubUserId),
        }, callback);
      },
      function (githubUser, callback) {
        options.githubUser = githubUser;
        options.userGitHubRepoListPageUrl = helpers.updateUrlQueryString(authedUser.userGitHubRepoListPageUrl, {
          user: githubUser.login
        });

        // Pagination
        pagination.numItems = githubUser.public_repos;

        callback(null);
      },

      // gihubRepos
      function (callback) {
        github.repos.getFromUser({
          user: encodeURIComponent(githubUserId),
          page: pagination.currentPage,
          per_page: pagination.itemsPerPage
        }, callback);
      },
      // function (githubRepoList, callback) {
      //   githubRepoList = _.where(githubRepoList, {language: 'JavaScript'});
      //   callback(null, githubRepoList);
      // },
      function (githubRepoList, callback) {
        _.each(githubRepoList, function (githubRepo) {
          var url = authedUser.userGitHubRepoPageUrl;
          url = helpers.updateUrlQueryString(url, {
            user: options.githubUser.login,
            repo: githubRepo.name
          });
          githubRepo.userGitHubRepoPageUrl = url;
        });
        options.githubRepoList = githubRepoList;

        callback(null);
      },
    ], callback);
  });

  //---
  async.parallel(tasks, function (err) {
    if (err) {
      console.error(err);
      return statusCodePage(req, res, next, {
        statusCode: 500,
        statusMessage: 'Server Error'
      });
    }

    options.paginationRendered = pagination.renderDefault(req);

    res.render('pages/userGitHubRepoListPage', options);
  });
};

exports.userGitHubImportScriptPage = function (req, res, next) {
  var authedUser = req.session.user;

  if (!authedUser) return res.redirect('/login');

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // GitHub
  var githubUserId = options.githubUserId = req.body.user || req.query.user || authedUser.ghUsername || authedUser.githubUserId();
  var githubRepoName = options.githubRepoName = req.body.repo || req.query.repo;
  var githubBlobPath = options.githubBlobPath = req.body.path || req.query.path;

  if (!(githubUserId && githubRepoName && githubBlobPath)) {
    return statusCodePage(req, res, next, {
      statusCode: 400,
      statusMessage: 'Bad Request. Require <code>user</code>, <code>repo</code>, and <code>path</code> to be set.'
    });
  }

  async.waterfall([

    // Validate blob
    function (callback) {
      github.gitdata.getJavascriptBlobs({
        user: encodeURIComponent(githubUserId),
        repo: encodeURIComponent(githubRepoName)
      }, callback);
    },
    function (javascriptBlobs, callback) {
      var javascriptBlob = _.findWhere(javascriptBlobs, { path: githubBlobPath });

      javascriptBlob = parseJavascriptBlob(javascriptBlob);

      if (!javascriptBlob.canUpload)
        return callback(javascriptBlob.errors);

      options.javascriptBlob = javascriptBlob;
      callback(null);
    },

    //
    function (callback) {
      github.usercontent.getBlobAsUtf8({
        user: encodeURIComponent(githubUserId),
        repo: encodeURIComponent(githubRepoName),
        path: encodeURIComponent(githubBlobPath)
      }, callback);
    },
    function (blobUtf8, callback) {
      // Double check file size.
      if (blobUtf8.length > settings.maximum_upload_script_size)
        return callback(util.format('File size is larger than maximum (%s bytes).', settings.maximum_upload_script_size));

      var onScriptStored = function (script) {
        if (script) {
          options.script = script;
          callback(null);
        } else {
          callback('Error while uploading script.');
        }
      };

      if (options.javascriptBlob.isUserJS) {
        //
        var userscriptHeaderRegex = /^\/\/ ==UserScript==([\s\S]*?)^\/\/ ==\/UserScript==/m;
        var m = userscriptHeaderRegex.exec(blobUtf8);
        if (m && m[1]) {
          var userscriptMeta = scriptStorage.parseMeta(m[1]);
          scriptStorage.storeScript(authedUser, userscriptMeta, blobUtf8, onScriptStored);
        } else {
          callback('Specified file does not contain a userscript header.');
        }
      } else if (options.javascriptBlob.isJSLibrary) {
        var scriptName = options.javascriptBlob.path.name;
        var jsLibraryMeta = scriptName;
        scriptStorage.storeScript(authedUser, jsLibraryMeta, blobUtf8, onScriptStored);
      } else {
        callback('Invalid filetype.');
      }
    },
  ], function (err) {
    if (err) {
      console.error(err);
      console.error(githubUserId, githubRepoName, githubBlobPath);
      return statusCodePage(req, res, next, {
        statusCode: 400,
        statusMessage: err
      });
    }

    var script = modelParser.parseScript(options.script);
    return res.redirect(script.scriptPageUrl);
  });
};

exports.userGitHubRepoPage = function (req, res, next) {
  var authedUser = req.session.user;

  if (!authedUser) return res.redirect('/login');

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // GitHub
  var githubUserId = options.githubUserId = req.query.user || authedUser.ghUsername || authedUser.githubUserId();
  var githubRepoName = options.githubRepoName = req.query.repo;

  if (!(githubUserId && githubRepoName)) {
    return statusCodePage(req, res, next, {
      statusCode: 400,
      statusMessage: 'Bad Request. Require <code>?user=githubUserName&repo=githubRepoName</code>'
    });
  }

  options.userGitHubRepoListPageUrl = helpers.updateUrlQueryString(authedUser.userGitHubRepoListPageUrl, {
    user: githubUserId,
  });
  options.userGitHubRepoPageUrl = helpers.updateUrlQueryString(authedUser.userGitHubRepoPageUrl, {
    user: githubUserId,
    repo: githubRepoName
  });

  // Page metadata
  pageMetadata(options, ['Import', 'GitHub']);

  //--- Tasks

  tasks.push(function (callback) {
    async.waterfall([
      function (callback) {
        github.repos.get({
          user: encodeURIComponent(githubUserId),
          repo: encodeURIComponent(githubRepoName)
        }, callback);
      },
      function (repo, callback) {
        options.repo = repo;
        options.repoAsEncoded = {
          default_branch: encodeURI(options.repo.default_branch)
        }

        github.gitdata.getJavascriptBlobs({
          user: encodeURIComponent(repo.owner.login),
          repo: encodeURIComponent(repo.name)
        }, callback);
      },
      function (javascriptBlobs, callback) {
        options.javascriptBlobs = javascriptBlobs;
        _.each(javascriptBlobs, function (javascriptBlob) {
          // Urls
          javascriptBlob.userGitHubImportPageUrl = helpers.updateUrlQueryString(authedUser.userGitHubImportPageUrl, {
            user: githubUserId,
            repo: githubRepoName,
            path: javascriptBlob.path
          });
        });
        _.each(javascriptBlobs, parseJavascriptBlob);

        // If the repo has >1 script, keep the the current page open.
        options.openImportInNewTab = javascriptBlobs.length > 1;

        callback(null);
      },
    ], callback)
  });

  //---
  async.parallel(tasks, function (err) {
    if (err) return next();

    res.render('pages/userGitHubRepoPage', options);
  });
};

var parseJavascriptBlob = function (javascriptBlob) {
  // Parsing Script Name & Type from path
  var blobPathRegex = /^(.*\/)?(.+?)((\.user)?\.js)$/;
  var m = blobPathRegex.exec(javascriptBlob.path);
  javascriptBlob.isUserJS = !!m[4]; // .user exists
  javascriptBlob.isJSLibrary = !m[4]; // .user doesn't exist

  javascriptBlob.path = {
    full: javascriptBlob.path,
    dir: m[1],
    name: m[2],
    ext: m[3],
    filename: m[2] + m[3]
  };

  javascriptBlob.pathAsEncoded = {
    full: encodeURI(javascriptBlob.path.full),
    dir: encodeURI(javascriptBlob.path.dir),
    name: encodeURI(javascriptBlob.path.name),
    ext: encodeURI(javascriptBlob.path.ext),
    filename: encodeURI(javascriptBlob.path.filename)
  };

  // Errors
  javascriptBlob.canUpload = true;
  javascriptBlob.errors = [];

  if (javascriptBlob.size > settings.maximum_upload_script_size) {
    javascriptBlob.errors.push({
      msg: util.format('File size is larger than maximum (%s bytes).', settings.maximum_upload_script_size)
    });
  }

  if (javascriptBlob.errors.length)
    javascriptBlob.canUpload = !javascriptBlob.errors.length;

  return javascriptBlob;
};

// Sloppy code to let a user add scripts to their acount
exports.userManageGitHubPage = function (req, res, next) {
  var authedUser = req.session.user;

  if (!authedUser) return res.redirect('/login');

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // Page metadata
  pageMetadata(options, ['Manage', 'GitHub']);

  //
  var TOO_MANY_SCRIPTS = 'GitHub user has too many scripts to batch import.';
  tasks.push(function (callback) {
    var githubUserName = req.query.user || authedUser.ghUsername;

    async.waterfall([
      // authedUser.ghUsername
      function (callback) {
        if (githubUserName || authedUser.ghUsername) {
          callback(null);
        } else {
          async.waterfall([
            function (callback) {
              var githubUserId = authedUser.githubUserId();
              github.user.getFrom({
                user: encodeURIComponent(githubUserId)
              }, callback);
            },
            function (githubUser, callback) {
              options.githubUser = githubUser;
              console.log(githubUser);
              User.findOne({
                _id: authedUser._id
              }, callback);
            },
            function (userData, callback) {
              console.log(userData);
              userData.ghUsername = options.githubUser.login;
              userData.save(callback);
            },
            function (callback) {
              console.log(util.format('Updated User(%s).ghUsername', userData.name));
              callback(null);
            },
          ], callback);
        }
      },
      // Fetch repos and format for template.
      function (callback) {
        console.log(githubUserName);
        var repoManager = RepoManager.getManager(githubUserName, authedUser);
        repoManager.fetchRecentRepos(function () {
          // convert the repos object to something mustache can use
          options.repos = repoManager.makeRepoArray();

          var repos = repoManager.repos;
          callback(null, repos);
        });
      },
      // Import repos.
      function (repos, callback) {
        var loadable = {};
        console.log(req.body);
        _.each(req.body, function (repo, reponame) {
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
        });

        // Load the scripts onto the site
        if (_.size(loadable) > 0) {
          console.log('loadScripts');
          var githubUserName = authedUser.ghUsername;
          RepoManager.getManager(githubUserName, authedUser, loadable).loadScripts(function () {
            console.log('preredirect');
            res.redirect(authedUser.userScriptListPageUrl);
            console.log('redirect');
            callback(null);
          });
        } else {
          callback(null);
        }
      },
    ], callback);
  });


  //---
  async.parallel(tasks, function (err) {
    if (err) {
      return statusCodePage(req, res, next, {
        statusMessage: err
      })
    }

    console.log('render');
    res.render('pages/userManageGitHub', options);
  });
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
      script.size > settings.maximum_upload_script_size) {
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
exports.update = function (req, res, next) {
  var user = req.session.user;
  var scriptUrls = req.body.urls ? Object.keys(req.body.urls) : '';
  var installRegex = null;
  var installNames = [];
  var username = user.name.toLowerCase();

  if (!user) { return res.redirect('/login'); }

  if (typeof req.body.about !== 'undefined') {
    // Update the about section of a user's profile
    User.findOneAndUpdate({ _id: user._id },
      { about: req.body.about },
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
            fork.unshift({
              author: origScript.author, url: origScript
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

function getExistingScript(req, options, authedUser, callback) {
  options.isLib = req.route.params.isLib;

  if (!req.route.params.scriptname) {

    // A user who isn't logged in can't write a new script
    if (!authedUser) { return callback(null); }

    // Page metadata
    pageMetadata(options, 'New ' + (options.isLib ? 'Library ' : 'Script'));

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

      if (script.meta.oujs && script.meta.oujs.collaborator) {
        if (typeof script.meta.oujs.collaborator === 'string') {
          collaborators.push(script.meta.oujs.collaborator);
        } else {
          collaborators = script.meta.oujs.collaborator;
        }
      }

      stream.on('data', function (d) { bufs.push(d); });
      stream.on('end', function () {
        // Page metadata
        pageMetadata(options, 'Edit ' + script.name);

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

exports.editScript = function (req, res, next) {
  var authedUser = req.session.user;

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.role < 4;

  // Page metadata
  pageMetadata(options);

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
  async.parallel(tasks, function (err) {
    if (err) return next();

    res.render('pages/scriptViewSourcePage', options);
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
