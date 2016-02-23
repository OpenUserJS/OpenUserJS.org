'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//

//--- Dependency inclusions
var async = require('async');
var formidable = require('formidable');

//--- Model inclusions
var Flag = require('../models/flag').Flag;
var User = require('../models/user').User;
var Script = require('../models/script').Script;

//--- Controller inclusions
var scriptStorage = require('./scriptStorage');

//--- Library inclusions
var flagLib = require('../libs/flag');

var statusCodePage = require('../libs/templateHelpers').statusCodePage;

//--- Configuration inclusions

//---

// Controller to flag and unflag content
exports.flag = function (aReq, aRes, aNext) {
  var form = null;

  // Check to make sure multipart form data submission header is present
  if (!/multipart\/form-data/.test(aReq.headers['content-type'])) {
    statusCodePage(aReq, aRes, aNext, {
      statusCode: 400,
      statusMessage: 'Missing required header.'
    });
    return;
  }

  form = new formidable.IncomingForm();
  form.parse(aReq, function (aErr, aFields) {
    var flag = aFields.flag === 'false' ? false : true;
    var reason = null;

    var type = aReq.params[0];
    var isLib = null;

    var installNameBase = null;
    var username = null;

    var authedUser = aReq.session.user;

    if (flag) {
      reason = aFields.reason;

      // Check to make sure form submission has this name available.
      // This occurs either when no reason is supplied,
      // or a rare edge case if the view is missing the input name.
      if (!reason) {
        statusCodePage(aReq, aRes, aNext, {
          statusCode: 403,
          statusMessage: 'Missing reason for removal.'
        });
        return;
      }

      // Simple error check for string null and limit to max characters
      reason = reason.trim();
      if (reason === '' || reason.length > 300) {
        statusCodePage(aReq, aRes, aNext, {
          statusCode: 403,
          statusMessage: 'Invalid reason for removal.'
        });
        return;
      }
    }

    switch (type) {
      case 'libs':
        isLib = true;
        // fallthrough
      case 'scripts':
        aReq.params.username = aReq.params[2];
        aReq.params.scriptname = aReq.params[3]

        installNameBase = scriptStorage.getInstallNameBase(aReq);

        Script.findOne({
          installName: scriptStorage.caseSensitive(installNameBase +
            (isLib ? '.js' : '.user.js'))
          },
          function (aErr, aScript) {
            var fn = flagLib[flag ? 'flag' : 'unflag'];

            if (aErr || !aScript) {
              aNext();
              return;
            }

            fn(Script, aScript, authedUser, reason, function (aFlagged) {
              aRes.redirect((isLib ? '/libs/' : '/scripts/') + scriptStorage.getInstallNameBase(
                aReq, { encoding: 'uri' }));
            });

        });
        break;
      case 'users':
        username = aReq.params[1];

        User.findOne({ name: { $regex: new RegExp('^' + username + '$', "i") } },
          function (aErr, aUser) {
            var fn = flagLib[flag ? 'flag' : 'unflag'];

            if (aErr || !aUser) {
              aNext();
              return;
            }

            fn(User, aUser, authedUser, reason, function (aFlagged) {
              aRes.redirect('/users/' + encodeURIComponent(username));
            });

          });

        break;
      default:
        aNext();
        return;
    }
  });
}

exports.getFlaggedListForContent = function (aModelName, aOptions, aCallback) {

  var content = aModelName.toLowerCase();
  var contentList = aOptions[content + 'List'] || [aOptions[content]];

  async.forEachOf(contentList, function (aContent, aContentKey, aEachOuterCallback) {

    // NOTE: Directly use indexed parent identifier allowing set of the dynamic, virtual, field
    //       So basically do not use `aContent` anywhere in this function

    // Always ensure a snapshot copy!
    if (contentList[aContentKey].toObject) {
      contentList[aContentKey] = contentList[aContentKey].toObject({
        virtuals: true
      });
    }

    // Ensure reset
    contentList[aContentKey].flaggedList = [];

    // Find any flags
    Flag.find({
      model: aModelName,
      _contentId: contentList[aContentKey]._id

    }, function (aErr, aFlagList) {
      if (aErr || !aFlagList || aFlagList.length === 0) {
        aEachOuterCallback();
        return;
      }

      aOptions.hasFlagged = true;

      async.forEachOfSeries(aFlagList, function (aFlag, aFlagKey, aEachInnerCallback) {
        User.findOne({ _id: aFlag._userId }, function (aErr, aUser) {
          if (aErr || !aUser) {
            // Notify in stdout
            console.warn('getFlaggedListForContent(): `_userId` not found for Flag:\n', aFlag);

            // Ignore for now and move onto the next flag
            aEachInnerCallback();
            return;
          }

          contentList[aContentKey].flaggedList.push({
            name: aUser.name,
            reason: aFlagList[aFlagKey].reason,
            since: aFlagList[aFlagKey]._since
          });
          aEachInnerCallback();
        });
      }, aEachOuterCallback);
    });

  }, aCallback);
}
