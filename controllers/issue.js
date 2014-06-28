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
var pageMetadata = require('../libs/templateHelpers').pageMetadata;

// List script issues
exports.list = function (req, res, next) {
  var authedUser = req.session.user;

  var type = req.route.params.type;
  var username = req.route.params.username;
  var scriptname = req.route.params.scriptname;
  var open = req.route.params.open !== 'closed';

  var installNameSlug = username + '/' + scriptname;

  Script.findOne({
    installName: scriptStorage.caseInsensitive(
      installNameSlug + (type === 'libs' ? '.js' : '.user.js'))
  }, function (err, scriptData) {
    if (err || !scriptData) { return next(); }

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

    // discussionListQuery
    var discussionListQuery = Discussion.find();

    // discussionListQuery: category
    discussionListQuery.find({ category: category.slug });

    // discussionListQuery: open
    modelQuery.findOrDefaultIfNull(discussionListQuery, 'open', options.openIssuesOnly, true);

    // discussionListQuery: Defaults
    modelQuery.applyDiscussionListQueryDefaults(discussionListQuery, options, req);

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
      options.paginationRendered = pagination.renderDefault(req);
    };
    function render() { res.render('pages/scriptIssueListPage', options); }
    function asyncComplete() { preRender(); render(); }
    async.parallel(tasks, asyncComplete);
  });
};

// Show the discussion on an issue
exports.view = function (req, res, next) {
  var authedUser = req.session.user;

  var type = req.route.params.type;
  var username = req.route.params.username;
  var scriptname = req.route.params.scriptname;
  var topic = req.route.params.topic;

  var installNameSlug = username + '/' + scriptname;

  Script.findOne({
    installName: scriptStorage.caseInsensitive(
      installNameSlug  + (type === 'libs' ? '.js' : '.user.js'))
  }, function (err, scriptData) {
    if (err || !scriptData) { return next(); }

    //
    var options = {};
    var tasks = [];

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

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

    discussionLib.findDiscussion(category.slug, topic, function (discussionData) {
      if (err || !discussionData) { return next(); }

      // Discussion
      var discussion = options.discussion = modelParser.parseDiscussion(discussionData);
      modelParser.parseIssue(discussion);
      options.canClose = authedUser && (authedUser._id == script._authorId || authedUser._id == discussion._authorId);
      options.canOpen = authedUser && authedUser._id == script._authorId;

      // commentListQuery
      var commentListQuery = Comment.find();

      // commentListQuery: discussion
      commentListQuery.find({ _discussionId: discussion._id });

      // commentListQuery: Defaults
      modelQuery.applyCommentListQueryDefaults(commentListQuery, options, req);

      // commentListQuery: Pagination
      var pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

      //--- Tasks

      // Show the number of open issues
      var scriptOpenIssueCountQuery = Discussion.find({ category: script.issuesCategorySlug, open: { $ne: false } });
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
        _.map(options.commentList, function (comment) {
          comment.author = modelParser.parseUser(comment._authorId);
        });
        _.map(options.commentList, modelParser.renderComment);

        // Script
        options.issuesCount = pagination.numItems;

        // Pagination
        options.paginationRendered = pagination.renderDefault(req);
      };
      function render() { res.render('pages/scriptIssuePage', options); }
      function asyncComplete() { preRender(); render(); }
      async.parallel(tasks, asyncComplete);
    });
  });
};

// Open a new issue
exports.open = function (req, res, next) {
  var authedUser = req.session.user;

  if (!authedUser) return res.redirect('/login');

  var topic = req.body['discussion-topic'];
  var content = req.body['comment-content'];

  var type = req.route.params.type;
  var installNameSlug = scriptStorage.getInstallName(req);

  Script.findOne({
    installName: scriptStorage.caseInsensitive(
      installNameSlug  + (type === 'libs' ? '.js' : '.user.js'))
  }, function (err, scriptData) {
    if (err || !scriptData) { return next(); }

    //
    var options = {};
    var tasks = [];

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

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

    if (topic && content) {
      // Issue Submission
      discussionLib.postTopic(authedUser, category.slug, topic, content, true,
        function (discussion) {
          if (!discussion)
            return res.redirect('/' + encodeURI(category) + '/open');

          res.redirect(encodeURI(discussion.path + (discussion.duplicateId ? '_' + discussion.duplicateId : '')));
        }
      );
    } else {
      // New Issue Page

      //--- Tasks
      // ...

      //---
      function preRender() {
        // Page metadata
        pageMetadata(options, ['New Issue', script.name]);
      };
      function render() { res.render('pages/scriptNewIssuePage', options); }
      function asyncComplete() { preRender(); render(); }
      async.parallel(tasks, asyncComplete);
    }
  });
};

// post route to add a new comment to a discussion on an issue
exports.comment = function (req, res, next) {
  var type = req.route.params.type;
  var topic = req.route.params.topic;
  var installName = scriptStorage.getInstallName(req);
  var category = type + '/' + installName + '/issues';
  var user = req.session.user;

  if (!user) { return res.redirect('/login'); }

  Script.findOne({ installName: scriptStorage.caseInsensitive(installName
    + (type === 'libs' ? '.js' : '.user.js')) }, function (err, script) {
      var content = req.body['comment-content'];

    if (err || !script) { return next(); }

    discussionLib.findDiscussion(category, topic, function (issue) {
      if (!issue) { return next(); }

      discussionLib.postComment(user, issue, content, false,
        function (err, discussion) {
          res.redirect(encodeURI(discussion.path
            + (discussion.duplicateId ? '_' + discussion.duplicateId : '')));
        });
    });
  });
};

// Open or close and issue you are allowed
exports.changeStatus = function (req, res, next) {
  var type = req.route.params.type;
  var topic = req.route.params.topic;
  var installName = scriptStorage.getInstallName(req);
  var category = type + '/' + installName + '/issues';
  var action = req.route.params.action;
  var user = req.session.user;
  var changed = false;

  if (!user) { return res.redirect('/login'); }

  Script.findOne({ installName: scriptStorage.caseInsensitive(installName
    + (type === 'libs' ? '.js' : '.user.js')) }, function (err, script) {

      if (err || !script) { return next(); }
    if (err || !script) { return next(); }

    discussionLib.findDiscussion(category, topic, function (issue) {
      if (!issue) { return next(); }

      // Both the script author and the issue creator can close the issue
      // Only the script author can reopen a closed issue
      if (action === 'close' && issue.open
      && (user.name === issue.author || user.name === script.author)) {
        issue.open = false;
        changed = true;
      } else if (action === 'reopen' && !issue.open
        && user.name === script.author) {
        issue.open = true;
        changed = true;
      }

      if (changed) {
        issue.save(function (err, discussion) {
          res.redirect(encodeURI(discussion.path
            + (discussion.duplicateId ? '_' + discussion.duplicateId : '')));
        });
      } else {
        next();
      }
    });
  });
};
