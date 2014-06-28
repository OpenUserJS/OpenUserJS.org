var async = require('async');
var _ = require('underscore');

var Group = require('../models/group').Group;
var Script = require('../models/script').Script;

var modelsList = require('../libs/modelsList');
var modelParser = require('../libs/modelParser');
var modelQuery = require('../libs/modelQuery');
var cleanFilename = require('../libs/helpers').cleanFilename;
var getRating = require('../libs/collectiveRating').getRating;
var execQueryTask = require('../libs/tasks').execQueryTask;
var pageMetadata = require('../libs/templateHelpers').pageMetadata;

// clean the name of the group so it is url safe
function cleanGroupName(name) {
  return cleanFilename(name, '').replace(/_/g, ' ')
    .replace(/^\s+|\s+$/g, '').replace(/,/g, '');
}

// api for the client side javascript select2 library
exports.search = function (req, res) {
  var queryStr = '';
  var queryRegex = null;
  var addTerm = req.route.params.addTerm;
  var term = cleanGroupName(req.route.params.term);
  var terms = term.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1').split(/\s+/);
  var results = null;

  res.set('Content-Type', 'application/json');
  if (terms.length === 0) {
    return res.end(JSON.stringify([]));
  }

  terms.forEach(function (term) {
    queryStr += '(?=.*?' + term + ')';
  });
  queryRegex = new RegExp(queryStr, 'i');

  Group.find({ name: queryRegex }, 'name', function (err, groups) {
    if (err) { groups = []; }

    results = groups.map(function (group) {
      return group.name;
    });

    if (addTerm && term.length > 0 && results.indexOf(term) === -1) {
      results.push(term);
    }

    res.end(JSON.stringify(results));
  });
};

// When the select2 library submits
exports.addScriptToGroups = function (script, groupNames, callback) {
  if (script.isLib || !groupNames || groupNames[0].length === 0) {
    return script.save(callback);
  }

  Group.find({ name: { $in: groupNames } }, function (err, groups) {
    var existingNames = null;
    var newGroup = null;
    var tasks = [];

    if (err || !groups) { groups = []; }

    // Groups to add the script to
    // This could have been added to the above query but
    // We need to figure out which groups don't exist as well (see below)
    existingGroups = groups.filter(function (group) {
      return group._scriptIds.indexOf(script._id) === -1;
    });

    // Names of existing groups
    existingNames = groups.map(function (group) {
      return group.name;
    });

    // Name of a group that doesn't exist
    newGroup = cleanGroupName(groupNames.filter(function (name) {
      return existingNames.indexOf(name) === -1;
    }).shift());

    // Add script to exising groups
    tasks.push(function (cb) {
      async.each(existingGroups, function (group, innerCb) {
        group._scriptIds.push(script._id);
        group.update = new Date();
        group.save(innerCb);
      }, cb);
    });

    // Create a custom group for the script
    if (!script._groupId && newGroup) {
      tasks.push(function (cb) {
        var group = new Group({
          name: newGroup,
          rating: 0,
          updated: new Date(),
          _scriptIds: [script._id]
        });

        group.save(function (err, group) {
          script._groupId = group._id;
          cb();
        });
      });
    }

    async.parallel(tasks, function () {
      script.save(callback);

      // Update the group ratings in the background
      groups.forEach(function (group) {
        Script.find({ _id: { $in: group._scriptIds } },
          function (err, scripts) {
            if (err || scripts.length < 2) { return; }

            group.rating = getRating(scripts);
            group.updated = new Date();
            group.save(function () { });
          }
        );
      });
    });
  });
};

// list groups
exports.list = function (req, res) {
  var authedUser = req.session.user;

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // Page metadata
  pageMetadata(options, 'Groups');

  // groupListQuery
  var groupListQuery = Group.find();

  // groupListQuery: Defaults
  modelQuery.applyGroupListQueryDefaults(groupListQuery, options, req);

  // groupListQuery: Pagination
  var pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

  // popularGroupListQuery
  var popularGroupListQuery = Group.find();
  popularGroupListQuery
    .sort('-rating')
    .limit(25);

  //--- Tasks

  // Pagination
  tasks.push(pagination.getCountTask(groupListQuery));

  // groupListQuery
  tasks.push(execQueryTask(groupListQuery, options, 'groupList'));

  // popularGroupListQuery
  tasks.push(execQueryTask(popularGroupListQuery, options, 'popularGroupList'));

  //---
  function preRender() {
    // groupList
    options.groupList = _.map(options.groupList, modelParser.parseGroup);

    // Pagination
    options.paginationRendered = pagination.renderDefault(req);

    // popularGroupList
    options.popularGroupList = _.map(options.popularGroupList, modelParser.parseGroup);

    // Page metadata
    if (options.groupList) {
      pageMetadata(options, 'Groups', null, _.pluck(options.groupList, 'name'));
    }
  };
  function render() { res.render('pages/groupListPage', options); }
  function asyncComplete() { preRender(); render(); }
  async.parallel(tasks, asyncComplete);
};

var setupGroupSidePanel = function (options) {
  // Shortcuts
  var group = options.group;
  var authedUser = options.authedUser;

  // Mod
  if (authedUser && authedUser.isMod) {
    options.modTools = {};
  }

  // Admin
  if (authedUser && authedUser.isAdmin) {
    options.adminTools = {};
  }
};

// list the scripts in a group
exports.view = function (req, res, next) {
  var authedUser = req.session.user;

  var groupNameSlug = req.route.params.groupname;
  var groupName = groupNameSlug.replace(/_+/g, ' ');

  Group.findOne({
    name: groupName
  }, function (err, groupData) {
    if (err || !groupData) { return next(); }

    // Don't show page if we have no scripts assigned to it yet.
    if (groupData._scriptIds.length === 0) { return next(); }

    //
    var options = {};
    var tasks = [];

    // Session
    authedUser = options.authedUser = modelParser.parseUser(authedUser);
    options.isMod = authedUser && authedUser.isMod;
    options.isAdmin = authedUser && authedUser.isAdmin;

    // Page metadata
    var group = options.group = modelParser.parseGroup(groupData);
    pageMetadata(options, [group.name, 'Groups']);

    // scriptListQuery
    var scriptListQuery = Script.find();

    // scriptListQuery: script in group
    scriptListQuery.find({ _id: { $in: group._scriptIds } });

    // scriptListQuery: isLib=false
    scriptListQuery.find({ isLib: { $ne: true } });

    // scriptListQuery: Defaults
    modelQuery.applyScriptListQueryDefaults(scriptListQuery, options, req);

    // scriptListQuery: Pagination
    var pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

    // popularGroupListQuery
    var popularGroupListQuery = Group.find();
    popularGroupListQuery
      .sort('-rating')
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
    function preRender() {
      // scriptList
      options.scriptList = _.map(options.scriptList, modelParser.parseScript);

      // popularGroupList
      options.popularGroupList = _.map(options.popularGroupList, modelParser.parseGroup);

      // Pagination
      options.paginationRendered = pagination.renderDefault(req);

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
    };
    function render() { res.render('pages/groupScriptListPage', options); }
    function asyncComplete() { preRender(); render(); }
    async.parallel(tasks, asyncComplete);
  });
};
