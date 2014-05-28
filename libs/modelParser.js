var moment = require('moment');

var userRoles = require('../models/userRoles.json');
var renderMd = require('../libs/markdown').renderMd;
var cleanFilename = require('../libs/helpers').cleanFilename;


moment.lang('en', {
  relativeTime : {
    future: "in %s",
    past:   "%s ago",
    s:  function(number, withoutSuffix, key, isFuture){ return number + "s"; },
    m:  "1m",
    mm: "%dm",
    h:  "1h",
    hh: "%dh",
    d:  "1d",
    dd: "%dd",
    M:  "1m",
    MM: "%dm",
    y:  "1y",
    yy: "%dy"
  }
});

/**
 * Parse persisted model data and return a new object with additional generated fields used in view templates.
 */

/**
 * Script
 */

// Urls
var getScriptPageUrl = function(script) {
  var isLib = script.isLib || false;
  var scriptPath = script.installName
    .replace(isLib ? /\.js$/ : /\.user\.js$/, '');
  return (isLib ? '/libs/' : '/scripts/') + scriptPath;
};

var getScriptViewSourcePageUrl = function(script) {
  return getScriptPageUrl(script) + '/source';
};

var getScriptEditAboutPageUrl = function(script) {
  var isLib = script.isLib || false;
  var scriptPath = script.installName
    .replace(isLib ? /\.js$/ : /\.user\.js$/, '');
  var editUrl = scriptPath.split('/');
  editUrl.shift();
  return (isLib ? '/lib/' : '/script/') + editUrl.join('/') + '/edit';
};

var getScriptEditSourcePageUrl = function(script) {
  return getScriptViewSourcePageUrl(script);
};

var getScriptInstallPageUrl = function(script) {
  var isLib = script.isLib || false;
  return (isLib ? '/libs/src/' : '/install/') + script.installName;
};

//
exports.parseScript = function(scriptData) {
  if (scriptData === undefined) return;
  var script = scriptData.toObject ? scriptData.toObject() : scriptData;

  // Script Good/Bad bar.
  // script.votes = upvotes
  // script.flags = downvotes + flags?
  var sumVotesAndFlags = script.votes + script.flags;
  var votesRatio = sumVotesAndFlags > 0 ? script.votes / sumVotesAndFlags : 0;
  var flagsRatio = sumVotesAndFlags > 0 ? script.flags / sumVotesAndFlags : 0;
  script.votesPercent = votesRatio * 100;
  script.flagsPercent = flagsRatio * 100;

  // Urls: Slugs
  script.authorSlug = script.author;
  script.namespaceSlug = script.meta && script.meta.namespace && cleanFilename(script.meta.namespace);
  script.nameSlug = cleanFilename(script.name);
  script.installNameSlug = script.authorSlug + '/' + (script.namespaceSlug ? script.namespaceSlug + '/' : '') + script.nameSlug;
  
  // Urls: Public
  script.scriptPageUrl = getScriptPageUrl(script);
  script.scriptInstallPageUrl = getScriptInstallPageUrl(script);
  script.scriptViewSourcePageUrl = getScriptViewSourcePageUrl(script);

  // Urls: Issues
  script.issuesCategory = (script.isLib ? 'libs' : 'scripts') + '/' + script.installNameSlug;
  script.scriptIssuesPageUrl = '/' + script.issuesCategory + '/issues';
  script.scriptOpenIssuePageUrl = '/' + script.issuesCategory + '/issue/new';

  // Urls: Author
  script.scriptEditMetadataPageUrl = getScriptEditAboutPageUrl(script);
  script.scriptEditSourcePageUrl = getScriptEditSourcePageUrl(script);

  // Dates
  script.updatedISOFormat = script.updated.toISOString();
  script.updatedHumanized = moment(script.updated).fromNow();

  return script;
};

/**
 * User
 */

//
exports.parseUser = function(userData) {
  if (userData === undefined) return;
  var user = userData.toObject ? userData.toObject() : userData;
  
  // Role
  user.isMod = user.role < 4;
  user.isAdmin = user.role < 3;
  user.roleName = userRoles[user.role];

  // Urls: Public
  user.userPageUrl = '/users/' + user.name;
  user.userScriptListPageUrl = user.userPageUrl + '/scripts';
  user.userEditProfilePageUrl = user.userPageUrl + '/profile/edit';

  return user;
};

/**
 * Group
 */

//
exports.parseGroup = function(groupData) {
  if (groupData === undefined) return;
  var group = groupData.toObject ? groupData.toObject() : groupData;

  group.size = group._scriptIds.length;
  group.multiple = group._scriptIds.length > 1;
  
  group.groupPageUrl = '/group/' + group.name.replace(/\s+/g, '_');

  return group;
};

/**
 * Discussion
 */

//
exports.parseDiscussion = function(discussionData) {
  if (discussionData === undefined) return;
  var discussion = discussionData.toObject ? discussionData.toObject() : discussionData;

  // Urls
  discussion.discussionPageUrl = discussion.path + (discussion.duplicateId ? '_' + discussion.duplicateId : '');

  // Dates
  discussion.createdISOFormat = discussion.created.toISOString();
  discussion.createdHumanized = moment(discussion.created).fromNow();
  discussion.updatedISOFormat = discussion.updated.toISOString();
  discussion.updatedHumanized = moment(discussion.updated).fromNow();

  return discussion;
};

/**
 * Comment
 */

//
exports.parseComment = function(commentData) {
  if (commentData === undefined) return;
  var comment = commentData.toObject ? commentData.toObject() : commentData;

  // Dates
  comment.createdISOFormat = comment.created.toISOString();
  comment.createdHumanized = moment(comment.created).fromNow();

  return comment;
};

exports.renderComment = function(comment) {
  comment.contentRendered = renderMd(comment.content);
};


/**
 * Category
 */

//
exports.parseCategory = function(categoryData) {
  if (categoryData === undefined) return;
  var category = categoryData.toObject ? categoryData.toObject() : categoryData;

  // Urls
  category.categoryPageUrl = '/' + category.slug;
  category.categoryPostDiscussionPageUrl = '/post/' + category.slug;

  return category;
};
