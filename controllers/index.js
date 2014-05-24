var async = require('async');
var _ = require('underscore');
var url = require("url");

var Group = require('../models/group').Group;
var Script = require('../models/script').Script;
var Strategy = require('../models/strategy.js').Strategy;
var User = require('../models/user').User;

var strategies = require('./strategies.json');
var modelsList = require('../libs/modelsList');
var userRoles = require('../models/userRoles.json');
var modelParser = require('../libs/modelParser');
var modelQuery = require('../libs/modelQuery');
var helpers = require('../libs/helpers');
var paginateTemplate = require('../libs/templateHelpers').paginateTemplate;

// The home page has scripts and groups in a sidebar
exports.home = function (req, res) {
  var options = {};
  options.title = 'OpenUserJS.org';

  // Session
  var user = req.session.user;
  options.user = user ? modelParser.parseUser(user) : null;

  // Scripts: Query
  var scriptListQuery = Script.find();

  // Scripts: Query: Search
  if (req.query.q)
    modelQuery.parseScriptSearchQuery(scriptListQuery, req.query.q);

  // Scripts: Query: Sort
  modelQuery.parseModelListSort(Script, scriptListQuery, req.query.orderBy, req.query.orderDir, function(){
    scriptListQuery.sort('-rating -installs -updated');
  });
  

  // Scripts: Pagination
  options.scriptListCurrentPage = req.query.p ? helpers.limitMin(1, req.query.p) : 1;
  options.scriptListLimit = req.query.limit ? helpers.limitRange(0, req.query.limit, 100) : 10;
  var scriptListSkipFrom = (options.scriptListCurrentPage * options.scriptListLimit) - options.scriptListLimit;
  scriptListQuery
    .skip(scriptListSkipFrom)
    .limit(options.scriptListLimit);

  // Groups: Query
  var groupListQuery = Group.find();
  groupListQuery
    .limit(25);

  async.parallel([
    function (callback) {
      scriptListQuery.exec(function(err, scriptDataList){
        if (err) {
          callback();
        } else {
          options.scriptList = _.map(scriptDataList, modelParser.parseScript);
          callback();
        }
      });
    },
    function (callback) {
      Script.count(scriptListQuery._conditions, function(err, scriptListCount){
        if (err) {
          callback();
        } else {
          options.scriptListCount = scriptListCount;
          options.scriptListNumPages = Math.ceil(options.scriptListCount / options.scriptListLimit) || 1;
          callback();
        }
      });
    }, function (callback) {
      groupListQuery.exec(function(err, groupDataList){
        if (err) {
          callback();
        } else {
          options.groupList = _.map(groupDataList, modelParser.parseGroup);
          callback();
        }
      });
    }, function (callback) {
      Group.count(groupListQuery._conditions, function(err, groupListCount){
        if (err) {
          callback();
        } else {
          options.groupListCount = groupListCount;
          callback();
        }
      });
    }
  ], function () {
    options.pagination = paginateTemplate({
      currentPage: options.scriptListCurrentPage,
      lastPage: options.scriptListNumPages,
      urlFn: function(p) {
        var parseQueryString = true;
        var u = url.parse(req.url, parseQueryString);
        u.query.p = p;
        delete u.search; // http://stackoverflow.com/a/7517673/947742
        return url.format(u);
      }
    });

    res.render('pages/scriptListPage', options);
  });
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
}

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
  var options = { 'title': 'Register', 'wantname': req.session.username };

  if (req.session.user) { return res.redirect('/'); }

  delete req.session.username;

  Strategy.find({}, function (err, strats) {
    var strategy = null;
    var name = null;
    options.strategies = [];

    // Get the strategies we have OAuth keys for
    strats.forEach(function (strat) {
      options.strategies.push({ 'strat' : strat.name,
        'display' : strat.display });
    });

    // Get OpenId strategies
    if (process.env.NODE_ENV === 'production') {
      for (name in strategies) {
        strategy = strategies[name];
        if (!strategy.oauth) {
          options.strategies.push({ 'strat' : name,
            'display' : strategy.name });
        }
      }
    }

    res.render('register', options);
  });
};

exports.logout = function (req, res) {
  delete req.session.user;
  res.redirect('/');
};
