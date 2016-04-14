'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//

//--- Dependency inclusions
var async = require('async');
var _ = require('underscore');
var sanitizeHtml = require('sanitize-html');

//--- Model inclusions
var Discussion = require('../models/discussion').Discussion;
var Group = require('../models/group').Group;
var Script = require('../models/script').Script;
var Vote = require('../models/vote').Vote;

//--- Controller inclusions
var scriptStorage = require('./scriptStorage');

var addScriptToGroups = require('./group').addScriptToGroups;
var getFlaggedListForContent = require('./flag').getFlaggedListForContent;

//--- Library inclusions
// var scriptLib = require('../libs/script');

var flagLib = require('../libs/flag');
var removeLib = require('../libs/remove');

var modelQuery = require('../libs/modelQuery');
var modelParser = require('../libs/modelParser');

var decode = require('../libs/helpers').decode;
var countTask = require('../libs/tasks').countTask;
var pageMetadata = require('../libs/templateHelpers').pageMetadata;

//--- Configuration inclusions
var htmlWhitelistLink = require('../libs/htmlWhitelistLink.json');

var removeReasons = require('../views/includes/scriptModals.json').removeReasons;

//---

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
  var scriptOpenIssueCountQuery = null;
  var tasks = [];

  // Shortcuts
  var script = aOptions.script;
  var authedUser = aOptions.authedUser;

  // Intermediates
  var homepageURL = null;
  var copyright = null;
  var license = null;
  var author = null;
  var collaborator = null;

  // Temporaries
  var htmlStub = null;

  // Default to infinity
  aOptions.threshold = '\u221E';

  // Default to &ndash;
  aOptions.flags = '\u2013';

  //--- Tasks

  // Show the number of open issues
  scriptOpenIssueCountQuery = Discussion.find({ category: scriptStorage
    .caseSensitive(decodeURIComponent(script.issuesCategorySlug), true), open: {$ne: false} });
  tasks.push(countTask(scriptOpenIssueCountQuery, aOptions, 'issueCount'));

  // Show the groups the script belongs to
  tasks.push(function (aCallback) {
    script.hasGroups = false;
    script.groups = [];

    Group.find({
      _scriptIds: script._id
    }, function (aErr, aScriptGroupList) {
      if (aErr) {
        aCallback(aErr);
        return;
      }

      aScriptGroupList = _.map(aScriptGroupList, modelParser.parseGroup);

      script.hasGroups = aScriptGroupList.length > 0;
      script.groups = aScriptGroupList;

      aCallback();
    });
  });

  // Show homepages of the script
  homepageURL = scriptStorage.findMeta(script.meta, 'UserScript.homepageURL');
  if (homepageURL) {
    aOptions.script.homepages = [];
    homepageURL.forEach(function (aElement, aIndex, aArray) {
      htmlStub = '<a href="' + aElement.value + '"></a>';
      if (htmlStub === sanitizeHtml(htmlStub, htmlWhitelistLink)) {

        aOptions.script.homepages.unshift({
          url: aElement.value,
          text: decode(aElement.value),
          hasNoFollow: !/^(?:https?:\/\/)?openuserjs\.org\//i.
            test(aElement.value)
        });

      }
    });
  }

  // Show copyrights of the script
  copyright = scriptStorage.findMeta(script.meta, 'UserScript.copyright');
  if (copyright) {
    aOptions.script.copyrights = [];
    copyright.forEach(function (aElement, aIndex, aArray) {
      aOptions.script.copyrights.unshift({ name: aElement.value });
    });
  }

  // Show licensings of the script
  license = scriptStorage.findMeta(script.meta, 'UserScript.license');
  if (license) {
    aOptions.script.licenses = [];
    license.forEach(function (aElement, aIndex, aArray) {
      aOptions.script.licenses.unshift({ name: aElement.value });
    });
  } else if (!script.isLib) {
    aOptions.script.licenses = [{ name: 'MIT License (Expat)' }];
  }

  // Show collaborators of the script
  author = scriptStorage.findMeta(script.meta, 'OpenUserJS.author.0.value');
  collaborator = scriptStorage.findMeta(script.meta, 'OpenUserJS.collaborator');
  if (author && collaborator) {
    aOptions.hasCollab = true;

    aOptions.script.collaborators = [];
    collaborator.forEach(function (aElement, aIndex, aArray) {
      aOptions.script.collaborators.unshift({
        url: encodeURIComponent(aElement.value),
        text: aElement.value
      });
    });
  }

  // Show which libraries hosted on the site a script uses
  if (!script.isLib && script.uses && script.uses.length > 0) {
    script.libs = [];
    tasks.push(function (aCallback) {
      Script.find({
        installName: { $in: script.uses }
      }, function (aErr, aScriptLibraryList) {
        if (aErr) {
          aCallback(aErr);
          return;
        }

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
        if (aErr) {
          aCallback(aErr);
          return;
        }

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
    // Can't flag when not logged in or when user owns the script.
    if (!authedUser || aOptions.isOwner) {
      aCallback();
      return;
    }

    flagLib.flaggable(Script, script, authedUser,
      function (aCanFlag, aAuthor, aFlag) {
        if (aFlag) {
          aOptions.flagged = true;
          aOptions.canFlag = true;
        } else {
          aOptions.canFlag = aCanFlag;
        }

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
      aOptions.flags = (script.flags ? script.flags.critical : null) || 0;
      aOptions.removeUrl = '/remove' + (script.isLib ? '/libs/' : '/scripts/') + script.installNameSlug;

      if (!aCanRemove) {
        aCallback();
        return;
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
  var installNameBase = scriptStorage.getInstallNameBase(aReq);
  var isLib = aReq.params.isLib;

  Script.findOne({
    installName: scriptStorage.caseSensitive(installNameBase +
      (isLib ? '.js' : '.user.js'))
    }, function (aErr, aScript) {
      function preRender() {
        if (script.groups) {
          pageMetadata(options, ['About', script.name, (script.isLib ? 'Libraries' : 'Userscripts')],
            script.description, _.pluck(script.groups, 'name'));
        }
      }

      function render() {
        aRes.render('pages/scriptPage', options);
      }

      function asyncComplete() {

        async.parallel([
          function (aCallback) {
            if (!options.isAdmin) {  // NOTE: Watchpoint
              aCallback();
              return;
            }
            getFlaggedListForContent('Script', options, aCallback);
          }
        ], function (aErr) {
          preRender();
          render();
        });

      }

      //
      var options = {};
      var authedUser = aReq.session.user;
      var script = null;
      var tasks = [];

      //---
      if (aErr || !aScript) {
        aNext();
        return;
      }

      // Session
      options.authedUser = authedUser = modelParser.parseUser(authedUser);
      options.isMod = authedUser && authedUser.isMod;
      options.isAdmin = authedUser && authedUser.isAdmin;

      // Lockdown
      options.lockdown = {};
      options.lockdown.scriptStorageRO = process.env.READ_ONLY_SCRIPT_STORAGE === 'true';
      options.lockdown.updateURLCheck = process.env.FORCE_BUSY_UPDATEURL_CHECK === 'true';

      // Script
      options.script = script = modelParser.parseScript(aScript);
      options.isOwner = authedUser && authedUser._id == script._authorId;
      modelParser.renderScript(script);
      script.installNameSlug = installNameBase;
      script.scriptPermalinkInstallPageUrl = 'https://' + aReq.get('host') +
        script.scriptInstallPageUrl;
      script.scriptPermalinkInstallPageXUrl = 'https://' + aReq.get('host') +
        script.scriptInstallPageXUrl;
      script.scriptPermalinkMetaPageUrl = 'https://' + aReq.get('host') +
        script.scriptMetaPageUrl;

      // Page metadata
      pageMetadata(options, ['About', script.name, (script.isLib ? 'Libraries' : 'Userscripts')],
        script.description);
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
  //
  var installNameBase = scriptStorage.getInstallNameBase(aReq);
  var isLib = aReq.params.isLib;

  //---
  Script.findOne({
    installName: scriptStorage.caseSensitive(installNameBase +
      (isLib ? '.js' : '.user.js'))
    }, function (aErr, aScript) {
      function preRender() {
        var groupNameList = (options.script.groups || []).map(function (aGroup) {
          return aGroup.name;
        });
        options.groupNameListJSON = JSON.stringify(groupNameList);
      }

      function render() {
        aRes.render('pages/scriptEditMetadataPage', options);
      }

      function asyncComplete() {
        preRender();
        render();
      }

      //
      var options = {};
      var authedUser = aReq.session.user;
      var script = null;
      var scriptGroups = null;
      var tasks = [];

      // ---
      if (aErr || !aScript) {
        aNext();
        return;
      }

      // Session
      options.authedUser = authedUser = modelParser.parseUser(authedUser);
      options.isMod = authedUser && authedUser.isMod;
      options.isAdmin = authedUser && authedUser.isAdmin;

      // Page metadata
      options.script = script = modelParser.parseScript(aScript);
      options.isOwner = authedUser && authedUser._id == script._authorId;
      pageMetadata(options, ['Edit', script.name, (script.isLib ? 'Libraries' : 'Userscripts')],
        script.name);

      // If authed user is not the script author.
      if (!options.isOwner) {
        aNext();
        return;
      }

      // SearchBar
      options.searchBarPlaceholder = modelQuery.scriptListQueryDefaults.searchBarPlaceholder;
      options.searchBarFormAction = modelQuery.scriptListQueryDefaults.searchBarFormAction;

      if (aReq.body.remove) {
        // POST
        scriptStorage.deleteScript(aScript.installName, function () {
          aRes.redirect(authedUser.userScriptListPageUri);
        });
      } else if (typeof aReq.body.about !== 'undefined') {
        // POST
        aScript.about = aReq.body.about;
        scriptGroups = (aReq.body.groups || '');
        scriptGroups = scriptGroups.split(/,/);
        addScriptToGroups(aScript, scriptGroups, function () {
          aRes.redirect(script.scriptPageUri);
        });
      } else {
        // GET

        options.script = script;

        tasks = tasks.concat(getScriptPageTasks(options));

        // Groups
        options.canCreateGroup = (!script._groupId).toString();

        async.parallel(tasks, asyncComplete);
      }
    });
};

// Script voting
exports.vote = function (aReq, aRes, aNext) {
  //
  var uri = aReq._parsedUrl.pathname.split('/');
  var vote = aReq.params.vote;
  var unvote = false;

  var isLib = aReq.params.isLib;
  var installNameBase = scriptStorage.getInstallNameBase(aReq);

  // ---
  if (uri.length > 5) {
    uri.pop();
  }
  uri.shift();
  uri.shift();
  uri = '/' + uri.join('/');

  if (vote === 'up') {
    vote = true;
  } else if (vote === 'down') {
    vote = false;
  } else if (vote === 'unvote') {
    unvote = true;
  } else {
    aRes.redirect(uri);
    return;
  }

  Script.findOne({
    installName: scriptStorage.caseSensitive(installNameBase +
      (isLib ? '.js' : '.user.js'))
    }, function (aErr, aScript) {
      //
      var authedUser = aReq.session.user;

      // ---
      if (aErr || !aScript) {
        aRes.redirect(uri);
        return;
      }

      Vote.findOne({ _scriptId: aScript._id, _userId: authedUser._id },
        function (aErr, aVoteModel) {
          var votes = aScript.votes || 0;
          var flags = 0;
          var oldVote = null;

          function saveScript() {
            if (!flags) {
              aScript.save(function (aErr, aScript) {
                var script = null;

                if (vote === false) {
                  script = modelParser.parseScript(aScript);

                  // Gently encourage browsing/creating an issue with a down vote
                  aRes.redirect(script.scriptIssuesPageUri);
                } else {
                  aRes.redirect(uri);
                }
              });
              return;
            }

            flagLib.getAuthor(aScript, function (aAuthor) {
              flagLib.saveContent(Script, aScript, aAuthor, flags, false,
                function (aFlagged) {
                  aRes.redirect(uri);
                });
            });
          }

          if (!aScript.rating) {
            aScript.rating = 0;
          }

          if (!aScript.votes) {
            aScript.votes = 0;
          }

          if (authedUser._id == aScript._authorId || (!aVoteModel && unvote)) {
            aRes.redirect(uri);
            return;
          } else if (!aVoteModel) {
            aVoteModel = new Vote({
              vote: vote,
              _scriptId: aScript._id,
              _userId: authedUser._id
            });
            aScript.rating += vote ? 1 : -1;
            aScript.votes = votes + 1;
            if (vote) {
              flags = -1;
            }
          } else if (unvote) {
            oldVote = aVoteModel.vote;
            aVoteModel.remove(function () {
              aScript.rating += oldVote ? -1 : 1;
              aScript.votes = votes <= 0 ? 0 : votes - 1;
              if (oldVote) {
                flags = 1;
              }
              saveScript();
            });
            return;
          } else if (aVoteModel.vote !== vote) {
            aVoteModel.vote = vote;
            aScript.rating += vote ? 2 : -2;
            flags = vote ? -1 : 1;
          }

          aVoteModel.save(saveScript);
        }
      );
    });
};
