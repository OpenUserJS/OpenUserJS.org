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
var cookieParser = require('cookie-parser');
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

var scriptStorage = require('./controllers/scriptStorage');

app.set('port', process.env.PORT || 8080);

// Connect to the database
mongoose.connect(connectStr, dbOptions);
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function () {
  app.listen(app.get('port'));
});

var sessionStore = new MongoStore({ mongooseConnection: db });

// Force HTTPS
if (app.get('port') === 443) {
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
  limit: parseInt(settings.maximum_upload_script_size / 1024, 10) + 'kb'
}));

app.use(bodyParser.json({
  extended: false,
  limit: parseInt(settings.maximum_upload_script_size / 1024, 10) + 'kb'
}));

app.use(compression());
app.use(methodOverride('X-HTTP-Method-Override'));

// Intercept script/library/metadata requests to prevent
// the creation of useless session data
app.use(function (aReq, aRes, aNext) {
  var matches = null;

  if (aReq.method === 'GET' && 
      (matches = 
       /^\/(install|meta|src)(?:\/(scripts|libs))?\/([^\/]+)\/([^\/]+)/
       .exec(aReq.url))) {

    // Set route parameters to mimick express route middleware
    aReq.params = {};
    if (matches[1] === 'src' && matches[2]) {
      aReq.params.type = matches[2];
    }
    aReq.params.username = matches[3];
    aReq.params.scriptname = matches[4];

    switch (matches[1]) {
    case 'meta':
      scriptStorage.sendMeta(aReq, aRes, aNext);
      break;
    default:
      scriptStorage.sendScript(aReq, aRes, aNext);
      break;
    }
  } else {
    aNext();
  }
});

// Order is very important here (i.e mess with at your own risk)
app.use(cookieParser());
app.use(session({
  resave: true,
  saveUninitialized: true,
  secret: sessionSecret,
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
