'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var async = require('async');
var _ = require('underscore');

var Group = require('../models/group').Group;
var Script = require('../models/script').Script;

var modelParser = require('../libs/modelParser');
var modelQuery = require('../libs/modelQuery');
var cleanFilename = require('../libs/helpers').cleanFilename;
var getRating = require('../libs/collectiveRating').getRating;
var execQueryTask = require('../libs/tasks').execQueryTask;
var pageMetadata = require('../libs/templateHelpers').pageMetadata;
var orderDir = require('../libs/templateHelpers').orderDir;

// clean the name of the group so it is url safe
function cleanGroupName(aName) {
  return cleanFilename(aName, '').replace(/_/g, ' ')
    .replace(/^\s+|\s+$/g, '').replace(/,/g, '');
}

// api for the client side javascript select2 library
exports.search = function (aReq, aRes) {
  var queryStr = '';
  var queryRegex = null;
  var addTerm = aReq.params.addTerm;
  var term = cleanGroupName(aReq.params.term);
  var terms = term.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1').split(/\s+/);
  var results = null;

  aRes.set('Content-Type', 'application/json');
  if (terms.length === 0) {
    return aRes.end(JSON.stringify([]));
  }

  terms.forEach(function (aTerm) {
    queryStr += '(?=.*?' + aTerm + ')';
  });
  queryRegex = new RegExp(queryStr, 'i');

  Group.find({ name: queryRegex }, 'name', function (aErr, aGroups) {
    if (aErr) { aGroups = []; }

    results = aGroups.map(function (aGroup) {
      return aGroup.name;
    });

    if (addTerm && term.length > 0 && results.indexOf(term) === -1) {
      results.push(term);
    }

    aRes.end(JSON.stringify(results));
  });
};

// When the select2 library submits
exports.addScriptToGroups = function (aScript, aGroupNames, aCallback) {
  if (aScript.isLib || !aGroupNames || aGroupNames[0].length === 0) {
    return aScript.save(aCallback);
  }

  Group.find({ name: { $in: aGroupNames } }, function (aErr, aGroups) {
    var existingGroups = null;
    var existingNames = null;
    var newGroup = null;
    var tasks = [];

    if (aErr || !aGroups) { aGroups = []; }

    // Groups to add the script to
    // This could have been added to the above query but
    // We need to figure out which groups don't exist as well (see below)
    existingGroups = aGroups.filter(function (aGroup) {
      return aGroup._scriptIds.indexOf(aScript._id) === -1;
    });

    // Names of existing groups
    existingNames = aGroups.map(function (aGroup) {
      return aGroup.name;
    });

    // Name of a group that doesn't exist
    newGroup = cleanGroupName(aGroupNames.filter(function (aName) {
      return existingNames.indexOf(aName) === -1;
    }).shift());

    // Add script to exising groups
    tasks.push(function (aCallback) {
      async.each(existingGroups, function (aGroup, aInnerCallback) {
        aGroup._scriptIds.push(aScript._id);
        aGroup.update = new Date();
        aGroup.save(aInnerCallback);
      }, aCallback);
    });

    // Create a custom group for the script
    if (!aScript._groupId && newGroup) {
      tasks.push(function (aCallback) {
        var group = new Group({
          name: newGroup,
          rating: 0,
          updated: new Date(),
          _scriptIds: [aScript._id]
        });

        group.save(function (aErr, aGroup) {
          aScript._groupId = aGroup._id;
          aCallback();
        });
      });
    }

    async.parallel(tasks, function () {
      aScript.save(aCallback);

      // Update the groups in the background
      aGroups.forEach(function (aGroup) {
        Script.find({ _id: { $in: aGroup._scriptIds } },
          function (aErr, aScripts) {
            if (aErr || aScripts.length < 2) { return; }

            aGroup.size = aScripts.length;
            aGroup.rating = getRating(aScripts);
            aGroup.updated = new Date();
            aGroup.save(function () { });
          }
        );
      });
    });
  });
};

// list groups
exports.list = function (aReq, aRes) {
  var authedUser = aReq.session.user;

  //
  var options = {};
  var tasks = [];

  //---
  function preRender() {
    // groupList
    options.groupList = _.map(options.groupList, modelParser.parseGroup);

    // Pagination
    options.paginationRendered = pagination.renderDefault(aReq);

    // popularGroupList
    options.popularGroupList = _.map(options.popularGroupList, modelParser.parseGroup);

    // Page metadata
    if (options.groupList) {
      pageMetadata(options, 'Groups', null, _.pluck(options.groupList, 'name'));
    }
  }
  function render() { aRes.render('pages/groupListPage', options); }
  function asyncComplete() { preRender(); render(); }

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // Page metadata
  pageMetadata(options, 'Groups');

  // Order dir
  orderDir(aReq, options, 'name', 'asc');
  orderDir(aReq, options, 'size', 'desc');
  orderDir(aReq, options, 'rating', 'desc');

  // groupListQuery
  var groupListQuery = Group.find();  // TODO: STYLEGUIDE.md conformance needed here

  // groupListQuery: Defaults
  modelQuery.applyGroupListQueryDefaults(groupListQuery, options, aReq);

  // groupListQuery: Pagination
  var pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

  // popularGroupListQuery
  var popularGroupListQuery = Group.find();
  popularGroupListQuery
    .sort('-size')
    .limit(25);

  //--- Tasks

  // Pagination
  tasks.push(pagination.getCountTask(groupListQuery));

  // groupListQuery
  tasks.push(execQueryTask(groupListQuery, options, 'groupList'));

  // popularGroupListQuery
  tasks.push(execQueryTask(popularGroupListQuery, options, 'popularGroupList'));

  //---
  async.parallel(tasks, asyncComplete);
};

var setupGroupSidePanel = function (aOptions) {
  // Shortcuts
  var authedUser = aOptions.authedUser;

  // Mod
  if (authedUser && authedUser.isMod) {
    aOptions.modTools = {};
  }

  // Admin
  if (authedUser && authedUser.isAdmin) {
    aOptions.adminTools = {};
  }
};

// list the scripts in a group
exports.view = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  var groupNameSlug = aReq.params.groupname;
  var groupName = groupNameSlug.replace(/_+/g, ' ');

  Group.findOne({
    name: groupName
  }, function (aErr, aGroupData) {
    if (aErr || !aGroupData) { return aNext(); }

    // Don't show page if we have no scripts assigned to it yet.
    if (aGroupData._scriptIds.length === 0) { return aNext(); }

    //
    var options = {};
    var tasks = [];

    //---
    function preRender() {
      // scriptList
      options.scriptList = _.map(options.scriptList, modelParser.parseScript);

      // popularGroupList
      options.popularGroupList = _.map(options.popularGroupList, modelParser.parseGroup);

      // Pagination
      options.paginationRendered = pagination.renderDefault(aReq);

      // Empty list
      options.scriptListIsEmptyMessage = 'No scripts.';
      if (options.isFlagged) {
        if (options.librariesOnly) {
          options.scriptListIsEmptyMessage = 'No flagged libraries.';
        } else {
          options.scriptListIsEmptyMessage = 'No flagged scripts.';
        }
      } else if (options.searchBarValue) {
        if (options.librariesOnly) {
          options.scriptListIsEmptyMessage = 'We couldn\'t find any libraries with this search value.';
        } else {
          options.scriptListIsEmptyMessage = 'We couldn\'t find any scripts with this search value.';
        }
      } else if (options.isUserScriptListPage) {
        options.scriptListIsEmptyMessage = 'This user hasn\'t added any scripts yet.';
      }
    }
    function render() { aRes.render('pages/groupScriptListPage', options); }
    function asyncComplete() { preRender(); render(); }

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    // Page metadata
    var group = options.group = modelParser.parseGroup(aGroupData);
    pageMetadata(options, [group.name, 'Groups']);

    // Order dir
    orderDir(aReq, options, 'name', 'asc');
    orderDir(aReq, options, 'install', 'desc');
    orderDir(aReq, options, 'rating', 'desc');
    orderDir(aReq, options, 'updated', 'desc');

    // scriptListQuery
    var scriptListQuery = Script.find();

    // scriptListQuery: script in group
    scriptListQuery.find({ _id: { $in: group._scriptIds } });

    // scriptListQuery: isLib=false
    scriptListQuery.find({ isLib: { $ne: true } });

    // scriptListQuery: Defaults
    modelQuery.applyScriptListQueryDefaults(scriptListQuery, options, aReq);

    // scriptListQuery: Pagination
    var pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

    // popularGroupListQuery
    var popularGroupListQuery = Group.find();
    popularGroupListQuery
      .sort('-size')
      .limit(25);

    // SideBar
    setupGroupSidePanel(options);

    //--- Tasks

    // Pagination
    tasks.push(pagination.getCountTask(scriptListQuery));

    // scriptListQuery
    tasks.push(execQueryTask(scriptListQuery, options, 'scriptList'));

    // popularGroupListQuery
    tasks.push(execQueryTask(popularGroupListQuery, options, 'popularGroupList'));

    //---
    async.parallel(tasks, asyncComplete);
  });
};
