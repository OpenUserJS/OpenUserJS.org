'use strict';

var express = require('express');
var methodOverride = require('method-override');
var minify = require('express-minify');
var MongoStore = require('connect-mongo')(express);
var mongoose = require('mongoose');
var passport = require('passport');

var app = express();

var statusCodePage = require('./libs/templateHelpers').statusCodePage;
var modifySessions = require('./libs/modifySessions');

var settings = require('./models/settings.json');

var connectStr = process.env.CONNECT_STRING || settings.connect;
var sessionSecret = process.env.SESSION_SECRET || settings.secret;
var db = mongoose.connection;
var dbOptions = { server: { socketOptions: { keepAlive: 1 } } };

app.set('port', process.env.PORT || 8080);

// Connect to the database
mongoose.connect(connectStr, dbOptions);
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function () {
  app.listen(app.get('port'));
});

var sessionStore = new MongoStore({ mongoose_connection: db });

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

if (process.env.NODE_ENV !== 'production') {
  app.use(express.logger('dev'));
}

app.use(express.urlencoded());
app.use(express.json());
app.use(express.compress());
app.use(methodOverride('X-HTTP-Method-Override'));

// Order is very important here (i.e mess with at your own risk)
app.use(express.cookieParser());
app.use(express.session({
  secret: sessionSecret,
  store: sessionStore
}));
app.use(passport.initialize());
app.use(modifySessions.init(sessionStore));
app.use(app.router);
app.use(express.favicon('public/images/favicon.ico'));

// Set up the views
app.engine('html', require('./libs/muExpress').renderFile(app));
app.set('view engine', 'html');
app.set('views', __dirname + '/views');


// Setup minification
// Order is important here as Ace will fail with an invalid content encoding issue
if (process.env.NODE_ENV === 'production') {
  app.use(minify());
}

// Routes
require('./routes')(app);
