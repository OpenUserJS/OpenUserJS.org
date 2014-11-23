var githubImporter = require('../libs/githubImporter');
var modelParser = require('../libs/modelParser');
var statusCodePage = require('../libs/templateHelpers').statusCodePage;

module.exports = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  if (!authedUser) return aRes.redirect('/login');

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // GitHub
  var githubUserId = options.githubUserId = aReq.body.user || aReq.query.user || authedUser.ghUsername || authedUser.githubUserId();
  var githubRepoName = options.githubRepoName = aReq.body.repo || aReq.query.repo;
  var githubBlobPath = options.githubBlobPath = aReq.body.path || aReq.query.path;

  if (!(githubUserId && githubRepoName && githubBlobPath)) {
    return statusCodePage(aReq, aRes, aNext, {
      statusCode: 400,
      statusMessage: 'Bad Request. Require <code>user</code>, <code>repo</code>, and <code>path</code> to be set.'
    });
  }

  githubImporter.importJavasciptBlob({
    user: authedUser,
    githubUserId: githubUserId,
    githubRepoName: githubRepoName,
    githubBlobPath: githubBlobPath,
    updateOnly: false
  }, function (aErr) {
    if (aErr) {
      console.error(aErr);
      console.error(githubUserId, githubRepoName, githubBlobPath);
      return statusCodePage(aReq, aRes, aNext, {
        statusCode: 400,
        statusMessage: aErr
      });
    }

    var script = modelParser.parseScript(options.script);
    aRes.redirect(script.scriptPageUrl);
  });
};
