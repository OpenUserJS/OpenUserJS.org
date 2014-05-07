// var toobusy = require('toobusy');
var express = require('express');
var MongoStore = require('connect-mongo')(express);
var mongoose = require('mongoose');
var passport = require('passport');
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
var settings = require('./models/settings.json');
var connectStr = process.env.CONNECT_STRING || settings.connect;
var sessionSecret = process.env.SESSION_SECRET || settings.secret;
var db = mongoose.connection;

app.set('port', process.env.PORT || 8080);

app.configure(function(){
  // See https://hacks.mozilla.org/2013/01/building-a-node-js-server-that-wont-melt-a-node-js-holiday-season-part-5/
 /* app.use(function (req, res, next) {
    // check if we're toobusy
    if (toobusy()) { 
      res.send(503, 'I\'m busy right now, sorry :(');
    } else {
      next();
    }
  });
*/
  // Force HTTPS
  if (process.env.NODE_ENV === 'production') {
    app.use(function (req, res, next) {
      res.setHeader('Strict-Transport-Security', 
        'max-age=8640000; includeSubDomains');

      if (req.headers['x-forwarded-proto'] !== 'https') {
        return res.redirect(301, 'https://' + req.headers.host + req.url);
      }

      next();
    });
  }

  app.use(express.urlencoded());
  app.use(express.json());
  app.use(express.compress());
  app.use(express.methodOverride());

  // Order is very important here (i.e mess with at your own risk)
  app.use(express.cookieParser());
  app.use(express.session({
    secret: sessionSecret,
    store: new MongoStore({
      url: connectStr
    })
  }));
  app.use(passport.initialize());
  app.use(app.router);

  // Set up the views
  app.engine('html', require('./libs/muExpress').renderFile(app));
  app.set('view engine', 'html');
  app.set('views', __dirname + '/views');
});

mongoose.connect(connectStr);
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function () {});
app.listen(app.get('port'));

// Build the route regex for model lists
function listRegex (root, type) {
  var slash = '\/';
  if (root === slash) { slash = ''; }
  return new RegExp('^' + root +
    '(?:' + slash + '(?:' + type + ')list' +
    '(?:\/size\/(\d+))?' +
    '(?:\/sort\/([^\/]+))?' +
    '(?:\/dir\/(asc|desc))?' +
    '(?:\/page\/([1-9]\d*))?' +
    ')?$');
}

// Authentication routes
app.post('/auth/', authentication.auth);
app.get('/auth/:strategy', authentication.auth);
app.get('/auth/:strategy/callback/', authentication.callback);
app.get('/register', main.register);
app.get('/logout', main.logout);

// User routes
app.get(listRegex('\/users\/([^\/]+?)', 'script|lib'), user.view);
app.get('/user/edit', user.edit);
app.post('/user/edit', user.update);
app.get('/user/add/scripts', user.scripts);
app.post('/user/add/scripts', user.scripts);
app.get('/user/add/scripts/new', user.newScript);
app.post('/user/add/scripts/new', user.newScript);
app.get('/user/add/lib', script.lib(user.scripts));
app.post('/user/add/lib', script.lib(user.scripts));
app.get('/user/add/lib/new', script.lib(user.newScript));
app.post('/user/add/lib/new', script.lib(user.newScript));

// Script routes
app.get('/scripts/:username/:scriptname', script.view);
app.get('/scripts/:username/:namespace/:scriptname', script.view);
app.get('/script/scriptname/edit', script.edit);
app.get('/script/:namespace/:scriptname/edit', script.edit);
app.post('/script/scriptname/edit', script.edit);
app.post('/script/:namespace/:scriptname/edit', script.edit);
app.get('/install/:username/:scriptname', scriptStorage.sendScript);
app.get('/install/:username/:namespace/:scriptname', scriptStorage.sendScript);
app.get('/meta/:username/:scriptname', scriptStorage.sendMeta);
app.get('/meta/:username/:namespace/:scriptname', scriptStorage.sendMeta);
app.get('/scripts/:username/:scriptname/source', user.editScript);
app.get('/scripts/:username/:namespace/:scriptname/source', user.editScript);
app.get('/vote/scripts/:username/:scriptname/:vote', script.vote);
app.get('/vote/scripts/:username/:namespace/:scriptname/:vote', script.vote);
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
app.get(listRegex('\/use\/lib\/([^\/]+?)\/([^\/]+?)', 'script'), script.useLib);

// Issues routes
app.get(listRegex('\/(scripts|libs)\/([^\/]+?)\/([^\/]+?)(?:\/([^\/]+?))?'
  + '\/issues(?:\/(closed))?', ''), issue.list);
app.get(listRegex('\/(scripts|libs)\/([^\/]+?)\/([^\/]+?)(?:\/([^\/]+?))?'
  + '\/issues\/([^\/]+?)', ''), issue.view);
app.get('/:type(scripts|libs)/:username/:scriptname/issue/new', issue.open);
app.get('/:type(scripts|libs)/:username/:namespace/:scriptname/issue/new',
  issue.open);
app.post('/:type(scripts|libs)/:username/:scriptname/issue/new', issue.open);
app.post('/:type(scripts|libs)/:username/:namespace/:scriptname/issue/new',
  issue.open);
app.post('/:type(scripts|libs)/:username/:scriptname/issues/:topic',
  issue.comment);
app.post('/:type(scripts|libs)/:username/:namespace/:scriptname/issues/:topic',
  issue.comment);
app.get('/:type(scripts|libs)/:username/:scriptname/issues/:topic/:action(close|reopen)', issue.changeStatus);
app.get('/:type(scripts|libs)/:username/:namespace/:scriptname/issues/:topic/:action(close|reopen)', issue.changeStatus);

// Admin routes
app.get('/admin/user', admin.userAdmin);
app.get('/admin/user/:id', admin.adminUserView);
app.get('/admin/api', admin.apiAdmin);
app.post('/admin/user/update', admin.userAdminUpdate);
app.post('/admin/api/update', admin.apiAdminUpdate);

// Moderation routes
app.get('/flag/users/:username/:unflag?', user.flag);
app.get('/flag/scripts/:username/:namespace/:scriptname/:unflag?', script.flag);
app.get('/flag/scripts/:username/:scriptname/:unflag?', script.flag);
app.get('/flag/libs/:username/:scriptname/:unflag?', script.lib(script.flag)); //
app.get(listRegex('\/flagged(?:\/([^\/]+?))?', 'user|script'),
  moderation.flagged); //
app.get(listRegex('\/graveyard(?:\/([^\/]+?))?', ''), moderation.graveyard);
app.get(/^\/remove\/(.+?)\/(.+)$/, remove.rm);

// Group routes
app.get(listRegex('\/groups', ''), group.list);
app.get(listRegex('\/group\/([^\/]+?)', 'script'), group.view);
app.get('/api/group/search/:term/:addTerm?', group.search);

// Discussion routes
app.get(listRegex('\/(corner|garage|discuss)', ''), discussion.list);
app.get(listRegex('\/(corner|garage|discuss)\/([^\/]+?)', ''), discussion.show);
app.get('/post/:category(corner|garage|discuss)', discussion.newTopic);
app.post('/post/:category(corner|garage|discuss)', discussion.createTopic);
app.post('/:category(corner|garage|discuss)/:topic', discussion.createComment);

// Search routes
app.post('/search', function(req, res) {
  var search = encodeURIComponent(req.body.search.replace(/^\s+|\s+$/g, ''));
  res.redirect('/search/' + search + '/' + req.body.type + 'list');
});
app.get(listRegex('\/search\/([^\/]+?)', 'script'), main.search);
app.get(listRegex('\/', 'script'), main.home);

// Fallback routes
app.use(express.static(__dirname + '/public'));
app.use(function (req, res, next) {
  var user = req.session.user;
  res.render('404', {
    title: '404 Not Found',
    username: user ? user.name : null 
  });
});

