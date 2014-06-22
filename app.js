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

var modelParser = require('./libs/modelParser');

var modifySessions = require('./libs/modifySessions');
var settings = require('./models/settings.json');
var connectStr = process.env.CONNECT_STRING || settings.connect;
var sessionSecret = process.env.SESSION_SECRET || settings.secret;
var db = mongoose.connection;
var dbOptions = { server : { socketOptions : { keepAlive: 1 } } };

app.set('port', process.env.PORT || 8080);

// Connect to the database
mongoose.connect(connectStr, dbOptions);
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function () {
  app.listen(app.get('port'));
});

app.configure(function(){
  var sessionStore = new MongoStore({ mongoose_connection: db });

  // See https://hacks.mozilla.org/2013/01/building-a-node-js-server-that-wont-melt-a-node-js-holiday-season-part-5/
  app.use(function (req, res, next) {
    // check if we're toobusy
    if (toobusy()) {
      statusCodePage(req, res, next, {
        statusCode: 503,
        statusMessage: 'We\'re busy right now. Try again later.',
      });
    } else {
      next();
    }
  });

  // Force HTTPS
  if (app.get('port') === 443) {
    app.use(function (req, res, next) {
      res.setHeader('Strict-Transport-Security',
        'max-age=8640000; includeSubDomains');

      if (req.headers['x-forwarded-proto'] !== 'https') {
        return res.redirect(301, 'https://' + req.headers.host
          + encodeURI(req.url));
      }

      next();
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
function listRegex (root, type) {
  var slash = '\/';
  if (root === slash) { slash = ''; }
  return new RegExp('^' + root +
    '(?:' + slash + '(?:' + type + ')list' +
    '(?:\/size\/(\d+))?' +
    '(?:\/sort\/([^\/]+))?' +
    '(?:\/dir\/(asc|desc))?' +
    '(?:\/page\/([1-9][0-9]*))?' +
    ')?$');
}

// Emulate app.route('/').VERB(callback).VERB(callback); from ExpressJS 4.x
var methods = ['get', 'post', 'put', 'head', 'delete', 'options'];
function app_route(path) {
  var r = {};
  r.all = function(cb) {
    app.all.call(app, path, cb);
  };
  methods.forEach(function(method){
    r[method] = function(cb) {
      app[method].call(app, path, cb);
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
app_route('/user/add/scripts').get(user.newScriptPage);
app_route('/user/add/lib').get(user.newLibraryPage);
app_route('/user/add/scripts/new').get(user.editScript).post(user.submitSource);

// User routes: Legacy
app_route('/user/add/lib/new').get(script.lib(user.editScript)).post(script.lib(user.submitSource));
app_route('/user/add/scripts/upload').post(user.uploadScript);
app_route('/user/add/lib/upload').post(script.lib(user.uploadScript));


// Script routes
app_route('/scripts/:username/:namespace?/:scriptname').get(script.view);
app_route('/script/:username/:namespace?/:scriptname/edit').get(script.edit).post(script.edit);
app_route('/script/:namespace?/:scriptname/edit').get(script.edit).post(script.edit);
app_route('/scripts/:username/:namespace?/:scriptname/source').get(user.editScript); // Legacy TODO Remove

// Script routes: Legacy
app.get('/install/:username/:namespace?/:scriptname', scriptStorage.sendScript);
app.get('/meta/:username/:namespace?/:scriptname', scriptStorage.sendMeta);
app.get('/vote/scripts/:username/:namespace?/:scriptname/:vote', script.vote);
app.post('/github/hook', scriptStorage.webhook);
app.post('/github/service', function (req, res, next) { next(); });

// Library routes
app.get(listRegex('\/toolbox', 'lib'), main.toolbox);
app.get(listRegex('\/search\/([^\/]+?)', 'lib'), main.toolSearch);
app.get('/libs/:username/:scriptname', script.lib(script.view));
app.get('/lib/:scriptname/edit', script.lib(script.edit));
app.post('/lib/:scriptname/edit', script.lib(script.edit));
app.get('/libs/:username/:scriptname/source', script.lib(user.editScript));
app.get('/libs/src/:username/:scriptname', scriptStorage.sendScript);
app.get('/vote/libs/:username/:scriptname/:vote', script.lib(script.vote));
//app.get(listRegex('\/use\/lib\/([^\/]+?)\/([^\/]+?)', 'script'), script.useLib);

// Issues routes
app_route('/:type(scripts|libs)/:username/:namespace?/:scriptname/issues/:open(closed)?').get(issue.list);
// app_route('/:type(scripts|libs)/:username/:namespace?/:scriptname/issues/:topic').get(issue.view);
app_route('/:type(scripts|libs)/:username/:namespace?/:scriptname/issue/new').get(issue.open).post(issue.open);
app_route('/:type(scripts|libs)/:username/:namespace?/:scriptname/issues/:topic').get(issue.view);

// Issues routes: Legacy
app.post('/:type(scripts|libs)/:username/:namespace?/:scriptname/issues/:topic', issue.comment);
app.get('/:type(scripts|libs)/:username/:namespace?/:scriptname/issues/:topic/:action(close|reopen)', issue.changeStatus);

// Admin routes
app.get('/admin', admin.adminPage);
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
app.get('/flag/libs/:username/:scriptname/:unflag?', script.lib(script.flag)); //
app.get(listRegex('\/flagged(?:\/([^\/]+?))?', 'user|script'),
  moderation.flagged); //
app.get(listRegex('\/graveyard(?:\/([^\/]+?))?', ''), moderation.graveyard);
app.get(/^\/remove\/(.+?)\/(.+)$/, remove.rm);

// Group routes
app_route('/groups').get(group.list);
app_route('/group/:groupname').get(group.view);
app_route('/api/group/search/:term/:addTerm?').get(group.search);

// Discussion routes
app_route('/forum').get(discussion.categoryListPage);
app_route('/forum/:category(announcements|corner|garage|discuss)').get(discussion.list);
app_route('/forum/:category(announcements|corner|garage|discuss)/new').get(discussion.newTopic).post(discussion.createTopic);
app_route('/forum/:category(announcements|corner|garage|discuss)/:topic').get(discussion.show).post(discussion.createComment);

// Discussion routes: Legacy
// app_route('/:category(announcements|corner|garage|discuss)').get(function(req, res, next) { res.redirect(util.format('/forum/%s', req.route.params.category)); });
// app_route('/:category(announcements|corner|garage|discuss)/:topic').get(function(req, res, next) { res.redirect(util.format('/forum/%s/%s', req.route.params.category, req.route.params.topic)) });
app.get(listRegex('\/(announcements|corner|garage|discuss)', ''), discussion.list);
app.get(listRegex('\/(announcements|corner|garage|discuss)\/([^\/]+?)', ''), discussion.show);
app.get('/post/:category(announcements|corner|garage|discuss)', discussion.newTopic);
app.post('/post/:category(announcements|corner|garage|discuss)', discussion.createTopic);
app.post('/:category(announcements|corner|garage|discuss)/:topic', discussion.createComment);

// Search routes: Legacy
app.post('/search', function(req, res) {
  var search = encodeURIComponent(req.body.search.replace(/^\s+|\s+$/g, ''));
  res.redirect('/search/' + search + '/' + req.body.type + 'list');
});
app.get(listRegex('\/search\/([^\/]+?)', 'script'), main.search);
app.get(listRegex('\/', 'script'), main.home);

// Fallback routes
app.use(express.static(__dirname + '/public'));
app.use(function (req, res, next) {
  statusCodePage(req, res, next, {
    statusCode: 404,
    statusMessage: 'This is not the page you\'re are looking for.',
  });
});

