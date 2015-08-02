'use strict';

var chalk = require('chalk');

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var exec = require('child_process').exec;
var async = require('async');

console.log(chalk.yellow('Checking project dependencies. Please wait...'));

var tasks = [
  function (aCallback) {
    var cmd = 'node -v';

    exec(cmd, function (aErr, aStdout, aStderr) {
      if (aErr) {
        aCallback(aErr);
        return;
      }

      aCallback(null, ['$ ' + cmd + '\n' + chalk.gray(aStdout)]);
    });
  },
  function (aStdouts, aCallback) {
    var cmd = 'ruby -v';

    exec(cmd, function (aErr, aStdout, aStderr) {
      if (aErr) {
        aCallback(aErr);
        return;
      }

      aStdouts.push('$ ' + cmd + '\n' + chalk.gray(aStdout));
      aCallback(null, aStdouts);
    });
  },
  function (aStdouts, aCallback) {
    var cmd = 'bundler -v';

    exec(cmd, function (aErr, aStdout, aStderr) {
      if (aErr) {
        if (aErr.code === 127) {
//           aStdouts.push('$ ' + cmd + '\n' + chalk.gray(aStdout));
          aCallback(null, false, aStdouts);
          return;
        } else {
          aCallback(aErr);
          return;
        }
      }

//       aStdouts.push('$ ' + cmd + '\n' + chalk.gray(aStdout));
      aCallback(null, true, aStdouts);
    });
  },
  function (aSkip, aStdouts, aCallback) {
    var cmd = 'sudo gem install bundler -v 1.10.6';

    if (aSkip) {
      aCallback(null, aStdouts);
      return;
    }

    console.log(chalk.cyan('Installing *bundler* gem as global...'));

    exec(cmd, function (aErr, aStdout, aStderr) {
      if (aErr) {
        aCallback(aErr);
        return;
      }

//       aStdouts.push('$ ' + cmd + '\n' + chalk.gray(aStdout));
      aCallback(null, aStdouts);
    });
  },
  function (aStdouts, aCallback) {
    var cmd = 'bundler outdated';

    exec(cmd, function (aErr, aStdout, aStderr) {
      if (aErr) {
        if (aErr.code === 7) {
//           aStdouts.push('$ ' + cmd + '\n' + chalk.gray(aStdout));
          aCallback(null, false, aStdouts);
          return;
        } else {
          aCallback(aErr);
          return;
        }
      }

//       aStdouts.push('$ ' + cmd + '\n' + chalk.gray(aStdout));
      aCallback(null, true, aStdouts);
    });
  },
  function (aSkip, aStdouts, aCallback) {
    var cmd = 'bundler install';

    if (aSkip) {
      aCallback(null, aStdouts);
      return;
    }

    console.log(chalk.cyan('Installing bundled gem(s) as global...'));

    exec(cmd, function (aErr, aStdout, aStderr) {
      if (aErr) {
        aCallback(aErr);
        return;
      }

//       aStdouts.push('$ ' + cmd + '\n' + chalk.gray(aStdout));
      aCallback(null, aStdouts);
    });
  },
  function (aStdouts, aCallback) {
    var cmd = 'gem list';

    exec(cmd, function (aErr, aStdout, aStderr) {
      if (aErr) {
        aCallback(aErr);
        return;
      }

      aStdouts.push('$ ' + cmd + '\n' + chalk.gray(aStdout));
      aCallback(null, aStdouts);
    });
  },
  function (aStdouts, aCallback) {
    var cmd = 'gem outdated';

    exec(cmd, function (aErr, aStdout, aStderr) {
      if (aErr) {
        aCallback(aErr);
        return;
      }

      aStdouts.push('$ ' + cmd + '\n' + chalk.gray(aStdout));
      aCallback(null, aStdouts);
    });
  },
  function (aStdouts, aCallback) {
    var cmd = 'npm -v';

    exec(cmd, function (aErr, aStdout, aStderr) {
      if (aErr) {
        aCallback(aErr);
        return;
      }

      aStdouts.push('$ ' + cmd + '\n' + chalk.gray(aStdout));
      aCallback(null, aStdouts);
    });
  },
  function (aStdouts, aCallback) {
    var cmd = 'npm --depth 0 outdated';

    exec(cmd, function (aErr, aStdout, aStderr) {
      if (aErr) {
        aCallback(aErr);
        return;
      }

      aStdouts.push('$ ' + cmd + '\n' + chalk.gray(aStdout));
      aCallback(null, aStdouts);
    });
  }

];

async.waterfall(tasks, function (aErr, aResults) {
  if (aErr) {
    console.error(
      chalk.red.inverse('Project dependency error!\n\n'),
      'Code ' + aErr.code + '\n',
      aErr.message
    );
    return;
  }

  aResults.push(chalk.cyan('Completed checking project dependencies'));

  console.log(aResults.join('\n'));
});
