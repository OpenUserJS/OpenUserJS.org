'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;
var uaOUJS = require('../libs/debug').uaOUJS;
var statusError = require('../libs/debug').statusError;

//--- Dependency inclusions
var util = require('util');
var colors = require('ansi-colors');

//--- Model inclusions
var Sync = require('../models/sync').Sync;

//--- Controller inclusions
var scriptStorage = require('../controllers/scriptStorage');

//
var https = require('https');
var async = require('async');
var _ = require('underscore');

var Strategy = require('../models/strategy').Strategy;

var nil = require('./helpers').nil;
var github = require('../libs/githubClient');
var settings = require('../models/settings.json');


var clientId = null;
var clientKey = null;

Strategy.findOne({ name: 'github' }, function (aErr, aStrat) {
  if (aErr) {
    console.error( aErr.message );
    process.exit(1);
    return;
  }

  if (!aStrat) {
    console.error( colors.red( [
      'Default GitHub Strategy document not found in DB',
      'Terminating app'
    ].join('\n')));

    process.exit(1);
    return;
  }

  clientId = aStrat.id;
  clientKey = aStrat.key;
});

// Requests a GitHub url and returns the chunks as buffers
function fetchRaw(aHost, aPath, aCallback, aOptions) {
  var options = {
    hostname: aHost,
    port: 443,
    path: aPath,
    method: 'GET',
    headers: {
      'User-Agent': uaOUJS + '.' + process.env.UA_SECRET
    }
  };

  if (aOptions) {
    // Ideally do a deep merge of aOptions -> options
    // But for now, we just need the headers
    if (aOptions.headers) {
      Object.assign(options.headers, aOptions.headers);
    }
  }

  var req = https.request(options,
    function (aRes) {

      if (isDbg) {
        console.log(aRes);
      }

      var bufs = [];
      if (aRes.statusCode !== 200) {
        console.warn(aRes.statusCode);
        return aCallback([Buffer.from('')]);
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
  // The old authentication method, which GitHub deprecated
  //aPath += '?client_id=' + clientId + '&client_secret=' + clientKey;
  // We must now use OAuth Basic (user+key) or Bearer (token)
  var encodedAuth = Buffer.from(`${clientId}:${clientKey}`).toString('base64');
  var opts = {
    headers: {
      Authorization: `Basic ${encodedAuth}`
    }
  };
  fetchRaw('api.github.com', aPath, function (aBufs) {
    aCallback(JSON.parse(Buffer.concat(aBufs).toString()));
  }, opts);
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

// Import scripts to be sync'd into Sync model
RepoManager.prototype.loadSyncs = function (aUpdate, aCallback) {
  var arrayOfRepos = this.makeRepoArray();
  var that = this;

  // TODO: Alter usage of makeRepoArray since it causes redundant looping
  arrayOfRepos.forEach(function (aRepo) {
    async.each(aRepo.scripts, function (aScript, aInnerCallback) {
      var hostname = 'raw.githubusercontent.com';
      var uri = '/' + aRepo.user + '/' + aRepo.repo
        + '/master' + aScript.path;

      Sync.findOne(
        { _authorId: that.user.id, id: aUpdate, target: 'https://' + hostname + uri },
        function (aErr, aSync) {
          if (aErr) {
            console.error('Error retrieving sync status');
            aInnerCallback(aErr, aSync);
            return;
          }

          if (aSync) {
            // TODO: Maybe update the updated, response, and message to reflect redelivery?

            aInnerCallback(null, aSync);
          } else {
            var sync = new Sync({
              strat: 'github',
              id: aUpdate,
              target: 'https://' + hostname + uri,
              response: 202,
              message: 'Accepted',
              created: new Date(),
              _authorId: that.user.id
            });

            sync.save(function (aErr, aSync) {
              if (aErr || !aSync) {
                console.error('Unable to create Sync record');
                aInnerCallback(aErr, aSync);
                return;
              }

              aInnerCallback(null, aSync);
            });
          }

        });

    }, aCallback);
  });
};

// Import scripts from GitHub
RepoManager.prototype.loadScripts = function (aUpdate, aCallback) {
  var arrayOfRepos = this.makeRepoArray();
  var that = this;

  // TODO: Alter usage of makeRepoArray since it causes redundant looping
  arrayOfRepos.forEach(function (aRepo) {
    async.each(aRepo.scripts, function (aScript, aInnerCallback) {
      var hostname = 'raw.githubusercontent.com';
      var uri = '/' + aRepo.user + '/' + aRepo.repo
        + '/master' + aScript.path;
      var url = '/' + encodeURI(aRepo.user) + '/' + encodeURI(aRepo.repo)
        + '/master' + aScript.path;

      fetchRaw(hostname, url, function (aBufs) {
        var msg = null;
        var thisBuf = Buffer.concat(aBufs);

        if (thisBuf.byteLength <= settings.maximum_upload_script_size) {
          scriptStorage.getMeta(aBufs, function (aMeta) {
            if (aMeta) {
              scriptStorage.storeScript(that.user, aMeta, thisBuf, !!aUpdate,
                function (aErr, aScript) {
                  if (aErr || !aScript) {
                    msg = (aErr instanceof statusError ? aErr.status.message : aErr.message)
                      || 'Unknown error with storing script';
                    Sync.findOneAndUpdate(
                      { _authorId: that.user.id, id: aUpdate, target: 'https://' + hostname + uri }, {
                        response: (aErr instanceof statusError ? aErr.status.code : aErr.code),
                        message: msg,
                        updated: new Date()
                      },
                      function (aErr, aSync) {
                        if (aErr || !aSync) {
                          console.error('Error changing sync status with ' + msg);
                          return;
                        }
                      });
                  } else {
                    msg = 'OK';
                    Sync.findOneAndUpdate(
                      { _authorId: that.user.id, id: aUpdate, target: 'https://' + hostname + uri },
                      { response: 200, message: msg, updated: new Date()},
                      function (aErr, aSync) {
                        if (aErr || !aSync) {
                          console.error('Error changing sync status with ' + msg);
                          return;
                        }
                      });
                  }

                  aInnerCallback(aErr, aScript);
                });
            } else {
              msg = 'Metadata block(s) missing.'
              Sync.findOneAndUpdate(
                { _authorId: that.user.id, id: aUpdate, target: 'https://' + hostname + uri },
                { response: 400, message: msg, updated: new Date()},
                function (aErr, aSync) {
                  if (aErr || !aSync) {
                    console.error('Error changing sync status with ' + msg);
                    return;
                  }
                });

              aInnerCallback(new statusError({
                message: msg,
                  code: 400
                }, null));
            }
          });
        } else {
          msg = util.format('File size is larger than maximum (%s bytes).',
            settings.maximum_upload_script_size);
          Sync.findOneAndUpdate(
            { _authorId: that.user.id, id: aUpdate, target: 'https://' + hostname + uri },
            { response: 400, message: msg},
            function (aErr, aSync) {
              if (aErr || !aSync) {
                console.error('Error changing sync status with ' + msg);
                return;
              }
            });

          aInnerCallback(new statusError({
            message: msg,
              code: 400
            }, null));
        }
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
