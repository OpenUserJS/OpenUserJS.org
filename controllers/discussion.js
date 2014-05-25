var async = require('async');
var _ = require('underscore');
var url = require("url");

var Comment = require('../models/comment').Comment;
var Discussion = require('../models/discussion').Discussion;

var renderMd = require('../libs/markdown').renderMd;
var modelsList = require('../libs/modelsList');
var modelParser = require('../libs/modelParser');
var modelQuery = require('../libs/modelQuery');
var cleanFilename = require('../libs/helpers').cleanFilename;
var helpers = require('../libs/helpers');
var paginateTemplate = require('../libs/templateHelpers').paginateTemplate;

var categories = [
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

_.each(categories, function(category){
  category.categoryPageUrl = '/' + category.slug;
  category.categoryPostDiscussionPageUrl = '/post/' + category.slug;
});

// List discussions for one of the three categories
exports.list = function (req, res, next) {
  var authedUser = req.session.user;

  var categorySlug = req.route.params.shift();

  var category = _.findWhere(categories, {slug: categorySlug});
  if (!category)
    return next();

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.role < 4;

  //
  options.category = category;
  options.title = category.name + ' | OpenUserJS.org';
  options.pageMetaDescription = category.description;
  options.pageMetaKeywords = null; // seperator = ', '

  // Discussion: Query
  var discussionListQuery = Discussion.find();

  // Discussion: Query: category
  discussionListQuery.find({category: category.slug});

  // Scripts: Query: flagged
  // Only list flagged scripts for author and user >= moderator
  if (options.isYou || options.isMod) {
    // Show
  } else {
    // Script.flagged is undefined by default.
    discussionListQuery.find({flagged: {$ne: true}}); 
  }

  // Scripts: Query: Search
  if (req.query.q)
    modelQuery.parseDiscussionSearchQuery(discussionListQuery, req.query.q);

  // Scripts: Query: Sort
  modelQuery.parseModelListSort(Discussion, discussionListQuery, req.query.orderBy, req.query.orderDir, function(){
    discussionListQuery.sort('-updated -rating');
  });

  // Scripts: Pagination
  options.discussionListCurrentPage = req.query.p ? helpers.limitMin(1, req.query.p) : 1;
  options.discussionListLimit = req.query.limit ? helpers.limitRange(0, req.query.limit, 100) : 10;
  var discussionListSkipFrom = (options.discussionListCurrentPage * options.discussionListLimit) - options.discussionListLimit;
  discussionListQuery
    .skip(discussionListSkipFrom)
    .limit(options.discussionListLimit);

  // User scripList
  tasks.push(function (callback) {
    discussionListQuery.exec(function(err, discussionDataList){
      if (err) {
        callback();
      } else {
        options.discussionList = _.map(discussionDataList, modelParser.parseDiscussion);
        callback();
      }
    });
  });
  tasks.push(function (callback) {
    Discussion.count(discussionListQuery._conditions, function(err, discussionListCount){
      if (err) {
        callback();
      } else {
        options.discussionListCount = discussionListCount;
        options.discussionListNumPages = Math.ceil(options.discussionListCount / options.discussionListLimit) || 1;
        callback();
      }
    });
  });

  function preRender(){
    // Pagination
    options.pagination = paginateTemplate({
      currentPage: options.discussionListCurrentPage,
      lastPage: options.discussionListNumPages,
      urlFn: function(p) {
        var parseQueryString = true;
        var u = url.parse(req.url, parseQueryString);
        u.query.p = p;
        delete u.search; // http://stackoverflow.com/a/7517673/947742
        return url.format(u);
      }
    });
  };
  function render(){ res.render('pages/discussionListPage', options); }
  function asyncComplete(){ preRender(); render(); }
  async.parallel(tasks, asyncComplete);
};

// Locate a discussion and deal with topic url collisions
function findDiscussion (category, topicUrl, callback) {
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

  var category = _.findWhere(categories, {slug: categorySlug});
  if (!category)
    return next();

  findDiscussion(category.slug, topic, function (discussionData) {
    if (!discussionData) { return next(); }

    //
    var options = {};
    var tasks = [];

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.role < 4;

    //
    options.category = category;

    //
    var discussion = options.discussion = modelParser.parseDiscussion(discussionData);
    options.title = discussion.topic + ' | OpenUserJS.org';
    options.pageMetaDescription = discussion.topic;
    options.pageMetaKeywords = null; // seperator = ', '

    // Comments: Query
    var commentListQuery = Comment.find();

    // Comments: Query: discussion
    commentListQuery.find({_discussionId: discussion._id});

    // Comments: Query: flagged
    // Only list flagged scripts for author and user >= moderator
    if (options.isYou || options.isMod) {
      // Show
    } else {
      // Script.flagged is undefined by default.
      commentListQuery.find({flagged: {$ne: true}}); 
    }

    // Comments: Query: Populate
    commentListQuery.populate({
      path: '_authorId',
      model: 'User',
      select: 'name role'
    });

    // Comments: Query: Search
    if (req.query.q)
      modelQuery.parseCommentSearchQuery(commentListQuery, req.query.q);

    // Comments: Query: Sort
    modelQuery.parseModelListSort(Comment, commentListQuery, req.query.orderBy, req.query.orderDir, function(){
      commentListQuery.sort('created -rating');
    });

    // Comments: Pagination
    options.commentListCurrentPage = req.query.p ? helpers.limitMin(1, req.query.p) : 1;
    options.commentListLimit = req.query.limit ? helpers.limitRange(0, req.query.limit, 100) : 10;
    var commentListSkipFrom = (options.commentListCurrentPage * options.commentListLimit) - options.commentListLimit;
    commentListQuery
      .skip(commentListSkipFrom)
      .limit(options.commentListLimit);

    // Comments
    tasks.push(function (callback) {
      commentListQuery.exec(function(err, commentDataList){
        if (err) {
          callback();
        } else {
          options.commentList = _.map(commentDataList, modelParser.parseComment);
          _.map(options.commentList, function(comment){
            comment.author = modelParser.parseUser(comment._authorId);
          });
          callback();
        }
      });
    });
    tasks.push(function (callback) {
      Comment.count(commentListQuery._conditions, function(err, commentListCount){
        if (err) {
          callback();
        } else {
          options.commentListCount = commentListCount;
          options.commentListNumPages = Math.ceil(options.commentListCount / options.commentListLimit) || 1;
          callback();
        }
      });
    });

    function preRender(){
      // Pagination
      options.pagination = paginateTemplate({
        currentPage: options.commentListCurrentPage,
        lastPage: options.commentListNumPages,
        urlFn: function(p) {
          var parseQueryString = true;
          var u = url.parse(req.url, parseQueryString);
          u.query.p = p;
          delete u.search; // http://stackoverflow.com/a/7517673/947742
          return url.format(u);
        }
      });

      // Render
      _.map(options.commentList, modelParser.renderComment);
    };
    function render(){ res.render('pages/discussionPage', options); }
    function asyncComplete(){ preRender(); render(); }
    async.parallel(tasks, asyncComplete);
  });
};

// UI to create a new topic
exports.newTopic = function (req, res, next) {
  var category = req.route.params.category;
  var user = req.session.user;

  if (!user) { return next(); }

  res.render('discussionCreate', { username: user.name, category: category });
};

// Does all the work of submitting a new comment and updating the discussion
function postComment (user, discussion, content, creator, callback) {
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
function postTopic (user, category, topic, content, issue, callback) {
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
  var user = req.session.user;
  var category = req.route.params.category;
  var topic = req.body['discussion-topic'];
  var content = req.body['comment-content'];

  if (!user) { return next(); }

  postTopic(user, category, topic, content, false, function (discussion) {
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
