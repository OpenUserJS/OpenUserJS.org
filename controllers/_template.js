'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var async = require('async');
var _ = require('underscore');
var pageMetadata = require('../libs/templateHelpers').pageMetadata;

//--- Models
var Group = require('../models/group').Group;

//--- Local

// Parse a mongoose model and add generated fields (eg: urls, formatted dates)
// Seperate functions for rendering
var modelParser = require('../libs/modelParser');

// Tools for parsing req.query.q and applying it to a mongoose query.
var modelQuery = require('../libs/modelQuery');

// Generate a bootstrap3 pagination widget.
var getDefaultPagination = require('../libs/templateHelpers').getDefaultPagination;

//--- Views
exports.example = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  //
  var options = {};
  var tasks = [];

  //---
  function preRender() { }
  function render() { aRes.render('pages/_templatePage', options); }
  function asyncComplete() { preRender(); render(); }

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // Page metadata
  pageMetadata(options);

  //--- Tasks

  //---
  async.parallel(tasks, asyncComplete);
};

exports.example = function (aReq, aRes, aNext) {
  var authedUser = aReq.session.user;

  //
  var options = {};
  var tasks = [];

  //---
  function preRender() {
    // Pagination
    options.paginationRendered = pagination.renderDefault(aReq);
  }
  function render() { aRes.render('pages/_templatePage', options); }
  function asyncComplete() { preRender(); render(); }

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // Page metadata
  pageMetadata(options);

  // Scripts: Query
  var scriptListQuery = Script.find();

  // Scripts: Query: isLib=false
  scriptListQuery.find({ isLib: false });

  // Scripts: Query: Search
  if (aReq.query.q)
    modelQuery.parseScriptSearchQuery(scriptListQuery, aReq.query.q);

  // Scripts: Query: Sort
  modelQuery.parseModelListSort(scriptListQuery, aReq.query.orderBy, aReq.query.orderDir, function () {
    scriptListQuery.sort('-rating -installs -updated');
  });

  // Pagination
  var pagination = getDefaultPagination(aReq);
  pagination.applyToQuery(scriptListQuery);

  //--- Tasks

  // Pagination
  tasks.push(pagination.getCountTask(scriptListQuery));

  // Scripts
  tasks.push(function (aCallback) {
    scriptListQuery.exec(function (aErr, aScriptDataList) {
      if (aErr) {
        aCallback();
      } else {
        options.scriptList = _.map(aScriptDataList, modelParser.parseScript);
        aCallback();
      }
    });
  });

  //---
  async.parallel(tasks, asyncComplete);
};

