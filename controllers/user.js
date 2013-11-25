var User = require('../models/user').User;

exports.view = function (req, res, next) {
  User.findOne({ name: req.route.params.username }, function (err, user) {
    if (err || !user) { next(); }

    res.render('user', { 
      title: user.name, username: user.name, about: user.about 
    }, res);
  });
}

exports.edit = function (req, res) {
  if (req.session.user) {
    res.render('userEdit', {
      title: 'Edit Yourself', about: req.session.user.about
    }, res);
  } else {
    res.redirect('/');
  }
};

exports.update = function (req, res) {
  User.findOneAndUpdate({ _id: req.session.user._id }, 
    { about: req.body.about  },
    function (err, user) {
      if (err) { res.redirect('/'); }

      req.session.user.about = user.about;
      res.redirect('/users/' + user.name);
  });
};
