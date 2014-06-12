var async = require('async');
var _ = require('underscore');

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
exports.example = function (req, res, next) {
  var authedUser = req.session.user;

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // Metadata
  options.title = 'OpenUserJS.org';
  options.pageMetaDescription = 'Download Userscripts to enhance your browser.';
  var pageMetaKeywords = ['userscript', 'greasemonkey'];
  pageMetaKeywords.concat(['web browser']);
  options.pageMetaKeywords = pageMetaKeywords.join(', ');

  //--- Tasks
  // ...

  //---
  function preRender(){};
  function render(){ res.render('pages/_templatePage', options); }
  function asyncComplete(){ preRender(); render(); }
  async.parallel(tasks, asyncComplete);
};

exports.example = function (req, res, next) {
  var authedUser = req.session.user;

  //
  var options = {};
  var tasks = [];

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // Metadata
  options.title = 'OpenUserJS.org';
  options.pageMetaDescription = 'Download Userscripts to enhance your browser.';
  var pageMetaKeywords = ['userscript', 'greasemonkey'];
  pageMetaKeywords.concat(['web browser']);
  options.pageMetaKeywords = pageMetaKeywords.join(', ');

  // Scripts: Query
  var scriptListQuery = Script.find();

  // Scripts: Query: isLib=false
  scriptListQuery.find({isLib: false});

  // Scripts: Query: Search
  if (req.query.q)
    modelQuery.parseScriptSearchQuery(scriptListQuery, req.query.q);

  // Scripts: Query: Sort
  modelQuery.parseModelListSort(scriptListQuery, req.query.orderBy, req.query.orderDir, function(){
    scriptListQuery.sort('-rating -installs -updated');
  });
  

  // Pagination
  var pagination = getDefaultPagination(req);
  pagination.applyToQuery(scriptListQuery);

  //--- Tasks

  // Pagination
  tasks.push(pagination.getCountTask(scriptListQuery));
  
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

  //---
  function preRender(){
    // Pagination
    options.paginationRendered = pagination.renderDefault(req);
  };
  function render(){ res.render('pages/_templatePage', options); }
  function asyncComplete(){ preRender(); render(); }
  async.parallel(tasks, asyncComplete);
};

