var async = require('async');
var _ = require('underscore');

var Group = require('../models/group').Group;
var Script = require('../models/script').Script;

var modelsList = require('../libs/modelsList');
var modelParser = require('../libs/modelParser');
var modelQuery = require('../libs/modelQuery');
var cleanFilename = require('../libs/helpers').cleanFilename;
var getRating = require('../libs/collectiveRating').getRating;

// clean the name of the group so it is url safe
function cleanGroupName (name) {
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
    queryStr += '(?=.*?' + term  + ')';
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
            group.save(function () {});
        });
      });
    });
  });
};

// list groups
exports.list = function (req, res) {
  var user = req.session.user;
  var options = { title: 'Script Groups', username: user ? user.name : '' };

  req.route.params[0] = 25;

  modelsList.listGroups({}, req.route.params, '/groups',
    function (groupsList) {
      options.groupsList = groupsList;
      res.render('groups', options);
  });
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
    options.isMod = authedUser && authedUser.role < 4;

    //
    var group = options.group = modelParser.parseGroup(groupData);
    options.title = group.name + ' | OpenUserJS.org';

    // Scripts: Query
    var scriptListQuery = Script.find();

    // Scripts: Query: script in group
    scriptListQuery.find({_id: {$in: group._scriptIds}});

    // Scripts: Query: isLib=false
    scriptListQuery.find({isLib: false});

    // Scripts: Query: Search
    if (req.query.q)
      modelQuery.parseScriptSearchQuery(scriptListQuery, req.query.q);

    // Scripts: Query: Sort
    modelQuery.parseModelListSort(Script, scriptListQuery, req.query.orderBy, req.query.orderDir, function(){
      scriptListQuery.sort('-rating -installs -updated');
    });
    

    // Scripts: Pagination
    options.scriptListCurrentPage = req.query.p ? helpers.limitMin(1, req.query.p) : 1;
    options.scriptListLimit = req.query.limit ? helpers.limitRange(0, req.query.limit, 100) : 10;
    var scriptListSkipFrom = (options.scriptListCurrentPage * options.scriptListLimit) - options.scriptListLimit;
    scriptListQuery
      .skip(scriptListSkipFrom)
      .limit(options.scriptListLimit);

    // Groups: Query
    var groupListQuery = Group.find();
    groupListQuery
      .limit(25);

    // Scripts
    tasks.push(function (callback) {
      scriptListQuery.exec(function(err, scriptDataList){
        if (err) {
          callback();
        } else {
          options.scriptList = _.map(scriptDataList, modelParser.parseScript);
          callback();
        }
      });
    });
    tasks.push(function (callback) {
      Script.count(scriptListQuery._conditions, function(err, scriptListCount){
        if (err) {
          callback();
        } else {
          options.scriptListCount = scriptListCount;
          options.scriptListNumPages = Math.ceil(options.scriptListCount / options.scriptListLimit) || 1;
          callback();
        }
      });
    });

    // Groups
    tasks.push(function (callback) {
      groupListQuery.exec(function(err, groupDataList){
        if (err) {
          callback();
        } else {
          options.groupList = _.map(groupDataList, modelParser.parseGroup);
          callback();
        }
      });
    });

    function preRender(){};
    function render(){ res.render('pages/groupScriptListPage', options); }
    function asyncComplete(){ preRender(); render(); }
    async.parallel(tasks, asyncComplete);
  });
};
