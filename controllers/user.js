'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//

//--- Dependency inclusions
var fs = require('fs');
var formidable = require('formidable');
var async = require('async');
var _ = require('underscore');
var util = require('util');

//--- Model inclusions
var Comment = require('../models/comment').Comment;
var Script = require('../models/script').Script;
var Strategy = require('../models/strategy').Strategy;
var User = require('../models/user').User;
var Discussion = require('../models/discussion').Discussion;

//--- Controller inclusions
var scriptStorage = require('./scriptStorage');

var categories = require('./discussion').categories;
var getFlaggedListForContent = require('./flag').getFlaggedListForContent;

//--- Library inclusions
// var userLib = require('../libs/user');

var helpers = require('../libs/helpers');

var modelParser = require('../libs/modelParser');
var modelQuery = require('../libs/modelQuery');

var flagLib = require('../libs/flag');
var removeLib = require('../libs/remove');
var stats = require('../libs/stats');
var github = require('./../libs/githubClient');

var renderMd = require('../libs/markdown').renderMd;
var getDefaultPagination = require('../libs/templateHelpers').getDefaultPagination;
var statusCodePage = require('../libs/templateHelpers').statusCodePage;
var execQueryTask = require('../libs/tasks').execQueryTask;
var countTask = require('../libs/tasks').countTask;
var pageMetadata = require('../libs/templateHelpers').pageMetadata;
var orderDir = require('../libs/templateHelpers').orderDir;

//--- Configuration inclusions
var userRoles = require('../models/userRoles.json');
var strategies = require('./strategies.json');
var settings = require('../models/settings.json');

var removeReasons = require('../views/includes/userModals.json').removeReasons;

//---

// WARNING: **Near** duplicate in scriptStorage.js for installName
function caseInsensitive (aStr) {
  return new RegExp('^' + (aStr || '').replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1") + '$', 'i');
}

var setupUserModerationUITask = function (aOptions) {
  var user = aOptions.user;
  var authedUser = aOptions.authedUser;

  // Default to infinity
  aOptions.threshold = '\u221E';

  // Default to &ndash;
  aOptions.flags = '\u2013';

  return (function (aCallback) {
    // Can't flag when not logged in or when is authedUser.
    if (!authedUser || aOptions.isYou) {
      aCallback();
      return;
    }
    flagLib.flaggable(User, user, authedUser, function (aCanFlag, aAuthor, aFlag) {
      if (aFlag) {
        aOptions.flagged = true;
        aOptions.canFlag = true;
      } else {
        aOptions.canFlag = aCanFlag;
      }

      removeLib.removeable(User, user, authedUser, function (aCanRemove, aAuthor) {
        aOptions.canRemove = aCanRemove;
        aOptions.flags = (user.flags ? user.flags.critical : null) || 0;

        if (!aCanRemove) {
          aCallback();
          return;
        }

        flagLib.getThreshold(User, user, aAuthor, function (aThreshold) {
          aOptions.threshold = aThreshold || 0;
          aCallback();
        });
      });
    });
  });
};

var getUserSidePanelTasks = function (aOptions) {
  var tasks = [];

  //--- Tasks

  // Setup the flag user UI
  tasks.push(setupUserModerationUITask(aOptions));

  return tasks;
};

var getUserPageTasks = function (aOptions) {
  //
  var user = null;
  var userScriptListCountQuery = null;
  var userCommentListCountQuery = null;
  var tasks = [];

  // Shortcuts
  user = aOptions.user;

  //--- Tasks

  // userScriptListCountQuery
  userScriptListCountQuery = Script.find({ _authorId: user._id, flagged: { $ne: true } });
  tasks.push(countTask(userScriptListCountQuery, aOptions, 'scriptListCount'));

  // userCommentListCountQuery
  userCommentListCountQuery = Comment.find({ _authorId: user._id, flagged: { $ne: true } });
  tasks.push(countTask(userCommentListCountQuery, aOptions, 'commentListCount'));

  return tasks;
};

var setupUserSidePanel = function (aOptions) {
  // Shortcuts
  var user = aOptions.user;
  var authedUser = aOptions.authedUser;
  var roles = null;

  // User
  if (aOptions.isYou) {
    aOptions.userTools = {};
  }

  // Mod
  if (authedUser && authedUser.isMod && (authedUser.role < user.role || aOptions.isYou)) {
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
    roles = _.map(userRoles, function (aRoleName, aIndex) {
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
  function preRender() {
    // userList
    options.userList = _.map(options.userList, modelParser.parseUser);

    // Pagination
    options.paginationRendered = pagination.renderDefault(aReq);

    // Empty list
    options.userListIsEmptyMessage = 'No users.';
    if (!!options.isFlagged) {
      options.userListIsEmptyMessage = 'No flagged users.';
    } else if (options.searchBarValue) {
      options.userListIsEmptyMessage = 'We couldn\'t find any users by this name.';
    }

    // Heading
    options.pageHeading = !!options.isFlagged ? 'Flagged Users' : 'Users';

    // Page metadata
    if (!!options.isFlagged) {
      pageMetadata(options, ['Flagged Users', 'Moderation']);
    }
  }

  function render() {
    aRes.render('pages/userListPage', options);
  }

  function asyncComplete(aErr) {
    if (aErr) {
      aNext();
      return;
    }

    async.parallel([
      function (aCallback) {
        if (!!!options.isFlagged || !options.isAdmin) {  // NOTE: Watchpoint
          aCallback();
          return;
        }
        getFlaggedListForContent('User', options, aCallback);
      }
    ], function (aErr) {
      preRender();
      render();
    });

  }

  //
  var options = {};
  var authedUser = aReq.session.user;
  var userListQuery = null;
  var pagination = null;
  var tasks = [];

  // Session
  options.authedUser = authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // Page metadata
  pageMetadata(options, 'Users');

  // Order dir
  orderDir(aReq, options, 'name', 'desc');
  orderDir(aReq, options, 'role', 'asc');

  // userListQuery
  userListQuery = User.find();

  // userListQuery: Defaults
  modelQuery.applyUserListQueryDefaults(userListQuery, options, aReq);

  // userListQuery: Pagination
  pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

  //--- Tasks

  // Pagination
  tasks.push(pagination.getCountTask(userListQuery));

  // userListQuery
  tasks.push(execQueryTask(userListQuery, options, 'userList'));

  //---
  async.parallel(tasks, asyncComplete);
};

// View information and scripts of a user
exports.view = function (aReq, aRes, aNext) {
  //
  var username = aReq.params.username;

  User.findOne({
    name: caseInsensitive(username)
  }, function (aErr, aUser) {
    function preRender() {
    }

    function render() {
      aRes.render('pages/userPage', options);
    }

    function asyncComplete() {

      async.parallel([
        function (aCallback) {
          if (!options.isAdmin) {  // NOTE: Watchpoint
            aCallback();
            return;
          }
          getFlaggedListForContent('User', options, aCallback);
        }
      ], function (aErr) {
        preRender();
        render();
      });

    }

    //
    var options = {};
    var authedUser = aReq.session.user;
    var user = null;
    var scriptListQuery = null;
    var tasks = [];

    if (aErr || !aUser) {
      aNext();
      return;
    }

    // Session
    options.authedUser = authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    // User
    options.user = user = modelParser.parseUser(aUser);
    user.aboutRendered = renderMd(user.about);
    options.isYou = authedUser && user && authedUser._id == user._id;

    // Page metadata
    pageMetadata(options, [user.name, 'Users']);
    options.isUserPage = true;

    // UserSidePanel
    setupUserSidePanel(options);

    // scriptListQuery
    scriptListQuery = Script.find();

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
    async.parallel(tasks, asyncComplete);
  });
};

exports.userCommentListPage = function (aReq, aRes, aNext) {
  //
  var username = aReq.params.username;

  User.findOne({
    name: caseInsensitive(username)
  }, function (aErr, aUser) {
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

    function render() {
      aRes.render('pages/userCommentListPage', options);
    }

    function asyncComplete() {
      preRender();
      render();
    }

    //
    var options = {};
    var authedUser = aReq.session.user;
    var user = null;
    var commentListQuery = null;
    var pagination = null;
    var tasks = [];

    if (aErr || !aUser) {
      aNext();
      return;
    }

    // Session
    options.authedUser = authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    // User
    user = options.user = modelParser.parseUser(aUser);
    options.isYou = authedUser && user && authedUser._id == user._id;

    // Page metadata
    pageMetadata(options, [user.name, 'Users']);
    options.isUserCommentListPage = true;

    // commentListQuery
    commentListQuery = Comment.find();

    // commentListQuery: author=user
    commentListQuery.find({ _authorId: user._id });

    // commentListQuery: Defaults
    modelQuery.applyCommentListQueryDefaults(commentListQuery, options, aReq);
    commentListQuery.sort('-created');

    // commentListQuery: Pagination
    pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

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
    async.parallel(tasks, asyncComplete);
  });
};

exports.userScriptListPage = function (aReq, aRes, aNext) {
  var username = aReq.params.username;

  User.findOne({
    name: caseInsensitive(username)
  }, function (aErr, aUser) {
    function preRender() {
      // scriptList
      options.scriptList = _.map(options.scriptList, modelParser.parseScript);

      // Pagination
      options.paginationRendered = pagination.renderDefault(aReq);

      // Empty list
      options.scriptListIsEmptyMessage = 'No scripts.';
      if (!!options.isFlagged) {
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

    function render() {
      aRes.render('pages/userScriptListPage', options);
    }

    function asyncComplete() {

      async.parallel([
        function (aCallback) {
          if (!!!options.isFlagged || !options.isAdmin) {  // NOTE: Watchpoint
            aCallback();
            return;
          }
          getFlaggedListForContent('Script', options, aCallback);
        },
        function (aCallback) {
          var scriptList = options.scriptList;
          var scriptKeyMax = scriptList.length - 1;

          if (scriptKeyMax >= 0 && options.isYou) {
            async.forEachOfSeries(options.scriptList, function (aScript, aScriptKey, aEachCallback) {
              var script = modelParser.parseScript(aScript);

              // Find if script has any open issues
              Discussion.find({ category: scriptStorage
                .caseSensitive(decodeURIComponent(script.issuesCategorySlug), true), open: {$ne: false} },
                  function (aErr, aDiscussions) {
                    if (!aErr) {
                      // Create a psuedo-virtual for the view
                      script._issueCount = aDiscussions.length;
                    }

                    scriptList[aScriptKey] = script;

                    if (aScriptKey === scriptKeyMax) {
                      options.scriptList = scriptList;
                      aEachCallback(); // NOTE: In for follow-through logic
                      aCallback();
                    } else {
                      aEachCallback();
                    }
                });
            });
          } else {
            aCallback();
          }
        }
      ], function (aErr) {
        preRender();
        render();
      });

    }

    //
    var options = {};
    var authedUser = aReq.session.user;
    var user = null;
    var librariesOnly = null;
    var scriptListQuery = null;
    var pagination = null;
    var tasks = [];

    if (aErr || !aUser) {
      aNext();
      return;
    }

    // Session
    options.authedUser = authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    // User
    options.user = user = modelParser.parseUser(aUser);
    options.isYou = authedUser && user && authedUser._id == user._id;

    switch (aReq.query.library) {
      case 'true': // List just libraries
        options.includeLibraries = true;
        librariesOnly = true;
        break;
      case 'false': // List just userscripts
        options.excludeLibraries = true;
        // fallthrough
      default: // List userscripts and libraries
        librariesOnly = false;
    }

    // Page metadata
    pageMetadata(options, [user.name, 'Users']);
    options.isUserScriptListPage = true;

    // Order dir
    orderDir(aReq, options, 'name', 'asc');
    orderDir(aReq, options, 'install', 'desc');
    orderDir(aReq, options, 'rating', 'desc');
    orderDir(aReq, options, 'updated', 'desc');

    // scriptListQuery
    scriptListQuery = Script.find();

    // scriptListQuery: author=user
    scriptListQuery.find({ _authorId: user._id });

    if (options.includeLibraries) { // List just Libraries and not Userscripts
      // scriptListQuery: isLib
      modelQuery.findOrDefaultToNull(scriptListQuery, 'isLib', librariesOnly, false);
    }

    // scriptListQuery: Defaults
    if (options.excludeLibraries) { // List just Userscripts and not Libraries
        // scriptListQuery: isLib
        modelQuery.findOrDefaultToNull(scriptListQuery, 'isLib', librariesOnly, false);

      // Libraries
      modelQuery.applyLibraryListQueryDefaults(scriptListQuery, options, aReq);
    } else {
      // List Userscripts and Libraries
      modelQuery.applyScriptListQueryDefaults(scriptListQuery, options, aReq);
    }

    // scriptListQuery: Pagination
    pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

    // SearchBar
    options.searchBarPlaceholder = 'Search ' +
      (options.librariesOnly ? 'Libraries' : 'Scripts') + ' from ' + user.name;
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
    async.parallel(tasks, asyncComplete);
  });
};

exports.userEditProfilePage = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  User.findOne({
    _id: authedUser._id
  }, function (aErr, aUser) {
    function preRender() {
    }

    function render() {
      aRes.render('pages/userEditProfilePage', options);
    }

    function asyncComplete() {
      preRender();
      render();
    }

    //
    var options = {};
    var user = null;
    var scriptListQuery = null;
    var tasks = [];

    if (aErr || !aUser) {
      aNext();
      return;
    }

    // Session
    options.authedUser = authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    // User
    options.user = user = modelParser.parseUser(aUser);
    options.isYou = authedUser && user && authedUser._id == user._id;

    // Page metadata
    pageMetadata(options, [user.name, 'Users']);

    // UserSidePanel
    setupUserSidePanel(options);

    // Scripts: Query
    scriptListQuery = Script.find();

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
    async.parallel(tasks, asyncComplete);
  });
};

exports.userEditPreferencesPage = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  User.findOne({
    _id: authedUser._id
  }, function (aErr, aUser) {
    function preRender() {
    }

    function render() {
      aRes.render('pages/userEditPreferencesPage', options);
    }

    function asyncComplete() {
      preRender();
      render();
    }

    //
    var options = {};
    var user = null;
    var scriptListQuery = null;
    var tasks = [];

    if (aErr || !aUser) {
      aNext();
      return;
    }

    // Session
    options.authedUser = authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    // User
    options.user = user = modelParser.parseUser(aUser);
    options.isYou = authedUser && user && authedUser._id == user._id;

    // Page metadata
    pageMetadata(options, [user.name, 'Users']);

    // UserSidePanel
    setupUserSidePanel(options);

    // Scripts: Query
    scriptListQuery = Script.find();

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
        var name = null;
        var strategy = null;
        options.openStrategies = [];
        options.usedStrategies = [];

        // Get the strategies we have OAuth keys for
        aStrats.forEach(function (aStrat) {
          if (aStrat.name === defaultStrategy) {
            return;
          }

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

    //---
    async.parallel(tasks, asyncComplete);
  });
};

exports.newScriptPage = function (aReq, aRes, aNext) {
  function preRender() {
  }

  function render() {
    aRes.render('pages/newScriptPage', options);
  }

  function asyncComplete(aErr) {
    if (aErr) {
      aNext();
      return;
    }

    preRender();
    render();
  }

  //
  var options = {};
  var authedUser = aReq.session.user;
  var tasks = [];

  // Session
  options.authedUser = authedUser = modelParser.parseUser(authedUser);
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
  async.parallel(tasks, asyncComplete);
};

exports.newLibraryPage = function (aReq, aRes, aNext) {
  function preRender() {
  }

  function render() {
    aRes.render('pages/newScriptPage', options);
  }

  function asyncComplete(aErr) {
    if (aErr) {
      aNext();
      return;
    }

    preRender();
    render();
  }
  //
  var options = {};
  var authedUser = aReq.session.user;
  var tasks = [];

  // Session
  options.authedUser = authedUser = modelParser.parseUser(authedUser);
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
  async.parallel(tasks, asyncComplete);
};


// TODO: Enhance by #723
var hasMissingExcludeAll = function (aSource) {
  var block = {};
  var exclude = null;
  var missingExcludeAll = true;

  var rHeaderContent = new RegExp(
    '^(?:\\uFEFF)?\/\/ ==UserScript==([\\s\\S]*?)^\/\/ ==\/UserScript==', 'm'
  );
  var headerContent = rHeaderContent.exec(aSource);
  if (headerContent && headerContent[1]) {
    block = scriptStorage.parseMeta(scriptStorage.parsers['UserScript'], headerContent[1]);

    exclude = scriptStorage.findMeta(block, 'exclude.value');
    if (exclude) {
      exclude.forEach(function (aElement, aIndex, aArray) {
        if (aElement === '*') {
          missingExcludeAll = false;
        }
      });
    }
  } else {
    missingExcludeAll = false;
  }

  return missingExcludeAll;
}

exports.userGitHubRepoListPage = function (aReq, aRes, aNext) {
  function preRender() {
    // Pagination
    options.paginationRendered = pagination.renderDefault(aReq);
  }

  function render() {
    aRes.render('pages/userGitHubRepoListPage', options);
  }

  function asyncComplete(aErr) {
    if (aErr) {
      console.error(aErr);
      statusCodePage(aReq, aRes, aNext, {
        statusCode: 500,
        statusMessage: 'Server Error'
      });
      return;
    }

    preRender();
    render();
  }

  //
  var options = {};
  var authedUser = aReq.session.user;
  var githubUserId = null;
  var pagination = null;
  var tasks = [];

  // Session
  options.authedUser = authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // GitHub
  options.githubUserId = githubUserId =
    aReq.query.user || authedUser.ghUsername || authedUser.githubUserId();

  // Page metadata
  pageMetadata(options, ['Repositories', 'GitHub']);

  pagination = getDefaultPagination(aReq);
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
        options.userGitHubRepoListPageUrl = helpers.updateUrlQueryString(
          authedUser.userGitHubRepoListPageUrl,
          {
            user: aGithubUser.login
          }
        );

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
  async.parallel(tasks, asyncComplete);
};

exports.userGitHubImportScriptPage = function (aReq, aRes, aNext) {
  //
  var options = {};
  var authedUser = aReq.session.user;
  var githubUserId = null;
  var githubRepoName = null;
  var githubBlobPath = null;

  // Session
  options.authedUser = authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // GitHub
  options.githubUserId = githubUserId =
    aReq.body.user || aReq.query.user || authedUser.ghUsername || authedUser.githubUserId();
  options.githubRepoName = githubRepoName = aReq.body.repo || aReq.query.repo;
  options.githubBlobPath = githubBlobPath = aReq.body.path || aReq.query.path;

  if (!(githubUserId && githubRepoName && githubBlobPath)) {
    statusCodePage(aReq, aRes, aNext, {
      statusCode: 400,
      statusMessage:
        'Require <code>user</code>, <code>repo</code>, and <code>path</code> to be set.'
    });
    return;
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

      if (!javascriptBlob.canUpload) {
        aCallback(javascriptBlob.errors);
        return;
      }

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
      var onScriptStored = null;
      var parser = null;
      var rHeaderContent = null;
      var headerContent = null;
      var hasUserScriptHeaderContent = false;
      var blocksContent = {};
      var blocks = {};

      var scriptName = null;
      var jsLibraryMeta = null;

      // Double check file size.
      if (aBlobUtf8.length > settings.maximum_upload_script_size) {
        aCallback(util.format('File size is larger than maximum (%s bytes).',
          settings.maximum_upload_script_size));
        return;
      }

      onScriptStored = function (aScript) {
        if (aScript) {
          options.script = aScript;
          aCallback(null);
          return;
        } else {
          aCallback('Error while importing script.');
          return;
        }
      };

      if (options.javascriptBlob.isUserJS) {
        for (parser in scriptStorage.parsers) {
          rHeaderContent = new RegExp(
            '^(?:\\uFEFF)?\/\/ ==' + parser + '==([\\s\\S]*?)^\/\/ ==\/'+ parser + '==', 'm'
          );
          headerContent = rHeaderContent.exec(aBlobUtf8);
          if (headerContent && headerContent[1]) {
            if (parser === 'UserScript') {
              hasUserScriptHeaderContent = true;
            }

            blocksContent[parser] = headerContent[1];
          }
        }

        if (hasUserScriptHeaderContent) {
          for (parser in scriptStorage.parsers) {
            if (blocksContent[parser]) {
              blocks[parser] = scriptStorage.parseMeta(
                scriptStorage.parsers[parser], blocksContent[parser]
              );
            }
          }
          scriptStorage.storeScript(authedUser, blocks, aBlobUtf8, onScriptStored);
        } else {
          aCallback('Specified file does not contain a userscript header.');
        }
      } else if (options.javascriptBlob.isJSLibrary) {
        if (!hasMissingExcludeAll(aBlobUtf8)) {
          scriptName = options.javascriptBlob.path.name;
          jsLibraryMeta = scriptName;
          scriptStorage.storeScript(authedUser, jsLibraryMeta, aBlobUtf8, onScriptStored);
        } else {
          aCallback('Invalid library header.');
        }

      } else {
        aCallback('Invalid filetype.');
      }
    },
  ], function (aErr) {
    var script = null;

    if (aErr) {
      console.error(aErr);
      console.error(githubUserId, githubRepoName, githubBlobPath);
      statusCodePage(aReq, aRes, aNext, {
        statusCode: 400,
        statusMessage: aErr
      });
      return;
    }

    script = modelParser.parseScript(options.script);

    aRes.redirect(script.scriptPageUri);
  });
};

exports.userGitHubRepoPage = function (aReq, aRes, aNext) {
  function preRender() {
  }

  function render() {
    aRes.render('pages/userGitHubRepoPage', options);
  }

  function asyncComplete(aErr) {
    if (aErr) {
      aNext();
      return;
    }

    preRender();
    render();
  }

  //
  var options = {};
  var authedUser = aReq.session.user;
  var githubUserId = null;
  var githubRepoName = null;
  var tasks = [];

  // Session
  options.authedUser = authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // GitHub
  options.githubUserId = githubUserId =
    aReq.query.user || authedUser.ghUsername || authedUser.githubUserId();
  options.githubRepoName = githubRepoName = aReq.query.repo;

  if (!(githubUserId && githubRepoName)) {
    statusCodePage(aReq, aRes, aNext, {
      statusCode: 400,
      statusMessage: 'Require <code>?user=githubUserName&repo=githubRepoName</code>'
    });
    return;
  }

  options.userGitHubRepoListPageUrl = helpers.updateUrlQueryString(
    authedUser.userGitHubRepoListPageUrl,
    {
      user: githubUserId,
    }
  );
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
          default_branch: encodeURIComponent(options.repo.default_branch)
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
          javascriptBlob.userGitHubImportPageUrl = helpers.updateUrlQueryString(
            authedUser.userGitHubImportPageUrl,
            {
              user: githubUserId,
              repo: githubRepoName,
              path: javascriptBlob.path
            }
          );
        });
        _.each(aJavascriptBlobs, parseJavascriptBlob);

        // If the repo has >1 script, keep the the current page open.
        options.openImportInNewTab = aJavascriptBlobs.length > 1;

        aCallback(null);
      },
    ], aCallback);
  });

  //---
  async.parallel(tasks, asyncComplete);
};

var parseJavascriptBlob = function (aJavascriptBlob) {
  // Parsing Script Name & Type from path
  var rBlobPath = /^(.*\/)?(.+?)((\.user)?\.js)$/;
  var m = rBlobPath.exec(aJavascriptBlob.path);
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
      msg: util.format('File size is larger than maximum (%s bytes).',
        settings.maximum_upload_script_size)
    });
  }

  if (aJavascriptBlob.errors.length)
    aJavascriptBlob.canUpload = !aJavascriptBlob.errors.length;

  return aJavascriptBlob;
};

exports.uploadScript = function (aReq, aRes, aNext) {
  //
  var form = null;

  if (!/multipart\/form-data/.test(aReq.headers['content-type'])) {
    aNext();
    return;
  }

  form = new formidable.IncomingForm();
  form.parse(aReq, function (aErr, aFields, aFiles) {
    //
    var isLib = aReq.params.isLib;
    var script = aFiles.script;
    var stream = null;
    var bufs = [];
    var authedUser = aReq.session.user;
    var failUri = '/user/add/' + (isLib ? 'lib' : 'scripts');

    // Reject missing, non-js, and huge files
    if (!script ||
      !(script.type === 'application/javascript' || script.type === 'application/x-javascript') ||
        script.size > settings.maximum_upload_script_size) {
      aRes.redirect(failUri);
      return;
    }

    stream = fs.createReadStream(script.path);
    stream.on('data', function (aData) {
      bufs.push(aData);
    });

    stream.on('end', function () {
      User.findOne({ _id: authedUser._id }, function (aErr, aUser) {
        var scriptName = aFields.script_name;
        var bufferConcat = Buffer.concat(bufs);
        var rJS = /\.js$/;
        var rUserJS = /\.user\.js$/;

        if (isLib) {
          if (!hasMissingExcludeAll(bufferConcat)) {
            scriptStorage.storeScript(aUser, scriptName, bufferConcat,
              function (aScript) {
                if (!aScript) {
                  aRes.redirect(failUri);
                  return;
                }

                aRes.redirect(
                  '/libs/' +
                    encodeURIComponent(helpers.cleanFilename(aScript.author)) +
                      '/' +
                        encodeURIComponent(helpers.cleanFilename(aScript.name))
                );
              });
          } else {
            aRes.redirect(failUri);
            return;
          }

        } else {
          scriptStorage.getMeta(bufs, function (aMeta) {
            scriptStorage.storeScript(aUser, aMeta, bufferConcat,
              function (aScript) {
                if (!aScript) {
                  aRes.redirect(failUri);
                  return;
                }

                aRes.redirect(
                  '/scripts/' +
                    encodeURIComponent(helpers.cleanFilename(aScript.author)) +
                      '/' +
                        encodeURIComponent(helpers.cleanFilename(aScript.name))
                );
              });
          });
        }
      });
    });
  });
};

// post route to update a user's account
exports.update = function (aReq, aRes, aNext) {
  //
  var authedUser = aReq.session.user;

  // Update the about section of a user's profile
  User.findOneAndUpdate({ _id: authedUser._id }, { about: aReq.body.about },
    function (aErr, aUser) {
      if (aErr) {
        aRes.redirect('/');
        return;
      }

      authedUser.about = aUser.about;
      aRes.redirect('/users/' + encodeURIComponent(aUser.name));
    });
};

// Submit a script through the web editor
exports.submitSource = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;
  var isLib = aReq.params.isLib;
  var source = null;
  var uri = null;

  function storeScript(aMeta, aSource) {
    var rUserJS = /\.user\.js$/;
    var rJS = /\.js$/;

    User.findOne({ _id: authedUser._id }, function (aErr, aUser) {
      scriptStorage.storeScript(aUser, aMeta, aSource, function (aScript) {
        var redirectUri = aScript
          ? ((aScript.isLib ? '/libs/' : '/scripts/') +
            encodeURIComponent(helpers.cleanFilename(aScript.author)) +
              '/' +
                encodeURIComponent(helpers.cleanFilename(aScript.name)))
          : aReq.body.url;

        if (!aScript || !aReq.body.original) {
          aRes.redirect(redirectUri);
          return;
        }

        Script.findOne({ installName: aReq.body.original },
          function (aErr, aOrigScript) {
            var fork = null;

            var origInstallNameSlugUrl = helpers.encode(helpers.cleanFilename(aOrigScript.author)) +
              '/' +
                helpers.encode(helpers.cleanFilename(aOrigScript.name));

            if (aErr || !aOrigScript) {
              aRes.redirect(redirectUri);
              return;
            }

            fork = aOrigScript.fork || [];
            fork.unshift({
              author: aOrigScript.author,
              url: origInstallNameSlugUrl,
              utf: aOrigScript.author + '/' + aOrigScript.name
            });
            aScript.fork = fork;

            aScript.save(function (aErr, aScript) {
              aRes.redirect(redirectUri);
            });
          });
      });
    });
  }

  source = new Buffer(aReq.body.source);
  uri = aReq.body.url;

  if (isLib) {
    if (hasMissingExcludeAll(source)) {
      aRes.redirect(uri);
      return;
    }

    storeScript(aReq.body.script_name, source);
  } else {
    scriptStorage.getMeta([source], function (aMeta) {
      var name = null;
      var hasName = false;

      name = scriptStorage.findMeta(aMeta, 'UserScript.name');

      if (!name) {
        aRes.redirect(uri);
        return;
      }

      name.forEach(function (aElement, aIndex, aArray) {
        if (!name[aIndex].key) {
          hasName = true;
        }
      });

      if (!hasName) {
        aRes.redirect(uri);
        return;
      }

      storeScript(aMeta, source);
    });
  }
};

function getExistingScript(aReq, aOptions, aAuthedUser, aCallback) {
  aOptions.isLib = aReq.params.isLib;

  if (aReq.params.isNew) {
    // A user who isn't logged in can't write a new script
    if (!aAuthedUser) {
      aCallback(null);
      return;
    }

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
      var collaborators = null;
      var bufs = [];

      if (!aScript) {
        aCallback(null);
        return;
      }

      collaborators = scriptStorage.findMeta(aScript.meta, 'OpenUserJS.collaborator.value');
      if (!collaborators) {
        collaborators = []; // NOTE: Watchpoint
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
  function preRender() {
  }

  function render() {
    aRes.render('pages/scriptViewSourcePage', options);
  }

  function asyncComplete(aErr) {
    if (aErr) {
      aNext();
      return;
    }

    preRender();
    render();
  }

  //
  var options = {};
  var authedUser = aReq.session.user;
  var isNew = aReq.params.isNew;
  var installNameBase = null;
  var isLib = aReq.params.isLib;
  var tasks = [];

  // Session
  options.authedUser = authedUser = modelParser.parseUser(authedUser);
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
    installNameBase = scriptStorage.getInstallNameBase(aReq);

    Script.findOne({
      installName: scriptStorage.caseSensitive(installNameBase +
        (isLib ? '.js' : '.user.js'))
      }, function (aErr, aScript) {
        //
        var script = null;
        var scriptOpenIssueCountQuery = null;

        //---
        if (aErr || !aScript) {
          aNext();
          return;
        }

        // Script
        options.script = script = modelParser.parseScript(aScript);
        options.isOwner = authedUser && authedUser._id == script._authorId;
        modelParser.renderScript(script);
        script.installNameSlug = installNameBase;
        script.scriptPermalinkInstallPageUrl = 'https://' + aReq.get('host') +
          script.scriptInstallPageUrl;
        script.scriptPermalinkInstallPageXUrl = 'https://' + aReq.get('host') +
          script.scriptInstallPageXUrl;
        script.scriptRawPageUrl = '/src/' + (isLib ? 'libs' : 'scripts') + '/'
          + scriptStorage.getInstallNameBase(aReq, { encoding: 'uri' }) +
            (isLib ? '.js#' : '.user.js#');
        script.scriptRawPageXUrl = '/src/' + (isLib ? 'libs' : 'scripts') + '/'
          + scriptStorage.getInstallNameBase(aReq, { encoding: 'uri' }) +
            (isLib ? '.min.js#' : '.min.user.js#');

        // Page metadata
        pageMetadata(options);

        options.isScriptViewSourcePage = true;

        //--- Tasks

        // Show the number of open issues
        scriptOpenIssueCountQuery = Discussion.find({ category: scriptStorage
            .caseSensitive(decodeURIComponent(script.issuesCategorySlug), true), open: {$ne: false} });
        tasks.push(countTask(scriptOpenIssueCountQuery, options, 'issueCount'));

        //---
        async.parallel(tasks, asyncComplete);
      });
  } else {
    //---
    async.parallel(tasks, asyncComplete);
  }
};
