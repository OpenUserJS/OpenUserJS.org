'use strict';

/*
 * NOTE: This file is used as a general guideline to creating a new controller file.
 *       As the project progresses there may some changes to it.
 *
 *       Please remember to omit this comment block when creating a new controller file.
 */

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//

//--- Dependency inclusions
var async = require('async');
var _ = require('underscore');

//--- Model inclusions
var Group = require('../models/group').Group;

//--- Controller inclusions
var group = require('./group');

//--- Library inclusions
var _templateLib = require('../libs/_template');

// Parse a mongoose model and add generated fields (eg: urls, formatted dates)
// Separate functions for rendering
var modelParser = require('../libs/modelParser');

// Tools for parsing req.query.q and applying it to a mongoose query.
var modelQuery = require('../libs/modelQuery');

// Generate a bootstrap3 pagination widget.
var getDefaultPagination = require('../libs/templateHelpers').getDefaultPagination;

// General specific helpers
var pageMetadata = require('../libs/templateHelpers').pageMetadata;

//--- Configuration inclusions

//---

//--- This does what example1 does
exports.example1 = function (aReq, aRes, aNext) {
  function preRender() {
  }

  function render() {
    aRes.render('pages/_templatePage', options);
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

  // Page metadata
  pageMetadata(options);

  //--- Tasks

  //---
  async.parallel(tasks, asyncComplete);
};

// This does what example2 does
exports.example2 = function (aReq, aRes, aNext) {
  function preRender() {
    // Pagination
    options.paginationRendered = pagination.renderDefault(aReq);
  }

  function render() {
    aRes.render('pages/_templatePage', options);
  }

  function asyncComplete() {
    preRender();
    render();
  }

  //
  var options = {};
  var authedUser = aReq.session.user;
  var scriptListQuery = null;
  var pagination = null;
  var tasks = [];

  // Session
  options.authedUser = authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // Page metadata
  pageMetadata(options);

  // Scripts: Query
  scriptListQuery = Script.find();

  // Scripts: Query: isLib=false
  scriptListQuery.find({ isLib: false });

  // Scripts: Query: Search
  if (aReq.query.q) {
    modelQuery.parseScriptSearchQuery(scriptListQuery, aReq.query.q);
  }

  // Scripts: Query: Sort
  modelQuery.parseModelListSort(scriptListQuery, aReq.query.orderBy, aReq.query.orderDir,
    function () {
      scriptListQuery.sort('-rating -installs -updated');
    });

  // Pagination
  pagination = getDefaultPagination(aReq);
  pagination.applyToQuery(scriptListQuery);

  //--- Tasks

  // Pagination
  tasks.push(pagination.getCountTask(scriptListQuery));

  // Scripts
  tasks.push(function (aCallback) {
    scriptListQuery.exec(function (aErr, aScriptList) {
      if (aErr) {
        aCallback();
      } else {
        options.scriptList = _.map(aScriptList, modelParser.parseScript);
        aCallback();
      }
    });
  });

  //---
  async.parallel(tasks, asyncComplete);
};
