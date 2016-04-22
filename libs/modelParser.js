'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//

//--- Dependency inclusions
var moment = require('moment');
var _ = require('underscore');
var util = require('util');
var sanitizeHtml = require('sanitize-html');

//--- Model inclusions
var Script = require('../models/script').Script;

//--- Controller inclusions
var findMeta = require('../controllers/scriptStorage').findMeta;

//--- Library inclusions
var renderMd = require('../libs/markdown').renderMd;
var getRating = require('../libs/collectiveRating').getRating;
var cleanFilename = require('../libs/helpers').cleanFilename;
var encode = require('../libs/helpers').encode;
var decode = require('../libs/helpers').decode;

//--- Configuration inclusions
var htmlWhitelistLink = require('./htmlWhitelistLink.json');
var userRoles = require('../models/userRoles.json');

//---

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
    sameDay : function () {
      return momentLangFromNow(this);
    },
    lastDay : function () {
      return momentLangFromNow(this);
    },
    lastWeek : function () {
      return momentLangFromNow(this);
    },
    nextDay : function () {
      return momentLangTinyDate(this);
    },
    nextWeek : function () {
      return momentLangTinyDate(this);
    },
    sameElse : function () {
      return momentLangTinyDate(this);
    }
  },
  relativeTime : {
    future : "in %s",
    past : "%s ago",
    s : function (aNumber, aWithoutSuffix, aKey, aIsFuture) {
      return aNumber + "s";
    },
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
  var date = null;

  if (aObj[aKey]) {
    date = new Date(aObj[aKey]);
    if (date) {
      aObj[aKey + 'ISOFormat'] = date.toISOString();
      aObj[aKey + 'Humanized'] = moment(date).locale('en-tiny').calendar();
    }
  }
};

// Parse persisted model data and return a new object
// with additional generated fields used in view templates.

/**
 * Script
 */

// Urls
var getScriptPageUrl = function (aScriptData) {
  var isLib = aScriptData.isLib || false;

  return (isLib ? '/libs/' : '/scripts/') +
    aScriptData.authorSlugUrl +
      '/' +
        aScriptData.nameSlugUrl
};

var getScriptViewSourcePageUrl = function (aScriptData) {
  return getScriptPageUrl(aScriptData) + '/source';
};

var getScriptEditAboutPageUrl = function (aScriptData) {
  return getScriptPageUrl(aScriptData) + '/edit';
};

var getScriptEditSourcePageUrl = function (aScriptData) {
  return getScriptViewSourcePageUrl(aScriptData);
};

var getScriptInstallPageUrl = function (aScriptData) {
  var isLib = aScriptData.isLib || false;

  return (isLib ? '/src/libs/' : '/install/') +
    aScriptData.authorSlugUrl +
      '/' +
        aScriptData.nameSlugUrl +
          (isLib ? '.js' : '.user.js')
};

var getScriptMetaPageUrl = function (aScriptData) {
  var isLib = aScriptData.isLib || false;

  return (isLib ? null : '/meta/') +
    aScriptData.authorSlugUrl +
      '/' +
        aScriptData.nameSlugUrl +
          '.meta.js'
};


// Uris
var getScriptPageUri = function (aScriptData) {
  var isLib = aScriptData.isLib || false;

  return (isLib ? '/libs/' : '/scripts/') +
    aScriptData.authorSlugUri +
      '/' +
        aScriptData.nameSlugUri
};

var getScriptViewSourcePageUri = function (aScriptData) {
  return getScriptPageUri(aScriptData) + '/source';
};

var getScriptEditAboutPageUri = function (aScriptData) {
  return getScriptPageUri(aScriptData) + '/edit';
};

var getScriptEditSourcePageUri = function (aScriptData) {
  return getScriptViewSourcePageUri(aScriptData);
};

var getScriptInstallPageUri = function (aScriptData) {
  var isLib = aScriptData.isLib || false;

  return (isLib ? '/src/libs/' : '/install/') +
    aScriptData.authorSlugUri +
      '/' +
        aScriptData.nameSlugUri +
          (isLib ? '.js' : '.user.js')
};

var getScriptMetaPageUri = function (aScriptData) {
  var isLib = aScriptData.isLib || false;

  return (isLib ? null : '/meta/') +
    aScriptData.authorSlugUri +
      '/' +
        aScriptData.nameSlugUri +
          '.meta.js'
};


//
var parseScript = function (aScript) {
  var script = null;

  // Intermediates
  var description = null;
  var icon = null;
  var supportURL = null;

  var downloadURL = null;
  var downloadUtf = null;
  var rAnyLocalScriptUrl = new RegExp('^https?://(?:openuserjs\.org|oujs\.org' +
    (isDev ? '|localhost:' + (process.env.PORT || 8080) : '') +
      ')/(?:install|src/scripts)/(.+?)/(.+?)((?:\.min)?(?:\.user)?\.js)$');

  // Temporaries
  var htmlStub = null;

  //
  var criticalFlags = null;
  var sumVotesAndFlags = null;

  var votesRatio = null;
  var flagsRatio = null;

  var votesPercent = null;
  var flagsPercent = null;

  var folders = null;

  var matches = null;

  if (!aScript) {
    return;
  }

  script = aScript.toObject ? aScript.toObject({ virtuals: true }) : aScript;

  // Author
  // Extend with rewrite the User model `name` key to be an Object instead of String
  if (_.isString(script.author)) {
    script.author = parseUser({
      name: script.author
    });
  }

  // Description default
  description = findMeta(script.meta, 'UserScript.description');
  if (description) {
    description.forEach(function (aElement, aIndex, aArray) {
      if (!description[aIndex].key) {
        script.description = aElement.value;
      }
    });
  }

  // Icons
  icon = findMeta(script.meta, 'UserScript.icon.0.value');
  if (icon) {
    script.icon16Url = icon;
    script.icon45Url = icon;
  }

  icon = findMeta(script.meta, 'UserScript.icon64.0.value');
  if (icon) {
    // Local downmix
    script.icon45Url = icon;
  }

  // Support Url
  supportURL = findMeta(script.meta, 'UserScript.supportURL.0.value');
  if (supportURL) {
    htmlStub = '<a href="' + supportURL + '"></a>';
    if (htmlStub === sanitizeHtml(htmlStub, htmlWhitelistLink)) {

      script.hasSupport = true;

      script.support = [{
        url: supportURL,
        text: decode(supportURL),
        hasNoFollow: !/^(?:https?:\/\/)?openuserjs\.org/i.test(supportURL)
      }];

    }
  }

  // OpenUserJS metadata block checks
  if (findMeta(script.meta, 'OpenUserJS.unstableMinify.0.value')) {
    script.hasUnstableMinify = true;
    script.showMinficationNotices = true;
  }

  //
  script.fullName = script.author.name + '/' + script.name; // GitHub-like name

  // Fork
  script.isFork = script.fork && script.fork.length > 0;

  // Script Good/Bad bar.
  criticalFlags = (script.flags ? script.flags.critical : null) || 0;
  sumVotesAndFlags = script.votes + criticalFlags;

  votesRatio = sumVotesAndFlags > 0 ? script.votes / sumVotesAndFlags : 1;
  flagsRatio = sumVotesAndFlags > 0 ? criticalFlags / sumVotesAndFlags : 0;

  votesPercent = votesRatio * 100;
  flagsPercent = flagsRatio * 100;

  if (flagsPercent <= 0) {
    votesPercent = script.votes === 0
      ? 0
      : (sumVotesAndFlags === 0 ? 100 : Math.abs(flagsPercent) / votesPercent * 100);
    flagsPercent = 0;
  }

  script.votesPercent = votesPercent;
  script.flagsPercent = flagsPercent;

  // DB: Slugs
  script.authorSlug = script.author.name;
  script.nameSlug = cleanFilename(script.name);
  script.installNameSlug = script.author.slug + '/' + script.nameSlug; // NOTE: Redundant as `installName` is already "slugged"

  // Urls: Slugs
  script.authorSlugUrl = encode(script.authorSlug);
  script.nameSlugUrl = encode(script.nameSlug);
  script.installNameSlugUrl = encode(script.authorSlug) + '/' + encode(script.nameSlug);

  // Uris: Slugs
  script.authorSlugUri = encodeURIComponent(script.authorSlug);
  script.nameSlugUri = encodeURIComponent(script.nameSlug);
  script.installNameSlugUri = encodeURIComponent(script.authorSlug) + '/' + encodeURIComponent(script.nameSlug);


  // Urls: Public
  script.scriptPageUrl = getScriptPageUrl(script);
  script.scriptInstallPageUrl = getScriptInstallPageUrl(script);
  script.scriptInstallPageXUrl = script.scriptInstallPageUrl.replace(/(\.user)?\.js/, '');
  script.scriptMetaPageUrl = getScriptMetaPageUrl(script);
  script.scriptViewSourcePageUrl = getScriptViewSourcePageUrl(script);

  // Urls: Issues
  folders = (script.isLib ? 'libs' : 'scripts');
  folders += '/' + script.authorSlugUrl;
  folders += '/' + script.nameSlugUrl;
  script.issuesCategorySlug = folders + '/issues';
  script.scriptIssuesPageUrl = '/' + script.issuesCategorySlug;
  script.scriptOpenIssuePageUrl = '/' + folders + '/issue/new';

  // Urls: Author
  script.scriptEditMetadataPageUrl = getScriptEditAboutPageUrl(script);
  script.scriptEditSourcePageUrl = getScriptEditSourcePageUrl(script);

  // Urls: Moderation
  script.scriptRemovePageUrl = '/remove' + (script.isLib ? '/libs/' : '/scripts/') +
    script.installNameSlugUrl;
  script.scriptFlagPageUrl = '/flag' + (script.isLib ? '/libs/' : '/scripts/') +
    script.installNameSlugUrl;



  // Uris: Public
  script.scriptPageUri = getScriptPageUri(script);
  script.scriptInstallPageUri = getScriptInstallPageUri(script);
  script.scriptInstallPageXUri = script.scriptInstallPageUri.replace(/(\.user)?\.js/, '');
  script.scriptMetaPageUri = getScriptMetaPageUri(script);
  script.scriptViewSourcePageUri = getScriptViewSourcePageUri(script);

  // Uris: Issues
  folders = (script.isLib ? 'libs' : 'scripts');
  folders += '/' + script.authorSlugUri;
  folders += '/' + script.nameSlugUri;
  script.issuesCategorySlug = folders + '/issues'; // BUG: Placement/Naming??
  script.scriptIssuesPageUri = '/' + script.issuesCategorySlug; // BUG: Placement/Naming??
  script.scriptOpenIssuePageUri = '/' + folders + '/issue/new';

  // Uris: Author
  script.scriptEditMetadataPageUri = getScriptEditAboutPageUri(script);
  script.scriptEditSourcePageUri = getScriptEditSourcePageUri(script);

  // Uris: Moderation
  script.scriptRemovePageUri = '/remove' + (script.isLib ? '/libs/' : '/scripts/') +
    script.installNameSlugUri;
  script.scriptFlagPageUri = '/flag' + (script.isLib ? '/libs/' : '/scripts/') +
    script.installNameSlugUri;



  // Dates
  parseDateProperty(script, 'updated');
  parseDateProperty(script, '_since'); // Virtual

  if (script._since && script.updated && script._since.toString() !== script.updated.toString()) {
    script.isUpdated = true;
  }

  // Download Url
  downloadURL = findMeta(script.meta, 'UserScript.downloadURL.0.value');
  if (downloadURL) {
    try {
      downloadUtf = decodeURIComponent(downloadURL);

    } catch (aE) {
      script.hasInvalidDownloadURL = true;
      script.showMinficationNotices = true;

    } finally {
      if (!script.hasInvalidDownloadURL)  {
        matches = downloadUtf.match(rAnyLocalScriptUrl);
        if (matches) {
          if (matches[1].toLowerCase() === script.authorSlug.toLowerCase() &&
            matches[2] === script.nameSlug) {
            if (/(?:\.min)?\.user\.js$/.test(matches[3])) {
              // Same script
            } else {
              script.hasAlternateDownloadURL = true;
              script.showMinficationNotices = true;
            }
          } else {
            script.hasAlternateDownloadURL = true;
            script.showMinficationNotices = true;
          }
        } else {
          script.hasAlternateDownloadURL = true;
          script.showMinficationNotices = true;
        }
      }
    }
  }

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
var parseUser = function (aUser) {
  var user = null;

  if (!aUser) {
    return;
  }

  user = aUser.toObject ? aUser.toObject({ virtuals: true }) : aUser;

  // Role
  user.isMod = user.role < 4;
  user.isAdmin = user.role < 3;
  user.roleName = userRoles[user.role];

  //
  user.slug = user.name;

  user.slugUrl = encode(user.slug);
  user.slugUri = encodeURIComponent(user.slug);

  // Urls: Public
  user.userPageUrl = '/users/' + user.slugUrl;
  user.userCommentListPageUrl = user.userPageUrl + '/comments';
  user.userScriptListPageUrl = user.userPageUrl + '/scripts';
  user.userGitHubRepoListPageUrl = user.userPageUrl + '/github/repos';
  user.userGitHubRepoPageUrl = user.userPageUrl + '/github/repo';
  user.userGitHubImportPageUrl = user.userPageUrl + '/github/import';
  user.userEditProfilePageUrl = user.userPageUrl + '/profile/edit';
  user.userUpdatePageUrl = user.userPageUrl + '/update';
  user.userRemovePageUrl = '/remove/users/' + user.slugUrl;
  user.userFlagPageUrl = '/flag/users/' + user.slugUrl;

  // Uris: Public
  user.userPageUri = '/users/' + user.slugUri;
  user.userCommentListPageUri = user.userPageUri + '/comments';
  user.userScriptListPageUri = user.userPageUri + '/scripts';
  user.userGitHubRepoListPageUri = user.userPageUri + '/github/repos';
  user.userGitHubRepoPageUri = user.userPageUri + '/github/repo';
  user.userGitHubImportPageUri = user.userPageUri + '/github/import';
  user.userEditProfilePageUri = user.userPageUri + '/profile/edit';
  user.userUpdatePageUri = user.userPageUri + '/update';
  user.userRemovePageUri = '/remove/users/' + user.slugUri;
  user.userFlagPageUri = '/flag/users/' + user.slugUri;

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

  // Dates
  parseDateProperty(user, '_since'); // Virtual

  return user;
};
parseModelFnMap.User = parseUser;
exports.parseUser = parseUser;

/**
 * Group
 */

//
var parseGroup = function (aGroup) {
  var group = null;

  if (!aGroup) {
    return;
  }

  // var group = aGroup.toObject ? aGroup.toObject() : aGroup;
  group = aGroup;  // TODO: NOT consistent with other parsers.. why?

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
        if (aErr || !aGroup) {
          console.error('Group rating NOT updated', 'aErr := ' + aErr, 'aGroup := ' + aGroup);
          return;
        }
        if (isDbg) {
          console.log(util.format('Group(%s) rating updated', aGroup.name));
        }
      });
    });
  }

  return group;
};
parseModelFnMap.Group = parseGroup;
exports.parseGroup = parseGroup;

/**
 * Discussion (non-issue)
 */

//
var parseDiscussion = function (aDiscussion) {
  var discussion = null;

  var recentCommentors = null;

  if (!aDiscussion) {
    return;
  }

  discussion = aDiscussion.toObject ? aDiscussion.toObject() : aDiscussion;
  // discussion = aDiscussion; // Can't override discussion.category // TODO: Why is this commented and/or not removed?

  // Urls
  discussion.discussionPageUrl = discussion.path.split('/').map(function (aStr) {
    return encode(aStr);
  }).join('/') +
    (discussion.duplicateId ? '_' + discussion.duplicateId : '');

  // Uris
  discussion.discussionPageUri = discussion.path.split('/').map(function (aStr) { // NOTE: May not be used yet
    return encodeURIComponent(aStr);
  }).join('/') +
    (discussion.duplicateId ? '_' + discussion.duplicateId : '');

  // Dates
  parseDateProperty(discussion, 'created');
  parseDateProperty(discussion, 'updated');

  // RecentCommentors
  recentCommentors = [];
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
  discussion.replies = (discussion.comments && discussion.comments > 0)
    ? discussion.comments - 1
    : 0;

  discussion.path = discussion.path.split('/').map(function (aStr) {
    return encode(aStr);
  }).join('/') +
    (discussion.duplicateId ? '_' + discussion.duplicateId : '');

  discussion.open = typeof (discussion.open) === 'undefined' ? true : discussion.open;

  return discussion;
};
parseModelFnMap.Discussion = parseDiscussion;
exports.parseDiscussion = parseDiscussion;

/**
 * Discussion (issue)
 */

//
var parseIssue = function (aDiscussion) {
  var discussion = null;

  if (!aDiscussion) {
    return;
  }

  discussion = aDiscussion.toObject ? aDiscussion.toObject() : aDiscussion;

  discussion.issue = true;
  discussion.open = (discussion.open === undefined || discussion.open === null)
    ? true
    : discussion.open;
  discussion.issueCloseUrl = discussion.path.split('/').map(function (aStr) {
    return encode(aStr);
  }).join('/') +
    '/close';
  discussion.issueOpenUrl = discussion.path.split('/').map(function (aStr) {
    return encode(aStr);
  }).join('/') +
    '/reopen';


  return discussion;
};
parseModelFnMap.Issue = parseIssue;
exports.parseIssue = parseIssue;

/**
 * Comment
 */

//
var parseComment = function (aComment) {
  var comment = null;

  if (!aComment) {
    return;
  }
  comment = aComment.toObject ? aComment.toObject() : aComment;

  // Dates
  parseDateProperty(comment, 'created');

  return comment;
};
parseModelFnMap.Comment = parseComment;
exports.parseComment = parseComment;

//
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

  if (isDbg) {
    console.log(
      aCategory.roleReqToPostTopic,
      _.isNumber(aCategory.roleReqToPostTopic),
      aUser.role,
      aUser.role <= aCategory.roleReqToPostTopic
    );
  }

  if (_.isNumber(aCategory.roleReqToPostTopic)) {
    return aUser.role <= aCategory.roleReqToPostTopic;
  } else {
    // No specified role required
    return true;
  }
};

//
var parseCategory = function (aCategory) {
  var category = null;

  if (!aCategory) {
    return;
  }

  category = aCategory.toObject ? aCategory.toObject() : aCategory;

  // Urls

  category.slugUrl = category.slug.split('/').map(function (aStr) {
    return encode(aStr);
  }).join('/');

  category.categoryPageUrl = '/' + category.slugUrl;
  category.categoryPostDiscussionPageUrl = '/post/' + category.slugUrl;



  // Uris
  category.slugUri = category.slug.split('/').map(function (aStr) {
    return encodeURIComponent(aStr);
  }).join('/');

  category.categoryPageUri = '/' + category.slugUri;
  category.categoryPostDiscussionPageUri = '/post/' + category.slugUri;



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

  var scriptAuthorNameSlug = null;
  var scriptNameSlug = null;
  var scriptName = null;

  if (isScriptIssue) {
    scriptAuthorNameSlug = isScriptIssue[2];
    scriptNameSlug = isScriptIssue[4];
    scriptName = scriptNameSlug.replace(/\_/g, ' ');
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
var parseRemovedItem = function (aRemovedItem) {
  var removedItem = null;

  var parseModelFn = null;

  if (!aRemovedItem) {
    return;
  }

  removedItem = aRemovedItem; // TODO: NOT consistent with other parsers

  // Dates
  parseDateProperty(removedItem, 'removed');

  // User
  removedItem.remover = parseUser({
    name: removedItem.removerName,
    automated: removedItem.removerAutomated
  });

  // Reason
  removedItem.reason = removedItem.reason ?
    removedItem.reason :
      (removedItem.removerAutomated ? removedItem.model + ' removed' : null);

  // Content
  parseModelFn = parseModelFnMap[removedItem.model];
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
