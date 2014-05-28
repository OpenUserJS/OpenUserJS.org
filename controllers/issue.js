var async = require('async');
var _ = require('underscore');

var Comment = require('../models/comment').Comment;
var Discussion = require('../models/discussion').Discussion;
var Script = require('../models/script').Script;

var modelsList = require('../libs/modelsList');
var modelParser = require('../libs/modelParser');
var modelQuery = require('../libs/modelQuery');
var scriptStorage = require('./scriptStorage');
var discussionLib = require('./discussion');
var getDefaultPagination = require('../libs/templateHelpers').getDefaultPagination;
var execQueryTask = require('../libs/tasks').execQueryTask;
var countTask = require('../libs/tasks').countTask;


// List script issues
exports.list = function (req, res, next) {
  var authedUser = req.session.user;

  var type = req.route.params.type;
  var username = req.route.params.username.toLowerCase();
  var namespace = req.route.params.namespace;
  var scriptname = req.route.params.scriptname;
  var open = req.route.params.open !== 'closed';

  var installNameSlug = username + '/' + (namespace ? namespace + '/' : '') + scriptname;

  Script.findOne({
    installName: installNameSlug  + (type === 'libs' ? '.js' : '.user.js')
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

    // Metadata
    options.title = script.name + ' Issues' + ' | OpenUserJS.org';
    options.pageMetaDescription = category.description;
    options.pageMetaKeywords = null; // seperator = ', '

    // Discussion: Query
    var discussionListQuery = Discussion.find();

    // Discussion: Query: category
    discussionListQuery.find({category: category.slug});

    // Discussion: Query: open
    modelQuery.findOrDefaultIfNull(discussionListQuery, 'open', options.openIssuesOnly, true);

    // Discussion: Query: flagged
    // Only list flagged scripts for author and user >= moderator
    if (options.isYou || options.isMod) {
      // Show
    } else {
      // Script.flagged is undefined by default.
      discussionListQuery.find({flagged: {$ne: true}}); 
    }

    // Discussion: Query: Search
    if (req.query.q)
      modelQuery.parseDiscussionSearchQuery(discussionListQuery, req.query.q);

    // Discussion: Query: Sort
    modelQuery.parseModelListSort(discussionListQuery, req.query.orderBy, req.query.orderDir, function(){
      discussionListQuery.sort('-updated -rating');
    });

    // Pagination
    var pagination = getDefaultPagination(req);
    pagination.applyToQuery(discussionListQuery);

    //--- Tasks

    // Show the number of open issues
    var scriptOpenIssueCountQuery = Discussion.find({ category: script.issuesCategorySlug, open: {$ne: false} });
    tasks.push(countTask(scriptOpenIssueCountQuery, options, 'issueCount'));

    // Pagination
    tasks.push(pagination.getCountTask(discussionListQuery, options, 'issueCount'));

    // Discussion
    tasks.push(execQueryTask(discussionListQuery, options, 'discussionList'));

    function preRender(){
      options.discussionList = _.map(options.discussionList, modelParser.parseDiscussion);
      
      // Script
      options.issuesCount = pagination.numItems;

      // Pagination
      options.paginationRendered = pagination.renderDefault(req);
    };
    function render(){ res.render('pages/scriptIssueListPage', options); }
    function asyncComplete(){ preRender(); render(); }
    async.parallel(tasks, asyncComplete);
  });
};

// Show the discussion on an issue
exports.view = function (req, res, next) {
  var authedUser = req.session.user;

  var type = req.route.params.type;
  var username = req.route.params.username.toLowerCase();
  var namespace = req.route.params.namespace;
  var scriptname = req.route.params.scriptname;
  var topic = req.route.params.topic;

  var installNameSlug = username + '/' + (namespace ? namespace + '/' : '') + scriptname;

  Script.findOne({
    installName: installNameSlug  + (type === 'libs' ? '.js' : '.user.js')
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
      options.canClose = authedUser && (authedUser.name === script.author || authedUser.name === discussion.author);
      options.canOpen = authedUser && authedUser.name === script.author;

      // CommentListQuery
      var commentListQuery = Comment.find();

      // CommentListQuery: discussion
      commentListQuery.find({_discussionId: discussion._id});

      // CommentListQuery: Defaults
      modelQuery.applyCommentListQueryDefaults(commentListQuery, options, req);

      // CommentListQuery: Pagination
      var pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

      //--- Tasks

      // Show the number of open issues
      var scriptOpenIssueCountQuery = Discussion.find({ category: script.issuesCategorySlug, open: {$ne: false} });
      tasks.push(countTask(scriptOpenIssueCountQuery, options, 'issueCount'));

      // CommentListQuery: Pagination
      tasks.push(pagination.getCountTask(commentListQuery));

      // Comments
      tasks.push(execQueryTask(commentListQuery, options, 'commentList'));

      function preRender(){
        // Metadata
        options.title = discussion.topic +  + ' | OpenUserJS.org';
        options.pageMetaDescription = discussion.topic;
        options.pageMetaKeywords = null; // seperator = ', '

        // commentList
        options.commentList = _.map(options.commentList, modelParser.parseComment);
        _.map(options.commentList, function(comment){
          comment.author = modelParser.parseUser(comment._authorId);
        });
        _.map(options.commentList, modelParser.renderComment);
        
        // Script
        options.issuesCount = pagination.numItems;

        // Pagination
        options.paginationRendered = pagination.renderDefault(req);
      };
      function render(){ res.render('pages/scriptIssuePage', options); }
      function asyncComplete(){ preRender(); render(); }
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
    installName: installNameSlug  + (type === 'libs' ? '.js' : '.user.js')
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
      function preRender(){
        // Metadata
        options.title = 'New Issue for ' + script.name + ' | OpenUserJS.org';
        options.pageMetaDescription = '';
        options.pageMetaKeywords = null; // seperator = ', '
      };
      function render(){ res.render('pages/scriptNewIssuePage', options); }
      function asyncComplete(){ preRender(); render(); }
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

  Script.findOne({ installName: installName 
    + (type === 'libs' ? '.js' : '.user.js') }, function (err, script) {
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

  Script.findOne({ installName: installName 
    + (type === 'libs' ? '.js' : '.user.js') }, function (err, script) {

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
