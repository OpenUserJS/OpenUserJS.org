var fs = require('fs');
var formidable = require('formidable');
var scriptStorage = require('./scriptStorage');
var User = require('../models/user').User;
var Script = require('../models/script').Script;
var Vote = require('../models/vote').Vote;
var Flag = require('../models/flag').Flag;
var flagLib = require('../libs/flag');

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
        username: user ? user.name : null,
        isFork: !!fork
      };

      if (!user || options.isYou) {
        return res.render('script', options);
      }

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

           flagLib.flaggable(Script, script, user,
             function (canFlag, author, flag) {
             var flagUrl = '/flag/' + installName;

               function setThreshold (author) {
                 flagLib.getThreshold(Script, script, author,
                   function (threshold) {
                     options.threshold = threshold;
                     res.render('script', options);
                 });
               }

               if (flag) {
                 flagUrl += '/unflag';
                 options.flagged = true;
                 options.flaggable = true;
               } else {
                 options.flaggable = canFlag;
               }
               options.flagUrl = flagUrl;

             if (user.role < 3 || (script.flagged && user.role < 4)) {
               options.moderation = true;
               options.flags = script.flags || 0;
               options.removeUrl = '/remove/scripts/' + installName;
               if (author) {
                 return setThreshold(author);
               } else {
                 return flagLib.getAuthor(script, function (author) {
                   setThreshold(author);
                 });
               }
             }
             

             res.render('script', options);
           });
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
          about: script.about,
          username: user ? user.name : null
        });
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
          var flags = 0;

          function saveScript () {
            if (!flags) {
              return script.save(function (err, script) { res.redirect(url); });
            }

            flagLib.getAuthor(script, function(author) {
              flagLib.saveContent(Script, script, author, flags,
                function (flagged) {
                  res.redirect(url);
              });
            });
          }

          if (!script.rating) { script.rating = 0; }
          if (!script.votes) { script.votes = 0; }

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
            if (vote) { flags = -1; }
          } else if (unvote) {
            oldVote = voteModel.vote;
            return voteModel.remove(function () {
              script.rating += oldVote ? -1 : 1;
              script.votes = votes <= 0 ? 0 : votes - 1;
              if (oldVote) { flags = 1; }
              saveScript();
            });
          } else if (voteModel.vote !== vote) {
            voteModel.vote = vote;
            script.rating += vote ? 2 : -2;
            flags = vote ? -1 : 1;
          }

          voteModel.save(saveScript);
      });
  });
};

exports.flag = function (req, res, next) {
  var installName = scriptStorage.getInstallName(req);
  var unflag = req.route.params.unflag;

  Script.findOne({ installName: installName + '.user.js' },
    function (err, script) {
      var fn = flagLib[unflag && unflag === 'unflag' ? 'unflag' : 'flag'];
      if (err || !script) { return next(); }

      fn(Script, script, req.session.user, function (flagged) {
        res.redirect('/scripts/' + installName);
      });
  });
};
