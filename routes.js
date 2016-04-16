'use strict';

// Define some pseudo module globals
var isPro = require('./libs/debug').isPro;
var isDev = require('./libs/debug').isDev;
var isDbg = require('./libs/debug').isDbg;

//
var main = require('./controllers/index');
var authentication = require('./controllers/auth');
var admin = require('./controllers/admin');
var user = require('./controllers/user');
var script = require('./controllers/script');
var flag = require('./controllers/flag');
var remove = require('./controllers/remove');
var moderation = require('./controllers/moderation');
var group = require('./controllers/group');
var discussion = require('./controllers/discussion');
var issue = require('./controllers/issue');
var scriptStorage = require('./controllers/scriptStorage');
var document = require('./controllers/document');

var statusCodePage = require('./libs/templateHelpers').statusCodePage;
var ensureNumberOrNull = require('./libs/helpers').ensureNumberOrNull;

var MongoClient = require('mongodb').MongoClient;
var ExpressBrute = require('express-brute');
var MongoStore = require('express-brute-mongo');

var store = null;
if (isPro) {
  store = new MongoStore(function (ready) {
    MongoClient.connect('mongodb://127.0.0.1:27017/test', function(aErr, aDb) {
      if (aErr) {
        throw aErr;
      }
      ready(aDb.collection('bruteforce-store'));
    });
  });
} else {
  store = new ExpressBrute.MemoryStore(); // stores state locally, don't use this in production
}

var tooManyRequests = function (aReq, aRes, aNext, aNextValidRequestDate) {
  var secondUntilNextRequest = null;

  if (isDev) {
    secondUntilNextRequest = Math.ceil((aNextValidRequestDate.getTime() - Date.now())/1000);
    aRes.header('Retry-After', secondUntilNextRequest);
  }
  statusCodePage(aReq, aRes, aNext, {
    statusCode: 429,
    statusMessage: 'Too Many Requests. Try again in ' +  (secondUntilNextRequest ? secondUntilNextRequest + ' seconds' : 'a few.')
  });
}

var sourcesBruteforce = new ExpressBrute(store, {
  freeRetries: ensureNumberOrNull(process.env.BRUTE_FREERETRIES) || (0),
  minWait: ensureNumberOrNull(process.env.BRUTE_MINWAIT) || (1000 * 60), // seconds
  maxWait: ensureNumberOrNull(process.env.BRUTE_MAXWAIT) || (1000 * 60 * 15), // minutes
  lifetime: ensureNumberOrNull(process.env.BRUTE_LIFETIME) || undefined, //
  failCallback: tooManyRequests
});


module.exports = function (aApp) {
  //--- Middleware

  //--- Routes
  // Authentication routes
  aApp.route('/auth/').post(authentication.auth);
  aApp.route('/auth/:strategy').get(authentication.auth);
  aApp.route('/auth/:strategy/callback/:junk?').get(authentication.callback);
  aApp.route('/login').get(main.register);
  aApp.route('/register').get(main.register);
  aApp.route('/logout').get(main.logout);

  // User routes
  aApp.route('/users').get(user.userListPage);
  aApp.route('/users/:username').get(user.view);
  aApp.route('/users/:username/comments').get(user.userCommentListPage);
  aApp.route('/users/:username/scripts').get(user.userScriptListPage);
  aApp.route('/users/:username/github/repos').get(authentication.validateUser, user.userGitHubRepoListPage);
  aApp.route('/users/:username/github/repo').get(authentication.validateUser, user.userGitHubRepoPage);
  aApp.route('/users/:username/github/import').post(authentication.validateUser, user.userGitHubImportScriptPage);
  aApp.route('/users/:username/profile/edit').get(authentication.validateUser, user.userEditProfilePage).post(authentication.validateUser, user.update);
  aApp.route('/users/:username/update').post(admin.adminUserUpdate);
  aApp.route('/user/preferences').get(authentication.validateUser, user.userEditPreferencesPage);
  aApp.route('/user').get(function (aReq, aRes) { aRes.redirect('/users'); });

  // Adding script/library routes
  aApp.route('/user/add/scripts').get(authentication.validateUser, user.newScriptPage);
  aApp.route('/user/add/scripts/new').get(script.new(user.editScript)).post(authentication.validateUser, script.new(user.submitSource));
  aApp.route('/user/add/scripts/upload').post(authentication.validateUser, user.uploadScript);
  aApp.route('/user/add/lib').get(authentication.validateUser, user.newLibraryPage);
  aApp.route('/user/add/lib/new').get(script.new(script.lib(user.editScript))).post(authentication.validateUser, script.new(script.lib(user.submitSource)));
  aApp.route('/user/add/lib/upload').post(authentication.validateUser, script.lib(user.uploadScript));
  aApp.route('/user/add').get(function (aReq, aRes) { aRes.redirect('/user/add/scripts'); });

  // Script routes
  aApp.route('/scripts/:username/:scriptname').get(script.view);
  aApp.route('/scripts/:username/:scriptname/edit').get(authentication.validateUser, script.edit).post(authentication.validateUser, script.edit);
  aApp.route('/scripts/:username/:scriptname/source').get(user.editScript);
  aApp.route('/scripts/:username').get(function (aReq, aRes) {
    aRes.redirect('/users/' + aReq.params.username + '/scripts'); // NOTE: Watchpoint
  });

  aApp.route('/install/:username/:scriptname').get(sourcesBruteforce.getMiddleware({key : scriptStorage.keyScript}), scriptStorage.sendScript);
  aApp.route('/meta/:username/:scriptname').get(scriptStorage.sendMeta);

  // Github hook routes
  aApp.route('/github/hook').post(scriptStorage.webhook);
  aApp.route('/github/service').post(function (aReq, aRes, aNext) { aNext(); });
  aApp.route('/github').get(function (aReq, aRes) { aRes.redirect('/'); });

  // Library routes
  aApp.route('/libs/:username/:scriptname').get(script.lib(script.view));
  aApp.route('/libs/:username/:scriptname/edit').get(authentication.validateUser, script.lib(script.edit)).post(authentication.validateUser, script.lib(script.edit));
  aApp.route('/libs/:username/:scriptname/source').get(script.lib(user.editScript));

  // Raw source
  aApp.route('/src/:type(scripts|libs)/:username/:scriptname').get(sourcesBruteforce.getMiddleware({key : scriptStorage.keyScript}), scriptStorage.sendScript);

  // Issues routes
  aApp.route('/:type(scripts|libs)/:username/:scriptname/issues/:open(open|closed|all)?').get(issue.list);
  aApp.route('/:type(scripts|libs)/:username/:scriptname/issue/new').get(authentication.validateUser, issue.open).post(authentication.validateUser, issue.open);
  aApp.route('/:type(scripts|libs)/:username/:scriptname/issues/:topic').get(issue.view).post(authentication.validateUser, issue.comment);
  aApp.route('/:type(scripts|libs)/:username/:scriptname/issues/:topic/:action(close|reopen)').get(authentication.validateUser, issue.changeStatus);

  // Admin routes
  aApp.route('/admin').get(admin.adminPage);
  aApp.route('/admin/npm/version').get(admin.adminNpmVersionView);
  aApp.route('/admin/git/short').get(admin.adminGitShortView);
  aApp.route('/admin/git/branch').get(admin.adminGitBranchView);
  aApp.route('/admin/process/clone').get(admin.adminProcessCloneView);
  aApp.route('/admin/npm/package').get(admin.adminNpmPackageView);
  aApp.route('/admin/npm/list').get(admin.adminNpmListView);
  aApp.route('/admin/api').get(admin.adminApiKeysPage);
  aApp.route('/admin/authas').get(admin.authAsUser);
  aApp.route('/admin/json').get(admin.adminJsonView);

  aApp.route('/admin/api/update').post(admin.apiAdminUpdate);

  // Moderation routes
  aApp.route('/mod').get(moderation.modPage);
  aApp.route('/mod/removed').get(moderation.removedItemListPage);
  aApp.route('/mod/removed/:id').get(moderation.removedItemPage);

  // Vote routes
  // TODO: Single vote route + POST
  aApp.route('/vote/scripts/:username/:scriptname/:vote').get(authentication.validateUser, script.vote);
  aApp.route('/vote/libs/:username/:scriptname/:vote').get(authentication.validateUser, script.lib(script.vote));

  // Flag routes
  aApp.route(/^\/flag\/(users|scripts|libs)\/((.+?)(?:\/(.+))?)$/).post(flag.flag);

  // Remove route
  aApp.route(/^\/remove\/(users|scripts|libs)\/((.+?)(?:\/(.+))?)$/).post(remove.rm);

  // Group routes
  aApp.route('/groups').get(group.list);
  aApp.route('/group/:groupname').get(group.view);
  aApp.route('/group').get(function (aReq, aRes) { aRes.redirect('/groups'); });
  aApp.route('/api/group/search/:term/:addTerm?').get(group.search);

  // Discussion routes
  // TODO: Update templates for new discussion routes
  aApp.route('/forum').get(discussion.categoryListPage);
  aApp.route('/:p(forum)?/:category(announcements|corner|garage|discuss|issues|all)').get(discussion.list);
  aApp.route('/:p(forum)?/:category(announcements|corner|garage|discuss)/:topic').get(discussion.show).post(discussion.createComment);
  aApp.route('/:p(forum)?/:category(announcements|corner|garage|discuss)/new').get(authentication.validateUser, discussion.newTopic).post(authentication.validateUser, discussion.createTopic);
  // dupe
  aApp.route('/post/:category(announcements|corner|garage|discuss)').get(authentication.validateUser, discussion.newTopic).post(authentication.validateUser, discussion.createTopic);

  // About document routes
  aApp.route('/about/:document?').get(document.view);

  // Home route
  aApp.route('/').get(main.home);

  // Static Routes
  require('./routesStatic')(aApp);

  // Fallback routes
  aApp.use(function (aReq, aRes, aNext) {
    statusCodePage(aReq, aRes, aNext, {
      statusCode: 404,
      statusMessage: 'This is not the page you\'re are looking for.'
    });
  });
};
