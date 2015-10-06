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
var RepoManager = require('../libs/repoManager');

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

var DEV_AWS_URL = null;

if (isPro) {
  AWS.config.update({
    region: 'us-east-1'
  });
} else {
  // You need to install (and ruby too): https://github.com/jubos/fake-s3
  // Then run the fakes3.sh script or: fakes3 -r fakeS3 -p 10001
  DEV_AWS_URL = process.env.DEV_AWS_URL || 'http://localhost:10001';
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
  return new RegExp('^' + aInstallName.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1") + '$', 'i');
}
exports.caseInsensitive = caseInsensitive;

function caseSensitive(aInstallName, aMoreThanInstallName) {

  var rMatchExpression = aMoreThanInstallName ? /^(.*)\/(.*)\/(.*)\/(.*)$/ : /^(.*)\/(.*)$/;
  var char = null;
  var username = '';
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
  var installName = getInstallName(aReq);
  Script.findOne({ installName: caseSensitive(installName) },
    function (aErr, aScript) {
      var s3Object = null;
      var s3 = new AWS.S3();

      // WARNING: Partial error handling at this stage

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

    if (!aScript) {
      return aNext();
    }

    // Send the script
    aRes.set('Content-Type', 'text/javascript; charset=UTF-8');

    // Disable *express-minify* for this response
    aRes._skip = true;

    aStream.pipe(aRes);

    // Don't count installs on raw source route
    if (aScript.isLib || aReq.params.type) {
      return;
    }

    // Update the install count
    ++aScript.installs;
    ++aScript.installsSinceUpdate;

    // Resave affected properties
    aScript.save(function (aErr, aScript) {
      // WARNING: No error handling at this stage
    });
  });
};

// Send user script metadata block
exports.sendMeta = function (aReq, aRes, aNext) {
  var installName = getInstallName(aReq).replace(/\.meta\.(?:js|json)$/, '.user.js');

  Script.findOne({ installName: caseSensitive(installName) },
    function (aErr, aScript) {
      var meta = null;
      var whitespace = '\u0020\u0020\u0020\u0020';

      if (!aScript) {
        return aNext();
      }

      meta = aScript.meta; // NOTE: Watchpoint

      if (/\.json$/.test(aReq.params.scriptname)) {
        aRes.set('Content-Type', 'application/json; charset=UTF-8');

        aRes.end(JSON.stringify(meta, null, ''));
      } else {
        aRes.set('Content-Type', 'text/javascript; charset=UTF-8');

        // Disable *express-minify* for this response
        aRes._skip = true;

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
      }
    });
};

function findMeta(aMeta, aQuery) {
  var header = aMeta;
  var headers = null;

  aQuery.split('.').forEach(function (aElement, aIndex, aArray) {
    if (header && header[aElement] !== undefined ) {
      header = header[aElement];
    } else if (header && Array.isArray(header)) {
      headers = [];
      header.forEach(function(aElement2, aIndex2, aArray2) {
        if (headers && header[aIndex2][aElement] !== undefined) {
          headers.push(header[aIndex2][aElement]);
        } else {
          headers = null;
        }
      });
      header = headers;
    } else {
      header = null;
    }
  });

  return header;
}
exports.findMeta = findMeta;

// Parse a specific metadata block content with a specified *pegjs* parser
function parseMeta(aParser, aString) {
  var lines = {};
  var rLine = /\/\/ @(\S+)(?:\s+(.*))?/;
  var line = null;
  var header = null;
  var key = null;
  var keyword = null;
  var name = null;
  var unique = null;
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

exports.getMeta = function (aBufs, aCallback) {
  // We need to convert the array of buffers to a string to
  // parse the blocks. But strings are memory inefficient compared
  // to buffers so we only convert the least number of chunks to
  // get the metadata blocks.
  var i = 0;
  var len = 0;
  var str = null;
  var parser = null;
  var rHeaderContent = null;
  var headerContent = null;
  var hasUserScriptHeaderContent = false;
  var blocksContent = {};
  var blocks = {};

  for (; i < aBufs.length; ++i) {
    // Convert the current Buffer to a `String` and accumulate it's `String` totalLength
    len += aBufs[i].toString('utf8').length; // NOTE: Watchpoint

    // Read from the start of the Buffers to the `String` length end-point
    // See also #678
    str = Buffer.concat(aBufs, len).toString('utf8');

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
  var isLibrary = typeof aMeta === 'string';
  var name = null;
  var thisName = null;
  var scriptName = null;
  var author = null;
  var collaborators = null;
  var installName = aUser.name + '/';
  var collaboration = false;
  var requires = null;
  var match = null;
  var rLibrary = new RegExp(
    '^(?:(?:(?:https?:)?\/\/' +
      (isPro ? 'openuserjs\.org' : 'localhost:8080') +
        ')?\/(?:libs\/src|src\/libs)\/)?(.*?)([^\/]*\.js)$', '');
  var libraries = [];


  if (!aMeta || process.env.READ_ONLY_SCRIPT_STORAGE === 'true') {
    return aCallback(null);
  }

  if (!isLibrary) {
    name = findMeta(aMeta, 'UserScript.name');

    // Can't install a script without a @name (maybe replace with random value)
    if (!name) {
      return aCallback(null);
    }

    name.forEach(function (aElement, aIndex, aArray) {
      if (!name[aIndex].key) {
        thisName = aElement.value;
        scriptName = cleanFilename(thisName, '');
      }
    });

    // Can't install a script without a cleaned @name (maybe replace with random value)
    if (!scriptName) {
      return aCallback(null);
    }

    author = findMeta(aMeta, 'OpenUserJS.author.0.value');
    collaborators = findMeta(aMeta, 'OpenUserJS.collaborator.value');

    if (!isLibrary && author !== aUser.name &&
      collaborators && collaborators.indexOf(aUser.name) > -1) {

      installName = author + '/';
      collaboration = true;
    }

    installName += scriptName + '.user.js';

    requires = findMeta(aMeta, 'UserScript.require.value');
    if (requires) {
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
    if (!scriptName) {
      return aCallback(null);
    }

    installName += scriptName + '.js';
  }

  // Prevent a removed script from being reuploaded
  findDeadorAlive(Script, { installName: caseSensitive(installName) }, true,
    function (aAlive, aScript, aRemoved) {
      var script = null;

      if (aRemoved || (!aScript && (aUpdate || collaboration))) {
        return aCallback(null);
      } else if (!aScript) {
        // New script
        aScript = new Script({
          name: isLibrary ? aMeta : thisName,
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
        // WARNING: Work-around what appears to be like a race condition
        // Grab an early copy of the live *mongoose* script object to test against
        // This should provide more true values to test against and should alleviate a detected
        // security issue... unless if `toObject` is not present then it will probably fail
        script = aScript.toObject ? aScript.toObject({ virtuals: true }) : aScript;

        // Script already exists.
        if (!aScript.isLib) {
          if (collaboration &&
            (findMeta(script.meta, 'OpenUserJS.author.0.value') !==
              findMeta(aMeta, 'OpenUserJS.author.0.value') ||
                JSON.stringify(findMeta(script.meta, 'OpenUserJS.collaborator.value')) !==
                  JSON.stringify(collaborators))) {

            return aCallback(null);
          }
          aScript.meta = aMeta;
          aScript.uses = libraries;
        }
        aScript.updated = new Date();
        if (findMeta(script.meta, 'UserScript.version.0.value') !==
          findMeta(aMeta, 'UserScript.version.0.value')) {

          aScript.installsSinceUpdate = 0;
        }
      }

      aScript.save(function (aErr, aScript) {
        var s3 = new AWS.S3();

        // WARNING: No error handling at this stage

        s3.putObject({ Bucket: bucketName, Key: installName, Body: aBuf },
          function (aErr, aData) {
            var userDoc = null;

            // Don't save a script if storing failed
            if (aErr) {
              console.error(aUser.name, '-', installName);
              console.error(JSON.stringify(aErr));
              console.error(JSON.stringify(aScript.toObject()));
              return aCallback(null);
            }

            if (aUser.role === userRoles.length - 1) {
              userDoc = aUser;
              if (!userDoc.save) {
                // We're probably using req.session.user which may have gotten serialized.
                userDoc = new User(userDoc);
              }
              --userDoc.role;
              userDoc.save(function (aErr, aUser) {
                aCallback(aScript);
              });
            } else {
              aCallback(aScript);
            }
          });
      });
    });
};

exports.deleteScript = function (aInstallName, aCallback) {
  // Return if script storage is in read-only mode
  if (process.env.READ_ONLY_SCRIPT_STORAGE === 'true') {
    aCallback(null);
    return;
  }

  Script.findOne({ installName: caseSensitive(aInstallName) },
    function (aErr, aScript) {
      var s3 = new AWS.S3();

      // WARNING: No error handling at this stage

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
  var payload = null;
  var username = null;
  var reponame = null;
  var repos = {};
  var repo = null;

  aRes.end(); // Close connection

  // Return if script storage is in read-only mode
  if (process.env.READ_ONLY_SCRIPT_STORAGE === 'true') {
    return;
  }

  // Test for known GH webhook ips: https://api.github.com/meta
  if (!aReq.body.payload ||
    !/192\.30\.25[2-5]\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])$/
      .test(aReq.connection.remoteAddress)) {
    return;
  }

  payload = JSON.parse(aReq.body.payload);

  // Only accept commits to the master branch
  if (!payload || payload.ref !== 'refs/heads/master') {
    return;
  }

  // Gather all the info for the RepoManager
  username = payload.repository.owner.name;
  reponame = payload.repository.name;

  repo = repos[reponame] = {};

  // Find the user that corresponds the repo owner
  User.findOne({ ghUsername: username }, function (aErr, aUser) {
    var repoManager = null;

    // WARNING: Partial error handling at this stage

    if (!aUser) {
      return;
    }

    // Gather the modified user scripts
    payload.commits.forEach(function (aCommit) {
      aCommit.modified.forEach(function (aFilename) {
        if (aFilename.substr(-8) === '.user.js') {
          repo[aFilename] = '/' + encodeURI(aFilename);
        }
      });
    });

    // Update modified scripts
    repoManager = RepoManager.getManager(null, aUser, repos);
    repoManager.loadScripts(function () {
    }, true);
  });
};
