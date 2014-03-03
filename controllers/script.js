var fs = require('fs');
var formidable = require('formidable');
var scriptStorage = require('./scriptStorage');
var User = require('../models/user').User;
var Script = require('../models/script').Script;
var scriptStorage = require('./scriptStorage');

exports.view = function (req, res, next) {
  var installName = scriptStorage.getInstallName(req);
  var user = req.session.user;

  Script.findOne({ installName: installName + '.user.js' },
    function (err, script) {
      if (err || !script) { return next(); }
      var editUrl = installName.split('/');
      var fork = script.fork;
      editUrl.shift();

      if (fork instanceof Array && fork.length > 0) {
        fork[0].first = true;
        fork[fork.length - 1].original = true;
      } else {
        fork = null;
      }

      res.render('script', { 
        title: script.name,
        name: script.name,
        version: script.meta.version,
        install: '/install/' + script.installName,
        source: '/scripts/' + installName + '/source',
        edit: '/script/' + editUrl.join('/') + '/edit',
        author: script.author,
        rating: script.rating,
        installs: script.installs,
        fork: fork,
        description: script.meta.description,
        about: script.about,
        isYou: user && user._id == script._authorId,
        isFork: !!fork
      }, res);
  });
};

exports.edit = function (req, res, next) {
  var installName = null;
  var user = req.session.user;

  if (!user) { return res.redirect('/login'); }

  req.route.params.username = user.name;
  installName = scriptStorage.getInstallName(req);

  Script.findOne({ installName: installName + '.user.js' },
    function (err, script) {
      if (err || !script || script._authorId != user._id) { return next(); }

      if (typeof req.body.about !== 'undefined') {
        if (req.body.remove) {
          scriptStorage.deleteScript(installName + '.user.js', function () {
            res.redirect('/users/' + user.name);
          });
        } else {
          script.about = req.body.about;
          script.save(function (err, script) {
            res.redirect('/scripts/' + installName);
          });
        }
      } else {
        res.render('scriptEdit', { 
          title: script.name,
          name: script.name,
          source: '/scripts/' + installName + '/source',
          about: script.about
        }, res);
      }
  });
};
