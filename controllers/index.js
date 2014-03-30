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
  var search = req.route.params.shift();
  var regexStr = '';
  var urlRegexStr = '';
  var searchable = ['name', 'author', 'about', 'meta.description'];
  var baseUrl = '/search/' + encodeURIComponent(search);
  var conditions = [];
  var query = null;
  var searchRegex = null;
  var urlRegex = null
  var terms = search.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1')
    .split(/\s+/);

  terms.forEach(function (term) {
    regexStr += '(?=.*?\\b' + term  + ')';
    urlRegexStr += '(?=.*?' + term  + ')';
  });

  searchRegex = new RegExp(regexStr, 'i');
  searchable.forEach(function (prop) {
    var condition = {};
    condition[prop] = searchRegex;
    conditions.push(condition);
  });

  urlRegex = new RegExp(urlRegexStr, 'i');
  conditions.push({ 'meta.include': urlRegex });
  conditions.push({ 'meta.match': urlRegex });

  scriptsList.listScripts({ $or: conditions }, req.route.params, baseUrl,
    function (scriptsList) {
      res.render('index', {
        'title': 'Searching for "' + search  +'"',
        'username': user ? user.name : null,
        'search': search,
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
