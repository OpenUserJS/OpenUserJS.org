'use strict';

// Define some pseudo module globals
var isPro = require('./libs/debug').isPro;
var isDev = require('./libs/debug').isDev;
var isDbg = require('./libs/debug').isDbg;

// Stamp a message for stdout...
console.log('Starting application...');

//  ... and stderr
if (isPro) {
  console.warn('Starting application...');
}

//
var path = require('path');

var express = require('express');
var toobusy = require('toobusy-js');
var statusCodePage = require('./libs/templateHelpers').statusCodePage;

var methodOverride = require('method-override');
var morgan = require('morgan');
var bodyParser = require('body-parser');
var compression = require('compression');
var favicon = require('serve-favicon');

var minify = null;
try {
  minify = require('express-minify');
} catch (e) {}

var lessMiddleware = require('less-middleware');

var session = require('express-session');
var MongoStore = require('connect-mongo')(session);
var mongoose = require('mongoose');
var passport = require('passport');
var chalk = require('chalk');

var app = express();

var modifySessions = require('./libs/modifySessions');

var settings = require('./models/settings.json');

var connectStr = process.env.CONNECT_STRING || settings.connect;
var sessionSecret = process.env.SESSION_SECRET || settings.secret;
var db = mongoose.connection;

var dbOptions = {};
if (isPro) {
  dbOptions.replset = {
    secondaryAcceptableLatencyMS: 15,
    poolSize: 5,
    socketOptions: {
      noDelay: true,
      keepAlive: 1,  // NOTE: Unclear why this was non-zero early on
      connectTimeoutMS: 60 * 1000,
      socketTimeoutMS: 0
    }
  }
} else {
  dbOptions.server = {
    poolSize: 5,
    socketOptions: {
      autoReconnect: false,
      noDelay: true,
      keepAlive: 1,  // NOTE: Unclear why this was non-zero early on
      connectTimeoutMS: 60 * 1000,
      socketTimeoutMS: 0
    },
    reconnectTries: 30,
    reconnectInterval: 1000
  }
}

var fs = require('fs');
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
db.on('error', function () {
  console.error(chalk.red('MongoDB connection error'));
});

db.once('open', function () {
  console.log(chalk.green('MongoDB connection is opened'));
});

db.on('connected', function () {
  var admin = new mongoose.mongo.Admin(mongoose.connection.db);
  admin.buildInfo(function (aErr, aInfo) {
    console.log(chalk.green('Connected to MongoDB v' + aInfo.version));
  });
});

db.on('disconnected', function () {
  console.error(chalk.yellow('\nMongoDB connection is disconnected'));
});

db.on('reconnected', function () {
  console.error(chalk.yellow('MongoDB connection is reconnected'));
});

process.on('SIGINT', function () {
  console.log(chalk.green('Capturing app termination for an attempt at cleanup'));

  /**
   * Attempt to get everything closed before process exit
   */

  // Close the db connection
  db.close(); // NOTE: Current asynchronous but auth may prevent callback until completed

  // Stop serving new http connections
  server.close(); // NOTE: Currently asynchronous but auth may prevent callback until completed

  // Shutdown timer in toobusy
  toobusy.shutdown(); // NOTE: Currently synchronous

  // Terminate the app
  process.exit(0);
});

var sessionStore = new MongoStore({ mongooseConnection: db });

// See https://hacks.mozilla.org/2013/01/building-a-node-js-server-that-wont-melt-a-node-js-holiday-season-part-5/

// Helper function to ensure value is type `number` or `null`
// Usually this should be in `./libs/helpers.js` but keeping local
//   for extra caution against editing
function ensureNumberOrNull(aEnvVar) {
  if (typeof aEnvVar !== 'number') {
    aEnvVar = parseInt(aEnvVar);

    if (aEnvVar !== aEnvVar) { // NOTE: ES6 `Number.isNaN`
      aEnvVar = null;
    }
  }

  return aEnvVar;
}

app.use(function (aReq, aRes, aNext) {
  var pathname = aReq._parsedUrl.pathname;
  var maxLag = null;
  var hostMaxMem = process.env.HOST_MAXMEM_BYTES || 1073741824; // NOTE: Default 1GiB
  var hostMem = null;
  var usedMem = null;
  var maxMem = null;
  var isSources = null;

  if (
    /^\/favicon\.ico$/.test(pathname) ||
      /^\/redist\//.test(pathname) ||
        /^\/less\//.test(pathname) ||
          /^\/css\//.test(pathname) ||
            /^\/images\//.test(pathname) ||
              /^\/fonts\//.test(pathname)
  ) {
    aNext(); // NOTE: Allow styling to pass through on these routes
    return;
  }

  if (process.env.FORCE_BUSY_ABSOLUTE === 'true') { // Always busy
    aRes.status(503).send(); // NOTE: No UI period just response header
    return;

  } else if (process.env.FORCE_BUSY === 'true') { // Graceful busy
    statusCodePage(aReq, aRes, aNext, {
      statusCode: 503,
      statusMessage:
        'We are experiencing technical difficulties right now. Please try again later.'
    });
    return;

  } else { // Weighted busy
    isSources = /^\/(?:install|src|scripts\/.*\/source\/?$)/.test(pathname);

    if (isSources) {
      maxLag = process.env.BUSY_MAXLAG_SOURCES;
    } else {
      maxLag = process.env.BUSY_MAXLAG_VIEWS;
    }

    maxLag = ensureNumberOrNull(maxLag);

    // Calculate current whole percentage of RSS memory used
    usedMem = parseInt(process.memoryUsage().rss / hostMaxMem * 100);

    // Compare current RSS memory used to maximum
    maxMem = ensureNumberOrNull(process.env.BUSY_MAXMEM);
    if (usedMem > (isSources ? (parseInt(maxMem / 3 * 2) || 50) : (maxMem || 75)) ||
      isSources && /\,\s\*\.\*$/.test(aReq.headers.accept)) // Temp cap TM
    {
      maxLag = ensureNumberOrNull(process.env.BUSY_MAXLAG_MAXMEM) || 10; // Automatic low serving
    }

    toobusy.maxLag(maxLag || 70);

    if (toobusy()) { // check if we're toobusy
      statusCodePage(aReq, aRes, aNext, {
        statusCode: 503,
        statusMessage: 'We are very busy right now. Please try again later.'
      });
    } else {
      aNext(); // not toobusy
    }
  }
});

// Force HTTPS
if (app.get('securePort')) {
  sslOptions = {
    key: fs.readFileSync('./keys/private.key'),
    cert: fs.readFileSync('./keys/cert.crt'),
    ca: fs.readFileSync('./keys/intermediate.crt'),
    ciphers: [
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
  secureServer = https.createServer(sslOptions, app);

  app.use(function (aReq, aRes, aNext) {
    aRes.setHeader('Strict-Transport-Security',
      'max-age=31536000000; includeSubDomains');

    if (!aReq.secure) {
      return aRes.redirect(301, 'https://' + aReq.headers.host + encodeURI(aReq.url));
    }

    aNext();
  });

  server.listen(app.get('port'));
  secureServer.listen(app.get('securePort'));
} else {
  server.listen(app.get('port'));
}

if (isDev || isDbg) {
  app.use(morgan('dev'));
}

app.use(bodyParser.urlencoded({
  extended: false,
  limit: parseInt(settings.maximum_upload_script_size / 1024, 10) + 'kb'
}));

app.use(bodyParser.json({
  extended: false,
  limit: parseInt(settings.maximum_upload_script_size / 1024, 10) + 'kb'
}));

app.use(compression());
app.use(methodOverride('X-HTTP-Method-Override'));

// Add absent from server MIME Content Type for PEG Grammar files
express.static.mime.define({
  'text/x-pegjs':  ['pegjs']
});

// Order is very important here (i.e mess with at your own risk)
app.use(passport.initialize());
app.use(session({
  resave: false,
  saveUninitialized: false,
  unset: 'destroy',
  cookie: { maxAge: null },
  secret: sessionSecret,
  store: sessionStore
}));
app.use(function (aReq, aRes, aNext) {
  if (aReq.session[passport._key]) {
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
var minifyErrorHandler = function (aErr, aStage, aAssetType, aMinifyOptions, aBody, aCallback) {
  console.warn([ // NOTE: Pushing this to stderr instead of default stdout
    'MINIFICATION WARNING (release):',
    '  filename: ' + aErr.filename,
    '  message: ' + aErr.message,
    '  line: ' + aErr.line + ' col: ' + aErr.col + ' pos: ' + aErr.pos,
    '  body: ' + aBody.slice(0, 100)

  ].join('\n'));

  if (aStage === 'compile') {
    aCallback(aErr, JSON.stringify(aErr));
    return;
  }

  aCallback(aErr, aBody);
};

if (minify && !isDbg) {
  app.use(minify({
    cache: './dev/cache/express-minify/release',
    onerror: minifyErrorHandler
  }));
}

app.use(function(aReq, aRes, aNext) {
  var pathname = aReq._parsedUrl.pathname;

  // If a userscript or library...
  if (
    (/(\.user)?\.js|\.meta.js(on)?$/.test(pathname) && /^\/(meta|install|src)\//.test(pathname)) ||
      /^\/admin\/(npm|json)/.test(pathname) ||
        /^\/mod\/removed\//.test(pathname)
  ) {
    aRes._skip = true; // ... skip using release minification
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
