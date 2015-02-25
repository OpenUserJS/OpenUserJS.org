'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var AWS = require('aws-sdk');

var Script = require('../models/script').Script;
var User = require('../models/user').User;

var cleanFilename = require('../libs/helpers').cleanFilename;
var findDeadorAlive = require('../libs/remove').findDeadorAlive;
var userRoles = require('../models/userRoles.json');

var bucketName = 'OpenUserJS.org';

if (isPro) {
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

function getInstallName(aReq) {
  return aReq.params.username + '/' + aReq.params.scriptname;
}
exports.getInstallName = getInstallName;

function caseInsensitive(aInstallName) {
  return new RegExp('^' + aInstallName.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1")
    + '$', 'i');
}
exports.caseInsensitive = caseInsensitive;

exports.getSource = function (aReq, aCallback) {
  var s3 = new AWS.S3();
  var installName = getInstallName(aReq);

  Script.findOne({ installName: caseInsensitive(installName) },
    function (aErr, aScript) {
      var s3Object = null;

      if (!aScript) {
        return aCallback(null);
      }

      s3Object = s3.getObject({ Bucket: bucketName, Key: installName }).createReadStream().
        on('error', function () {
          if (isPro) {
            console.error('S3 Key Not Found ' + installName);
          }

          return aCallback(null);
        });

      // Get the script
      aCallback(aScript, s3Object);
    });
};

exports.sendScript = function (aReq, aRes, aNext) {
  var accept = aReq.headers.accept;

  if (0 !== aReq.url.indexOf('/libs/') && accept === 'text/x-userscript-meta') {
    return exports.sendMeta(aReq, aRes, aNext);
  }

  exports.getSource(aReq, function (aScript, aStream) {

    if (!aScript) { return aNext(); }

    // Send the script
    aRes.set('Content-Type', 'text/javascript; charset=UTF-8');

    // Disable *express-minify* for this response
    aRes._skip = true;

    aStream.pipe(aRes);

    // Don't count installs on raw source route
    if (aScript.isLib || aReq.params.type) { return; }

    // Update the install count
    ++aScript.installs;
    ++aScript.installsSinceUpdate;

    aScript.save(function (aErr, aScript) { });
  });
};

// Send user script metadata block
exports.sendMeta = function (aReq, aRes, aNext) {
  var installName = getInstallName(aReq).replace(/\.meta\.js$/, '.user.js');

  Script.findOne({ installName: caseInsensitive(installName) },
    function (aErr, aScript) {
      var meta = null;
      var data = null;
      var prefix = null;
      var key = null;
      var whitespace = '\u0020\u0020\u0020\u0020';

      if (!aScript) { return aNext(); }

      aRes.set('Content-Type', 'text/javascript; charset=UTF-8');

      // Disable *express-minify* for this response
      aRes._skip = true;

      meta = aScript.meta; // NOTE: Watchpoint

      aRes.write('// ==UserScript==\n');
      Object.keys(meta).reverse().forEach(function (aName) {
        if (meta[aName] instanceof Array) {
          meta[aName].forEach(function (aValue) {
            aRes.write('// @' + aName + (aValue ? whitespace + aValue : '') + '\n');
          });
        } else if (meta[aName] instanceof Object) {
          prefix = aName;
          for (key in meta[aName]) {
            data = meta[prefix][key];
            if (data instanceof Array) {
              data.forEach(function (aValue) {
                aRes.write('// @' + prefix + ':' + key + (aValue ? whitespace + aValue : '') + '\n');
              });
            }
            else {
              aRes.write('// @' + prefix + ':' + key + (data ? whitespace + data : '') + '\n');
            }
          }
        } else {
          data = meta[aName];
          aRes.write('// @' + aName + (data ? whitespace + data : '') + '\n');
        }
      });
      aRes.end('// ==/UserScript==\n');
  });
};

// Modified from Count Issues (http://userscripts.org/scripts/show/69307)
// By Marti Martz (http://userscripts.org/users/37004)
function parseMeta(aString, aNormalize) {
  var rLine = /\/\/ @(\S+)(?:\s+(.*))?/;
  var headers = {};
  var name = null;
  var prefix = null;
  var key = null;
  var value = null;
  var line = null;
  var lineMatches = null;
  var lines = {};
  var uniques = {
    'description': true,
    'icon': true,
    'name': true,
    'namespace': true,
    'version': true,
    'oujs:author': true
  };
  var unique = null;
  var one = null;
  var matches = null;

  lines = aString.split(/[\r\n]+/).filter(function (aElement, aIndex, aArray) {
    return (aElement.match(rLine));
  });

  for (line in lines) {
    var header = null;

    lineMatches = lines[line].replace(/\s+$/, '').match(rLine);
    name = lineMatches[1];
    value = lineMatches[2];
    if (aNormalize) {
      // Upmix from...
      switch (name) {
        case 'homepage':
        case 'source':
        case 'website':
          name = 'homepageURL';
          break;
        case 'defaulticon':
        case 'iconURL':
          name = 'icon';
          break;
        case 'licence':
          name = 'license';
          break;
      }
    }
    name = name.split(/:/).reverse();
    key = name[0];
    prefix = name[1];
    if (key) {
      unique = {};
      if (prefix) {
        if (!headers[prefix]) {
          headers[prefix] = {};
        }
        header = headers[prefix];
        if (aNormalize) {
          for (one in uniques) {
            matches = one.match(/(.*):(.*)$/);
            if (uniques[one] && matches && matches[1] === prefix) {
              unique[matches[2]] = true;
            }
          }
        }
      } else {
        header = headers;
        if (aNormalize) {
          for (one in uniques) {
            if (uniques[one] && !/:/.test(one)) {
              unique[one] = true;
            }
          }
        }
      }
      if (!header[key] || aNormalize && unique[key]) {
        header[key] = value || '';
      } else if (!aNormalize || header[key] !== (value || '')
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

exports.getMeta = function (aChunks, aCallback) {
  // We need to convert the array of buffers to a string to
  // parse the header. But strings are memory inefficient compared
  // to buffers so we only convert the least number of chunks to
  // get the user script header.
  var str = '';
  var i = 0;
  var header = null;

  for (; i < aChunks.length; ++i) {
    header = null;
    str += aChunks[i];
    header = /^(?:\uFEFF)?\/\/ ==UserScript==([\s\S]*?)^\/\/ ==\/UserScript==/m.exec(str);

    if (header && header[1]) { return aCallback(parseMeta(header[1], true)); }
  }

  aCallback(null);
};

exports.storeScript = function (aUser, aMeta, aBuf, aCallback, aUpdate) {
  var s3 = new AWS.S3();
  var scriptName = null;
  var installName = aUser.name + '/';
  var isLibrary = typeof aMeta === 'string';
  var libraries = [];
  var requires = null;
  var match = null;
  var collaborators = null;
  var rLibrary = new RegExp(
    '^(?:(?:(?:https?:)?\/\/' +
      (isPro ? 'openuserjs\.org' : 'localhost:8080') +
        ')?\/(?:libs\/src|src\/libs)\/)?(.*?)([^\/]*\.js)$', '');

  if (!aMeta) { return aCallback(null); }

  if (!isLibrary) {
    scriptName = cleanFilename(aMeta.name, '');

    // Can't install a script without a @name (maybe replace with random value)
    if (!scriptName) { return aCallback(null); }

    if (!isLibrary && aMeta.oujs && aMeta.oujs.author
        && aMeta.oujs.author != aUser.name && aMeta.oujs.collaborator) {
      collaborators = aMeta.oujs.collaborator;
      if ((typeof collaborators === 'string'
          && collaborators === aUser.name)
          || (collaborators instanceof Array
          && collaborators.indexOf(aUser.name) > -1)) {
        installName = aMeta.oujs.author + '/';
      } else {
        collaborators = null;
      }
    }

    installName += scriptName + '.user.js';

    if (aMeta.require) {
      if (typeof aMeta.require === 'string') {
        requires = [aMeta.require];
      } else {
        requires = aMeta.require;
      }

      requires.forEach(function (aRequire) {
        match = rLibrary.exec(aRequire);
        if (match) {
          if (!match[1]) {
            match[1] = aUser.name + '/';
          }

          if (!/\.user\.js$/.test(match[2])) {
            libraries.push(match[1] + match[2]);
          }
        }
      });
    }
  } else {
    scriptName = cleanFilename(aMeta.replace(/^\s+|\s+$/g, ''), '');
    if (!scriptName) { return aCallback(null); }

    installName += scriptName + '.js';
  }

  // Prevent a removed script from being reuploaded
  findDeadorAlive(Script, { installName: caseInsensitive(installName) }, true,
    function (aAlive, aScript, aRemoved) {
      if (aRemoved || (!aScript && (aUpdate || collaborators))) {
        return aCallback(null);
      } else if (!aScript) {
        // New script
        aScript = new Script({
          name: isLibrary ? aMeta : aMeta.name,
          author: aUser.name,
          installs: 0,
          rating: 0,
          about: '',
          updated: new Date(),
          votes: 0,
          flags: 0,
          installName: installName,
          fork: null,
          meta: isLibrary ? { name: aMeta } : aMeta,
          isLib: isLibrary,
          uses: isLibrary ? null : libraries,
          _authorId: aUser._id
        });
      } else {
        // Script already exists.
        if (!aScript.isLib) {
          if (collaborators && (aScript.meta.oujs && aScript.meta.oujs.author != aMeta.oujs.author
              || (aScript.meta.oujs && JSON.stringify(aScript.meta.oujs.collaborator) !=
             JSON.stringify(aMeta.oujs.collaborator)))) {
            return aCallback(null);
          }
          aScript.meta = aMeta;
          aScript.uses = libraries;
        }
        aScript.updated = new Date();
        aScript.installsSinceUpdate = 0;
      }

      aScript.save(function (aErr, aScript) {
        s3.putObject({ Bucket: bucketName, Key: installName, Body: aBuf },
          function (aErr, aData) {
            // Don't save a script if storing failed
            if (aErr) {
              console.error(aUser.name, '-', installName);
              console.error(JSON.stringify(aErr));
              console.error(JSON.stringify(aScript.toObject()));
              return aCallback(null);
            }

            if (aUser.role === userRoles.length - 1) {
              var userDoc = aUser;
              if (!userDoc.save) {
                // We're probably using req.session.user which may have gotten serialized.
                userDoc = new User(userDoc);
              }
              --userDoc.role;
              userDoc.save(function (aErr, aUser) { aCallback(aScript); });
            } else {
              aCallback(aScript);
            }
          });
      });
    });
};

exports.deleteScript = function (aInstallName, aCallback) {
  Script.findOne({ installName: caseInsensitive(aInstallName) },
    function (aErr, aScript) {
      var s3 = new AWS.S3();
      s3.deleteObject({ Bucket : bucketName, Key : aScript.installName},
        function (aErr) {
          if (!aErr) {
            aScript.remove(aCallback);
          } else {
            aCallback(null);
          }
      });
  });
};

// GitHub calls this on a push if a webhook is setup
// This controller makes sure we have the latest version of a script
exports.webhook = function (aReq, aRes) {
  var RepoManager = require('../libs/repoManager');
  var payload = null;
  var username = null;
  var reponame = null;
  var repos = {};
  var repo = null;

  aRes.end(); // Close connection

  // Test for know GH webhook ips: https://api.github.com/meta
  if (!aReq.body.payload ||
    !/192\.30\.25[2-5]\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])$/
    .test(aReq.headers['x-forwarded-for'] || aReq.connection.remoteAddress)) {
    return;
  }

  payload = JSON.parse(aReq.body.payload);

  // Only accept commits to the master branch
  if (!payload || payload.ref !== 'refs/heads/master') { return; }

  // Gather all the info for the RepoManager
  username = payload.repository.owner.name;
  reponame = payload.repository.name;

  repo = repos[reponame] = {};

  // Find the user that corresponds the repo owner
  User.findOne({ ghUsername: username }, function (aErr, aUser) {
    if (!aUser) { return; }

    // Gather the modified user scripts
    payload.commits.forEach(function (aCommit) {
      aCommit.modified.forEach(function (aFilename) {
        if (aFilename.substr(-8) === '.user.js') {
          repo[aFilename] = '/' + encodeURI(aFilename);
        }
      });
    });

    // Update modified scripts
    var repoManager = RepoManager.getManager(null, aUser, repos);
    repoManager.loadScripts(function () { }, true);
  });
};
