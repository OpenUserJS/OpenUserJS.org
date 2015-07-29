'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var fs = require('fs');
var PEG = require('pegjs');
var AWS = require('aws-sdk');

var Script = require('../models/script').Script;
var User = require('../models/user').User;

var cleanFilename = require('../libs/helpers').cleanFilename;
var findDeadorAlive = require('../libs/remove').findDeadorAlive;
var userRoles = require('../models/userRoles.json');

var parsers = (function () {
  return {
    UserScript: PEG.buildParser(fs.readFileSync('./public/pegjs/blockUserScript.pegjs', 'utf8'),
      { allowedStartRules: ['line'] }),
    OpenUserJS: PEG.buildParser(fs.readFileSync('./public/pegjs/blockOpenUserJS.pegjs', 'utf8'),
      { allowedStartRules: ['line'] })
  };
})();
exports.parsers = parsers;

var bucketName = 'OpenUserJS.org';

if (isPro) {
  AWS.config.update({ region: 'us-east-1' });
} else {
  // You need to install (and ruby too): https://github.com/jubos/fake-s3
  // Then run the fakes3.sh script or: fakes3 -r fakeS3 -p 10001
  var DEV_AWS_URL = process.env.DEV_AWS_URL || 'http://localhost:10001';
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

function caseSensitive(aInstallName, aMoreThanInstallName) {

  var rMatchExpression = aMoreThanInstallName ? /^(.*)\/(.*)\/(.*)\/(.*)$/ : /^(.*)\/(.*)$/;
  var username = '';
  var char = null;
  var rExpression = null;

  var matches = aInstallName.match(rMatchExpression);
  if (matches) {
    if (aMoreThanInstallName) {

      for (char in matches[2]) {

        if (matches[2][char].toLowerCase() !== matches[2][char].toUpperCase()) {
        username += '[' +
          matches[2][char].toLowerCase().replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1") +
            matches[2][char].toUpperCase().replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1") + ']';
        } else {
          username += matches[2][char].replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
        }

      }

      rExpression = new RegExp(
        '^' +
          matches[1] + '/' +
            username + '/' +
              matches[3].replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1") + '/' +
                matches[4] + '$',
        ''
      );
    } else {

      for (char in matches[1]) {

        if (matches[1][char].toLowerCase() !== matches[1][char].toUpperCase()) {
          username += '[' +
            matches[1][char].toLowerCase().replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1") +
              matches[1][char].toUpperCase().replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1") + ']';
        } else {
          username += matches[1][char].replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
        }
      }

      rExpression = new RegExp(
        '^' +
          username + '/' +
            matches[2].replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1") + '$',
        ''
      );
    }
  }

  return rExpression;
}
exports.caseSensitive = caseSensitive;

exports.getSource = function (aReq, aCallback) {
  var s3 = new AWS.S3();
  var installName = getInstallName(aReq);

  Script.findOne({ installName: caseSensitive(installName) },
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

// Send metadata blocks
exports.sendMeta = function (aReq, aRes, aNext) {
  var installName = getInstallName(aReq).replace(/\.meta\.js$/, '.user.js');

  Script.findOne({ installName: caseSensitive(installName) },
    function (aErr, aScript) {
      var meta = null;
      var whitespace = '\u0020\u0020\u0020\u0020';

      if (!aScript) {
        return aNext();
      }

      aRes.set('Content-Type', 'text/javascript; charset=UTF-8');

      // Disable *express-minify* for this response
      aRes._skip = true;

      meta = aScript.meta; // NOTE: Watchpoint

      Object.keys(meta).reverse().forEach(function (aBlock) {
        aRes.write('// ==' + aBlock + '==\n');

        Object.keys(meta[aBlock]).reverse().forEach(function (aKey) {
          Object.keys(meta[aBlock][aKey]).forEach(function (aIndex) {
            var header = meta[aBlock][aKey][aIndex];
            var key = null;
            var value = null;

            key = (header ? header.key : null) || aKey;
            value = (header ? header.value : null);

            aRes.write('// @' + key + (value ? whitespace + value : '') + '\n');
          });
        });

        aRes.write('// ==/' + aBlock + '==\n\n');
      });
      aRes.end();
  });
};

// Parse a specific metadata block content with a specified *pegjs* parser
function parseMeta(aParser, aString) {
  var rLine = /\/\/ @(\S+)(?:\s+(.*))?/;
  var line = null;
  var lines = {};
  var header = null;
  var key = null;
  var keyword = null;
  var unique = null;
  var name = null;
  var headers = {};
  var i = null;
  var thisHeader = null;

  lines = aString.split(/[\r\n]+/).filter(function (aElement, aIndex, aArray) {
    return (aElement.match(rLine));
  });

  for (line in lines) {
    try {
      header = aParser.parse(lines[line], { startRule: 'line' });
    } catch (aE) {
      // Ignore anything not understood
      header = null;
    }

    if (header) {
      key = header.key;
      keyword = header.keyword;
      name = keyword || key;
      unique = header.unique;

      delete header.unique;

      // Create if doesn't exist
      if (!headers[name]) {
        headers[name] = [];
      }

      // Check for unique
      if (unique) {
        for (i = 0; thisHeader = headers[name][i]; ++i) {
          if (thisHeader.key === header.key) {
            headers[name].splice(i, 1);
          }
        }
      } else {
        for (i = 0; thisHeader = headers[name][i]; ++i) {
          if (thisHeader.value === header.value) {
            headers[name].splice(i, 1);
          }
        }
      }

      headers[name].push(header);
    }
  }

  // Clean up for DB storage
  for (name in headers) {
    headers[name].forEach(function (aElement, aIndex, aArray) {
      if (!aElement.keyword) {
        delete aElement.key;
      }
    });
  }

  return headers;
}
exports.parseMeta = parseMeta;

exports.getMeta = function (aChunks, aCallback) {
  // We need to convert the array of buffers to a string to
  // parse the blocks. But strings are memory inefficient compared
  // to buffers so we only convert the least number of chunks to
  // get the metadata blocks.
  var i = 0;
  var str = '';
  var parser = null;
  var rHeaderContent = null;
  var headerContent = null;
  var hasUserScriptHeaderContent = false;
  var blocksContent = {};
  var blocks = {};

  for (; i < aChunks.length; ++i) {
    str += aChunks[i];

    for (parser in parsers) {
      rHeaderContent = new RegExp(
        '^(?:\\uFEFF)?\/\/ ==' + parser + '==([\\s\\S]*?)^\/\/ ==\/'+ parser + '==', 'm'
      );
      headerContent = rHeaderContent.exec(str);
      if (headerContent && headerContent[1]) {
        if (parser === 'UserScript') {
          hasUserScriptHeaderContent = true;
        }

        blocksContent[parser] = headerContent[1];
      }
    }

    if (hasUserScriptHeaderContent) {
      for (parser in parsers) {
        if (blocksContent[parser]) {
          blocks[parser] = parseMeta(parsers[parser], blocksContent[parser]);
        }
      }
      return aCallback(blocks);
    }
  }

  aCallback(null);
};

exports.storeScript = function (aUser, aMeta, aBuf, aCallback, aUpdate) {
  var s3 = new AWS.S3();
  var item = null;
  var scriptName = null;
  var installName = aUser.name + '/';
  var isLibrary = typeof aMeta === 'string';
  var libraries = [];
  var requires = null;
  var match = null;
  var collaboration = false;
  var rLibrary = new RegExp(
    '^(?:(?:(?:https?:)?\/\/' +
      (isPro ? 'openuserjs\.org' : 'localhost:8080') +
        ')?\/(?:libs\/src|src\/libs)\/)?(.*?)([^\/]*\.js)$', '');

  if (!aMeta) { return aCallback(null); }

  if (!isLibrary) {
    for (item in aMeta.UserScript.name) {
      if (!aMeta.UserScript.name[item].key) {
        scriptName = cleanFilename(aMeta.UserScript.name[item].value, '');
      }
    };

    // Can't install a script without a @name (maybe replace with random value)
    if (!scriptName) {
      return aCallback(null);
    }

    if (!isLibrary && aMeta.OpenUserJS && aMeta.OpenUserJS.author &&
      aMeta.OpenUserJS.author[0].value && aMeta.OpenUserJS.author[0].value != aUser.name &&
        aMeta.OpenUserJS.collaborator) {
      // Test to see if authorized collaborator

      aMeta.OpenUserJS.collaborator.forEach(function (aElement, aIndex, aArray) {
        if (!collaboration && aElement.value === aUser.name) {
          collaboration = true;
          installName = aMeta.OpenUserJS.author[0].value + '/';
        }
      });
    }

    installName += scriptName + '.user.js';

    if (aMeta.UserScript.require) {
      requires = aMeta.UserScript.require;

      requires.forEach(function (aRequire) {
        match = rLibrary.exec(aRequire.value);
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
  findDeadorAlive(Script, { installName: caseSensitive(installName) }, true,
    function (aAlive, aScript, aRemoved) {
      var scriptName = null;
      var item = null;

      if (aRemoved || (!aScript && (aUpdate || collaboration))) {
        return aCallback(null);
      } else if (!aScript) {
        for (item in aMeta.UserScript.name) {
          if (!aMeta.UserScript.name[item].key) {
            scriptName = aMeta.UserScript.name[item].value;
          }
        };

        // New script
        aScript = new Script({
          name: isLibrary ? aMeta : scriptName,
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
          // Test to see if a collaborator is attempting to change collaboration
          if (collaboration && (aScript.meta.OpenUserJS &&
            aScript.meta.OpenUserJS.author[0].value != aMeta.OpenUserJS.author[0].value ||
              (aScript.meta.OpenUserJS && JSON.stringify(aScript.meta.OpenUserJS.collaborator) !=
                JSON.stringify(aMeta.OpenUserJS.collaborator)))) {
            return aCallback(null);
          }
          aScript.meta = aMeta;
          aScript.uses = libraries;
        }
        aScript.updated = new Date();
        aScript.installsSinceUpdate = 0;
      }

      aScript.save(function (aErr, aScript) {
        // WARNING: No error handling

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
  Script.findOne({ installName: caseSensitive(aInstallName) },
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
    .test(aReq.connection.remoteAddress)) {
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
