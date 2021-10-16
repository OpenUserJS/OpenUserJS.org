'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;
var isSecured = require('../libs/debug').isSecured;
var uaOUJS = require('../libs/debug').uaOUJS;
var statusError = require('../libs/debug').statusError;

//

//--- Dependency inclusions
var fs = require('fs');
var util = require('util');
var http = require('http');
var _ = require('underscore');
var crypto = require('crypto');
var request = require('request');
var stream = require('stream');
var peg = require('pegjs');
var AWS = require('aws-sdk');
var S3rver = require('s3rver');
var Terser = require("terser");
var rfc2047 = require('rfc2047');
var mediaType = require('media-type');
var mediaDB = require('mime-db');
var async = require('async');
var moment = require('moment');
var SPDX = require('spdx-license-ids');
var sizeOf = require('image-size');
var ipRangeCheck = require("ip-range-check");
var colors = require('ansi-colors');

//--- Model inclusions
var Script = require('../models/script').Script;
var User = require('../models/user').User;
var Discussion = require('../models/discussion').Discussion;

//--- Controller inclusions

//--- Library inclusions
// var scriptStorageLib = require('../libs/scriptStorage');

var patternHasSameOrigin = require('../libs/helpers').patternHasSameOrigin;
var patternMaybeSameOrigin = require('../libs/helpers').patternMaybeSameOrigin;

var ensureIntegerOrNull = require('../libs/helpers').ensureIntegerOrNull;
var RepoManager = require('../libs/repoManager');

var cleanFilename = require('../libs/helpers').cleanFilename;
var findDeadorAlive = require('../libs/remove').findDeadorAlive;
var encode = require('../libs/helpers').encode;
var isFQUrl = require('../libs/helpers').isFQUrl;
var countTask = require('../libs/tasks').countTask;
var modelParser = require('../libs/modelParser');

//--- Configuration inclusions
var userRoles = require('../models/userRoles.json');
var blockSPDX = require('../libs/blockSPDX');
var exceptSPDX = require('../libs/exceptSPDX');
var settings = require('../models/settings.json');

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

// Allow some Chromium based browsers to test
if (!mediaDB['application/signed-exchange']) {
  mediaDB = _.extend(mediaDB, {
    'application/signed-exchange' : {
      source: 'google',
      extensions: []
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
    UserLibrary: peg.generate(fs.readFileSync('./public/pegjs/blockUserLibrary.pegjs', 'utf8'),
      { allowedStartRules: ['line'] }),
    OpenUserJS: peg.generate(fs.readFileSync('./public/pegjs/blockOpenUserJS.pegjs', 'utf8'),
      { allowedStartRules: ['line'] })
  };
})();
exports.parsers = parsers;

var bucketName = 'OpenUserJS.org';
if (isDev) {
  bucketName = bucketName.toLowerCase(); // NOTE: *S3rver* requirement
}

var DEV_AWS_URL = null;
var devAWSURL = null;
var serverS3 = null;

if (isPro) {
  AWS.config.update({
    region: 'us-east-1'
  });
} else {
  DEV_AWS_URL = process.env.DEV_AWS_URL || 'http://localhost:10001';
  AWS.config.update({
    accessKeyId: 'S3RVER',
    secretAccessKey: 'S3RVER',
    endpoint: DEV_AWS_URL,
    sslEnabled: false,
    s3ForcePathStyle: true
  });

  devAWSURL = new URL(DEV_AWS_URL);

  serverS3 = new S3rver({
    hostname: devAWSURL.hostname,
    port: devAWSURL.port,
    directory: './S3rver' // WATCHPOINT: Technically this should be `..` Is probably upstream issue
  }).run(function (aErr) {
    if (aErr) {
      console.error([
        colors.red('ERROR: S3rver not initialized'),
        aErr
      ].join('\n'));
      return;
    }
    console.log(colors.green('S3rver initialized'));

    var s3 = new AWS.S3();
    s3.createBucket({ Bucket: bucketName }, function (aErr) {
      if (aErr) {
        switch (aErr.statusCode) {
          case 409:
            console.log(colors.green('Default dev S3 bucket already exists'));
            break;
          default:
            console.error([
              colors.red('Error creating default dev S3 bucket'),
              aErr
            ].join('\n'));
            // fallthrough
        }
        return;
      } else {
        console.log(colors.green('Created default dev S3 bucket'));
      }
    });
  });
}

// Get Terser installation datestamp once
var stats = fs.statSync('./node_modules/terser/package.json');
var mtimeTerser = new Date(util.inspect(stats.mtime));

var githubHookAddresses = [];

if (isSecured) {
  request({
    url: 'https://api.github.com/meta',
    headers: {
      'User-Agent': uaOUJS + (process.env.UA_SECRET ? ' ' + process.env.UA_SECRET : '')
    }
  }, function (aErr, aRes, aBody) {
    var meta = null;

    if (aErr
      || aRes.statusCode !== 200
        || !/^application\/json;/.test(aRes.headers['content-type'])) {

      console.error([
        colors.red('Error retrieving GitHub `hooks`'),
        aRes.statusCode,
        aRes.headers['content-type'],
        aErr
      ].join('\n'));
      return;
    }

    try {
      meta = JSON.parse(aBody);
    } catch (aE) {
      console.error(colors.red('Error retrieving GitHub `hooks`', aE));
      return;
    }

    if (meta && meta.hooks && Array.isArray(meta.hooks)) {
      meta.hooks.forEach(function (aEl, aIdx, aArr) {
        if (typeof aEl === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(aEl)) {
          githubHookAddresses.push(aEl);
        } else {
          console.warn(
            colors.yellow('GitHub `hooks` element', aEl, 'does not match IPv4 CIDR specification')
          );
        }
      });
      if (githubHookAddresses.length > 0) {
        console.log(colors.green('Using GitHub `hooks` of'), githubHookAddresses);
      } else {
        console.error(colors.red('Error retrieving GitHub `hooks`... no compatible elements found'));
      }

    } else {
      console.error(colors.red('Error retrieving GitHub `hooks`'));
    }
  });
} else {
  console.warn(colors.yellow('Disabling GitHub `hooks` in unsecure mode'));
}

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

          bufferStream.end(Buffer.from(aData.Body));

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

  aNext();
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
    let rAnyLocalMetaUrl = new RegExp(
      '^' + patternHasSameOrigin +
        '/(?:meta|install|src/scripts)/(.+?)/(.+?)\.(?:meta|user)\.js$'
    );
    let hasAlternateLocalUpdateURL = false;

    let rSameOrigin =  new RegExp(
      '^' + patternHasSameOrigin
    );

    var lastModified = null;
    var eTag = null;
    var hashSRI = null;
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
          aRes.status(400).send(); // Bad request
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
          updateURL = new URL(updateURL);
          if (rSameOrigin.test(updateURL.origin)) {
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
        aRes.status(404).send(); // Not found
        return;
      }
    }

    hashSRI = aScript.hash
      ? 'sha512-' + Buffer.from(aScript.hash, 'hex').toString('base64')
      : 'undefined';

    // HTTP/1.1 Caching
    aRes.set('Cache-Control', 'public, max-age=' + maxAge +
      ', no-cache, no-transform, must-revalidate');

    // Only minify for response that doesn't contain `.min.` extension
    if (!/\.min(\.user)?\.js$/.test(aReq._parsedUrl.pathname) ||
      process.env.DISABLE_SCRIPT_MINIFICATION === 'true') {
      //
      lastModified = moment(aScript.updated)
        .utc().format('ddd, DD MMM YYYY HH:mm:ss') + ' GMT';

      // Use SRI of the stored sha512sum
      eTag = '"'  + hashSRI + ' .user.js"';

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
          if (aScript.isLib) {
            aRes.set('Access-Control-Allow-Origin', '*');
          }
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

          // Don't count installs from tagged XHR
          if (aReq.get('x-requested-with')) {
            return;
          }

          // Don't count installs on browser request in Fx
          if (aReq.get('accept') && aReq.get('accept').indexOf('text/html') > -1) { // NOTE: Watchpoint
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
      lastModified = moment(mtimeTerser > aScript.updated ? mtimeTerser : aScript.updated)
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
            result = Terser.minify(source, {
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
              throw new TypeError('Terser error of `code` being absent');
            } else {
              source = result.code;

              // Calculate SRI of the source sha512sum
              eTag = '"sha512-' +
                Buffer.from(
                  crypto.createHash('sha512').update(source).digest('base64')
                ) + ' .min.user.js"';

            }
          } catch (aE) { // On any failure default to unminified
            if (isDev) {
              console.warn([
                'MINIFICATION WARNING (harmony):',
                '  message: ' + aE.message,
                '  installName: ' + aScript.installName,
                '  line: ' + aE.line + ' col: ' + aE.col + ' pos: ' + aE.pos

              ].join('\n'));
            }

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

            // Reset SRI of the stored sha512sum
            eTag = '"'  + hashSRI + ' .user.js"';
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
            // WARNING: No err handling
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
      // WARNING: No err handling

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
        // Use SRI of the stored sha512sum
        eTag = '"'  + script.hashSRI + ' .meta.json"';

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
        meta.OpenUserJS.hash = script.hash ? [{ value: script.hashSRI }] : 'undefined';

        // Get the number of open issues
        scriptOpenIssueCountQuery = Discussion.find({ category: exports
          .caseSensitive(decodeURIComponent(script.issuesCategorySlug), true), open: {$ne: false} });

        tasks.push(countTask(scriptOpenIssueCountQuery, meta.OpenUserJS.issues[0], 'value'));

        async.parallel(tasks, asyncComplete);

      } else {
        // Use SRI of the stored sha512sum
        eTag = '"'  + script.hashSRI + ' .meta.js"';

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
  var CEVLines = {};
  var rLine = /\/\/ @(\S+)(?:\s+(.*))?/;
  var rCEVLine = /\/\/@/;
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

  CEVLines = aString.split(/[\r\n]+/).filter(function (aElement, aIndex, aArray) {
    return (aElement.match(rCEVLine));
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

  headers[':CVE'] = []; // NOTE: Important to prevent spoofing

  if (CEVLines.length > 0) {
    headers[':CVE'].push(
      {
        value: 'Comment only in Metadata Block may be parsed as a Key in certain non-standard UserScript engines.'
      }
    );
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
  var CVE = null;
  var CVES = [];

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
          if (parser !== 'OpenUserJS' && blocks[parser][':CVE']) {
            for (CVE in blocks[parser][':CVE']) {
              CVES.push(blocks[parser][':CVE'][CVE]);
            }
          }
          delete blocks[parser][':CVE']
        }
      }

      if (CVES.length > 0) {
        if (!blocks['OpenUserJS']) {
          blocks['OpenUserJS'] = {};
        }
        blocks['OpenUserJS'].CVE = CVES;
      }

      aCallback(blocks);
      return;
    }
  }

  aCallback(null);
};

function isEqualKeyset(aSlaveKeyset, aMasterKeyset) {
  var slaveKey = null;
  var masterKey = null;
  var i = null;

  if (aSlaveKeyset !== aMasterKeyset) {
    if (!aMasterKeyset || !aSlaveKeyset || aMasterKeyset.length !== aSlaveKeyset.length) {
      // No master block keyset or not mirrored exactly.
      return false;
    } else {
      for (i = 0; (slaveKey = aSlaveKeyset[i]) && (masterKey = aMasterKeyset[i]); i++) {
        if (slaveKey !== masterKey) {
          // Keyset must exist exactly positioned in both
          return false;
        }
      }
    }
  }

  return true;
}

exports.storeScript = function (aUser, aMeta, aBuf, aUpdate, aCallback) {
  var isLib = !!findMeta(aMeta, 'UserLibrary');
  var scriptName = null;
  var scriptDescription = null;
  var thisName = null;
  var thisDescription = null;

  async.series([
    function (aInnerCallback) {
      if (process.env.READ_ONLY_SCRIPT_STORAGE === 'true') {
        aInnerCallback(new statusError({
          message: 'Read only script storage. Please try again later.',
          code: 501 // Not Implemented
        }), null);
        return;
      }

      aInnerCallback(null);
    },
    function (aInnerCallback) {
      if (!aMeta) {
        aInnerCallback(new statusError({
          message: 'Metadata block(s) missing.',
          code: 400
        }), null);
        return;
      }

      aInnerCallback(null);
    },
    function (aInnerCallback) {
      // `@name` validations
      var name = null;
      var masterKeyset = null;
      var slaveKeyset = null;


      if (!isLib) {
        name = findMeta(aMeta, 'UserScript.name');
      } else {
        name = findMeta(aMeta, 'UserLibrary.name');
      }

      // Can't install a script without a @name (maybe replace with random value)
      if (!name) {
        aInnerCallback(new statusError({
          message: '`@name` missing.',
          code: 400
        }), null);
        return;
      }

      // Check for non-localized presence
      name.forEach(function (aElement, aIndex, aArray) {
        if (!name[aIndex].key) {
          thisName = aElement.value;
          scriptName = cleanFilename(thisName, '');
        }
      });

      if (!scriptName) {
        aInnerCallback(new statusError({
          message: '`@name` non-localized missing.',
          code: 400
        }), null);
        return;
      }

      if (scriptName.length > 128) {
        aInnerCallback(new statusError({
          message: '`@name` too long.',
          code: 400
        }), null);
        return;
      }

      // Can't install a script name ending in a reserved extension
      if (/\.(?:min|user|user\.js|meta)$/.test(scriptName)) {
        aInnerCallback(new statusError({
          message: '`@name` ends in a reserved extension.',
          code: 400
        }), null);
        return;
      }

      // `@name` validations including localizations
      masterKeyset = findMeta(aMeta, 'UserScript.name.value');
      slaveKeyset = findMeta(aMeta, 'UserLibrary.name.value');

      if (isLib && !isEqualKeyset(slaveKeyset, masterKeyset)) {
        // Keysets do not match exactly... reject
        aInnerCallback(new statusError({
          message: '`@name` must match in UserScript and UserLibrary metadata blocks.',
          code: 400
        }), null);
        return;
      }

      aInnerCallback(null);
    },
    function (aInnerCallback) {
      // `@description` validations
      var description = null;
      var masterKeyset = null;
      var slaveKeyset = null;

      if (!isLib) {
        description = findMeta(aMeta, 'UserScript.description');
      } else {
        description = findMeta(aMeta, 'UserLibrary.description');
      }

      // Check for non-localized presence
      if (description) {
        description.forEach(function (aElement, aIndex, aArray) {
          if (!description[aIndex].key) {
            thisDescription = aElement.value;
            scriptDescription = cleanFilename(thisDescription, '');
          }
        });
      }

      // `@description` validations including localizations
      masterKeyset = findMeta(aMeta, 'UserScript.description.value');
      slaveKeyset = findMeta(aMeta, 'UserLibrary.description.value');

      if (isLib && !isEqualKeyset(slaveKeyset, masterKeyset)) {
        // Keysets do not match exactly... reject
        aInnerCallback(new statusError({
          message: '`@description` must match in UserScript and UserLibrary metadata blocks.',
          code: 400
        }), null);
        return;
      }

      aInnerCallback(null);
    },
    function (aInnerCallback) {
      // `@copyright` validations
      var masterKeyset = null;
      var slaveKeyset = null;

      masterKeyset = findMeta(aMeta, 'UserScript.copyright.value');
      slaveKeyset = findMeta(aMeta, 'UserLibrary.copyright.value');

      if (isLib && !isEqualKeyset(slaveKeyset, masterKeyset)) {
        // Keysets do not match exactly... reject
        aInnerCallback(new statusError({
          message: '`@copyright` must match in UserScript and UserLibrary metadata blocks.',
          code: 400
        }), null);
        return;
      }

      aInnerCallback(null);
    },
    function (aInnerCallback) {
      // `@license` validations
      var thisKeyComponents = null;
      var thatSPDX = null;
      var userKeyset = null;
      var userKey = null;
      var masterKeyset = null;
      var slaveKeyset = null;
      var i = null;

      masterKeyset = findMeta(aMeta, 'UserScript.license.value');
      slaveKeyset = findMeta(aMeta, 'UserLibrary.license.value');

      if (isLib && !isEqualKeyset(slaveKeyset, masterKeyset)) {
        // Keysets do not match exactly... reject
        aInnerCallback(new statusError({
          message: '`@license` must match in UserScript and UserLibrary metadata blocks.',
          code: 400
        }), null);
        return;
      }

      if (!isLib) {
        userKeyset = masterKeyset;
      } else {
        userKeyset = slaveKeyset;
      }

      if (userKeyset) {
        thatSPDX = userKeyset[userKeyset.length - 1].split('; ')[0];
        if (SPDX.indexOf(thatSPDX) === -1 || blockSPDX.indexOf(thatSPDX) > -1) {
          // No valid OSI primary e.g. last key... reject
          aInnerCallback(new statusError({
            message: '`@license` is not OSI primary and compatible in the metadata block(s).',
            code: 400
          }), null);
          return;
        }

        for (i = 0; userKey = userKeyset[i++];) {
          thisKeyComponents = userKey.split('; ');
          if (thisKeyComponents.length > 2) {
            // Too many parts... reject
            aInnerCallback(new statusError({
              message: '`@license` has too many parts in the metadata block(s).',
              code: 400
            }), null);
            return;
          }

          if (thisKeyComponents.length === 2) {
            if (!isFQUrl(thisKeyComponents[1])) {

              // Not a web url... reject
              aInnerCallback(new statusError({
                message: '`@license` type component not a web url in the metadata block(s).',
                code: 400
              }), null);
              return;
            }
          }

          thatSPDX = thisKeyComponents[0];
          if (SPDX.indexOf(thatSPDX) === -1
            || (blockSPDX.indexOf(thatSPDX) > -1 && exceptSPDX.indexOf(thatSPDX) === -1)) {

            // Absent SPDX short code, or blocked SPDX with no except for dual licensed... reject
            aInnerCallback(new statusError({
              message: '`@license` has an incompatible SPDX in the metadata block(s).',
              code: 400
            }), null);
            return;
          }
        }
      } else {
        // No licensing... reject
        aInnerCallback(new statusError({
          message: '`@license` is absent in the metadata block(s).',
          code: 400
        }), null);
        return;
      }

      aInnerCallback(null);
    },
    function (aInnerCallback) {
      // `@version` validations
      var masterKeyset = null;
      var slaveKeyset = null;

      masterKeyset = findMeta(aMeta, 'UserScript.version.0.value');
      slaveKeyset = findMeta(aMeta, 'UserLibrary.version.0.value');

      if (isLib && !isEqualKeyset(slaveKeyset, masterKeyset)) {
        // Keysets do not match exactly... reject
        aInnerCallback(new statusError({
          message: '`@version` must match in UserScript and UserLibrary metadata blocks.',
          code: 400
        }), null);
        return;
      }

      aInnerCallback(null);
    },

    function (aInnerCallback) {
      // `@icon` validations
      var icon = null;
      var buffer = null;
      var fn = null;
      var dimensions = null;
      var matches = null;
      var data = null;
      var rDataURIbase64 = /^data:image\/.+;base64,(.*)$/;
      var req = null;
      var chunks = null;

      function acceptedImage(aDimensions) {
        var maxX = 256; //px
        var maxY = 256; //px

        switch (aDimensions.type) {
          case 'gif':
            // fallthrough
          case 'jpg':
            // fallthrough
          case 'jpeg':
            // fallthrough
          case 'png':
            // fallthrough
          case 'svg':
            // fallthrough
          case 'ico':
            if (dimensions.width <= maxX && dimensions.height <= maxY) {
              return true;
            }
        }
        return false;
      }

      icon = findMeta(aMeta, 'UserScript.icon.0.value');
      if (icon) {
        if (!isFQUrl(icon, { canDataImg: true })) {

          // Not a web url... reject
          aInnerCallback(new statusError({
            message: '`@icon` not a web url or image data URI in the UserScript metadata block.',
            code: 400
          }), null);
          return;
        }

        // Test dimensions
        if (/^data:/.test(icon)) {
          matches = icon.match(rDataURIbase64);
          if (matches) {
            data = matches[1];
            if (data <= 0) {
              aInnerCallback(new statusError({
                message: '`@icon` has no data',
                code: 400
              }));
              return;
            }

            buffer = Buffer.from(data, 'base64');
            try {
              dimensions = sizeOf(buffer);
            } catch (aE) {
              aInnerCallback(new statusError({
                message: '`@icon` ' + aE.message,
                code: aE.code
              }));
              return;
            }

            if (!dimensions || !acceptedImage(dimensions)) {
              aInnerCallback(new statusError({
                message: '`@icon` unsupported file type or dimensions are too large.',
                code: 400
              }), null);
            } else {
              aInnerCallback(null);
            }
          } else {
            aInnerCallback(new statusError({
              message: 'Invalid `@icon`',
              code: 400
            }), null);
          }
        } else {
          chunks = [];
          req = request.get({
            url: icon,
            headers: {
              'User-Agent': 'request' // NOTE: Anonymous intended
            }
          })
            .on('response', function (aRes) {
              // TODO: Probably going to be something here
            })
            .on('error', function (aErr) {
              if (aErr && aErr.code === 'ECONNRESET') {
                console.error('*request* ECONNRESET error with `@icon` validation at', icon);
                // fallsthrough
              } else {
                aInnerCallback(aErr);
              }
            })
            .on('data', function (aChunk) {
              var buf = null;

              chunks.push(aChunk);
              buf = Buffer.concat(chunks);
              if (buf.length > 3048) {
                req.abort();
              }
            })
            .on('end', function () {
              buffer = Buffer.concat(chunks);

              if (buffer.length <= 0) {
                aInnerCallback(new statusError({
                  message: '`@icon` has no data',
                  code: 400
                }));
                return;
              }

              try {
                dimensions = sizeOf(buffer);
              } catch (aE) {
                aInnerCallback(new statusError({
                  message: '`@icon` ' + aE.message,
                  code: aE.code
                }));
                return;
              }

              if (!dimensions || !acceptedImage(dimensions)) {
                aInnerCallback(new statusError({
                  message: '`@icon` unsupported file type or dimensions are too large.',
                  code: 400
                }), null);
              } else {
                aInnerCallback(null);
              }
            });
        }
      } else {
        aInnerCallback(null);
      }
    },
    function (aInnerCallback) {
      // `@supportURL` validations
      var supportURL = null;

      supportURL = findMeta(aMeta, 'UserScript.supportURL.0.value');
      if (supportURL) {
        if (!isFQUrl(supportURL, { canMailto: true })) {

          // Not a web url... reject
          aInnerCallback(new statusError({
            message: '`@supportURL` not a web url or mailto in the UserScript metadata block.',
            code: 400
          }), null);
          return;
        }
      }

      aInnerCallback(null);
    },
    function (aInnerCallback) {
      // `@contributionURL` validation
      var contributionURL = null;

      contributionURL = findMeta(aMeta, 'UserScript.contributionURL.0.value');
      if (contributionURL) {
        if (!isFQUrl(contributionURL, { isSecure: true })) {

          // Not a secure web url... reject
          aInnerCallback(new statusError({
            message: '`contributionURL` not a secure web url in the UserScript metadata block.',
            code: 400
          }), null);
          return;
        }

        // TODO: Pre-filter on abuse
      }

      aInnerCallback(null);
    },
    function (aInnerCallback) {
      // `@homepageURL` validations
      var homepageURLS = null;
      var homepageURL = null;
      var i = null;

      homepageURLS = findMeta(aMeta, 'UserScript.homepageURL.value');
      if (homepageURLS) {
        for (i = 0; homepageURL = homepageURLS[i++];) {
          if (!isFQUrl(homepageURL)) {

            // Not a web url... reject
            aInnerCallback(new statusError({
              message: '`@homepageURL` not a web url',
              code: 400
            }), null);
            return;
          }
        }
      }

      aInnerCallback(null);
    },
    function (aInnerCallback) {
      // `@updateURL` validations
      var updateURL = null;

      updateURL = findMeta(aMeta, 'UserScript.updateURL.0.value');
      if (updateURL) {
        if (!isFQUrl(updateURL)) {

          // Not a web url... reject
          aInnerCallback(new statusError({
            message: '`@updateURL` not a web url',
            code: 400
          }), null);
          return;
        }
      }

      aInnerCallback(null);
    },
    function (aInnerCallback) {
      // `@downloadURL` validations
      var downloadURL = null;
      var rSameOrigin =  new RegExp(
        '^' + patternHasSameOrigin
      );

      downloadURL = findMeta(aMeta, 'UserScript.downloadURL.0.value');
      if (downloadURL) {
        if (!isFQUrl(downloadURL)) {

          // Not a web url... reject
          aInnerCallback(new statusError({
            message: '`@downloadURL` not a web url',
            code: 400
          }), null);
          return;
        }

        downloadURL = new URL(downloadURL);

        // Shouldn't install a userscript with a downloadURL of non-Userscript-source
        if (rSameOrigin.test(downloadURL.origin) &&
          !/^\/(?:install|src\/scripts)\//.test(downloadURL.pathname))
        {
          aInnerCallback(new statusError({
            message: '`@downloadURL` not .user.js',
            code: 400
          }), null);
          return;
        }

        // Shouldn't install a userscript with a downloadURL of source .meta.js
        if (rSameOrigin.test(downloadURL.origin) &&
          /^\/(?:install|src\/scripts)\//.test(downloadURL.pathname) &&
            /\.meta\.js$/.test(downloadURL.pathname))
        {
          aInnerCallback(new statusError({
            message: '`@downloadURL` not .user.js',
            code: 400
          }), null);
          return;
        }
      }

      aInnerCallback(null);
    },
    function (aInnerCallback) {
      // `@exclude` validations
      var excludes = null;
      var missingExcludeAll = true;

      if (isLib) {
        excludes = findMeta(aMeta, 'UserScript.exclude.value');
        if (excludes) {
          excludes.forEach(function (aElement, aIndex, aArray) {
            if (aElement === '*') {
              missingExcludeAll = false;
            }
          });
        }

        if (missingExcludeAll) {
          aInnerCallback(new statusError({
            message: 'UserScript Metadata Block missing `@exclude *`.',
            code: 400
          }), null);
          return;
        }
      }

      aInnerCallback(null);
    },
    function (aInnerCallback) {
      // OpenUserJS `@author` validations
      var author = null;

      author = findMeta(aMeta, 'OpenUserJS.author.0.value');

      if (author) {
        User.findOne({
          name: author
        }, function (aErr, aUser) {
          if (aErr) {
            aInnerCallback(new statusError({
              message: 'DB error finding `@author` in OpenUserJS block',
              code: 500
            }), null);
            return;
          }

          if (!aUser) {
            aInnerCallback(new statusError({
              message: '`@author ' + author +
                '` in OpenUserJS block does not exist or is incorrectly cased.',
              code: 400
            }), null);
            return;
          }

          aInnerCallback(null);
        });
      } else {
        aInnerCallback(null);
      }
    },
    function (aOuterCallback) {
      // OpenUserJS block `@collaborator` validations
      var collaborators = null;

      collaborators = findMeta(aMeta, 'OpenUserJS.collaborator.value');
      if (collaborators) {
        async.eachSeries(collaborators, function (aCollaborator, aInnerCallback) {
          User.findOne({
            name: aCollaborator
          }, function (aErr, aUser) {
            if (aErr) {
              aOuterCallback(new statusError({
                message: 'DB error finding `@collaborator` ' +
                  aCollaborator + ' in OpenUserJS block',
                code: 500
              }), null);
              return;
            }

            if (!aUser) {
              aOuterCallback(new statusError({
                message: '`@collaborator ' + aCollaborator +
                  '` in OpenUserJS block does not exist or is incorrectly cased',
                code: 400
              }), null);
              return;
            }

            aInnerCallback();
          });
        }, aOuterCallback);
      } else {
        aOuterCallback(null);
      }
    }

  ], function (aErr, aResults) {
    var author = null;
    var collaborators = null;
    var installName = aUser.name + '/';
    var collaboration = false;
    var requires = null;
    var match = null;
    var rLibrary = new RegExp(
      '^' + patternMaybeSameOrigin +
        '/src/libs/(.*?)([^/]*\.js)$');
    var libraries = [];


    if (aErr) {
      aCallback(aErr, null);
      return;
    }

    // `@author` linkage for OpenUserJS block
    author = findMeta(aMeta, 'OpenUserJS.author.0.value');
    collaborators = findMeta(aMeta, 'OpenUserJS.collaborator.value');

    if (author !== aUser.name &&
      collaborators && collaborators.indexOf(aUser.name) > -1) {

      installName = author + '/';
      collaboration = true;
    }


    if (!isLib) {
      installName += scriptName + '.user.js';

      // `@require` linkage for UserScript block
      requires = findMeta(aMeta, 'UserScript.require.value');
      if (requires) {
        requires.forEach(function (aRequire) {
          var require = aRequire;
          var url = null;

          try {
            url = new URL(aRequire);
            require = url.origin +  url.pathname;
          } catch (aE) {
            // NOTE: Currently not always a real error in every .user.js engine so...
            /* falls through */
          }

          match = rLibrary.exec(require);
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
      installName += scriptName + '.js';
    }


    // Prevent a removed script from being reuploaded
    findDeadorAlive(Script, { installName: caseSensitive(installName) }, true,
      function (aAlive, aScript, aRemoved) {
        var script = null;
        var s3 = null;
        var now = null;

        if (aRemoved) {
          aCallback(new statusError({
            message: 'Script removed permanently.',
            code: 403
          }), null);
          return;
        } else if (!aScript && collaboration) {
          aCallback(new statusError({
            message: 'Collaboration restricted.',
            code: 403
          }), null);
          return;
        } else if (!aScript && aUpdate) {
          aCallback(new statusError({
            message: 'Updating but no script found.',
            code: 404
          }), null);
          return;
        } else if (!aScript) {
          // New script
          now = new Date();
          aScript = new Script({
            name: thisName,
            _description: (
              thisDescription
                ? thisDescription.substr(0, settings.scriptSearchQueryStoreMaxDescription).trim()
                : ''
            ),
            author: aUser.name,
            installs: 0,
            rating: 0,
            about: '',
            _about: '',
            created: now,
            updated: now,
            hash: crypto.createHash('sha512').update(aBuf).digest('hex'),
            votes: 0,
            flags: { critical: 0, absolute: 0 },
            installName: installName,
            fork: null,
            meta: aMeta,
            isLib: isLib,
            uses: isLib ? null : libraries,
            _authorId: aUser._id
          });
        } else {
          // WARNING: Work-around what appears to be like a race condition
          // Grab an early copy of the live *mongoose* script object to test against
          // This should provide more true values to test against and should alleviate a detected
          // security issue... unless if `toObject` is not present then it will probably fail
          script = aScript.toObject ? aScript.toObject({ virtuals: true }) : aScript;

          // Script already exists.
          if (collaboration &&
            (findMeta(script.meta, 'OpenUserJS.author.0.value') !==
              findMeta(aMeta, 'OpenUserJS.author.0.value') ||
                JSON.stringify(findMeta(script.meta, 'OpenUserJS.collaborator.value')) !==
                  JSON.stringify(collaborators))) {

            aCallback(new statusError({
              message: 'Forbidden with collaboration',
              code: 403
            }), null);
            return;
          }
          aScript._description = (
            thisDescription
              ? thisDescription.substr(0, settings.scriptSearchQueryStoreMaxDescription).trim()
              : ''
          );
          aScript.meta = aMeta;
          aScript.uses = libraries;

          // Okay to update
          aScript.hash = crypto.createHash('sha512').update(aBuf).digest('hex');

          // Check hash here against old and don't increment Script model date if same.
          // Allows sync reset for GH and resave/reset to S3 if needed
          // Covers issue with GitHub cache serving old raw
          if (script.hash !== aScript.hash) {
            aScript.updated = new Date();
          }

          if (findMeta(script.meta, 'UserScript.version.0.value') !==
            findMeta(aMeta, 'UserScript.version.0.value')) {

            aScript.installsSinceUpdate = 0;
          }
        }

        // Attempt to write out data to externals...
        s3 = new AWS.S3();
        if (s3) { // NOTE: Should be a noop
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

              aCallback(new statusError({
                message: 'Remote storage write error',
                code: 502
              }), null);
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
                aCallback(new statusError({
                  message: 'Database write error',
                  code: 502
                }), null);
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
                      aCallback(new statusError({
                        message: 'Database find error',
                        code: 502
                      }), aScript);
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
                      aCallback(null, aScript);
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
                    aCallback(null, aScript);
                  });
                }
              } else {
                aCallback(null, aScript);
              }
            });
          });
        } else {
          // NOTE: This shouldn't happen
          console.warn('S3 `new AWS.S3()` critical error');
          aCallback(new statusError({
            message: 'Storage critical error',
            code: 500
          }), null);
          return;
        }
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

      // WARNING: No err handling

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
  var update = null;

  // Return if script storage is in read-only mode
  if (process.env.READ_ONLY_SCRIPT_STORAGE === 'true') {
    aRes.status(423).send(); // Locked
    return;
  }

  // Test for known GH webhook IPs: https://api.github.com/meta
  // NOTE: Maintaining IPv4 CIDR as IPv4-mapped IPv6 addresses are
  //   automatically converted back to IPv4 with current dependency
  //   IPv6 address for caller will return `false` from dep in this
  //   configuration
  if (githubHookAddresses.length < 1) {
    aRes.status(502).send(); // Bad gateway
    return;
  }

  if (!ipRangeCheck(aReq.connection.remoteAddress, githubHookAddresses)) {
    aRes.status(401).send(); // Unauthorized: No challenge and silent iterations
    return;
  }

  // If media type is not corectly set up in GH webhook then reject
   // NOTE: Keep in sync with newScriptPage.html view
  if (!aReq.is('application/x-www-form-urlencoded')) {
    aRes.status(415).send(); // Unsupported media type
    return;
  }

  if (!aReq.body.payload) {
    aRes.status(502).send(); // Bad gateway
    return;
  }

  payload = JSON.parse(aReq.body.payload);
  if (!payload) {
    aRes.status(400).send(); // Bad request
    return;
  }

  switch (aReq.get('X-GitHub-Event')) {
    case 'ping':
      // Initial setup of the webhook checks... informational
      if (!payload.hook && !payload.hook.events) {
        aRes.status(502).send(); // Bad gateway e.g. something catastrophic to look into
          return;
      }

      if (payload.hook.events.length !== 1 || payload.hook.events.indexOf('push') !== 0) {
        aRes.status(413).send(); // Payload (events) too large
          return;
      }

      aRes.status(200).send(); // Send acknowledgement for GH history
        return;
      break;
    case 'push':
      // Pushing a change
      update = aReq.get('X-GitHub-Delivery');
      break;
    default:
      aRes.status(400).send(); // Bad request
        return;
  }

  //

  // Only accept commits from the default branch
  defaultBranch = `ref/heads/${payload.repository.default_branch}`
  if (!(payload.ref === defaultBranch || payload.ref === 'refs/heads/master')) {
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

    if (!aUser.consented) {
      aRes.status(451).send(); // Reject until consented
      return;
    }

    if (aUser.strategies.indexOf('github') <= -1) { // Don't rely on just `ghUsername`!
      aRes.status(403).send(); // Reject due to lack of GitHub as Auth
      return;
    }

    aRes.status(202).send(); // Close connection with Accepted but processing

    // Gather the modified user scripts
    payload.commits.forEach(function (aCommit) {
      aCommit.modified.forEach(function (aFilename) {
        if (aFilename.substr(-3) === '.js' && aFilename.substr(-8) !== '.meta.js') {
          repo[aFilename] = '/' + encodeURI(aFilename); // NOTE: Watchpoint
        }
      });
    });

    // Update modified scripts
    repoManager = RepoManager.getManager(null, aUser, repos);

    repoManager.loadSyncs(update, function (aErr) {
      if (aErr) {
        // These currently should be server side errors so always log
        console.error(update, aErr);
        return;
      }

      repoManager.loadScripts(update, function (aErr) {

        var code = null;
        if (aErr) {
          // Some errors could be user generated or dep generated user error,
          //   usually ignore those since handled with Sync model and visible
          //     to end user. We shouldn't be sending non-numeric codes.
          code = (aErr instanceof statusError ? aErr.status.code : aErr.code);
          if (code && !isNaN(code) && code >= 500) {
            console.error(update, aErr);
          }
        }
      });
    });

  });
};
