'use strict';

var fs = require('fs');
var async = require('async');
var renderMd = require('../libs/markdown').renderMd;
var statusCodePage = require('../libs/templateHelpers').statusCodePage;
var pageMetadata = require('../libs/templateHelpers').pageMetadata;

var modelParser = require('../libs/modelParser');

exports.view = function (aReq, aRes, aNext) {
  //
  var authedUser = aReq.session.user;
  var options = {};
  var tasks = [];


  var matches = null;
  var page = null;

  var documentPath = null;

  //---
  function preRender() {};
  function render() { aRes.render('pages/documentPage', options); }
  function asyncComplete(err) { if (err) { return aNext(); } else { preRender(); render(); } };

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  //--- Tasks

  var document = aReq.route.params.document;

  if (document) {
    documentPath = 'views/includes/documents';

    fs.readdir(documentPath, function (aErr, aFiles) {
      if (!aErr) {
        var file = null;

        // Dynamically create a file listing of the pages
        options.files = [];
        for (file in aFiles) {
          if (/\.md$/.test(aFiles[file])) {
            options.files.push({
              href: aFiles[file].replace(/\.md$/, ''),
              textContent: aFiles[file].replace(/\.md$/, '').replace(/-/g, ' ')
            });
          }
        }
      }
    });

    fs.readFile(documentPath + '/' + document + '.md', 'UTF8', function (aErr, aData) {
      if (aErr) {
        return statusCodePage(aReq, aRes, aNext, {
          statusCode: 404,
          statusMessage: 'Page not found.'
        });
      }

      var lines = null;
      var heading = null;
      var content = null;

      // Check if first line is h2 and use for title/heading if present
      lines = aData.match(/.*/gm);
      if (lines) {
        matches = lines[0].match(/^##\s(.*)$/);
        if (matches) {
          heading = lines.shift().replace(/^##\s+/, "");
        } else {
          heading = page;
        }
        content = lines.join('\n');
      } else {
        heading = page;
        content = aData;
      }

      // Page metadata
      pageMetadata(options, [heading, 'About']);

      options.pageHeading = heading;
      options.pageData = renderMd(content);

      async.parallel(tasks, asyncComplete);
    });
  }
  else {
    // Page metadata
    pageMetadata(options, ['About', 'About']);

    options.isAbout = true;

    async.parallel(tasks, asyncComplete);
  }
};
