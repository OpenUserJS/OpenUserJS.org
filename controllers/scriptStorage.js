'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//

//--- Dependency inclusions
var fs = require('fs');
var _ = require('underscore');
var URL = require('url');
var PEG = require('pegjs');
var AWS = require('aws-sdk');
var UglifyJS = require("uglify-js-harmony");
var rfc2047 = require('rfc2047');
var mediaType = require('media-type');
var mediaDB = require('mime-db');
var async = require('async');

//--- Model inclusions
var Script = require('../models/script').Script;
var User = require('../models/user').User;
var Discussion = require('../models/discussion').Discussion;

//--- Controller inclusions

//--- Library inclusions
// var scriptStorageLib = require('../libs/scriptStorage');

var RepoManager = require('../libs/repoManager');

var cleanFilename = require('../libs/helpers').cleanFilename;
var findDeadorAlive = require('../libs/remove').findDeadorAlive;
var encode = require('../libs/helpers').encode;
var countTask = require('../libs/tasks').countTask;
var modelParser = require('../libs/modelParser');

//--- Configuration inclusions
var userRoles = require('../models/userRoles.json');

// Add greasemonkey support for Media Type
if (!mediaDB['text/x-userscript-meta']) {
  mediaDB = _.extend(mediaDB, {
    'text/x-userscript-meta' : {
      source: 'greasemonkey',
      compressible: true,
      extensions: ['meta.js']
    }
  });
}

if (!mediaDB['text/x-userscript']) {
  mediaDB = _.extend(mediaDB, {
    'text/x-userscript' : {
      source: 'greasemonkey_peer',
      compressible: true,
      extensions: ['user.js']
    }
  });
}

// Allow Microsoft Edge browsers to test
if (!mediaDB['image/jxr']) {
  mediaDB = _.extend(mediaDB, {
    'image/jxr' : {
      source: 'iana_psmtr',
      extensions: ['jxr']
    }
  });
}


if (!mediaDB['*/*']) {
  mediaDB = _.extend(mediaDB, {'*/*' : { source: 'iana'}});
}

//---

// Load in the pegjs configuration files synchronously to detect immediate change errors.
// NOTE: These aren't JSON so not included in configuration inclusions but nearby
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

function getInstallNameBase(aReq, aOptions) {
  //
  var base = null;

  var username = aReq.params.username;
  var scriptname = aReq.params.scriptname;

  var rKnownExtensions = /\.((min\.)?(user\.)?js|meta\.js(on)?)$/;

  if (!aOptions) {
    aOptions = {};
  }

  if (aOptions.hasExtension) {
    scriptname = scriptname.replace(rKnownExtensions, '');
  }

  switch (aOptions.encoding) {
    case 'uri':
      base = encodeURIComponent(username) + '/' + encodeURIComponent(scriptname);
      break;

    case 'url':
      base = encode(username) + '/' + encode(scriptname);

    default:
      base = username + '/' + scriptname;
  }


  return base;
}
exports.getInstallNameBase = getInstallNameBase;

function caseInsensitive(aInstallName) {
  return new RegExp('^' + aInstallName.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1") + '$', 'i');
}
exports.caseInsensitive = caseInsensitive;

function caseSensitive(aInstallName, aMoreThanInstallName) {
  //
  var rMatchExpression = aMoreThanInstallName ? /^(.*)\/(.*)\/(.*)\/(.*)$/ : /^(.*)\/(.*)$/;
  var matches = aInstallName.match(rMatchExpression);

  var char = null;
  var username = '';
  var rExpression = null;

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
  var installNameBase = getInstallNameBase(aReq, { hasExtension: true });
  var isLib = aReq.params.isLib;

  Script.findOne({
      installName: caseSensitive(installNameBase +
        (isLib ? '.js' : '.user.js'))
    }, function (aErr, aScript) {
      var s3Object = null;
      var s3 = new AWS.S3();

      // WARNING: Partial error handling at this stage

      if (!aScript) {
        aCallback(null);
        if (isDbg) {
          console.warn('no script found yet' );
        }
        return;
      }

      s3Object = s3.getObject({ Bucket: bucketName, Key: installNameBase + (isLib ? '.js' : '.user.js') }).createReadStream().
        on('error', function () {
          // TODO: #486
          if (isDbg) {
            console.error('S3 Key Not Found ' + installNameBase + (isLib ? '.js' : '.user.js'));
          }

          aCallback(null);
          return;
        });

      // Get the script
      aCallback(aScript, s3Object);
    });
};

exports.keyScript = function (aReq, aRes, aNext) {
  let pathname = aReq._parsedUrl.pathname;
  let isLib = /^\/src\/libs\//.test(pathname);

  let installName = pathname.replace(/^\/(?:install|src\/(?:scripts|libs))\//, '');

  let rUserJS = /\.user\.js$/;
  let rMetaJS = /\.meta\.js$/;
  let rUserMetaMinJS = /\.(?:min\.)?(?:user|meta)\.js$/;
  let rJS = /\.js$/;

  let acceptHeader = aReq.headers.accept || '*/*';
  let accepts = null;

  let wantsJustAnything = false;
  let wantsUserScriptMeta = false;
  let wantsUserscript = false;
  let hasUnacceptable = false;
  let hasAcceptable = false;

  let parts = installName.split('/');
  let userName = parts[0].toLowerCase();
  let scriptName = parts[1];

  if (!isLib) {
    if (scriptName.replace(rUserMetaMinJS, '')) {

      accepts = acceptHeader.split(',').map(function (aEl) {
        return aEl.trim();
      }).reverse();

      // NOTE: Lazy find
      if (rUserJS.test(scriptName)) {
        for (let accept of accepts) {

          let media = mediaType.fromString(accept);
          if (media.isValid()) {

            // Check for unacceptables
            let mediaTypeSubtypeSuffix = media.type + '/' + media.subtype + (media.hasSuffix() ? '+' + media.suffix : '');

            if (!mediaDB[mediaTypeSubtypeSuffix]) {
              if (isDev) {
                console.warn('- unacceptable := ', mediaTypeSubtypeSuffix);
              }
              hasUnacceptable = true;
              break;
            }

            // Check for just anything
            if (mediaTypeSubtypeSuffix === '*/*' && accepts.length === 1) {
              wantsJustAnything = true;
              break;
            }

            // Check for acceptables
            for (let acceptable of
              [
                'text/x-userscript-meta',
                'text/x-userscript',

                'text/javascript',
                'text/ecmascript',
                'application/javascript',
                'application/x-javascript',

                'text/html',
                'application/xhtml+xml',

                '*/*'
              ]
            ) {

              if (mediaTypeSubtypeSuffix === acceptable) {
                if (mediaTypeSubtypeSuffix === 'text/x-userscript-meta') {
                  wantsUserScriptMeta = true;
                }

                if (mediaTypeSubtypeSuffix === 'text/x-userscript') {
                  wantsUserscript = true;
                }

                if (mediaTypeSubtypeSuffix !== '*/*') {
                  hasAcceptable = true;
                }
              }

            }
          } else {
            hasUnacceptable = true;
            break;
          }
        }

        // Test accepts
        if (hasUnacceptable) {
          aRes.status(406).send();
          return;
        }

        if (wantsUserScriptMeta) {
          exports.sendMeta(aReq, aRes, aNext);
          return;
        }

        if (!wantsJustAnything && !hasAcceptable) {
          aRes.status(406).send();
          return;
        }

        aNext(userName + '/' + scriptName.replace(/(\.min)?\.user\.js/, '.user.js'));
        return;

      } else if (rMetaJS.test(scriptName)) {
        if (!/\.min\.meta\.js$/.test(scriptName)) {
          exports.sendMeta(aReq, aRes, aNext);
          return;
        }
      }

    }
  } else if (rJS.test(scriptName)) {
    if (scriptName.replace(rJS, '')) {
      aNext(userName + '/' + scriptName.replace(/(\.min)?\.js/, '.js'));
      return;
    }
  }

  // No matches so return a bad request
  aRes.status(400).send();
}

exports.sendScript = function (aReq, aRes, aNext) {
  if (aReq.params.type === 'libs') {
    aReq.params.isLib = true;
  }

  let pathname = aReq._parsedUrl.pathname;
  let isLib = aReq.params.isLib || /^\/src\/libs\//.test(pathname);

  exports.getSource(aReq, function (aScript, aStream) {
    let chunks = [];
    let updateURL = null;
    let updateUtf = null;

    let matches = null;
    let rAnyLocalMetaUrl = new RegExp('^https?://(?:openuserjs\.org|oujs\.org' +
      (isDev ? '|localhost:' + (process.env.PORT || 8080) : '') +
        ')/(?:meta|install|src/scripts)/(.+?)/(.+?)\.meta\.js$');
    let hasAlternateLocalUpdateURL = false;

    let rAnyLocalHost =  new RegExp('^(?:openuserjs\.org|oujs\.org' +
      (isDev ? '|localhost:' + (process.env.PORT || 8080) : '') + ')');

    if (!aScript) {
      aNext();
      return;
    }

    if (process.env.FORCE_BUSY_UPDATEURL_CHECK === 'true') {
      // `@updateURL` must be exact here for OUJS hosted checks
      //   e.g. no `search`, no `hash`

      updateURL = findMeta(aScript.meta, 'UserScript.updateURL.0.value');
      if (updateURL) {

        // Check for decoding error
        try {
          updateUtf = decodeURIComponent(updateURL);
        } catch (aE) {
          aRes.set('Warning', '199 ' + aReq.headers.host +
            rfc2047.encode(' Invalid @updateURL'));
          aRes.status(444).send();
          return;
        }

        // Validate `author` and `name` (installNameBase) to this scripts meta only
        let matches = updateUtf.match(rAnyLocalMetaUrl);
        if (matches) {
          if (cleanFilename(aScript.author, '').toLowerCase() +
            '/' + cleanFilename(aScript.name, '') === matches[1].toLowerCase() + '/' + matches[2])
          {
            // Same script
          } else {
            hasAlternateLocalUpdateURL = true;
          }
        } else {
          // Allow offsite checks
          updateURL = URL.parse(updateURL);
          if (rAnyLocalHost.test(updateURL.host)) {
            hasAlternateLocalUpdateURL = true;
          }
        }
      } else {
        if (!aScript.isLib) {
          // Don't serve the script anywhere in this mode and if absent
          hasAlternateLocalUpdateURL = true;
        }
      }

      if (hasAlternateLocalUpdateURL) {
        aRes.set('Warning', '199 ' + aReq.headers.host +
          rfc2047.encode(' Invalid @updateURL in lockdown'));
        aRes.status(444).send();
        return;
      }
    }

    // Send the script
    aRes.set('Content-Type', 'text/javascript; charset=UTF-8');
    aStream.setEncoding('utf8');

    // Only minify for response that doesn't contain `.min.` extension
    if (!/\.min(\.user)?\.js$/.test(aReq._parsedUrl.pathname) ||
      process.env.DISABLE_SCRIPT_MINIFICATION === 'true') {
      //
      aStream.on('data', function (aData) {
        chunks.push(aData);
      });

      aStream.on('end', function () {
        let source = chunks.join(''); // NOTE: Watchpoint

        aRes.write(source);
        aRes.end();

        // NOTE: Try and force a GC
        source = null;
        chunks = null;
      });

    } else {
      // Otherwise set some defaults per script request via *UglifyJS2*
      // and try minifying output

      aStream.on('data', function (aData) {
        chunks.push(aData);
      });

      aStream.on('end', function () {
        let source = chunks.join(''); // NOTE: Watchpoint
        let msg = null;

        try {
          source = UglifyJS.minify(source, {
            fromString: true,
            mangle: false,
            output: {
              comments: true
            },
            parse: {
              bare_returns: true
            }
          }).code;

        } catch (aE) { // On any failure default to unminified
          console.warn([
            'MINIFICATION WARNING (harmony):',
            '  message: ' + aE.message,
            '  installName: ' + aScript.installName,
            '  line: ' + aE.line + ' col: ' + aE.col + ' pos: ' + aE.pos

          ].join('\n'));

          // Set up a `Warning` header with Q encoding under RFC2047
          msg = [
            '199 ' + aReq.headers.host + ' MINIFICATION WARNING (harmony):',
            '  ' + rfc2047.encode(aE.message.replace(/\xAB/g, '`').replace(/\xBB/g, '`')),
            '  line: ' + aE.line + ' col: ' + aE.col + ' pos: ' + aE.pos,

          ].join('\u0020'); // TODO: Watchpoint... *express*/*node* exception thrown with CRLF SPACE spec


          aRes.set('Warning', msg);
        }

        aRes.write(source);
        aRes.end();

        // NOTE: Try and force a GC
        source = null;
        chunks = null;
      });
    }

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
  function preRender() {
  }

  function render() {
    aRes.set('Content-Type', 'application/json; charset=UTF-8');

    aRes.end(JSON.stringify(meta, null, isPro ? '' : ' '));
  }

  function asyncComplete(aErr) {
    if (aErr) {
      statusCodePage(aReq, aRes, aNext, {
        statusCode: aErr.statusCode,
        statusMessage: aErr.statusMessage
      });
      return;
    }

    preRender();
    render();
  }

  var installNameBase = getInstallNameBase(aReq, { hasExtension: true });
  var meta = null;

  Script.findOne({ installName: caseSensitive(installNameBase + '.user.js') },
    function (aErr, aScript) {
      var script = null;
      var scriptOpenIssueCountQuery = null;
      var whitespace = '\u0020\u0020\u0020\u0020';
      var tasks = [];

      if (!aScript) {
        aNext();
        return;
      }

      script = modelParser.parseScript(aScript);
      meta = script.meta; // NOTE: Watchpoint

      if (/\.json$/.test(aReq.params.scriptname)) {

        // Check for existance of OUJS metadata block
        if (!meta.OpenUserJS) {
          meta.OpenUserJS = {};
        }

        // Overwrite any keys found with `installs` and `issues`
        meta.OpenUserJS.installs = [{ value: script.installs }];
        meta.OpenUserJS.issues =  [{ value: 'n/a' }];

        // Get the number of open issues
        scriptOpenIssueCountQuery = Discussion.find({ category: exports
          .caseSensitive(decodeURIComponent(script.issuesCategorySlug), true), open: {$ne: false} });

        tasks.push(countTask(scriptOpenIssueCountQuery, meta.OpenUserJS.issues[0], 'value'));

        async.parallel(tasks, asyncComplete);

      } else {
        aRes.set('Content-Type', 'text/javascript; charset=UTF-8');

        aRes.write('// ==UserScript==\n');

        if (meta.UserScript.version) {
          aRes.write('// @version' + whitespace + meta.UserScript.version[0].value + '\n');
        }

        Object.keys(meta.UserScript.name).forEach(function (aName) {
          var key = meta.UserScript.name[aName].key || 'name';
          var value = meta.UserScript.name[aName].value;

          aRes.write('// @' + key + whitespace + value + '\n');
        });

        if (meta.UserScript.namespace) {
          aRes.write('// @namespace' + whitespace + meta.UserScript.namespace[0].value + '\n');
        }

        aRes.write('// ==/UserScript==\n');

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
    // Accumulate the indexed Buffer length to use with `totalLength` parameter
    len += aBufs[i].length;

    // Read from the start of the Buffers to the Buffers length end-point
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
      aCallback(blocks);
      return;
    }
  }

  aCallback(null);
};

exports.storeScript = function (aUser, aMeta, aBuf, aCallback, aUpdate) {
  var isLibrary = typeof aMeta === 'string';
  var name = null;
  var thisName = null;
  var scriptName = null;
  var rAnyLocalHost =  new RegExp('^(?:openuserjs\.org|oujs\.org' +
    (isDev ? '|localhost:' + (process.env.PORT || 8080) : '') + ')');
  var downloadURL = null;
  var author = null;
  var collaborators = null;
  var installName = aUser.name + '/';
  var collaboration = false;
  var requires = null;
  var match = null;
  var rLibrary = new RegExp(
    '^(?:(?:(?:https?:)?\/\/' +
      (isPro ? 'openuserjs\.org' : 'localhost:' + (process.env.PORT || 8080)) +
        ')?\/(?:libs\/src|src\/libs)\/)?(.*?)([^\/]*\.js)$', '');
  var libraries = [];


  if (!aMeta || process.env.READ_ONLY_SCRIPT_STORAGE === 'true') {
    aCallback(null);
    return;
  }

  if (!isLibrary) {
    name = findMeta(aMeta, 'UserScript.name');

    // Can't install a script without a @name (maybe replace with random value)
    if (!name) {
      aCallback(null);
      return;
    }

    name.forEach(function (aElement, aIndex, aArray) {
      if (!name[aIndex].key) {
        thisName = aElement.value;
        scriptName = cleanFilename(thisName, '');
      }
    });

    // Can't install a script without a cleaned @name (maybe replace with random value)
    if (!scriptName) {
      aCallback(null);
      return;
    }

    // Can't install a userscript name ending in a reserved extension
    if (/\.(?:min|user|user\.js|meta)$/.test(scriptName)) {
      aCallback(null);
      return;
    }


    // `downloadURL` validations
    downloadURL = findMeta(aMeta, 'UserScript.downloadURL.0.value');

    if (downloadURL) {
      downloadURL = URL.parse(downloadURL);

      // Shouldn't install a userscript with a downloadURL of non-Userscript-source
      if (rAnyLocalHost.test(downloadURL.host) &&
        !/^\/(?:install|src\/scripts)\//.test(downloadURL.pathname))
      {
        aCallback(null);
        return;
      }

      // Shouldn't install a userscript with a downloadURL of source .meta.js
      if (rAnyLocalHost.test(downloadURL.host) &&
        /^\/(?:install|src\/scripts)\//.test(downloadURL.pathname) &&
          /\.meta\.js$/.test(downloadURL.pathname))
      {
        aCallback(null);
        return;
      }
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
            libraries.push(match[1] + match[2].replace(/\.min\.js$/, '.js'));
          }
        }
      });
    }
  } else {
    scriptName = cleanFilename(aMeta.trim(), '');
    if (!scriptName) {
      aCallback(null);
      return;
    }

    // Can't reference a library name ending in a reserved extension
    if (/\.(min|user|user\.js|meta)$/.test(scriptName)) {
      aCallback(null);
      return;
    }

    installName += scriptName + '.js';
  }

  // Prevent a removed script from being reuploaded
  findDeadorAlive(Script, { installName: caseSensitive(installName) }, true,
    function (aAlive, aScript, aRemoved) {
      var script = null;

      if (aRemoved || (!aScript && (aUpdate || collaboration))) {
        aCallback(null);
        return;
      } else if (!aScript) {
        // New script
        aScript = new Script({
          name: isLibrary ? aMeta.trim() : thisName,
          author: aUser.name,
          installs: 0,
          rating: 0,
          about: '',
          updated: new Date(),
          votes: 0,
          flags: { critical: 0, absolute: 0 },
          installName: installName,
          fork: null,
          meta: isLibrary ? { name: aMeta.trim() } : aMeta,
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

            aCallback(null);
            return;
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
              console.error(JSON.stringify(aErr, null, ' '));
              console.error(JSON.stringify(
                aScript.toObject ? aScript.toObject({ virtuals: true }) : aScript, null, ' ')
              );
              aCallback(null);
              return;
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
          repo[aFilename] = '/' + encodeURI(aFilename); // NOTE: Watchpoint
        }
      });
    });

    // Update modified scripts
    repoManager = RepoManager.getManager(null, aUser, repos);
    repoManager.loadScripts(function () {
    }, true);
  });
};
