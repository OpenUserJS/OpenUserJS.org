var AWS = require('aws-sdk');
var Script = require('../models/script').Script;
var cleanFilename = require('../libs/helpers').cleanFilename;
var bucketName = 'OpenUserJS.org';

// You need to install (and ruby too): https://github.com/jubos/fake-s3
// Then run: fakes3 -r fakeS3 -p 10001
if (process.env.NODE_ENV !== 'production') {
  //AWS.config.loadFromPath('./aws.json');
  AWS.config.update({ accessKeyId: 'fakeId', secretAccessKey: 'fakeKey',
    httpOptions: { 
    proxy: 'localhost:10001', agent: require('http').globalAgent 
  }});
}

function getInstallName (req, res) {
  var username = req.route.params.username.toLowerCase();
  var namespace = req.route.params.namespace;
  return username + '/' + (namespace ? namespace + '/' : '') 
    + req.route.params.scriptname;
}

exports.sendScript = function (req, res, next) {
  var s3 = new AWS.S3();
  var accept = req.headers['Accept'];
  var installName = null;

  if (accept === 'text/x-userscript-meta') { 
    return exports.sendMeta(req, res, next); 
  }
  installName = getInstallName(req, res);

  // Send the script
  var s3Obj = s3.getObject({ Bucket: bucketName, Key: installName },
    function(err, data) {
      if (err) { return next(); }
      res.set('Content-Type', 'text/javascript; charset=utf-8');
      s3Obj.createReadStream().pipe(res);
  });

  // Update the install count
  Script.findOne({ installName: installName }, function (err, script) {
    if (!script) { return; }
    ++script.installs;
    script.save(function (err, script) {});
  });
}

exports.sendMeta = function (req, res, next) {
  var installName = getInstallName(req, res).replace(/\.meta\.js$/, '.user.js');

  Script.findOne({ installName: installName }, function (err, script) {
    var key = null;
    var meta = null;
    var lines = [];

    if (!script) { return next(); }

    meta = script.meta;
    for (key in meta) {
      lines.push('// @' + key + '    ' + meta[key]);
    }

    res.set('Content-Type', 'text/javascript; charset=utf-8');
    res.write('// ==UserScript==\n');
    res.write(lines.reverse().join('\n'));
    res.end('\n// ==/UserScript==\n');
  });
}

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
  var lines = {};
  var headerContent = /\/\/ ==UserScript==\s*\n([\S\s]*)\n\/\/ ==\/UserScript==/m.exec(aString);

  if (headerContent[1]) {
    lines = headerContent[1].split(/[\r\n]+/).filter(function (e, i, a) {
      return (e.match(re));
    });
  }

  for (line in lines) {
    lineMatches = lines[line].replace(/\s+$/, "").match(re);
    name = lineMatches[1];
    value = lineMatches[2];
    headers[name] = value || "";
  }

  return headers;
}

exports.storeScript = function (user, scriptBuf, callback) {
  var s3 = new AWS.S3();
  var metadata = parseMeta(scriptBuf.toString('utf8'));
  var namespace = cleanFilename(metadata.namespace || '');
  var scriptName = cleanFilename(metadata.name || '');
  var installName = cleanFilename(user.name).toLowerCase() + '/';

  // Can't install a script without a @name (maybe replace with random value)
  if (!scriptName) { return callback(null); }

  if (namespace === cleanFilename(user.name).toLowerCase() || !namespace) {
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
