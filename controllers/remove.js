'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var removeLib = require('../libs/remove');
var Script = require('../models/script').Script;
var User = require('../models/user').User;
var destroySessions = require('../libs/modifySessions').destroy;

// Simple controller to remove content and save it in the graveyard
exports.rm = function (aReq, aRes, aNext) {
  var type = aReq.params[0];
  var path = aReq.params[1];
  var authedUser = aReq.session.user;

  switch (type) {
    case 'scripts':
    case 'libs':
      path += type === 'libs' ? '.js' : '.user.js';
      Script.findOne({ installName: path }, function (aErr, aScript) {
        removeLib.remove(Script, aScript, authedUser, '', function (aRemoved) {
          if (!aRemoved) { return aNext(); }
          aRes.redirect('/');
        });
      });
      break;
    case 'users':
      User.findOne({ name: { $regex: new RegExp('^' + path + '$', "i") } },
        function (aErr, aUser) {
          removeLib.remove(User, aUser, authedUser, '', function (aRemoved) {
            if (!aRemoved) { return aNext(); }

            // Destory all the sessions belonging to the removed user
            destroySessions(aReq, aUser, function () {
              aRes.redirect('/');
            });
          });
        });
      break;
    default:
      aNext();
  }
};
