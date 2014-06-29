var async = require('async');
var _ = require('underscore');

var Remove = require('../models/remove').Remove;

var modelsList = require('../libs/modelsList');
var modelParser = require('../libs/modelParser');
var modelQuery = require('../libs/modelQuery');
var execQueryTask = require('../libs/tasks').execQueryTask;
var statusCodePage = require('../libs/templateHelpers').statusCodePage;
var pageMetadata = require('../libs/templateHelpers').pageMetadata;

// When content reaches a its threshold of flags it gets marked as flagged
// and it can now be removed by moderators
exports.flagged = function (req, res, next) {
  var user = req.session.user;
  var type = req.route.params.shift() || 'users';
  var baseUrl = '/flagged' + (type ? '/' + type : '');
  var options = {
    moderation: true,
    username: user ? user.name : ''
  };

  // Page metadata
  pageMetadata(options, 'Flagged Content');

  options[type + 'Type'] = true;

  if (!user || user.role > 3) { return next(); }

  switch (type) {
    case 'users':
      if (!req.route.params[1]) {
        req.route.params[1] = ['flags'];
      }

      modelsList.listUsers({ flagged: true }, req.route.params, baseUrl,
        function (usersList) {
          options.usersList = usersList;
          res.render('flagged', options);
        });
      break;
    case 'scripts':
      if (!req.route.params[1]) {
        req.route.params[1] = ['flags', 'updated'];
      }

      modelsList.listScripts({ flagged: true, isLib: null },
        req.route.params, baseUrl,
        function (scriptsList) {
          options.scriptsList = scriptsList;
          res.render('flagged', options);
        });
      break;
    default:
      next();
  }
};

// When content is remove via the community moderation system it isn't
// actually deleted. Instead it is sent to the graveyard where hopefully
// any mistakes can be undone.
exports.graveyard = function (req, res, next) {
  var contentTypes = {
    'users':
    {
      'name': 'User',
      'selected': false,
    },
    'scripts':
    {
      'name': 'Script',
      'selected': false
    }
  };
  var user = req.session.user;
  var type = req.route.params.shift() || 'users';
  var baseUrl = '/graveyard' + (type ? '/' + type : '');
  var contentType = contentTypes[type];
  var options = { username: user ? user.name : '' };

  // Page metadata
  pageMetadata(options, 'Graveyard');

  if (!contentType || !user || user.role > 3) { return next(); }

  // Currently removed content is displayed as raw JSON data
  // Hopefully one day it can actually be viewed read-only by
  // those who have the authority
  modelsList.listRemoved({ model: contentType.name }, req.route.params, baseUrl,
    function (removedList) {
      var type = null;
      var name = null;
      contentType.selected = true;
      options.removedList = removedList;
      options.contentTypes = [];
      options[contentType.name] = true;

      for (name in contentTypes) {
        type = contentTypes[name];
        type.url = '/graveyard/' + name;
        type.name += 's';
        options.contentTypes.push(type);
      }
      options.contentTypes[options.contentTypes.length - 1].last = true;

      res.render('graveyard', options);
    });
};

exports.removedItemPage = function (req, res, next) {
  var authedUser = req.session.user;

  var removedItemId = req.route.params.id;

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!options.isMod) {
    return statusCodePage(req, res, next, {
      statusCode: 403,
      statusMessage: 'This page is only accessible by moderators',
    });
  }

  Remove.find({
    _id: removedItemId,
  }, function (err, removedItemData) {
    if (err || !removedItemData) { return next(); }

    res.json(removedItemData);
  });
};

exports.removedItemListPage = function (req, res, next) {
  var authedUser = req.session.user;

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!options.isMod) {
    return statusCodePage(req, res, next, {
      statusCode: 403,
      statusMessage: 'This page is only accessible by moderators',
    });
  }

  // Page metadata
  pageMetadata(options, 'Graveyard');

  // removedItemListQuery
  var removedItemListQuery = Remove.find();

  // removedItemListQuery: Defaults
  modelQuery.applyRemovedItemListQueryDefaults(removedItemListQuery, options, req);

  // removedItemListQuery: Pagination
  var pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

  //--- Tasks

  // Pagination
  tasks.push(pagination.getCountTask(removedItemListQuery));

  // removedItemListQuery
  tasks.push(execQueryTask(removedItemListQuery, options, 'removedItemList'));

  //---
  async.parallel(tasks, function (err) {
    if (err) return next();

    //--- PreRender
    // removedItemList
    options.removedItemList = _.map(options.removedItemList, modelParser.parseRemovedItem);

    // Pagination
    options.paginationRendered = pagination.renderDefault(req);

    //---
    res.render('pages/removedItemListPage.html', options);
  });
};

exports.modPage = function (req, res, next) {
  var authedUser = req.session.user;

  //
  var options = {};

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!options.isMod) {
    return statusCodePage(req, res, next, {
      statusCode: 403,
      statusMessage: 'This page is only accessible by moderators',
    });
  }

  // Page metadata
  pageMetadata(options, 'Moderation');

  //---
  res.render('pages/modPage', options);
};
