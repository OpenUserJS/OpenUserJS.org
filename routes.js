'use strict';

// Define some pseudo module globals
var isPro = require('./libs/debug').isPro;
var isDev = require('./libs/debug').isDev;
var isDbg = require('./libs/debug').isDbg;

var rateLimit = require('express-rate-limit');
var MongoStore = require('rate-limit-mongo');
var exec = require('child_process').exec;
var hcaptcha = require('express-hcaptcha');
var SITEKEY = process.env.HCAPTCHA_SITE_KEY;
var SECRET = process.env.HCAPTCHA_SECRET_KEY;

//
var main = require('./controllers/index');
var authentication = require('./controllers/auth');
var admin = require('./controllers/admin');
var user = require('./controllers/user');
var script = require('./controllers/script');
var flag = require('./controllers/flag');
var vote = require('./controllers/vote');
var remove = require('./controllers/remove');
var moderation = require('./controllers/moderation');
var group = require('./controllers/group');
var discussion = require('./controllers/discussion');
var issue = require('./controllers/issue');
var scriptStorage = require('./controllers/scriptStorage');
var document = require('./controllers/document');

var svgCaptcha = require('svg-captcha');

var isSameOrigin = require('./libs/helpers').isSameOrigin;
var statusCodePage = require('./libs/templateHelpers').statusCodePage;

//--- Configuration inclusions
var settings = require('./models/settings.json');

//--
var limiter = process.env.LIMITER_STRING || settings.limiter;

var waitInstallCapMin = isDev ? 1 : 60;
var installCapLimiter = rateLimit({
  store: (isDev ? undefined : new MongoStore({
    uri: limiter + '/installCapLimiter',
    resetExpireDateOnChange: true, // Rolling
    expireTimeMs: waitInstallCapMin * 60 * 1000 // n minutes for mongo store
  })),
  windowMs: waitInstallCapMin * 60 * 1000, // n minutes for all stores
  max: 50, // limit each IP to n requests per windowMs for memory store or expireTimeMs for mongo store
  handler: function (aReq, aRes, aNext, aOptions) {
    aRes.header('Retry-After', waitInstallCapMin * 60 + 60);
    aRes.status(429).send();
  }
});

var waitRateInstallMin = isDev ? 0.5 : 1;
var installRateLimiter = rateLimit({
  store: (isDev ? undefined : new MongoStore({
    uri: limiter + '/installRateLimiter',
    resetExpireDateOnChange: true, // Rolling
    expireTimeMs: waitRateInstallMin * 60 * 1000 // n minutes for mongo store
  })),
  windowMs: waitRateInstallMin * 60 * 1000, // n minutes for all stores
  max: 2, // limit each IP to n requests per windowMs for memory store or expireTimeMs for mongo store
  handler: function (aReq, aRes, aNext, aOptions) {
    aRes.header('Retry-After', waitRateInstallMin * 60 + 60);

    if (isSameOrigin(aReq.get('Referer')).result) {
      statusCodePage(aReq, aRes, aNext, {
        statusCode: 429,
        statusMessage: 'Too many requests.',
        suppressNavigation: true,
        isCustomView: true,
        statusData: {
          isListView: true,
          retryAfter: waitRateInstallMin * 60 + 60
        }
      });
    } else {
      aRes.status(429).send();
    }
  },
  keyGenerator: function (aReq, aRes, aNext) {
    return aReq.ip + aReq._parsedUrl.pathname;
  },
  skip: function (aReq, aRes, aNext) {
    if (aReq.params.type === 'libs') {
      return true;
    }
  }
});


var waitApiCapMin = isDev ? 1: 15;
var apiCapLimiter = rateLimit({
  store: (isDev ? undefined : new MongoStore({
    uri: limiter + '/apiCapLimiter',
    resetExpireDateOnChange: true, // Rolling
    expireTimeMs: waitApiCapMin * 60 * 1000 // n minutes for mongo store
  })),
  windowMs: waitApiCapMin * 60 * 1000, // n minutes for all stores
  max: 100, // limit each IP to n requests per windowMs for memory store or expireTimeMs for mongo store
  handler: function (aReq, aRes, aNext, aOptions) {
    aRes.header('Retry-After', waitApiCapMin * 60 + 60);
    aRes.status(429).send();
  }
});

var waitAuthCapMin = isDev ? 1: 1440;
var authCapLimiter = rateLimit({
  store: (isDev ? undefined : new MongoStore({
    uri: limiter + '/authCapLimiter',
    resetExpireDateOnChange: true, // Rolling
    expireTimeMs: waitAuthCapMin * 60 * 1000 // n minutes for mongo store
  })),
  windowMs: waitAuthCapMin * 60 * 1000, // n minutes for all stores
  max: 1, // limit each IP to n requests per windowMs for memory store or expireTimeMs for mongo store
  handler: function (aReq, aRes, aNext, aOptions) {
    aRes.header('Retry-After', waitAuthCapMin * 60 + 60);
    statusCodePage(aReq, aRes, aNext, {
      statusCode: 429,
      statusMessage: 'Too many requests.',
      suppressNavigation: true,
      isCustomView: true,
      statusData: {
        isListView: true,
        retryAfter: waitAuthCapMin * 60 + 60
      }
    });
  }
});

var waitCaptchaCapMin = isDev ? 1: 1440;
var captchaCapLimiter = rateLimit({
  store: (isDev ? undefined : new MongoStore({
    uri: limiter + '/captchaCapLimiter',
    resetExpireDateOnChange: true, // Rolling
    expireTimeMs: waitCaptchaCapMin * 60 * 1000 // n minutes for mongo store
  })),
  windowMs: waitCaptchaCapMin * 60 * 1000, // n minutes for all stores
  max: 1, // limit each IP to n requests per windowMs for memory store or expireTimeMs for mongo store
  handler: function (aReq, aRes, aNext, aOptions) {
    aRes.type('svg').status(200).send(
      svgCaptcha('429 Too Many Requests', Object.assign(settings.captchaOpts, {
        width: 350
      }))
    );
  }
});

var waitListCapMin = isDev ? 1: 60;
var listCapLimiter = rateLimit({
  store: (isDev ? undefined : new MongoStore({
    uri: limiter + '/listCapLimiter',
    resetExpireDateOnChange: true, // Rolling
    expireTimeMs: waitListCapMin * 60 * 1000 // n minutes for mongo store
  })),
  windowMs: waitListCapMin * 60 * 1000, // n minutes for all stores
  max: 115, // limit each IP to n requests per windowMs for memory store or expireTimeMs for mongo store
  handler: function (aReq, aRes, aNext, aOptions) {
    var cmd = null;

    if (aReq.rateLimit.current < aReq.rateLimit.limit + 4) {
      // Midddlware options
      if (!aRes.oujsOptions) {
        aRes.oujsOptions = {};
      }

      aRes.oujsOptions.showReminderListLimit = 4 - (aReq.rateLimit.current - aReq.rateLimit.limit);

      aNext();
    } else if (aReq.rateLimit.current < aReq.rateLimit.limit + 10) {
      aRes.header('Retry-After', waitListCapMin * 60 + 60);
      statusCodePage(aReq, aRes, aNext, {
        statusCode: 429,
        statusMessage: 'Too many requests.',
        suppressNavigation: true,
        isCustomView: true,
        statusData: {
          isListView: true,
          retryAfter: waitListCapMin * 60 + 60
        }
      });
    } else if (aReq.rateLimit.current < aReq.rateLimit.limit + 15) {
      aRes.header('Retry-After', waitListCapMin * 60 + 60);
      aRes.status(429).send('Too many requests. Please try again later');
    } else if (aReq.rateLimit.current < aReq.rateLimit.limit + 20) {
      aRes.header('Retry-After', waitListCapMin * 60 + 60);
      aRes.status(429).send();
    } else {
      cmd = (isPro && process.env.AUTOBAN ? process.env.AUTOBAN : 'echo SIMULATING AUTOBAN') +
        ' ' + aReq.connection.remoteAddress;

      exec(cmd, function (aErr, aStdout, aStderr) {
        if (aErr) {
          console.error('FAIL AUTOBAN', cmd);
          // fallthrough
        } else {
          console.log('AUTOBAN', aReq.connection.remoteAddress);
          // fallthrough
        }

        aRes.connection.destroy();
      });
    }
  }
});


module.exports = function (aApp) {
  //--- Middleware

  //--- Routes
  // Authentication routes
  aApp.route('/login').get(main.register);
  aApp.route('/register').get(function (aReq, aRes) {
    aRes.redirect(301, '/login');
  });
  aApp.route('/auth/').post(
    authentication.preauth,
      authCapLimiter,
        hcaptcha.middleware.validate(SECRET, SITEKEY),
          authentication.errauth,
            authentication.auth
  );
  aApp.route('/auth/:strategy').get(authentication.auth);
  aApp.route('/auth/:strategy/callback/:junk?').get(authentication.callback);
  aApp.route('/logout').get(main.logout);

  // User routes
  aApp.route('/users').get(listCapLimiter, user.userListPage);
  aApp.route('/users/:username').get(user.view);
  aApp.route('/users/:username/comments').get(listCapLimiter, user.userCommentListPage);
  aApp.route('/users/:username/scripts').get(listCapLimiter, user.userScriptListPage);
  aApp.route('/users/:username/syncs').get(listCapLimiter, user.userSyncListPage);

  aApp.route('/users/:username/github/repos').get(authentication.validateUser, user.userGitHubRepoListPage);
  aApp.route('/users/:username/github/repo').get(authentication.validateUser, user.userGitHubRepoPage);
  aApp.route('/users/:username/github/import').post(authentication.validateUser, user.userGitHubImportScriptPage);

  aApp.route('/users/:username/profile/edit').get(authentication.validateUser, user.userEditProfilePage).post(authentication.validateUser, user.update);
  aApp.route('/users/:username/profile/captcha').get(captchaCapLimiter, authentication.validateUser, user.userEditProfilePageCaptcha);
  aApp.route('/users/:username/update').post(authentication.validateUser, admin.adminUserUpdate);
  // NOTE: Some below inconsistent with priors
  aApp.route('/user/preferences').get(authentication.validateUser, user.userEditPreferencesPage);
  aApp.route('/user').get(function (aReq, aRes) {
    aRes.redirect(302, '/users');
  });
  aApp.route('/api/user/exist/:username').head(apiCapLimiter, user.exist);
  aApp.route('/api/user/session/extend').post(apiCapLimiter, authentication.validateUser, user.extend);
  aApp.route('/api/user/session/destroyOne').post(apiCapLimiter, authentication.validateUser, user.destroyOne);

  // Adding script/library routes
  aApp.route('/user/add/scripts').get(listCapLimiter, authentication.validateUser, user.newScriptPage);
  aApp.route('/user/add/scripts/new').get(authentication.validateUser, script.new(user.editScript)).post(authentication.validateUser, script.new(user.submitSource));
  aApp.route('/user/add/scripts/upload').post(authentication.validateUser, user.uploadScript);
  aApp.route('/user/add/lib').get(authentication.validateUser, user.newLibraryPage);
  aApp.route('/user/add/lib/new').get(authentication.validateUser, script.new(script.lib(user.editScript))).post(authentication.validateUser, script.new(script.lib(user.submitSource)));
  aApp.route('/user/add/lib/upload').post(authentication.validateUser, script.lib(user.uploadScript));
  aApp.route('/user/add').get(function (aReq, aRes) {
    aRes.redirect(301, '/user/add/scripts');
  });

  // Script routes
  aApp.route('/scripts/:username/:scriptname').get(script.view);
  aApp.route('/scripts/:username/:scriptname/edit').get(authentication.validateUser, script.edit).post(authentication.validateUser, script.edit);
  aApp.route('/scripts/:username/:scriptname/source').get(user.editScript);
  aApp.route('/scripts/:username').get(function (aReq, aRes) {
    aRes.redirect(301, '/users/' + aReq.params.username + '/scripts'); // NOTE: Watchpoint
  });

  aApp.route('/install/:username/:scriptname').get(installRateLimiter, installCapLimiter, scriptStorage.unlockScript, scriptStorage.sendScript);

  aApp.route('/meta/:username/:scriptname').get(scriptStorage.sendMeta);

  // Github hook routes
  aApp.route('/github/hook').post(scriptStorage.webhook);
  aApp.route('/github/service').post(function (aReq, aRes, aNext) { aNext(); });

  // Library routes
  aApp.route('/libs/:username/:scriptname').get(script.lib(script.view));
  aApp.route('/libs/:username/:scriptname/edit').get(authentication.validateUser, script.lib(script.edit)).post(authentication.validateUser, script.lib(script.edit));
  aApp.route('/libs/:username/:scriptname/source').get(script.lib(user.editScript));

  // Raw source
  aApp.route('/src/:type(scripts|libs)/:username/:scriptname').get(installRateLimiter, installCapLimiter, scriptStorage.unlockScript, scriptStorage.sendScript);

  // Issues routes
  aApp.route('/:type(scripts|libs)/:username/:scriptname/issues/:open(open|closed|all)?').get(listCapLimiter, issue.list);
  aApp.route('/:type(scripts|libs)/:username/:scriptname/issue/new').get(authentication.validateUser, issue.open).post(authentication.validateUser, issue.open);
  aApp.route('/:type(scripts|libs)/:username/:scriptname/issues/:topic').get(listCapLimiter, issue.view).post(authentication.validateUser, issue.comment);
  aApp.route('/:type(scripts|libs)/:username/:scriptname/issues/:topic/:action(close|reopen)').get(authentication.validateUser, issue.changeStatus);

  // Admin routes
  aApp.route('/admin').get(authentication.validateUser, admin.adminPage);
  aApp.route('/admin/npm/version').get(authentication.validateUser, admin.adminNpmVersionView);
  aApp.route('/admin/git/short').get(authentication.validateUser, admin.adminGitShortView);
  aApp.route('/admin/git/branch').get(authentication.validateUser, admin.adminGitBranchView);
  aApp.route('/admin/process/clone').get(authentication.validateUser, admin.adminProcessCloneView);
  aApp.route('/admin/session/active').get(authentication.validateUser, admin.adminSessionActiveView);
  aApp.route('/admin/npm/package').get(authentication.validateUser, admin.adminNpmPackageView);
  aApp.route('/admin/npm/list').get(authentication.validateUser, admin.adminNpmListView);
  aApp.route('/admin/api').get(authentication.validateUser, admin.adminApiKeysPage);
  aApp.route('/admin/authas').get(authentication.validateUser, admin.authAsUser);
  aApp.route('/admin/json').get(authentication.validateUser, admin.adminJsonView);

  aApp.route('/admin/api/update').post(authentication.validateUser, admin.apiAdminUpdate);

  // Moderation routes
  aApp.route('/mod').get(authentication.validateUser, moderation.modPage);
  aApp.route('/mod/removed').get(authentication.validateUser, moderation.removedItemListPage);
  aApp.route('/mod/removed/:id').get(authentication.validateUser, moderation.removedItemPage);

  // Vote route
  aApp.route(/^\/vote\/(scripts|libs)\/((.+?)(?:\/(.+))?)$/).post(authentication.validateUser, vote.vote);

  // Flag route
  aApp.route(/^\/flag\/(users|scripts|libs)\/((.+?)(?:\/(.+))?)$/).post(authentication.validateUser, flag.flag);

  // Remove route
  aApp.route(/^\/remove\/(users|scripts|libs)\/((.+?)(?:\/(.+))?)$/).post(authentication.validateUser, remove.rm);

  // Group routes
  aApp.route('/groups').get(listCapLimiter, group.list);
  aApp.route('/group/:groupname').get(listCapLimiter, group.view);
  aApp.route('/group').get(function (aReq, aRes) { aRes.redirect('/groups'); });
  aApp.route('/api/group/search/:term/:addTerm?').get(group.search);

  // Discussion routes
  // TODO: Update templates for new discussion routes
  aApp.route('/forum').get(listCapLimiter, discussion.categoryListPage);
  aApp.route('/:p(forum)?/:category(announcements|corner|garage|discuss|issues|all)').get(listCapLimiter, discussion.list);
  aApp.route('/:p(forum)?/:category(announcements|corner|garage|discuss)/:topic').get(listCapLimiter, discussion.show).post(authentication.validateUser, discussion.createComment);
  aApp.route('/:p(forum)?/:category(announcements|corner|garage|discuss)/new').get(authentication.validateUser, discussion.newTopic).post(authentication.validateUser, discussion.createTopic);
  // dupe
  aApp.route('/post/:category(announcements|corner|garage|discuss)').get(authentication.validateUser, discussion.newTopic).post(authentication.validateUser, discussion.createTopic);

  // About document routes
  aApp.route('/about/:document?').get(document.view);

  // Home route
  aApp.route('/').get(listCapLimiter, main.home);

  // Misc API
  aApp.route('/api').head(function (aReq, aRes, aNext) {
    aRes.status(200).send();
  });

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
