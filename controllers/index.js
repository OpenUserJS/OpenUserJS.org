var async = require('async');
var _ = require('underscore');

var Group = require('../models/group').Group;
var Script = require('../models/script').Script;
var Strategy = require('../models/strategy').Strategy;

var strategies = require('./strategies.json');
var modelsList = require('../libs/modelsList');
var modelParser = require('../libs/modelParser');
var modelQuery = require('../libs/modelQuery');
var execQueryTask = require('../libs/tasks').execQueryTask;


// The home page has scripts and groups in a sidebar
exports.home = function (req, res) {
  var authedUser = req.session.user;

  //
  var options = {};
  var tasks = [];

  options.title = 'OpenUserJS.org';
  options.pageMetaDescription = 'Download Userscripts to enhance your browser.';
  var pageMetaKeywords = ['userscript', 'greasemonkey'];
  pageMetaKeywords.concat(['web browser']);
  options.pageMetaKeywords = pageMetaKeywords.join(', ');

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  //
  options.librariesOnly = req.query.library !== undefined;

  // scriptListQuery
  var scriptListQuery = Script.find();

  // scriptListQuery: isLib
  modelQuery.findOrDefaultIfNull(scriptListQuery, 'isLib', options.librariesOnly, false);

  // scriptListQuery: Defaults
  if (options.librariesOnly) {
    // Libraries
    modelQuery.applyLibraryListQueryDefaults(scriptListQuery, options, req);
  } else {
    // Scripts
    modelQuery.applyScriptListQueryDefaults(scriptListQuery, options, req);
  }

  // scriptListQuery: Pagination
  var pagination = options.pagination; // is set in modelQuery.apply___ListQueryDefaults

  // popularGroupListQuery
  var popularGroupListQuery = Group.find();
  popularGroupListQuery
    .sort('-rating')
    .limit(25);

  //--- Tasks

  // Pagination
  tasks.push(pagination.getCountTask(scriptListQuery));

  // scriptListQuery
  tasks.push(execQueryTask(scriptListQuery, options, 'scriptList'));

  // popularGroupListQuery
  tasks.push(execQueryTask(popularGroupListQuery, options, 'popularGroupList'));

  //---
  function preRender(){
    // scriptList
    options.scriptList = _.map(options.scriptList, modelParser.parseScript);

    // popularGroupList
    options.popularGroupList = _.map(options.popularGroupList, modelParser.parseGroup);

    // Pagination
    options.paginationRendered = pagination.renderDefault(req);
  };
  function render(){ res.render('pages/scriptListPage', options); }
  function asyncComplete(){ preRender(); render(); }
  async.parallel(tasks, asyncComplete);
};

// Preform a script search
function getSearchResults (req, res, prefixSearch, fullSearch, opts, callback) {
  var user = req.session.user;
  var search = req.route.params.shift();
  var baseUrl = '/search/' + encodeURIComponent(search);
  var conditions = [];
  var query = null;
  var prefixStr = '';
  var fullStr = '';
  var prefixRegex = null;
  var fullRegex = null;
  var terms = search.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1')
    .split(/\s+/);

  // Match all the terms but in any order
  terms.forEach(function (term) {
    prefixStr += '(?=.*?\\b' + term  + ')';
    fullStr += '(?=.*?' + term  + ')';
  });
  prefixRegex = new RegExp(prefixStr, 'i');
  fullRegex = new RegExp(fullStr, 'i');

  // One of the searchable fields must match the conditions
  prefixSearch.forEach(function (prop) {
    var condition = {};
    condition[prop] = prefixRegex;
    conditions.push(condition);
  });

  fullSearch.forEach(function (prop) {
    var condition = {};
    condition[prop] = fullRegex;
    conditions.push(condition);
  });
  opts['$or'] = conditions;

  modelsList.listScripts(opts, req.route.params, baseUrl,
    function (scriptsList) {
      callback({
        'title': 'Searching for "' + search  +'"',
        'username': user ? user.name : null,
        'search': search,
        'scriptsList': scriptsList
      });
  });
};

// Script search results
exports.search = function (req, res, next) {
  getSearchResults(req, res,
    ['name', 'author', 'about', 'meta.description'],
    ['meta.include', 'meta.match'], {},
    function (options) {
      res.render('index', options);
  });
};

// Show library scripts
exports.toolbox = function (req, res) {
  var user = req.session.user;

  modelsList.listScripts({ isLib: true }, req.route.params, '/toolbox',
    function (scriptsList) {
      res.render('index', {
        title: 'The Toolbox',
        toolbox: true,
        username: user ? user.name : null,
        scriptsList: scriptsList
      });
  });
};

// Search library scripts
exports.toolSearch = function (req, res) {
  getSearchResults(req, res, ['name', 'author', 'about'], [], { isLib: true },
    function (options) {
      options.toolbox = true;
      res.render('index', options);
  });
};

// UI for user registration
exports.register = function (req, res) {
  var authedUser = req.session.user;

  // If already logged in, goto the front page.
  if (authedUser)
    return res.redirect('/');

  //
  var options = {};
  var tasks = [];

  //
  options.title = 'Register | OpenUserJS.org';
  options.pageMetaDescription = 'Login to OpenUserJS.org using OAuth.';
  var pageMetaKeywords = ['login', 'register'];
  options.pageMetaKeywords = pageMetaKeywords.join(', ');

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  //
  options.wantname = req.session.username;
  delete req.session.username;

  //
  options.strategies = [];

  // Get OpenId strategies
  if (process.env.NODE_ENV === 'production') {
    _.each(strategies, function(strategy, strategyKey){
      if (!strategy.oauth) {
        options.strategies.push({
          'strat': strategyKey,
          'display': strategy.name
        });
      }
    });
  }

  //--- Tasks

  //
  tasks.push(function (callback) {
    Strategy.find({}, function (err, availableStrategies) {
      if (err) {
        callback();
      } else {
        // Get the strategies we have OAuth keys for
        availableStrategies.forEach(function (strategy) {
          options.strategies.push({
            'strat': strategy.name,
            'display': strategy.display
          });
        });
        callback();
      }
    });
  });

  //---
  function preRender(){
    // Sort the strategies
    options.strategies = _.sortBy(options.strategies, function(strategy){ return strategy.display; });

    // Prefer GitHub
    var githubStrategy = _.findWhere(options.strategies, {strat: 'github'});
    if (githubStrategy)
      githubStrategy.selected = true;
  };
  function render(){ res.render('pages/loginPage', options); }
  function asyncComplete(){ preRender(); render(); }
  async.parallel(tasks, asyncComplete);
};

exports.logout = function (req, res) {
  delete req.session.user;
  res.redirect('/');
};
