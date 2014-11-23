'use strict';

// Define some pseudo module globals
var isPro = require('./libs/debug').isPro;
var isDev = require('./libs/debug').isDev;
var isDbg = require('./libs/debug').isDbg;

//
var express = require('express');
var methodOverride = require('method-override');
var morgan = require('morgan');
var bodyParser = require('body-parser');
var compression = require('compression');
var cookieParser = require('cookie-parser');
var favicon = require('serve-favicon');

var minify = null;
try {
  minify = require('express-minify');
} catch (e) {}

var session = require('express-session');
var MongoStore = require('connect-mongo')(session);
var mongoose = require('mongoose');
var passport = require('passport');

var app = express();

var statusCodePage = require('./libs/templateHelpers').statusCodePage;
var modifySessions = require('./libs/modifySessions');

var config = require('./config');

var db = mongoose.connection;
var dbOptions = { server: { socketOptions: { keepAlive: 1 } } };

app.set('port', config.port);

// Connect to the database
mongoose.connect(config.mongoose.uri, dbOptions);
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function () {
  app.listen(app.get('port'));
});

var sessionStore = new MongoStore({ mongoose_connection: db });

// Force HTTPS
if (config.isHTTPS) {
  app.use(function (aReq, aRes, aNext) {
    aRes.setHeader('Strict-Transport-Security',
      'max-age=8640000; includeSubDomains');

    if (aReq.headers['x-forwarded-proto'] !== 'https') {
      return aRes.redirect(301, 'https://' + aReq.headers.host + encodeURI(aReq.url));
    }

    aNext();
  });
}

if (isDev || isDbg) {
  app.use(morgan('dev'));
}

app.use(bodyParser.urlencoded({
  extended: false,
  limit: parseInt(config.maximumRequestBodySize / 1024, 10) + 'kb'
}));

app.use(bodyParser.json({
  extended: false,
  limit: parseInt(config.maximumRequestBodySize / 1024, 10) + 'kb'
}));

app.use(compression());
app.use(methodOverride('X-HTTP-Method-Override'));

// Order is very important here (i.e mess with at your own risk)
app.use(cookieParser());
app.use(session({
  resave: true,
  saveUninitialized: true,
  secret: config.express.sessionSecret,
  store: sessionStore
}));
app.use(passport.initialize());
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

// Routes
require('./routes')(app);
