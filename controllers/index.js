var Strategy = require('../models/strategy.js').Strategy;
var User = require('../models/user').User;
var Script = require('../models/script').Script;
var strategies = require('./strategies.json');
var scriptsList = require('../libs/modelsList');
var userRoles = require('../models/userRoles.json');

exports.home = function (req, res) {
  var user = req.session.user;

  scriptsList.listScripts({}, req.route.params, '',
    function (scriptsList) {
      res.render('index', {
        title: 'Home Page',
        username: user ? user.name : null,
        scriptsList: scriptsList
      });
  });
};

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

  terms.forEach(function (term) {
    prefixStr += '(?=.*?\\b' + term  + ')';
    fullStr += '(?=.*?' + term  + ')';
  });
  prefixRegex = new RegExp(prefixStr, 'i');
  fullRegex = new RegExp(fullStr, 'i');

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

  scriptsList.listScripts(opts, req.route.params, baseUrl,
    function (scriptsList) {
      callback({
        'title': 'Searching for "' + search  +'"',
        'username': user ? user.name : null,
        'search': search,
        'scriptsList': scriptsList
      });
  });
}

exports.search = function (req, res, next) {
  getSearchResults(req, res, 
    ['name', 'author', 'about', 'meta.description'], 
    ['meta.include', 'meta.match'], {},
    function (options) {
      res.render('index', options);
  });
};

exports.toolbox = function (req, res) {
  var user = req.session.user;

  scriptsList.listScripts({ isLib: true }, req.route.params, '/toolbox',
    function (scriptsList) {
      res.render('index', {
        title: 'The Toolbox',
        toolbox: true,
        username: user ? user.name : null,
        scriptsList: scriptsList
      });
  });
};

exports.toolSearch = function (req, res) {
  getSearchResults(req, res, ['name', 'author', 'about'], [], { isLib: true },
    function (options) {
      options.toolbox = true;
      res.render('index', options);
  });
};

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
