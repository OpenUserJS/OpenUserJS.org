var async = require('async');
var _ = require('underscore');

var Comment = require('../models/comment').Comment;
var Discussion = require('../models/discussion').Discussion;

var modelParser = require('../libs/modelParser');
var modelQuery = require('../libs/modelQuery');
var cleanFilename = require('../libs/helpers').cleanFilename;
var execQueryTask = require('../libs/tasks').execQueryTask;
var statusCodePage = require('../libs/templateHelpers').statusCodePage;
var pageMetadata = require('../libs/templateHelpers').pageMetadata;

var categories = [
  {
    slug: 'announcements',
    name: 'Announcements',
    description: 'UserScripts News (OpenUserJS, GreaseMonkey, etc)',
    roleReqToPostTopic: 3 // Moderator
  },
  {
    slug: 'garage',
    name: 'The Garage',
    description: 'Talk shop, and get help with user script development'
  },
  {
    slug: 'corner',
    name: 'Beggar\'s Corner',
    description: 'Propose ideas and request user scripts'
  },
  {
    slug: 'discuss',
    name: 'General Discussion',
    description: 'Off-topic discussion about anything related to user scripts or OpenUserJS.org'
  },
];
exports.categories = categories;

exports.categoryListPage = function (req, res, next) {
  var authedUser = req.session.user;

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // Page metadata
  pageMetadata(options, 'Discussions');

  // categoryList
  options.categoryList = _.map(categories, modelParser.parseCategory);
  options.multipleCategories = true;

  // discussionListQuery
  var discussionListQuery = Discussion.find();

  // discussionListQuery: Defaults
  modelQuery.applyDiscussionListQueryDefaults(discussionListQuery, options, req);

  // discussionListQuery: Pagination
  var pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

  //--- Tasks

  // Pagination
  tasks.push(pagination.getCountTask(discussionListQuery));

  // discussionListQuery
  tasks.push(execQueryTask(discussionListQuery, options, 'discussionList'));

  //---
  async.parallel(tasks, function (err) {
    if (err) next();

    //--- PreRender
    // discussionList
    options.discussionList = _.map(options.discussionList, modelParser.parseDiscussion);
    _.map(options.discussionList, function (discussion) {
      var category = _.findWhere(categories, { slug: discussion.category });
      if (!category) {
        category = {
          name: discussion.category,
          slug: discussion.category,
        };

        var regex = /^(scripts|libs)\/([^\/]+)(\/[^\/]+)?\/([^\/]+)\/issues$/;
        var match = regex.exec(category.slug);
        var isScriptIssue = match;
        if (isScriptIssue) {
          var scriptAuthorNameSlug = match[2];
          var scriptNameSlug = match[4];
          var scriptName = scriptNameSlug.replace(/\_/g, ' ');
          category.name = scriptAuthorNameSlug + '/' + scriptName;
        }
      }
      discussion.category = modelParser.parseCategory(category);
    });

    // Pagination
    options.paginationRendered = pagination.renderDefault(req);

    //---
    res.render('pages/categoryListPage', options);
  });
};

// List discussions for one of the three categories
exports.list = function (req, res, next) {
  var authedUser = req.session.user;

  var categorySlug = req.route.params.shift();

  var category = _.findWhere(categories, { slug: categorySlug });
  if (!category)
    return next();

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // Category
  category = options.category = modelParser.parseCategory(category);
  options.canPostTopicToCategory = category.canUserPostTopic(authedUser);

  // Page metadata
  pageMetadata(options, [category.name, 'Discussions'], category.description);

  // discussionListQuery
  var discussionListQuery = Discussion.find();

  // discussionListQuery: category
  discussionListQuery.find({ category: category.slug });

  // discussionListQuery: Defaults
  modelQuery.applyDiscussionListQueryDefaults(discussionListQuery, options, req);

  // discussionListQuery: Pagination
  var pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

  //--- Tasks

  // Pagination
  tasks.push(pagination.getCountTask(discussionListQuery));

  // discussionListQuery
  tasks.push(execQueryTask(discussionListQuery, options, 'discussionList'));

  //---
  async.parallel(tasks, function (err) {
    if (err) return next();

    //--- PreRender
    // discussionList
    options.discussionList = _.map(options.discussionList, modelParser.parseDiscussion);

    // Pagination
    options.paginationRendered = pagination.renderDefault(req);

    //---
    res.render('pages/discussionListPage', options);
  });
};

// Locate a discussion and deal with topic url collisions
function findDiscussion(category, topicUrl, callback) {
  // To prevent collisions we add an incrementing id to the topic url
  var topic = /(.+?)(?:_(\d+))?$/.exec(topicUrl);
  var query = { path: '/' + category + '/' + topic[1] };

  // We only need to look for the proper duplicate if there is one
  if (topic[2]) {
    query.duplicateId = Number(topic[2]);
  }

  Discussion.findOne(query, function (err, discussion) {
    if (err || !discussion) { return callback(null); }
    callback(discussion);
  });
}
exports.findDiscussion = findDiscussion;

// List comments in a discussion
exports.show = function (req, res, next) {
  var authedUser = req.session.user;

  var categorySlug = req.route.params.shift();
  var topic = req.route.params.shift();

  var category = _.findWhere(categories, { slug: categorySlug });
  if (!category)
    return next();

  findDiscussion(category.slug, topic, function (discussionData) {
    if (!discussionData) { return next(); }

    //
    var options = {};
    var tasks = [];

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    // Category
    category = options.category = modelParser.parseCategory(category);

    // Discussion
    var discussion = options.discussion = modelParser.parseDiscussion(discussionData);

    // Page metadata
    pageMetadata(options, [discussion.topic, 'Discussions'], discussion.topic);

    // commentListQuery
    var commentListQuery = Comment.find();

    // commentListQuery: discussion
    commentListQuery.find({ _discussionId: discussion._id });

    // commentListQuery: Defaults
    modelQuery.applyCommentListQueryDefaults(commentListQuery, options, req);

    // commentListQuery: Pagination
    var pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

    //--- Tasks

    // Pagination
    tasks.push(pagination.getCountTask(commentListQuery));

    // commentListQuery
    tasks.push(execQueryTask(commentListQuery, options, 'commentList'));

    //---
    async.parallel(tasks, function (err) {
      if (err) return next();

      //--- PreRender
      // commentList
      options.commentList = _.map(options.commentList, modelParser.parseComment);
      _.map(options.commentList, function (comment) {
        comment.author = modelParser.parseUser(comment._authorId);
      });
      _.map(options.commentList, modelParser.renderComment);

      // Pagination
      options.paginationRendered = pagination.renderDefault(req);

      //---
      res.render('pages/discussionPage', options);
    });
  });
};

// UI to create a new topic
exports.newTopic = function (req, res, next) {
  var authedUser = req.session.user;

  if (!authedUser)
    return res.redirect('/login');

  var categorySlug = req.route.params.category;

  var category = _.findWhere(categories, { slug: categorySlug });
  if (!category)
    return next();

  //
  var options = {};

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!category.canUserPostTopic(authedUser)) {
    return statusCodePage(req, res, next, {
      statusCode: 403,
      statusMessage: 'You cannot post a topic to this category',
    });
  }

  //
  options.category = category;

  // Page metadata
  pageMetadata(options, ['New Topic', 'Discussions']);

  //---
  res.render('pages/newDiscussionPage', options);
};

// Does all the work of submitting a new comment and updating the discussion
function postComment(user, discussion, content, creator, callback) {
  var created = new Date();
  var comment = new Comment({
    content: content,
    author: user.name,
    created: created,
    rating: 0,
    creator: creator,
    flags: 0,
    flagged: false,
    id: created.getTime().toString(16),
    _discussionId: discussion._id,
    _authorId: user._id
  });

  comment.save(function (err, comment) {
    ++discussion.comments;
    discussion.lastCommentor = user.name;
    discussion.updated = new Date();
    discussion.save(callback);
  });
}
exports.postComment = postComment;

// Does all the work of submitting a new topic and
// resolving topic url collisions
function postTopic(user, category, topic, content, issue, callback) {
  var urlTopic = cleanFilename(topic, '').replace(/_\d+$/, '');
  var path = '/' + category + '/' + urlTopic;
  var params = { sort: {} };
  params.sort.duplicateId = -1;

  if (!urlTopic) { callback(null); }

  Discussion.findOne({ path: path }, params, function (err, discussion) {
    var newDiscussion = null;
    var props = {
      topic: topic,
      category: category,
      comments: 0,
      author: user.name,
      created: new Date(),
      lastCommentor: user.name,
      updated: new Date(),
      rating: 0,
      flagged: false,
      path: path,
      _authorId: user._id
    };

    if (!err && discussion) {
      props.duplicateId = discussion.duplicateId + 1;
    } else {
      props.duplicateId = 0;
    }

    // Issues are just discussions with special properties
    if (issue) {
      props.issue = true;
      props.open = true;
      props.labels = [];
    }

    newDiscussion = new Discussion(props);

    newDiscussion.save(function (err, discussion) {
      // Now post the first comment
      postComment(user, discussion, content, true, function (err, discussion) {
        callback(discussion);
      });
    });
  });
}
exports.postTopic = postTopic;

// post route to create a new topic
exports.createTopic = function (req, res, next) {
  var authedUser = req.session.user;

  if (!authedUser)
    return res.redirect('/login');

  var categorySlug = req.route.params.category;
  var topic = req.body['discussion-topic'];
  var content = req.body['comment-content'];

  var category = _.findWhere(categories, { slug: categorySlug });
  if (!category)
    return next();

  //
  var options = {};

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!category.canUserPostTopic(authedUser)) {
    return statusCodePage(req, res, next, {
      statusCode: 403,
      statusMessage: 'You cannot post a topic to this category',
    });
  }

  postTopic(authedUser, category.slug, topic, content, false, function (discussion) {
    if (!discussion) { return exports.newTopic(req, res, next); }

    res.redirect(encodeURI(discussion.path
      + (discussion.duplicateId ? '_' + discussion.duplicateId : '')));
  });
};

// post route to create a new comment on an existing discussion
exports.createComment = function (req, res, next) {
  var category = req.route.params.category;
  var topic = req.route.params.topic;
  var user = req.session.user;
  var content = req.body['comment-content'];
  var commentId = req.body['comment-id']; // for editing

  if (!user) { return next(); }

  findDiscussion(category, topic, function (discussion) {
    if (!discussion) { return next(); }

    postComment(user, discussion, content, false, function (err, discussion) {
      res.redirect(encodeURI(discussion.path
        + (discussion.duplicateId ? '_' + discussion.duplicateId : '')));
    });
  });
};
