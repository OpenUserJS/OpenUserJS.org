'use strict';

// Define some pseudo module globals
var isPro = require('./libs/debug').isPro;
var isDev = require('./libs/debug').isDev;
var isDbg = require('./libs/debug').isDbg;

//
var express = require('express');

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
var document = require('./controllers/document');

var statusCodePage = require('./libs/templateHelpers').statusCodePage;

module.exports = function (aApp) {
  //--- Middleware

  //--- Routes
  // Authentication routes
  aApp.route('/auth/').post(authentication.auth);
  aApp.route('/auth/:strategy').get(authentication.auth);
  aApp.route('/auth/:strategy/callback/').get(authentication.callback);
  aApp.route('/login').get(main.register);
  aApp.route('/register').get(main.register);
  aApp.route('/logout').get(main.logout);

  // User routes
  aApp.route('/users').get(user.userListPage);
  aApp.route('/users/:username').get(user.view);
  aApp.route('/users/:username/comments').get(user.userCommentListPage);
  aApp.route('/users/:username/scripts').get(user.userScriptListPage);
  aApp.route('/users/:username/update').post(admin.adminUserUpdate);
  aApp.route('/user').get(function (aReq, aRes) { aRes.redirect('/users'); });

  // Account routes
  aApp.route('/account/github').get(user.userManageGitHubPage).post(user.userManageGitHubPage);
  aApp.route('/account/github/repos').get(user.userGitHubRepoListPage);
  aApp.route('/account/github/repo').get(user.userGitHubRepoPage);
  aApp.route('/account/github/import').post(require('./controllers/githubImport'));
  aApp.route('/account/profile/edit').get(user.userEditProfilePage).post(user.update);
  aApp.route('/account/preferences').get(user.userEditPreferencesPage);

  // Adding script/library routes
  aApp.route('/account/add/scripts').get(user.newScriptPage);
  aApp.route('/account/add/scripts/new').get(script.new(user.editScript)).post(script.new(user.submitSource));
  aApp.route('/account/add/scripts/upload').post(user.uploadScript);
  aApp.route('/account/add/lib').get(user.newLibraryPage);
  aApp.route('/account/add/lib/new').get(script.new(script.lib(user.editScript))).post(script.new(script.lib(user.submitSource)));
  aApp.route('/account/add/lib/upload').post(script.lib(user.uploadScript));
  aApp.route('/account/add').get(function (aReq, aRes) { aRes.redirect('/user/add/scripts'); });

  // Script routes
  aApp.route('/scripts/:username/:namespace?/:scriptname').get(script.view);
  aApp.route('/script/:username/:namespace?/:scriptname/edit').get(script.edit).post(script.edit);
  aApp.route('/script/:namespace?/:scriptname/edit').get(script.edit).post(script.edit);
  aApp.route('/scripts/:username/:namespace?/:scriptname/source').get(user.editScript);
  aApp.route('/scripts/:username').get(function (aReq, aRes) {
    aRes.redirect('/users/' + aReq.params.username + '/scripts');
  });
  aApp.route('/install/:username/:namespace?/:scriptname').get(scriptStorage.sendScript);
  aApp.route('/meta/:username/:namespace?/:scriptname').get(scriptStorage.sendMeta);

  // Github hook routes
  aApp.route('/github/hook').post(require('./controllers/githubHook'));
  aApp.route('/github/service').post(function (aReq, aRes, aNext) { aNext(); });
  aApp.route('/github').get(function (aReq, aRes) { aRes.redirect('/'); });

  // Library routes
  aApp.route('/libs/:username/:scriptname').get(script.lib(script.view));
  aApp.route('/lib/:scriptname/edit').get(script.lib(script.edit));
  aApp.route('/lib/:scriptname/edit').post(script.lib(script.edit));
  aApp.route('/libs/:username/:scriptname/source').get(script.lib(user.editScript));
  aApp.route('/libs/src/:username/:scriptname').get(scriptStorage.sendScript);

  // Raw source
  aApp.route('/src/:type(scripts|libs)/:username/:scriptname').get(scriptStorage.sendScript);
  aApp.route('/libs/src/:username/:scriptname').get(scriptStorage.sendScript); // Legacy

  // Issues routes
  aApp.route('/:type(scripts|libs)/:username/:namespace?/:scriptname/issues/:open(closed)?').get(issue.list);
  aApp.route('/:type(scripts|libs)/:username/:namespace?/:scriptname/issue/new').get(issue.open).post(issue.open);
  aApp.route('/:type(scripts|libs)/:username/:namespace?/:scriptname/issues/:topic').get(issue.view).post(issue.comment);
  aApp.route('/:type(scripts|libs)/:username/:namespace?/:scriptname/issues/:topic/:action(close|reopen)').get(issue.changeStatus);

  // Admin routes
  aApp.route('/admin').get(admin.adminPage);
  aApp.route('/admin/authas').get(admin.authAsUser);
  aApp.route('/admin/json').get(admin.adminJsonView);
  aApp.route('/admin/user/:id').get(admin.adminUserView);
  aApp.route('/admin/api').get(admin.adminApiKeysPage);
  aApp.route('/admin/npmls').get(admin.adminNpmLsView);
  aApp.route('/admin/api/update').post(admin.apiAdminUpdate);

  // Moderation routes
  aApp.route('/mod').get(moderation.modPage);
  aApp.route('/mod/removed').get(moderation.removedItemListPage);
  aApp.route('/mod/removed/:id').get(moderation.removedItemPage);

  // Vote routes
  // TODO: Single vote route + POST
  aApp.route('/vote/scripts/:username/:namespace?/:scriptname/:vote').get(script.vote);
  aApp.route('/vote/libs/:username/:scriptname/:vote').get(script.lib(script.vote));

  // Flag routes
  // TODO: Single flag route + POST
  aApp.route('/flag/users/:username/:unflag?').get(user.flag);
  aApp.route('/flag/scripts/:username/:scriptname/:unflag?').get(script.flag);
  aApp.route('/flag/libs/:username/:scriptname/:unflag?').get(script.lib(script.flag));

  // Remove route
  // TODO: Make POST route
  aApp.route(/^\/remove\/(.+?)\/(.+)$/).get(remove.rm);

  // Group routes
  aApp.route('/groups').get(group.list);
  aApp.route('/group/:groupname').get(group.view);
  aApp.route('/group').get(function (aReq, aRes) { aRes.redirect('/groups'); });
  aApp.route('/api/group/search/:term/:addTerm?').get(group.search);

  // Discussion routes
  // TODO: Update templates for new discussion routes
  aApp.route('/forum').get(discussion.categoryListPage);
  aApp.route('/:p(forum)?/:category(announcements|corner|garage|discuss)').get(discussion.list);
  aApp.route('/:p(forum)?/:category(announcements|corner|garage|discuss)/:topic').get(discussion.show).post(discussion.createComment);
  aApp.route('/:p(forum)?/:category(announcements|corner|garage|discuss)/new').get(discussion.newTopic).post(discussion.createTopic);
  // dupe
  aApp.route('/post/:category(announcements|corner|garage|discuss)').get(discussion.newTopic).post(discussion.createTopic);

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
      statusMessage: 'This is not the page you\'re are looking for.',
    });
  });
};
