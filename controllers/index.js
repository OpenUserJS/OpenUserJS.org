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

exports.search = function (req, res, next) {
  var user = req.session.user;
  var search = req.route.params.shift()
    .replace(/([.?*+^$[\]\\(){}|-])/g, '\\$1');
  var searchRegex = new RegExp('\\b' + search, 'i');
  var searchable = ['name', 'author', 'meta.description'];
  var baseUrl = '/search/' + encodeURIComponent(search.replace(/\\/g, ''));
  var conditions = [];
  var query = null;

  searchable.forEach(function (prop) {
    var condition = {};
    condition[prop] = searchRegex;
    conditions.push(condition);
  });
  conditions.push({ 'meta.include': new RegExp(search, 'i') });

  query = Script.find().or(conditions);

  scriptsList.listScripts(query, req.route.params, baseUrl,
    function (scriptsList) {
      res.render('index', {
        'title': 'Searching for "' + search  +'"',
        'username': user ? user.name : null,
        'search': search.replace(/\\/g, ''),
        'scriptsList': scriptsList
      });
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
