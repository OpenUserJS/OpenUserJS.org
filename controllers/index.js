var async = require('async');
var _ = require('underscore');

var Discussion = require('../models/discussion').Discussion;
var Group = require('../models/group').Group;
var User = require('../models/user').User;
var Script = require('../models/script').Script;
var Strategy = require('../models/strategy').Strategy;

var strategies = require('./strategies.json');
var discussionLib = require('./discussion');
var modelsList = require('../libs/modelsList');
var modelParser = require('../libs/modelParser');
var modelQuery = require('../libs/modelQuery');
var execQueryTask = require('../libs/tasks').execQueryTask;
var removeSession = require('../libs/modifySessions').remove;
var pageMetadata = require('../libs/templateHelpers').pageMetadata;

// The home page has scripts and groups in a sidebar
exports.home = function (req, res) {
  var authedUser = req.session.user;

  //
  var options = {};
  var tasks = [];

  //
  options.librariesOnly = req.query.library !== undefined;

  // Page metadata
  pageMetadata(options, options.librariesOnly ? 'Libraries' : '');

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

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

  // Announcements
  options.announcementsCategory = _.findWhere(discussionLib.categories, {slug: 'announcements'});
  options.announcementsCategory = modelParser.parseCategory(options.announcementsCategory);

  // announcementsDiscussionListQuery
  var announcementsDiscussionListQuery = Discussion.find();
  announcementsDiscussionListQuery
    .and({category: options.announcementsCategory.slug})
    .sort('-created')
    .limit(5);

  //--- Tasks

  // Pagination
  tasks.push(pagination.getCountTask(scriptListQuery));

  // scriptListQuery
  tasks.push(execQueryTask(scriptListQuery, options, 'scriptList'));

  // popularGroupListQuery
  tasks.push(execQueryTask(popularGroupListQuery, options, 'popularGroupList'));

  // announcementsDiscussionListQuery
  tasks.push(execQueryTask(announcementsDiscussionListQuery, options, 'announcementsDiscussionList'));

  //---
  function preRender() {
    // scriptList
    options.scriptList = _.map(options.scriptList, modelParser.parseScript);

    // popularGroupList
    options.popularGroupList = _.map(options.popularGroupList, modelParser.parseGroup);

    // announcementsDiscussionList
    options.announcementsDiscussionList = _.map(options.announcementsDiscussionList, modelParser.parseDiscussion);

    // Pagination
    options.paginationRendered = pagination.renderDefault(req);

    // Empty list
    options.scriptListIsEmptyMessage = 'No scripts.';
    if (options.isFlagged) {
      if (options.librariesOnly) {
        options.scriptListIsEmptyMessage = 'No flagged libraries.';
      } else {
        options.scriptListIsEmptyMessage = 'No flagged scripts.';
      }
    } else if (options.searchBarValue) {
      if (options.librariesOnly) {
        options.scriptListIsEmptyMessage = 'We couldn\'t find any libraries with this search value.';
      } else {
        options.scriptListIsEmptyMessage = 'We couldn\'t find any scripts with this search value.';
      }
    } else if (options.isUserScriptListPage) {
      options.scriptListIsEmptyMessage = 'This user hasn\'t added any scripts yet.';
    }

    // Heading
    if (options.librariesOnly) {
      options.pageHeading = options.isFlagged ? 'Flagged Libraries' : 'Libraries';
    } else {
      options.pageHeading = options.isFlagged ? 'Flagged Scripts' : 'Scripts';
    }

    // Page metadata
    if (options.isFlagged) {
      if (options.librariesOnly) {
        pageMetadata(options, ['Flagged Libraries', 'Moderation']);
      } else {
        pageMetadata(options, ['Flagged Scripts', 'Moderation']);
      }
    }
  };
  function render() { res.render('pages/scriptListPage', options); }
  function asyncComplete() { preRender(); render(); }
  async.parallel(tasks, asyncComplete);
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

  // Page metadata
  pageMetadata(options, 'Login / Register');

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
  _.each(strategies, function (strategy, strategyKey) {
    if (!strategy.oauth) {
      options.strategies.push({
        'strat': strategyKey,
        'display': strategy.name
      });
    }
  });

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
  function preRender() {
    // Sort the strategies
    options.strategies = _.sortBy(options.strategies, function (strategy) { return strategy.display; });

    // Prefer GitHub
    var githubStrategy = _.findWhere(options.strategies, { strat: 'github' });
    if (githubStrategy)
      githubStrategy.selected = true;
  };
  function render() { res.render('pages/loginPage', options); }
  function asyncComplete() { preRender(); render(); }
  async.parallel(tasks, asyncComplete);
};

exports.logout = function (req, res) {
  var authedUser = req.session.user;

  if (!authedUser) { return res.redirect('/'); }

  User.findOne({ _id: authedUser._id }, function (err, user) {
    removeSession(req, user, function () {
      res.redirect('/');
    });
  });
};
