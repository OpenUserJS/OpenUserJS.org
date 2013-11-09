var express = require('express');
var app = express();
var controllers = require('./controllers');
var settings = require('./models/settings.json');

app.configure(function(){
  app.use(express.urlencoded());
  app.use(express.json());
  app.use(express.compress());
  app.use(express.methodOverride());

  // Order is very important here (i.e mess with at your own risk)
  app.use(express.cookieParser(settings.secret));
  app.use(express.session());
  app.use(app.router);
});

app.listen(8080);

app.engine('html', require('./libs/muExpress').renderFile);
app.set('view engine', 'html');
app.set('views', __dirname + '/views');

app.get('/', controllers.home);
app.get('/logout/', controllers.logout);
app.post('/', controllers.login);

app.use(express.static(__dirname + '/public'));
app.use(function(req, res, next){
  res.sendfile(__dirname + '/public/404.html');
});
