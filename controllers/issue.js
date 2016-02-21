'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//

//--- Dependency inclusions
var async = require('async');
var _ = require('underscore');

//--- Model inclusions
var Comment = require('../models/comment').Comment;
var Discussion = require('../models/discussion').Discussion;
var Script = require('../models/script').Script;

//--- Controller inclusions
var scriptStorage = require('./scriptStorage');
var discussionLib = require('./discussion'); // NOTE: Project tree inconsistency

//--- Library inclusions
var issueLib = require('../libs/issue');

var modelParser = require('../libs/modelParser');
var modelQuery = require('../libs/modelQuery');

var execQueryTask = require('../libs/tasks').execQueryTask;
var countTask = require('../libs/tasks').countTask;
var statusCodePage = require('../libs/templateHelpers').statusCodePage;
var pageMetadata = require('../libs/templateHelpers').pageMetadata;
var orderDir = require('../libs/templateHelpers').orderDir;

//--- Configuration inclusions

//---

// List script issues
exports.list = function (aReq, aRes, aNext) {
  //
  var installNameBase = scriptStorage.getInstallNameBase(aReq);
  var type = aReq.params.type;

  Script.findOne({
    installName: scriptStorage.caseSensitive(installNameBase +
      (type === 'libs' ? '.js' : '.user.js'))
    }, function (aErr, aScript) {
      function preRender() {
        options.discussionList = _.map(options.discussionList, modelParser.parseDiscussion);

        // Script
        options.issuesCount = pagination.numItems;

        // Pagination
        options.paginationRendered = pagination.renderDefault(aReq);

        // Empty list
        if (options.searchBarValue) {
          if (options.allIssues) {
            options.discussionListIsEmptyMessage = 'We couldn\'t find any discussions with this search value.';
          } else {
            if (open) {
              options.discussionListIsEmptyMessage = 'We couldn\'t find any open discussions with this search value.';
            } else {
              options.discussionListIsEmptyMessage = 'We couldn\'t find any closed discussions with this search value.';
            }
          }
        } else {
          if (options.allIssues) {
            options.discussionListIsEmptyMessage = 'No discussions.';
          } else {
            if (open) {
              options.discussionListIsEmptyMessage = 'No open discussions.';
            } else {
              options.discussionListIsEmptyMessage = 'No closed discussions.';
            }
          }
        }
      }

      function render() {
        aRes.render('pages/scriptIssueListPage', options);
      }

      function asyncComplete() {
        preRender();
        render();
      }

      //
      var options = {};
      var authedUser = aReq.session.user;
      var open = aReq.params.open !== 'closed';
      var script = null;
      var category = null;
      var discussionListQuery = null;
      var listAll = aReq.params.open === 'all';
      var pagination = null;
      var scriptOpenIssueCountQuery = null;
      var tasks = [];

      if (aErr || !aScript) {
        aNext();
        return;
      }

      // Session
      options.authedUser = authedUser = modelParser.parseUser(authedUser);
      options.isMod = authedUser && authedUser.isMod;
      options.isAdmin = authedUser && authedUser.isAdmin;

      //
      options.openIssuesOnly = open;

      // Script
      options.script = script = modelParser.parseScript(aScript);
      options.isOwner = authedUser && authedUser._id == script._authorId;

      // Category
      category = {};
      category.slug = type + '/' + installNameBase + '/issues';
      category.name = 'Issues';
      category.description = '';
      category = modelParser.parseCategory(category);
      category.categoryPageUrl = script.scriptIssuesPageUrl;
      category.categoryPostDiscussionPageUrl = script.scriptOpenIssuePageUrl;
      options.category = category;

      options.isScriptIssuesPage = true;

      // Order dir
      orderDir(aReq, options, 'topic', 'asc');
      orderDir(aReq, options, 'comments', 'desc');
      orderDir(aReq, options, 'created', 'desc');
      orderDir(aReq, options, 'updated', 'desc');

      // discussionListQuery
      discussionListQuery = Discussion.find();

      // discussionListQuery: category
      discussionListQuery.find({ category: category.slug });

      // discussionListQuery: Optionally filter discussion list
      options.allIssues = !aReq.params.open && !options.isOwner || listAll;
      if (!options.allIssues) {
        modelQuery.findOrDefaultToNull(discussionListQuery, 'open', options.openIssuesOnly, true);
      }

      // Page metadata
      pageMetadata(options,
        [
          (options.allIssues ? 'All' : (open ? 'Open' : 'Closed')) + ' Issues',
          script.name,
          (script.isLib ? 'Libraries' : 'Userscripts')
        ],
        category.description);

      // discussionListQuery: Defaults
      modelQuery.applyDiscussionListQueryDefaults(discussionListQuery, options, aReq);

      // discussionListQuery: Pagination
      pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

      // SearchBar
      options.searchBarPlaceholder = 'Search Issues';

      //--- Tasks

      // Show the number of open issues
      scriptOpenIssueCountQuery = Discussion.find({
        category: decodeURIComponent(script.issuesCategorySlug),
        open: { $ne: false }
      });
      tasks.push(countTask(scriptOpenIssueCountQuery, options, 'issueCount'));

      // Pagination
      tasks.push(pagination.getCountTask(discussionListQuery, options, 'issueCount'));

      // discussionListQuery
      tasks.push(execQueryTask(discussionListQuery, options, 'discussionList'));

      //---
      async.parallel(tasks, asyncComplete);
    });
};

// Show the discussion on an issue
exports.view = function (aReq, aRes, aNext) {
  //
  var installNameBase = scriptStorage.getInstallNameBase(aReq);
  var type = aReq.params.type;

  Script.findOne({
    installName: scriptStorage.caseSensitive(installNameBase +
      (type === 'libs' ? '.js' : '.user.js'))
    }, function (aErr, aScript) {
      //
      var options = {};
      var authedUser = aReq.session.user;
      var script = null;
      var category = null;
      var topic = aReq.params.topic;
      var tasks = [];

      if (aErr || !aScript) {
        aNext();
        return;
      }

      // Session
      options.authedUser = authedUser = modelParser.parseUser(authedUser);
      options.isMod = authedUser && authedUser.isMod;
      options.isAdmin = authedUser && authedUser.isAdmin;

      // Script
      options.script = script = modelParser.parseScript(aScript);
      options.isOwner = authedUser && authedUser._id == script._authorId;

      // Category
      category = {};
      category.slug = type + '/' + installNameBase + '/issues';
      category.name = 'Issues';
      category.description = '';
      category = modelParser.parseCategory(category);
      category.categoryPageUrl = script.scriptIssuesPageUrl;
      category.categoryPostDiscussionPageUrl = script.scriptOpenIssuePageUrl;
      options.category = category;

      discussionLib.findDiscussion(category.slug, topic, function (aDiscussion) {
        function preRender() {
          // Page metadata
          pageMetadata(options, [discussion.topic, 'Discussions'], discussion.topic);

          // commentList
          options.commentList = _.map(options.commentList, modelParser.parseComment);
          _.map(options.commentList, function (aComment) {
            aComment.author = modelParser.parseUser(aComment._authorId);
          });
          _.map(options.commentList, modelParser.renderComment);

          // Script
          options.issuesCount = pagination.numItems;

          // Pagination
          options.paginationRendered = pagination.renderDefault(aReq);
        }

        function render() {
          aRes.render('pages/scriptIssuePage', options);
        }

        function asyncComplete() {
          preRender();
          render();
        }

        //
        var discussion = null;
        var commentListQuery = null;
        var pagination = null;
        var scriptOpenIssueCountQuery = null;

        if (aErr || !aDiscussion) {
          aNext();
          return;
        }

        // Discussion
        discussion = {};
        discussion = modelParser.parseDiscussion(aDiscussion);
        discussion = modelParser.parseIssue(discussion);
        options.discussion = discussion;

        options.canClose = authedUser &&
          (authedUser._id == script._authorId || authedUser._id == discussion._authorId);
        options.canOpen = authedUser && authedUser._id == script._authorId;

        // commentListQuery
        commentListQuery = Comment.find();

        // commentListQuery: discussion
        commentListQuery.find({ _discussionId: discussion._id });

        // commentListQuery: Defaults
        modelQuery.applyCommentListQueryDefaults(commentListQuery, options, aReq);

        // commentListQuery: Pagination
        pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

        //--- Tasks

        // Show the number of open issues
        scriptOpenIssueCountQuery = Discussion.find({
          category: decodeURIComponent(script.issuesCategorySlug),
          open: { $ne: false }
        });
        tasks.push(countTask(scriptOpenIssueCountQuery, options, 'issueCount'));

        // Pagination
        tasks.push(pagination.getCountTask(commentListQuery));

        // commentListQuery
        tasks.push(execQueryTask(commentListQuery, options, 'commentList'));

        async.parallel(tasks, asyncComplete);
      });
    });
};

// Open a new issue
exports.open = function (aReq, aRes, aNext) {
  //
  var installNameBase = scriptStorage.getInstallNameBase(aReq);
  var type = aReq.params.type;

  Script.findOne({
    installName: scriptStorage.caseSensitive(installNameBase +
      (type === 'libs' ? '.js' : '.user.js'))
    }, function (aErr, aScript) {
      function preRender() {
        // Page metadata
        pageMetadata(options, ['New Issue', script.name]);
      }

      function render() {
        aRes.render('pages/scriptNewIssuePage', options);
      }

      function asyncComplete() {
        preRender();
        render();
      }

      // ---
      if (aErr || !aScript) {
        aNext();
        return;
      }

      //
      var options = {};
      var authedUser = aReq.session.user;
      var script = null;
      var category = null;
      var topic = aReq.body['discussion-topic'];
      var content = aReq.body['comment-content'];
      var tasks = [];

      // Session
      options.authedUser = authedUser = modelParser.parseUser(authedUser);
      options.isMod = authedUser && authedUser.isMod;
      options.isAdmin = authedUser && authedUser.isAdmin;

      // Script
      options.script = script = modelParser.parseScript(aScript);
      options.isOwner = authedUser && authedUser._id == script._authorId;

      // Category
      category = {};
      category.slug = type + '/' + installNameBase + '/issues';
      category.name = 'Issues';
      category.description = '';
      category = modelParser.parseCategory(category);
      category.categoryPageUrl = script.scriptIssuesPageUrl;
      category.categoryPostDiscussionPageUrl = script.scriptOpenIssuePageUrl;
      options.category = category;

      if (topic && content) {
        if (!topic.trim() || !content.trim()) {
          statusCodePage(aReq, aRes, aNext, {
            statusCode: 403,
            statusMessage: 'You cannot post an empty issue topic to this ' +
              (type === 'libs' ? 'library' : 'script')
          });
          return;
        }

        // Issue Submission
        discussionLib.postTopic(authedUser, category.slug, topic, content, true,
          function (aDiscussion) {
            if (!aDiscussion) {
              aRes.redirect('/' + category.slugUri + '/open');
              return;
            }

            aRes.redirect(aDiscussion.path.split('/').map(function (aStr) {
              return encodeURIComponent(aStr);
            }).join('/') +
              (aDiscussion.duplicateId ? '_' + aDiscussion.duplicateId : ''));
          }
        );
      } else {
        // New Issue Page

        //--- Tasks
        // ...

        //---
        async.parallel(tasks, asyncComplete);
      }
    });
};

// Post route to add a new comment to a discussion on an issue
exports.comment = function (aReq, aRes, aNext) {
  //
  var installNameBase = scriptStorage.getInstallNameBase(aReq);
  var type = aReq.params.type;

  Script.findOne({
    installName: scriptStorage.caseSensitive(installNameBase +
      (type === 'libs' ? '.js' : '.user.js'))
    }, function (aErr, aScript) {
      //
      var content = aReq.body['comment-content'];
      var category = type + '/' + installNameBase + '/issues';
      var topic = aReq.params.topic;

      if (aErr || !aScript) {
        aNext();
        return;
      }

      if (!content || !content.trim()) {
        statusCodePage(aReq, aRes, aNext, {
          statusCode: 403,
          statusMessage: 'You cannot post an empty comment to this issue'
        });
        return;
      }

      discussionLib.findDiscussion(category, topic, function (aIssue) {
        //
        var authedUser = aReq.session.user;

        if (!aIssue) {
          aNext();
          return;
        }

        discussionLib.postComment(authedUser, aIssue, content, false,
          function (aErr, aDiscussion) {
            aRes.redirect(aDiscussion.path.split('/').map(function (aStr) {
              return encodeURIComponent(aStr);
            }).join('/') +
              (aDiscussion.duplicateId ? '_' + aDiscussion.duplicateId : ''));
          });
      });
    });
};

// Open or close an issue you are allowed
exports.changeStatus = function (aReq, aRes, aNext) {
  var installNameBase = scriptStorage.getInstallNameBase(aReq);
  var type = aReq.params.type;

  Script.findOne({
    installName: scriptStorage.caseSensitive(installNameBase +
      (type === 'libs' ? '.js' : '.user.js'))
    }, function (aErr, aScript) {
      var category = type + '/' + installNameBase + '/issues';
      var topic = aReq.params.topic;
      var action = aReq.params.action;
      var changed = false;

      if (aErr || !aScript) {
        aNext();
        return;
      }

      discussionLib.findDiscussion(category, topic, function (aIssue) {
        var authedUser = aReq.session.user;

        if (!aIssue) {
          aNext();
          return;
        }

        // Both the script author and the issue creator can close the issue
        // Only the script author can reopen a closed issue
        if (action === 'close' && aIssue.open
        && (authedUser.name === aIssue.author || authedUser.name === aScript.author)) {
          aIssue.open = false;
          changed = true;
        } else if (action === 'reopen' && !aIssue.open
          && authedUser.name === aScript.author) {
          aIssue.open = true;
          changed = true;
        }

        if (changed) {
          aIssue.save(function (aErr, aDiscussion) {
            aRes.redirect(aDiscussion.path.split('/').map(function (aStr) {
              return encodeURIComponent(aStr);
            }).join('/') +
              (aDiscussion.duplicateId ? '_' + aDiscussion.duplicateId : ''));
          });
        } else {
          aNext();
        }
      });
    });
};
