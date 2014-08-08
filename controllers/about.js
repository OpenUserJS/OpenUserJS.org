'use strict';

var fs = require('fs');
var async = require('async');
var renderMd = require('../libs/markdown').renderMd;
var statusCodePage = require('../libs/templateHelpers').statusCodePage;
var pageMetadata = require('../libs/templateHelpers').pageMetadata;

var modelParser = require('../libs/modelParser');


exports.tosPage = function (aReq, aRes, aNext) {
  //
  var authedUser = aReq.session.user;
  var options = {};
  var tasks = [];

  //---
  function preRender() {};
  function render() { aRes.render('pages/docPage', options); }
  function asyncComplete(err) { if (err) { return aNext(); } else { preRender(); render(); } };

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  //--- Tasks

  fs.readFile('TOS.md', 'UTF8', function (aErr, aData) {
    if (aErr) {
      return statusCodePage(aReq, aRes, aNext, {
        statusCode: 404,
        statusMessage: 'Page not found.'
      });
    }

    // Page metadata
    pageMetadata(options, 'Terms of Service');

    options.pageHeading = 'Terms of Service';
    options.pageData = renderMd(aData);

    async.parallel(tasks, asyncComplete);
  });
};

exports.dmcaPage = function (aReq, aRes, aNext) {
  //
  var authedUser = aReq.session.user;
  var options = {};
  var tasks = [];

  //---
  function preRender() {};
  function render() { aRes.render('pages/docPage', options); }
  function asyncComplete(err) { if (err) { return aNext(); } else { preRender(); render(); } };

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  //--- Tasks

  fs.readFile('DMCA.md', 'UTF8', function (aErr, aData) {
    if (aErr) {
      return statusCodePage(aReq, aRes, aNext, {
        statusCode: 404,
        statusMessage: 'Page not found.'
      });
    }

    // Page metadata
    pageMetadata(options, 'Digital Millenium Copyright Act');

    options.pageHeading = 'Digital Millenium Copyright Act';
    options.pageData = renderMd(aData);

    async.parallel(tasks, asyncComplete);
  });
};

exports.ppPage = function (aReq, aRes, aNext) {
  //
  var authedUser = aReq.session.user;
  var options = {};
  var tasks = [];

  //---
  function preRender() {};
  function render() { aRes.render('pages/docPage', options); }
  function asyncComplete(err) { if (err) { return aNext(); } else { preRender(); render(); } };

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  //--- Tasks

  fs.readFile('PRIVACY.md', 'UTF8', function (aErr, aData) {
    if (aErr) {
      return statusCodePage(aReq, aRes, aNext, {
        statusCode: 404,
        statusMessage: 'Page not found.'
      });
    }

    // Page metadata
    pageMetadata(options, 'Privacy Policy');

    options.pageHeading = 'Privacy Policy';
    options.pageData = renderMd(aData);

    async.parallel(tasks, asyncComplete);
  });
};
