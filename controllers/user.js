'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;
var statusError = require('../libs/debug').statusError;

//

//--- Dependency inclusions
var fs = require('fs');
var formidable = require('formidable');
var async = require('async');
var _ = require('underscore');
var util = require('util');
var rfc2047 = require('rfc2047');

var SPDX = require('spdx-license-ids');

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

var getSessionDataList = require('../libs/modifySessions').getSessionDataList;
var extendSession = require('../libs/modifySessions').extend;
var destroyOneSession = require('../libs/modifySessions').destroyOne;

//--- Configuration inclusions
var userRoles = require('../models/userRoles.json');
var strategies = require('./strategies.json');
var settings = require('../models/settings.json');

var removeReasons = require('../views/includes/userModals.json').removeReasons;

var blockSPDX = require('../libs/blockSPDX');

//---

// WARNING: **Near** duplicate in scriptStorage.js for installName
function caseInsensitive (aStr) {
  return new RegExp('^' + (aStr || '').replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1") + '$', 'i');
}

// API - Simple exist check usually used with HEAD requests
exports.exist = function (aReq, aRes) {
  var username = aReq.params.username;

  if (!username) {
    aRes.status(400).send();
    return;
  }

  username = helpers.cleanFilename(username);

  if (!username) {
    aRes.status(400).send();
    return;
  }

  User.findOne({
    name: caseInsensitive(username)
  }, function (aErr, aUser) {
    var msg = null;

    if (aErr) {
      aRes.status(400).send();
      return;
    }


    if (!aUser) {
      aRes.status(404).send();
      return;
    }

    if (!aUser.consented) {
      msg = [
        '199 ' + aReq.headers.host + ' consent'

      ].join('\u0020');
      aRes.set('Warning', msg);
    }

    aRes.status(200).send();
  });
};

// API - Request for extending a logged in user session
exports.extend = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  User.findOne({
    _id: authedUser._id,
    sessionIds: { "$in": [ aReq.sessionID ] }
  }, function (aErr, aUser) {
    // WARNING: No err handling

    extendSession(aReq, aUser, function (aErr) {
      if (aErr) {
        if (aErr === 'Already extended') {
          aNext();
          return;
        }

        statusCodePage(aReq, aRes, aNext, {
          statusCode: 500,
          statusMessage: aErr
        });
        return;
      }

      aRes.redirect('back');
    });
  });
};

// API - Request for destroying a logged in user session
exports.destroyOne = function (aReq, aRes, aNext) {
  var options = {};
  var authedUser = aReq.session.user;
  var username = aReq.body.username;;
  var id = aReq.body.id;

  if (!username) {
    statusCodePage(aReq, aRes, aNext, {
      statusCode: 400,
      statusMessage: '<code>username</code> must be set.'
    });
    return;
  }

  if (aReq.sessionID === id) {
    statusCodePage(aReq, aRes, aNext, {
      statusCode: 403,
      statusMessage: 'Cannot delete the current session.'
    });
    return;
  }

  // You can only delete a session with a role equal or less than yours
  User.findOne({
    name: username
  }, function (aErr, aUser) {
    var store = aReq.sessionStore;
    var user = null;

    if (aErr || !aUser) {
      aNext();
      return;
    }

    user = aUser; // NOTE: We really shouldn't need modelParser here

    if (authedUser.role > user.role) {
      statusCodePage(aReq, aRes, aNext, {
        statusCode: 403,
        statusMessage: 'Cannot delete a session with a higher rank.'
      });
      return;
    }

    // You can only delete your own other sessions when you are not an admin
    if (!authedUser.isAdmin && authedUser.name !== user.name) {
      statusCodePage(aReq, aRes, aNext, {
        statusCode: 403,
        statusMessage: 'Cannot delete a session that is not owned.'
      });
      return;
    }

    store.get(id, function (aErr, aSess) {
      if (aErr) {
        statusCodePage(aReq, aRes, aNext, {
          statusCode: 500,
          statusMessage: aErr
        });
        return;
      }

      if (!authedUser.isAdmin && aSess.passport.oujsOptions.authFrom) {
        statusCodePage(aReq, aRes, aNext, {
          statusCode: 403,
          statusMessage: 'Cannot delete a session that is being administered.'
        });
        return;
      }

      destroyOneSession(aReq, user, id, function (aErr) {
        if (aErr) {
          statusCodePage(aReq, aRes, aNext, {
            statusCode: 500,
            statusMessage: aErr
          });
          return;
        }

        aRes.redirect('back');
      });
    });
  });
};

var setupUserModerationUITask = function (aOptions) {
  var user = aOptions.user;
  var authedUser = aOptions.authedUser;

  // Default to infinity
  aOptions.threshold = '\u221E';

  // Default to &ndash;
  aOptions.flags = '\u2013';

  return (function (aCallback) {
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
  userListQuery = User.find().collation({ locale: 'en', strength: 3 });

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
        // WARNING: No err handling

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
    scriptListQuery = Script.find().collation({ locale: 'en', strength: 3 });

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
            async.eachOfSeries(options.scriptList, function (aScript, aScriptKey, aEachCallback) {
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
        // WARNING: No err handling

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
    scriptListQuery = Script.find().collation({ locale: 'en', strength: 3 });

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
    scriptListQuery = Script.find().collation({ locale: 'en', strength: 3 });

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
    scriptListQuery = Script.find().collation({ locale: 'en', strength: 3 });

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
        // WARNING: No err handling

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

        // Sort the strategies
        options.openStrategies = _.sortBy(options.openStrategies, function (aStrategy) {
          return aStrategy.display;
        });

        options.defaultStrategy = strategies[defaultStrategy]
          ? strategies[defaultStrategy].name
          : null;

        options.defaultStrat = defaultStrategy;
        options.haveOtherStrategies = options.usedStrategies.length > 0;
        options.unusedStrategies = options.openStrategies.length > 0;

        aCallback();
      });
    });

    // User session control
    tasks.push(function (aCallback) {
      getSessionDataList(aReq, options, aCallback);
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

  options.isOwnRepo = authedUser.ghUsername && authedUser.ghUsername === options.githubUserId;

  if (!options.isOwnRepo) {
    statusCodePage(aReq, aRes, aNext, {
      statusCode: 403,
      statusMessage: 'You may only list your own repos.'
    });
    return;
  }

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

  options.isOwnRepo = authedUser.ghUsername && authedUser.ghUsername === options.githubUserId;

  if (!options.isOwnRepo) {
    statusCodePage(aReq, aRes, aNext, {
      statusCode: 403,
      statusMessage: 'You may only import from your own repo.'
    });
    return;
  }

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

exports.userGitHubImportScriptPage = function (aReq, aRes, aNext) {
  //
  var options = {};
  var authedUser = aReq.session.user;
  var githubUserId = null;
  var githubRepoName = null;
  var githubDefaultBranch = null;
  var githubPathName = null;
  var githubPathExt = null;
  var githubBlobPath = null;

  // Session
  options.authedUser = authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // GitHub
  options.githubUserId = githubUserId =
    aReq.body.user || aReq.query.user || authedUser.ghUsername || authedUser.githubUserId();

  options.isOwnRepo = authedUser.ghUsername && authedUser.ghUsername === options.githubUserId;

  if (!options.isOwnRepo) {
    statusCodePage(aReq, aRes, aNext, {
      statusCode: 403,
      statusMessage: 'You may only import from your own scripts.'
    });
    return;
  }

  options.githubRepoName = githubRepoName = aReq.body.repo || aReq.query.repo;
  options.githubDefaultBranch = githubDefaultBranch = aReq.body.default_branch || aReq.query.default_branch;
  options.githubPathName = githubPathName = aReq.body.pathname || aReq.query.pathname;
  options.githubPathExt = githubPathExt = aReq.body.pathext || aReq.query.pathext;
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
      var hasUserLibraryHeaderContent = false;
      var blocksContent = {};
      var blocks = {};

      var scriptName = null;
      var jsLibraryMeta = null;

      // Double check file size.
      if (aBlobUtf8.length > settings.maximum_upload_script_size) {
        aCallback(new statusError({
          message: util.format('File size is larger than maximum (%s bytes).',
            settings.maximum_upload_script_size),
          code: 400
        }));
        return;
      }

      onScriptStored = function (aErr, aScript) {
        if (aErr) {
          aCallback(aErr);
          return;
        }

        if (!aScript) {
          aCallback(new statusError({
            message: 'Error while importing script.',
            code: 500 // NOTE: Watchpoint.
          }));
          return;
        }

        options.script = aScript;
        aCallback(null);
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
            } else if (parser === 'UserLibrary') {
              hasUserLibraryHeaderContent = true;
            }

            blocksContent[parser] = headerContent[1];
          }
        }

        if (hasUserScriptHeaderContent && !hasUserLibraryHeaderContent) {
          for (parser in scriptStorage.parsers) {
            if (blocksContent[parser]) {
              blocks[parser] = scriptStorage.parseMeta(
                scriptStorage.parsers[parser], blocksContent[parser]
              );
            }
          }
          scriptStorage.storeScript(authedUser, blocks, aBlobUtf8, false, onScriptStored);
        } else {
          aCallback(new statusError({
            message: 'Specified file does not contain the proper metadata blocks.',
            code: 400
          }));
          return;
        }

      } else if (options.javascriptBlob.isJSLibrary) {

        for (parser in scriptStorage.parsers) {
          rHeaderContent = new RegExp(
            '^(?:\\uFEFF)?\/\/ ==' + parser + '==([\\s\\S]*?)^\/\/ ==\/'+ parser + '==', 'm'
          );
          headerContent = rHeaderContent.exec(aBlobUtf8);
          if (headerContent && headerContent[1]) {
            if (parser === 'UserScript') {
              hasUserScriptHeaderContent = true;
            } else if (parser === 'UserLibrary') {
              hasUserLibraryHeaderContent = true;
            }

            blocksContent[parser] = headerContent[1];
          }
        }

        if (hasUserScriptHeaderContent && hasUserLibraryHeaderContent) {
          for (parser in scriptStorage.parsers) {
            if (blocksContent[parser]) {
              blocks[parser] = scriptStorage.parseMeta(
                scriptStorage.parsers[parser], blocksContent[parser]
              );
            }
          }
          scriptStorage.storeScript(authedUser, blocks, aBlobUtf8, false, onScriptStored);
        } else {
          aCallback(new statusError({
            message: 'Specified file does not contain the proper metadata blocks.',
            code: 400
          }));
          return;
        }

      } else {
        aCallback(new statusError({
          message: 'Invalid filetype.',
          code: 400
        }));
        return;
      }
    },
  ], function (aErr) {
    var script = null;

    if (aErr) {
      console.error([
        aErr,
        authedUser.name + ' ' + githubUserId + ' ' + githubRepoName + ' ' + githubBlobPath

      ].join('\n'));

      if (!(aErr instanceof String)) {
        statusCodePage(aReq, aRes, aNext, {
          statusCode: (aErr instanceof statusError ? aErr.status.code : aErr.code),
          statusMessage: (aErr instanceof statusError ? aErr.status.message : aErr.message),
          isCustomView: true,
          statusData: {
            isGHImport: true,
            utf_pathname: githubPathName,
            utf_pathext: githubPathExt,
            user: encodeURIComponent(githubUserId),
            repo: encodeURIComponent(githubRepoName),
            default_branch: encodeURIComponent(githubDefaultBranch),
            path: encodeURIComponent(githubBlobPath)
          }
        });
      } else {
        statusCodePage(aReq, aRes, aNext, {
          statusCode: 500, // NOTE: Watchpoint
          statusMessage: aErr
        });
      }
      return;
    }

    script = modelParser.parseScript(options.script);

    aRes.redirect(script.scriptPageUri);
  });
};

var parseJavascriptBlob = function (aJavascriptBlob) {
  // Parsing Script Name & Type from path
  var rBlobPath = /^(.*\/)?(.+?)((\.user)?\.js)$/;
  var m = null;

  if (!aJavascriptBlob) { // TODO: Currently unknown error but trap
    aJavascriptBlob = { path: null, isUserJS: false, isJSLibrary: false, pathAsEncoded: null };
    aJavascriptBlob.canUpload = false;
    aJavascriptBlob.errors = ['aJavascriptBlob is `undefined`'];

    return aJavascriptBlob;
  }

  m = rBlobPath.exec(aJavascriptBlob.path);
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
    // WARNING: No err handling

    //
    var isLib = aReq.params.isLib;
    var script = aFiles.script;
    var stream = null;
    var bufs = [];
    var authedUser = aReq.session.user;

    // Reject missing files
    if (!script) {
      statusCodePage(aReq, aRes, aNext, {
        statusCode: 400,
        statusMessage: 'No file selected.'
      });
      return;
    }

    // Reject non-js file
    console.log(script.type);
    switch (script.type) {
      case 'application/x-javascript': // #872 #1661
      case 'application/javascript':   // #1599
      case 'text/javascript':          // Default
        break; // Acceptable
      default:
        statusCodePage(aReq, aRes, aNext, {
          statusCode: 400,
          statusMessage: 'Selected file is not JavaScript.'
        });
        return;
    }

    // Reject huge file
    if (script.size > settings.maximum_upload_script_size) {
      statusCodePage(aReq, aRes, aNext, {
        statusCode: 400,
        statusMessage: 'Selected file is too big.'
      });
      return;
    }

    stream = fs.createReadStream(script.path);
    stream.on('data', function (aData) {
      bufs.push(aData);
    });

    stream.on('end', function () {
      User.findOne({ _id: authedUser._id }, function (aErr, aUser) {
        // WARNING: No err handling

        var bufferConcat = Buffer.concat(bufs);

        scriptStorage.getMeta(bufs, function (aMeta) {
          if (!isLib && !!scriptStorage.findMeta(aMeta, 'UserLibrary')) {
            statusCodePage(aReq, aRes, aNext, {
              statusCode: 400,
              statusMessage:
                'UserLibrary metadata block found while attempting to upload as a UserScript.'
            });
            return;
          } else if (isLib && !!!scriptStorage.findMeta(aMeta, 'UserLibrary')) {
              statusCodePage(aReq, aRes, aNext, {
                statusCode: 400,
                statusMessage: 'UserLibrary metadata block missing.'
              });
            return;
          }

          scriptStorage.storeScript(aUser, aMeta, bufferConcat, false, function (aErr, aScript) {
            if (aErr || !aScript) {
              statusCodePage(aReq, aRes, aNext, {
                statusCode: (aErr instanceof statusError ? aErr.status.code : aErr.code),
                statusMessage: (aErr instanceof statusError ? aErr.status.message : aErr.code)
              });
              return;
            }

            aRes.redirect(
              '/' + (isLib ? 'libs' : 'scripts') + '/' +
                encodeURIComponent(helpers.cleanFilename(aScript.author)) +
                  '/' +
                    encodeURIComponent(helpers.cleanFilename(aScript.name))
            );
          });
        });
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

    User.findOne({ _id: authedUser._id }, function (aErr, aUser) {
      // WARNING: No err handling

      scriptStorage.storeScript(aUser, aMeta, aSource, false, function (aErr, aScript) {
        var redirectUri = aScript
          ? ((aScript.isLib ? '/libs/' : '/scripts/') +
            encodeURIComponent(helpers.cleanFilename(aScript.author)) +
              '/' +
                encodeURIComponent(helpers.cleanFilename(aScript.name)))
          : aReq.body.url;

        if (aErr) {
          statusCodePage(aReq, aRes, aNext, {
            statusCode: (aErr instanceof statusError ? aErr.status.code : aErr.code),
            statusMessage: (aErr instanceof statusError ? aErr.status.message : aErr.message)
          });
          return;
        }

        if (!aScript) {
          statusCodePage(aReq, aRes, aNext, {
            statusCode: 500, // NOTE: Watch point
            statusMessage: 'No script'
          });
          return;
        }

        if (!aReq.body.original) {
          aRes.redirect(redirectUri); // NOTE: Watchpoint
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
              // WARNING: No err handling

              aRes.redirect(redirectUri);
            });
          });
      });
    });
  }

  source = Buffer.from(aReq.body.source);
  uri = aReq.body.url;

  if (isLib) {
    scriptStorage.getMeta([source], function (aMeta) {
      var name = null;
      var hasName = false;

      if (!!!scriptStorage.findMeta(aMeta, 'UserScript')) {
        statusCodePage(aReq, aRes, aNext, {
          statusCode: 400,
          statusMessage: 'UserScript metadata block missing.'
        });
        return;
      }


      name = scriptStorage.findMeta(aMeta, 'UserLibrary.name');

      if (!name) {
        statusCodePage(aReq, aRes, aNext, {
          statusCode: 400,
          statusMessage: 'UserLibrary metadata block missing `@name`.'
        });
        return;
      }

      name.forEach(function (aElement, aIndex, aArray) {
        if (!name[aIndex].key) {
          hasName = true;
        }
      });

      if (!hasName) {
        statusCodePage(aReq, aRes, aNext, {
          statusCode: 400,
          statusMessage: 'UserLibrary metadata block missing non-localized `@name`.'
        });
        return;
      }

      storeScript(aMeta, source);
    });
  } else {
    scriptStorage.getMeta([source], function (aMeta) {
      var name = null;
      var hasName = false;

      if (!!scriptStorage.findMeta(aMeta, 'UserLibrary')) {
        statusCodePage(aReq, aRes, aNext, {
          statusCode: 400,
          statusMessage:
            'UserLibrary metadata block found while attempting to upload as a UserScript.'
        });
        return;
      }


      name = scriptStorage.findMeta(aMeta, 'UserScript.name');

      if (!name) {
        statusCodePage(aReq, aRes, aNext, {
          statusCode: 400,
          statusMessage: 'UserScript metadata block missing `@name`.'
        });
        return;
      }

      name.forEach(function (aElement, aIndex, aArray) {
        if (!name[aIndex].key) {
          hasName = true;
        }
      });

      if (!hasName) {
        statusCodePage(aReq, aRes, aNext, {
          statusCode: 400,
          statusMessage: 'UserScript metadata block missing non-localized `@name`.'
        });
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
      var continuation = true;

      if (!aScript || !aStream) {
        aCallback(null);
        return;
      }

      collaborators = scriptStorage.findMeta(aScript.meta, 'OpenUserJS.collaborator.value');
      if (!collaborators) {
        collaborators = []; // NOTE: Watchpoint
      }

      aStream.on('error', function (aErr) {
        // This covers errors during connection in source view
        console.error(
          'S3 GET (chunking indirect) ',
            aErr.code,
              'for', installNameBase + (isLib ? '.js' : '.user.js'),
                'in the S3 bucket\n' +
                  JSON.stringify(aErr, null, ' ') + '\n' +
                    aErr.stack
        );

        if (continuation) {
          continuation = false;

          aCallback(null);
          // fallthrough
        }
      });
      aStream.on('data', function (aData) {
        if (continuation) {
          bufs.push(aData);
        }
      });
      aStream.on('end', function () {
        if (continuation) {
          continuation = false;

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
        }
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
      statusCodePage(aReq, aRes, aNext, {
        statusCode: (aErr instanceof statusError ? aErr.status.code : aErr.code),
        statusMessage: (aErr instanceof statusError ? aErr.status.message : aErr.code)
      });
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
  var nowDate = null;

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

      aCallback(!aOpts ? new statusError({
        message: 'Error while getting existing script.',
        code: 500
      }) : null);

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
        var collaborators = null;
        var licenses = null;
        var licensePrimary = null;
        var copyrights = null;
        var copyrightPrimary = null;
        var sinceDate = null;

        //---
        if (aErr || !aScript) {
          aNext();
          return;
        }

        // Lockdown
        options.lockdown = {};
        options.lockdown.scriptStorageRO = process.env.READ_ONLY_SCRIPT_STORAGE === 'true';
        options.lockdown.updateURLCheck = process.env.FORCE_BUSY_UPDATEURL_CHECK === 'true';

        // Script
        options.script = script = modelParser.parseScript(aScript);

        collaborators = scriptStorage.findMeta(aScript.meta, 'OpenUserJS.collaborator.value');
        if (!collaborators) {
          collaborators = []; // NOTE: Watchpoint
        }

        licenses = scriptStorage.findMeta(aScript.meta, 'UserScript.license.value');
        if (licenses) {
          licensePrimary = licenses[licenses.length - 1];
          script.licensePrimary = licensePrimary.substr(0, (licensePrimary.indexOf(';') > -1
            ? licensePrimary.indexOf(';')
            : undefined));
        }

        copyrights = scriptStorage.findMeta(aScript.meta, 'UserScript.copyright.value');
        if (copyrights) {
          copyrightPrimary = copyrights[copyrights.length - 1];
          script.copyrightPrimary = copyrightPrimary;
        } else {
          if (authedUser) {
            sinceDate = new Date(script._sinceISOFormat);
            script.copyrightPrimary = sinceDate.getFullYear() + ', ' + authedUser.name +
              ' (' + helpers.baseOrigin + authedUser.userPageUrl + ')';
          }
        }

        options.isOwner = authedUser && (authedUser._id == script._authorId
          || collaborators.indexOf(authedUser.name) > -1);
        modelParser.renderScript(script);
        script.installNameSlug = installNameBase;
        script.scriptPermalinkInstallPageUrl = 'https://' + aReq.get('host') +
          script.scriptInstallPageUrl;
        script.scriptPermalinkInstallPageXUrl = 'https://' + aReq.get('host') +
          script.scriptInstallPageXUrl;
        script.scriptRawPageUrl = '/src/' + (isLib ? 'libs' : 'scripts') + '/' +
          scriptStorage.getInstallNameBase(aReq, { encoding: 'uri' }) +
            (isLib ? '.js#' : '.user.js#');
        script.scriptRawPageXUrl = '/src/' + (isLib ? 'libs' : 'scripts') + '/' +
          scriptStorage.getInstallNameBase(aReq, { encoding: 'uri' }) +
            (isLib ? '.min.js#' : '.min.user.js#');
        script.scriptPermalinkMetaPageUrl = 'https://' + aReq.get('host') +
          script.scriptMetaPageUrl;

        script.scriptAcceptableOSILicense = [];
        SPDX.forEach(function (aElement, aIndex, aArray) {
          if (blockSPDX.indexOf(aElement) === -1) {
            script.scriptAcceptableOSILicense.push({
              shortIdSPDX: aElement
            });
          }
        });

        // User
        if (options.isOwner) {
          options.authorTools = {};
        }

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
    options.authorTools = {};
    options.isScriptViewSourcePage = true;

    options.script = {};
    options.script.isLib = isLib;

    options.script.licensePrimary = 'MIT'; // NOTE: Site default

    if (authedUser) {
      nowDate = new Date();
      options.script.copyrightPrimary = nowDate.getFullYear() + ', ' + authedUser.name +
        ' (' + helpers.baseOrigin + authedUser.userPageUrl + ')';
    }

    options.script.scriptAcceptableOSILicense = [];
    SPDX.forEach(function (aElement, aIndex, aArray) {
      if (blockSPDX.indexOf(aElement) === -1) {
        options.script.scriptAcceptableOSILicense.push({
          shortIdSPDX: aElement
        });
      }
    });

    //---
    async.parallel(tasks, asyncComplete);
  }
};
