var express = require('express');
var mongoose = require('mongoose');
var passport = require('passport');
var app = express();
var controllers = require('./controllers');
var authentication = require('./controllers/auth');
var admin = require('./controllers/admin');
var settings = require('./models/settings.json');

app.set('port', process.env.PORT || 8080);

app.configure(function(){
  app.use(express.urlencoded());
  app.use(express.json());
  app.use(express.compress());
  app.use(express.methodOverride());

  // Order is very important here (i.e mess with at your own risk)
  app.use(express.cookieParser(settings.secret));
  app.use(express.session());
  app.use(passport.initialize());
  app.use(app.router);

  // Set up the views
  app.engine('html', require('./libs/muExpress').renderFile);
  app.set('view engine', 'html');
  app.set('views', __dirname + '/views');
});

if (process.env.NODE_ENV === 'production') {
  mongoose.connect(process.env.CONNECT_STRING);
} else {
  // Throwaway database for development
  mongoose.connect('mongodb://nodejitsu_sizzlemctwizzle:b6vrl5hvkv2a3vvbaq1nor7fdl@ds045978.mongolab.com:45978/nodejitsu_sizzlemctwizzle_nodejitsudb8203815757');
}

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function callback () {
  app.listen(app.get('port'));
});

app.get('/', controllers.home);
app.post('/auth/', authentication.auth);
app.get('/auth/:strategy', authentication.auth);
app.get('/auth/:strategy/callback/', authentication.callback);
app.get('/logout', function(req, res) {
  delete req.session.user;
  res.redirect('/');
});

app.get('/admin/user', admin.userAdmin);
app.get('/admin/api', admin.apiAdmin);
app.post('/admin/user/update', admin.userAdminUpdate);
app.post('/admin/api/update', admin.apiAdminUpdate);

app.use(express.static(__dirname + '/public'));
app.use(function(req, res, next){
  res.sendfile(__dirname + '/public/404.html');
});

