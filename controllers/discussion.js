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

var modelParser = require('../libs/modelParser');
var modelQuery = require('../libs/modelQuery');
var cleanFilename = require('../libs/helpers').cleanFilename;
var execQueryTask = require('../libs/tasks').execQueryTask;
var statusCodePage = require('../libs/templateHelpers').statusCodePage;
var pageMetadata = require('../libs/templateHelpers').pageMetadata;
var orderDir = require('../libs/templateHelpers').orderDir;

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
  {
    slug: 'issues',
    name: 'Issues',
    description: 'Discussions on scripts',
    virtual: true
  },
  {
    slug: 'all',
    name: 'All Discussions',
    description: 'Overview of all discussions',
    virtual: true
  }
];
exports.categories = categories;

exports.categoryListPage = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // Page metadata
  pageMetadata(options, 'Discussions');

  // Order dir
  orderDir(aReq, options, 'topic', 'asc');
  orderDir(aReq, options, 'comments', 'desc');
  orderDir(aReq, options, 'created', 'desc');
  orderDir(aReq, options, 'updated', 'desc');

  // categoryList
  options.categoryList = _.map(categories, modelParser.parseCategory);
  options.multipleCategories = true;

  // discussionListQuery
  var discussionListQuery = Discussion.find();

  // discussionListQuery: remove issues
  discussionListQuery.and({ issue: { $ne: true } });

  // discussionListQuery: Defaults
  modelQuery.applyDiscussionListQueryDefaults(discussionListQuery, options, aReq);

  // discussionListQuery: Pagination
  var pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

  //--- Tasks

  // Pagination
  tasks.push(pagination.getCountTask(discussionListQuery));

  // discussionListQuery
  tasks.push(execQueryTask(discussionListQuery, options, 'discussionList'));

  //---
  async.parallel(tasks, function (aErr) {
    if (aErr) aNext();

    //--- PreRender
    // discussionList
    options.discussionList = _.map(options.discussionList, modelParser.parseDiscussion);
    _.map(options.discussionList, function (aDiscussion) {
      var category = _.findWhere(categories, { slug: aDiscussion.category });
      if (!category) {
        category = modelParser.parseCategoryUnknown(aDiscussion.category);
      }
      aDiscussion.category = modelParser.parseCategory(category);
    });

    // Pagination
    options.paginationRendered = pagination.renderDefault(aReq);

    //---
    aRes.render('pages/categoryListPage', options);
  });
};

// List discussions for one of the three categories
exports.list = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  var categorySlug = aReq.params.category;

  var category = _.findWhere(categories, { slug: categorySlug });
  if (!category)
    return aNext();

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // Category
  category = options.category = modelParser.parseCategory(category);
  options.canPostTopicToCategory = !category.virtual && category.canUserPostTopic(authedUser);
  options.multipleCategories = category.virtual;

  // Page metadata
  pageMetadata(options, [category.name, 'Discussions'], category.description);

  // Order dir
  orderDir(aReq, options, 'topic', 'asc');
  orderDir(aReq, options, 'comments', 'desc');
  orderDir(aReq, options, 'created', 'desc');
  orderDir(aReq, options, 'updated', 'desc');

  // discussionListQuery
  var discussionListQuery = Discussion.find();

  // discussionListQuery: category
  modelQuery.applyDiscussionCategoryFilter(discussionListQuery, options, category.slug);

  // discussionListQuery: Defaults
  modelQuery.applyDiscussionListQueryDefaults(discussionListQuery, options, aReq);

  // discussionListQuery: Pagination
  var pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

  //--- Tasks

  // Pagination
  tasks.push(pagination.getCountTask(discussionListQuery));

  // discussionListQuery
  tasks.push(execQueryTask(discussionListQuery, options, 'discussionList'));

  //---
  async.parallel(tasks, function (aErr) {
    if (aErr) return aNext();

    //--- PreRender
    // discussionList
    options.discussionList = _.map(options.discussionList, modelParser.parseDiscussion);
    if (category.virtual) {
      _.map(options.discussionList, function (aDiscussion) {
        var category = _.findWhere(categories, { slug: aDiscussion.category });
        if (!category) {
          category = modelParser.parseCategoryUnknown(aDiscussion.category);
        }
        aDiscussion.category = modelParser.parseCategory(category);
      });
    }

    // Pagination
    options.paginationRendered = pagination.renderDefault(aReq);

    //---
    aRes.render('pages/discussionListPage', options);
  });
};

// Locate a discussion and deal with topic url collisions
function findDiscussion(aCategory, aTopicUrl, aCallback) {
  // To prevent collisions we add an incrementing id to the topic url
  var topic = /(.+?)(?:_(\d+))?$/.exec(aTopicUrl);
  var query = { path: '/' + aCategory + '/' + topic[1] };

  // We only need to look for the proper duplicate if there is one
  if (topic[2]) {
    query.duplicateId = Number(topic[2]);
  }

  Discussion.findOne(query, function (aErr, aDiscussion) {
    if (aErr || !aDiscussion) { return aCallback(null); }
    aCallback(aDiscussion);
  });
}
exports.findDiscussion = findDiscussion;

// List comments in a discussion
exports.show = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  var categorySlug = aReq.params.category;
  var topic = aReq.params.topic;

  var category = _.findWhere(categories, { slug: categorySlug });
  if (!category)
    return aNext();

  findDiscussion(category.slug, topic, function (aDiscussionData) {
    if (!aDiscussionData) { return aNext(); }

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
    var discussion = options.discussion = modelParser.parseDiscussion(aDiscussionData);

    // Page metadata
    pageMetadata(options, [discussion.topic, 'Discussions'], discussion.topic);

    // commentListQuery
    var commentListQuery = Comment.find();

    // commentListQuery: discussion
    commentListQuery.find({ _discussionId: discussion._id });

    // commentListQuery: Defaults
    modelQuery.applyCommentListQueryDefaults(commentListQuery, options, aReq);

    // commentListQuery: Pagination
    var pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

    //--- Tasks

    // Pagination
    tasks.push(pagination.getCountTask(commentListQuery));

    // commentListQuery
    tasks.push(execQueryTask(commentListQuery, options, 'commentList'));

    //---
    async.parallel(tasks, function (aErr) {
      if (aErr) return aNext();

      //--- PreRender
      // commentList
      options.commentList = _.map(options.commentList, modelParser.parseComment);
      _.map(options.commentList, function (aComment) {
        aComment.author = modelParser.parseUser(aComment._authorId);
      });
      _.map(options.commentList, modelParser.renderComment);

      // Pagination
      options.paginationRendered = pagination.renderDefault(aReq);

      //---
      aRes.render('pages/discussionPage', options);
    });
  });
};

// UI to create a new topic
exports.newTopic = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  var categorySlug = aReq.params.category;

  var category = _.findWhere(categories, { slug: categorySlug });
  if (!category)
    return aNext();

  //
  var options = {};

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!category.canUserPostTopic(authedUser)) {
    return statusCodePage(aReq, aRes, aNext, {
      statusCode: 403,
      statusMessage: 'You cannot post a topic to this category',
    });
  }

  //
  options.category = category;

  // Page metadata
  pageMetadata(options, ['New Topic', 'Discussions']);

  //---
  aRes.render('pages/newDiscussionPage', options);
};

// Does all the work of submitting a new comment and updating the discussion
function postComment(aUser, aDiscussion, aContent, aCreator, aCallback) {
  var created = new Date();
  var comment = new Comment({
    content: aContent,
    author: aUser.name,
    created: created,
    rating: 0,
    creator: aCreator,
    flags: 0,
    flagged: false,
    id: created.getTime().toString(16),
    _discussionId: aDiscussion._id,
    _authorId: aUser._id
  });

  comment.save(function (aErr, aComment) {
    ++aDiscussion.comments;
    aDiscussion.lastCommentor = aUser.name;
    aDiscussion.updated = new Date();
    aDiscussion.save(aCallback);
  });
}
exports.postComment = postComment;

// Does all the work of submitting a new topic and
// resolving topic url collisions
function postTopic(aUser, aCategory, aTopic, aContent, aIssue, aCallback) {
  var urlTopic = cleanFilename(aTopic, '').replace(/_\d+$/, '');
  var path = '/' + aCategory + '/' + urlTopic;
  var params = { sort: {} };
  params.sort.duplicateId = -1;

  if (!urlTopic) {
    aCallback(null);
  }

  Discussion.findOne({ path: path }, null, params, function (aErr, aDiscussion) {
    var newDiscussion = null;
    var props = {
      topic: aTopic,
      category: aCategory,
      comments: 0,
      author: aUser.name,
      created: new Date(),
      lastCommentor: aUser.name,
      updated: new Date(),
      rating: 0,
      flagged: false,
      path: path,
      _authorId: aUser._id
    };

    if (!aErr && aDiscussion) {
      props.duplicateId = aDiscussion.duplicateId + 1;
    } else {
      props.duplicateId = 0;
    }

    // Issues are just discussions with special properties
    if (aIssue) {
      props.issue = true;
      props.open = true;
      props.labels = [];
    }

    newDiscussion = new Discussion(props);

    newDiscussion.save(function (aErr, aDiscussion) {
      // Now post the first comment
      postComment(aUser, aDiscussion, aContent, true, function (aErr, aDiscussion) {
        aCallback(aDiscussion);
      });
    });
  });
}
exports.postTopic = postTopic;

// post route to create a new topic
exports.createTopic = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  var categorySlug = aReq.params.category;
  var topic = aReq.body['discussion-topic'];
  var content = aReq.body['comment-content'];

  var category = _.findWhere(categories, { slug: categorySlug });
  if (!category) {
    return aNext();
  }

  //
  var options = {};

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!category.canUserPostTopic(authedUser)) {
    return statusCodePage(aReq, aRes, aNext, {
      statusCode: 403,
      statusMessage: 'You cannot post a topic to this category'
    });
  }

  if ((!topic || !topic.trim()) || (!content || !content.trim())) {
    return statusCodePage(aReq, aRes, aNext, {
      statusCode: 403,
      statusMessage: 'You cannot post an empty discussion topic to this category'
    });
  }

  postTopic(authedUser, category.slug, topic, content, false, function (aDiscussion) {
    if (!aDiscussion) { return exports.newTopic(aReq, aRes, aNext); }

    aRes.redirect(encodeURI(aDiscussion.path
      + (aDiscussion.duplicateId ? '_' + aDiscussion.duplicateId : '')));
  });
};

// post route to create a new comment on an existing discussion
exports.createComment = function (aReq, aRes, aNext) {
  var category = aReq.params.category;
  var topic = aReq.params.topic;
  var authedUser = aReq.session.user;
  var content = aReq.body['comment-content'];

  if (!authedUser) {
    return aNext();
  }

  findDiscussion(category, topic, function (aDiscussion) {
    if (!aDiscussion) {
      return aNext();
    }

    if (!content || !content.trim()) {
      return statusCodePage(aReq, aRes, aNext, {
        statusCode: 403,
        statusMessage: 'You cannot post an empty comment to this discussion'
      });
    }

    postComment(authedUser, aDiscussion, content, false, function (aErr, aDiscussion) {
      aRes.redirect(encodeURI(aDiscussion.path
        + (aDiscussion.duplicateId ? '_' + aDiscussion.duplicateId : '')));
    });
  });
};
