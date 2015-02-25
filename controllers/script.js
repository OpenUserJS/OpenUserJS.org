'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var async = require('async');
var _ = require('underscore');
var sanitizeHtml = require('sanitize-html');
var htmlWhitelistLink = require('../libs/htmlWhitelistLink.json');

var Discussion = require('../models/discussion').Discussion;
var Group = require('../models/group').Group;
var Script = require('../models/script').Script;
var Vote = require('../models/vote').Vote;

var scriptStorage = require('./scriptStorage');
var addScriptToGroups = require('./group').addScriptToGroups;
var flagLib = require('../libs/flag');
var removeLib = require('../libs/remove');
var modelQuery = require('../libs/modelQuery');
var modelParser = require('../libs/modelParser');
var countTask = require('../libs/tasks').countTask;
var pageMetadata = require('../libs/templateHelpers').pageMetadata;
var removeReasons = require('../views/includes/scriptModals.json').removeReasons;

// Let controllers know this is a `new` route
exports.new = function (aController) {
  return (function (aReq, aRes, aNext) {
    aReq.params.isNew = true;
    aController(aReq, aRes, aNext);
  });
};

// Let controllers know this is a `lib` route
exports.lib = function (aController) {
  return (function (aReq, aRes, aNext) {
    aReq.params.isLib = true;
    aController(aReq, aRes, aNext);
  });
};

var getScriptPageTasks = function (aOptions) {
  var tasks = [];

  // Shortcuts
  var script = aOptions.script;
  var authedUser = aOptions.authedUser;

  // Temporaries
  var htmlStub = null;

  // Default to infinity
  aOptions.threshold = '\u221E';

  // Default to &ndash;
  aOptions.flags = '\u2013';

  //--- Tasks

  // Show the number of open issues
  var scriptOpenIssueCountQuery = Discussion.find({ category: scriptStorage
      .caseInsensitive(script.issuesCategorySlug), open: {$ne: false} });
  tasks.push(countTask(scriptOpenIssueCountQuery, aOptions, 'issueCount'));

  // Show the groups the script belongs to
  tasks.push(function (aCallback) {
    script.hasGroups = false;
    script.groups = [];

    Group.find({
      _scriptIds: script._id
    }, function (aErr, aScriptGroupList) {
      if (aErr) return aCallback(aErr);

      aScriptGroupList = _.map(aScriptGroupList, modelParser.parseGroup);

      script.hasGroups = aScriptGroupList.length > 0;
      script.groups = aScriptGroupList;

      aCallback();
    });
  });

  // Show homepages of the script
  if (script.meta.homepageURL) {
    if (typeof script.meta.homepageURL === 'string') {
      htmlStub = '<a href="' + script.meta.homepageURL + '"></a>';
      if (htmlStub === sanitizeHtml(htmlStub, htmlWhitelistLink)) {
        aOptions.script.homepages = [{
          url: script.meta.homepageURL,
          text: decodeURI(script.meta.homepageURL),
          hasNoFollow: !/^(?:https?:\/\/)?openuserjs\.org\//i.test(script.meta.homepageURL)
        }];
      }
    } else {
      aOptions.script.homepages = [];
      script.meta.homepageURL.forEach(function (aHomepage) {
        htmlStub = '<a href="' + aHomepage + '"></a>';
        if (htmlStub === sanitizeHtml(htmlStub, htmlWhitelistLink)) {
          aOptions.script.homepages.unshift({
            url: aHomepage,
            text: decodeURI(aHomepage),
            hasNoFollow: !/^(?:https?:\/\/)?openuserjs\.org/i.test(aHomepage)
          });
        }
      });
    }
  }

  // Show copyrights of the script
  if (script.meta.copyright) {
    if (typeof script.meta.copyright === 'string') {
      aOptions.script.copyrights = [{ name: script.meta.copyright }];
    } else {
      aOptions.script.copyrights = [];
      script.meta.copyright.forEach(function (aCopyright) {
        aOptions.script.copyrights.unshift({ name: aCopyright });
      });
    }
  }

  // Show licensings of the script
  if (script.meta.license) {
    if (typeof script.meta.license === 'string') {
      aOptions.script.licenses = [{ name: script.meta.license }];
    } else {
      aOptions.script.licenses = [];
      script.meta.license.forEach(function (aLicense) {
        aOptions.script.licenses.unshift({ name: aLicense });
      });
    }
  } else if (!script.isLib) {
    aOptions.script.licenses = [{ name: 'MIT License (Expat)' }];
  }

  // Show collaborators of the script
  if (script.meta.oujs && script.meta.oujs.author && script.meta.oujs.collaborator) {
    aOptions.hasCollab = true;
    if (typeof script.meta.oujs.collaborator === 'string') {
      aOptions.script.collaborators = [{ url: encodeURIComponent(script.meta.oujs.collaborator), text: script.meta.oujs.collaborator }];
    } else {
      aOptions.script.collaborators = [];
      script.meta.oujs.collaborator.forEach(function (aCollaborator) {
        aOptions.script.collaborators.unshift({ url: encodeURIComponent(aCollaborator), text: aCollaborator });
      });
    }
  }

  // Show which libraries hosted on the site a script uses
  if (!script.isLib && script.uses && script.uses.length > 0) {
    script.libs = [];
    tasks.push(function (aCallback) {
      Script.find({
        installName: { $in: script.uses }
      }, function (aErr, aScriptLibraryList) {
        if (aErr) return aCallback(aErr);

        script.libs = aScriptLibraryList;
        script.libs = _.map(script.libs, modelParser.parseScript);

        if (script.libs.length > 0) {
          script.usesLibs = true;
        }
        aCallback();
      });
    });
  } else if (script.isLib) {
    script.isUsed = false;
    script.usedBy = [];
    tasks.push(function (aCallback) {
      Script.find({
        uses: script.installName
      }, function (aErr, aLibraryScriptList) {
        if (aErr) return aCallback(aErr);

        script.isUsed = aLibraryScriptList.length > 0;
        script.usedBy = aLibraryScriptList;
        script.usedBy = _.map(script.usedBy, modelParser.parseScript);
        aCallback();
      });
    });
  }

  // Setup the voting UI
  tasks.push(function (aCallback) {
    var voteUrl = '/vote' + script.scriptPageUrl;
    aOptions.voteUpUrl = voteUrl + '/up';
    aOptions.voteDownUrl = voteUrl + '/down';
    aOptions.unvoteUrl = voteUrl + '/unvote';

    aOptions.voteable = false;
    aOptions.votedUp = false;
    aOptions.votedDown = false;

    // Can't vote when not logged in or when user owns the script.
    if (!authedUser || aOptions.isOwner) {
      aCallback();
      return;
    }

    Vote.findOne({
      _scriptId: script._id,
      _userId: authedUser._id
    }, function (aErr, aVoteModel) {
      aOptions.voteable = !script.isOwner;

      if (aVoteModel) {
        if (aVoteModel.vote) {
          aOptions.votedUp = true;
        } else {
          aOptions.votedDown = true;
        }
      }

      aCallback();
    });

  });

  // Setup the flagging UI
  tasks.push(function (aCallback) {
    var flagUrl = '/flag' + (script.isLib ? '/libs/' : '/scripts/') + script.installNameSlug;

    // Can't flag when not logged in or when user owns the script.
    if (!authedUser || aOptions.isOwner) {
      aCallback();
      return;
    }

    flagLib.flaggable(Script, script, authedUser,
      function (aCanFlag, aAuthor, aFlag) {
        if (aFlag) {
          flagUrl += '/unflag';
          aOptions.flagged = true;
          aOptions.canFlag = true;
        } else {
          aOptions.canFlag = aCanFlag;
        }
        aOptions.flagUrl = flagUrl;

        aCallback();
      });
  });

  // Set up the removal UI
  tasks.push(function (aCallback) {
    // Can't remove when not logged in or when user owns the script.
    if (!authedUser || aOptions.isOwner) {
      aCallback();
      return;
    }

    removeLib.removeable(Script, script, authedUser, function (aCanRemove, aAuthor) {
      aOptions.canRemove = aCanRemove;
      aOptions.flags = script.flags || 0;
      aOptions.removeUrl = '/remove' + (script.isLib ? '/libs/' : '/scripts/') + script.installNameSlug;

      if (!aCanRemove) {
        return aCallback();
      }

      flagLib.getThreshold(Script, script, aAuthor, function (aThreshold) {
        aOptions.threshold = aThreshold || 0;
        aCallback();
      });
    });
  });

  return tasks;
};

var setupScriptSidePanel = function (aOptions) {
  // Shortcuts
  var authedUser = aOptions.authedUser;

  // User
  if (aOptions.isOwner) {
    aOptions.authorTools = {};
  }

  // Mod
  if (authedUser && authedUser.isMod) {
    //aOptions.authorTools = {}; // TODO: Support moderator edits on scripts?
    aOptions.modTools = {};

    if (removeReasons) {
      aOptions.modTools.hasRemoveReasons = true;
      aOptions.modTools.removeReasons = [];
      removeReasons.forEach(function (aReason) {
        aOptions.modTools.removeReasons.push({ 'name' : aReason });
      });
    }
  }

  // Admin
  if (authedUser && authedUser.isAdmin) {
    aOptions.adminTools = {};
  }
};

// View a detailed description of a script
// This is the most intensive page to render on the site
exports.view = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  var installNameSlug = scriptStorage.getInstallName(aReq);
  var isLib = aReq.params.isLib;

  Script.findOne({
    installName: scriptStorage
      .caseInsensitive(installNameSlug + (isLib ? '.js' : '.user.js'))
  }, function (aErr, aScriptData) {
    function preRender() {
      if (script.groups) {
        pageMetadata(options, ['About', script.name, (script.isLib ? 'Libraries' : 'Scripts')],
          script.meta.description, _.pluck(script.groups, 'name'));
      }
    }
    function render() { aRes.render('pages/scriptPage', options); }
    function asyncComplete() { preRender(); render(); }

    //---
    if (aErr || !aScriptData) { return aNext(); }

    var options = {};
    var tasks = [];

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    // Script
    var script = options.script = modelParser.parseScript(aScriptData);
    options.isOwner = authedUser && authedUser._id == script._authorId;
    modelParser.renderScript(script);
    script.installNameSlug = installNameSlug;
    script.scriptPermalinkInstallPageUrl = 'https://' + aReq.get('host') +
      script.scriptInstallPageUrl;

    // Page metadata
    pageMetadata(options, ['About', script.name, (script.isLib ? 'Libraries' : 'Scripts')],
      script.meta.description);
    options.isScriptPage = true;

    // SearchBar
    options.searchBarPlaceholder = modelQuery.scriptListQueryDefaults.searchBarPlaceholder;
    options.searchBarFormAction = modelQuery.scriptListQueryDefaults.searchBarFormAction;

    // SideBar
    setupScriptSidePanel(options);

    //--- Tasks
    tasks = tasks.concat(getScriptPageTasks(options));

    //---
    async.parallel(tasks, asyncComplete);
  });
};

// route to edit a script
exports.edit = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  // Support routes lacking the :username. TODO: Remove this functionality.
  aReq.params.username = authedUser.name.toLowerCase();

  var installNameSlug = scriptStorage.getInstallName(aReq);
  var isLib = aReq.params.isLib;

  Script.findOne({
    installName: scriptStorage
      .caseInsensitive(installNameSlug + (isLib ? '.js' : '.user.js'))
  }, function (aErr, aScriptData) {
    function preRender() {
      var groupNameList = (options.script.groups || []).map(function (aGroup) {
        return aGroup.name;
      });
      options.groupNameListJSON = JSON.stringify(groupNameList);

    }
    function render() { aRes.render('pages/scriptEditMetadataPage', options); }
    function asyncComplete() { preRender(); render(); }

    // ---
    if (aErr || !aScriptData) { return aNext(); }

    //
    var options = {};
    var tasks = [];

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    // Page metadata
    var script = options.script = modelParser.parseScript(aScriptData);
    options.isOwner = authedUser && authedUser._id == script._authorId;
    pageMetadata(options, ['Edit', script.name, (script.isLib ? 'Libraries' : 'Scripts')],
      script.name);

    // If authed user is not the script author.
    if (!options.isOwner) { return aNext(); }

    // SearchBar
    options.searchBarPlaceholder = modelQuery.scriptListQueryDefaults.searchBarPlaceholder;
    options.searchBarFormAction = modelQuery.scriptListQueryDefaults.searchBarFormAction;

    if (aReq.body.remove) {
      // POST
      scriptStorage.deleteScript(aScriptData.installName, function () {
        aRes.redirect(authedUser.userScriptListPageUrl);
      });
    } else if (typeof aReq.body.about !== 'undefined') {
      // POST
      aScriptData.about = aReq.body.about;
      var scriptGroups = (aReq.body.groups || "");
      scriptGroups = scriptGroups.split(/,/);
      addScriptToGroups(aScriptData, scriptGroups, function () {
        aRes.redirect(script.scriptPageUrl);
      });
    } else {
      // GET

      options.script = script;

      tasks = tasks.concat(getScriptPageTasks(options));

      tasks.push(function (aCallback) {
        aCallback();
      });

      // Groups
      options.canCreateGroup = (!script._groupId).toString();

      async.parallel(tasks, asyncComplete);
    }
  });
};

// Script voting
exports.vote = function (aReq, aRes, aNext) {
  var isLib = aReq.params.isLib;
  var installName = scriptStorage.getInstallName(aReq)
    + (isLib ? '.js' : '.user.js');
  var vote = aReq.params.vote;
  var authedUser = aReq.session.user;
  var url = aReq._parsedUrl.pathname.split('/');
  var unvote = false;

  if (url.length > 5) { url.pop(); }
  url.shift();
  url.shift();
  url = '/' + url.join('/');

  if (vote === 'up') {
    vote = true;
  } else if (vote === 'down') {
    vote = false;
  } else if (vote === 'unvote') {
    unvote = true;
  } else {
    return aRes.redirect(url);
  }

  Script.findOne({ installName: scriptStorage.caseInsensitive(installName) },
    function (aErr, aScript) {
      if (aErr || !aScript) { return aRes.redirect(url); }

      Vote.findOne({ _scriptId: aScript._id, _userId: authedUser._id },
        function (aErr, aVoteModel) {
          var oldVote = null;
          var votes = aScript.votes || 0;
          var flags = 0;

          function saveScript() {
            if (!flags) {
              return aScript.save(function (aErr, aScript) { aRes.redirect(url); });
            }

            flagLib.getAuthor(aScript, function (aAuthor) {
              flagLib.saveContent(Script, aScript, aAuthor, flags,
                function (aFlagged) {
                  aRes.redirect(url);
                });
            });
          }

          if (!aScript.rating) { aScript.rating = 0; }
          if (!aScript.votes) { aScript.votes = 0; }

          if (authedUser._id == aScript._authorId || (!aVoteModel && unvote)) {
            return aRes.redirect(url);
          } else if (!aVoteModel) {
            aVoteModel = new Vote({
              vote: vote,
              _scriptId: aScript._id,
              _userId: authedUser._id
            });
            aScript.rating += vote ? 1 : -1;
            aScript.votes = votes + 1;
            if (vote) { flags = -1; }
          } else if (unvote) {
            oldVote = aVoteModel.vote;
            return aVoteModel.remove(function () {
              aScript.rating += oldVote ? -1 : 1;
              aScript.votes = votes <= 0 ? 0 : votes - 1;
              if (oldVote) { flags = 1; }
              saveScript();
            });
          } else if (aVoteModel.vote !== vote) {
            aVoteModel.vote = vote;
            aScript.rating += vote ? 2 : -2;
            flags = vote ? -1 : 1;
          }

          aVoteModel.save(saveScript);
        }
      );
    }
  );
};

// Script flagging
exports.flag = function (aReq, aRes, aNext) {
  var isLib = aReq.params.isLib;
  var installName = scriptStorage.getInstallName(aReq);
  var unflag = aReq.params.unflag;

  Script.findOne({ installName:  scriptStorage
      .caseInsensitive(installName + (isLib ? '.js' : '.user.js')) },
    function (aErr, aScript) {
      var fn = flagLib[unflag && unflag === 'unflag' ? 'unflag' : 'flag'];
      if (aErr || !aScript) { return aNext(); }

      fn(Script, aScript, aReq.session.user, function (aFlagged) { // NOTE: Inline function here
        aRes.redirect((isLib ? '/libs/' : '/scripts/') + encodeURI(installName));
      });
    }
  );
};
