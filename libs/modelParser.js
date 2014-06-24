var moment = require('moment');
var _ = require('underscore');
var util = require('util');
var sanitizeHtml = require('sanitize-html');
var htmlWhitelistLink = require('./htmlWhitelistLink.json');

var Script = require('../models/script').Script;

var userRoles = require('../models/userRoles.json');
var renderMd = require('../libs/markdown').renderMd;
var helpers = require('../libs/helpers');
var getRating = require('../libs/collectiveRating').getRating;
var cleanFilename = require('../libs/helpers').cleanFilename;

var parseModelFnMap = {};

/**
 * Misc: Dates
 */

moment.lang('en', {
  relativeTime: {
    future: "in %s",
    past: "%s ago",
    s: function (number, withoutSuffix, key, isFuture) { return number + "s"; },
    m: "1m",
    mm: "%dm",
    h: "1h",
    hh: "%dh",
    d: "1D",
    dd: "%dD",
    M: "1M",
    MM: "%dM",
    y: "1Y",
    yy: "%dY"
  }
});

var parseDateProperty = function (obj, key) {
  var date = obj[key];
  obj[key + 'ISOFormat'] = date.toISOString();
  obj[key + 'Humanized'] = moment(date).fromNow();
};

/**
 * Parse persisted model data and return a new object with additional generated fields used in view templates.
 */

/**
 * Script
 */

// Urls
var getScriptPageUrl = function (script) {
  var isLib = script.isLib || false;
  var scriptPath = script.installName
    .replace(isLib ? /\.js$/ : /\.user\.js$/, '');
  return (isLib ? '/libs/' : '/scripts/') + scriptPath;
};

var getScriptViewSourcePageUrl = function (script) {
  return getScriptPageUrl(script) + '/source';
};

var getScriptEditAboutPageUrl = function (script) {
  var isLib = script.isLib || false;
  var scriptPath = script.installName
    .replace(isLib ? /\.js$/ : /\.user\.js$/, '');
  var editUrl = scriptPath.split('/');
  editUrl.shift();
  return (isLib ? '/lib/' : '/script/') + editUrl.join('/') + '/edit';
};

var getScriptEditSourcePageUrl = function (script) {
  return getScriptViewSourcePageUrl(script);
};

var getScriptInstallPageUrl = function (script) {
  var isLib = script.isLib || false;
  return (isLib ? '/libs/src/' : '/install/') + script.installName;
};

//
var parseScript = function (scriptData) {
  if (!scriptData) return;
  var script = scriptData.toObject ? scriptData.toObject() : scriptData;

  // Temporaries
  var htmlStub = null;

  // Author
  if (_.isString(script.author)) {
    script.author = parseUser({ name: script.author });
  }

  // Icons
  if (script.meta.icon) {
    if (_.isString(script.meta.icon)) {
      script.icon16Url = script.meta.icon;
      script.icon45Url = script.meta.icon;
    } else if (_.isArray(script.meta.icon) && !_.isEmpty(script.meta.icon)) {
      script.icon16Url = script.meta.icon[script.meta.icon.length - 1];
      script.icon45Url = script.meta.icon[script.meta.icon.length - 1];
    }
  }
  if (script.meta.icon64) {
    script.icon45Url = script.meta.icon64;
  }

  // Support Url
  if (script.meta.supportURL) {
    if (_.isString(script.meta.supportURL)) {
      htmlStub = '<a href="' + script.meta.supportURL + '"></a>';
      if (htmlStub === sanitizeHtml(htmlStub, htmlWhitelistLink)) {
        script.support = [{
          url: script.meta.supportURL,
          text: decodeURI(script.meta.supportURL),
          hasNoFollow: !/^(?:https?:\/\/)?openuserjs\.org/i.test(script.meta.supportURL)
        }];
      }
    } else if (_.isArray(script.meta.supportURL) && !_.isEmpty(script.meta.supportURL)) {
      htmlStub = '<a href="' + script.meta.supportURL[script.meta.supportURL.length - 1] + '"></a>';
      if (htmlStub === sanitizeHtml(htmlStub, htmlWhitelistLink)) {
        script.support = [{
          url:  script.meta.supportURL[script.meta.supportURL.length - 1],
          text: decodeURI(script.meta.supportURL[script.meta.supportURL.length - 1]),
          hasNoFollow:  !/^(?:https?:\/\/)?openuserjs\.org/i.test(script.meta.supportURL[script.meta.supportURL.length - 1])
        }];
      }
    }
  }

  //
  script.fullName = script.author.name + '/' + script.name; // GitHub-like name

  // Script Good/Bad bar.
  // script.votes = count(upvotes) + count(downvotes)
  // script.flags = flags - count(upvotes)
  var sumVotesAndFlags = script.votes + script.flags;
  var votesRatio = sumVotesAndFlags > 0 ? script.votes / sumVotesAndFlags : 0;
  var flagsRatio = sumVotesAndFlags > 0 ? script.flags / sumVotesAndFlags : 0;
  script.votesPercent = votesRatio * 100;
  script.flagsPercent = flagsRatio * 100;

  // Urls: Slugs
  script.authorSlug = script.author.name;
  script.nameSlug = cleanFilename(script.name);
  script.installNameSlug = script.author.slug + '/' + script.nameSlug;

  // Urls: Public
  script.scriptPageUrl = getScriptPageUrl(script);
  script.scriptInstallPageUrl = getScriptInstallPageUrl(script);
  script.scriptViewSourcePageUrl = getScriptViewSourcePageUrl(script);

  // Urls: Issues
  var slug = (script.isLib ? 'libs' : 'scripts');
  slug += '/' + script.author.slug;
  slug += '/' + script.nameSlug;
  script.issuesCategorySlug = slug + '/issues';
  script.scriptIssuesPageUrl = '/' + script.issuesCategorySlug;
  script.scriptOpenIssuePageUrl = '/' + slug + '/issue/new';

  // Urls: Author
  script.scriptEditMetadataPageUrl = getScriptEditAboutPageUrl(script);
  script.scriptEditSourcePageUrl = getScriptEditSourcePageUrl(script);

  // Urls: Moderation
  script.scriptRemovePageUrl = '/remove' + (script.isLib ? '/libs/' : '/scripts/') + script.installNameSlug;

  // Dates
  parseDateProperty(script, 'updated');

  return script;
};
parseModelFnMap.Script = parseScript;
exports.parseScript = parseScript;

exports.renderScript = function (script) {
  if (!script) return;
  script.aboutRendered = renderMd(script.about);
};

/**
 * User
 */

//
var parseUser = function (userData) {
  if (!userData) return;
  // var user = userData.toObject ? userData.toObject() : userData;
  var user = userData;

  // Role
  user.isMod = user.role < 4;
  user.isAdmin = user.role < 3;
  user.roleName = userRoles[user.role];

  //
  user.slug = user.name;

  // Urls: Public
  user.userPageUrl = '/users/' + user.name;
  user.userCommentListPageUrl = user.userPageUrl + '/comments';
  user.userScriptListPageUrl = user.userPageUrl + '/scripts';
  user.userManageGitHubPageUrl = user.userPageUrl + '/github';
  user.userGitHubRepoListPageUrl = user.userPageUrl + '/github/repos';
  user.userGitHubRepoPageUrl = user.userPageUrl + '/github/repo';
  user.userGitHubImportPageUrl = user.userPageUrl + '/github/import';
  user.userEditProfilePageUrl = user.userPageUrl + '/profile/edit';
  user.userUpdatePageUrl = user.userPageUrl + '/update';
  user.userRemovePageUrl = '/remove/users/' + user.name;

  // Funcs
  user.githubUserId = function () {
    var indexOfGH = user.strategies.indexOf('github');
    if (indexOfGH > -1) {
      return user.auths[indexOfGH];
    } else {
      return null;
    }
  };

  return user;
};
parseModelFnMap.User = parseUser;
exports.parseUser = parseUser;

/**
 * Group
 */

//
var parseGroup = function (groupData) {
  if (!groupData) return;
  // var group = groupData.toObject ? groupData.toObject() : groupData;
  var group = groupData;

  group.size = group._scriptIds.length;
  group.multiple = group._scriptIds.length > 1;

  group.groupPageUrl = '/group/' + group.name.replace(/\s+/g, '_');

  // Wait two hours between group rating updates
  // This calculation runs in the background
  if (new Date().getTime() > (group.updated.getTime() + 1000 * 60 * 60 * 2)) {
    Script.find({
      _id: { $in: group._scriptIds }
    }, function (err, scripts) {
      if (!err && scripts.length > 1) {
        group.rating = getRating(scripts);
      }

      group.updated = new Date();
      group.save(function (err, group) {
        console.log(util.format('Group(%s) Rating Updated', group.name));
      });
    });
  }

  return group;
};
parseModelFnMap.Group = parseGroup;
exports.parseGroup = parseGroup;

/**
 * Discussion
 */

//
var parseDiscussion = function (discussionData) {
  if (!discussionData) return;
  var discussion = discussionData.toObject ? discussionData.toObject() : discussionData;
  // var discussion = discussionData; // Can't override discussionData.category

  // Urls
  discussion.discussionPageUrl = discussion.path + (discussion.duplicateId ? '_' + discussion.duplicateId : '');

  // Dates
  parseDateProperty(discussion, 'created');
  parseDateProperty(discussion, 'updated');

  // RecentCommentors
  var recentCommentors = [];
  if (discussion.author)
    recentCommentors.push(discussion.author);
  if (discussion.lastCommentor != discussion.author)
    recentCommentors.push(discussion.lastCommentor);
  recentCommentors = _.map(recentCommentors, function (username) {
    return {
      name: username,
    };
  });
  discussion.recentCommentors = recentCommentors;

  // Replies
  discussion.replies = (discussion.comments && discussion.comments > 0) ? discussion.comments - 1 : 0;

  //discussion.path = discussion.path + (discussion.duplicateId ? '_' + discussion.duplicateId : '');

  return discussion;
};
parseModelFnMap.Discussion = parseDiscussion;
exports.parseDiscussion = parseDiscussion;

var parseIssue = function (discussionData) {
  if (!discussionData) return;
  var discussion = discussionData.toObject ? discussionData.toObject() : discussionData;

  discussion.issue = true;
  discussion.open = (discussion.open === undefined || discussion.open === null) ? true : discussion.open;
  discussion.issueCloseUrl = discussion.path + '/close';
  discussion.issueOpenUrl = discussion.path + '/reopen';


  return discussion;
};
parseModelFnMap.Issue = parseIssue;
exports.parseIssue = parseIssue;

/**
 * Comment
 */

//
var parseComment = function (commentData) {
  if (!commentData) return;
  var comment = commentData.toObject ? commentData.toObject() : commentData;

  // Dates
  parseDateProperty(comment, 'created');

  return comment;
};
parseModelFnMap.Comment = parseComment;
exports.parseComment = parseComment;

exports.renderComment = function (comment) {
  if (!comment) return;
  comment.contentRendered = renderMd(comment.content);
};

/**
 * Category
 */

var canUserPostTopicToCategory = function (user, category) {
  // Check if user is logged in.
  if (_.isUndefined(user) || _.isNull(user))
    return false; // Not logged in.

  // Check if this category requires a minimum role to post topics.
  console.log(category.roleReqToPostTopic, _.isNumber(category.roleReqToPostTopic), user.role, user.role <= category.roleReqToPostTopic)
  if (_.isNumber(category.roleReqToPostTopic)) {
    return user.role <= category.roleReqToPostTopic;
  } else {
    // No specified role required
    return true;
  }
};

//
var parseCategory = function (categoryData) {
  if (!categoryData) return;
  var category = categoryData.toObject ? categoryData.toObject() : categoryData;

  // Urls
  category.categoryPageUrl = '/' + category.slug;
  category.categoryPostDiscussionPageUrl = '/post/' + category.slug;

  // Functions
  category.canUserPostTopic = function (user) {
    return canUserPostTopicToCategory(user, category);
  };

  return category;
};
parseModelFnMap.Category = parseCategory;
exports.parseCategory = parseCategory;

/**
 * Remove
 */

var getRemovedItemDescription = function (remove) {
  if (!remove.content)
    return 'No content';

  switch (remove.model) {
    case 'User':
      return remove.content.name;
    case 'Script':
      return remove.content.fullName || remove.content.name;
    case 'Comment':
      return util.format('by %s', remove.content.author);
    case 'Discussion':
      return remove.content.path;
    default:
      return remove.content._id;
  }
};

//
var parseRemovedItem = function (removedItemData) {
  if (!removedItemData) return;
  var removedItem = removedItemData;

  // Dates
  parseDateProperty(removedItem, 'removed');

  // User
  removedItem.remover = parseUser({ name: removedItem.removerName });

  // Content
  var parseModelFn = parseModelFnMap[removedItem.model];
  if (parseModelFn && removedItem.content)
    removedItem.content = parseModelFn(removedItem.content);

  // Item
  removedItem.itemDescription = getRemovedItemDescription(removedItem);

  // Urls
  removedItem.url = '/mod/removed/' + removedItem._id;

  return removedItem;
};
parseModelFnMap.Remove = parseRemovedItem;
exports.parseRemovedItem = parseRemovedItem;
