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

//--- Controller inclusions

//--- Library inclusions
// var discussionLib = require('../libs/discussion');

var editLib = require('../libs/edit');
var flagLib = require('../libs/flag');
var removeLib = require('../libs/remove');

var modelParser = require('../libs/modelParser');
var modelQuery = require('../libs/modelQuery');

var cleanFilename = require('../libs/helpers').cleanFilename;
var execQueryTask = require('../libs/tasks').execQueryTask;
var statusCodePage = require('../libs/templateHelpers').statusCodePage;
var pageMetadata = require('../libs/templateHelpers').pageMetadata;
var orderDir = require('../libs/templateHelpers').orderDir;

//--- Configuration inclusions

//---

var categories = [
  {
    slug: 'announcements',
    name: 'Announcements',
    description: 'UserScripts News (OpenUserJS, Greasemonkey, etc)',
    active: true,
    roleReqToPostTopic: 3 // Moderator
  },
  {
    slug: 'garage',
    name: 'The Garage',
    description: 'Talk shop, and get help with user script development',
    active: true
  },
  {
    slug: 'corner',
    name: 'Beggar\'s Corner',
    description: 'Propose ideas and request user scripts',
    active: true
  },
  {
    slug: 'discuss',
    name: 'General Discussion',
    description: 'Off-topic discussion about anything related to user scripts or OpenUserJS.org',
    active: true
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
    clear: true,
    virtual: true
  }
];
exports.categories = categories;

exports.categoryListPage = function (aReq, aRes, aNext) {
  function preRender() {
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
  }

  function render() {
    aRes.render('pages/categoryListPage', options);
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
  var discussionListQuery = null;
  var pagination = null;
  var tasks = [];

  // Session
  options.authedUser = authedUser = modelParser.parseUser(authedUser);
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
  discussionListQuery = Discussion.find().collation({ locale: 'en', strength: 3 });

  // discussionListQuery: remove issues
  discussionListQuery.and({ issue: { $ne: true } });

  // discussionListQuery: Defaults
  modelQuery.applyDiscussionListQueryDefaults(discussionListQuery, options, aReq);

  // discussionListQuery: Pagination
  pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

  //--- Tasks

  // Pagination
  tasks.push(pagination.getCountTask(discussionListQuery));

  // discussionListQuery
  tasks.push(execQueryTask(discussionListQuery, options, 'discussionList'));

  //---
  async.parallel(tasks, asyncComplete);
};

// List discussions for one of the available categories
exports.list = function (aReq, aRes, aNext) {
  function preRender() {
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
  }

  function render() {
    aRes.render('pages/discussionListPage', options);
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
  var categorySlug = aReq.params.category;
  var authedUser = aReq.session.user;
  var category = _.findWhere(categories, { slug: categorySlug });
  var discussionListQuery = null;
  var pagination = null;
  var tasks = [];

  if (!category) {
    aNext();
    return;
  }

  // Session
  options.authedUser = authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // Category
  options.category = category = modelParser.parseCategory(category);
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
  discussionListQuery = Discussion.find().collation({ locale: 'en', strength: 3 });

  // discussionListQuery: category
  modelQuery.applyDiscussionCategoryFilter(discussionListQuery, options, category.slug);

  // discussionListQuery: Defaults
  modelQuery.applyDiscussionListQueryDefaults(discussionListQuery, options, aReq);

  // discussionListQuery: Pagination
  pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

  //--- Tasks

  // Pagination
  tasks.push(pagination.getCountTask(discussionListQuery));

  // discussionListQuery
  tasks.push(execQueryTask(discussionListQuery, options, 'discussionList'));

  //---
  async.parallel(tasks, asyncComplete);
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
    if (aErr || !aDiscussion) {
      aCallback();
      return;
    }

    aCallback(aDiscussion);
  });
}
exports.findDiscussion = findDiscussion;

// List comments in a discussion
exports.show = function (aReq, aRes, aNext) {
  //
  var categorySlug = aReq.params.category;
  var topic = aReq.params.topic;
  var category = _.findWhere(categories, { slug: categorySlug });

  if (!category) {
    aNext();
    return;
  }

  findDiscussion(category.slug, topic, function (aDiscussion) {
    function preRender() {
      // commentList
      options.commentList = _.map(options.commentList, modelParser.parseComment);

      _.map(options.commentList, function (aComment) {
        aComment.author = modelParser.parseUser(aComment._authorId);
      });

      _.map(options.commentList, modelParser.renderComment);

      // Pagination
      options.paginationRendered = pagination.renderDefault(aReq);
    }

    function render() {
      aRes.render('pages/discussionPage', options);
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
    var discussion = null;
    var commentListQuery = null;
    var pagination = null;
    var tasks = [];

    if (!aDiscussion) {
      aNext();
      return;
    }

    // Session
    options.authedUser = authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    // Category
    category = options.category = modelParser.parseCategory(category);

    // Discussion
    discussion = options.discussion = modelParser.parseDiscussion(aDiscussion);

    // Page metadata
    pageMetadata(options, [discussion.topic, 'Discussions'], discussion.topic);

    // commentListQuery
    commentListQuery = Comment.find();

    // commentListQuery: discussion
    commentListQuery.find({ _discussionId: discussion._id });

    // commentListQuery: Defaults
    modelQuery.applyCommentListQueryDefaults(commentListQuery, options, aReq);

    // commentListQuery: Pagination
    pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

    //--- Tasks

    // Pagination
    tasks.push(pagination.getCountTask(commentListQuery));

    // commentListQuery
    tasks.push(execQueryTask(commentListQuery, options, 'commentList'));

    //---
    async.parallel(tasks, asyncComplete);
  });
};

// UI to create a new topic
exports.newTopic = function (aReq, aRes, aNext) {
  function preRender() {
  }

  function render() {
    aRes.render('pages/newDiscussionPage', options);
  }

  function asyncComplete() {
    preRender();
    render();
  }

  //
  var categorySlug = aReq.params.category;
  var category = _.findWhere(categories, { slug: categorySlug });
  var options = {};
  var authedUser = aReq.session.user;
  var tasks = [];

  if (!category) {
    aNext();
    return;
  }

  // Session
  options.authedUser = authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!category.canUserPostTopic(authedUser)) {
    statusCodePage(aReq, aRes, aNext, {
      statusCode: 403,
      statusMessage: 'You cannot post a topic to this category',
    });
    return;
  }

  //
  options.category = category;

  // Page metadata
  pageMetadata(options, ['New Topic', 'Discussions']);

  //---
  async.parallel(tasks, asyncComplete);
};

// Does all the work of submitting a new comment and updating the discussion
function postComment(aUser, aDiscussion, aContent, aCreator, aUserAgent, aCallback) {
  var created = new Date();
  var comment = new Comment({
    content: aContent,
    author: aUser.name,
    created: created,
    rating: 0,
    userAgent: aUserAgent,
    creator: aCreator,
    flags: { critical: 0, absolute: 0 },
    flagged: false,
    id: created.getTime().toString(16),
    _discussionId: aDiscussion._id,
    _authorId: aUser._id
  });

  comment.save(function (aErr, aComment) {
    if (aErr) {
      console.error('Failed to postComment with comment save all the work of submitting a new comment and updating the discussion:\n', aErr, comment);

      aCallback(); // NOTE: Watchpoint
      return;
    }

    ++aDiscussion.comments;
    aDiscussion.lastCommentor = aUser.name;
    aDiscussion.updated = new Date();
    aDiscussion.save(function (aErr, aDiscussion) {
      if (aErr) {
        console.error('Failed to postComment with discussion save all the work of submitting a new comment and updating the discussion:\n', aErr, aDiscussion);

        aCallback(); // NOTE: Watchpoint
        return;
      }

      aCallback(aDiscussion); // NOTE: Watchpoint
    });
  });
}
exports.postComment = postComment;

// Does all the work of submitting a new topic and
// resolving topic url collisions
function postTopic(aUser, aCategory, aTopic, aContent, aIssue, aUserAgent, aCallback) {
  var urlTopic = cleanFilename(aTopic, '').replace(/_\d+$/, '');
  var path = '/' + aCategory + '/' + urlTopic;
  var params = { sort: {} };
  params.sort.duplicateId = -1;

  if (!urlTopic) {
    aCallback();
    return;
  }

  if (urlTopic.length > 100) { // NOTE: Watchpoint
    aCallback();
    return;
  }

  // Retest for trailing underscore with numeric digits with cleaned and reject
  if( /_\d+$/.test(urlTopic)) {
    aCallback();
    return;
  }

  Discussion.findOne({ path: path }, null, params, function (aErr, aDiscussion) {
    var newDiscussion = null;
    var now = new Date();
    var props = {
      topic: aTopic,
      category: aCategory,
      comments: 0,
      author: aUser.name,
      created: now,
      lastCommentor: aUser.name,
      updated: now,
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
      if (aErr) {
        console.error('Failed to postTopic with newDiscussion save all the work of submitting a new topic and resolving topic url collisions:\n', aErr, newDiscussion);

        aCallback(); // NOTE: Watchpoint
        return;
      }

      // Now post the first comment
      postComment(aUser, aDiscussion, aContent, true, aUserAgent, function (aDiscussion) {
        aCallback(aDiscussion);
      });
    });
  });
}
exports.postTopic = postTopic;

// post route to create a new topic
exports.createTopic = function (aReq, aRes, aNext) {
  //
  var categorySlug = aReq.params.category;
  var category = _.findWhere(categories, { slug: categorySlug });
  var options = {};
  var authedUser = aReq.session.user;
  var topic = aReq.body['discussion-topic'];
  var content = aReq.body['comment-content'];
  var userAgent = aReq.headers['user-agent'];

  var parser = 'UserScript';
  var rHeaderContent = new RegExp(
    '^(?:\\uFEFF)?\/\/ ==' + parser + '==([\\s\\S]*?)^\/\/ ==\/'+ parser + '==', 'm'
  );
  var headerContent = null;

  if (!category) {
    aNext();
    return;
  }

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!category.canUserPostTopic(authedUser)) {
    statusCodePage(aReq, aRes, aNext, {
      statusCode: 403,
      statusMessage: 'You cannot post a topic to this category'
    });
    return;
  }

  if ((!topic || !topic.trim()) || (!content || !content.trim())) {
    statusCodePage(aReq, aRes, aNext, {
      statusCode: 403,
      statusMessage: 'You cannot post an empty discussion topic to this category'
    });
    return;
  }

  // Simple validation check
  headerContent = rHeaderContent.exec(content);
  if (headerContent) {
    statusCodePage(aReq, aRes, aNext, {
      statusCode: 403, // Forbidden
      statusMessage: 'Source Code not allowed in Comment.'
    });
    return;
  }

  postTopic(authedUser, category.slug, topic, content, false, userAgent, function (aDiscussion) {
    if (!aDiscussion) {
      exports.newTopic(aReq, aRes, aNext);
      return;
    }

    aRes.redirect(aDiscussion.path.split('/').map(function (aStr) {
      return encodeURIComponent(aStr);
    }).join('/')
      + (aDiscussion.duplicateId ? '_' + aDiscussion.duplicateId : ''));
  });
};

// Post route to create a new comment on an existing discussion
exports.createComment = function (aReq, aRes, aNext) {
  //
  var authedUser = aReq.session.user;
  var category = aReq.params.category;
  var topic = aReq.params.topic;

  findDiscussion(category, topic, function (aDiscussion) {
    //
    var content = aReq.body['comment-content'];
    var userAgent = aReq.headers['user-agent'];

    var parser = 'UserScript';
    var rHeaderContent = new RegExp(
      '^(?:\\uFEFF)?\/\/ ==' + parser + '==([\\s\\S]*?)^\/\/ ==\/'+ parser + '==', 'm'
    );
    var headerContent = null;

    if (!aDiscussion) {
      aNext();
      return;
    }

    if (!content || !content.trim()) {
      statusCodePage(aReq, aRes, aNext, {
        statusCode: 403, // Forbidden
        statusMessage: 'You cannot post an empty comment to this discussion'
      });
      return;
    }

    // Simple validation check
    headerContent = rHeaderContent.exec(content);
    if (headerContent) {
      statusCodePage(aReq, aRes, aNext, {
        statusCode: 403, // Forbidden
        statusMessage: 'Source Code not allowed in Comment.'
      });
      return;
    }

    postComment(authedUser, aDiscussion, content, false, userAgent, function (aDiscussion) {
      if (!aDiscussion) {
        statusCodePage(aReq, aRes, aNext, {
          statusCode: 500,
          statusMessage: 'Failed to postComment with create a new comment on an existing discussion'
        });

        console.error('Failed to postComment with create a new comment on an existing discussion:\n', aErr, aDiscussion);
        return;
      }

      aRes.redirect(aDiscussion.path.split('/').map(function (aStr) {
        return encodeURIComponent(aStr);
      }).join('/') +
        (aDiscussion.duplicateId ? '_' + aDiscussion.duplicateId : ''));
    });
  });
};
