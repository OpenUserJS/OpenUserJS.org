var Script = require('../models/script').Script;
var modelsList = require('../libs/modelsList');
var scriptStorage = require('./scriptStorage');
var discussion = require('./discussion');

// List script issues
exports.list = function (req, res, next) {
  var type = req.route.params.shift();
  var username = req.route.params.shift().toLowerCase();
  var namespace = req.route.params.shift();
  var scriptname = req.route.params.shift();
  var open = req.route.params.shift() !== 'closed';
  var installName = username + '/' + (namespace ? namespace + '/' : '')
    + scriptname;
  var user = req.session.user;
  var options = { username: user ? user.name : '' };
  var category = type + '/' + installName + '/issues';

  Script.findOne({ installName: installName 
    + (type === 'libs' ? '.js' : '.user.js') }, function (err, script) {
      if (err || !script) { return next(); }

      options.issue = true;
      options.title = script.name + ' Issues';
      options.open = open;
      options.category = type + '/' + installName;
      modelsList.listDiscussions({ category: category, open: open },
        req.route.params, '/' + category,
        function (discussionsList) {
          options.discussionsList = discussionsList;
          res.render('discussions', options);
      });
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
  var type = req.route.params.type;
  var installName = scriptStorage.getInstallName(req);
  var category = type + '/' + installName;
  var user = req.session.user;

  if (!user) { return next(); }

  Script.findOne({ installName: installName 
    + (type === 'libs' ? '.js' : '.user.js') }, function (err, script) {
      var topic = req.body['discussion-topic'];
      var content = req.body['comment-content'];

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
