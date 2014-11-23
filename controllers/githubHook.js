var async = require('async');
var _ = require('underscore');
var User = require('../models/user').User;
var githubImporter = require('../libs/githubImporter');

// GitHub calls this on a push if a webhook is setup
// This controller makes sure we have the latest version of a script
module.exports = function (aReq, aRes, aNext) {
  // var RepoManager = require('../libs/repoManager');
  // var username = null;
  // var reponame = null;
  // var repos = {};
  // var repo = null;

  if (!aReq.body.payload)
    return aRes.send(400, 'Payload required.');

  if (process.env.NODE_ENV === 'production') {
    // Test for know GH webhook ips: https://api.github.com/meta
    var reqIP = aReq.headers['x-forwarded-for'] || aReq.connection.remoteAddress;
    if (!/192\.30\.25[2-5]\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])$/.test(reqIP))
      return;
  }


  var payload = JSON.parse(aReq.body.payload);

  // Only accept commits to the master branch
  if (!payload || payload.ref !== 'refs/heads/master')
    return aRes.send(400, 'payload.ref !== refs/heads/master');

  var githubUserName = payload.repository.owner.name;
  var githubRepoName = payload.repository.name;


  User.findOne({
    ghUsername: githubUserName
  }, function (aErr, aUser) {
    if (!aUser)
      return aRes.send(400, 'No account linked to GitHub username ' + username);

    // Gather the modified user scripts
    var jsFilenames = {};
    var mdFilenames = {};
    payload.commits.forEach(function (aCommit) {
      aCommit.modified.forEach(function (aFilename) {
        switch (aFilename.substr(-3)) {
          case '.js':
            jsFilenames[aFilename] = aFilename;
            break;
          case '.md':
            mdFilenames[aFilename] = aFilename;
            break;
        }
      });
    });
    jsFilenames = Object.keys(jsFilenames);
    mdFilenames = Object.keys(mdFilenames);

    console.log('jsFilenames', jsFilenames);
    console.log('mdFilenames', mdFilenames);

    // Update
    async.series([
      // Update script code first.
      function(aCallback) {
        async.map(jsFilenames, function(jsFilename, aCallback) {
          console.log(jsFilename);

          // var repoManager = RepoManager.getManager(null, aUser, repos);
          // repoManager.loadScripts(function () { }, true);
          githubImporter.importJavasciptBlob({
            user: aUser,
            githubUserId: githubUserName,
            githubRepoName: githubRepoName,
            githubBlobPath: jsFilename,
            updateOnly: false
          }, aCallback);
        }, aCallback);
      },

      // Update markdown next
      function(aCallback) {
        async.map(mdFilenames, function(mdFilename, aCallback) {
          console.log(mdFilename);
          aCallback(null, mdFilename);
        }, aCallback);
      }
    ], function(aError, aResults) {
      if (aError) {
        console.error(aError);
        return aRes.send(500, 'Error while updating.');
      }

      aRes.send(200, aResults);
    });
  });
};
