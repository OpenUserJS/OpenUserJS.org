'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//

//--- Dependency inclusions
var async = require('async');

//--- Model inclusions
var Flag = require('../models/flag').Flag;
var User = require('../models/user').User;

//--- Library inclusions
var flagLib = require('../libs/flag');

//--- Configuration inclusions

//---
exports.getFlaggedListForContent = function (aModelName, aOptions, aCallback) {

  var content = aModelName.toLowerCase();
  var contentList = aOptions[content + 'List'] || [aOptions[content]];

  async.forEachOf(contentList, function (aContent, aContentKey, aEachOuterCallback) {

    // NOTE: Directly use indexed parent identifier allowing set of the dynamic, virtual, field
    //       So basically do not use `aContent` anywhere in this function

    // Always ensure a snapshot copy!
    if (contentList[aContentKey].toObject) {
      contentList[aContentKey] = contentList[aContentKey].toObject({
        virtuals: true
      });
    }

    // Ensure reset
    contentList[aContentKey].flaggedList = [];

    // Find any flags
    Flag.find({
      model: aModelName,
      _contentId: contentList[aContentKey]._id

    }, function (aErr, aFlagList) {
      if (aErr || !aFlagList || aFlagList.length === 0) {
        aEachOuterCallback();
        return;
      }

      aOptions.hasFlagged = true;

      async.forEachOfSeries(aFlagList, function (aFlag, aFlagKey, aEachInnerCallback) {
        User.findOne({ _id: aFlag._userId }, function (aErr, aUser) {
          contentList[aContentKey].flaggedList.push({
            name: aUser.name,
            reason: aFlagList[aFlagKey].reason,
            since: aFlagList[aFlagKey]._since
          });
          aEachInnerCallback();
        });
      }, aEachOuterCallback);
    });

  }, aCallback);
}
