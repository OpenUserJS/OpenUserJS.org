var async = require('async');
var _ = require('underscore');

var github = require('./githubClient');
var scriptParser = require('../libs/scriptParser');
var scriptStorage = require('../controllers/scriptStorage');
var settings = require('../models/settings.json');


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

  if (aJavascriptBlob.size > settings.maximumScriptSize) {
    aJavascriptBlob.errors.push({
      msg: util.format('File size is larger than maximum (%s bytes).', settings.maximumScriptSize)
    });
  }

  if (aJavascriptBlob.errors.length)
    aJavascriptBlob.canUpload = !aJavascriptBlob.errors.length;

  return aJavascriptBlob;
};
exports.parseJavascriptBlob = parseJavascriptBlob;


var importJavasciptBlob = function (aOptions, aCallback) {
  var user = aOptions.user;
  var githubUserId = aOptions.githubUserId;
  var githubRepoName = aOptions.githubRepoName;
  var githubBlobPath = aOptions.githubBlobPath;
  var updateOnly = aOptions.updateOnly || false;
  console.log('importJavasciptBlob', aOptions);

  if (!(user && githubUserId && githubRepoName && githubBlobPath))
    return aCallback('Missing required parameter.');

  var data = {};
  async.waterfall([
    // Validate blob
    function (aCallback) {
      github.gitdata.getJavascriptBlobs({
        user: encodeURIComponent(githubUserId),
        repo: encodeURIComponent(githubRepoName)
      }, aCallback);
    },
    function (aJavascriptBlobs, aCallback) {
      var javascriptBlob = _.findWhere(aJavascriptBlobs, { path: githubBlobPath });

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
      if (aBlobUtf8.length > settings.maximum_upload_script_size)
        return aCallback(util.format('File size is larger than maximum (%s bytes).', settings.maximum_upload_script_size));

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
exports.importJavasciptBlob = importJavasciptBlob;


