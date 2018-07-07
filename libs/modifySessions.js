'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//--- Dependency inclusions
var _ = require('underscore');
var async = require('async');
var moment = require('moment');

//--- Library inclusions
var modelParser = require('../libs/modelParser');
var findMeta = require('../controllers/scriptStorage').findMeta;

//--- Configuration inclusions
var settings = require('../models/settings.json');

//
// This library allows for the modifications of user sessions

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
  var expiry = moment(aReq.session.cookie.expires);
  var min = settings.ttl.minimum;

  if (!aUser) {
    aCallback('No User');
    return;
  }

  // NOTE: Now plus initial timeout must always be greater than expiry
  if (!moment().add(min, 'm').isAfter(expiry)) {
    // We want to know that...
    console.warn(aReq.session.user.name, 'has an invalid `expires`');

    // Buh bye
    aReq.session.destroy();
    aCallback('Invalid expires');
    return;
  }

  // NOTE: Expanded timeout minus initial timeout.
  expiry = expiry.add(settings.ttl.nominal, 'h').subtract(min, 'm');

  aReq.session.cookie.expires = expiry.toDate();
  aReq.session.cookie.sameSite = 'strict';
  aReq.session.save(aCallback);
};

// Extend a single session
exports.extend = function (aReq, aUser, aCallback) {
  var expiry = moment(aReq.session.cookie.expires);

  if (!aUser) {
    aCallback('No User');
    return;
  }

  if (!aReq.session.passport) {
    aReq.session.passport = {};
  }

  if (!aReq.session.passport.oujsOptions) {
    aReq.session.passport.oujsOptions = {};
  }

  if (aReq.session.passport.oujsOptions.extended) {
    aCallback('Already extended');
    return;
  }

  expiry = expiry.add(settings.ttl.maximum, 'h');
  aReq.session.passport.oujsOptions.extended = true;

  aReq.session.cookie.expires = expiry.toDate();
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
  var authedUser = aReq.session.user;

  if (!aUser || !aId) {
    aCallback('No user or id', null);
    return;
  }

  store.get(aId, function (aErr, aSess) {
    if (aErr || !aSess) {
      aCallback('No session', null);
      return;
    }

    // We want to know who deleted someone else!
    // If we didn't want this then this call to get the session
    // from id would not be necessary.
    if (authedUser.name !== aUser.name) {
      console.log(
        '`' + authedUser.name + '`',
          'removed a session by',
            '`' + aUser.name + '`',
              aSess.passport.oujsOptions.authFrom
                ? 'authed from `' + aSess.passport.oujsOptions.authFrom + '`'
                : ''
      );
    }

    store.destroy(aId, aCallback);
  });
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

exports.getSessionDataList = function (aReq, aOptions, aCallback) {
  var store = aReq.sessionStore;
  var authedUser = aReq.session.user;

  var username = aReq.query.q;
  var query = {};

  if (aOptions.isAdmin && aOptions.isAdminSessionActiveView) {
    query = { username: username };
  } else {
    query = { username: authedUser.name };
  }

  async.series([
    function (aInnerCallback) {
      exports.findSessionData(query, store, aOptions, function (aErr) {
        if (aErr) {
          aCallback(aErr, null);
          return;
        }

        aInnerCallback();
      });
    },
    function (aInnerCallback) {
      aOptions.sessionList = _.map(aOptions.sessionList, function (aSession) {
        var session = modelParser.parseSession(aSession);
        var oujsOptions = session.passport.oujsOptions;

        session.showExtend = aReq.sessionID === oujsOptions.sid;
        session.canExtend = !oujsOptions.extended;
        session.canDestroyOne = true; // TODO: Perhaps do some further conditionals

        oujsOptions.remoteAddressMask = session.name === authedUser.name && !oujsOptions.authFrom
          ? oujsOptions.remoteAddressMask
          : oujsOptions.authFrom
            ? oujsOptions.authFrom
            : null;

        return session;
      });

      aInnerCallback();
    },
    function (aInnerCallback) {
      aOptions.sessionList = _.sortBy(aOptions.sessionList, function (aSession) {
        return -aSession.passport.oujsOptions.since || 0;
      });

      aInnerCallback();
    }], function (aErr) {
      aCallback(null);
    }
  );
};

exports.findSessionData = function (aQuery, aStore, aOptions, aCallback) {
  var sessionColl = aStore.db.collection('sessions');

  sessionColl.find({
  }, function (aErr, aUserSessions) {
    if (aErr) {
      aCallback(aErr);
      return;
    }

    if (!aUserSessions) {
      aCallback('No sessions');
      return;
    }

    aOptions.sessionList = [];

    aUserSessions.each(function (aErr, aSessionData) {
      var data = null;
      var rQuery = null;

      if (aErr) {
        aCallback(aErr);
        return;
      }

      if (!aSessionData) {
        aCallback();
        return;
      }

      //
      data = JSON.parse(aSessionData.session);

      if (data) {

        if (!data.passport) {
          data.passport = {};
        }

        if (!data.passport.oujsOptions) {
          data.passport.oujsOptions = {};
        }


        data.passport.oujsOptions.username = data.username || findMeta(data.user, 'name');
        data.passport.oujsOptions.sid = aSessionData._id;

        // Very simple query filter search check to start.
        // Currently only looking in `data.passport.oujsOptions.username`.
        if (aQuery && aQuery.username) {
          rQuery = new RegExp('^' + aQuery.username +
            (aOptions.isAdminSessionActiveView ? '' : '$'), 'i');

          if (rQuery.test(data.passport.oujsOptions.username)) {
            aOptions.sessionList.push(data);
          }
        } else {
          aOptions.sessionList.push(data);
        }

      }

    });
  });
}

