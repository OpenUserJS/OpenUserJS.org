'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var https = require('https');
var async = require('async');
var _ = require('underscore');

var Strategy = require('../models/strategy').Strategy;

var nil = require('./helpers').nil;
var github = require('../libs/githubClient');

var clientId = null;
var clientKey = null;

Strategy.findOne({ name: 'github' }, function (aErr, aStrat) {
  clientId = aStrat.id;
  clientKey = aStrat.key;
});

// Requests a GitHub url and returns the chunks as buffers
function fetchRaw(aHost, aPath, aCallback) {
  var options = {
    hostname: aHost,
    port: 443,
    path: aPath,
    method: 'GET',
    headers: {
      'User-Agent': 'Node.js'
    }
  };

  var req = https.request(options,
    function (aRes) {

      if (isDbg) {
        console.log(aRes);
      }

      var bufs = [];
      if (aRes.statusCode !== 200) {
        console.warn(aRes.statusCode);
        return aCallback([new Buffer('')]);
      }
      else {
        aRes.on('data', function (aData) {
          bufs.push(aData);
        });
        aRes.on('end', function () {
          aCallback(bufs);
        });
      }
    });
  req.end();
}

// Use for call the GitHub JSON api
// Returns the JSON parsed object
function fetchJSON(aPath, aCallback) {
  aPath += '?client_id=' + clientId + '&client_secret=' + clientKey;
  fetchRaw('api.github.com', aPath, function (aBufs) {
    aCallback(JSON.parse(Buffer.concat(aBufs).toString()));
  });
}

// This manages actions on the repos of a user
function RepoManager(aUserId, aUser, aRepos) {
  this.userId = aUserId;
  this.user = aUser;
  this.repos = aRepos || nil();
}

// Fetches the information about repos that contain user scripts
RepoManager.prototype.fetchRecentRepos = function (aCallback) {
  var repoList = [];
  var that = this;

  async.waterfall([
    function (aCallback) {
      github.repos.getFromUser({
        user: encodeURIComponent(that.userId),
        sort: 'updated',
        order: 'desc',
        per_page: 3,
      }, aCallback);
    },
    function (aGithubRepoList, aCallback) {
      // Don't search through forks
      // to speedup this request.
      // aGithubRepoList = _.where(aGithubRepoList, {fork: false});

      _.map(aGithubRepoList, function (aGithubRepo) {
        repoList.push(new Repo(that, aGithubRepo.owner.login, aGithubRepo.name));
      });

      async.each(repoList, function (aRepo, aCallback) {
        aRepo.fetchUserScripts(function () {
          aCallback(null);
        });
      }, aCallback);
    },
  ], aCallback);
};

// Import scripts on GitHub
RepoManager.prototype.loadScripts = function (aCallback, aUpdate) {
  var scriptStorage = require('../controllers/scriptStorage');
  var arrayOfRepos = this.makeRepoArray();
  var that = this;

  // TODO: remove usage of makeRepoArray since it causes redundant looping
  arrayOfRepos.forEach(function (aRepo) {
    async.each(aRepo.scripts, function (aScript, aCallback) {
      var url = '/' + encodeURI(aRepo.user) + '/' + encodeURI(aRepo.repo)
        + '/master' + aScript.path;
      fetchRaw('raw.githubusercontent.com', url, function (aBufs) {
        scriptStorage.getMeta(aBufs, function (aMeta) {
          if (aMeta) {
            scriptStorage.storeScript(that.user, aMeta, Buffer.concat(aBufs),
              aCallback, aUpdate);
          }
        });
      });
    }, aCallback);
  });
};

// Create the Mustache object to display repos with their user scrips
RepoManager.prototype.makeRepoArray = function () {
  var retOptions = [];
  var repos = this.repos;
  var username = this.user.ghUsername;
  var reponame = null;
  var scripts = null;
  var scriptname = null;
  var option = null;

  for (reponame in repos) {
    option = { repo: reponame, user: username };
    option.scripts = [];

    scripts = repos[reponame];
    for (scriptname in scripts) {
      option.scripts.push({ name: scriptname, path: scripts[scriptname] });
    }

    retOptions.push(option);
  }

  return retOptions;
};

// Manages a single repo
function Repo(aManager, aUsername, aReponame) {
  this.manager = aManager;
  this.user = aUsername;
  this.repo = aReponame;
}

// Use recursive requests to locate all user scripts in a repo
Repo.prototype.fetchUserScripts = function (aCallback) {
  this.getTree('HEAD', '', aCallback);
};

// Looks for user script in the current directory
// and initiates searches on subdirectories
Repo.prototype.parseTree = function (aTree, aPath, aDone) {
  var trees = [];
  var that = this;
  var repos = this.manager.repos;

  aTree.forEach(function (object) {
    if (object.type === 'tree') {
      trees.push({
        sha: object.sha, path: aPath + '/'
          + encodeURI(object.path)
      });
    } else if (object.path.substr(-8) === '.user.js') {
      if (!repos[that.repo]) { repos[that.repo] = nil(); }
      repos[that.repo][object.path] = aPath + '/' + encodeURI(object.path);
    }
  });

  async.each(trees, function (aTree, aCallback) {
    that.getTree(aTree.sha, aTree.path, aCallback);
  }, function () {
    aDone();
  });
};

// Gets information about a directory
Repo.prototype.getTree = function (aSha, aPath, aCallback) {
  var that = this;
  fetchJSON('/repos/' + encodeURI(this.user) + '/' + encodeURI(this.repo)
    + '/git/trees/' + aSha,
    function (aJson) {
      that.parseTree(aJson.tree, aPath, aCallback);
    }
  );
};

exports.getManager = function (aUserId, aUser, aRepos) {
  return new RepoManager(aUserId, aUser, aRepos);
};
