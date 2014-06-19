var fs = require('fs');
var formidable = require('formidable');
var async = require('async');
var _ = require('underscore');

var Discussion = require('../models/discussion').Discussion;
var Group = require('../models/group').Group;
var Script = require('../models/script').Script;
var Vote = require('../models/vote').Vote;

var scriptStorage = require('./scriptStorage');
var addScriptToGroups = require('./group').addScriptToGroups
var flagLib = require('../libs/flag');
var removeLib = require('../libs/remove');
var modelsList = require('../libs/modelsList');
var modelQuery = require('../libs/modelQuery');
var modelParser = require('../libs/modelParser');
var countTask = require('../libs/tasks').countTask;

// Let script controllers know this is a lib route
exports.lib = function (controller) {
  return (function (req, res, next) {
    req.route.params.isLib = true;
    controller(req, res, next);
  });
};

// Display which scripts use a library hosted on the site
exports.useLib = function (req, res, next) {
  var installName = req.route.params.shift().toLowerCase() + '/'
    + req.route.params.shift();
  var user = req.session.user;
  var options = { username: user ? user.name : '' };

  Script.findOne({ installName: installName + '.js' }, function (err, lib) {
    if (err || !lib) { return next(); }

    options.title = 'Scripts that use <a href="/libs/' + installName + '">'
      + lib.name + '</a>';
    modelsList.listScripts({ uses: lib.installName },
      req.route.params, '/use/lib/' + installName,
      function (scriptsList) {
        options.scriptsList = scriptsList;
        res.render('group', options);
    });
  });
};

var getScriptPageTasks = function(options) {
  var tasks = [];

  // Shortcuts
  var script = options.script;
  var authedUser = options.authedUser;


  //--- Tasks

  // Show the number of open issues
  var scriptOpenIssueCountQuery = Discussion.find({ category: script.issuesCategorySlug, open: {$ne: false} });
  tasks.push(countTask(scriptOpenIssueCountQuery, options, 'issueCount'));


  // Show collaborators of the script
  if (script.meta.author && script.meta.collaborator) {
    options.hasCollab = true;
    if (typeof script.meta.collaborator === 'string') {
      options.script.meta.collaborators = [{ name: script.meta.collaborator }];
    } else {
      options.script.meta.collaborators = [];
      script.meta.collaborator.forEach(function (collaborator) {
        options.script.meta.collaborators.push({ name: collaborator });
      });
    }
  }

  // Show licensings of the script
  if (script.meta.license) {
    if (typeof script.meta.license === 'string') {
      options.script.meta.licenses = [{ name: script.meta.license }];
    } else {
      options.script.meta.licenses = [];
      script.meta.license.forEach(function (license) {
        options.script.meta.licenses.push({ name: license });
      });
    }
  } else if (!script.isLib) {
      options.script.meta.licenses = [{ name: 'MIT License (Expat)' }];
  }

  // Show homepages of the script
  if (script.meta.homepageURL) {
    if (typeof script.meta.homepageURL === 'string') {
      options.script.meta.homepages = [{ name: script.meta.homepageURL }];
    } else {
      options.script.meta.homepages = [];
      script.meta.homepageURL.forEach(function (homepage) {
        options.script.meta.homepages.push({ name: homepage });
      });
    }
  }

  // Show the groups the script belongs to
  tasks.push(function (callback) {
    script.hasGroups = false;
    script.groups = [];

    Group.find({
      _scriptIds: script._id
    }, function (err, scriptGroupList) {
      if (err) return callback(err);

      scriptGroupList = _.map(scriptGroupList, modelParser.parseGroup);

      script.hasGroups = scriptGroupList.length > 0;
      script.groups = scriptGroupList;

      callback();
    });
  });

  // Show which libraries hosted on the site a script uses
  if (!script.isLib && script.uses && script.uses.length > 0) {
    script.usesLibs = true;
    script.libs = [];
    tasks.push(function (callback) {
      Script.find({
        installName: { $in: script.uses }
      }, function (err, scriptLibraryList) {
        if (err) return callback(err);

        script.libs = scriptLibraryList;
        script.libs = _.map(script.libs, modelParser.parseScript);
        callback();
      });
    });
  } else if (script.isLib) {
    script.isUsed = false;
    script.usedBy = [];
    tasks.push(function (callback) {
      Script.find({
        uses: script.installName
      }, function (err, libraryScriptList) {
        if (err) return callback(err);

        script.isUsed = libraryScriptList.length > 0;
        script.usedBy = libraryScriptList;
        script.usedBy = _.map(script.usedBy, modelParser.parseScript);
        callback();
      });
    });
  }

  // Setup the voting UI
  tasks.push(function (callback) {
    var voteUrl = '/vote' + script.scriptPageUrl;
    options.voteUpUrl = voteUrl + '/up';
    options.voteDownUrl = voteUrl + '/down';
    options.unvoteUrl = voteUrl + '/unvote';

    options.voteable = false;
    options.votedUp = false;
    options.votedDown = false;

    // Can't vote when not logged in or when user owns the script.
    if (!authedUser || options.isOwner) {
      callback();
      return;
    }

    Vote.findOne({
      _scriptId: script._id,
      _userId: authedUser._id
    }, function (err, voteModel) {
      options.voteable = !script.isOwner;

      if (voteModel) {
        if (voteModel.vote) {
          options.votedUp = true;
        } else {
          options.votedDown = true;
        }
      }

      callback();
    });

  });

  // Setup the flagging UI
  tasks.push(function (callback) {
    var flagUrl = '/flag' + (script.isLib ? '/libs/' : '/scripts/') + script.installNameSlug;

    // Can't flag when not logged in or when user owns the script.
    if (!authedUser || options.isOwner) {
      callback();
      return;
    }

    flagLib.flaggable(Script, script, authedUser,
      function (canFlag, author, flag) {
        if (flag) {
          flagUrl += '/unflag';
          options.flagged = true;
          options.canFlag = true;
        } else {
          options.canFlag = canFlag;
        }
        options.flagUrl = flagUrl;

        callback();
    });
  });

  // Set up the removal UI
  tasks.push(function (callback) {
    // Can't remove when not logged in or when user owns the script.
    if (!authedUser || options.isOwner) {
      callback();
      return;
    }

    removeLib.removeable(Script, script, authedUser,
      function (canRemove, author) {
        options.canRemove = canRemove;
        options.flags = script.flags || 0;
        options.removeUrl = '/remove' + (script.isLib ? '/libs/' : '/scripts/') + script.installNameSlug;

        if (!canRemove) { return callback(); }

        flagLib.getThreshold(Script, script, author,
          function (threshold) {
            options.threshold = threshold;
            callback();
        });
    });
  });

  return tasks;
};

var setupScriptSidePanel = function(options) {
  // Shortcuts
  var script = options.script;
  var authedUser = options.authedUser;

  // User
  if (options.isOwner) {
    options.authorTools = {};
  }

  // Mod
  if (authedUser && authedUser.isMod) {
    //options.authorTools = {}; // TODO: Support moderator edits on scripts?
    options.modTools = {};
  }

  // Admin
  if (authedUser && authedUser.isAdmin) {
    options.adminTools = {};
  }
};

// View a detailed description of a script
// This is the most intensive page to render on the site
exports.view = function (req, res, next) {
  var authedUser = req.session.user;

  var installNameSlug = scriptStorage.getInstallName(req);
  var scriptAuthor = req.route.params.username;
  var scriptNameSlug = req.route.params.scriptname;
  var isLib = req.route.params.isLib;

  Script.findOne({
    installName: scriptStorage
      .installNameRegex(installNameSlug + (isLib ? '.js' : '.user.js'))
  }, function (err, scriptData) {
    if (err || !scriptData) { return next(); }

    var options = {};
    var tasks = [];

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    // Script
    var script = options.script = modelParser.parseScript(scriptData);
    options.isOwner = authedUser && authedUser._id == script._authorId;
    modelParser.renderScript(script);
    script.installNameSlug = installNameSlug;
    script.scriptPermalinkInstallPageUrl = 'http://' + req.get('host') + script.scriptInstallPageUrl;

    // Metadata
    options.title = script.name + ' | OpenUserJS.org';
    options.pageMetaDescription = script.meta.description ? script.meta.description : null;
    options.isScriptPage = true;

    // SearchBar
    options.searchBarPlaceholder = modelQuery.scriptListQueryDefaults.searchBarPlaceholder;
    options.searchBarFormAction = modelQuery.scriptListQueryDefaults.searchBarFormAction;

    // SideBar
    setupScriptSidePanel(options);

    //--- Tasks
    tasks = tasks.concat(getScriptPageTasks(options));


    //---
    function preRender(){
      var pageMetaKeywords = ['userscript', 'greasemonkey'];
      if (script.groups)
        pageMetaKeywords.concat(_.pluck(script.groups, 'name'));
      options.pageMetaKeywords = pageMetaKeywords.join(', ');
    };
    function render(){ res.render('pages/scriptPage', options); }
    function asyncComplete(){ preRender(); render(); }
    async.parallel(tasks, asyncComplete);
  });
};

// route to edit a script
exports.edit = function (req, res, next) {
  var authedUser = req.session.user;

  if (!authedUser) { return res.redirect('/login'); }

  // Support routes lacking the :username. TODO: Remove this functionality.
  req.route.params.username = authedUser.name.toLowerCase();

  var installNameSlug = scriptStorage.getInstallName(req);
  var scriptAuthor = req.route.params.username;
  var scriptNameSlug = req.route.params.scriptname;
  var isLib = req.route.params.isLib;

  Script.findOne({
    installName: scriptStorage
      .installNameRegex(installNameSlug + (isLib ? '.js' : '.user.js'))
  }, function (err, scriptData) {
    if (err || !scriptData) { return next(); }

    //
    var options = {};
    var tasks = [];

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    //
    var script = options.script = modelParser.parseScript(scriptData);
    options.isOwner = authedUser && authedUser._id == script._authorId;
    options.title = 'Edit Metadata: ' + script.name + ' | OpenUserJS.org';

    // If authed user is not the script author.
    if (!options.isOwner) { return next(); }

    // SearchBar
    options.searchBarPlaceholder = modelQuery.scriptListQueryDefaults.searchBarPlaceholder;
    options.searchBarFormAction = modelQuery.scriptListQueryDefaults.searchBarFormAction;

    var baseUrl = script && script.isLib ? '/libs/' : '/scripts/';

    if (req.body.remove) {
      // POST
      scriptStorage.deleteScript(scriptData.installName, function () {
        res.redirect(authedUser.userScriptListPageUrl);
      });
    } else if (typeof req.body.about !== 'undefined') {
      // POST
      scriptData.about = req.body.about;
      var scriptGroups = (req.body.groups || "");
      scriptGroups = scriptGroups.split(/,/);
      addScriptToGroups(scriptData, scriptGroups, function () {
        res.redirect(script.scriptPageUrl);
      });
    } else {
      // GET

      options.script = script;

      tasks = tasks.concat(getScriptPageTasks(options));

      tasks.push(function (callback) {
        callback();
      });

      // Groups
      options.canCreateGroup = (!script._groupId).toString();

      function preRender(){
        var groupNameList = (options.script.groups || []).map(function (group) {
          return group.name;
        });
        options.groupNameListJSON = JSON.stringify(groupNameList);

      };
      function render(){ res.render('pages/scriptEditMetadataPage', options); }
      function asyncComplete(){ preRender(); render(); }
      async.parallel(tasks, asyncComplete);

      // Group.find({ _scriptIds: script._id }, 'name', function (err, groups) {
      //   var groupsArr = (groups || []).map(function (group) {
      //     return group.name;
      //   });

      //   res.render('scriptEdit', {
      //     title: script.name,
      //     name: script.name,
      //     install: (script.isLib ? '/libs/src/' : '/install/')
      //       + script.installName,
      //     source: baseUrl + installName + '/source',
      //     about: script.about,
      //     groups: JSON.stringify(groupsArr),
      //     canCreateGroup: (!script._groupId).toString(),
      //     isLib: script.isLib,
      //     username: user ? user.name : null
      //   });
      // });
    }
  });
};

// Script voting
exports.vote = function (req, res, next) {
  var isLib = req.route.params.isLib;
  var installName = scriptStorage.getInstallName(req)
    + (isLib ? '.js' : '.user.js');
  var vote = req.route.params.vote;
  var user = req.session.user;
  var url = req._parsedUrl.pathname.split('/');
  var unvote = false;

  if (!user) { return res.redirect('/login'); }
  if (url.length > 5) { url.pop(); }
  url.shift();
  url.shift();
  url = '/' + url.join('/');
  url = encodeURI(url);

  if (vote === 'up') {
    vote = true;
  } else if (vote === 'down') {
    vote = false;
  } else if (vote === 'unvote') {
    unvote = true;
  } else {
    return res.redirect(url);
  }

  Script.findOne({ installName: scriptStorage.installNameRegex(installName) },
    function (err, script) {
      if (err || !script) { return res.redirect(url); }

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

// Script flagging
exports.flag = function (req, res, next) {
  var isLib = req.route.params.isLib;
  var installName = scriptStorage.getInstallName(req);
  var unflag = req.route.params.unflag;

  Script.findOne({ installName:  scriptStorage
      .installNameRegex(installName + (isLib ? '.js' : '.user.js')) },
    function (err, script) {
      var fn = flagLib[unflag && unflag === 'unflag' ? 'unflag' : 'flag'];
      if (err || !script) { return next(); }

      fn(Script, script, req.session.user, function (flagged) {
        res.redirect((isLib ? '/libs/' : '/scripts/') + encodeURI(installName));
      });
  });
};
