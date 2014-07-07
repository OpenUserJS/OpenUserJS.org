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

/*Script.find({ installName: /^[^\/]+\/[^\/]+\/[^\/]+$/ },function (err, scripts){
  var s3 = new AWS.S3();
  var Discussion = require('../models/discussion').Discussion;

  scripts.forEach(function (script) {
    //console.log(script.installName);
    var oldPath = script.installName;
    var newPath = cleanFilename(script.author) + '/'
      + cleanFilename(script.name) + (script.isLib ? '.js' : '.user.js');
    var newCat = (script.isLib ? 'libs' : 'scripts') + '/' + newPath
      .replace(/(\.user)?\.js$/, '')  + '/issues';
    var oldCat = (script.isLib ? 'libs' : 'scripts') + '/' + oldPath
      .replace(/(\.user)?\.js$/, '')  + '/issues';

    Discussion.find({ category: oldCat }, function (err, discussions) {
      discussions.forEach(function (discussion) {
        var urlTopic = cleanFilename(discussion.topic, '').replace(/_\d+$/, '');
        var path = '/' + newCat + '/' + urlTopic;
        discussion.path = path;
        discussion.category = newCat;
        discussion.save(function (){ console.log(newCat, path); });
      });
    });

    var params = {
      Bucket: bucketName,
      CopySource: bucketName + '/' + oldPath,
      Key: newPath
    };

    script.installName = newPath;
    s3.copyObject(params, function (err, data) {
      if (err) { return console.log(oldPath + ' - copy fail'); }
      script.save(function () {});

      s3.deleteObject({ Bucket : params.Bucket, Key : oldPath},
        function (err, data) {
          if (err) {
            console.log(oldPath + '- delete fail');
          } else {
            console.log(newPath + ' - success');
          }
        });
    });
  });
});*/


function getInstallName (req) {
  return req.route.params.username + '/' + req.route.params.scriptname;
}
exports.getInstallName = getInstallName;

function caseInsensitive (installName) {
  return new RegExp('^' + installName.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1")
    + '$', 'i');
}
exports.caseInsensitive = caseInsensitive;

exports.getSource = function (req, callback) {
  var s3 = new AWS.S3();
  var installName = getInstallName(req);

  Script.findOne({ installName: caseInsensitive(installName) },
    function (err, script) {

      if (!script) { return callback(null); }

      // Get the script
      callback(script, s3.getObject({ Bucket: bucketName, Key: installName })
        .createReadStream());
  });
};

exports.sendScript = function (req, res, next) {
  var accept = req.headers.accept;
  var installName = null;

  if (0 !== req.url.indexOf('/libs/') && accept === 'text/x-userscript-meta') {
    return exports.sendMeta(req, res, next);
  }

  exports.getSource(req, function (script, stream) {

    if (!script) { return next(); }

    // Send the script
    res.set('Content-Type', 'text/javascript; charset=UTF-8');
    stream.pipe(res);

    // Don't count installs on libraries
    if (script.isLib) { return; }

    // Update the install count
    ++script.installs;
    script.save(function (err, script) { });
  });
};

// Send user script metadata block
exports.sendMeta = function (req, res, next) {
  var installName = getInstallName(req).replace(/\.meta\.js$/, '.user.js');

  Script.findOne({ installName: caseInsensitive(installName) },
    function (err, script) {
      var meta = null;
      var name = null;
      var data = null;
      var prefix = null;
      var key = null;
      var whitespace = '    ';

      if (!script) { return next(); }

      res.set('Content-Type', 'text/javascript; charset=UTF-8');
      meta = script.meta;

      res.write('// ==UserScript==\n');
      Object.keys(meta).reverse().forEach(function (name) {
        if (meta[name] instanceof Array) {
          meta[name].forEach(function (value) {
            res.write('// @' + name + (value ? whitespace + value : '') + '\n');
          });
        } else if (meta[name] instanceof Object) {
          prefix = name;
          for (key in meta[name]) {
            data = meta[prefix][key];
            if (data instanceof Array) {
              data.forEach(function (value) {
                res.write('// @' + prefix + ':' + key + (value ? whitespace + value : '') + '\n');
              });
            }
            else {
              res.write('// @' + prefix + ':' + key + (data ? whitespace + data : '') + '\n');
            }
          }
        } else {
          data = meta[name];
          res.write('// @' + name + (data ? whitespace + data : '') + '\n');
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
  var prefix = null;
  var key = null;
  var value = null;
  var line = null;
  var lineMatches = null;
  var lines = {};
  var uniques = {
    'name': true,
    'namespace': true,
    'description': true,
    'version': true,
    'oujs:author': true
  };
  var unique = null;
  var one = null;
  var matches = null;

  lines = aString.split(/[\r\n]+/).filter(function (e, i, a) {
    return (e.match(re));
  });

  for (line in lines) {
    lineMatches = lines[line].replace(/\s+$/, '').match(re);
    name = lineMatches[1];
    value = lineMatches[2];
    // Upmix from...
    switch (name) {
      case 'licence':
        name = 'license';
        break;
      case 'homepage':
        name = 'homepageURL';
        break;
    }
    name = name.split(/:/).reverse();
    key = name[0];
    prefix = name[1];
    if (key) {
      if (prefix) {
        if (!headers[prefix]) {
          headers[prefix] = {};
        }
        header = headers[prefix];
        unique = {};
        for (one in uniques) {
          matches = one.match(/(.*):(.*)$/);
          if (uniques[one] && matches && matches[1] === prefix) {
            unique[matches[2]] = true;
          }
        }
      } else {
        header = headers;
        unique = {};
        for (one in uniques) {
          if (uniques[one] && !/:/.test(one)) {
            unique[one] = true;
          }
        }
      }
      if (!header[key] || unique[key]) {
        header[key] = value || '';
      } else if (header[key] !== (value || '')
          && !(header[key] instanceof Array && header[key].indexOf(value) > -1)) {
        if (!(header[key] instanceof Array)) {
          header[key] = [header[key]];
        }
        header[key].push(value || '');
      }
    }
  }
  return headers;
}
exports.parseMeta = parseMeta;

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
  var scriptName = null;
  var installName = user.name + '/';
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
    scriptName = cleanFilename(meta.name, '');

    // Can't install a script without a @name (maybe replace with random value)
    if (!scriptName) { return callback(null); }

    if (!isLibrary && meta.oujs && meta.oujs.author
        && meta.oujs.author != user.name && meta.oujs.collaborator) {
      collaborators = meta.oujs.collaborator;
      if ((typeof collaborators === 'string'
          && collaborators === user.name)
          || (collaborators instanceof Array
          && collaborators.indexOf(user.name) > -1)) {
        installName = meta.oujs.author + '/';
      } else {
        collaborators = null;
      }
    }

    installName += scriptName + '.user.js';

    if (meta.require) {
      if (typeof meta.require === 'string') {
        requires = [meta.require];
      } else {
        requires = meta.require;
      }

      requires.forEach(function (require) {
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
  findDeadorAlive(Script, { installName: caseInsensitive(installName) }, true,
    function (alive, script, removed) {
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
          if (collaborators && (script.meta.oujs && script.meta.oujs.author != meta.oujs.author
              || (script.meta.oujs && JSON.stringify(script.meta.oujs.collaborator) !=
             JSON.stringify(meta.oujs.collaborator)))) {
            return callback(null);
          }
          script.meta = meta;
          script.uses = libraries;
        }
        script.updated = new Date();
      }

      script.save(function (err, script) {
        s3.putObject({ Bucket: bucketName, Key: installName, Body: buf },
          function (err, data) {
            // Don't save a script if storing failed
            if (err) {
              console.error(user.name, '-', installName);
              console.error(JSON.stringify(err));
              console.error(JSON.stringify(script.toObject()));
              return callback(null);
            }

            if (user.role === userRoles.length - 1) {
              var userDoc = user;
              if (!userDoc.save) {
                // We're probably using req.session.user which may have gotten serialized.
                userDoc = new User(userDoc);
              }
              --userDoc.role;
              userDoc.save(function (err, user) { callback(script); });
            } else {
              callback(script);
            }
          });
      });
    });
};

exports.deleteScript = function (installName, callback) {
  Script.findOne({ installName: caseInsensitive(installName) },
    function (err, script) {
      var s3 = new AWS.S3();
      s3.deleteObject({ Bucket : bucketName, Key : script.installName},
        function (err) {
          if (!err) {
            script.remove(callback);
          } else {
            callback(null);
          }
      });
  });
};

// GitHub calls this on a push if a webhook is setup
// This controller makes sure we have the latest version of a script
exports.webhook = function (req, res) {
  var RepoManager = require('../libs/repoManager');
  var payload = null;
  var username = null;
  var reponame = null;
  var repos = {};
  var repo = null;

  res.end(); // Close connection

  // Test for know GH webhook ips: https://api.github.com/meta
  if (!req.body.payload ||
    !/192\.30\.25[2-5]\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])$/
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
          repo[filename] = '/' + encodeURI(filename);
        }
      });
    });

    // Update modified scripts
    var repoManager = RepoManager.getManager(null, user, repos);
    repoManager.loadScripts(function () { }, true);
  });
};
