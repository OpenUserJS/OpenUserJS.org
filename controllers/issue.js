'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var async = require('async');
var _ = require('underscore');

var Comment = require('../models/comment').Comment;
var Discussion = require('../models/discussion').Discussion;
var Script = require('../models/script').Script;

var modelParser = require('../libs/modelParser');
var modelQuery = require('../libs/modelQuery');
var scriptStorage = require('./scriptStorage');
var discussionLib = require('./discussion');
var execQueryTask = require('../libs/tasks').execQueryTask;
var countTask = require('../libs/tasks').countTask;
var statusCodePage = require('../libs/templateHelpers').statusCodePage;
var pageMetadata = require('../libs/templateHelpers').pageMetadata;
var orderDir = require('../libs/templateHelpers').orderDir;

// List script issues
exports.list = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  var type = aReq.params.type;
  var username = aReq.params.username;
  var scriptname = aReq.params.scriptname;
  var open = aReq.params.open !== 'closed';

  var installNameSlug = username + '/' + scriptname;

  Script.findOne({
    installName: scriptStorage.caseInsensitive(
      installNameSlug + (type === 'libs' ? '.js' : '.user.js'))
  }, function (aErr, scriptData) {
    if (aErr || !scriptData) { return aNext(); }

    //
    var options = {};
    var tasks = [];

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    //
    options.openIssuesOnly = open;

    // Script
    var script = options.script = modelParser.parseScript(scriptData);
    options.isOwner = authedUser && authedUser._id == script._authorId;

    // Category
    var category = {};
    category.slug = type + '/' + installNameSlug + '/issues';
    category.name = 'Issues';
    category.description = '';
    category = options.category = modelParser.parseCategory(category);
    category.categoryPageUrl = script.scriptIssuesPageUrl;
    category.categoryPostDiscussionPageUrl = script.scriptOpenIssuePageUrl;
    options.category = category;

    // Page metadata
    pageMetadata(
      options,
      [(open ? 'Issues' : 'Closed Issues'), script.name, (script.isLib ? 'Libraries' : 'Scripts')],
      category.description);
    options.isScriptIssuesPage = true;

    // Order dir
    orderDir(aReq, options, 'topic', 'asc');
    orderDir(aReq, options, 'comments', 'desc');
    orderDir(aReq, options, 'created', 'desc');
    orderDir(aReq, options, 'updated', 'desc');

    // discussionListQuery
    var discussionListQuery = Discussion.find();

    // discussionListQuery: category
    discussionListQuery.find({ category: category.slug });

    // discussionListQuery: open
    modelQuery.findOrDefaultIfNull(discussionListQuery, 'open', options.openIssuesOnly, true);

    // discussionListQuery: Defaults
    modelQuery.applyDiscussionListQueryDefaults(discussionListQuery, options, aReq);

    // discussionListQuery: Pagination
    var pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

    // SearchBar
    options.searchBarPlaceholder = 'Search Issues';

    //--- Tasks

    // Show the number of open issues
    var scriptOpenIssueCountQuery = Discussion.find({ category: script.issuesCategorySlug, open: { $ne: false } });
    tasks.push(countTask(scriptOpenIssueCountQuery, options, 'issueCount'));

    // Pagination
    tasks.push(pagination.getCountTask(discussionListQuery, options, 'issueCount'));

    // discussionListQuery
    tasks.push(execQueryTask(discussionListQuery, options, 'discussionList'));

    //---
    function preRender() {
      options.discussionList = _.map(options.discussionList, modelParser.parseDiscussion);

      // Script
      options.issuesCount = pagination.numItems;

      // Pagination
      options.paginationRendered = pagination.renderDefault(aReq);

      // Empty list
      if (options.searchBarValue) {
        if (open) {
          options.discussionListIsEmptyMessage = 'We couldn\'t find any open discussions with this search value.';
        } else {
          options.discussionListIsEmptyMessage = 'We couldn\'t find any closed discussions with this search value.';
        }
      } else {
        if (open) {
          options.discussionListIsEmptyMessage = 'No open discussions.';
        } else {
          options.discussionListIsEmptyMessage = 'No closed discussions.';
        }
      }
    }
    function render() { aRes.render('pages/scriptIssueListPage', options); }
    function asyncComplete() { preRender(); render(); }
    async.parallel(tasks, asyncComplete);
  });
};

// Show the discussion on an issue
exports.view = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  var type = aReq.params.type;
  var username = aReq.params.username;
  var scriptname = aReq.params.scriptname;
  var topic = aReq.params.topic;

  var installNameSlug = username + '/' + scriptname;

  Script.findOne({
    installName: scriptStorage.caseInsensitive(
      installNameSlug + (type === 'libs' ? '.js' : '.user.js'))
  }, function (aErr, aScriptData) {
    if (aErr || !aScriptData) { return aNext(); }

    //
    var options = {};
    var tasks = [];

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    // Script
    var script = options.script = modelParser.parseScript(aScriptData);
    options.isOwner = authedUser && authedUser._id == script._authorId;

    // Category
    var category = {};
    category.slug = type + '/' + installNameSlug + '/issues';
    category.name = 'Issues';
    category.description = '';
    category = options.category = modelParser.parseCategory(category);
    category.categoryPageUrl = script.scriptIssuesPageUrl;
    category.categoryPostDiscussionPageUrl = script.scriptOpenIssuePageUrl;
    options.category = category;

    discussionLib.findDiscussion(category.slug, topic, function (aDiscussionData) {
      if (aErr || !aDiscussionData) { return aNext(); }

      // Discussion
      var discussion = options.discussion = modelParser.parseDiscussion(aDiscussionData);
      modelParser.parseIssue(discussion);
      options.canClose = authedUser && (authedUser._id == script._authorId || authedUser._id == discussion._authorId);
      options.canOpen = authedUser && authedUser._id == script._authorId;

      // commentListQuery
      var commentListQuery = Comment.find();

      // commentListQuery: discussion
      commentListQuery.find({ _discussionId: discussion._id });

      // commentListQuery: Defaults
      modelQuery.applyCommentListQueryDefaults(commentListQuery, options, aReq);

      // commentListQuery: Pagination
      var pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

      //--- Tasks

      // Show the number of open issues
      var scriptOpenIssueCountQuery = Discussion.find({ category: script.issuesCategorySlug, open: { $ne: false } }); // TODO: STYLEGUIDE.md conformance needed here
      tasks.push(countTask(scriptOpenIssueCountQuery, options, 'issueCount'));

      // Pagination
      tasks.push(pagination.getCountTask(commentListQuery));

      // commentListQuery
      tasks.push(execQueryTask(commentListQuery, options, 'commentList'));

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
      function render() { aRes.render('pages/scriptIssuePage', options); }
      function asyncComplete() { preRender(); render(); }
      async.parallel(tasks, asyncComplete);
    });
  });
};

// Open a new issue
exports.open = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  var topic = aReq.body['discussion-topic'];
  var content = aReq.body['comment-content'];

  var type = aReq.params.type;
  var installNameSlug = scriptStorage.getInstallName(aReq);

  Script.findOne({
    installName: scriptStorage.caseInsensitive(
      installNameSlug + (type === 'libs' ? '.js' : '.user.js'))
  }, function (aErr, aScriptData) {
    function preRender() {
      // Page metadata
      pageMetadata(options, ['New Issue', script.name]);
    }
    function render() { aRes.render('pages/scriptNewIssuePage', options); }
    function asyncComplete() { preRender(); render(); }

    // ---
    if (aErr || !aScriptData) { return aNext(); }

    //
    var options = {};
    var tasks = [];

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    // Script
    var script = options.script = modelParser.parseScript(aScriptData);
    options.isOwner = authedUser && authedUser._id == script._authorId;

    // Category
    var category = {};
    category.slug = type + '/' + installNameSlug + '/issues';
    category.name = 'Issues';
    category.description = '';
    category = options.category = modelParser.parseCategory(category);
    category.categoryPageUrl = script.scriptIssuesPageUrl;
    category.categoryPostDiscussionPageUrl = script.scriptOpenIssuePageUrl;
    options.category = category;

    if (topic && content) {
      if (!topic.trim() || !content.trim()) {
        return statusCodePage(aReq, aRes, aNext, {
          statusCode: 403,
          statusMessage: 'You cannot post an empty issue topic to this ' +
            (type === 'libs' ? 'library' : 'script')
        });
      }

      // Issue Submission
      discussionLib.postTopic(authedUser, category.slug, topic, content, true,
        function (aDiscussion) {
          if (!aDiscussion)
            return aRes.redirect('/' + encodeURI(category) + '/open');

          aRes.redirect(encodeURI(aDiscussion.path + (aDiscussion.duplicateId ? '_' + aDiscussion.duplicateId : '')));
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

// post route to add a new comment to a discussion on an issue
exports.comment = function (aReq, aRes, aNext) {
  var type = aReq.params.type;
  var topic = aReq.params.topic;
  var installName = scriptStorage.getInstallName(aReq);
  var category = type + '/' + installName + '/issues';
  var authedUser = aReq.session.user;

  Script.findOne({ installName: scriptStorage.caseInsensitive(installName
    + (type === 'libs' ? '.js' : '.user.js')) }, function (aErr, aScript) {
    var content = aReq.body['comment-content'];

    if (aErr || !aScript) {
      return aNext();
    }

    if (!content || !content.trim()) {
      return statusCodePage(aReq, aRes, aNext, {
        statusCode: 403,
        statusMessage: 'You cannot post an empty comment to this issue'
      });
    }

    discussionLib.findDiscussion(category, topic, function (aIssue) {
      if (!aIssue) {
        return aNext();
      }

      discussionLib.postComment(authedUser, aIssue, content, false,
        function (aErr, aDiscussion) {
          aRes.redirect(encodeURI(aDiscussion.path
            + (aDiscussion.duplicateId ? '_' + aDiscussion.duplicateId : '')));
        });
    });
  });
};

// Open or close and issue you are allowed
exports.changeStatus = function (aReq, aRes, aNext) {
  var type = aReq.params.type;
  var topic = aReq.params.topic;
  var installName = scriptStorage.getInstallName(aReq);
  var category = type + '/' + installName + '/issues';
  var action = aReq.params.action;
  var authedUser = aReq.session.user;
  var changed = false;

  Script.findOne({ installName: scriptStorage.caseInsensitive(installName
    + (type === 'libs' ? '.js' : '.user.js')) }, function (aErr, aScript) {

    if (aErr || !aScript) { return aNext(); }

    discussionLib.findDiscussion(category, topic, function (aIssue) {
      if (!aIssue) { return aNext(); }

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
          aRes.redirect(encodeURI(aDiscussion.path
            + (aDiscussion.duplicateId ? '_' + aDiscussion.duplicateId : '')));
        });
      } else {
        aNext();
      }
    });
  });
};
