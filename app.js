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
var about = require('./controllers/about');

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
app_route('/user').get(function (aReq, aRes) { aRes.redirect('/users'); });

// Adding script/library routes
app_route('/user/add/scripts').get(user.newScriptPage);
app_route('/user/add/scripts/new').get(user.editScript).post(user.submitSource);
app_route('/user/add/scripts/upload').post(user.uploadScript);
app_route('/user/add/lib').get(user.newLibraryPage);
app_route('/user/add/lib/new').get(script.lib(user.editScript)).post(script.lib(user.submitSource));
app_route('/user/add/lib/upload').post(script.lib(user.uploadScript));
app_route('/user/add').get(function (aReq, aRes) { aRes.redirect('/user/add/scripts'); });

// Script routes
app_route('/scripts/:username/:namespace?/:scriptname').get(script.view);
app_route('/script/:username/:namespace?/:scriptname/edit').get(script.edit).post(script.edit);
app_route('/script/:namespace?/:scriptname/edit').get(script.edit).post(script.edit);
app_route('/scripts/:username/:namespace?/:scriptname/source').get(user.editScript);
app_route('/scripts/:username').get(function (aReq, aRes) {
  aRes.redirect('/users/' + aReq.route.params.username + '/scripts');
});
app_route('/install/:username/:namespace?/:scriptname').get(scriptStorage.sendScript);
app_route('/meta/:username/:namespace?/:scriptname').get(scriptStorage.sendMeta);

// Github hook routes
app_route('/github/hook').post(scriptStorage.webhook);
app_route('/github/service').post(function (aReq, aRes, aNext) { aNext(); });
app_route('/github').get(function (aReq, aRes) { aRes.redirect('/'); });

// Library routes
app.get('/libs/:username/:scriptname', script.lib(script.view));
app.get('/lib/:scriptname/edit', script.lib(script.edit));
app.post('/lib/:scriptname/edit', script.lib(script.edit));
app.get('/libs/:username/:scriptname/source', script.lib(user.editScript));
app.get('/libs/src/:username/:scriptname', scriptStorage.sendScript);

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

// Vote routes
// TODO: Single vote route + POST
app_route('/vote/scripts/:username/:namespace?/:scriptname/:vote').get(script.vote);
app_route('/vote/libs/:username/:scriptname/:vote').get(script.lib(script.vote));

// Flag routes
// TODO: Single flag route + POST
app_route('/flag/users/:username/:unflag?').get(user.flag);
app_route('/flag/scripts/:username/:scriptname/:unflag?').get(script.flag);
app_route('/flag/libs/:username/:scriptname/:unflag?').get(script.lib(script.flag));

// Remove route
// TODO: Make POST route
app_route(/^\/remove\/(.+?)\/(.+)$/).get(remove.rm);

// Group routes
app_route('/groups').get(group.list);
app_route('/group/:groupname').get(group.view);
app_route('/group').get(function (aReq, aRes) { aRes.redirect('/groups'); });
app_route('/api/group/search/:term/:addTerm?').get(group.search);

// Discussion routes
// TODO: Update templates for new discussion routes
app_route('/forum').get(discussion.categoryListPage);
app_route('/:p(forum)?/:category(announcements|corner|garage|discuss)').get(discussion.list);
app_route('/:p(forum)?/:category(announcements|corner|garage|discuss)/:topic').get(discussion.show).post(discussion.createComment);
app_route('/:p(forum)?/:category(announcements|corner|garage|discuss)/new').get(discussion.newTopic).post(discussion.createTopic);
// dupe
app_route('/post/:category(announcements|corner|garage|discuss)').get(discussion.newTopic).post(discussion.createTopic);

// About routes
app_route('/about/tos').get(about.tosPage);
app_route('/about/dmca').get(about.dmcaPage);
app_route('/about/pp').get(about.ppPage);

// Home route
app_route('/').get(main.home);

// Fallback routes
app.use(express.static(__dirname + '/public'));
app.use(function (aReq, aRes, aNext) {
  statusCodePage(aReq, aRes, aNext, {
    statusCode: 404,
    statusMessage: 'This is not the page you\'re are looking for.',
  });
});
