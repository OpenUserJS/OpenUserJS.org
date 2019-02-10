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

//--- Controller inclusions
var scriptStorage = require('./scriptStorage');


//--- Library inclusions
var voteLib = require('../libs/vote');

var modelParser = require('../libs/modelParser');

var statusCodePage = require('../libs/templateHelpers').statusCodePage;

//--- Configuration inclusions

//---

// Controller for Script voting
exports.vote = function (aReq, aRes, aNext) {
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
    // WARNING: No err handling

    var vote = aFields.vote;
    var unvote = false;

    var type = aReq.params[0];
    var isLib = null;

    var installNameBase = null;
    var authedUser = aReq.session.user;

    switch (vote) {
      case 'up':
        // fallthrough
      case 'down':
        // fallthrough
      case 'un':
        break;
      default:
        statusCodePage(aReq, aRes, aNext, {
          statusCode: 400,
          statusMessage: 'Missing required field value.'
        });
        return;
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
          }, function (aErr, aScript) {
            var fn = voteLib[vote + 'vote'];

            // ---
            if (aErr || !aScript) {
              aRes.redirect((isLib ? '/libs/' : '/scripts/') + scriptStorage.getInstallNameBase(
                aReq, { encoding: 'uri' }));
              return;
            }

            fn(aScript, authedUser, function (aErr) {
              var script = null;

              if (vote === 'down') {
                script = modelParser.parseScript(aScript);

                // Gently encourage browsing/creating an issue with a down vote
                aRes.redirect(script.scriptIssuesPageUri);

              } else {
                aRes.redirect((isLib ? '/libs/' : '/scripts/') + scriptStorage.getInstallNameBase(
                  aReq, { encoding: 'uri' }));
              }
            });

        });

        break;
      default:
        aNext();
        return;
    }
  });
};
