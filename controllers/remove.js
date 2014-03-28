var removeLib = require('../libs/remove');
var Script = require('../models/script').Script;
var User = require('../models/user').User;

exports.rm = function (req, res, next) {
  var type = req.route.params[0];
  var path = req.route.params[1];
  var thisUser = req.session.user;

  switch (type) {
  case 'scripts':
    Script.findOne({ installName: path + '.user.js' }, function (err, script) {
      removeLib.remove(Script, script, thisUser, '', function (removed) {
        if (!removed) { return next(); }
        res.redirect('/');
      });
    });
    break;
  case 'users':
    User.findOne({ name : { $regex : new RegExp('^' + path + '$', "i") } },
      function (err, user) {
        removeLib.remove(User, user, thisUser, '', function (removed) {
          if (!removed) { return next(); }
          res.redirect('/');
        });
    });
    break;
  default:
    next();
  }
};
