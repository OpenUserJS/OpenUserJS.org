var async = require('async');
var _ = require('underscore');

var Remove = require('../models/remove').Remove;

var modelsList = require('../libs/modelsList');
var modelParser = require('../libs/modelParser');
var modelQuery = require('../libs/modelQuery');
var execQueryTask = require('../libs/tasks').execQueryTask;
var statusCodePage = require('../libs/templateHelpers').statusCodePage;
var pageMetadata = require('../libs/templateHelpers').pageMetadata;

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
