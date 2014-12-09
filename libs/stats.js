'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var countTask = require('../libs/tasks').countTask;
var Script = require('../models/script').Script;

exports.getSummaryTasks = function summary(aOptions) {
  var tasks = [];
  aOptions.stats = {};

  var userScriptListCountQuery = Script.find({
    _authorId: aOptions.user._id,
    flagged: { $ne: true },
    isLib: { $ne: true }
  });
  tasks.push(countTask(userScriptListCountQuery, aOptions.stats, 'totalScripts'));

  var userLibListCountQuery = Script.find({
    _authorId: aOptions.user._id,
    flagged: { $ne: true },
    isLib: { $eq: true }
  });
  tasks.push(countTask(userLibListCountQuery, aOptions.stats, 'totalLibs'));

  tasks.push(function (aCallback) {
    Script.find({
      _authorId: aOptions.user._id,
      flagged: { $ne: true },
      isLib: { $ne: true }  // libs don't have installs;
    }, function (aErr, aScripts) {
      if (aErr) {
        console.error(aErr);
        return aCallback();
      }
      aOptions.stats.totalInstalls = 0;
      aScripts.forEach(function (aScript) {
        aOptions.stats.totalInstalls += aScript.installs;
      });
      aOptions.stats.avgInstalls = 0;
      if (aScripts.length > 0 && aOptions.stats.totalInstalls > 0) {
        aOptions.stats.avgInstalls = Math.round((aOptions.stats.totalInstalls / aScripts.length) * 10) / 10;
      }
      aCallback();
    });
  });

  tasks.push(function (aCallback) {
    Script.find({
      _authorId: aOptions.user._id,
      flagged: { $ne: true }
    }, function (aErr, aScripts) {
      if (aErr) {
        console.error(aErr);
        return aCallback();
      }
      var totalRating = 0;
      aScripts.forEach(function (aScript) {
        totalRating += aScript.rating;
      });
      aOptions.stats.avgRating = 0;
      if (aScripts.length > 0 && totalRating > 0) {
        aOptions.stats.avgRating = Math.round((totalRating / aScripts.length) * 10) / 10;
      }
      aCallback();
    });
  });

  return tasks;
};
