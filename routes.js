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
var appendUrlLeaf = require('./libs/helpers').appendUrlLeaf;

var statusCodePage = require('./libs/templateHelpers').statusCodePage;

//--- Configuration inclusions
var settings = require('./models/settings.json');

//--
var limiter = process.env.LIMITER_STRING || settings.limiter;

var lockdown = process.env.FORCE_BUSY_UPDATEURL_CHECK === 'true';

//
var statusTMR = function (aReq, aRes, aNext) {
  // Ignore Retry-After header here
  aRes.status(429).send();
};

// WATCHPOINT: ~60 second poll time in MongoDB
var fudgeMin = 60;
var fudgeSec = 6;

var waitInstallCapMin = isDev ? settings.waitInstallCapMin.dev : settings.waitInstallCapMin.pro;
var installCapLimiter = rateLimit({
  store: (isDev ? undefined : new MongoStore({
    uri: appendUrlLeaf(limiter, '/installCapLimiter'),
    resetExpireDateOnChange: true, // Rolling
    expireTimeMs: waitInstallCapMin * 60 * 1000 // n minutes for mongo store
  })),
  windowMs: waitInstallCapMin * 60 * 1000, // n minutes for all stores
  max: 75, // limit each IP to n requests per windowMs for memory store or expireTimeMs for mongo store
  handler: function (aReq, aRes, aNext, aOptions) {
    var cmd = null;

    if (aReq.rateLimit.used < aReq.rateLimit.limit + 4) {
      // Midddlware options
      if (!aRes.oujsOptions) {
        aRes.oujsOptions = {};
      }

      aRes.oujsOptions.showReminderInstallLimit = 4 - (aReq.rateLimit.used - aReq.rateLimit.limit);

      aNext();
    } else if (aReq.rateLimit.used < aReq.rateLimit.limit + 10) {
      aRes.header('Retry-After', waitInstallCapMin * 60 + (isDev ? fudgeSec : fudgeMin));
      statusCodePage(aReq, aRes, aNext, {
        statusCode: 429,
        statusMessage: 'Too many requests.',
        suppressNavigation: true,
        isCustomView: true,
        statusData: {
          isListView: true,
          retryAfter: waitInstallCapMin * 60 + (isDev ? fudgeSec : fudgeMin)
        }
      });
    } else if (aReq.rateLimit.used < aReq.rateLimit.limit + 15) {
      aRes.header('Retry-After', waitInstallCapMin * 60 + (isDev ? fudgeSec : fudgeMin));
      aRes.status(429).send('Too many requests. Please try again later');
    } else if (aReq.rateLimit.used < aReq.rateLimit.limit + 25) {
      aRes.header('Retry-After', waitInstallCapMin * 60 + (isDev ? fudgeSec : fudgeMin));
      aRes.status(429).send();
    } else {
      cmd = (isPro && process.env.AUTOBAN ? process.env.AUTOBAN : 'echo SIMULATING INSTALL AUTOBAN') +
        ' ' + aReq.connection.remoteAddress;

      exec(cmd, function (aErr, aStdout, aStderr) {
        if (aErr) {
          console.error('FAIL INSTALL AUTOBAN', cmd);
          // fallthrough
        } else {
          console.log('INSTALL AUTOBAN', aReq.connection.remoteAddress);
          // fallthrough
        }

        aRes.connection.destroy();
      });
    }
  },
  skip: function (aReq, aRes) {
    var authedUser = aReq.session.user;

    if (authedUser && authedUser.isMod) {
      this.store.resetKey(this.keyGenerator);
      return true;
    }
  }
});

var waitRateInstallSec = isDev ? settings.waitRateInstallSec.dev : settings.waitRateInstallSec.pro;
var installRateLimiter = rateLimit({
  store: (isDev ? undefined : new MongoStore({
    uri: appendUrlLeaf(limiter, '/installRateLimiter'),
    resetExpireDateOnChange: true, // Rolling
    expireTimeMs: waitRateInstallSec * 1000 // n seconds for mongo store
  })),
  windowMs: waitRateInstallSec * 1000, // n seconds for all stores
  max: 2, // limit each IP to n requests per windowMs for memory store or expireTimeMs for mongo store
  handler: function (aReq, aRes, aNext, aOptions) {
    aRes.header('Retry-After', waitRateInstallSec + (isDev ? fudgeSec : fudgeMin));
    if (isSameOrigin(aReq.get('Referer')).result) {
      if (aReq.rateLimit.used <= aReq.rateLimit.limit + 2) {
        statusCodePage(aReq, aRes, aNext, {
          statusCode: 429,
          statusMessage: 'Too many requests.',
          suppressNavigation: true,
          isCustomView: true,
          statusData: {
            isListView: true,
            retryAfter: waitRateInstallSec + (isDev ? fudgeSec : fudgeMin)
          }
        });
        return;
      }
    }
    aRes.status(429).send();
  },
  keyGenerator: function (aReq, aRes, aNext) {
    return aReq.ip + aReq._parsedUrl.pathname;
  },
  skip: function (aReq, aRes) {
    var authedUser = aReq.session.user;

    if (aReq.params.type === 'libs' && !lockdown) {
      return true;
    }

    if (authedUser && authedUser.isAdmin) {
      this.store.resetKey(this.keyGenerator);
      return true;
    }
  }
});

var install1Limiter = lockdown ? installCapLimiter : installRateLimiter;
var install2Limiter = lockdown ? installRateLimiter : installCapLimiter;

var waitRateMetaSec = isDev ? settings.waitRateMetaSec.dev : settings.waitRateMetaSec.pro;
var metaRateLimiter = rateLimit({
  store: (isDev ? undefined : new MongoStore({
    uri: appendUrlLeaf(limiter, '/metaRateLimiter'),
    resetExpireDateOnChange: true, // Rolling
    expireTimeMs: waitRateMetaSec  * 1000 // n seconds for mongo store
  })),
  windowMs: waitRateMetaSec * 1000, // n seconds for all stores
  max: 2, // limit each IP to n requests per windowMs for memory store or expireTimeMs for mongo store
  handler: function (aReq, aRes, aNext, aOptions) {
    aRes.header('Retry-After', waitRateMetaSec + (isDev ? fudgeSec : fudgeMin));
    if (isSameOrigin(aReq.get('Referer')).result) {
      if (aReq.rateLimit.used <= aReq.rateLimit.limit + 2) {
        statusCodePage(aReq, aRes, aNext, {
          statusCode: 429,
          statusMessage: 'Too many requests.',
          suppressNavigation: true,
          isCustomView: true,
          statusData: {
            isListView: true,
            retryAfter: waitRateMetaSec + (isDev ? fudgeSec : fudgeMin)
          }
        });
        return;
      }
    }
    aRes.status(429).send();
  },
  keyGenerator: function (aReq, aRes, aNext) {
    return aReq.ip + aReq._parsedUrl.pathname;
  },
  skip: function (aReq, aRes) {
    var authedUser = aReq.session.user;

    if (/\.meta\.json$/.test(aReq._parsedUrl.pathname)) {
      return true;
    }

    if (authedUser && authedUser.isAdmin) {
      this.store.resetKey(this.keyGenerator);
      return true;
    }
  }
});

var waitApiCapMin = isDev ? settings.waitApiCapMin.dev: settings.waitApiCapMin.pro;
var apiCapLimiter = rateLimit({
  store: (isDev ? undefined : new MongoStore({
    uri: appendUrlLeaf(limiter, '/apiCapLimiter'),
    resetExpireDateOnChange: true, // Rolling
    expireTimeMs: waitApiCapMin * 60 * 1000 // n minutes for mongo store
  })),
  windowMs: waitApiCapMin * 60 * 1000, // n minutes for all stores
  max: 100, // limit each IP to n requests per windowMs for memory store or expireTimeMs for mongo store
  handler: function (aReq, aRes, aNext, aOptions) {
    aRes.header('Retry-After', waitApiCapMin * 60 + (isDev ? fudgeSec : fudgeMin));
    aRes.status(429).send();
  },
  skip: function (aReq, aRes) {
    var authedUser = aReq.session.user;

    if (authedUser && authedUser.isMod) {
      this.store.resetKey(this.keyGenerator);
      return true;
    }
  }
});

var waitAuthCapMin = isDev ? settings.waitAuthCapMin.dev: settings.waitAuthCapMin.pro;
var authCapLimiter = rateLimit({
  store: (isDev ? undefined : new MongoStore({
    uri: appendUrlLeaf(limiter, '/authCapLimiter'),
    resetExpireDateOnChange: true, // Rolling
    expireTimeMs: waitAuthCapMin * 60 * 1000 // n minutes for mongo store
  })),
  windowMs: waitAuthCapMin * 60 * 1000, // n minutes for all stores
  max: 1, // limit each IP to n requests per windowMs for memory store or expireTimeMs for mongo store
  handler: function (aReq, aRes, aNext, aOptions) {
    aRes.header('Retry-After', waitAuthCapMin * 60 + (isDev ? fudgeSec : fudgeMin));
    statusCodePage(aReq, aRes, aNext, {
      statusCode: 429,
      statusMessage: 'Too many requests.',
      suppressNavigation: true,
      isCustomView: true,
      statusData: {
        isListView: true,
        retryAfter: waitAuthCapMin * 60 + (isDev ? fudgeSec : fudgeMin)
      }
    });
  }
});

var waitCaptchaCapMin = isDev ? settings.waitCaptchaCapMin.dev: settings.waitCaptchaCapMin.pro;
var captchaCapLimiter = rateLimit({
  store: (isDev ? undefined : new MongoStore({
    uri: appendUrlLeaf(limiter, '/captchaCapLimiter'),
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
  },
  skip: function (aReq, aRes) {
    var authedUser = aReq.session.user;

    if (authedUser) {
      if (authedUser.isMod) {
        this.store.resetKey(this.keyGenerator);
        return true;
      }

      if (!authedUser._probationary) {
        // NOTE: Still counting by design
        return true;
      }

    }
  }
});

var waitListCapMin = isDev ? settings.waitListCapMin.dev: settings.waitListCapMin.pro;
var listCapLimiter = rateLimit({
  store: (isDev ? undefined : new MongoStore({
    uri: appendUrlLeaf(limiter, '/listCapLimiter'),
    resetExpireDateOnChange: true, // Rolling
    expireTimeMs: waitListCapMin * 60 * 1000 // n minutes for mongo store
  })),
  windowMs: waitListCapMin * 60 * 1000, // n minutes for all stores
  max: 115, // limit each IP to n requests per windowMs for memory store or expireTimeMs for mongo store
  handler: function (aReq, aRes, aNext, aOptions) {
    var cmd = null;

    if (aReq.rateLimit.used < aReq.rateLimit.limit + 4) {
      // Midddlware options
      if (!aRes.oujsOptions) {
        aRes.oujsOptions = {};
      }

      aRes.oujsOptions.showReminderListLimit = 4 - (aReq.rateLimit.used - aReq.rateLimit.limit);

      aNext();
    } else if (aReq.rateLimit.used < aReq.rateLimit.limit + 10) {
      aRes.header('Retry-After', waitListCapMin * 60 + (isDev ? fudgeSec : fudgeMin));
      statusCodePage(aReq, aRes, aNext, {
        statusCode: 429,
        statusMessage: 'Too many requests.',
        suppressNavigation: true,
        isCustomView: true,
        statusData: {
          isListView: true,
          retryAfter: waitListCapMin * 60 + (isDev ? fudgeSec : fudgeMin)
        }
      });
    } else if (aReq.rateLimit.used < aReq.rateLimit.limit + 15) {
      aRes.header('Retry-After', waitListCapMin * 60 + (isDev ? fudgeSec : fudgeMin));
      aRes.status(429).send('Too many requests. Please try again later');
    } else if (aReq.rateLimit.used < aReq.rateLimit.limit + 25) {
      aRes.header('Retry-After', waitListCapMin * 60 + (isDev ? fudgeSec : fudgeMin));
      aRes.status(429).send();
    } else {
      cmd = (isPro && process.env.AUTOBAN ? process.env.AUTOBAN : 'echo SIMULATING LIST AUTOBAN') +
        ' ' + aReq.connection.remoteAddress;

      exec(cmd, function (aErr, aStdout, aStderr) {
        if (aErr) {
          console.error('FAIL LIST AUTOBAN', cmd);
          // fallthrough
        } else {
          console.log('LIST AUTOBAN', aReq.connection.remoteAddress);
          // fallthrough
        }

        aRes.connection.destroy();
      });
    }
  },
  skip: function (aReq, aRes) {
    var authedUser = aReq.session.user;

    if (authedUser && authedUser.isMod) {
      this.store.resetKey(this.keyGenerator);
      return true;
    }
  }
});

var waitListRateSec = isDev ? settings.waitListRateSec.dev : settings.waitListRateSec.pro;
var listRateLimiter = rateLimit({
  store: (isDev ? undefined : undefined),
  windowMs: waitListRateSec * 1000, // n seconds for all stores
  max: 1, // limit each IP to n requests per windowMs for memory store or expireTimeMs for mongo store
  handler: function (aReq, aRes, aNext, aOptions) {
    aRes.header('Retry-After', waitListRateSec + fudgeSec);
    if (aReq.rateLimit.used <= aReq.rateLimit.limit + 1) {
      statusCodePage(aReq, aRes, aNext, {
        statusCode: 429,
        statusMessage: 'Too many requests.',
        suppressNavigation: true,
        isCustomView: true,
        statusData: {
          isListView: true,
          retryAfter: waitListRateSec + fudgeSec
        }
      });
      return;
    }
    aRes.status(429).send();
  },
  keyGenerator: function (aReq, aRes, aNext) {
    return aReq.ip + aReq._parsedUrl.pathname;
  },
  skip: function (aReq, aRes) {
    var authedUser = aReq.session.user;

    if (/\.meta\.json$/.test(aReq._parsedUrl.pathname)) {
      return true;
    }

    if (authedUser && authedUser.isAdmin) {
      this.store.resetKey(this.keyGenerator);
      return true;
    }
  }
});


var list1Limiter = lockdown ? listCapLimiter : listRateLimiter;
var list2Limiter = lockdown ? listRateLimiter : listCapLimiter;


var waitListAnyQRateSec = isDev
  ? settings.waitListAnyQRateSec.dev : settings.waitListAnyQRateSec.pro;
var listAnyQRateLimiter = rateLimit({
  store: (isDev ? undefined : undefined),
  windowMs: waitListAnyQRateSec * 1000, // n seconds for all stores
  max: 1, // limit each IP to n requests per windowMs for memory store or expireTimeMs for mongo store
  handler: function (aReq, aRes, aNext, aOptions) {
    aRes.header('Retry-After', waitListAnyQRateSec + fudgeSec);
    if (aReq.rateLimit.used <= aReq.rateLimit.limit + 2) {
      statusCodePage(aReq, aRes, aNext, {
        statusCode: 429,
        statusMessage: 'Too many requests.',
        suppressNavigation: true,
        isCustomView: true,
        statusData: {
          isListView: true,
          retryAfter: waitListAnyQRateSec + fudgeSec
        }
      });
      return;
    }
    aRes.status(429).send();
  },
  skip: function (aReq, aRes) {
    var authedUser = aReq.session.user;

    if (authedUser && authedUser.isAdmin) {
      this.store.resetKey(this.keyGenerator);
      return true;
    }

    if (!aReq.query.q) {
      return true;
    }
  }
});

var waitListSameQCapMin = isDev
  ? settings.waitListSameQCapMin.dev : settings.waitListSameQCapMin.pro;
var listSameQRateLimiter = rateLimit({
  store: (isDev ? undefined : new MongoStore({
    uri: appendUrlLeaf(limiter, '/listSameQCapLimiter'),
    resetExpireDateOnChange: true, // Rolling
    expireTimeMs: waitListSameQCapMin * 60 * 1000 // n minutes for mongo store
  })),
  windowMs: waitListSameQCapMin * 60 * 1000, // n minutes for all stores
  max: 1, // limit each IP to n requests per windowMs for memory store or expireTimeMs for mongo store
  handler: function (aReq, aRes, aNext, aOptions) {
    aRes.header('Retry-After', waitListSameQCapMin * 60 + (isDev ? fudgeSec : fudgeMin));
    if (aReq.rateLimit.used <= aReq.rateLimit.limit + 2) {
      statusCodePage(aReq, aRes, aNext, {
        statusCode: 429,
        statusMessage: 'Too many requests.',
        suppressNavigation: true,
        isCustomView: true,
        statusData: {
          isListView: true,
          retryAfter: waitListSameQCapMin * 60 + (isDev ? fudgeSec : fudgeMin)
        }
      });
      return;
    }
    aRes.status(429).send();
  },
  keyGenerator: function (aReq, aRes, aNext) {
    return aReq.ip + '/?' +
    'q=' + (aReq.query.q ? aReq.query.q : '') + '&' +
      'orderBy=' + (aReq.query.orderBy ? aReq.query.orderBy : '') + '&' +
        'orderDir=' + (aReq.query.orderDir ? aReq.query.orderDir : '') + '&' +
          'p=' + (aReq.query.p ? aReq.query.p : '1');
  },
  skip: function (aReq, aRes) {
    var authedUser = aReq.session.user;

    if (authedUser && authedUser.isAdmin) {
      this.store.resetKey(this.keyGenerator);
      return true;
    }

    if (!aReq.query.q) {
      return true;
    }
  }
});


module.exports = function (aApp) {
  //--- Middleware

  //--- Routes
  // Authentication routes
  aApp.route('/login').head(statusTMR).get(main.register);
  aApp.route('/register').head(statusTMR).get(function (aReq, aRes) {
    aRes.redirect(301, '/login');
  });
  aApp.route('/auth/').post(
    authentication.preauth,
      authCapLimiter,
        hcaptcha.middleware.validate(SECRET, SITEKEY),
          authentication.errauth,
            authentication.auth
  );
  aApp.route('/auth/:strategy').head(statusTMR).get(authentication.auth);
  aApp.route('/auth/:strategy/callback/:junk?').head(statusTMR).get(authentication.callback);
  aApp.route('/logout').head(statusTMR).get(main.logout);

  // User routes
  aApp.route('/users').head(statusTMR).get(list1Limiter, list2Limiter, listAnyQRateLimiter, listSameQRateLimiter, user.userListPage);
  aApp.route('/users/:username').head(statusTMR).get(user.view);
  aApp.route('/users/:username/scripts').head(statusTMR).get(list1Limiter, list2Limiter, listAnyQRateLimiter, listSameQRateLimiter, user.userScriptListPage);
  aApp.route('/users/:username/syncs').head(statusTMR).get(list1Limiter, list2Limiter, listAnyQRateLimiter, listSameQRateLimiter, user.userSyncListPage);
  aApp.route('/users/:username/comments').head(statusTMR).get(list1Limiter, list2Limiter, listAnyQRateLimiter, listSameQRateLimiter, user.userCommentListPage);

  aApp.route('/users/:username/github/repos').head(statusTMR).get(authentication.validateUser, user.userGitHubRepoListPage);
  aApp.route('/users/:username/github/repo').head(statusTMR).get(authentication.validateUser, user.userGitHubRepoPage);
  aApp.route('/users/:username/github/import').head(statusTMR).post(authentication.validateUser, user.userGitHubImportScriptPage);

  aApp.route('/users/:username/profile/edit').head(statusTMR).get(authentication.validateUser, user.userEditProfilePage).post(authentication.validateUser, user.update);
  aApp.route('/users/:username/profile/captcha').head(statusTMR).get(captchaCapLimiter, authentication.validateUser, user.userEditProfilePageCaptcha);
  aApp.route('/users/:username/update').head(statusTMR).post(authentication.validateUser, admin.adminUserUpdate);
  // NOTE: Some below inconsistent with priors
  aApp.route('/user/preferences').head(statusTMR).get(authentication.validateUser, user.userEditPreferencesPage);
  aApp.route('/user').head(statusTMR).get(function (aReq, aRes) {
    aRes.redirect(302, '/users');
  });
  aApp.route('/api/user/exist/:username').head(apiCapLimiter, user.exist);
  aApp.route('/api/user/session/extend').post(apiCapLimiter, authentication.validateUser, user.extend);
  aApp.route('/api/user/session/destroyOne').post(apiCapLimiter, authentication.validateUser, user.destroyOne);

  // Adding script/library routes
  aApp.route('/user/add/scripts').head(statusTMR).get(authentication.validateUser, user.newScriptPage);
  aApp.route('/user/add/scripts/new').head(statusTMR).get(authentication.validateUser, script.new(user.editScript)).post(authentication.validateUser, script.new(user.submitSource));
  aApp.route('/user/add/scripts/upload').post(authentication.validateUser, user.uploadScript);
  aApp.route('/user/add/lib').head(statusTMR).get(authentication.validateUser, user.newLibraryPage);
  aApp.route('/user/add/lib/new').head(statusTMR).get(authentication.validateUser, script.new(script.lib(user.editScript))).post(authentication.validateUser, script.new(script.lib(user.submitSource)));
  aApp.route('/user/add/lib/upload').post(authentication.validateUser, script.lib(user.uploadScript));
  aApp.route('/user/add').head(statusTMR).get(function (aReq, aRes) {
    aRes.redirect(301, '/user/add/scripts');
  });

  // Script routes
  aApp.route('/scripts/:username/:scriptname').head(statusTMR).get(script.view);
  aApp.route('/scripts/:username/:scriptname/edit').head(statusTMR).get(authentication.validateUser, script.edit).post(authentication.validateUser, script.edit);
  aApp.route('/scripts/:username/:scriptname/source').head(statusTMR).get(user.editScript);
  aApp.route('/scripts/:username').head(statusTMR).get(function (aReq, aRes) {
    aRes.redirect(301, '/users/' + aReq.params.username + '/scripts'); // NOTE: Watchpoint
  });

  aApp.route('/install/:username/:scriptname').head(statusTMR).get(install1Limiter, install2Limiter, scriptStorage.unlockScript, scriptStorage.sendScript);

  aApp.route('/meta/:username/:scriptname').head(statusTMR).get(metaRateLimiter, scriptStorage.sendMeta);

  // Github hook routes
  aApp.route('/github/hook').post(scriptStorage.webhook);
  aApp.route('/github/service').post(function (aReq, aRes, aNext) { aNext(); });

  // Library routes
  aApp.route('/libs/:username/:scriptname').head(statusTMR).get(script.lib(script.view));
  aApp.route('/libs/:username/:scriptname/edit').head(statusTMR).get(authentication.validateUser, script.lib(script.edit)).post(authentication.validateUser, script.lib(script.edit));
  aApp.route('/libs/:username/:scriptname/source').head(statusTMR).get(script.lib(user.editScript));

  // Raw source
  aApp.route('/src/:type(scripts|libs)/:username/:scriptname').head(statusTMR).get(install1Limiter, install2Limiter, scriptStorage.unlockScript, scriptStorage.sendScript);

  // Issues routes
  aApp.route('/:type(scripts|libs)/:username/:scriptname/issues/:open(open|closed|all)?').head(statusTMR).get(list1Limiter, list2Limiter, listAnyQRateLimiter, listSameQRateLimiter, issue.list);
  aApp.route('/:type(scripts|libs)/:username/:scriptname/issue/new').head(statusTMR).get(authentication.validateUser, issue.open).post(authentication.validateUser, issue.open);
  aApp.route('/:type(scripts|libs)/:username/:scriptname/issues/:topic').head(statusTMR).get(list1Limiter, list2Limiter, listAnyQRateLimiter, listSameQRateLimiter, issue.view).post(authentication.validateUser, issue.comment);
  aApp.route('/:type(scripts|libs)/:username/:scriptname/issues/:topic/:action(close|reopen)').head(statusTMR).get(authentication.validateUser, issue.changeStatus);

  // Admin routes
  aApp.route('/admin').head(statusTMR).get(authentication.validateUser, admin.adminPage);
  aApp.route('/admin/npm/version').head(statusTMR).get(authentication.validateUser, admin.adminNpmVersionView);
  aApp.route('/admin/git/short').head(statusTMR).get(authentication.validateUser, admin.adminGitShortView);
  aApp.route('/admin/git/branch').head(statusTMR).get(authentication.validateUser, admin.adminGitBranchView);
  aApp.route('/admin/process/clone').head(statusTMR).get(authentication.validateUser, admin.adminProcessCloneView);
  aApp.route('/admin/session/active').head(statusTMR).get(authentication.validateUser, admin.adminSessionActiveView);
  aApp.route('/admin/npm/package').head(statusTMR).get(authentication.validateUser, admin.adminNpmPackageView);
  aApp.route('/admin/npm/list').head(statusTMR).get(authentication.validateUser, admin.adminNpmListView);
  aApp.route('/admin/api').head(statusTMR).get(authentication.validateUser, admin.adminApiKeysPage);
  aApp.route('/admin/authas').head(statusTMR).get(authentication.validateUser, admin.authAsUser);
  aApp.route('/admin/json').head(statusTMR).get(authentication.validateUser, admin.adminJsonView);

  aApp.route('/admin/api/update').post(authentication.validateUser, admin.apiAdminUpdate);

  // Moderation routes
  aApp.route('/mod').head(statusTMR).get(authentication.validateUser, moderation.modPage);
  aApp.route('/mod/removed').head(statusTMR).get(authentication.validateUser, moderation.removedItemListPage);
  aApp.route('/mod/removed/:id').head(statusTMR).get(authentication.validateUser, moderation.removedItemPage);

  // Vote route
  aApp.route(/^\/vote\/(scripts|libs)\/((.+?)(?:\/(.+))?)$/).post(authentication.validateUser, vote.vote);

  // Flag route
  aApp.route(/^\/flag\/(users|scripts|libs)\/((.+?)(?:\/(.+))?)$/).post(authentication.validateUser, flag.flag);

  // Remove route
  aApp.route(/^\/remove\/(users|scripts|libs)\/((.+?)(?:\/(.+))?)$/).post(authentication.validateUser, remove.rm);

  // Group routes
  aApp.route('/groups').head(statusTMR).get(list1Limiter, list2Limiter, listAnyQRateLimiter, listSameQRateLimiter, group.list);
  aApp.route('/group/:groupname').head(statusTMR).get(list1Limiter, list2Limiter, listAnyQRateLimiter, listSameQRateLimiter, group.view);
  aApp.route('/group').head(statusTMR).get(function (aReq, aRes) { aRes.redirect('/groups'); });
  aApp.route('/api/group/search/:term/:addTerm?').head(statusTMR).get(group.search);

  // Discussion routes
  // TODO: Update templates for new discussion routes
  aApp.route('/forum').head(statusTMR).get(list1Limiter, list2Limiter, listAnyQRateLimiter, listSameQRateLimiter, discussion.categoryListPage);
  aApp.route('/:p(forum)?/:category(announcements|corner|garage|discuss|issues|all)').head(statusTMR).get(list1Limiter, list2Limiter, listAnyQRateLimiter, listSameQRateLimiter, discussion.list);
  aApp.route('/:p(forum)?/:category(announcements|corner|garage|discuss)/:topic').head(statusTMR).get(list1Limiter, list2Limiter, listAnyQRateLimiter, listSameQRateLimiter, discussion.show).post(authentication.validateUser, discussion.createComment);
  aApp.route('/:p(forum)?/:category(announcements|corner|garage|discuss)/new').head(statusTMR).get(authentication.validateUser, discussion.newTopic).post(authentication.validateUser, discussion.createTopic);
  // dupe
  aApp.route('/post/:category(announcements|corner|garage|discuss)').head(statusTMR).get(authentication.validateUser, discussion.newTopic).post(authentication.validateUser, discussion.createTopic);

  // About document routes
  aApp.route('/about/:document?').head(statusTMR).get(document.view);

  // Home route
  aApp.route('/').head(statusTMR).get(list1Limiter, list2Limiter, listAnyQRateLimiter, listSameQRateLimiter, main.home);

  // Misc API for cert testing
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
