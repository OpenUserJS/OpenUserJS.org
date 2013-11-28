var https = require('https');
var url = require('url');
var async = require('async');
var Strategy = require('../models/strategy').Strategy;
//var storeScript = require('../controllers/scriptStorage').storeScript;
var nil = require('./helpers').nil;
var clientId = null;
var clientKey = null;

Strategy.findOne({ name: 'github' }, function(err, strat) {
  clientId = strat.id;
  clientKey = strat.key;
});

function fetchJSON(path, callback) {
  var repos = [];
  var raw = "";
  var json = null;
  var options = {
    hostname: 'api.github.com',
    port: 443,
    path: path,
    method: 'GET',
    headers: { 'User-Agent': 'Node.js' }
  };

  options.path += '?client_id=' + clientId + '&client_secret=' + clientKey;

  var req = https.request(options,
    function(res) {
      if (res.statusCode != 200) { return; }
      else {
        res.on('data', function (chunk) { raw += chunk; });
        res.on('end', function () {
          json = JSON.parse(raw);
          callback(json);
        });
      } 
  });
  req.end();
}

function RepoManager(userId, repos) {
  this.userId = userId;
  this.username = null;
  this.repos = repos || nil();
}

RepoManager.prototype.fetchRepos = function (callback) {
  var repos = [];
  var that = this;

  fetchJSON('/user/' + this.userId + '/repos', function (json) {
    json.forEach(function (repo) {
      if (!that.username) { that.username = repo.owner.login; }
      repos.push(new Repo(that, repo.owner.login, repo.name));
    });

    async.each(repos, function (repo, cb) {
      repo.fetchUserScripts(function() {
        cb(null);
      });
    }, callback);
  });
};

RepoManager.prototype.loadScripts = function (callback) {
  var arrayOfRepos = this.makeRepoArray();

  async.each(arrayOfRepos, function(repo, cb) {
    async.each(repo.scripts, function(script, innerCb) {
      fetchJSON(url.parse(script.url).pathname, function(json) {
        console.log(new Buffer(json.content, 'base64').toString('utf8'));
        innerCb();
      });
    }, cb)
  }, callback);
}

RepoManager.prototype.makeRepoArray = function () {
  var retOptions = [];
  var repos = this.repos;
  var username = this.username;
  var reponame = null;
  var scripts = null;
  var scriptname = null;
  var option = null;

  for (reponame in repos) {
    option = { repo: reponame, user: username };
    option.scripts = [];

    scripts = repos[reponame];
    for (scriptname in scripts) {
      option.scripts.push({ name: scriptname, url: scripts[scriptname] });
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
  this.getTree('HEAD', callback);
};

Repo.prototype.parseTree = function (tree, done) {
  var object;
  var trees = [];
  var that = this;
  var repos = this.manager.repos;

  tree.forEach(function (object) {
    if (object.type === 'tree') {
      trees.push(object.sha);
    } else if (object.path.substr(-8) === '.user.js') {
      if (!repos[that.repo]) { repos[that.repo] = nil(); }
      repos[that.repo][object.path] = object.url;
    }
  });

  async.each(trees, function(sha, cb) {
    that.getTree(sha, cb);
  }, function () { 
    done(); 
  });
};

Repo.prototype.getTree = function (sha, cb) {
  var that = this;
  fetchJSON('/repos/' + this.user  + '/' + this.repo + '/git/trees/' + sha, 
    function (json) {
      that.parseTree(json.tree, cb);
  });
};

exports.getManager = function (userId, repos) { 
  return new RepoManager(userId, repos); 
};
