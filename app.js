'use strict';

// Define some pseudo module globals
var isPro = require('./libs/debug').isPro;
var isDev = require('./libs/debug').isDev;
var isDbg = require('./libs/debug').isDbg;

//
var path = require('path');

var express = require('express');
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

var app = express();

var modifySessions = require('./libs/modifySessions');

var settings = require('./models/settings.json');

var connectStr = process.env.CONNECT_STRING || settings.connect;
var sessionSecret = process.env.SESSION_SECRET || settings.secret;
var db = mongoose.connection;
var dbOptions = { server: { socketOptions: { keepAlive: 1 } } };

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
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function () {});

var sessionStore = new MongoStore({ mongooseConnection: db });

// Force HTTPS
if (app.get('securePort')) {
  sslOptions = {
    key: fs.readFileSync('./keys/private.key'),
    cert: fs.readFileSync('./keys/cert.crt'),
    ca: fs.readFileSync('./keys/intermediate.crt')
  };
  secureServer = https.createServer(sslOptions, app);

  app.use(function (aReq, aRes, aNext) {
    aRes.setHeader('Strict-Transport-Security',
      'max-age=8640000; includeSubDomains');

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
if (minify && !isDbg) {
  app.use(minify());
}

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
