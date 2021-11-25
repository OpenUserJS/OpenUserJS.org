'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//--- Library inclusions
var cleanFilename = require('../libs/helpers').cleanFilename;
var patternHasSameOrigin = require('../libs/helpers').patternHasSameOrigin;
var isFQUrl = require('../libs/helpers').isFQUrl;

//

// Determine validity of a Key
function validKey(aAuthorName, aScriptName, aIsLib, aKeyName, aKeyValue) {
  var keyValue = null;
  var keyValueUtf = null;
  var matches = null;
  var rAnyLocalMetaUrl = new RegExp(
    '^' + patternHasSameOrigin +
      '/(?:meta|install|src/scripts)/(.+?)/(.+?)\.(?:meta|user)\.js$'
  );
  var rIsolatedLocalMetaUrl = new RegExp(
    '^' + patternHasSameOrigin +
      '/(?:meta|install|src/scripts)/(.+?)/(.+?)\.(?:meta)\.js$'
  );
  var rSameOrigin =  new RegExp(
    '^' + patternHasSameOrigin
  );

  var lockdown = process.env.FORCE_BUSY_UPDATEURL_CHECK === 'true';

  switch (aKeyName) {
    case 'updateURL':
      if (aIsLib) {
        if (aKeyValue) {
          return false;
        }
      } else {
        if (lockdown) {
          // `@updateURL` must be exact here for OUJS hosted checks and must exist
          //   e.g. no `search`, no `hash`, and no header check

          if (aKeyValue) {

            // Check for decoding error
            try {
              keyValueUtf = decodeURIComponent(aKeyValue);
            } catch (aE) {
              return false;
            }

            // Validate `author` and `name` (installNameBase) to this scripts meta only
            matches = keyValueUtf.match(rIsolatedLocalMetaUrl);
            if (matches) {
              if (cleanFilename(aAuthorName, '').toLowerCase() +
                '/' + cleanFilename(aScriptName, '') === matches[1].toLowerCase() +
                  '/' + matches[2])
              {
                // Same script
                // fallsthrough
              } else {
                return false;
              }
            } else {
              // Allow offsite checks

              if (!isFQUrl(aKeyValue)) {
                return false;
              }

              keyValue = new URL(aKeyValue);
              if (rSameOrigin.test(keyValue.origin)) {
                return false;
              }
            }
          } else {
            if (!aIsLib) {
              return false;
            }
          }
        } else {
          // Nominal tests

          if (aKeyValue) {
            if (!isFQUrl(aKeyValue)) {
              return false;
            }
          }
        }
      }

      break;
    default:
  }

  return true;
}
exports.validKey = validKey;
