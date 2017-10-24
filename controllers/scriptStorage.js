'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//

//--- Dependency inclusions
var fs = require('fs');
var util = require('util');
var _ = require('underscore');
var URL = require('url');
var crypto = require('crypto');
var stream = require('stream');
var peg = require('pegjs');
var AWS = require('aws-sdk');
var UglifyJS = require("uglify-es");
var rfc2047 = require('rfc2047');
var mediaType = require('media-type');
var mediaDB = require('mime-db');
var async = require('async');
var moment = require('moment');
var Base62 = require('base62');

var MongoClient = require('mongodb').MongoClient;
var ExpressBrute = require('express-brute');
var MongoStore = require('express-brute-mongo');

//--- Model inclusions
var Script = require('../models/script').Script;
var User = require('../models/user').User;
var Discussion = require('../models/discussion').Discussion;

//--- Controller inclusions

//--- Library inclusions
// var scriptStorageLib = require('../libs/scriptStorage');

var ensureIntegerOrNull = require('../libs/helpers').ensureIntegerOrNull;
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
    UserScript: peg.generate(fs.readFileSync('./public/pegjs/blockUserScript.pegjs', 'utf8'),
      { allowedStartRules: ['line'] }),
    OpenUserJS: peg.generate(fs.readFileSync('./public/pegjs/blockOpenUserJS.pegjs', 'utf8'),
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

// Get UglifyJS harmony installation datestamp once
var stats = fs.statSync('./node_modules/uglify-es/package.json');
var mtimeUglifyJS = new Date(util.inspect(stats.mtime));

// Brute initialization
var store = null;
if (isPro) {
  store = new MongoStore(function (ready) {
    MongoClient.connect('mongodb://127.0.0.1:27017/test', function(aErr, aDb) {
      if (aErr) {
        throw aErr;
      }
      ready(aDb.collection('bruteforce-store'));
    });
  });
} else {
  store = new ExpressBrute.MemoryStore(); // stores state locally, don't use this in production
}

var tooManyRequests = function (aReq, aRes, aNext, aNextValidRequestDate) {
  var secondUntilNextRequest = null;

  if (isDev) {
    secondUntilNextRequest = Math.ceil((aNextValidRequestDate.getTime() - Date.now())/1000);
    aRes.header('Retry-After', secondUntilNextRequest);
  }
  aRes.status(429).send(); // Too Many Requests
}

var sweetFactor = ensureIntegerOrNull(process.env.BRUTE_SWEETFACTOR) || (2);

var installMaxBruteforce = new ExpressBrute(store, {
  freeRetries: ensureIntegerOrNull(process.env.BRUTE_FREERETRIES) || (0),
  minWait: ensureIntegerOrNull(process.env.BRUTE_MINWAIT) || (1000 * 60), // sec
  maxWait: ensureIntegerOrNull(process.env.BRUTE_MAXWAIT) || (1000 * 60 * 15), // min
  lifetime: ensureIntegerOrNull(process.env.BRUTE_LIFETIME) || undefined, //
  failCallback: tooManyRequests
});

var sourceMaxBruteforce = new ExpressBrute(store, {
  freeRetries: ensureIntegerOrNull(process.env.BRUTE_FREERETRIES) || (0),
  minWait: ensureIntegerOrNull(process.env.BRUTE_MINWAIT / sweetFactor) ||
    ensureIntegerOrNull((1000 * 60) / sweetFactor), // sec
  maxWait: ensureIntegerOrNull(process.env.BRUTE_MAXWAIT / sweetFactor) ||
    ensureIntegerOrNull((1000 * 60 * 15) / sweetFactor), // min
  lifetime: ensureIntegerOrNull(process.env.BRUTE_LIFETIME) || undefined, //
  failCallback: tooManyRequests
});

// Enabled with meta requests
var installMinBruteforce = new ExpressBrute(store, {
  freeRetries: ensureIntegerOrNull(process.env.BRUTE_FREERETRIES) || (0),
  minWait: ensureIntegerOrNull(process.env.BRUTE_MINWAIT) || ensureIntegerOrNull(1000 * (60 / 4)), // sec
  maxWait: ensureIntegerOrNull(process.env.BRUTE_MAXWAIT) || ensureIntegerOrNull(1000 * (60 / 4)), // min
  lifetime: ensureIntegerOrNull(process.env.BRUTE_LIFETIME) || undefined, //
  failCallback: tooManyRequests
});

var sourceMinBruteforce = new ExpressBrute(store, {
  freeRetries: ensureIntegerOrNull(process.env.BRUTE_FREERETRIES) || (0),
  minWait: ensureIntegerOrNull(process.env.BRUTE_MINWAIT / sweetFactor) ||
    ensureIntegerOrNull((1000 * (60 / 4)) / sweetFactor), // sec
  maxWait: ensureIntegerOrNull(process.env.BRUTE_MAXWAIT / sweetFactor) ||
    ensureIntegerOrNull((1000 * (60 / 4) * 15) / sweetFactor), // min
  lifetime: ensureIntegerOrNull(process.env.BRUTE_LIFETIME) || undefined, //
  failCallback: tooManyRequests
});

//
function getInstallNameBase(aReq, aOptions) {
  //
  var base = null;

  var username = aReq.params.username;
  var scriptname = aReq.params.scriptname;

  var rKnownExtensions = /\.(min\.)?((user\.)?js|meta\.js(on)?)$/;

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
      installName: caseSensitive(installNameBase + (isLib ? '.js' : '.user.js'))

    }, function (aErr, aScript) {
      var s3Object = null;
      var s3 = new AWS.S3();

      if (aErr) {
        if (isDbg) {
          console.error(
            'Document lookup failure for',
              installNameBase + (isLib ? '.js' : '.user.js'),
                aErr.message
          );
        }

        aCallback(null);
        return;
      }

      if (!aScript) {
        if (isDbg) {
          console.warn(
            'Document not found for', installNameBase + (isLib ? '.js' : '.user.js')
          );
        }
        aCallback(null);
        return;
      }

      // Ensure casing on username is identical for S3 retrieval
      if (aReq.params.username !== aScript.author) {
        aReq.params.username = aScript.author;
        installNameBase = getInstallNameBase(aReq, { hasExtension: true });
      }

      s3Object = s3.getObject({
        Bucket: bucketName,
        Key: installNameBase + (isLib ? '.js' : '.user.js')

      }, function(aErr, aData) {
        var bufferStream = null;

        if (aErr) {
          console.error(
            'S3 GET (establishing) ',
              aErr.code,
                'for', installNameBase + (isLib ? '.js' : '.user.js') + '\n' +
                  JSON.stringify(aErr, null, ' ') + '\n' +
                    aErr.stack
          );

          // Abort
          aCallback(null);
          // fallthrough
        } else {
          bufferStream = new stream.PassThrough();

          bufferStream.end(new Buffer(aData.Body));

          // Get the script
          aCallback(aScript, bufferStream);

        }
      })
    });
};

var cacheableScript = function (aReq) {
  var pragma = aReq.get('pragma') || null;
  var cacheControl = aReq.get('cache-control') || null;

  if (pragma && pragma.indexOf('no-cache') !== -1 ||
    (cacheControl &&
      cacheControl.indexOf('no-cache') !== -1 &&
        cacheControl.indexOf('no-store') !== -1 &&
          cacheControl.indexOf('no-transform') !== -1)) {
  } else {
    return true;
  }

  return false; // Always ensure default is `false`
}

var keyScript = function (aReq, aRes, aNext) {
  let pathname = aReq._parsedUrl.pathname;
  let isLib = /^\/src\/libs\//.test(pathname);

  let installName = pathname.replace(/^\/(?:install|src\/(?:scripts|libs))\//, '');

  let parts = installName.split('/');
  let userName = parts[0].toLowerCase();
  let scriptName = parts[1];

  let rJS = /\.js$/;

  if (!isLib) {
    aNext(userName + '/' + scriptName.replace(/(\.min)?\.(?:user|meta)\.js$/, '.user.js'));
    return;
  } else if (rJS.test(scriptName)) {
    aNext(userName + '/' + scriptName.replace(/(\.min)?\.js$/, '.js'));
    return;
  }

  // No matches so force to end point
  aRes.status(400).send(); // Bad Request
}

exports.unlockScript = function (aReq, aRes, aNext) {
  let rMetaMinUserLibJS = /(?:\.(?:meta|(?:min\.)?user|min))?\.js$/;
  let pathname = aReq._parsedUrl.pathname;

  let acceptHeader = aReq.headers.accept || '*/*';
  let accepts = null;

  let wantsJustAnything = false;
  let hasUnacceptable = false;
  let hasAcceptable = false;

  let rMetaJS = /\.meta\.js$/;
  let wantsUserScriptMeta = null;

  let isSource = /^\/src\//.test(pathname);

  // Test known extensions
  if (!rMetaMinUserLibJS.test(pathname)) {
    aRes.status(400).send(); // Bad request
    return;
  }

  // Test accepts
  accepts = acceptHeader.split(',').map(function (aEl) {
    return aEl.trim();
  }).reverse();

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

        if (mediaTypeSubtypeSuffix === acceptable && mediaTypeSubtypeSuffix !== '*/*') {
          hasAcceptable = true;
        }

      }
    } else {
      hasUnacceptable = true;
      break;
    }
  }

  if (hasUnacceptable || (!wantsJustAnything && !hasAcceptable)) {
    aRes.status(406).send(); // Not Acceptable
    return;
  }

  // Determine if .meta.js is wanted
  wantsUserScriptMeta =
    (aReq.headers.accept || '*/*').split(',').indexOf('text/x-userscript-meta') > -1 ||
      rMetaJS.test(pathname);

  // Test cacheable
  if (isSource) {
    if (cacheableScript(aReq) && process.env.FORCE_SCRIPT_NOCACHE !== 'true') {
        aNext();
    } else {
      if (wantsUserScriptMeta) {
        sourceMinBruteforce.getMiddleware({key : keyScript})(aReq, aRes, aNext);
      } else {
        sourceMaxBruteforce.getMiddleware({key : keyScript})(aReq, aRes, aNext);
      }
    }
  } else {
    if (cacheableScript(aReq) && process.env.FORCE_SCRIPT_NOCACHE !== 'true') {
        aNext();
    } else {
      if (wantsUserScriptMeta) {
        installMinBruteforce.getMiddleware({key : keyScript})(aReq, aRes, aNext);
      } else {
        installMaxBruteforce.getMiddleware({key : keyScript})(aReq, aRes, aNext);
      }
    }
  }
}

exports.sendScript = function (aReq, aRes, aNext) {
  if (aReq.params.type === 'libs') {
    aReq.params.isLib = true;
  }

  let pathname = aReq._parsedUrl.pathname;
  let isLib = aReq.params.isLib || /^\/src\/libs\//.test(pathname);

  let rMetaJS = /\.meta\.js$/;

  if (!isLib &&
    ((aReq.headers.accept || '*/*').split(',').indexOf('text/x-userscript-meta') > -1 ||
      rMetaJS.test(pathname))) {

    exports.sendMeta(aReq, aRes, aNext);
    return;
  }

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

    var lastModified = null;
    var eTag = null;
    var maxAge = 7 * 60 * 60 * 24; // nth day(s) in seconds
    var now = null;
    var continuation = true;

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
          aRes.status(444).send(); // No Response
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
        aRes.status(444).send(); // No Response
        return;
      }
    }

    // HTTP/1.1 Caching
    aRes.set('Cache-Control', 'public, max-age=' + maxAge +
      ', no-cache, no-transform, must-revalidate');

    // Only minify for response that doesn't contain `.min.` extension
    if (!/\.min(\.user)?\.js$/.test(aReq._parsedUrl.pathname) ||
      process.env.DISABLE_SCRIPT_MINIFICATION === 'true') {
      //
      lastModified = moment(aScript.updated)
        .utc().format('ddd, DD MMM YYYY HH:mm:ss') + ' GMT';

      // Convert a based representation of the hex sha512sum
      eTag = '"'  + Base62.encode(parseInt('0x' + aScript.hash, 16)) + ' .user.js"';

      // If already client-side... HTTP/1.1 Caching
      if (aReq.get('if-none-match') === eTag || aReq.get('if-modified-since') === lastModified) {
        aRes.status(304).send(); // Not Modified
        return;
      }

      //
      aStream.on('error', function (aErr) {
        // This covers errors during connection in direct view
        console.error(
          'S3 GET (chunking native) ',
            aErr.code,
              'for', aScript.installName + '\n' +
                JSON.stringify(aErr, null, ' ') + '\n' +
                  aErr.stack
        );

        if (continuation) {
          continuation = false;

          // Abort
          aNext();
          // fallthrough
        }
      });

      aStream.on('data', function (aData) {
        if (continuation) {
          chunks.push(aData);
        }
      });

      aStream.on('end', function () {
        let source = null;

        if (continuation) {
          continuation = false;

          source = chunks.join(''); // NOTE: Watchpoint

          // Send the script
          aRes.set('Content-Type', 'text/javascript; charset=UTF-8');
          aStream.setEncoding('utf8');

          // HTTP/1.0 Caching
          aRes.set('Expires', moment(moment() + maxAge * 1000).utc()
            .format('ddd, DD MMM YYYY HH:mm:ss') + ' GMT');

          // HTTP/1.1 Caching
          aRes.set('Last-modified', lastModified);
          aRes.set('Etag', eTag);

          aRes.write(source);
          aRes.end();

          // NOTE: Try and force a GC
          source = null;
          chunks = null;

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
        }
      });

    } else { // Wants to try minified
      //
      lastModified = moment(mtimeUglifyJS > aScript.updated ? mtimeUglifyJS : aScript.updated)
        .utc().format('ddd, DD MMM YYYY HH:mm:ss') + ' GMT';

      // If already client-side... partial HTTP/1.1 Caching
      if (isPro && aReq.get('if-modified-since') === lastModified) {
        aRes.status(304).send(); // Not Modified
        return;
      }

      aStream.on('error', function (aErr) {
        // This covers errors during connection in direct view
        console.error(
          'S3 GET (chunking minified) ',
            aErr.code,
              'for', aScript.installName + '\n' +
                JSON.stringify(aErr, null, ' ') + '\n' +
                  aErr.stack
        );

        if (continuation) {
          continuation = false;

          // Abort
          aNext();
          // fallthrough
        }
      });

      aStream.on('data', function (aData) {
        if (continuation) {
          chunks.push(aData);
        }
      });

      aStream.on('end', function () {
        let source = null;
        let result = null;
        let msg = null;

        if (continuation) {
          continuation = false;

          source = chunks.join(''); // NOTE: Watchpoint
          msg = null;

          try {
            result = UglifyJS.minify(source, {
              parse: {
                bare_returns: true
              },
              compress: {
                inline: false
              },
              mangle: false,
              output: {
                comments: true,
                quote_style: 3
              }
            });

            if (result.error) {
              throw result.error; // Passthrough the error if present to our handler
            } else if(!result.code) {
              throw new TypeError('UglifyJS error of `code` being absent');
            } else {
              source = result.code;

              // Calculate a based representation of the hex sha512sum
              eTag = '"'  + Base62.encode(
                parseInt('0x' + crypto.createHash('sha512').update(source).digest('hex'), 16)) +
                  ' .min.user.js"';
            }
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

            // Reset to unminified last modified date stamp
            lastModified = moment(aScript.updated)
              .utc().format('ddd, DD MMM YYYY HH:mm:ss') + ' GMT';

            // Reset to convert a based representation of the hex sha512sum
            eTag = '"'  + Base62.encode(parseInt('0x' + aScript.hash, 16)) + ' .user.js"';
          }

          // If already client-side... partial HTTP/1.1 Caching
          if (aReq.get('if-none-match') === eTag) {

            // Conditionally send lastModified
            if (aReq.get('if-modified-since') !== lastModified) {
              aRes.set('Last-Modified', lastModified);
            }

            aRes.status(304).send(); // Not Modified
            return;
          }

          // Send the script
          aRes.set('Content-Type', 'text/javascript; charset=UTF-8');
          aStream.setEncoding('utf8');

          // HTTP/1.0 Caching
          aRes.set('Expires', moment(moment() + maxAge * 1000)
            .utc().format('ddd, DD MMM YYYY HH:mm:ss') + ' GMT');

          // HTTP/1.1 Caching
          aRes.set('Last-Modified', lastModified);
          aRes.set('Etag', eTag);

          aRes.write(source);
          aRes.end();

          // NOTE: Try and force a GC
          source = null;
          chunks = null;

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
        }
      });
    }
  });
};

// Send user script metadata block
exports.sendMeta = function (aReq, aRes, aNext) {
  function preRender() {
  }

  function render() {
    aRes.end(JSON.stringify(meta, null, isPro ? '' : ' '));
  }

  function asyncComplete(aErr) {
    if (aErr) {
      aRes.status(aErr.statusCode).send({status: aErr.statusCode, message: aErr.statusMessage});
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

      var eTag = null;
      var maxAge = 7 * 60 * 60 * 24; // nth day(s) in seconds

      if (!aScript) {
        aNext();
        return;
      }

      // HTTP/1.1 Caching
      aRes.set('Cache-Control', 'public, max-age=' + maxAge +
        ', no-cache, no-transform, must-revalidate');

      script = modelParser.parseScript(aScript);
      meta = script.meta; // NOTE: Watchpoint

      if (/\.json$/.test(aReq.params.scriptname)) {
        // Create a based representation of the hex sha512sum
        eTag = '"'  + Base62.encode(parseInt('0x' + aScript.hash, 16)) + ' .meta.json"';

        // If already client-side... HTTP/1.1 Caching
        if (aReq.get('if-none-match') === eTag) {
          aRes.status(304).send(); // Not Modified
          return;
        }

        // Okay to send .meta.json...
        aRes.set('Content-Type', 'application/json; charset=UTF-8');

        // HTTP/1.0 Caching
        aRes.set('Expires', moment(moment() + maxAge * 1000).utc()
          .format('ddd, DD MMM YYYY HH:mm:ss') + ' GMT');

        // HTTP/1.1 Caching
        aRes.set('Etag', eTag);

        // Check for existance of OUJS metadata block
        if (!meta.OpenUserJS) {
          meta.OpenUserJS = {};
        }

        // Overwrite any keys found with the following...
        meta.OpenUserJS.installs = [{ value: script.installs }];
        meta.OpenUserJS.issues =  [{ value: 'n/a' }];
        meta.OpenUserJS.hash = aScript.hash ? [{ value: aScript.hash }] : undefined;

        // Get the number of open issues
        scriptOpenIssueCountQuery = Discussion.find({ category: exports
          .caseSensitive(decodeURIComponent(script.issuesCategorySlug), true), open: {$ne: false} });

        tasks.push(countTask(scriptOpenIssueCountQuery, meta.OpenUserJS.issues[0], 'value'));

        async.parallel(tasks, asyncComplete);

      } else {
        // Create a based representation of the hex sha512sum
        eTag = '"'  + Base62.encode(parseInt('0x' + aScript.hash, 16)) + ' .meta.js"';

        // If already client-side... HTTP/1.1 Caching
        if (aReq.get('if-none-match') === eTag) {
          aRes.status(304).send(); // Not Modified
          return;
        }

        // Okay to send .meta.js...
        aRes.set('Content-Type', 'text/javascript; charset=UTF-8');

        // HTTP/1.0 Caching
        aRes.set('Expires', moment(moment() + maxAge * 1000).utc()
          .format('ddd, DD MMM YYYY HH:mm:ss') + ' GMT');

        // HTTP/1.1 Caching
        aRes.set('Etag', eTag);

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
          hash: crypto.createHash('sha512').update(aBuf).digest('hex'),
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

        // Okay to update
        aScript.hash = crypto.createHash('sha512').update(aBuf).digest('hex');

        aScript.updated = new Date();

        if (findMeta(script.meta, 'UserScript.version.0.value') !==
          findMeta(aMeta, 'UserScript.version.0.value')) {

          aScript.installsSinceUpdate = 0;
        }
      }

      // Attempt to write out data to externals...
      var s3 = new AWS.S3();
      s3.putObject({
        Bucket: bucketName,
        Key: installName,
        Body: aBuf

      }, function (aErr, aData) {
        if (aErr) {
          // Forward the error
          aScript.invalidate('_id', aErr);

          // Localize the error
          console.error(
            'S3 putObject critical error\n' +
              installName + '\n' +
                JSON.stringify(aErr, null, ' ') + '\n' +
                  aErr.stack
          );

          aCallback(null);
          return;
        }

        aScript.save(function (aErr, aScript) {
          var userDoc = null;

          // Localize the error
          if (aErr) {
            console.error(
              'MongoDB Script save critical error\n' +
                installName + '\n' +
                  JSON.stringify(aErr, null, ' ')
            );
            aCallback(null);
            return;
          }

          // Check for role change and modify accordingly
          if (aUser.role === 5) {
            if (!aUser.save) {
              // Probably using req.session.user which may have gotten serialized.
              userDoc = aUser;

              User.findById(aUser._id, function (aErr, aUser) {
                if (aErr) {
                  console.error('MongoDB User findById critical error\n' +
                    userDoc.name + ' was NOT role elevated from User to Author with err of:\n' +
                      JSON.stringify(aErr, null, ' ')
                  );
                  aCallback(aScript);
                  return;
                }

                aUser.role = 4;
                aUser.save(function (aErr, aUser) {
                  if (aErr) {
                    console.warn('MongoDB User save warning error\n' +
                      userDoc.name + ' was NOT role elevated from User to Author with err of:\n' +
                        JSON.stringify(aErr, null, ' ')
                    );
                    // fallthrough
                  }
                  aCallback(aScript);
                });
              });
            } else {
              aUser.role = 4;
              aUser.save(function (aErr, aUser) {
                if (aErr) {
                  console.warn('MongoDB User save warning error\n' +
                    userDoc.name + ' was NOT role elevated from User to Author with err of:\n' +
                      JSON.stringify(aErr, null, ' ')
                  );
                  // fallthrough
                }
                aCallback(aScript);
              });
            }
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

  // Return if script storage is in read-only mode
  if (process.env.READ_ONLY_SCRIPT_STORAGE === 'true') {
    aRes.status(423).send(); // Locked
    return;
  }

  // Test for known GH webhook ips: https://api.github.com/meta
  if (!aReq.body.payload ||
    !/192\.30\.25[2-5]\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])$/
      .test(aReq.connection.remoteAddress)) {
    aRes.status(401).send(); // Unauthorized: No challenge and silent iterations
    return;
  }

  payload = JSON.parse(aReq.body.payload);

  // Only accept commits to the master branch
  if (!payload || payload.ref !== 'refs/heads/master') {
    aRes.status(403).send(); // Forbidden
    return;
  }

  // Gather all the info for the RepoManager
  username = payload.repository.owner.name;
  reponame = payload.repository.name;

  repo = repos[reponame] = {};

  // Find the user that corresponds the repo owner
  User.findOne({ ghUsername: username }, function (aErr, aUser) {
    var repoManager = null;

    if (aErr) {
      aRes.status(500).send(); // Internal server error: Possibly 502 Bad gateway to DB or bad dep.
      return;
    }

    if (!aUser) {
      aRes.status(400).send(); // Bad request: Possibly 410 Gone from DB but not GH
      return;
    }

    aRes.end(); // Close connection

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
