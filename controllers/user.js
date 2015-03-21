'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var fs = require('fs');
var formidable = require('formidable');
var async = require('async');
var _ = require('underscore');
var util = require('util');

var Comment = require('../models/comment').Comment;
var Script = require('../models/script').Script;
var Strategy = require('../models/strategy').Strategy;
var User = require('../models/user').User;
var Discussion = require('../models/discussion').Discussion;

var categories = require('../controllers/discussion').categories;

var userRoles = require('../models/userRoles.json');
var scriptStorage = require('./scriptStorage');
var modelParser = require('../libs/modelParser');
var modelQuery = require('../libs/modelQuery');
var flagLib = require('../libs/flag');
var removeLib = require('../libs/remove');
var stats = require('../libs/stats');
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
var orderDir = require('../libs/templateHelpers').orderDir;
var removeReasons = require('../views/includes/userModals.json').removeReasons;

function caseInsensitive (aStr) {
  return new RegExp('^' + (aStr || '').replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1")
    + '$', 'i');
}

var setupUserModerationUITask = function (aOptions) {
  var user = aOptions.user;
  var authedUser = aOptions.authedUser;

  // Default to infinity
  aOptions.threshold = '\u221E';

  // Default to &ndash;
  aOptions.flags = '\u2013';

  return function (aCallback) {
    var flagUrl = '/flag/users/' + user.name;

    // Can't flag when not logged in or when is authedUser.
    if (!authedUser || aOptions.isYou) {
      aCallback();
      return;
    }
    flagLib.flaggable(User, user, authedUser, function (aCanFlag, aAuthor, aFlag) {
      if (aFlag) {
        flagUrl += '/unflag';
        aOptions.flagged = true;
        aOptions.canFlag = true;
      } else {
        aOptions.canFlag = aCanFlag;
      }
      aOptions.flagUrl = flagUrl;

      removeLib.removeable(User, user, authedUser, function (aCanRemove, aAuthor) {
        aOptions.canRemove = aCanRemove;
        aOptions.flags = user.flags || 0;

        if (!aCanRemove) {
          return aCallback();
        }

        flagLib.getThreshold(User, user, aAuthor, function (aThreshold) {
          aOptions.threshold = aThreshold || 0;
          aCallback();
        });
      });
    });
  };
};

var getUserSidePanelTasks = function (aOptions) {
  var tasks = [];

  //--- Tasks

  // Setup the flag user UI
  tasks.push(setupUserModerationUITask(aOptions));

  return tasks;
};

var getUserPageTasks = function (aOptions) {
  var tasks = [];

  // Shortcuts
  var user = aOptions.user;

  //--- Tasks

  // userScriptListCountQuery
  var userScriptListCountQuery = Script.find({ _authorId: user._id, flagged: { $ne: true } });
  tasks.push(countTask(userScriptListCountQuery, aOptions, 'scriptListCount'));

  // userCommentListCountQuery
  var userCommentListCountQuery = Comment.find({ _authorId: user._id, flagged: { $ne: true } });
  tasks.push(countTask(userCommentListCountQuery, aOptions, 'commentListCount'));

  return tasks;
};

var setupUserSidePanel = function (aOptions) {
  // Shortcuts
  var user = aOptions.user;
  var authedUser = aOptions.authedUser;

  // User
  if (aOptions.isYou) {
    aOptions.userTools = {};
  }

  // Mod
  if (authedUser && authedUser.isMod && (authedUser.role < user.role || aOptions.isYou)) {
    //aOptions.userTools = {}; // TODO: Support moderator edits of user profiles?
    aOptions.modTools = {};

    if (removeReasons) {
      aOptions.modTools.hasRemoveReasons = true;
      aOptions.modTools.removeReasons = [];
      removeReasons.forEach(function (aReason) {
        aOptions.modTools.removeReasons.push({ 'name' : aReason });
      });
    }
  }

  // Admin
  if (authedUser && authedUser.isAdmin && (authedUser.role < user.role || aOptions.isYou)) {
    aOptions.adminTools = {};

    // Auth As This User
    aOptions.adminTools.authAsUserUrl = '/admin/authas?username=' + encodeURIComponent(user.name);

    // user.role
    // Allow authedUser to raise target user role to the level below him.
    var roles = _.map(userRoles, function (aRoleName, aIndex) {
      return {
        id: aIndex,
        name: aRoleName,
        selected: aIndex === user.role
      };
    });

    if (aOptions.isYou) {
      // Only have your current role selectable.
      roles = [roles[authedUser.role]];
    } else {
      roles = roles.splice(authedUser.role + 1);
      roles.reverse();
    }

    aOptions.adminTools.availableRoles = roles;
  }
};

exports.userListPage = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // Page metadata
  pageMetadata(options, 'Users');

  // Order dir
  orderDir(aReq, options, 'name', 'desc');
  orderDir(aReq, options, 'role', 'asc');

  // userListQuery
  var userListQuery = User.find();

  // userListQuery: Defaults
  modelQuery.applyUserListQueryDefaults(userListQuery, options, aReq);

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
    options.paginationRendered = pagination.renderDefault(aReq);

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
  }
  function render() { aRes.render('pages/userListPage', options); }
  function asyncComplete(err) { if (err) { return aNext(); } else { preRender(); render(); } }
  async.parallel(tasks, asyncComplete);
};

// View information and scripts of a user
exports.view = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  var username = aReq.params.username;

  User.findOne({
    name: caseInsensitive(username)
  }, function (aErr, aUserData) {
    if (aErr || !aUserData) { return aNext(); }

    //
    var options = {};
    var tasks = [];

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    // User
    var user = options.user = modelParser.parseUser(aUserData);
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
    modelQuery.applyScriptListQueryDefaults(scriptListQuery, options, aReq);

    //--- Tasks

    // UserPage tasks
    tasks = tasks.concat(getUserPageTasks(options));

    // UserSidePanel tasks
    tasks = tasks.concat(getUserSidePanelTasks(options));

    // Stats tasks
    tasks = tasks.concat(stats.getSummaryTasks(options));

    //---
    function preRender() { }
    function render() { aRes.render('pages/userPage', options); }
    function asyncComplete() { preRender(); render(); }
    async.parallel(tasks, asyncComplete);
  });
};

exports.userCommentListPage = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  var username = aReq.params.username;

  User.findOne({
    name: caseInsensitive(username)
  }, function (aErr, aUserData) {
    if (aErr || !aUserData) { return aNext(); }

    //
    var options = {};
    var tasks = [];

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    // User
    var user = options.user = modelParser.parseUser(aUserData);
    options.isYou = authedUser && user && authedUser._id == user._id;

    // Page metadata
    pageMetadata(options, [user.name, 'Users']);
    options.isUserCommentListPage = true;

    // commentListQuery
    var commentListQuery = Comment.find();

    // commentListQuery: author=user
    commentListQuery.find({ _authorId: user._id });

    // commentListQuery: Defaults
    modelQuery.applyCommentListQueryDefaults(commentListQuery, options, aReq);
    commentListQuery.sort('-created');

    // commentListQuery: Pagination
    var pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

    // commentListQuery: Populate: discussion
    commentListQuery.populate({
      path: '_discussionId',
      model: 'Discussion'
    });

    // SearchBar
    options.searchBarPlaceholder = 'Search Comments from ' + user.name;
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

      // comment.author
      _.map(options.commentList, function (aComment) {
        aComment.author = modelParser.parseUser(aComment._authorId);
      });

      // comment.content render
      _.map(options.commentList, modelParser.renderComment);

      // comment.discussion & comment.category & comment.script
      _.map(options.commentList, function (aComment) {
        if (aComment._discussionId) {
          aComment.discussion = modelParser.parseDiscussion(aComment._discussionId);

          var category = _.findWhere(categories, { slug: aComment.discussion.category });
          if (!category) {
            category = modelParser.parseCategoryUnknown(aComment.discussion.category);
          }
          aComment.category = modelParser.parseCategory(category);

          if (aComment.discussion.issue) {
            aComment.script = {
              scriptPageUrl: aComment.category.categoryPageUrl.replace('/issues', ''),
              name: category.name
            };
            category.name = 'Issues';
          } else {
            aComment.script = {
              scriptPageUrl: '/forum',
              name: 'Forum'
            };
          }
        }
      });

      // Pagination
      options.paginationRendered = pagination.renderDefault(aReq);
    }
    function render() { aRes.render('pages/userCommentListPage', options); }
    function asyncComplete() { preRender(); render(); }
    async.parallel(tasks, asyncComplete);
  });
};

exports.userScriptListPage = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  var username = aReq.params.username;

  User.findOne({
    name: caseInsensitive(username)
  }, function (aErr, aUserData) {
    if (aErr || !aUserData) { return aNext(); }

    //
    var options = {};
    var tasks = [];

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    // User
    var user = options.user = modelParser.parseUser(aUserData);
    options.isYou = authedUser && user && authedUser._id == user._id;

    // Page metadata
    pageMetadata(options, [user.name, 'Users']);
    options.isUserScriptListPage = true;

    // Order dir
    orderDir(aReq, options, 'name', 'asc');
    orderDir(aReq, options, 'install', 'desc');
    orderDir(aReq, options, 'rating', 'desc');
    orderDir(aReq, options, 'updated', 'desc');

    // scriptListQuery
    var scriptListQuery = Script.find();

    // scriptListQuery: author=user
    scriptListQuery.find({ _authorId: user._id });

    // scriptListQuery: Defaults
    modelQuery.applyScriptListQueryDefaults(scriptListQuery, options, aReq);

    // scriptListQuery: Pagination
    var pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

    // SearchBar
    options.searchBarPlaceholder = 'Search Scripts from ' + user.name;
    options.searchBarFormAction = '';

    //--- Tasks

    // Pagination
    tasks.push(pagination.getCountTask(scriptListQuery));

    // scriptListQuery
    tasks.push(execQueryTask(scriptListQuery, options, 'scriptList'));

    // UserPage tasks
    tasks = tasks.concat(getUserPageTasks(options));

    // Stats tasks
    tasks = tasks.concat(stats.getSummaryTasks(options));

    //---
    function preRender() {
      // scriptList
      options.scriptList = _.map(options.scriptList, modelParser.parseScript);

      // Pagination
      options.paginationRendered = pagination.renderDefault(aReq);

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
    }
    function render() { aRes.render('pages/userScriptListPage', options); }
    function asyncComplete() { preRender(); render(); }
    async.parallel(tasks, asyncComplete);
  });
};

exports.userEditProfilePage = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  User.findOne({
    _id: authedUser._id
  }, function (aErr, aUserData) {
    if (aErr || !aUserData) { return aNext(); }

    //
    var options = {};
    var tasks = [];

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    // User
    var user = options.user = modelParser.parseUser(aUserData);
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
    function preRender() { }
    function render() { aRes.render('pages/userEditProfilePage', options); }
    function asyncComplete() { preRender(); render(); }
    async.parallel(tasks, asyncComplete);
  });
};

exports.userEditPreferencesPage = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  User.findOne({
    _id: authedUser._id
  }, function (aErr, aUserData) {
    if (aErr || !aUserData) { return aNext(); }

    //
    var options = {};
    var tasks = [];

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    // User
    var user = options.user = modelParser.parseUser(aUserData);
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
    tasks.push(function (aCallback) {
      var userStrats = user.strategies.slice(0);
      Strategy.find({}, function (aErr, aStrats) {
        var defaultStrategy = userStrats[userStrats.length - 1];
        var strategy = null;
        var name = null;
        options.openStrategies = [];
        options.usedStrategies = [];

        // Get the strategies we have OAuth keys for
        aStrats.forEach(function (aStrat) {
          if (aStrat.name === defaultStrategy) { return; }

          if (userStrats.indexOf(aStrat.name) > -1) {
            options.usedStrategies.push({
              'strat': aStrat.name,
              'display': aStrat.display
            });
          } else {
            options.openStrategies.push({
              'strat': aStrat.name,
              'display': aStrat.display
            });
          }
        });

        // Get OpenId strategies
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

        options.defaultStrategy = strategies[defaultStrategy].name;
        options.haveOtherStrategies = options.usedStrategies.length > 0;

        aCallback();
      });
    });

    // UserPage tasks
    tasks = tasks.concat(getUserPageTasks(options));

    // UserSidePanel tasks
    tasks = tasks.concat(getUserSidePanelTasks(options));

    function preRender() { }
    function render() { aRes.render('pages/userEditPreferencesPage', options); }
    function asyncComplete() { preRender(); render(); }
    async.parallel(tasks, asyncComplete);
  });
};

exports.newScriptPage = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

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
  options.maximumUploadScriptSize = settings.maximum_upload_script_size;

  // Page metadata
  pageMetadata(options, 'New Script');

  //---
  async.parallel(tasks, function (aErr) {
    if (aErr) return aNext();

    aRes.render('pages/newScriptPage', options);
  });
};

exports.newLibraryPage = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

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
  options.maximumUploadScriptSize = settings.maximum_upload_script_size;

  // Page metadata
  pageMetadata(options, 'New Library');

  //---
  async.parallel(tasks, function (aErr) {
    if (aErr) return aNext();

    aRes.render('pages/newScriptPage', options);
  });
};

exports.userGitHubRepoListPage = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // GitHub
  var githubUserId = options.githubUserId = aReq.query.user || authedUser.ghUsername || authedUser.githubUserId();

  // Page metadata
  pageMetadata(options, ['Repositories', 'GitHub']);

  var pagination = getDefaultPagination(aReq);
  pagination.itemsPerPage = 30; // GitHub Default

  //--- Tasks
  tasks.push(function (aCallback) {
    async.waterfall([

      // githubUser
      function (aCallback) {
        github.user.getFrom({
          user: encodeURIComponent(githubUserId),
        }, aCallback);
      },
      function (aGithubUser, aCallback) {
        options.githubUser = aGithubUser;
        options.userGitHubRepoListPageUrl = helpers.updateUrlQueryString(authedUser.userGitHubRepoListPageUrl, {
          user: aGithubUser.login
        });

        // Pagination
        pagination.numItems = aGithubUser.public_repos;

        aCallback(null);
      },

      // gihubRepos
      function (aCallback) {
        github.repos.getFromUser({
          user: encodeURIComponent(githubUserId),
          page: pagination.currentPage,
          per_page: pagination.itemsPerPage
        }, aCallback);
      },
      // function (aGithubRepoList, aCallback) {
      //   githubRepoList = _.where(aGithubRepoList, {language: 'JavaScript'});
      //   aCallback(null, githubRepoList);
      // },
      function (aGithubRepoList, aCallback) {
        _.each(aGithubRepoList, function (aGithubRepo) {
          var url = authedUser.userGitHubRepoPageUrl;
          url = helpers.updateUrlQueryString(url, {
            user: options.githubUser.login,
            repo: aGithubRepo.name
          });
          aGithubRepo.userGitHubRepoPageUrl = url;
        });
        options.githubRepoList = aGithubRepoList;

        aCallback(null);
      },
    ], aCallback);
  });

  //---
  async.parallel(tasks, function (aErr) {
    if (aErr) {
      console.error(aErr);
      return statusCodePage(aReq, aRes, aNext, {
        statusCode: 500,
        statusMessage: 'Server Error'
      });
    }

    options.paginationRendered = pagination.renderDefault(aReq);

    aRes.render('pages/userGitHubRepoListPage', options);
  });
};

exports.userGitHubImportScriptPage = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  //
  var options = {};

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // GitHub
  var githubUserId = options.githubUserId = aReq.body.user || aReq.query.user || authedUser.ghUsername || authedUser.githubUserId();
  var githubRepoName = options.githubRepoName = aReq.body.repo || aReq.query.repo;
  var githubBlobPath = options.githubBlobPath = aReq.body.path || aReq.query.path;

  if (!(githubUserId && githubRepoName && githubBlobPath)) {
    return statusCodePage(aReq, aRes, aNext, {
      statusCode: 400,
      statusMessage: 'Bad Request. Require <code>user</code>, <code>repo</code>, and <code>path</code> to be set.'
    });
  }

  async.waterfall([

    // Validate blob
    function (aCallback) {
      github.gitdata.getJavascriptBlobs({
        user: encodeURIComponent(githubUserId),
        repo: encodeURIComponent(githubRepoName)
      }, aCallback);
    },
    function (aJavascriptBlobs, aCallback) {
      var javascriptBlob = _.findWhere(aJavascriptBlobs, { path: githubBlobPath });

      javascriptBlob = parseJavascriptBlob(javascriptBlob);

      if (!javascriptBlob.canUpload)
        return aCallback(javascriptBlob.errors);

      options.javascriptBlob = javascriptBlob;
      aCallback(null);
    },

    //
    function (aCallback) {
      github.usercontent.getBlobAsUtf8({
        user: encodeURIComponent(githubUserId),
        repo: encodeURIComponent(githubRepoName),
        path: encodeURIComponent(githubBlobPath)
      }, aCallback);
    },
    function (aBlobUtf8, aCallback) {
      // Double check file size.
      if (aBlobUtf8.length > settings.maximum_upload_script_size)
        return aCallback(util.format('File size is larger than maximum (%s bytes).', settings.maximum_upload_script_size));

      var onScriptStored = function (aScript) {
        if (aScript) {
          options.script = aScript;
          aCallback(null);
        } else {
          aCallback('Error while uploading script.');
        }
      };

      if (options.javascriptBlob.isUserJS) {
        //
        var userscriptHeaderRegex = /^(?:\uFEFF)?\/\/ ==UserScript==([\s\S]*?)^\/\/ ==\/UserScript==/m;
        var m = userscriptHeaderRegex.exec(aBlobUtf8);
        if (m && m[1]) {
          var userscriptMeta = scriptStorage.parseMeta(m[1], true);
          scriptStorage.storeScript(authedUser, userscriptMeta, aBlobUtf8, onScriptStored);
        } else {
          aCallback('Specified file does not contain a userscript header.');
        }
      } else if (options.javascriptBlob.isJSLibrary) {
        var scriptName = options.javascriptBlob.path.name;
        var jsLibraryMeta = scriptName;
        scriptStorage.storeScript(authedUser, jsLibraryMeta, aBlobUtf8, onScriptStored);
      } else {
        aCallback('Invalid filetype.');
      }
    },
  ], function (aErr) {
    if (aErr) {
      console.error(aErr);
      console.error(githubUserId, githubRepoName, githubBlobPath);
      return statusCodePage(aReq, aRes, aNext, {
        statusCode: 400,
        statusMessage: aErr
      });
    }

    var script = modelParser.parseScript(options.script);
    return aRes.redirect(script.scriptPageUrl);
  });
};

exports.userGitHubRepoPage = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // GitHub
  var githubUserId = options.githubUserId = aReq.query.user || authedUser.ghUsername || authedUser.githubUserId();
  var githubRepoName = options.githubRepoName = aReq.query.repo;

  if (!(githubUserId && githubRepoName)) {
    return statusCodePage(aReq, aRes, aNext, {
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

  tasks.push(function (aCallback) {
    async.waterfall([
      function (aCallback) {
        github.repos.get({
          user: encodeURIComponent(githubUserId),
          repo: encodeURIComponent(githubRepoName)
        }, aCallback);
      },
      function (aRepo, aCallback) {
        options.repo = aRepo;
        options.repoAsEncoded = {
          default_branch: encodeURI(options.repo.default_branch)
        };

        github.gitdata.getJavascriptBlobs({
          user: encodeURIComponent(aRepo.owner.login),
          repo: encodeURIComponent(aRepo.name)
        }, aCallback);
      },
      function (aJavascriptBlobs, aCallback) {
        options.javascriptBlobs = aJavascriptBlobs;
        _.each(aJavascriptBlobs, function (javascriptBlob) {
          // Urls
          javascriptBlob.userGitHubImportPageUrl = helpers.updateUrlQueryString(authedUser.userGitHubImportPageUrl, {
            user: githubUserId,
            repo: githubRepoName,
            path: javascriptBlob.path
          });
        });
        _.each(aJavascriptBlobs, parseJavascriptBlob);

        // If the repo has >1 script, keep the the current page open.
        options.openImportInNewTab = aJavascriptBlobs.length > 1;

        aCallback(null);
      },
    ], aCallback);
  });

  //---
  async.parallel(tasks, function (aErr) {
    if (aErr) return aNext();

    aRes.render('pages/userGitHubRepoPage', options);
  });
};

var parseJavascriptBlob = function (aJavascriptBlob) {
  // Parsing Script Name & Type from path
  var blobPathRegex = /^(.*\/)?(.+?)((\.user)?\.js)$/;
  var m = blobPathRegex.exec(aJavascriptBlob.path);
  aJavascriptBlob.isUserJS = !!m[4]; // .user exists
  aJavascriptBlob.isJSLibrary = !m[4]; // .user doesn't exist

  aJavascriptBlob.path = {
    full: aJavascriptBlob.path,
    dir: m[1],
    name: m[2],
    ext: m[3],
    filename: m[2] + m[3]
  };

  aJavascriptBlob.pathAsEncoded = {
    full: encodeURI(aJavascriptBlob.path.full),
    dir: encodeURI(aJavascriptBlob.path.dir),
    name: encodeURI(aJavascriptBlob.path.name),
    ext: encodeURI(aJavascriptBlob.path.ext),
    filename: encodeURI(aJavascriptBlob.path.filename)
  };

  // Errors
  aJavascriptBlob.canUpload = true;
  aJavascriptBlob.errors = [];

  if (aJavascriptBlob.size > settings.maximum_upload_script_size) {
    aJavascriptBlob.errors.push({
      msg: util.format('File size is larger than maximum (%s bytes).', settings.maximum_upload_script_size)
    });
  }

  if (aJavascriptBlob.errors.length)
    aJavascriptBlob.canUpload = !aJavascriptBlob.errors.length;

  return aJavascriptBlob;
};

exports.uploadScript = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;
  var isLib = aReq.params.isLib;
  var userjsRegex = /\.user\.js$/;
  var jsRegex = /\.js$/;
  var form = null;

  if (!/multipart\/form-data/.test(aReq.headers['content-type'])) {
    return aNext();
  }

  form = new formidable.IncomingForm();
  form.parse(aReq, function (aErr, aFields, aFiles) {
    var script = aFiles.script;
    var stream = null;
    var bufs = [];
    var failUrl = '/user/add/' + (isLib ? 'lib' : 'scripts');

    // Reject non-js and huge files
    if (script.type !== 'application/javascript' ||
      script.size > settings.maximum_upload_script_size) {
      return aRes.redirect(failUrl);
    }

    stream = fs.createReadStream(script.path);
    stream.on('data', function (aData) { bufs.push(aData); });

    stream.on('end', function () {
      User.findOne({ _id: authedUser._id }, function (aErr, aUser) {
        var scriptName = aFields.script_name;
        if (isLib) {
          scriptStorage.storeScript(aUser, scriptName, Buffer.concat(bufs),
            function (aScript) {
              if (!aScript) { return aRes.redirect(failUrl); }

              aRes.redirect('/libs/' + encodeURI(aScript.installName
                .replace(jsRegex, '')));
            });
        } else {
          scriptStorage.getMeta(bufs, function (aMeta) {
            scriptStorage.storeScript(aUser, aMeta, Buffer.concat(bufs),
              function (aScript) {
                if (!aScript) { return aRes.redirect(failUrl); }

                aRes.redirect('/scripts/' + encodeURI(aScript.installName
                  .replace(userjsRegex, '')));
              });
          });
        }
      });
    });
  });
};

// post route to update a user's account
exports.update = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;
  var scriptUrls = aReq.body.urls ? Object.keys(aReq.body.urls) : '';
  var installRegex = null;
  var installNames = [];
  var username = authedUser.name.toLowerCase();

  if (typeof aReq.body.about !== 'undefined') {
    // Update the about section of a user's profile
    User.findOneAndUpdate({ _id: authedUser._id },
      { about: aReq.body.about },
      function (aErr, aUser) {
        if (aErr) { aRes.redirect('/'); }

        authedUser.about = aUser.about;
        aRes.redirect('/users/' + aUser.name);
      });
  } else {
    // Remove scripts (currently no UI)
    installRegex = new RegExp('^\/install\/(' + username + '\/.+)$');
    scriptUrls.forEach(function (aUrl) {
      var matches = installRegex.exec(aUrl);
      if (matches && matches[1]) { installNames.push(matches[1]); }
    });
    async.each(installNames, scriptStorage.deleteScript, function () {
      aRes.redirect('/users/' + authedUser.name);
    });
  }
};

// Submit a script through the web editor
exports.submitSource = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;
  var isLib = aReq.params.isLib;
  var source = null;
  var url = null;

  function storeScript(aMeta, aSource) {
    var userjsRegex = /\.user\.js$/;
    var jsRegex = /\.js$/;

    User.findOne({ _id: authedUser._id }, function (aErr, aUser) {
      scriptStorage.storeScript(aUser, aMeta, aSource, function (aScript) {
        var redirectUrl = encodeURI(aScript ? (aScript.isLib ? '/libs/'
          + aScript.installName.replace(jsRegex, '') : '/scripts/'
          + aScript.installName.replace(userjsRegex, '')) : aReq.body.url);

        if (!aScript || !aReq.body.original) {
          return aRes.redirect(redirectUrl);
        }

        Script.findOne({ installName: aReq.body.original },
          function (aErr, aOrigScript) {
            var fork = null;
            if (aErr || !aOrigScript) { return aRes.redirect(redirectUrl); }

            fork = aOrigScript.fork || [];
            fork.unshift({
              author: aOrigScript.author, url: aOrigScript
                .installName.replace(aOrigScript.isLib ? jsRegex : userjsRegex, '')
            });
            aScript.fork = fork;

            aScript.save(function (aErr, aScript) {
              aRes.redirect(redirectUrl);
            });
          });
      });
    });
  }

  source = new Buffer(aReq.body.source);
  url = aReq.body.url;

  if (isLib) {
    storeScript(aReq.body.script_name, source);
  } else {
    scriptStorage.getMeta([source], function (aMeta) {
      if (!aMeta || !aMeta.name) { return aRes.redirect(url); }
      storeScript(aMeta, source);
    });
  }
};

function getExistingScript(aReq, aOptions, aAuthedUser, aCallback) {
  aOptions.isLib = aReq.params.isLib;

  if (aReq.params.isNew) {

    // A user who isn't logged in can't write a new script
    if (!aAuthedUser) { return aCallback(null); }

    // Page metadata
    pageMetadata(aOptions, 'New ' + (aOptions.isLib ? 'Library ' : 'Script'));

    aOptions.source = '';
    aOptions.url = aReq.url;
    aOptions.owner = true;
    aOptions.readOnly = false;
    aOptions.newScript = true;

    aCallback(aOptions);
  } else {
    aReq.params.scriptname += aOptions.isLib ? '.js' : '.user.js';
    scriptStorage.getSource(aReq, function (aScript, aStream) {
      var bufs = [];
      var collaborators = [];

      if (!aScript) { return aCallback(null); }

      if (aScript.meta.oujs && aScript.meta.oujs.collaborator) {
        if (typeof aScript.meta.oujs.collaborator === 'string') {
          collaborators.push(aScript.meta.oujs.collaborator);
        } else {
          collaborators = aScript.meta.oujs.collaborator;
        }
      }

      aStream.on('data', function (aData) { bufs.push(aData); });
      aStream.on('end', function () {
        // Page metadata
        pageMetadata(aOptions, 'Edit ' + aScript.name);

        aOptions.source = Buffer.concat(bufs).toString('utf8');
        aOptions.original = aScript.installName;
        aOptions.url = aReq.url;
        aOptions.owner = aAuthedUser && (aScript._authorId == aAuthedUser._id
          || collaborators.indexOf(aAuthedUser.name) > -1);
        aOptions.username = aAuthedUser ? aAuthedUser.name : null;
        aOptions.isLib = aScript.isLib;
        aOptions.scriptName = aScript.name;
        aOptions.readOnly = !aAuthedUser;

        aCallback(aOptions);
      });
    });
  }
}

exports.editScript = function (aReq, aRes, aNext) {

  var authedUser = aReq.session.user;

  var isNew = aReq.params.isNew;
  var isLib = aReq.params.isLib;

  //
  var options = {};
  var tasks = [];

  var installNameSlug = null;
  var scriptAuthor = null;
  var scriptNameSlug = null;

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.role < 4;
  options.isAdmin = authedUser && authedUser.role < 3;

  //--- Tasks

  // Get the info and source for an existing script for the editor
  // Also works for writing a new script
  tasks.push(function (aCallback) {
    getExistingScript(aReq, options, authedUser, function (aOpts) {
      options = aOpts;
      aCallback(!aOpts);
    });
  });

  if (!isNew) {
    installNameSlug = scriptStorage.getInstallName(aReq);
    scriptAuthor = aReq.params.username;
    scriptNameSlug = aReq.params.scriptname;

    Script.findOne({
      installName: scriptStorage
        .caseInsensitive(installNameSlug + (isLib ? '.js' : '.user.js'))
    }, function (aErr, aScriptData) {
      //---
      if (aErr || !aScriptData) { return aNext(); }

      // Script
      var script = options.script = modelParser.parseScript(aScriptData);
      options.isOwner = authedUser && authedUser._id == script._authorId;
      modelParser.renderScript(script);
      script.installNameSlug = installNameSlug;
      script.scriptPermalinkInstallPageUrl = 'https://' + aReq.get('host') +
        script.scriptInstallPageUrl;

      // Page metadata
      pageMetadata(options);

      options.isScriptViewSourcePage = true;

      //--- Tasks

      // Show the number of open issues
      var scriptOpenIssueCountQuery = Discussion.find({ category: scriptStorage
          .caseInsensitive(script.issuesCategorySlug), open: {$ne: false} });
      tasks.push(countTask(scriptOpenIssueCountQuery, options, 'issueCount'));

      //---
      async.parallel(tasks, function (aErr) {
        if (aErr) return aNext();

        aRes.render('pages/scriptViewSourcePage', options);
      });
    });
  } else {
    //---
    async.parallel(tasks, function (aErr) {
      if (aErr) return aNext();

      aRes.render('pages/scriptViewSourcePage', options);
    });
  }
};

// route to flag a user
exports.flag = function (aReq, aRes, aNext) {
  var username = aReq.params.username;
  var unflag = aReq.params.unflag;

  User.findOne({ name: username }, function (aErr, aUser) {
    var fn = flagLib[unflag && unflag === 'unflag' ? 'unflag' : 'flag'];
    if (aErr || !aUser) { return aNext(); }

    fn(User, aUser, aReq.session.user, function (aFlagged) { // NOTE: Inline function here
      aRes.redirect('/users/' + username);
    });
  });
};
