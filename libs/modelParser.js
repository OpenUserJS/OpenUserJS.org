var moment = require('moment');

/**
 * Parse persisted model data and return a new object with additional generated fields used in view templates.
 */

var Script = require('../models/script').Script;

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
  var script = scriptData.toObject ? scriptData.toObject() : scriptData;

  // Script Good/Bad bar.
  // script.votes = upvotes
  // script.flags = downvotes + flags?
  var sumVotesAndFlags = script.votes + script.flags;
  var votesRatio = sumVotesAndFlags > 0 ? script.votes / sumVotesAndFlags : 0;
  var flagsRatio = sumVotesAndFlags > 0 ? script.flags / sumVotesAndFlags : 0;
  script.votesPercent = votesRatio * 100;
  script.flagsPercent = flagsRatio * 100;

  // Urls: Public
  script.scriptPageUrl = getScriptPageUrl(script);
  script.scriptInstallPageUrl = getScriptInstallPageUrl(script);
  script.scriptViewSourcePageUrl = getScriptViewSourcePageUrl(script);

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

var getUserPageUrl = function(script) {
  var isLib = script.isLib || false;
  return (isLib ? '/libs/src/' : '/install/') + script.installName;
};

//
exports.parseUser = function(userData) {
  var user = userData.toObject ? userData.toObject() : userData;

  // Urls: Public
  user.userPageUrl = '/users/' + user.name;

  return user;
};

/**
 * Group
 */

//
exports.parseGroup = function(groupData) {
  var group = groupData.toObject ? groupData.toObject() : groupData;

  group.size = group._scriptIds.length;
  group.multiple = group._scriptIds.length > 1;
  
  group.groupPageUrl = '/group/' + group.name.replace(/\s+/g, '_');

  return group;
};
