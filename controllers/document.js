'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//

//--- Dependency inclusions
var fs = require('fs');
var async = require('async');

//--- Model inclusions

//--- Controller inclusions

//--- Library inclusions
// var documentLib = require('../libs/document');

var modelParser = require('../libs/modelParser');

var renderMd = require('../libs/markdown').renderMd;
var statusCodePage = require('../libs/templateHelpers').statusCodePage;
var pageMetadata = require('../libs/templateHelpers').pageMetadata;

//--- Configuration inclusions
var pkg = require('../package.json');

//---

exports.view = function (aReq, aRes, aNext) {
  function preRender() {
  }

  function render() {
    aRes.render('pages/documentPage', options);
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

  var options = {};
  var authedUser = aReq.session.user;

  var document = aReq.params.document;
  var documentPath = null;

  var tasks = [];
  var then = null;

  var matches = null;

  // Session
  options.authedUser = authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (document) {
    documentPath = 'views/includes/documents';

    //--- Tasks

    // Read the requested md file contents
    tasks.push(function (aCallback) {
      fs.readFile(documentPath + '/' + document + '.md', 'utf8', function (aErr, aData) {
        var lines = null;
        var matches = null;
        var heading = null;
        var content = null;

        if (aErr) {
          aCallback({ statusCode: 404, statusMessage: 'Error retrieving page' });
          return;
        }

        // Check if first line is h2 and use for title/heading if present
        lines = aData.split('\n');
        matches = lines[0].match(/^##\s(.*)$/);
        if (matches) {
          heading = lines.shift().replace(/^##\s+/, "");
        } else {
          heading = document;
        }
        content = lines.join('\n');

        // Page metadata
        pageMetadata(options, [heading, 'About']);

        options.pageHeading = heading;
        options.pageData = renderMd(content);

        aCallback(null);
      });
    });

    // Read file listing
    tasks.push(function (aCallback) {
      fs.readdir(documentPath, function (aErr, aFileList) {
        var file = null;

        if (aErr || !aFileList) {
          aCallback({ statusCode: 500, statusMessage : 'Error retrieving page list' });
          return;
        }

        // Dynamically create a file listing of the pages
        options.fileList = [];
        for (file in aFileList) {
          if (/\.md$/.test(aFileList[file])) {
            options.fileList.push({
              href: aFileList[file].replace(/\.md$/, ''),
              textContent: aFileList[file].replace(/\.md$/, '').replace(/-/g, ' ')
            });
          }
        }

        aCallback(null);
      });
    });
  }
  else {
    // Page metadata
    pageMetadata(options, ['About', 'About']);

    options.isAbout = true;

    // Only show node version to admins+
    if (options.isAdmin) {
      options.process = {};
      options.process.version = process.version;

      // Calculate when the server was last restarted
      then = new Date(Date.now() - parseInt(process.uptime() * 1000, 10));
      options.lastRestart = then.toLocaleString();
    }

    // Denote if storage is in RO mode
    options.lockdown = {};
    options.lockdown.scriptStorageRO = process.env.READ_ONLY_SCRIPT_STORAGE === 'true';
    options.lockdown.updateURLCheck = process.env.FORCE_BUSY_UPDATEURL_CHECK === 'true';

    // Output some package.json details to the view
    options.pkg = {};
    options.pkg.name = pkg.name;
    options.pkg.version = pkg.version.replace(/\+.*$/, '');

    //--- Tasks
  }

  //---
  async.parallel(tasks, asyncComplete);
};
