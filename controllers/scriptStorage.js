var AWS = require('aws-sdk');
var Script = require('../models/script').Script;
var cleanFilename = require('../libs/helpers').cleanFilename;
var bucketName = 'OpenUserJS.org';

// Secret keys. You don't have this file.
// You could open a AWS account for testing and put your keys in it.
// http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html
AWS.config.loadFromPath('./aws.json');

// Modified from Count Issues (http://userscripts.org/scripts/show/69307)
// By Marti Martz (http://userscripts.org/users/37004)
function parseMeta(aString) {
  var re = /\/\/ @(\S+)(?:\s+(.*))?/;
  var headers = {};
  var name = null;
  var key = null;
  var value = null;
  var line = null;
  var lineMatches = null;
  var lines = aString.split(/[\r\n]+/).filter(function (e, i, a) {
    return (e.match(re));
  });

  for (line in lines) {
    lineMatches = lines[line].replace(/\s+$/, "").match(re);
    name = lineMatches[1];
    value = lineMatches[2];
    headers[name] = value || "";
  }

  return headers;
}

exports.sendScript = function (req, res, next) {
  var s3 = new AWS.S3();
  var username = req.route.params.username.toLowerCase();
  var namespace = req.route.params.namespace;
  var installName = username + '/' + (namespace ? namespace + '/' : '') 
    + req.route.params.scriptname;

  Script.findOne({ installName: installName }, function (err, script) {
    var s3Obj = null;

    if (!script) { return next(); }
    ++script.installs;
    script.save(function (err, script) {});

    s3Obj = s3.getObject({ Bucket: bucketName, Key: installName },
      function(err, data) {
        if (err) { return next(); }
        s3Obj.createReadStream().pipe(res);
    });
  });
}

exports.storeScript = function (user, scriptBuf, callback) {
  var s3 = new AWS.S3();
  var metadata = parseMeta(scriptBuf.toString('utf8'));
  var namespace = cleanFilename(metadata.namespace || '');
  var scriptName = cleanFilename(metadata.name || '');
  var installName = cleanFilename(user.name).toLowerCase() + '/';

  // Can't install a script without a @name (maybe replace with random value)
  if (!scriptName) { return callback(null); }

  if (namespace === user.name || !namespace) {
    installName += scriptName + '.user.js';
  } else {
    installName += namespace + '/' + scriptName + '.user.js';
  }

  Script.findOne({ installName: installName }, function (err, script) {

    if (!script) {
      script = new Script({
        name: metadata.name,
        about: '',
        installs: 0,
        rating: 0,
        installable: true,
        installName: installName,
        updated: new Date(),
        meta: metadata,
        _authorId: user._id
      });
    } else {
      script.updated = new Date();
    }

    script.save(function (err, script) {
      s3.putObject({ Bucket: bucketName, Key: installName, Body: scriptBuf}, 
        function (err, data) {
          callback(script);
        });
    });
  });
}
