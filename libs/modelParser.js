'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var moment = require('moment');
var _ = require('underscore');
var util = require('util');
var sanitizeHtml = require('sanitize-html');
var htmlWhitelistLink = require('./htmlWhitelistLink.json');

var Script = require('../models/script').Script;

var userRoles = require('../models/userRoles.json');
var renderMd = require('../libs/markdown').renderMd;
var getRating = require('../libs/collectiveRating').getRating;
var cleanFilename = require('../libs/helpers').cleanFilename;

var parseModelFnMap = {};

/**
 * Misc: Dates
 */

var momentLangFromNow = function (aDate) {
  return '[' + aDate.fromNow() + ']';
};
var momentLangTinyDate = function (aDate) {
  if (aDate.year() === moment().year()) {
    return '[' + aDate.format("D MMM") + ']';
  } else {
    return '[' + aDate.format("MMM 'YY") + ']';
  }
};
moment.locale('en-tiny', {
  calendar : {
    sameDay : function () { return momentLangFromNow(this); },
    lastDay : function () { return momentLangFromNow(this); },
    lastWeek : function () { return momentLangFromNow(this); },
    nextDay : function () { return momentLangTinyDate(this); },
    nextWeek : function () { return momentLangTinyDate(this); },
    sameElse : function () { return momentLangTinyDate(this); },
  },
  relativeTime : {
    future : "in %s",
    past : "%s ago",
    s : function (aNumber, aWithoutSuffix, aKey, aIsFuture) { return aNumber + "s"; },
    m : "1m",
    mm : "%dm",
    h : "1h",
    hh : "%dh",
    d : "1d",
    dd : "%dd",
    M : "1M",
    MM : "%dM",
    y : "1y",
    yy : "%dy"
  }
});

var parseDateProperty = function (aObj, aKey) {
  var date = aObj[aKey];
  aObj[aKey + 'ISOFormat'] = date.toISOString();
  aObj[aKey + 'Humanized'] = moment(date).locale('en-tiny').calendar();
};

/**
 * Parse persisted model data and return a new object with additional generated fields used in view templates.
 */

/**
 * Script
 */

// Urls
var getScriptPageUrl = function (aScript) {
  var isLib = aScript.isLib || false;
  var scriptPath = aScript.installName
    .replace(isLib ? /\.js$/ : /\.user\.js$/, '');
  return (isLib ? '/libs/' : '/scripts/') + encodeURI(scriptPath);
};

var getScriptViewSourcePageUrl = function (aScript) {
  return getScriptPageUrl(aScript) + '/source';
};

var getScriptEditAboutPageUrl = function (aScript) {
  var isLib = aScript.isLib || false;
  var scriptPath = aScript.installName
    .replace(isLib ? /\.js$/ : /\.user\.js$/, '');
  var editUrl = scriptPath.split('/');
  editUrl.shift();
  return (isLib ? '/lib/' : '/script/') + editUrl.join('/') + '/edit';
};

var getScriptEditSourcePageUrl = function (aScript) {
  return getScriptViewSourcePageUrl(aScript);
};

var getScriptInstallPageUrl = function (aScript) {
  var isLib = aScript.isLib || false;
  return (isLib ? '/src/libs/' : '/install/') + aScript.installName;
};

//
var parseScript = function (aScriptData) {
  if (!aScriptData) {
    return;
  }
  var script = aScriptData.toObject ? aScriptData.toObject() : aScriptData;

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
    script.hasSupport = true;
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

  // Fork
  script.isFork = script.fork && script.fork.length > 0;

  // Script Good/Bad bar.
  var sumVotesAndFlags = script.votes + script.flags;

  var votesRatio = sumVotesAndFlags > 0 ? script.votes / sumVotesAndFlags : 1;
  var flagsRatio = sumVotesAndFlags > 0 ? script.flags / sumVotesAndFlags : 0;

  var votesPercent = votesRatio * 100;
  var flagsPercent = flagsRatio * 100;

  if (flagsPercent <= 0) {
    votesPercent = script.votes === 0 ? 0 : (sumVotesAndFlags === 0 ? 100 : Math.abs(flagsPercent) / votesPercent * 100);
    flagsPercent = 0;
  }

  script.votesPercent = votesPercent;
  script.flagsPercent = flagsPercent;

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

exports.renderScript = function (aScript) {
  if (!aScript) {
    return;
  }
  aScript.aboutRendered = renderMd(aScript.about);
};

/**
 * User
 */

//
var parseUser = function (aUserData) {
  if (!aUserData) {
    return;
  }
  // var user = aUserData.toObject ? aUserData.toObject() : aUserData;

  // Intermediates
  var user = aUserData;

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

  // Strategies
  user.userStrategies = user.strategies;

  return user;
};
parseModelFnMap.User = parseUser;
exports.parseUser = parseUser;

/**
 * Group
 */

//
var parseGroup = function (aGroupData) {
  if (!aGroupData) {
    return;
  }
  // var group = aGroupData.toObject ? aGroupData.toObject() : aGroupData;

  // Intermediates
  var group = aGroupData;

  if (!group.size) {
    group.size = group._scriptIds.length;
  }
  group.multiple = group._scriptIds.length > 1;

  group.groupPageUrl = '/group/' + group.name.replace(/\s+/g, '_');

  // Wait two hours between group rating updates
  // This calculation runs in the background
  if (new Date().getTime() > (group.updated.getTime() + 1000 * 60 * 60 * 2)) {
    Script.find({
      _id: { $in: group._scriptIds }
    }, function (aErr, aScripts) {
      if (!aErr && aScripts.length > 1) {
        group.size = aScripts.length;
        group.rating = getRating(aScripts);
      }

      group.updated = new Date();
      group.save(function (aErr, aGroup) {
        console.log(util.format('Group(%s) Rating Updated', aGroup.name));
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
var parseDiscussion = function (aDiscussionData) {
  if (!aDiscussionData) return;
  var discussion = aDiscussionData.toObject ? aDiscussionData.toObject() : aDiscussionData;
  // var discussion = aDiscussionData; // Can't override discussionData.category

  // Urls
  discussion.discussionPageUrl = discussion.path + (discussion.duplicateId ? '_' + discussion.duplicateId : '');

  // Dates
  parseDateProperty(discussion, 'created');
  parseDateProperty(discussion, 'updated');

  // RecentCommentors
  var recentCommentors = [];
  if (discussion.author) {
    recentCommentors.push(discussion.author);
  }
  if (discussion.lastCommentor != discussion.author) {
    recentCommentors.push(discussion.lastCommentor);
  }
  recentCommentors = _.map(recentCommentors, function (aUsername) {
    return {
      name: aUsername
    };
  });
  discussion.recentCommentors = recentCommentors;

  // Replies
  discussion.replies = (discussion.comments && discussion.comments > 0) ? discussion.comments - 1 : 0;

  discussion.path = discussion.path + (discussion.duplicateId ? '_' + discussion.duplicateId : '');

  discussion.open = typeof (discussion.open) === 'undefined' ? true : discussion.open;

  return discussion;
};
parseModelFnMap.Discussion = parseDiscussion;
exports.parseDiscussion = parseDiscussion;

var parseIssue = function (aDiscussionData) {
  if (!aDiscussionData) {
    return;
  }
  var discussion = aDiscussionData.toObject ? aDiscussionData.toObject() : aDiscussionData;

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
var parseComment = function (aCommentData) {
  if (!aCommentData) {
    return;
  }
  var comment = aCommentData.toObject ? aCommentData.toObject() : aCommentData;

  // Dates
  parseDateProperty(comment, 'created');

  return comment;
};
parseModelFnMap.Comment = parseComment;
exports.parseComment = parseComment;

exports.renderComment = function (aComment) {
  if (!aComment) {
    return;
  }
  aComment.contentRendered = renderMd(aComment.content);
};

/**
 * Category
 */

var canUserPostTopicToCategory = function (aUser, aCategory) {
  // Check if user is logged in.
  if (_.isUndefined(aUser) || _.isNull(aUser)) {
    return false; // Not logged in.
  }

  // Check if this category requires a minimum role to post topics.
  console.log(aCategory.roleReqToPostTopic, _.isNumber(aCategory.roleReqToPostTopic), aUser.role, aUser.role <= aCategory.roleReqToPostTopic);
  if (_.isNumber(aCategory.roleReqToPostTopic)) {
    return aUser.role <= aCategory.roleReqToPostTopic;
  } else {
    // No specified role required
    return true;
  }
};

//
var parseCategory = function (aCategoryData) {
  if (!aCategoryData) {
    return;
  }
  var category = aCategoryData.toObject ? aCategoryData.toObject() : aCategoryData;

  // Urls
  category.categoryPageUrl = '/' + category.slug;
  category.categoryPostDiscussionPageUrl = '/post/' + category.slug;

  // Functions
  category.canUserPostTopic = function (aUser) {
    return canUserPostTopicToCategory(aUser, category);
  };

  return category;
};
parseModelFnMap.Category = parseCategory;
exports.parseCategory = parseCategory;

var parseCategoryUnknown = function (aCategoryUnknownSlug) {
  var category = {
    name: aCategoryUnknownSlug,
    slug: aCategoryUnknownSlug
  };

  var isScriptIssueRegex = /^(scripts|libs)\/([^\/]+)(\/[^\/]+)?\/([^\/]+)\/issues$/;
  var isScriptIssue = isScriptIssueRegex.exec(category.slug);
  if (isScriptIssue) {
    var scriptAuthorNameSlug = isScriptIssue[2];
    var scriptNameSlug = isScriptIssue[4];
    var scriptName = scriptNameSlug.replace(/\_/g, ' ');
    category.name = scriptAuthorNameSlug + '/' + scriptName;
  }
  return category;
};
exports.parseCategoryUnknown = parseCategoryUnknown;

/**
 * Remove
 */

var getRemovedItemDescription = function (aRemove) {
  if (!aRemove.content) {
    return {
      description: 'No content'
    };
  }

  switch (aRemove.model) {
    case 'User':
      return {
        description: aRemove.content.name,
        url: aRemove.content.userPageUrl
      };
    case 'Script':
      return {
        description: aRemove.content.fullName || aRemove.content.name,
        url: aRemove.content.scriptPageUrl
      };
    case 'Comment':
      return {
        description: util.format('by %s', aRemove.content.author),
        url: aRemove.content.discussionPageUrl
      };
    case 'Discussion':
      return {
        description: aRemove.content.path,
        url: aRemove.content.discussionPageUrl
      };
    default:
      return {
        description: aRemove.content._id
      };
  }
};

//
var parseRemovedItem = function (aRemovedItemData) {
  if (!aRemovedItemData) {
    return;
  }
  var removedItem = aRemovedItemData;

  // Dates
  parseDateProperty(removedItem, 'removed');

  // User
  removedItem.remover = parseUser({ name: removedItem.removerName });

  // Content
  var parseModelFn = parseModelFnMap[removedItem.model];
  if (parseModelFn && removedItem.content) {
    removedItem.content = parseModelFn(removedItem.content);
  }

  // Item
  removedItem.item = {};
  removedItem.item = getRemovedItemDescription(removedItem);
  if (removedItem.item.url) {
    removedItem.item.hasUrl = true;
  }

  // Urls
  removedItem.url = '/mod/removed/' + removedItem._id;

  return removedItem;
};
parseModelFnMap.Remove = parseRemovedItem;
exports.parseRemovedItem = parseRemovedItem;
