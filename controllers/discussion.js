var modelsList = require('../libs/modelsList');
var Discussion = require('../models/discussion').Discussion;
var Comment = require('../models/comment').Comment;
var cleanFilename = require('../libs/helpers').cleanFilename;

exports.list = function (req, res, next) {
  var category = req.route.params.shift();
  var user = req.session.user;
  var options = { username: user ? user.name : '' };

  switch (category) {
  case 'garage':
    options.title = 'The Garage';
    options.description = 'Talk shop, and get help with user script development';
    break;
  case 'corner':
    options.title = 'Beggar\'s Corner';
    options.description = 'Propose ideas and request user scripts';
    break;
  case 'discuss':
    options.title = 'General Discussion';
    options.description = 'Off-topic discussion about anything related to user scripts or OpenUserJS.org';
    options.general = true;
    break;
  default:
    return next();
  }

  options.category = category;
  modelsList.listDiscussions({ category: category }, 
    req.route.params, '/' + category,
    function (discussionsList) {
      options.discussionsList = discussionsList;
      res.render('discussions', options);
  });
};

function findDiscussion (category, topicUrl, callback) {
  var topic = /(.+?)(?:_(\d+))?$/.exec(topicUrl);
  var query = { path: '/' + category + '/' + topic[1] };

  if (topic[2]) {
    query.duplicateId = Number(topic[2]);
  }

  Discussion.findOne(query, function (err, discussion) {
    if (err || !discussion) { return callback(null); }
    callback(discussion);
  });
}

exports.show = function (req, res, next) {
  var category = req.route.params.shift();
  var topic = req.route.params.shift();
  var user = req.session.user;
  var options = { username: user ? user.name : '' };

  findDiscussion(category, topic, function (discussion) {
    if (!discussion) { return next(); }

    options.category = category;
    options.topic = discussion.topic;
    options.title = discussion.topic;
    options.path = discussion.path;
      + (discussion.duplicateId ? '_' + discussion.duplicateId : '');
    modelsList.listComments({ _discussionId: discussion._id }, 
      req.route.params, options.path,
      function (commentsList) {
        options.commentsList = commentsList;
        res.render('discussion', options);
    });
  });
};

exports.newTopic = function (req, res, next) {
  var category = req.route.params.category;
  var user = req.session.user;

  if (!user) { return next(); }

  res.render('discussionCreate', { username: user.name, category: category });
};

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
    discussion.save(callback);
  });
}

exports.createTopic = function (req, res, next) {
  var category = req.route.params.category;
  var user = req.session.user;
  var topic = req.body['discussion-topic'];
  var urlTopic = cleanFilename(topic, '').replace(/_\d+$/, '');
  var content = req.body['comment-content'];
  var path = '/' + category + '/' + urlTopic;
  var params = { sort: {} };
  params.sort.duplicateId = -1;

  if (!user) { return next(); }
  if (!urlTopic) { return exports.newTopic(req, res, next); }
  
  Discussion.findOne({ path: path }, params, function (err, discussion) {
    var duplicateId = 0;
    var newDiscussion = null;

    if (!err && discussion) { 
      duplicateId = discussion.duplicateId + 1;
    }

    newDiscussion = new Discussion({
      topic: topic,
      category: category,
      comments: 1,
      author: user.name,
      created: new Date(),
      lastCommentor: user.name,
      updated: new Date(),
      rating: 0,
      flagged: false,
      path: path,
      duplicateId: duplicateId,
      _authorId: user._id
    });

    newDiscussion.save(function (err, discussion) {
      postComment(user, discussion, content, true, function (err, discussion) {
        res.redirect(discussion.path
          + (discussion.duplicateId ? '_' + discussion.duplicateId : ''));
      });
    });
  });
};

exports.postComment = function (req, res, next) {
  var category = req.route.params.category;
  var topic = req.route.params.topic;
  var user = req.session.user;
  var content = req.body['comment-content'];
  var commentId = req.body['comment-id']; // for editing

  if (!user) { return next(); }

  findDiscussion(category, topic, function (discussion) {
    if (!discussion) { return next(); }

    postComment(user, discussion, content, true, function (err, discussion) {
      res.redirect(discussion.path
        + (discussion.duplicateId ? '_' + discussion.duplicateId : ''));
    });
  });
};
