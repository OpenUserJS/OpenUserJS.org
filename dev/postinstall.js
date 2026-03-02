'use strict';

var colors = require('ansi-colors');

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var exec = require('child_process').exec;
var async = require('async');

console.log(colors.yellow('Checking project dependencies. Please wait...'));

var tasks = [
  function (aCallback) {
    var cmd = 'node -v';

    exec(cmd, function (aErr, aStdout, aStderr) {
      if (aErr) {
        aCallback(aErr);
        return;
      }

      aCallback(null, ['$ ' + cmd + '\n' + colors.gray(aStdout)]);
    });
  },
  function (aStdouts, aCallback) {
    var cmd = 'npm -v';

    exec(cmd, function (aErr, aStdout, aStderr) {
      if (aErr) {
        aCallback(aErr);
        return;
      }

      aStdouts.push('$ ' + cmd + '\n' + colors.gray(aStdout));
      aCallback(null, aStdouts);
    });
  },
  function (aStdouts, aCallback) {
    var cmd = 'npm outdated';

    exec(cmd, function (aErr, aStdout, aStderr) {
      if (aErr && aErr.code !== 1) {
        aCallback(aErr);
        return;
      }

      aStdouts.push('$ ' + cmd + '\n' + colors.gray(aStdout));
      aCallback(null, aStdouts);
    });
  }

];

async.waterfall(tasks, function (aErr, aResults) {
  if (aErr) {
    console.error(
      colors.inverse(colors.red('Project dependency error!\n\n')),
      'Code ' + aErr.code + '\n',
      aErr.message
    );
    return;
  }

  aResults.push(colors.cyan('Completed checking project dependencies'));

  console.log(aResults.join('\n'));
});
