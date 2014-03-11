var fs = require('fs');
var formidable = require('formidable');
var scriptStorage = require('./scriptStorage');
var User = require('../models/user').User;
var Script = require('../models/script').Script;
var Vote = require('../models/vote').Vote;

exports.view = function (req, res, next) {
  var installName = scriptStorage.getInstallName(req);
  var user = req.session.user;

  Script.findOne({ installName: installName + '.user.js' },
    function (err, script) {
      if (err || !script) { return next(); }
      var editUrl = installName.split('/');
      var fork = script.fork;
      var options = null;
      editUrl.shift();

      if (fork instanceof Array && fork.length > 0) {
        fork[0].first = true;
        fork[fork.length - 1].original = true;
      } else {
        fork = null;
      }

      options = { 
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
      };

      if (!user || options.isYou) { return res.render('script', options, res); }

       Vote.findOne({ _scriptId: script._id, _userId: user._id },
         function (err, voteModel) {
           var voteUrl = '/vote/' + installName + '/';
           options.voteable = true;
           options.upUrl = voteUrl + 'up';
           options.downUrl = voteUrl + 'down';

           if (voteModel) {
             if (voteModel.vote) {
               options.up = true;
               options.upUrl = voteUrl + 'unvote';
             } else {
               options.down = true;
               options.downUrl = voteUrl + 'unvote';
             }
           }

           res.render('script', options, res);
       });
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

exports.vote = function (req, res, next) {
  var installName = scriptStorage.getInstallName(req);
  var vote = req.route.params.vote;
  var user = req.session.user;
  var url = req._parsedUrl.pathname.split('/');
  var unvote = false;

  if (!user) { return res.redirect('/login'); }
  url[1] = 'scripts';
  if (url.length > 5) { url.pop(); }
  url = url.join('/');

  if (vote === 'up') {
    vote = true;
  } else if (vote === 'down') {
    vote = false;
  } else if (vote === 'unvote') {
    unvote = true;
  } else {
    return res.redirect(url);
  }

  Script.findOne({ installName: installName + '.user.js' },
    function (err, script) {
      Vote.findOne({ _scriptId: script._id, _userId: user._id },
        function (err, voteModel) {
          var oldVote = null;
          var votes = script.votes || 0;

          if (user._id == script._authorId || (!voteModel && unvote)) {
            return res.redirect(url);
          } else if (!voteModel) {
            voteModel = new Vote({ 
              vote: vote,
              _scriptId: script._id,
              _userId: user._id
            });
            script.rating += vote ? 1 : -1;
            script.votes = votes + 1;
          } else if (unvote) {
            oldVote = voteModel.vote;
            voteModel.remove(function () {
              script.rating += oldVote ? -1 : 1;
              script.votes = votes <= 0 ? 0 : votes - 1;
              script.save(function(err, script) { res.redirect(url); });
            });
            return;
          } else if (voteModel.vote !== vote) {
            voteModel.vote = vote;
            script.rating += vote ? 2 : -2;
          }

          voteModel.save(function (err, vote) {
            script.save(function (err, script) { res.redirect(url); });
          });
      });
  });
};
