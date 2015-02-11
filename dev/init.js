'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var exec = require('child_process').exec;
var async = require('async');

if (isDev || isDbg) {

  var tasks = [];
  var no = {};

  tasks.push(function (aCallback) {
    var cmd = 'node -v';
    console.log('>> ' + cmd);

    exec(cmd, function (aErr, aStdout, aStderr) {
      if (aErr) {
        console.error(aStderr);
      } else {
        console.log(aStdout);
      }

      aCallback();
    });
  });

  tasks.push(function (aCallback) {
    var cmd = 'npm -v';
    console.log('>> ' + cmd);

    exec(cmd, function (aErr, aStdout, aStderr) {
      if (aErr) {
        console.error(aStderr);
      } else {
        console.log(aStdout);
      }

      aCallback();
    });
  });

  tasks.push(function (aCallback) {
    var cmd = 'ruby -v';
    console.log('>> ' + cmd);

    exec(cmd, function (aErr, aStdout, aStderr) {
      if (aErr) {
        no.ruby = true;
        console.error(aStderr);
      } else {
        console.log(aStdout);
      }

      aCallback();
    });
  });

  tasks.push(function (aCallback) {
    var cmd = 'bundler -v';

    if (!no.ruby) {
      console.log('>> ' + cmd);

      exec(cmd, function (aErr, aStdout, aStderr) {
        if (aErr) {
          no.bundler = true;
          console.error(aStderr);
        } else {
          console.log(aStdout);
        }

        aCallback();
      });
    } else {
      aCallback();
    }
  });

  tasks.push(function (aCallback) {
    var cmd = 'bundler outdated';

    if (!no.bundler) {
      console.log('>> ' + cmd);

      exec(cmd, function (aErr, aStdout, aStderr) {
        if (aErr) {
          no.bundle = true;
          console.error(aStderr);
        } else {
          console.log(aStdout);
        }

        aCallback();
      });
    } else {
      aCallback();
    }
  });

  tasks.push(function (aCallback) {
    var cmd = 'bundler install';

    if (no.bundle) {
      console.log('>> ' + cmd);

      exec(cmd, function (aErr, aStdout, aStderr) {
        if (aErr) {
          console.error(aStderr);
        } else {
          console.log(aStdout);
        }

        aCallback();
      });
    } else {
      aCallback();
    }
  });

  tasks.push(function (aCallback) {
    var cmd = 'npm --depth 0 outdated';
    console.log('>> ' + cmd);

    exec(cmd, function (aErr, aStdout, aStderr) {
      if (aErr) {
        console.error(aStderr);
      } else {
        console.log(aStdout);
      }

      aCallback();
    });
  });

  async.series(tasks, function (aErr) {
    if (aErr) {
      console.error('There was an unexpected error.');
    }

    console.log('>\n');
  });
}
