var async = require('async');
var _ = require('underscore');

var User = require('../models/user').User;

var github = require('../libs/githubClient');
var githubImporter = require('../libs/githubImporter');

// GitHub calls this on a push if a webhook is setup
// This controller makes sure we have the latest version of a script
module.exports = function (aReq, aRes, aNext) {
  if (!aReq.body.payload)
    return aRes.status(400).send('Payload required.');

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
      return aRes.status(400).send('No account linked to GitHub username ' + username);

    // Gather the modified user scripts
    var jsFilenames = {}; // Set (key == value)
    var mdFilenames = {}; // Set (key == value)
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

    var githubRepoBlobs = null;

    // Update
    async.series([
      // Fetch all blobs in the target repo.
      function(aCallback) {
        async.waterfall([
          function(aCallback) {
            github.gitdata.getBlobs({
              user: encodeURIComponent(githubUserName),
              repo: encodeURIComponent(githubRepoName)
            }, aCallback);
          },

          function(aBlobs, aCallback) {
            githubRepoBlobs = aBlobs;
            aCallback();
          },
        ], aCallback);
      },

      // Update Javascript File Triggers
      function(aCallback) {
        async.map(jsFilenames, function(jsFilename, aCallback) {
          githubImporter.importJavascriptBlob({
            user: aUser,
            githubUserId: githubUserName,
            githubRepoName: githubRepoName,
            githubBlobPath: jsFilename,
            updateOnly: false,
            blobs: githubRepoBlobs
          }, aCallback);
        }, aCallback);
      },

      // Update Markdown File Triggers
      function(aCallback) {
        async.map(mdFilenames, function(mdFilename, aCallback) {
          githubImporter.importMarkdownBlob({
            user: aUser,
            githubUserId: githubUserName,
            githubRepoName: githubRepoName,
            githubBlobPath: mdFilename,
            blobs: githubRepoBlobs
          }, aCallback);
        }, aCallback);
      }
    ], function(aError, aResults) {
      if (aError) {
        console.error(aError);
        return aRes.status(500).send('Error while updating.');
      }

      aRes.status(200).send(aResults);
    });
  });
};
