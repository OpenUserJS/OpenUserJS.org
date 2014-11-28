'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var async = require('async');
var _ = require('underscore');

var Remove = require('../models/remove').Remove;

var modelParser = require('../libs/modelParser');
var modelQuery = require('../libs/modelQuery');
var execQueryTask = require('../libs/tasks').execQueryTask;
var statusCodePage = require('../libs/templateHelpers').statusCodePage;
var pageMetadata = require('../libs/templateHelpers').pageMetadata;
var orderDir = require('../libs/templateHelpers').orderDir;

exports.removedItemPage = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  var removedItemId = aReq.params.id;

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

  // Order dir
  orderDir(aReq, options, 'model', 'asc');
  orderDir(aReq, options, 'removerName', 'asc');
  orderDir(aReq, options, 'removed', 'desc');

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
