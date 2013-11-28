var AWS = require('aws-sdk');
var Script = require('../models/script').Script;

// Secret keys. You don't have this file.
// You could open a AWS account for testing and put your keys in it.
// http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html
AWS.config.loadFromPath('../aws.json');

exports.sendScript = function (req, res) {
  var s3 = new AWS.S3();
  var params = { Bucket: req.route.params.username,
    Key: req.route.params.scriptname };

  // Total failure if this doesn't work, but we want speed
  // and low overhead for installs
  s3.getObject(params).createReadStream().pipe(res);
}

exports.storeScript = function (user, script, scriptStream) {
  var s3 = new AWS.S3();
  var bufs = [];

  // Dump a script into the users bucket
  function dumpScript(buf) {
    s3.putObject({ Bucket: user.name, Key: script.name, Body: buf},
      function (err, data) {});
  }

  // Write a stream to a buffer (perhaps there is a better way?)
  stdout.on('data', function (chunk) { bufs.push(chunk); });
  stdout.on('end', function () {
    var buf = Buffer.concat(bufs);

    s3.headBucket({ Bucket: user.name }, function (err, data) {
      // The bucket doesn't exist so we have to create it
      if (!data) {
        s3.createBucket({ Bucket: user.name }, function (err, data) {
          dumpScript();
        });
      } else {
        dumpScript();
      }
    });
  });
}
