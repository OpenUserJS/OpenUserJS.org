var async = require('async');
var _ = require('underscore');

var Script = require('../models/script').Script;
var Discussion = require('../models/discussion').Discussion;

var modelsList = require('../libs/modelsList');
var modelParser = require('../libs/modelParser');
var modelQuery = require('../libs/modelQuery');
var scriptStorage = require('./scriptStorage');
var discussion = require('./discussion');
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

    // Metadata
    options.category = category;
    options.title = script.name + ' Issues' + ' | OpenUserJS.org';
    options.pageMetaDescription = category.description;
    options.pageMetaKeywords = null; // seperator = ', '

    // Discussion: Query
    var discussionListQuery = Discussion.find();

    // Discussion: Query: category
    discussionListQuery.find({category: category.slug});

    // Discussion: Query: open
    discussionListQuery.find({open: options.openIssuesOnly});

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
    var scriptOpenIssueCountQuery = Discussion.find({ category: script.issuesCategory, open: true });
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
  var type = req.route.params.shift();
  var username = req.route.params.shift().toLowerCase();
  var namespace = req.route.params.shift();
  var scriptname = req.route.params.shift();
  var topic = req.route.params.shift();
  var installName = username + '/' + (namespace ? namespace + '/' : '')
    + scriptname;
  var user = req.session.user;
  var options = { username: user ? user.name : '' };
  var category = type + '/' + installName + '/issues';

  Script.findOne({ installName: installName 
    + (type === 'libs' ? '.js' : '.user.js') }, function (err, script) {
      if (err || !script) { return next(); }

      discussion.findDiscussion(category, topic, function (discussion) {
        if (!discussion) { return next(); }

        options.category = category;
        options.topic = discussion.topic;
        options.title = discussion.topic;
        options.issue = true;
        options.open = discussion.open;
        options.canClose = user ? discussion.author === user.name
          || script.author === user.name : false;
        options.canOpen = user ? script.author === user.name : false;
        options.path = discussion.path
          + (discussion.duplicateId ? '_' + discussion.duplicateId : '');
        options.closeUrl = options.path + '/close';
        options.openUrl = options.path + '/reopen';

        modelsList.listComments({ _discussionId: discussion._id }, 
          req.route.params, options.path,
          function (commentsList) {
            options.commentsList = commentsList;
            res.render('discussion', options);
        });
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
  var installName = scriptStorage.getInstallName(req);
  var category = type + '/' + installName;
  var user = req.session.user;

  Script.findOne({
    installName: installName  + (type === 'libs' ? '.js' : '.user.js')
  }, function (err, script) {

    if (err || !script) { return next(); }

    if (!topic) { 
      return res.render('discussionCreate', {
        title: 'New Issue for ' + script.name,
        name: script.name,
        username: user.name,
        category: category,
        issue: true
      });
    }

    discussion.postTopic(user, category + '/issues', topic, content, true,
      function (discussion) {
        if (!discussion) {
          return res.redirect('/' + encodeURI(category) + '/open');
        }

        res.redirect(encodeURI(discussion.path
          + (discussion.duplicateId ? '_' + discussion.duplicateId : '')));
    });
  });
};

// post route to add a new comment to a discussion on an issue
exports.comment = function (req, res, next) {
  var type = req.route.params.type;
  var topic = req.route.params.topic;
  var installName = scriptStorage.getInstallName(req);
  var category = type + '/' + installName + '/issues';
  var user = req.session.user;

  if (!user) { return next(); }

  Script.findOne({ installName: installName 
    + (type === 'libs' ? '.js' : '.user.js') }, function (err, script) {
      var content = req.body['comment-content'];

      if (err || !script) { return next(); }

      discussion.findDiscussion(category, topic, function (issue) {
        if (!issue) { return next(); }

        discussion.postComment(user, issue, content, false,
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

  if (!user) { return next(); }

  Script.findOne({ installName: installName 
    + (type === 'libs' ? '.js' : '.user.js') }, function (err, script) {

      if (err || !script) { return next(); }

      discussion.findDiscussion(category, topic, function (issue) {
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
