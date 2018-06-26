'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//--- Library inclusions
var moment = require('moment');

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

// Add a single new session id to the user model
exports.add = function (aReq, aUser, aCallback) {
  var store = aReq.sessionStore;

  function finish(aErr, aUser) {
    aReq.session.user = serializeUser(aUser);
    aCallback();
  }

  // Remove invalid session ids from user model
  if (aUser.sessionIds && aUser.sessionIds.length > 0) {
    async.filter(aUser.sessionIds, function (aId, aCb) {
      store.get(aId, function (aErr, aSess) {
        aCb(null, !aErr && aSess);
      });

    }, function (aErr, aSessionIds) {
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

// Expand a single session
exports.expand = function (aReq, aUser, aCallback) {
  var expiry = null;

  if (!aUser) {
    aCallback('No User');
    return;
  }

  // NOTE: Expanded minus initial. Keep initial in sync with app.js
  expiry = moment(aReq.session.cookie.expires).add(6, 'h').subtract(5, 'm');

  aReq.session.cookie.expires = expiry.toDate();
  aReq.session.cookie.sameSite = 'strict';
  aReq.session.save(aCallback);
};

// Extend a single session
exports.extend = function (aReq, aUser, aCallback) {
  if (!aUser) {
    aCallback('No User');
    return;
  }

  if (!aReq.session.cookie.expires) {
    aCallback('Already extended');
    return;
  }

  // NOTE: Currently allow on any session with
  //   no additional User restrictions yet...

  aReq.session.cookie.expires = false;
  aReq.session.save(aCallback);
};

// Gracefully remove the current session id from the user model **and** the session store
exports.remove = function (aReq, aUser, aCallback) {
  var pos = aUser && aUser.sessionIds ?
    aUser.sessionIds.indexOf(aReq.sessionID) : -1;

  aReq.session.destroy();

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

  if (!aUser || !aUser.sessionIds) {
    aCallback('No sessions', null);
    return;
  }

  async.each(aUser.sessionIds, function (aId, aCb) {
    store.get(aId, function (aErr, aSess) {
      // Invalid session, will be removed on login
      if (aErr || !aSess) {
        aCb(null);
        return;
      }

      aSess.user = userObj;
      store.set(aId, aSess, aCb);
    });
  }, aCallback);
};

// Destroy one session for a user
exports.destroyOne = function (aReq, aUser, aId, aCallback) {
  var store = aReq.sessionStore;

  console.log(aId);

  if (!aUser || !aId) {
    aCallback('No session', null);
    return;
  }

  // We want to know who requested what
  console.log(aReq.session.user.name, 'requested session removal of', aUser.name);

  store.destroy(aId, aCallback);
}

// Destroy all sessions for a user
exports.destroy = function (aReq, aUser, aCallback) {
  var store = aReq.sessionStore;

  if (!aUser || !aUser.sessionIds) {
    aCallback('No sessions', null);
    return;
  }

  async.each(aUser.sessionIds, function (aId, aInnerCallback) {
   store.destroy(aId, aInnerCallback);
  }, aCallback);
};
