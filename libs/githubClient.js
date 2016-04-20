'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var GitHubApi = require("github");
var _ = require("underscore");
var async = require('async');
var util = require('util');
var request = require('request');
var colors = require('ansi-colors');

// Client
var github = new GitHubApi({
  version: "3.0.0"
});
module.exports = github;

// Authenticate Client
var Strategy = require('../models/strategy').Strategy;
Strategy.findOne({ name: 'github' }, function (aErr, aStrat) {
  if (aErr)
    console.error(aErr);

  if (aStrat) {
    github.authenticate({
      type: 'oauth',
      key: aStrat.id,
      secret: aStrat.key,
    });
    console.log(colors.green('GitHub client authenticated'));
  } else {
    console.warn(colors.yellow('GitHub client NOT authenticated. Will have a lower Rate Limit.'));
  }

});

// Util functions for the client.
github.usercontent = github.usercontent || {};

var githubGitDataGetBlobAsUtf8 = function (aMsg, aCallback) {
  async.waterfall([
    function (aCallback) {
      github.gitdata.getBlob(aMsg, aCallback);
    },
    function (aBlob, aCallback) {
      var content = aBlob.content;
      if (aBlob.encoding === 'base64') {
        var buf = new Buffer(content, 'base64');
        content = buf.toString('utf8');
      }
      aCallback(null, content);
    },
  ], aCallback);
};
github.gitdata.getBlobAsUtf8 = githubGitDataGetBlobAsUtf8;

var githubUserContentBuildUrl = function (aUser, aRepo, aPath) {
  return util.format('https://raw.githubusercontent.com/%s/%s/HEAD/%s', aUser, aRepo, aPath);
};
github.usercontent.buildUrl = githubUserContentBuildUrl;

var githubUserContentGetBlobAsUtf8 = function (aMsg, aCallback) {
  async.waterfall([
    function (aCallback) {
      var url = githubUserContentBuildUrl(aMsg.user, aMsg.repo, aMsg.path);
      request.get(url, aCallback);
    },
    function (aResponse, aBody, aCallback) {
      if (aResponse.statusCode !== 200)
        return aCallback(util.format('Status Code %s', aResponse.statusCode));

      aCallback(null, aBody);
    },
  ], aCallback);
};

github.usercontent.getBlobAsUtf8 = githubUserContentGetBlobAsUtf8;

var githubGitDataIsJavascriptBlob = function (aBlob) {
  return aBlob.path.match(/\.js$/);
};
github.gitdata.isJavascriptBlob = githubGitDataIsJavascriptBlob;

var githubGitDataGetJavascriptBlobs = function (aMsg, aCallback) {
  async.waterfall([
    function (aCallback) {
      aMsg.sha = 'HEAD';
      aMsg.recursive = true;
      github.gitdata.getTree(aMsg, aCallback);
    },
    function (aRepoTree, aCallback) {
      var entries = aRepoTree.tree;
      var blobs = _.where(entries, { type: 'blob' });
      var javascriptBlobs = _.filter(blobs, githubGitDataIsJavascriptBlob);
      aCallback(null, javascriptBlobs);
    },
  ], aCallback);
};
github.gitdata.getJavascriptBlobs = githubGitDataGetJavascriptBlobs;
