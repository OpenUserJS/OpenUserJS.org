var async = require('async');
var Group = require('../models/group').Group;
var Script = require('../models/script').Script;
var modelsList = require('../libs/modelsList');
var cleanFilename = require('../libs/helpers').cleanFilename;
var getRating = require('../libs/collectiveRating').getRating;

function cleanGroupName (name) {
  return cleanFilename(name, '').replace(/_/g, ' ')
    .replace(/^\s+|\s+$/g, '').replace(/,/g, '');
}

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

exports.view = function (req, res, next) {
  var user = req.session.user;
  var groupUrlName = req.route.params.shift();
  var groupName = groupUrlName.replace(/_+/g, ' ');
  var options = { title: 'Scripts grouped as ' + groupName, 
    username: user ? user.name : '' };

  Group.findOne({ name: groupName }, function (err, group) {
    if (err || !group || group._scriptIds.length === 0) { return next(); }

    modelsList.listScripts({ _id: { $in: group._scriptIds } },
      req.route.params, '/group/' + groupUrlName,
      function (scriptsList) {
        options.scriptsList = scriptsList;
        res.render('group', options);
    });
  });
};
