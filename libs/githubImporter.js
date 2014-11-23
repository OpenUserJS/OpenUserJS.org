var async = require('async');
var _ = require('underscore');
var util = require('util');

var Script = require('../models/script').Script;

var github = require('./githubClient');
var scriptParser = require('../libs/scriptParser');
var scriptStorage = require('../controllers/scriptStorage');
var config = require('../config');
var escapeRegExp = require('./helpers').escapeRegExp;

var blobPathRegex = /^(.*\/)?(.+?)((\.user)?\.js)$/i;

var parseJavascriptBlob = function (aJavascriptBlob) {
  // Parsing Script Name & Type from path
  var blobPathRegex = /^(.*\/)?(.+?)((\.user)?\.js)$/;
  var m = blobPathRegex.exec(aJavascriptBlob.path);
  aJavascriptBlob.isUserJS = !!m[4]; // .user exists
  aJavascriptBlob.isJSLibrary = !m[4]; // .user doesn't exist

  aJavascriptBlob.path = {
    full: aJavascriptBlob.path,
    dir: m[1],
    name: m[2],
    ext: m[3],
    filename: m[2] + m[3]
  };

  aJavascriptBlob.pathAsEncoded = {
    full: encodeURI(aJavascriptBlob.path.full),
    dir: encodeURI(aJavascriptBlob.path.dir),
    name: encodeURI(aJavascriptBlob.path.name),
    ext: encodeURI(aJavascriptBlob.path.ext),
    filename: encodeURI(aJavascriptBlob.path.filename)
  };

  // Errors
  aJavascriptBlob.canUpload = true;
  aJavascriptBlob.errors = [];

  if (aJavascriptBlob.size > config.maximumScriptSize) {
    aJavascriptBlob.errors.push({
      msg: util.format('File size is larger than maximum (%s bytes).', config.maximumScriptSize)
    });
  }

  if (aJavascriptBlob.errors.length)
    aJavascriptBlob.canUpload = !aJavascriptBlob.errors.length;

  return aJavascriptBlob;
};
exports.parseJavascriptBlob = parseJavascriptBlob;

var importJavascriptBlob = function (aOptions, aCallback) {
  var user = aOptions.user;
  var githubUserId = aOptions.githubUserId;
  var githubRepoName = aOptions.githubRepoName;
  var githubBlobPath = aOptions.githubBlobPath;
  var updateOnly = aOptions.updateOnly || false;
  var blobs = aOptions.blobs;

  if (!(user && githubUserId && githubRepoName && githubBlobPath))
    return aCallback('Missing required parameter.');

  var data = {};
  async.waterfall([
    function (aCallback) {
      if (blobs) {
        aCallback(null, blobs);
      } else {
        github.gitdata.getBlobs({
          user: encodeURIComponent(githubUserId),
          repo: encodeURIComponent(githubRepoName)
        }, aCallback);
      }
    },
    // Validate blob
    function (aBlobs, aCallback) {
      var javascriptBlob = _.findWhere(aBlobs, { path: githubBlobPath });

      javascriptBlob = parseJavascriptBlob(javascriptBlob);

      if (!javascriptBlob.canUpload)
        return aCallback(javascriptBlob.errors);

      data.javascriptBlob = javascriptBlob;
      aCallback(null);
    },

    //
    function (aCallback) {
      github.usercontent.getBlobAsUtf8({
        user: encodeURIComponent(githubUserId),
        repo: encodeURIComponent(githubRepoName),
        path: encodeURIComponent(githubBlobPath)
      }, aCallback);
    },
    function (aBlobUtf8, aCallback) {
      // Double check file size.
      if (aBlobUtf8.length > config.maximumScriptSize)
        return aCallback(util.format('File size is larger than maximum (%s bytes).', config.maximumScriptSize));

      var onScriptStored = function (aScript) {
        if (aScript) {
          data.script = aScript;
          aCallback(null, data);
        } else {
          aCallback('Error while uploading script.');
        }
      };

      if (data.javascriptBlob.isUserJS) {
        //
        var m = scriptParser.userscriptHeaderRegex.exec(aBlobUtf8);
        if (m && m[1]) {
          var userscriptMeta = scriptParser.parseMeta(m[1], true);
          scriptStorage.storeScript(user, userscriptMeta, aBlobUtf8, onScriptStored);
        } else {
          aCallback('Specified file does not contain a userscript header.');
        }
      } else if (data.javascriptBlob.isJSLibrary) {
        var scriptName = data.javascriptBlob.path.name;
        var jsLibraryMeta = scriptName;
        scriptStorage.storeScript(user, jsLibraryMeta, aBlobUtf8, onScriptStored);
      } else {
        aCallback('Invalid filetype.');
      }
    },
  ], aCallback);
};
exports.importJavascriptBlob = importJavascriptBlob;

var parseMarkdownBlob = function (aMarkdownBlob) {
  // Errors
  aMarkdownBlob.canUpload = true;
  aMarkdownBlob.errors = [];

  if (aMarkdownBlob.size > config.maximumScriptDescriptionSizeSize) {
    aMarkdownBlob.errors.push({
      msg: util.format('File size is larger than maximum (%s bytes).', config.maximumScriptDescriptionSizeSize)
    });
  }

  if (aMarkdownBlob.errors.length)
    aMarkdownBlob.canUpload = !aMarkdownBlob.errors.length;

  return aMarkdownBlob;
};
exports.parseMarkdownBlob = parseMarkdownBlob;

var importMarkdownBlob = function (aOptions, aCallback) {
  var user = aOptions.user;
  var githubUserId = aOptions.githubUserId;
  var githubRepoName = aOptions.githubRepoName;
  var githubBlobPath = aOptions.githubBlobPath;
  var blobs = aOptions.blobs;

  if (!(user && githubUserId && githubRepoName && githubBlobPath))
    return aCallback('Missing required parameter.');

  var data = {};
  async.waterfall([
    // Fetch all blobs in the target repo if not supplied as a parameter.
    function (aCallback) {
      if (blobs) {
        aCallback(null, blobs);
      } else {
        github.gitdata.getBlobs({
          user: encodeURIComponent(githubUserId),
          repo: encodeURIComponent(githubRepoName)
        }, aCallback);
      }
    },

    // Validate blob
    function (aBlobs, aCallback) {
      var markdownBlob = _.findWhere(aBlobs, { path: githubBlobPath });

      markdownBlob = parseMarkdownBlob(markdownBlob);

      if (!markdownBlob.canUpload)
        return aCallback(markdownBlob.errors);

      data.markdownBlob = markdownBlob;
      aCallback(null);
    },

    //
    function (aCallback) {
      github.usercontent.getBlobAsUtf8({
        user: encodeURIComponent(githubUserId),
        repo: encodeURIComponent(githubRepoName),
        path: encodeURIComponent(githubBlobPath)
      }, aCallback);
    },
    function (aBlobUtf8, aCallback) {
      // Double check file size.
      if (aBlobUtf8.length > config.maximumScriptDescriptionSize)
        return aCallback(util.format('File size is larger than maximum (%s bytes).', config.maximumScriptDescriptionSize));

      // script.about =
      Script.update({
        githubSyncAbout: true,
        githubSyncUserId: githubUserId,
        githubSyncRepoName: githubRepoName,
        githubSyncAboutPath: githubBlobPath
      }, {
        about: aBlobUtf8
      }, {
        multi: true
      }, aCallback);
    },
    function(aNumberAffected, aRawResponse, aCallback) {
      data.numScriptsAffected = aNumberAffected;
      console.log(util.format('importMarkdownBlob(%s, %s, %s) updated %s Scripts.', githubUserId, githubRepoName, githubBlobPath, aNumberAffected));
      aCallback(null, data);
    }
  ], aCallback);
};
exports.importMarkdownBlob = importMarkdownBlob;
