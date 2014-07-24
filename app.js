'use strict';

var toobusy = require('toobusy-js');
var express = require('express');
var MongoStore = require('connect-mongo')(express);
var mongoose = require('mongoose');
var passport = require('passport');
var util = require('util');

var app = express();

var main = require('./controllers/index');
var authentication = require('./controllers/auth');
var admin = require('./controllers/admin');
var user = require('./controllers/user');
var script = require('./controllers/script');
var remove = require('./controllers/remove');
var moderation = require('./controllers/moderation');
var group = require('./controllers/group');
var discussion = require('./controllers/discussion');
var issue = require('./controllers/issue');
var scriptStorage = require('./controllers/scriptStorage');

var statusCodePage = require('./libs/templateHelpers').statusCodePage;
var modifySessions = require('./libs/modifySessions');

var settings = require('./models/settings.json');

var connectStr = process.env.CONNECT_STRING || settings.connect;
var sessionSecret = process.env.SESSION_SECRET || settings.secret;
var db = mongoose.connection;
var dbOptions = { server: { socketOptions: { keepAlive: 1 } } };

app.set('port', process.env.PORT || 8080);

// Connect to the database
mongoose.connect(connectStr, dbOptions);
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function () {
  app.listen(app.get('port'));
});

app.configure(function () {
  var sessionStore = new MongoStore({ mongoose_connection: db });

  // See https://hacks.mozilla.org/2013/01/building-a-node-js-server-that-wont-melt-a-node-js-holiday-season-part-5/
  app.use(function (aReq, aRes, aNext) {
    // check if we're toobusy
    if (toobusy()) {
      statusCodePage(aReq, aRes, aNext, {
        statusCode: 503,
        statusMessage: 'We\'re busy right now. Try again later.',
      });
    } else {
      aNext();
    }
  });

  // Force HTTPS
  if (app.get('port') === 443) {
    app.use(function (aReq, aRes, aNext) {
      aRes.setHeader('Strict-Transport-Security',
        'max-age=8640000; includeSubDomains');

      if (aReq.headers['x-forwarded-proto'] !== 'https') {
        return aRes.redirect(301, 'https://' + aReq.headers.host + encodeURI(aReq.url));
      }

      aNext();
    });
  }

  if (process.env.NODE_ENV !== 'production') {
    app.use(express.logger('dev'));
  }

  app.use(express.urlencoded());
  app.use(express.json());
  app.use(express.compress());
  app.use(express.methodOverride());

  // Order is very important here (i.e mess with at your own risk)
  app.use(express.cookieParser());
  app.use(express.session({
    secret: sessionSecret,
    store: sessionStore
  }));
  app.use(passport.initialize());
  app.use(modifySessions.init(sessionStore));
  app.use(app.router);
  app.use(express.favicon('public/images/favicon.ico'));

  // Set up the views
  app.engine('html', require('./libs/muExpress').renderFile(app));
  app.set('view engine', 'html');
  app.set('views', __dirname + '/views');
});

// Build the route regex for model lists
function listRegex(aRoot, aType) {
  var slash = '\/';
  if (aRoot === slash) { slash = ''; }
  return new RegExp('^' + aRoot +
    '(?:' + slash + '(?:' + aType + ')list' +
    '(?:\/size\/(\d+))?' +
    '(?:\/sort\/([^\/]+))?' +
    '(?:\/dir\/(asc|desc))?' +
    '(?:\/page\/([1-9][0-9]*))?' +
    ')?$');
}

// Emulate app.route('/').VERB(callback).VERB(callback); from ExpressJS 4.x
var methods = ['get', 'post', 'put', 'head', 'delete', 'options'];
function app_route(aPath) {
  var r = {};
  r.all = function (aCallback) {
    app.all.call(app, aPath, aCallback);
  };
  methods.forEach(function (aMethod) {
    r[aMethod] = function (aCallback) {
      app[aMethod].call(app, aPath, aCallback);
      return r;
    };
  });
  return r;
}

// Authentication routes
app_route('/auth/').post(authentication.auth);
app_route('/auth/:strategy').get(authentication.auth);
app_route('/auth/:strategy/callback/').get(authentication.callback);
app_route('/login').get(main.register);
app_route('/register').get(main.register);
app_route('/logout').get(main.logout);

// User routes
app_route('/users').get(user.userListPage);
app_route('/users/:username').get(user.view);
app_route('/users/:username/comments').get(user.userCommentListPage);
app_route('/users/:username/scripts').get(user.userScriptListPage);
app_route('/users/:username/github').get(user.userManageGitHubPage).post(user.userManageGitHubPage);
app_route('/users/:username/github/repos').get(user.userGitHubRepoListPage);
app_route('/users/:username/github/repo').get(user.userGitHubRepoPage);
app_route('/users/:username/github/import').post(user.userGitHubImportScriptPage);
app_route('/users/:username/profile/edit').get(user.userEditProfilePage).post(user.update);
app_route('/users/:username/update').post(admin.adminUserUpdate);
app_route('/user/preferences').get(user.userEditPreferencesPage);
app_route('/user').get(function(aReq, aRes) { aRes.redirect('/users'); });

// Adding script/library routes
app_route('/user/add/scripts').get(user.newScriptPage);
app_route('/user/add/scripts/new').get(user.editScript).post(user.submitSource);
app_route('/user/add/scripts/upload').post(user.uploadScript);
app_route('/user/add/lib').get(user.newLibraryPage);
app_route('/user/add/lib/new').get(script.lib(user.editScript)).post(script.lib(user.submitSource));
app_route('/user/add/lib/upload').post(script.lib(user.uploadScript));
app_route('/user/add').get(function(aReq, aRes) { aRes.redirect('/user/add/scripts'); });

// Script routes
app_route('/scripts/:username/:namespace?/:scriptname').get(script.view);
app_route('/script/:username/:namespace?/:scriptname/edit').get(script.edit).post(script.edit);
app_route('/script/:namespace?/:scriptname/edit').get(script.edit).post(script.edit);
app_route('/scripts/:username/:namespace?/:scriptname/source').get(user.editScript); // Legacy TODO Remove
app_route('/scripts/:username').get(function(aReq, aRes) {
  aRes.redirect('/users/' + aReq.route.params.username + '/scripts');
});

// Script routes: Legacy
app.get('/install/:username/:namespace?/:scriptname', scriptStorage.sendScript);
app.get('/meta/:username/:namespace?/:scriptname', scriptStorage.sendMeta);
app.get('/vote/scripts/:username/:namespace?/:scriptname/:vote', script.vote);

// Github hook routes
app_route('/github/hook').post(scriptStorage.webhook);
app_route('/github/service').post(function(aReq, aRes, aNext) { aNext(); });
app_route('/github').get(function(aReq, aRes) { aRes.redirect('/'); });

// Library routes
app.get(listRegex('\/toolbox', 'lib'), main.toolbox);
app.get(listRegex('\/search\/([^\/]+?)', 'lib'), main.toolSearch);
app.get('/libs/:username/:scriptname', script.lib(script.view));
app.get('/lib/:scriptname/edit', script.lib(script.edit));
app.post('/lib/:scriptname/edit', script.lib(script.edit));
app.get('/libs/:username/:scriptname/source', script.lib(user.editScript));
app.get('/vote/libs/:username/:scriptname/:vote', script.lib(script.vote));
//app.get(listRegex('\/use\/lib\/([^\/]+?)\/([^\/]+?)', 'script'), script.useLib);

// Raw source
app.get('/src/:type(scripts|libs)/:username/:scriptname',
  scriptStorage.sendScript);
app.get('/libs/src/:username/:scriptname', scriptStorage.sendScript); // Legacy

// Issues routes
app_route('/:type(scripts|libs)/:username/:namespace?/:scriptname/issues/:open(closed)?').get(issue.list);
app_route('/:type(scripts|libs)/:username/:namespace?/:scriptname/issue/new').get(issue.open).post(issue.open);
app_route('/:type(scripts|libs)/:username/:namespace?/:scriptname/issues/:topic').get(issue.view).post(issue.comment);
app_route('/:type(scripts|libs)/:username/:namespace?/:scriptname/issues/:topic/:action(close|reopen)').get(issue.changeStatus);

// Admin routes
app.get('/admin', admin.adminPage);
app.get('/admin/authas', admin.authAsUser);
app.get('/admin/json', admin.adminJsonView);
app.get('/admin/user/:id', admin.adminUserView);
app.get('/admin/api', admin.adminApiKeysPage);
app.post('/admin/api/update', admin.apiAdminUpdate);

// Moderation routes
app_route('/mod').get(moderation.modPage);
app_route('/mod/removed').get(moderation.removedItemListPage);
app_route('/mod/removed/:id').get(moderation.removedItemPage);
app.get('/flag/users/:username/:unflag?', user.flag);
app.get('/flag/scripts/:username/:namespace?/:scriptname/:unflag?', script.flag);
app.get('/flag/libs/:username/:scriptname/:unflag?', script.lib(script.flag));
app.get(listRegex('\/flagged(?:\/([^\/]+?))?', 'user|script'), moderation.flagged);
app.get(listRegex('\/graveyard(?:\/([^\/]+?))?', ''), moderation.graveyard);
app.get(/^\/remove\/(.+?)\/(.+)$/, remove.rm);

// Group routes
app_route('/groups').get(group.list);
app_route('/group/:groupname').get(group.view);
app_route('/group').get(function(aReq, aRes) { aRes.redirect('/groups'); });
app_route('/api/group/search/:term/:addTerm?').get(group.search);

// Discussion routes
app_route('/forum').get(discussion.categoryListPage);
app_route('/forum/:category(announcements|corner|garage|discuss)').get(discussion.list);
app_route('/forum/:category(announcements|corner|garage|discuss)/new').get(discussion.newTopic).post(discussion.createTopic);
app_route('/forum/:category(announcements|corner|garage|discuss)/:topic').get(discussion.show).post(discussion.createComment);

// Discussion routes: Legacy
// app_route('/:category(announcements|corner|garage|discuss)').get(function (aReq, aRes, aNext) { aRes.redirect(util.format('/forum/%s', aReq.route.params.category)); });
// app_route('/:category(announcements|corner|garage|discuss)/:topic').get(function (aReq, aRes, aNext) { aRes.redirect(util.format('/forum/%s/%s', aReq.route.params.category, aReq.route.params.topic)) });
app.get(listRegex('\/(announcements|corner|garage|discuss)', ''), discussion.list);
app.get(listRegex('\/(announcements|corner|garage|discuss)\/([^\/]+?)', ''), discussion.show);
app.get('/post/:category(announcements|corner|garage|discuss)', discussion.newTopic);
app.post('/post/:category(announcements|corner|garage|discuss)', discussion.createTopic);
app.post('/:category(announcements|corner|garage|discuss)/:topic', discussion.createComment);

// Search routes: Legacy
app.post('/search', function (aReq, aRes) {
  var search = encodeURIComponent(aReq.body.search.replace(/^\s+|\s+$/g, ''));
  aRes.redirect('/search/' + search + '/' + aReq.body.type + 'list');
});
app.get(listRegex('\/search\/([^\/]+?)', 'script'), main.search);
app.get(listRegex('\/', 'script'), main.home);

// Fallback routes
app.use(express.static(__dirname + '/public'));
app.use(function (aReq, aRes, aNext) {
  statusCodePage(aReq, aRes, aNext, {
    statusCode: 404,
    statusMessage: 'This is not the page you\'re are looking for.',
  });
});
