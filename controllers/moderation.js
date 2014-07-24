'use strict';

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
exports.flagged = function (aReq, aRes, aNext) {
  var user = aReq.session.user;
  var type = aReq.route.params.shift() || 'users';
  var baseUrl = '/flagged' + (type ? '/' + type : '');
  var options = {
    moderation: true,
    username: user ? user.name : ''
  };

  // Page metadata
  pageMetadata(options, 'Flagged Content');

  options[type + 'Type'] = true;

  if (!user || user.role > 3) { return aNext(); }

  switch (type) {
    case 'users':
      if (!aReq.route.params[1]) {
        aReq.route.params[1] = ['flags'];
      }

      modelsList.listUsers({ flagged: true }, aReq.route.params, baseUrl,
        function (aUsersList) {
          options.usersList = aUsersList;
          aRes.render('flagged', options);
        });
      break;
    case 'scripts':
      if (!aReq.route.params[1]) {
        aReq.route.params[1] = ['flags', 'updated'];
      }

      modelsList.listScripts({ flagged: true, isLib: null },
        aReq.route.params, baseUrl,
        function (aScriptsList) {
          options.scriptsList = aScriptsList;
          aRes.render('flagged', options);
        });
      break;
    default:
      aNext();
  }
};

// When content is remove via the community moderation system it isn't
// actually deleted. Instead it is sent to the graveyard where hopefully
// any mistakes can be undone.
exports.graveyard = function (aReq, aRes, aNext) {
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
  var user = aReq.session.user;
  var type = aReq.route.params.shift() || 'users';
  var baseUrl = '/graveyard' + (type ? '/' + type : '');
  var contentType = contentTypes[type];
  var options = { username: user ? user.name : '' };

  // Page metadata
  pageMetadata(options, 'Graveyard');

  if (!contentType || !user || user.role > 3) { return aNext(); }

  // Currently removed content is displayed as raw JSON data
  // Hopefully one day it can actually be viewed read-only by
  // those who have the authority
  modelsList.listRemoved({ model: contentType.name }, aReq.route.params, baseUrl,
    function (aRemovedList) {
      var type = null;
      var name = null;
      contentType.selected = true;
      options.removedList = aRemovedList;
      options.contentTypes = [];
      options[contentType.name] = true;

      for (name in contentTypes) {
        type = contentTypes[name];
        type.url = '/graveyard/' + name;
        type.name += 's';
        options.contentTypes.push(type);
      }
      options.contentTypes[options.contentTypes.length - 1].last = true;

      aRes.render('graveyard', options);
    });
};

exports.removedItemPage = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  var removedItemId = aReq.route.params.id;

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!options.isMod) {
    return statusCodePage(aReq, aRes, aNext, {
      statusCode: 403,
      statusMessage: 'This page is only accessible by moderators',
    });
  }

  Remove.find({
    _id: removedItemId,
  }, function (aErr, aRemovedItemData) {
    if (aErr || !aRemovedItemData) { return aNext(); }

    aRes.json(aRemovedItemData);
  });
};

exports.removedItemListPage = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!options.isMod) {
    return statusCodePage(aReq, aRes, aNext, {
      statusCode: 403,
      statusMessage: 'This page is only accessible by moderators',
    });
  }

  // Page metadata
  pageMetadata(options, 'Graveyard');

  // removedItemListQuery
  var removedItemListQuery = Remove.find();

  // removedItemListQuery: Defaults
  modelQuery.applyRemovedItemListQueryDefaults(removedItemListQuery, options, aReq);

  // removedItemListQuery: Pagination
  var pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

  //--- Tasks

  // Pagination
  tasks.push(pagination.getCountTask(removedItemListQuery));

  // removedItemListQuery
  tasks.push(execQueryTask(removedItemListQuery, options, 'removedItemList'));

  //---
  async.parallel(tasks, function (aErr) {
    if (aErr) return aNext();

    //--- PreRender
    // removedItemList
    options.removedItemList = _.map(options.removedItemList, modelParser.parseRemovedItem);

    // Pagination
    options.paginationRendered = pagination.renderDefault(aReq);

    //---
    aRes.render('pages/removedItemListPage.html', options);
  });
};

exports.modPage = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  //
  var options = {};

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!options.isMod) {
    return statusCodePage(aReq, aRes, aNext, {
      statusCode: 403,
      statusMessage: 'This page is only accessible by moderators',
    });
  }

  // Page metadata
  pageMetadata(options, 'Moderation');

  //---
  aRes.render('pages/modPage', options);
};
