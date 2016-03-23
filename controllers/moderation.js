'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//

//--- Dependency inclusions
var async = require('async');
var _ = require('underscore');

//--- Model inclusions
var Remove = require('../models/remove').Remove;

//--- Controller inclusions

//--- Library inclusions
// var moderationLib = require('../libs/moderation');

var modelParser = require('../libs/modelParser');
var modelQuery = require('../libs/modelQuery');

var execQueryTask = require('../libs/tasks').execQueryTask;
var statusCodePage = require('../libs/templateHelpers').statusCodePage;
var pageMetadata = require('../libs/templateHelpers').pageMetadata;
var orderDir = require('../libs/templateHelpers').orderDir;

//--- Configuration inclusions

//---

exports.removedItemPage = function (aReq, aRes, aNext) {
  //
  var options = {};
  var authedUser = aReq.session.user;
  var removedItemId = aReq.params.id;

  // Session
  options.authedUser = authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!options.isMod) {
    statusCodePage(aReq, aRes, aNext, {
      statusCode: 403,
      statusMessage: 'This page is only accessible by moderators',
    });
    return;
  }

  Remove.findOne({
    _id: removedItemId
  }, function (aErr, aRemovedItem) {
    if (aErr || !aRemovedItem) {
      aNext();
      return;
    }

    aRes.set('Content-Type', 'application/json; charset=UTF-8');
    aRes.write(JSON.stringify(
      aRemovedItem.toObject ? aRemovedItem.toObject({ virtuals: true }) : aRemovedItem,
      null,
      isPro ? '' : ' ')
    );
    aRes.end();
  });
};

exports.removedItemListPage = function (aReq, aRes, aNext) {
  function preRender() {
    // removedItemList
    options.removedItemList = _.map(options.removedItemList, modelParser.parseRemovedItem);

    // Pagination
    options.paginationRendered = pagination.renderDefault(aReq);

    // Page metadata
    pageMetadata(options, 'Graveyard');
  }

  function render() {
    aRes.render('pages/removedItemListPage.html', options);
  }

  function asyncComplete(aErr) {
    if (aErr) {
      aNext();
      return;
    }

    preRender();
    render();
  }

  //
  var options = {};
  var authedUser = aReq.session.user;
  var removedItemListQuery = null;
  var pagination = null;
  var tasks = [];

  // Session
  options.authedUser = authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!options.isMod) {
    statusCodePage(aReq, aRes, aNext, {
      statusCode: 403,
      statusMessage: 'This page is only accessible by moderators',
    });
    return;
  }

  //
  options.byModel = aReq.query.byModel !== undefined ? aReq.query.byModel : null;

  // Order dir
  orderDir(aReq, options, 'model', 'asc');
  orderDir(aReq, options, 'removerName', 'asc');
  orderDir(aReq, options, 'removed', 'desc');

  // removedItemListQuery
  removedItemListQuery = Remove.find();

  // removedItemListQuery: byModel
  modelQuery.findOrUseDefaultIfNull(removedItemListQuery, 'model', options.byModel, null);

  // removedItemListQuery: Defaults
  switch (options.byModel) {
    case 'User':
      modelQuery.applyRemovedItemUserListQueryDefaults(removedItemListQuery, options, aReq);
      options.filterUser = true;
      break;
    case 'Script':
      modelQuery.applyRemovedItemScriptListQueryDefaults(removedItemListQuery, options, aReq);
      options.filterScript = true;
      break;
    case 'Comment':
      modelQuery.applyRemovedItemCommentListQueryDefaults(removedItemListQuery, options, aReq);
      options.filterComment = true;
      break;
    case 'Discussion':
      modelQuery.applyRemovedItemDiscussionListQueryDefaults(removedItemListQuery, options, aReq);
      options.filterDiscussion = true;
      break;
    case 'Flag':
      modelQuery.applyRemovedItemFlagListQueryDefaults(removedItemListQuery, options, aReq);
      options.filterFlag = true;
      break;
    case 'Group':
      modelQuery.applyRemovedItemGroupListQueryDefaults(removedItemListQuery, options, aReq);
      options.filterGroup = true;
      break;
    case 'Vote':
      modelQuery.applyRemovedItemVoteListQueryDefaults(removedItemListQuery, options, aReq);
      options.filterVote = true;
      break;
    default:
      modelQuery.applyRemovedItemListQueryDefaults(removedItemListQuery, options, aReq);
  }

  // removedItemListQuery: Pagination
  pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

  //--- Tasks

  // Pagination
  tasks.push(pagination.getCountTask(removedItemListQuery));

  // removedItemListQuery
  tasks.push(execQueryTask(removedItemListQuery, options, 'removedItemList'));

  //---
  async.parallel(tasks, asyncComplete);
};

exports.modPage = function (aReq, aRes, aNext) {
  function preRender() {
    // Page metadata
    pageMetadata(options, 'Moderation');
  }

  function render() {
    aRes.render('pages/modPage', options);
  }

  function asyncComplete() {
    preRender();
    render();
  }

  //
  var options = {};
  var authedUser = aReq.session.user;
  var tasks = [];

  // Session
  options.authedUser = authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  if (!options.isMod) {
    statusCodePage(aReq, aRes, aNext, {
      statusCode: 403,
      statusMessage: 'This page is only accessible by moderators',
    });
    return;
  }

  //---
  async.parallel(tasks, asyncComplete);
};
