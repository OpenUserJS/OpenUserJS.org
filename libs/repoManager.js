var https = require('https');
var async = require('async');
var util = require('util');
var _ = require('underscore');

var Strategy = require('../models/strategy').Strategy;
var User = require('../models/user').User;

var nil = require('./helpers').nil;
var github = require('../libs/githubClient');

var clientId = null;
var clientKey = null;

Strategy.findOne({ name: 'github' }, function(err, strat) {
  clientId = strat.id;
  clientKey = strat.key;
});

// Requests a GitHub url and returns the chunks as buffers
function fetchRaw(host, path, callback) {
  var options = {
    hostname: host,
    port: 443,
    path: path,
    method: 'GET',
    headers: { 'User-Agent': 'Node.js' }
  };

  var req = https.request(options,
    function(res) {
      var bufs = [];
      if (res.statusCode != 200) { console.log(res.statusCode); return callback([new Buffer('')]); }
      else {
        res.on('data', function(d) { bufs.push(d); });
        res.on('end', function() {
          callback(bufs);
        });
      }
    });
  req.end();
}

// Use for call the GitHub JSON api
// Returns the JSON parsed object
function fetchJSON(path, callback) {
  path += '?client_id=' + clientId + '&client_secret=' + clientKey;
  fetchRaw('api.github.com', path, function(bufs) {
    callback(JSON.parse(Buffer.concat(bufs).toString()));
  });
}

// This manages actions on the repos of a user
function RepoManager(userId, user, repos) {
  this.userId = userId;
  this.user = user;
  this.repos = repos || nil();
}

// Fetches the information about repos that contain user scripts
RepoManager.prototype.fetchRecentRepos = function(callback) {
  var repoList = [];
  var that = this;

  async.waterfall([
    function(callback) {
      github.repos.getFromUser({
        user: encodeURIComponent(that.userId),
        sort: 'updated',
        order: 'desc',
        per_page: 3,
      }, callback);
    },
    function(githubRepoList, callback) {
      // Don't search through forks
      // to speedup this request.
      // githubRepoList = _.where(githubRepoList, {fork: false});

      _.map(githubRepoList, function(githubRepo) {
        repoList.push(new Repo(that, githubRepo.owner.login, githubRepo.name));
      });

      async.each(repoList, function(repo, callback) {
        repo.fetchUserScripts(function() {
          callback(null);
        });
      }, callback);
    },
  ], callback);
};

// Import scripts on GitHub
RepoManager.prototype.loadScripts = function(callback, update) {
  var scriptStorage = require('../controllers/scriptStorage');
  var arrayOfRepos = this.makeRepoArray();
  var that = this;
  var scripts = [];

  // TODO: remove usage of makeRepoArray since it causes redundant looping
  arrayOfRepos.forEach(function(repo) {
    async.each(repo.scripts, function(script, cb) {
      var url = '/' + encodeURI(repo.user) + '/' + encodeURI(repo.repo)
        + '/master' + script.path;
      fetchRaw('raw.githubusercontent.com', url, function(bufs) {
        scriptStorage.getMeta(bufs, function(meta) {
          if (meta) {
            scriptStorage.storeScript(that.user, meta, Buffer.concat(bufs),
              cb, update);
          }
        });
      });
    }, callback);
  });
}

// Create the Mustache object to display repos with their user scrips
RepoManager.prototype.makeRepoArray = function() {
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
}

// Manages a single repo
function Repo(manager, username, reponame) {
  this.manager = manager;
  this.user = username;
  this.repo = reponame;
}

// Use recursive requests to locate all user scripts in a repo
Repo.prototype.fetchUserScripts = function(callback) {
  this.getTree('HEAD', '', callback);
};

// Looks for user script in the current directory
// and initiates searches on subdirectories
Repo.prototype.parseTree = function(tree, path, done) {
  var object;
  var trees = [];
  var that = this;
  var repos = this.manager.repos;

  tree.forEach(function(object) {
    if (object.type === 'tree') {
      trees.push({
        sha: object.sha, path: path + '/'
          + encodeURI(object.path)
      });
    } else if (object.path.substr(-8) === '.user.js') {
      if (!repos[that.repo]) { repos[that.repo] = nil(); }
      repos[that.repo][object.path] = path + '/' + encodeURI(object.path);
    }
  });

  async.each(trees, function(tree, cb) {
    that.getTree(tree.sha, tree.path, cb);
  }, function() {
    done();
  });
};

// Gets information about a directory
Repo.prototype.getTree = function(sha, path, cb) {
  var that = this;
  fetchJSON('/repos/' + encodeURI(this.user) + '/' + encodeURI(this.repo)
    + '/git/trees/' + sha,
    function(json) {
      that.parseTree(json.tree, path, cb);
    }
  );
};

exports.getManager = function(userId, user, repos) {
  return new RepoManager(userId, user, repos);
};
