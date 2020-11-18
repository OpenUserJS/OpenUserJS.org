'use strict';

// Stamp a message for stdout...
console.log('Starting application...');

//  ... and stderr
if (isPro) {
  console.warn('Starting application...');
}

// Define some pseudo module globals
var isPro = require('./libs/debug').isPro;
var isDev = require('./libs/debug').isDev;
var isDbg = require('./libs/debug').isDbg;

var uaOUJS = require('./libs/debug').uaOUJS;

var isSecured = require('./libs/debug').isSecured;
var privkey = require('./libs/debug').privkey;
var fullchain = require('./libs/debug').fullchain;
var chain = require('./libs/debug').chain;
var isRenewable = require('./libs/debug').isRenewable;

//
var path = require('path');
var crypto = require('crypto');

var events = require('events');
events.EventEmitter.defaultMaxListeners = 15;

var express = require('express');
var toobusy = require('toobusy-js');
var statusCodePage = require('./libs/templateHelpers').statusCodePage;

var methodOverride = require('method-override');
var morgan = require('morgan');
var bodyParser = require('body-parser');
var compression = require('compression');
var favicon = require('serve-favicon');

var minify = require('express-minify');
var Terser = require('terser');

var lessMiddleware = require('less-middleware');

var session = require('express-session');
var MongoStore = require('connect-mongo')(session);
var mongoose = require('mongoose');
mongoose.Promise = global.Promise;

var passport = require('passport');
var colors = require('ansi-colors');

var request = require('request');

//
var pingCertTimer = null;
var ttlSanityTimer = null;

var app = express();

var modifySessions = require('./libs/modifySessions');

var settings = require('./models/settings.json');

var connectStr = process.env.CONNECT_STRING || settings.connect;
var sessionSecret = process.env.SESSION_SECRET || settings.secret;
var db = mongoose.connection;

var moment = require('moment');
var _ = require('underscore');
var findSessionData = require('./libs/modifySessions').findSessionData;

var dbOptions = {};
var defaultPoolSize = 10;
if (isPro) {
  dbOptions = {
    poolSize: defaultPoolSize,
    family: 4,

    useNewUrlParser: true,   // #1516
    useFindAndModify: false, // #1516
    useCreateIndex: true,    // #1516
    useUnifiedTopology: true // #1516
  }
} else {
  dbOptions = {
    poolSize: defaultPoolSize,
    family: 4,

    useNewUrlParser: true,   // #1516
    useFindAndModify: false, // #1516
    useCreateIndex: true,    // #1516
    useUnifiedTopology: true // #1516
  }
}

var fs = require('fs');
var execSync = require('child_process').execSync;
var http = require('http');
var https = require('https');
var sslOptions = null;
var server = http.createServer(app);
var secureServer = null;

app.set('port', process.env.PORT || 8080);
app.set('securePort', process.env.SECURE_PORT || null);

// Connect to the database
mongoose.connect(connectStr, dbOptions);

// Trap a few events for MongoDB
db.on('error', function (aErr) {
  console.error( colors.red( [
      'MongoDB connection error',
      aErr.message,
      'Terminating app'
    ].join('\n')));
  process.exit(1);  // NOTE: Watchpoint
});

db.once('open', function () {
  console.log(colors.green('MongoDB connection is opened'));
});

db.on('connected', function () {
  var admin = new mongoose.mongo.Admin(mongoose.connection.db);
  admin.buildInfo(function (aErr, aInfo) {
    console.log(colors.green('Connected to MongoDB v' + aInfo.version));
  });

  ttlSanityTimer = setInterval(ttlSanity, settings.ttl.timerSanityExpiry * 60 * 1000); // NOTE: Check every n min
});

db.on('disconnected', function () {
  console.error(colors.yellow('\nMongoDB connection is disconnected'));

  if (ttlSanityTimer) {
    clearInterval(ttlSanityTimer);
    ttlSanityTimer = null;
  }
});

db.on('reconnected', function () {
  console.error(colors.yellow('MongoDB connection is reconnected'));

  if (!ttlSanityTimer) {
    ttlSanityTimer = setInterval(ttlSanity, settings.ttl.timerSanityExpiry * 60 * 1000); // NOTE: Check every n min
  }
});

function beforeExit() {
  /**
   * Attempt to get everything closed before process exit
   */

  // Cancel any intervals
  if (pingCertTimer) {
    clearInterval(pingCertTimer);
    pingCertTimer = null;
  }

  if (ttlSanityTimer) {
    clearInterval(ttlSanityTimer);
    ttlSanityTimer = null;
  }
  // Close the db connection
  db.close(); // NOTE: Current asynchronous but auth may prevent callback until completed

  // Stop serving new http connections
  server.close(); // NOTE: Currently asynchronous but auth may prevent callback until completed

  // Shutdown timer in toobusy
  toobusy.shutdown(); // NOTE: Currently synchronous
}

process.on('SIGINT', function () {
  console.log(colors.green('\nCaptured app termination'));

  beforeExit(); // NOTE: Event not triggered for direct `process.exit()`

  // Terminate the app
  process.exit(0);
});

var sessionStore = new MongoStore({
  mongooseConnection: db,
  autoRemove: 'native',
  ttl: settings.ttl.timerSanity * 60 // sec to min; 14 * 24 * 60 * 60 = 14 days. Default
});

// See https://hacks.mozilla.org/2013/01/building-a-node-js-server-that-wont-melt-a-node-js-holiday-season-part-5/
var ensureIntegerOrNull = require('./libs/helpers').ensureIntegerOrNull;
var isSameOrigin = require('./libs/helpers').isSameOrigin;

var maxLag = ensureIntegerOrNull(process.env.BUSY_MAXLAG) || 70;
var pollInterval = ensureIntegerOrNull(process.env.BUSY_INTERVAL) || 500;

toobusy.maxLag(maxLag);
toobusy.interval(pollInterval);

if (isDbg) {
  toobusy.onLag(function(aCurrentLag) {
    console.warn('Event loop lag detected! Latency:', aCurrentLag + 'ms');
  });
}

var hostMaxMem = ensureIntegerOrNull(process.env.HOST_MAXMEM_BYTES) || 1073741824; // 1GiB default
var maxMem = ensureIntegerOrNull(process.env.BUSY_MAXMEM) || 50; // 50% default

var forceBusyAbsolute = process.env.FORCE_BUSY_ABSOLUTE === 'true';
var forceBusy = process.env.FORCE_BUSY === 'true';

app.use(function (aReq, aRes, aNext) {
  var pathname = aReq._parsedUrl.pathname;
  var referer = aReq.headers.referer || '';
  var usedMem = null;
  var isSources = null;

  // Midddlware options
  if (!aRes.oujsOptions) {
    aRes.oujsOptions = {};
  }

  // Middleware for DNT
  aRes.oujsOptions.DNT = aReq.get('DNT') === '1' || aReq.get('DNT') === 'yes' ? true : false;

  // Middleware for GDPR Notice
  aRes.oujsOptions.hideReminderGDPR = isSameOrigin(referer).result;

  //
  if (
    /^\/favicon\.ico$/.test(pathname) ||
      /^\/redist\//.test(pathname) ||
        /^\/less\//.test(pathname) ||
          /^\/css\//.test(pathname) ||
            /^\/images\//.test(pathname) ||
              /^\/fonts\//.test(pathname) ||
                /^\/meta\//.test(pathname) ||
                  /^\/github\//.test(pathname) ||
                    /^\/logout\/?/.test(pathname) ||
                      /^\/auth\//.test(pathname) ||
                        /^\/(?:admin|mod)/.test(pathname) ||
                          /^\/api\/user\/exist\//.test(pathname)

  ) {
    aNext(); // NOTE: Allow to pass through on these routes
    return;
  }

  if (forceBusyAbsolute) { // Always busy
    aRes.status(503).send(); // NOTE: No UI period just response header
    return;

  } else if (forceBusy) { // Graceful busy
    statusCodePage(aReq, aRes, aNext, {
      statusCode: 503,
      statusMessage:
        'We are experiencing technical difficulties right now. Please try again later.'
    });
    return;

  } else {
    isSources = /^\/(?:install|src|scripts\/.*\/source\/?$)/.test(pathname);

    if (isSources) {
      // Calculate current whole percentage of RSS memory used
      usedMem = parseInt(process.memoryUsage().rss / hostMaxMem * 100);

      // Compare current RSS memory percentage used to maximum percentage
      if (usedMem > maxMem) {
        statusCodePage(aReq, aRes, aNext, {
          statusCode: 503,
          statusMessage: 'We are very busy right now\u2026 Please try again later.'
        });
        return;
      }
    }

    if (toobusy()) { // check if toobusy
      statusCodePage(aReq, aRes, aNext, {
        statusCode: 503,
        statusMessage: 'We are very busy right now. Please try again later.'
      });
      return;
    } else {
      aNext(); // not toobusy
      // fallthrough
    }
  }
});

// Force HTTPS
if (isSecured) {
  sslOptions = {
    key: fs.readFileSync(privkey, 'utf8'),
    cert: fs.readFileSync(fullchain, 'utf8'),
    ca: fs.readFileSync(chain, 'utf8'),
    ciphers: [
      'TLS_AES_256_GCM_SHA384',
      'TLS_CHACHA20_POLY1305_SHA256',
      'TLS_AES_128_GCM_SHA256',
      'ECDHE-RSA-AES128-GCM-SHA256',
      'ECDHE-ECDSA-AES128-GCM-SHA256',
      'ECDHE-RSA-AES256-GCM-SHA384',
      'ECDHE-ECDSA-AES256-GCM-SHA384',
      'DHE-RSA-AES128-GCM-SHA256',
      'ECDHE-RSA-AES128-SHA256',
      'DHE-RSA-AES128-SHA256',
      'ECDHE-RSA-AES256-SHA384',
      'DHE-RSA-AES256-SHA384',
      'ECDHE-RSA-AES256-SHA256',
      'DHE-RSA-AES256-SHA256',
      'HIGH',
      '!aNULL',
      '!eNULL',
      '!EXPORT',
      '!DES',
      '!RC4',
      '!MD5',
      '!PSK',
      '!SRP',
      '!CAMELLIA'
    ].join(':'),
    honorCipherOrder: true
  };

  try {
    secureServer = https.createServer(sslOptions, app);

    app.use(function (aReq, aRes, aNext) {
      aRes.setHeader('Strict-Transport-Security',
        'max-age=31536000000; includeSubDomains');

      if (!aReq.secure) {
        aRes.redirect(301, 'https://' + aReq.headers.host + encodeURI(aReq.url));
        return;
      }

      aNext();
    });

    secureServer.listen(app.get('securePort'));

  } catch (aE) {
    console.error(colors.red('Server is NOT secured. Certificates may already be expired'));
    isSecured = false;
    console.warn(colors.cyan('Attempting to rename certificates'));
    try {
      fs.renameSync(privkey, privkey + '.expired')
      fs.renameSync(fullchain, fullchain + '.expired');
      fs.renameSync(chain, chain + '.expired');

      console.warn(colors.green('Certificates renamed'));

      // NOTE: Cached modules and/or callbacks may not reflect this change immediately
      // so must conclude with server trip

    } catch (aE) {
      console.warn(colors.red('Error renaming certificates'));
    }

    // Trip the server now to try any alternate fallback certificates or updated
    // If there aren't any it should run in http mode however usually no easy access through web
    // This should prevent logging DoS

    // NOTE: Pro will always stay in unsecure for `setInterval` value plus
    // ~ n seconds (hours) until renewable check if available.

    beforeExit(); // NOTE: Event not triggered for direct `process.exit()`

    process.exit(1);
  }
}

// Always listen here but will usually be forwarded via FW
server.listen(app.get('port'));

if (isDev || isDbg) {
  app.use(morgan('dev'));
} else if (process.env.FORCE_MORGAN_PREDEF_FORMAT) {
  app.use(morgan(process.env.FORCE_MORGAN_PREDEF_FORMAT));
}

app.use(bodyParser.urlencoded({
  extended: false,
  limit: parseInt(settings.maximum_upload_script_size / 1024, 10) + 'kb'
}));

app.use(bodyParser.json({
  limit: parseInt(settings.maximum_upload_script_size / 1024, 10) + 'kb'
}));

app.use(compression());
app.use(methodOverride('X-HTTP-Method-Override'));

// Add absent from server MIME Content Type for peg grammar files
express.static.mime.define({
  'text/x-pegjs':  ['pegjs']
});

// Order is very important here (i.e mess with at your own risk)
app.use(passport.initialize());
app.use(session({
  resave: false,
  saveUninitialized: false,
  unset: 'destroy',
  cookie: {
    maxAge: 5 * 60 * 1000, // minutes in ms NOTE: Expanded after successful auth
    secure: (isSecured ? true : false),
    sameSite: 'lax' // NOTE: Current auth necessity
  },
  rolling: true,
  secret: sessionSecret,
  store: sessionStore
}));
app.use(function (aReq, aRes, aNext) {
  if (aReq.session && aReq.session[passport._key]) {
    // load data from existing session
    aReq._passport.session = aReq.session[passport._key];
  }
  aNext();
});
app.use(modifySessions.init(sessionStore));

app.use(favicon(__dirname + '/public/images/favicon.ico'));

// Set up the views
app.engine('html', require('./libs/muExpress').renderFile(app));
app.set('view engine', 'html');
app.set('views', __dirname + '/views');


// Setup minification
// Order is important here as Ace will fail with an invalid content encoding issue
var minifyErrorHandler = function (aErr, aCallback) {
  console.warn([ // NOTE: Pushing this to stderr instead of default stdout
    'MINIFICATION WARNING (release):',
    '  filename: ' + aErr.filename,
    '  message: ' + aErr.message,
    '  line: ' + aErr.line + ' col: ' + aErr.col + ' pos: ' + aErr.pos,
    '  body: ' + aErr.body.slice(0, 200)

  ].join('\n'));

  if (aErr && aErr.stage === 'compile') {
    aCallback(aErr.error, JSON.stringify(aErr.error));
    return;
  }

  aCallback(aErr.error, aErr.body);

};

app.use(minify({
  uglifyJsModule: Terser,
  cache: './dev/cache/express-minify/release',
  onerror: minifyErrorHandler
}));

app.use(function(aReq, aRes, aNext) {
  var pathname = aReq._parsedUrl.pathname;

  // If a userscript or library...
  if (
    (/(\.user)?\.js|\.meta.js(on)?$/.test(pathname) && /^\/(meta|install|src)\//.test(pathname)) ||
      /^\/admin\/(npm|json)/.test(pathname) ||
        /^\/mod\/removed\//.test(pathname)
  ) {
    aRes.minifyOptions = aRes.minifyOptions || {}; // Ensure object exists on response
    aRes.minifyOptions.minify = false; // Skip using release minification because we control this with *terser*
  }
  aNext();
});

app.use(lessMiddleware(__dirname + '/public', {
  render: {
    compress: false,
    paths: [
      path.join(__dirname, 'node_modules/bootstrap/less')
    ]
  }
}));

// Routes
require('./routes')(app);


// Timers
function tripServerOnCertExpire(aValidToString) {
  var tlsDate = new Date(aValidToString);
  var now = new Date();
  var success = true;

  var tripDate = new Date(tlsDate.getTime() - (2 * 60 * 60 * 1000)); // ~2 hours before fault

  if (now.getTime() >= tripDate.getTime()) {
    console.error(colors.red('Valid secure certificates not available.'));

    isSecured = false;

    if (!isRenewable) {
      console.warn(colors.cyan('Attempting to rename certificates'));
      try {
        fs.renameSync(privkey, privkey + '.expiring');
        fs.renameSync(fullchain, fullchain + '.expiring');
        fs.renameSync(chain, chain + '.expiring');

        console.log(colors.green('Certificates renamed'));

        // NOTE: Cached modules and/or callbacks may not reflect this change immediately
        // so must conclude with server trip

      } catch (aE) {
        console.warn(colors.red('Error renaming certificates'));
      }
    } else {
      console.warn(colors.cyan('Attempting to renew certificates'));

      try {
        execSync(process.env.ATTEMPT_RENEWAL); // NOTE: Synchronous wait
      } catch (aE) {
        success = false;
      }
    }

    if (success) {
      // Trip the server now to try any alternate fallback certificates or updated
      // If there aren't any it should run in http mode however usually no easy access through web
      // This should prevent logging DoS

      beforeExit(); // NOTE: Event not triggered for direct `process.exit()`

      process.exit(1);
    }
  }
}

function pingCert() {
  request({
    method: 'HEAD',
    // NOTE: Use localhost to avoid firewall and unnecessary traffic
    url: (isPro && app.get('securePort') ? 'https' : 'http') + '://localhost' +
      (isPro && app.get('securePort')
        ? ':' + app.get('securePort')
        : ':' + app.get('port'))
          + '/api',
    headers: {
      'User-Agent': uaOUJS + (process.env.UA_SECRET ? ' ' + process.env.UA_SECRET : '')
    }
  }, function (aErr, aRes, aBody) {
    if (aErr) {
      if (aErr.cert) {
        // Encryption available with Error thrown since internal TLS request on localhost
        // isn't usually a valid registered domain however external requests can be blocked by
        // browsers as well as false credentials supplied

        // Test for time limit of expiration
        tripServerOnCertExpire(aErr.cert.valid_to);

      } else {
        console.warn([
          colors.red(aErr),
          colors.red('Server may not be running on specified port or port blocked by firewall'),
          colors.red('Encryption not available')

        ].join('\n'));
      }
      return;
    }

    if (aRes.req.connection.getPeerCertificate) {
      // Encryption available
      // NOTE: Server blocks this currently
      console.warn(colors.red('Firewall pass-through detected'));

      // Test for time limit of expiration
      tripServerOnCertExpire(aRes.req.connection.getPeerCertificate().valid_to);

    } else {
      console.warn(colors.yellow('Encryption not available'));

      // NOTE: This will trip dev usually since it's normally not secure. If it is secure then
      // server still needs to be tripped. This should be minor and usually devs have roughly the
      // time indicated by `setInterval` below before it happens.
      tripServerOnCertExpire(new Date());
    }
  });
};

pingCertTimer = setInterval(pingCert, 60 * 60 * 1000); // NOTE: Check about every hour

function ttlSanity() {
  var options = {};
  findSessionData({}, sessionStore, options, function (aErr) {
    if (aErr) {
      console.error('some error during ttlSanity', aErr);
      return;
    }

    options.sessionList = _.map(options.sessionList, function (aSession) {
      var expiry = moment(aSession.cookie.expires);

      if (expiry.add(settings.ttl.timerSanityExpiry, 'm').isBefore() ||
        expiry.diff(moment(), 'm')
          > settings.ttl.timerSanityExpiry && aSession.user && !aSession.user.roleName
      ) {
        if (aSession.passport && aSession.passport.oujsOptions) {
          if (isDbg) {
            console.warn('Forcibly destroyed a session id of', aSession.passport.oujsOptions.sid);
          }
          sessionStore.destroy(aSession.passport.oujsOptions.sid);
        } else {
          // NOTE: This should not happen
          console.error('Session found to be expired but no sid');
        }
      }
    });
  });
}
