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

  var missingExcludeAll = true;

  var lockdown = process.env.FORCE_BUSY_UPDATEURL_CHECK === 'true';

  var hasInvalidKeys = [];
  var hasGrantNone = null;

  switch (aKeyName) {
    case 'css':         // NOTE: We don't collect these yet (ref lost)
    case 'inject-into': // NOTE: We don't collect this yet
    case 'priority':    // NOTE: We don't collect this yet
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
    case 'downloadURL':
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
    case 'exclude':
      if (aIsLib) {
        if (aKeyValue) {
          if (aKeyValue.length > 1) {
            return new statusError({
              message: '`@' + aKeyName +
                '` must only have one key value in a Library.',
              code: 400
            });
          }

          aKeyValue.forEach(function (aElement, aIndex, aArray) {
            if (aElement === '*') {
              missingExcludeAll = false;
            }
          });
        }

        if (missingExcludeAll) {
          return new statusError({
            message: '`@' + aKeyName +
              '` missing value of `*` in a Library.',
            code: 400
          });
        }
      }
      break;
    case 'grant':
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
          aKeyValue.forEach(function (aElement, aIndex, aArray) {
            switch (aElement) {
              case 'none':
                hasGrantNone = true;
                // fallsthrough
              case 'GM.*':
              case 'GM_addElement':
              case 'GM_addStyle':
              case 'GM_addValueChangeListener':
              case 'GM_deleteValue':
              case 'GM.deleteValue':
              case 'GM_download':
              case 'GM_getResourceText':
              case 'GM_getResourceURL':
              case 'GM.getResourceUrl':
              case 'GM_getTab':
              case 'GM_getTabs':
              case 'GM_getValue':
              case 'GM.getValue':
              case 'GM_listValues':
              case 'GM.listValues':
              case 'GM_log':
              case 'GM_notification':
              case 'GM.notification':
              case 'GM_openInTab':
              case 'GM.openInTab':
              case 'GM_registerMenuCommand':
              case 'GM.registerMenuCommand':
              case 'GM_removeValueChangeListener':
              case 'GM_saveTab':
              case 'GM_setClipboard':
              case 'GM.setClipboard':
              case 'GM_setValue':
              case 'GM.setValue':
              case 'GM_unregisterMenuCommand':
              case 'GM_xmlhttpRequest':
              case 'GM.xmlHttpRequest':
              case 'unsafeWindow':
              case 'window.close':
              case 'window.focus':
              case 'window.onurlchange':
                if (hasGrantNone && aArray.length > 1) {
                  hasInvalidKeys.push(
                    new statusError({
                      message: '`@' + aKeyName +
                        '` value of `' + aElement + '` is not valid with other `@grant`s.',
                      code: 400 // Bad request
                    })
                  );
                }
                break;
              default:
                hasInvalidKeys.push(
                  new statusError({
                    message: '`@' + aKeyName +
                      '` with value of `' + aElement + '` is not valid or supported.',
                    code: 400 // Bad request
                  })
                );
            }
          });

          if (hasInvalidKeys.length > 0) {
            // NOTE: return only first error since header limitations may throw if RFC2047'd
            // TODO: May expand this later
            return hasInvalidKeys[0];
          }
        }
      }
      break;
    case 'include':
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
    case 'match':
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
    case 'noframes':
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
    case 'require':
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
    case 'resource':
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
    case 'run-at':
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
    case 'unwrap':
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
          // NOTE: value needs to be decoded already since MongoDB and AWS doesn't store that
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
              // fallsthrough
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
