// This library allows for the modifications of user sessions
var async = require('async');

exports.init = function (store) {
  return function (req, res, next) {
    // http://www.senchalabs.org/connect/session.html
    // Keep a reference to the session store on the request
    // so we can access and modify its data later
    req.sessionStore = store;
    next();
  };
};

// Serialize a user model to something that can be stored in the session data
function serializeUser(user) {
  var userObj = user.toObject();

  // Some things don't need to be kept in the session store
  // More could be removed (auths, strategies, flags, flagged?)
  delete userObj.about; // can be huge
  delete userObj.sessionIds; // not kept in sync

  return userObj;
}

// Add a new session id to the user model
exports.add = function (req, user, callback) {
  var store = req.sessionStore;

  function finish(err, user) {
    req.session.user = serializeUser(user);
    callback();
  }

  // Remove invalid session ids from user model
  if (user.sessionIds && user.sessionIds.length > 0) {
    async.filter(user.sessionIds, function (id, cb) {
      store.get(id, function (err, sess) { cb(!err && sess); });
    }, function (sessionIds) {
      // No duplicates
      if (sessionIds.indexOf(req.sessionID) === -1) {
        sessionIds.push(req.sessionID);
      }

      user.sessionIds = sessionIds;
      user.save(finish);
    });
  } else {
    user.sessionIds = [req.sessionID];
    user.save(finish);
  }
};

// Remove a session id from the user model
exports.remove = function (req, user, callback) {
  var pos = user && user.sessionIds ?
    user.sessionIds.indexOf(req.sessionID) : -1;

  delete req.session.user;

  if (pos > -1) {
    user.sessionIds.splice(pos, 1);
    user.save(callback);
  } else {
    callback();
  }
};

// Update all sessions for a user
exports.update = function (req, user, callback) {
  var store = req.sessionStore;
  var userObj = user ? serializeUser(user) : null;

  if (!user || !user.sessionIds) { return callback('No sessions', null); }

  async.each(user.sessionIds, function (id, cb) {
    store.get(id, function (err, sess) {
      // Invalid session, will be removed on login
      if (err || !sess) { return cb(null); }

      sess.user = userObj;
      store.set(id, sess, cb);
    });
  }, callback);
};

// Destory all sessions for a user
exports.destroy = function (req, user, callback) {
  var store = req.sessionStore;
  var emptySess = {
    cookie: {
      path: '/',
      _expires: null,
      originalMaxAge: null,
      httpOnly: true
    }
  };

  if (!user || !user.sessionIds) { return cb('No sessions', null); }

  async.each(user.sessionIds, function (id, cb) {
    store.set(id, emptySess, cb);
  }, callback);
};
