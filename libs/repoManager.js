var https = require('https');
var url = require('url');
var async = require('async');
var Strategy = require('../models/strategy').Strategy;
var storeScript = require('../controllers/scriptStorage').storeScript;
var updateScript = require('../controllers/scriptStorage').updateScript;
var nil = require('./helpers').nil;
var clientId = null;
var clientKey = null;

Strategy.findOne({ name: 'github' }, function(err, strat) {
  clientId = strat.id;
  clientKey = strat.key;
});

function fetchRaw (subdomain, path, callback) {
  var raw = "";
  var options = {
    hostname: subdomain + '.github.com',
    port: 443,
    path: path,
    method: 'GET',
    headers: { 'User-Agent': 'Node.js' }
  };

  if (subdomain === 'api') {
    options.path += '?client_id=' + clientId + '&client_secret=' + clientKey;
  }

  var req = https.request(options,
    function(res) {
      if (res.statusCode != 200) { return; }
      else {
        res.on('data', function (chunk) { raw += chunk; });
        res.on('end', function () {
          callback(raw);
        });
      } 
  });
  req.end();
}

function fetchJSON (path, callback) {
  fetchRaw('api', path, function (raw) {
    callback(JSON.parse(raw));
  });
}

function RepoManager(userId, user, repos) {
  this.userId = userId;
  this.user = user;
  this.repos = repos || nil();
}

RepoManager.prototype.fetchRepos = function (callback) {
  var repos = [];
  var that = this;

  fetchJSON('/user/' + this.userId + '/repos', function (json) {
    json.forEach(function (repo) {
      if (that.user.ghUsername !== repo.owner.login) {
        that.user.ghUsername = repo.owner.login; 
        that.user.save(function (err, user) {});
      }
      repos.push(new Repo(that, repo.owner.login, repo.name));
    });

    async.each(repos, function (repo, cb) {
      repo.fetchUserScripts(function() {
        cb(null);
      });
    }, callback);
  });
};

RepoManager.prototype.loadScripts = function (callback, update) {
  var arrayOfRepos = this.makeRepoArray();
  var that = this;

  async.each(arrayOfRepos, function(repo, cb) {
    async.each(repo.scripts, function(script, innerCb) {
      fetchRaw('raw', url.parse(script.url).pathname, function (raw) {
        storeScript(that.user, new Buffer(raw), innerCb, update);
      });
    }, cb)
  }, callback);
}

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
      option.scripts.push({ name: scriptname, 
        url: 'https://raw.github.com/' + username + '/' + 
        reponame + '/master' + scripts[scriptname] });
    }

    retOptions.push(option);
  }

  return retOptions;
}

function Repo(manager, username, reponame) {
  this.manager = manager;
  this.user = username;
  this.repo = reponame;
}

Repo.prototype.fetchUserScripts = function (callback) {
  this.getTree('HEAD', '', callback);
};

Repo.prototype.parseTree = function (tree, path, done) {
  var object;
  var trees = [];
  var that = this;
  var repos = this.manager.repos;

  tree.forEach(function (object) {
    if (object.type === 'tree') {
      trees.push({ sha: object.sha, path: path + '/' + object.path });
    } else if (object.path.substr(-8) === '.user.js') {
      if (!repos[that.repo]) { repos[that.repo] = nil(); }
      repos[that.repo][object.path] = path + '/' + object.path;
    }
  });

  async.each(trees, function(tree, cb) {
    that.getTree(tree.sha, tree.path, cb);
  }, function () { 
    done(); 
  });
};

Repo.prototype.getTree = function (sha, path, cb) {
  var that = this;
  fetchJSON('/repos/' + this.user  + '/' + this.repo + '/git/trees/' + sha, 
    function (json) {
      that.parseTree(json.tree, path, cb);
  });
};

exports.getManager = function (userId, user, repos) { 
  return new RepoManager(userId, user, repos); 
};
