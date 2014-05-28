var async = require('async');
var _ = require('underscore');

var Comment = require('../models/comment').Comment;
var Discussion = require('../models/discussion').Discussion;

var renderMd = require('../libs/markdown').renderMd;
var modelsList = require('../libs/modelsList');
var modelParser = require('../libs/modelParser');
var modelQuery = require('../libs/modelQuery');
var cleanFilename = require('../libs/helpers').cleanFilename;
var getDefaultPagination = require('../libs/templateHelpers').getDefaultPagination;
var execQueryTask = require('../libs/tasks').execQueryTask;

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

exports.categoryListPage = function (req, res, next) {
  var authedUser = req.session.user;

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // Metadata
  options.title = 'OpenUserJS.org';
  options.pageMetaDescription = '.';
  options.pageMetaKeywords = null;

  // CategoryList
  options.categoryList = _.map(categories, modelParser.parseCategory);

  options.multipleCategories = true;

  // DiscussionListQuery
  var discussionListQuery = Discussion.find();

  // DiscussionListQuery: Defaults
  modelQuery.applyDiscussionListQueryDefaults(discussionListQuery, options, req);

  // DiscussionListQuery: Pagination
  var pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

  //--- Tasks
  
  // Pagination
  tasks.push(pagination.getCountTask(discussionListQuery));

  // DiscussionListQuery
  tasks.push(execQueryTask(discussionListQuery, options, 'discussionList'));

  //---
  function preRender(){
    // discussionList
    options.discussionList = _.map(options.discussionList, modelParser.parseDiscussion);
    _.map(options.discussionList, function(discussion){
      var category = _.findWhere(categories, {slug: discussion.category});
      if (!category) {
        category = {
          name: discussion.category,
          slug: discussion.category,
        };
      }
      discussion.category = modelParser.parseCategory(category);
    });

    // Pagination
    options.paginationRendered = pagination.renderDefault(req);
  };
  function render(){ res.render('pages/categoryListPage', options); }
  function asyncComplete(){ preRender(); render(); }
  async.parallel(tasks, asyncComplete);
};

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
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // Category
  category = options.category = modelParser.parseCategory(category);

  // Metadata
  options.title = category.name + ' | OpenUserJS.org';
  options.pageMetaDescription = category.description;
  options.pageMetaKeywords = null; // seperator = ', '

  // DiscussionListQuery
  var discussionListQuery = Discussion.find();

  // DiscussionListQuery: category
  discussionListQuery.find({category: category.slug});
  
  // DiscussionListQuery: Defaults
  modelQuery.applyDiscussionListQueryDefaults(discussionListQuery, options, req);

  // DiscussionListQuery: Pagination
  var pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

  //--- Tasks

  // Pagination
  tasks.push(pagination.getCountTask(discussionListQuery));

  // DiscussionListQuery
  tasks.push(execQueryTask(discussionListQuery, options, 'discussionList'));

  //---
  function preRender(){
    // discussionList
    options.discussionList = _.map(options.discussionList, modelParser.parseDiscussion);

    // Pagination
    options.paginationRendered = pagination.renderDefault(req);
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

    // Category
    category = options.category = modelParser.parseCategory(category);

    // Discussion
    var discussion = options.discussion = modelParser.parseDiscussion(discussionData);

    // Metadata
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
    modelQuery.parseModelListSort(commentListQuery, req.query.orderBy, req.query.orderDir, function(){
      commentListQuery.sort('created -rating');
    });

    // Pagination
    var pagination = getDefaultPagination(req);
    pagination.applyToQuery(commentListQuery);

    //--- Tasks

    // Pagination
    tasks.push(pagination.getCountTask(commentListQuery));

    // Comments
    tasks.push(execQueryTask(commentListQuery, options, 'commentList'));

    function preRender(){
      // commentList
      options.commentList = _.map(options.commentList, modelParser.parseComment);
      _.map(options.commentList, function(comment){
        comment.author = modelParser.parseUser(comment._authorId);
      });
      _.map(options.commentList, modelParser.renderComment);

      // Pagination
      options.paginationRendered = pagination.renderDefault(req);
    };
    function render(){ res.render('pages/discussionPage', options); }
    function asyncComplete(){ preRender(); render(); }
    async.parallel(tasks, asyncComplete);
  });
};

// UI to create a new topic
exports.newTopic = function (req, res, next) {
  var authedUser = req.session.user;

  if (!authedUser)
    return redirect('/login');

  var categorySlug = req.route.params.category;

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

  // Metadata
  options.title = 'OpenUserJS.org';
  options.pageMetaDescription = 'Download Userscripts to enhance your browser.';
  var pageMetaKeywords = ['userscript', 'greasemonkey'];
  pageMetaKeywords.concat(['web browser']);
  options.pageMetaKeywords = pageMetaKeywords.join(', ');

  //--- Tasks
  // ...

  //---
  function preRender(){};
  function render(){ res.render('pages/newDiscussionPage', options); }
  function asyncComplete(){ preRender(); render(); }
  async.parallel(tasks, asyncComplete);
  return;
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
