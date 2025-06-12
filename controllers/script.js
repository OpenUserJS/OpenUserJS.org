'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//

//--- Dependency inclusions
var async = require('async');
var _ = require('underscore');
var SPDX = require('spdx-license-ids');
var remark = require('remark');
var stripHTML = require('remark-strip-html');
var stripMD = require('strip-markdown');

//--- Model inclusions
var Discussion = require('../models/discussion').Discussion;
var Group = require('../models/group').Group;
var Script = require('../models/script').Script;

//--- Controller inclusions
var scriptStorage = require('./scriptStorage');

var addScriptToGroups = require('./group').addScriptToGroups;
var getFlaggedListForContent = require('./flag').getFlaggedListForContent;

//--- Library inclusions
// var scriptLib = require('../libs/script');

var statusCodePage = require('../libs/templateHelpers').statusCodePage;
var isSameOrigin = require('../libs/helpers').isSameOrigin;

var voteLib = require('../libs/vote');
var flagLib = require('../libs/flag');
var removeLib = require('../libs/remove');

var modelParser = require('../libs/modelParser');
var modelQuery = require('../libs/modelQuery');

var decode = require('../libs/helpers').decode;
var isFQUrl = require('../libs/helpers').isFQUrl;

var countTask = require('../libs/tasks').countTask;
var pageMetadata = require('../libs/templateHelpers').pageMetadata;

//--- Configuration inclusions
var removeReasons = require('../views/includes/scriptModals.json').removeReasons;
var settings = require('../models/settings.json');

//---

// Let controllers know this is a `new` route
exports.new = function (aController) {
  return (function (aReq, aRes, aNext) {
    aReq.params.isNew = true;
    aReq.params.isLib = false; // NOTE: Set default .user.js and overridden below
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
  var licenseConflict = false;
  var antifeature = null;
  var types = [];
  var author = null;
  var collaborator = null;

  // Temporaries

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
      if (isFQUrl(aElement.value)) {

        aOptions.script.homepages.unshift({
          url: aElement.value,
          text: decode(aElement.value),
          isSameOrigin: isSameOrigin(aElement.value).result
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
      var keyComponents = aElement.value.split('; ');
      var thatSPDX = keyComponents[0];
      var thatURL = keyComponents[1];

      if (SPDX.indexOf(thatSPDX.replace(/\+$/, '')) > -1) {
        aOptions.script.licenses.unshift({
          spdx: thatSPDX,
          url: thatURL
        });
      } else {
        if (aElement.value.indexOf('GPL') > -1) { // NOTE: The one and only exception.
          aOptions.script.licenseParadox = true;
        }
        aOptions.script.licenseConflict = true;
        aOptions.script.licenses.unshift({
          name: aElement.value
        });
      }
    });
  } else {
    aOptions.script.licenseConflict = true;
  }

  // Show antifeatures of the script
  antifeature = scriptStorage.findMeta(script.meta, 'UserScript.antifeature');
  if (antifeature) {
    aOptions.hasAntiFeature = true;

    antifeature.forEach(function (aElement, aIndex, aArray) {
      var type = types[aElement.value1];
      var comment = type ? (type.comment || '') : '';

      types[aElement.value1] = { name: aElement.value1, comment:
        (aElement.value2 ? aElement.value2 : '')
          + (comment ? (aElement.value2 ? '\n' : '') + comment: '')
      };
    });

    aOptions.script.antifeatures = Object.values(types);
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

    voteLib.voteable(script, authedUser,
      function (aCanVote, aAuthor, aVote) {
        if (aVote) {
          aOptions.votedUp = aVote.vote === true;
          aOptions.votedDown = aVote.vote === false;
          aOptions.canVote = true;
        } else {
          aOptions.canVote = aCanVote;
        }
        aCallback();
      });
  });

  // Setup the flagging UI
  tasks.push(function (aCallback) {
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
            script._description, _.pluck(script.groups, 'name'));
        }
      }

      function render() {
        aRes.render('pages/scriptPage', options);
      }

      function asyncComplete() {

        async.parallel([
          function (aCallback) {
            if (!options.isMod) {  // NOTE: Watchpoint
              aCallback();
              return;
            }
            getFlaggedListForContent('Script', options, aCallback);
          }
        ], function (aErr) {
          // WARNING: No err handling

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
        script._description);
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

      var parser = 'UserScript';
      var rHeaderContent = new RegExp(
        '^(?:\\uFEFF)?\/\/ ==' + parser + '==([\\s\\S]*?)^\/\/ ==\/'+ parser + '==', 'm'
      );
      var headerContent = null;

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

        // Simple validation check
        headerContent = rHeaderContent.exec(aScript.about);
        if (headerContent) {
          statusCodePage(aReq, aRes, aNext, {
            statusCode: 403, // Forbidden
            statusMessage: 'Source Code not allowed in Script Info.'
          });
          return;
        }

        remark().use(stripHTML).use(stripMD).process(aScript.about, function(aErr, aFile) {
          if (aErr || !aFile) {
            aScript._about = (
              aScript.about
                ? aScript.about.substr(0, settings.scriptSearchQueryStoreMaxAbout).trim()
                : ''
            );
          } else {
            aScript._about = (
              aFile.contents
                ? aFile.contents.replace(/(\r\n|\n|\r)+/gm, ' ')
                  .substr(0, settings.scriptSearchQueryStoreMaxAbout).trim()
                : ''
            );
          }

          scriptGroups = (aReq.body.groups || '');
          scriptGroups = scriptGroups.split(/,/);
          addScriptToGroups(aScript, scriptGroups, function () {
            aRes.redirect(script.scriptPageUri);
          });
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
