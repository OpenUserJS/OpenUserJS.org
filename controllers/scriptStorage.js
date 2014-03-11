var AWS = require('aws-sdk');
var Script = require('../models/script').Script;
var User = require('../models/user').User;
var cleanFilename = require('../libs/helpers').cleanFilename;
var userRoles = require('../models/userRoles.json');
var bucketName = 'OpenUserJS.org';

if (process.env.NODE_ENV === 'production') {
  AWS.config.update({ region: 'us-east-1' });
} else {
  // You need to install (and ruby too): https://github.com/jubos/fake-s3
  // Then run the fakes3.sh script or: fakes3 -r fakeS3 -p 10001
  AWS.config.update({ accessKeyId: 'fakeId', secretAccessKey: 'fakeKey',
    httpOptions: { 
    proxy: 'localhost:10001', agent: require('http').globalAgent 
  }});
}

function getInstallName (req) {
  var username = req.route.params.username.toLowerCase();
  var namespace = req.route.params.namespace;
  return username + '/' + (namespace ? namespace + '/' : '') 
    + req.route.params.scriptname;
}
exports.getInstallName = getInstallName;

exports.getSource = function (req, callback) {
  var s3 = new AWS.S3();
  var installName = getInstallName(req);

  Script.findOne({ installName: installName }, function (err, script) {
    if (!script) { return callback(null); }

    // Get the script
    callback(script, s3.getObject({ Bucket: bucketName, Key: installName })
      .createReadStream());
  });
};

exports.sendScript = function (req, res, next) {
  var accept = req.headers['Accept'];
  var installName = null;

  if (accept === 'text/x-userscript-meta') { 
    return exports.sendMeta(req, res, next); 
  }

  exports.getSource(req, function (script, stream) {
    if (!script) { return next(); }

    // Send the script
    res.set('Content-Type', 'text/javascript; charset=utf-8');
    stream.pipe(res);

    // Update the install count
    ++script.installs;
    script.save(function (err, script) {});
  });
};

exports.sendMeta = function (req, res, next) {
  var installName = getInstallName(req).replace(/\.meta\.js$/, '.user.js');

  Script.findOne({ installName: installName }, function (err, script) {
    var key = null;
    var meta = null;
    var lines = [];

    if (!script) { return next(); }

    meta = script.meta;
    for (key in meta) {
      lines.push('// @' + key + '    ' + meta[key]);
    }

    res.set('Content-Type', 'text/javascript; charset=utf-8');
    res.write('// ==UserScript==\n');
    res.write(lines.reverse().join('\n'));
    res.end('\n// ==/UserScript==\n');
  });
};

// Modified from Count Issues (http://userscripts.org/scripts/show/69307)
// By Marti Martz (http://userscripts.org/users/37004)
function parseMeta(aString) {
  var re = /\/\/ @(\S+)(?:\s+(.*))?/;
  var headers = {};
  var name = null;
  var key = null;
  var value = null;
  var line = null;
  var lineMatches = null;
  var lines = {};

  lines = aString.split(/[\r\n]+/).filter(function (e, i, a) {
    return (e.match(re));
  });

  for (line in lines) {
    lineMatches = lines[line].replace(/\s+$/, "").match(re);
    name = lineMatches[1];
    value = lineMatches[2];
    headers[name] = value || "";
  }

  return headers;
}

exports.getMeta = function (chunks, callback) {
  // We need to convert the array of buffers to a string to
  // parse the header. But strings are memory inefficient compared
  // to buffers so we only convert the least number of chunks to
  // get the user script header.
  var str = '';
  var i = 0;
  var len = chunks.length;

  for (; i < chunks.length; ++i) {
    var header = null;
    str += chunks[i];
    header = /^\/\/ ==UserScript==([\s\S]*?)^\/\/ ==\/UserScript==/m.exec(str);

    if (header && header[1]) { return callback(parseMeta(header[1])); }
  }

  callback(null);
};

exports.storeScript = function (user, meta, buf, callback, update) {
  var s3 = new AWS.S3();
  var namespace = cleanFilename(meta.namespace, '');
  var scriptName = cleanFilename(meta.name, '');
  var installName = user.name.toLowerCase() + '/';

  // Can't install a script without a @name (maybe replace with random value)
  if (!scriptName) { return callback(null); }

  if (namespace === user.name || !namespace) {
    installName += scriptName + '.user.js';
  } else {
    installName += namespace + '/' + scriptName + '.user.js';
  }

  Script.findOne({ installName: installName }, function (err, script) {

    if (!script && update) {
      return callback(null);
    } else if (!script) {
      script = new Script({
        name: meta.name,
        author: user.name,
        about: '',
        installs: 0,
        rating: 0,
        votes: 0,
        installable: true,
        installName: installName,
        updated: new Date(),
        fork: null,
        meta: meta,
        _authorId: user._id
      });
    } else {
      script.meta = meta;
      script.updated = new Date();
    }

    script.save(function (err, script) {
      s3.putObject({ Bucket : bucketName, Key : installName, Body : buf },
        function (err, data) {
           if (user.role === userRoles.length - 1) {
             --user.role;
             user.save(function (err, user) { callback(script); });
           } else {
             callback(script);
           }
        });
    });
  });
};

exports.deleteScript = function (installName, callback) {
  Script.findOneAndRemove({ installName: installName }, function (err, user) {
    var s3 = new AWS.S3();
    s3.deleteObject({ Bucket : bucketName, Key : installName}, callback);
  });
};

exports.webhook = function (req, res) {
  var RepoManager = require('../libs/repoManager');
  var payload = null;
  var username = null;
  var reponame = null;
  var repos = {};
  var repo = null;

  res.end(); // close connection

  // Test for know GH webhook ips: https://api.github.com/meta
  if (!req.body.payload ||
    !/192\.30\.252\.(2[0-5][0-5]|1[0-9]{2}|[1-9]?\d)/
    .test(req.headers['x-forwarded-for'] || req.connection.remoteAddress)) {
    return; 
  }

  payload = JSON.parse(req.body.payload);

  // Only accept commits to the master branch
  if (!payload || payload.ref !== 'refs/heads/master') { return; }

  // Gather all the info for the RepoManager
  username = payload.repository.owner.name;
  reponame = payload.repository.name;

  repo = repos[reponame] = {};

  // Find the user that corresponds the repo owner
  User.findOne({ ghUsername: username }, function (err, user) {
    if (!user) { return; }

    // Gather the modified user scripts
    payload.commits.forEach(function (commit) {
      commit.modified.forEach(function (filename) {
        if (filename.substr(-8) === '.user.js') {
          repo[filename] = '/' + filename;
        }
      });
    });

    // Update modified scripts
    var repoManager = RepoManager.getManager(null, user, repos);
    repoManager.loadScripts(function (){}, true);
  });
};
