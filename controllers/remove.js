'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//

//--- Dependency inclusions
var formidable = require('formidable');

//--- Model inclusions
var Script = require('../models/script').Script;
var User = require('../models/user').User;

//--- Controller inclusions
var scriptStorage = require('./scriptStorage');

//--- Library inclusions
var removeLib = require('../libs/remove');

var destroySessions = require('../libs/modifySessions').destroy;
var statusCodePage = require('../libs/templateHelpers').statusCodePage;

//--- Configuration inclusions

//---

// Simple controller to remove content and save it in the graveyard
exports.rm = function (aReq, aRes, aNext) {
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
    var reason = aFields.reason;

    var type = aReq.params[0];
    var isLib = null;

    var installNameBase = null;
    var username = null;

    var authedUser = aReq.session.user;

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

    // Simple error check for string null
    reason = reason.trim();
    if (reason === '') {
      statusCodePage(aReq, aRes, aNext, {
        statusCode: 403,
        statusMessage: 'Invalid reason for removal.'
      });
      return;
    }

    switch (type) {
      case 'libs':
        isLib = true;
        // fallthrough
      case 'scripts':
        aReq.params.username = username = aReq.params[2];
        aReq.params.scriptname = aReq.params[3]

        installNameBase = scriptStorage.getInstallNameBase(aReq);

        Script.findOne({
          installName: scriptStorage.caseSensitive(installNameBase +
            (isLib ? '.js' : '.user.js'))
          }, function (aErr, aScript) {
            removeLib.remove(Script, aScript, authedUser, reason, function (aRemoved) {
              if (!aRemoved) {
                aNext();
                return;
              }
              aRes.redirect('/users/' + encodeURIComponent(username) + '/scripts');
            });
          });
        break;
      case 'users':
        username = aReq.params[1];

        User.findOne({ name: { $regex: new RegExp('^' + username + '$', "i") } },
          function (aErr, aUser) {
            removeLib.remove(User, aUser, authedUser, reason, function (aRemoved) {
              if (!aRemoved) {
                aNext();
                return;
              }

              // Destroy all the sessions belonging to the removed user
              destroySessions(aReq, aUser, function () {
                aRes.redirect('/users');
              });
            });
          });
        break;
      default:
        aNext();
    }
  });
};
