'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
// This library allows for the modifications of user sessions
var async = require('async');

exports.init = function (aStore) {
  return function (aReq, aRes, aNext) {
    // http://www.senchalabs.org/connect/session.html
    // Keep a reference to the session store on the request
    // so we can access and modify its data later
    aReq.sessionStore = aStore;
    aNext();
  };
};

// Serialize a user model to something that can be stored in the session data
function serializeUser(aUser) {
  var userObj = aUser.toObject();

  // Some things don't need to be kept in the session store
  // More could be removed (auths, strategies, flags, flagged?)
  delete userObj.about; // can be huge
  delete userObj.sessionIds; // not kept in sync

  return userObj;
}

// Add a new session id to the user model
exports.add = function (aReq, aUser, aCallback) {
  var store = aReq.sessionStore;

  function finish(aErr, aUser) {
    aReq.session.user = serializeUser(aUser);
    aCallback();
  }

  // Remove invalid session ids from user model
  if (aUser.sessionIds && aUser.sessionIds.length > 0) {
    async.filter(aUser.sessionIds, function (aId, aCb) {
      store.get(aId, function (aErr, aSess) { aCb(!aErr && aSess); });
    }, function (aSessionIds) {
      // No duplicates
      if (aSessionIds.indexOf(aReq.sessionID) === -1) {
        aSessionIds.push(aReq.sessionID);
      }

      aUser.sessionIds = aSessionIds;
      aUser.save(finish);
    });
  } else {
    aUser.sessionIds = [aReq.sessionID];
    aUser.save(finish);
  }
};

// Remove a session id from the user model
exports.remove = function (aReq, aUser, aCallback) {
  var pos = aUser && aUser.sessionIds ?
    aUser.sessionIds.indexOf(aReq.sessionID) : -1;

  delete aReq.session.user;

  if (pos > -1) {
    aUser.sessionIds.splice(pos, 1);
    aUser.save(aCallback);
  } else {
    aCallback();
  }
};

// Update all sessions for a user
exports.update = function (aReq, aUser, aCallback) {
  var store = aReq.sessionStore;
  var userObj = aUser ? serializeUser(aUser) : null;

  if (!aUser || !aUser.sessionIds) { return aCallback('No sessions', null); }

  async.each(aUser.sessionIds, function (aId, aCb) {
    store.get(aId, function (aErr, aSess) {
      // Invalid session, will be removed on login
      if (aErr || !aSess) { return aCb(null); }

      aSess.user = userObj;
      store.set(aId, aSess, aCb);
    });
  }, aCallback);
};

// Destory all sessions for a user
exports.destroy = function (aReq, aUser, aCallback) {
  var store = aReq.sessionStore;
  var emptySess = {
    cookie: {
      path: '/',
      _expires: null,
      originalMaxAge: null,
      httpOnly: true
    }
  };

  if (!aUser || !aUser.sessionIds) { return aCallback('No sessions', null); }

  async.each(aUser.sessionIds, function (aId, aCb) {
    store.set(aId, emptySess, aCb);
  }, aCallback);
};
