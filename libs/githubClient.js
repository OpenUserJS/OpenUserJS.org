var GitHubApi = require("github");
var _ = require("underscore");
var async = require('async');
var util = require('util');
var request = require('request');

// Client
var github = new GitHubApi({
    version: "3.0.0",
});
module.exports = github;

// Authenticate Client
var Strategy = require('../models/strategy').Strategy;
Strategy.findOne({ name: 'github' }, function(err, strat) {
  if (err)
    console.error(err);

  if (strat) {
    github.authenticate({
      type: 'oauth',
      key: strat.id,
      secret: strat.key,
    });
    console.log('GitHub client authenticated');
  } else {
    console.warn('GitHub client NOT authenticated. Will have a lower Rate Limit.');
  }

});

// Util functions for the client.
github.usercontent = github.usercontent || {};

var githubGitDataGetBlobAsUtf8 = function (msg, callback) {
  async.waterfall([
    function(callback){
      github.gitdata.getBlob(msg, callback);
    },
    function(blob, callback){
      var content = blob.content;
      if (blob.encoding == 'base64') {
        var buf = new Buffer(content, 'base64');
        content = buf.toString('utf8');
      }
      callback(null, content);
    },
  ], callback);
};
github.gitdata.getBlobAsUtf8 = githubGitDataGetBlobAsUtf8;

var githubUserContentBuildUrl = function (user, repo, path) {
  return util.format('https://raw.githubusercontent.com/%s/%s/HEAD/%s', user, repo, path);
};
github.usercontent.buildUrl = githubUserContentBuildUrl;

var githubUserContentGetBlobAsUtf8 = function (msg, callback) {
  async.waterfall([
    function(callback){
      var url = githubUserContentBuildUrl(msg.user, msg.repo, msg.path);
      request.get(url, callback);
    },
    function(response, body, callback){
      if (response.statusCode != 200)
        return callback(util.format('Status Code %s', response.statusCode));

      callback(null, body);
    },
  ], callback);
};

github.usercontent.getBlobAsUtf8 = githubUserContentGetBlobAsUtf8;

var githubGitDataIsJavascriptBlob = function(blob) {
  return blob.path.match(/\.js$/);
};
github.gitdata.isJavascriptBlob = githubGitDataIsJavascriptBlob;

var githubGitDataGetJavascriptBlobs = function (msg, callback) {
  async.waterfall([
    function(callback){
      msg.sha = 'HEAD';
      msg.recursive = true;
      github.gitdata.getTree(msg, callback);
    },
    function(repoTree, callback){
      var entries = repoTree.tree;
      var blobs = _.where(entries, {type: 'blob'});
      var javascriptBlobs = _.filter(blobs, githubGitDataIsJavascriptBlob);
      callback(null, javascriptBlobs);
    },
  ], callback);
};
github.gitdata.getJavascriptBlobs = githubGitDataGetJavascriptBlobs;
