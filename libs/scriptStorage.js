'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;
var statusError = require('../libs/debug').statusError;

//--- Library inclusions
var cleanFilename = require('../libs/helpers').cleanFilename;
var patternHasSameOrigin = require('../libs/helpers').patternHasSameOrigin;
var isFQUrl = require('../libs/helpers').isFQUrl;

//

// Determine validity of a Key
function invalidKey(aAuthorName, aScriptName, aIsLib, aKeyName, aKeyValue) {  // TODO: Simplify signature maybe
  var keyValue = null;
  var keyValueUtf = null;
  var matches = null;

  var rSameOrigin =  new RegExp(
    '^' + patternHasSameOrigin + '$'
  );
  var rAnyLocalMetaUrl = new RegExp(
    '^' + patternHasSameOrigin +
      '/(?:meta|install|src/scripts)/(.+?)/(.+?)\.(?:meta|user)\.js$'
  );
  var rIsolatedLocalMetaUrl = new RegExp(
    '^' + patternHasSameOrigin +
      '/(?:meta|install|src/scripts)/(.+?)/(.+?)\.(?:meta)\.js$'
  );

  var rIsolatedLocalInstallUrl = new RegExp(
    '^' + patternHasSameOrigin +
      '/(?:meta|install|src/scripts)/(.+?)/(.+)\.(?:user)\.js$'
  );

  var lockdown = process.env.FORCE_BUSY_UPDATEURL_CHECK === 'true';

  switch (aKeyName) {
    case 'css':
    case 'grant':
    case 'include':
    case 'inject-into':
    case 'match':
    case 'noframes':
    case 'priority':
    case 'require':
    case 'resource':
    case 'run-at':
    case 'unwrap':
    case 'downloadURL':
    case 'installURL':
      if (aIsLib) {
        if (aKeyValue) {
          return new statusError({
            message: '`@' + aKeyName +
              '` not valid in a Library.',
            code: 400 // Bad request
          });
        }
      }
      break;
    case 'updateURL':
      if (aIsLib) {

        if (aKeyValue) {
          return new statusError({
            message: '`@' + aKeyName +
              '` not valid in a Library.',
            code: 400 // Bad request
          });
        }
      } else {

        if (aKeyValue) {
          // Check for decoding error
          try {
            keyValueUtf = decodeURIComponent(aKeyValue);
          } catch (aE) {
            return new statusError({
              message: '`@' + aKeyName +
                '` has invalid encoding.',
              code: 400 // Bad request
            });
          }

          // Check for Fully Qualified URL
          if (!isFQUrl(aKeyValue)) {
            return new statusError({
              message: '`@' + aKeyName +
                '` is not a fully qualified URL.',
              code: 400 // Bad request
            });
          }

          // Validate `author` and `name` (installNameBase) to this scripts meta only
          // NOTE: value needs to be decoded already since MongoDB and AWS don't store that
          matches = keyValueUtf.match(rAnyLocalMetaUrl);
          if (matches) {
            if (cleanFilename(aAuthorName, '').toLowerCase() +
              '/' + cleanFilename(aScriptName, '') ===
                matches[1].toLowerCase() + '/' + matches[2]) {
              // Same script
              if (lockdown && !rIsolatedLocalMetaUrl.exec(keyValueUtf)) {
                return new statusError({
                  message: '`@' + aKeyName +
                    '` must be matched to this scripts .meta.js in lockdown.',
                  code: 403 // Forbidden
                });
              }
            } else if (lockdown) {
              return new statusError({
                message: '`@' + aKeyName +
                  '` must not be matched to another scripts .meta.js in lockdown.',
                code: 403 // Forbidden
              });
            }
          } else {
            keyValue = new URL(aKeyValue);
            if (!rSameOrigin.test(keyValue.origin)) {
              // Allow offsite checks
              // fallsthtrough
            } else {
              return new statusError({
                message: '`@' + aKeyName +
                  '` has an invalid value.',
                code: 400 // Bad request
              });
            }
          }
        } else if (lockdown) {
          return new statusError({
            message: '`@' + aKeyName +
              '` is required in lockdown.',
            code: 403 // Forbidden
          });
        }
      }
      break;
    default:
  }

  // Default
  return null;
}
exports.invalidKey = invalidKey;
