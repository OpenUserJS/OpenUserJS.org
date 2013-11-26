var https = require('https');
var async = require('async');
var Strategy = require('../models/strategy.js').Strategy;
var clientId = null;
var clientKey = null;

Strategy.findOne({ name: 'github' }, function(err, strat) {
  clientId = strat.id;
  clientKey = strat.key;
});

function fetchJSON(options, callback) {
  var repos = [];
  var raw = "";
  var json = null;

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

function RepoManager(userId) {
  this.userId = userId;
}

RepoManager.prototype.fetchRepos = function (callback) {
  var repos = [];

  var options = {
    hostname: 'api.github.com',
    port: 443,
    path: '/user/' + this.userId + '/repos?client_id=' + clientId
      + '&client_secret=' + clientKey,
    method: 'GET',
    headers: { 'User-Agent': 'Node.js' }
  };

  fetchJSON(options, function (json) {
    json.forEach(function (repo) {
      repos.push(new Repo(repo.owner.login, repo.name));
    });
    callback(repos);
  });
};

function Repo(username, reponame) {
  this.user = username;
  this.repo = reponame;
  this.scripts = [];
}

Repo.prototype.fetchUserScripts = function (callback) {
  this.getTree('HEAD', callback);
};

Repo.prototype.parseTree = function (tree, done) {
  var object;
  var trees = [];
  var that = this;

  tree.forEach(function (object) {
    if (object.type === 'tree') {
      trees.push(object.sha);
    } else if (object.path.substr(-8) === '.user.js') {
      that.scripts.push({name: object.path, url: object.url});
    }
  });

  async.each(trees, function(sha, cb) {
    that.getTree(sha, cb);
  }, function () { 
    done(); 
  });
};

Repo.prototype.getTree = function (sha, cb) {
  var options = {
    hostname: 'api.github.com',
    port: 443,
    path: '/repos/' + this.user  + '/' + this.repo
      + '/git/trees/' + sha + '?client_id=' 
      + clientId + '&client_secret=' + clientKey,
    method: 'GET',
    headers: { 'User-Agent': 'Node.js' }
  };

  var that = this;
  fetchJSON(options, function (json) {
    that.parseTree(json.tree, cb);
  });
};

exports.getManager = function (userId) { return new RepoManager(userId); };
