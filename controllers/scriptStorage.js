var AWS = require('aws-sdk');

var Script = require('../models/script').Script;
var User = require('../models/user').User;

var cleanFilename = require('../libs/helpers').cleanFilename;
var findDeadorAlive = require('../libs/remove').findDeadorAlive;
var userRoles = require('../models/userRoles.json');

var bucketName = 'OpenUserJS.org';

if (process.env.NODE_ENV === 'production') {
  AWS.config.update({ region: 'us-east-1' });
} else {
  // You need to install (and ruby too): https://github.com/jubos/fake-s3
  // Then run the fakes3.sh script or: fakes3 -r fakeS3 -p 10001
  var DEV_AWS_URL = process.env.DEV_AWS_URL || 'localhost:10001';
  AWS.config.update({
    accessKeyId: 'fakeId',
    secretAccessKey: 'fakeKey',
    httpOptions: {
      proxy: DEV_AWS_URL,
      agent: require('http').globalAgent
    }
  });
}

function getInstallName(req) {
  var username = req.route.params.username.toLowerCase();
  var namespace = req.route.params.namespace;
  return username + '/' + (namespace ? namespace + '/' : '')
    + req.route.params.scriptname;
}
exports.getInstallName = getInstallName;

exports.getSource = function(req, callback) {
  var s3 = new AWS.S3();
  var installName = getInstallName(req);

  Script.findOne({ installName: installName }, function(err, script) {
    if (!script) { return callback(null); }

    // Get the script
    callback(script, s3.getObject({ Bucket: bucketName, Key: installName })
      .createReadStream());
  });
};

exports.sendScript = function(req, res, next) {
  var accept = req.headers.accept;
  var installName = null;

  if (0 !== req.url.indexOf('/libs/') && accept === 'text/x-userscript-meta') {
    return exports.sendMeta(req, res, next);
  }

  exports.getSource(req, function(script, stream) {
    if (!script) { return next(); }

    // Send the script
    res.set('Content-Type', 'text/javascript; charset=utf-8');
    stream.pipe(res);

    // Don't count installs on libraries
    if (script.isLib) { return; }

    // Update the install count
    ++script.installs;
    script.save(function(err, script) { });
  });
};

// Send user script metadata block
exports.sendMeta = function(req, res, next) {
  var installName = getInstallName(req).replace(/\.meta\.js$/, '.user.js');

  Script.findOne({ installName: installName }, function(err, script) {
    var meta = null;

    if (!script) { return next(); }

    res.set('Content-Type', 'text/javascript; charset=utf-8');
    meta = script.meta;

    res.write('// ==UserScript==\n');
    Object.keys(meta).reverse().forEach(function(key) {
      if (meta[key] instanceof Array) {
        meta[key].forEach(function(value) {
          res.write('// @' + key + '    ' + value + '\n');
        });
      } else {
        res.write('// @' + key + '    ' + meta[key] + '\n');
      }
    });
    res.end('// ==/UserScript==\n');
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
  var unique = {
    'name': true,
    'namespace': true,
    'description': true,
    'version': true,
    'author': true
  };

  lines = aString.split(/[\r\n]+/).filter(function(e, i, a) {
    return (e.match(re));
  });

  for (line in lines) {
    lineMatches = lines[line].replace(/\s+$/, '').match(re);
    name = lineMatches[1];
    value = lineMatches[2];
    switch (name) {
      case "licence":
        name = "license";
        break;
    }
    if (!headers[name] || unique[name]) {
      headers[name] = value || '';
    } else {
      if (!(headers[name] instanceof Array)) {
        headers[name] = [headers[name]];
      }
      headers[name].push(value || '');
    }
  }

  return headers;
}
exports.parseMeta = parseMeta;

exports.getMeta = function(chunks, callback) {
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

exports.storeScript = function(user, meta, buf, callback, update) {
  var s3 = new AWS.S3();
  var namespace = null;
  var scriptName = null;
  var installName = user.name.toLowerCase() + '/';
  var isLibrary = typeof meta === 'string';
  var libraries = [];
  var requires = null;
  var collaborators = null;
  var libraryRegex = new RegExp('^https?:\/\/' +
    (process.env.NODE_ENV === 'production' ?
      'openuserjs\.org' : 'localhost:8080') +
    '\/libs\/src\/(.+?\/.+?\.js)$', '');

  if (!meta) { return callback(null); }

  if (!isLibrary) {
    namespace = cleanFilename(meta.namespace, '');
    scriptName = cleanFilename(meta.name, '');

    // Can't install a script without a @name (maybe replace with random value)
    if (!scriptName) { return callback(null); }

    if (!isLibrary && meta.author
        && meta.author != user.name && meta.collaborator) {
      collaborators = meta.collaborator;
      if ((typeof collaborators === 'string'
          && collaborators === user.name)
          || (collaborators instanceof Array
          && collaborators.indexOf(user.name) > -1)) {
        installName = meta.author.toLowerCase() + '/';
      } else {
        collaborators = null;
      }
    }

    if (!namespace || namespace === user.name) {
      installName += scriptName + '.user.js';
    } else {
      installName += namespace + '/' + scriptName + '.user.js';
    }

    if (meta.require) {
      if (typeof meta.require === 'string') {
        requires = [meta.require];
      } else {
        requires = meta.require;
      }

      requires.forEach(function(require) {
        var match = libraryRegex.exec(require);
        if (match && match[1]) { libraries.push(match[1]); }
      });
    }
  } else {
    scriptName = cleanFilename(meta.replace(/^\s+|\s+$/g, ''), '');
    if (!scriptName) { return callback(null); }

    installName += scriptName + '.js';
  }

  // Prevent a removed script from being reuploaded
  findDeadorAlive(Script, { installName: installName }, true,
    function(alive, script, removed) {
      if (removed || (!script && (update || collaborators))) {
        return callback(null);
      } else if (!script) {
        script = new Script({
          name: isLibrary ? meta : meta.name,
          author: user.name,
          installs: 0,
          rating: 0,
          about: '',
          updated: new Date(),
          votes: 0,
          flags: 0,
          installName: installName,
          fork: null,
          meta: isLibrary ? { name: meta } : meta,
          isLib: isLibrary,
          uses: isLibrary ? null : libraries,
          _authorId: user._id
        });
      } else {
        if (!script.isLib) {
          if (collaborators && (script.meta.author != meta.author
              || JSON.stringify(script.meta.collaborator) !=
             JSON.stringify(meta.collaborator))) {
            return callback(null);
          }
          script.meta = meta;
          script.uses = libraries;
        }
        script.updated = new Date();
      }

      script.save(function(err, script) {
        s3.putObject({ Bucket: bucketName, Key: installName, Body: buf },
          function(err, data) {
            if (user.role === userRoles.length - 1) {
              var userDoc = user;
              if (!userDoc.save) {
                // We're probably using req.session.user which may have gotten serialized.
                userDoc = new User(userDoc);
              }
              --userDoc.role;
              userDoc.save(function(err, user) { callback(script); });
            } else {
              callback(script);
            }
          });
      });
    });
};

exports.deleteScript = function(installName, callback) {
  Script.findOneAndRemove({ installName: installName }, function(err, user) {
    var s3 = new AWS.S3();
    s3.deleteObject({ Bucket: bucketName, Key: installName }, callback);
  });
};

// GitHub calls this on a push if a webhook is setup
// This controller makes sure we have the latest version of a script
exports.webhook = function(req, res) {
  var RepoManager = require('../libs/repoManager');
  var payload = null;
  var username = null;
  var reponame = null;
  var repos = {};
  var repo = null;

  res.end(); // Close connection

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
  User.findOne({ ghUsername: username }, function(err, user) {
    if (!user) { return; }

    // Gather the modified user scripts
    payload.commits.forEach(function(commit) {
      commit.modified.forEach(function(filename) {
        if (filename.substr(-8) === '.user.js') {
          repo[filename] = '/' + encodeURI(filename);
        }
      });
    });

    // Update modified scripts
    var repoManager = RepoManager.getManager(null, user, repos);
    repoManager.loadScripts(function() { }, true);
  });
};
