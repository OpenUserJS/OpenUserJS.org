
module.exports = function(app, express, controllers, mongoose){
  var config = this;

  //generic config
  app.configure(function(){
    //express middleware
    app.use(express.urlencoded());
    app.use(express.json());
    app.use(express.compress());
    app.use(express.methodOverride());
    app.use(app.router);

    //template engine
    app.engine('html', require('./libs/muExpress').renderFile);
    app.set('view engine', 'html');

    //paths
    app.set('views', __dirname + '/views');

    app.get('/', controllers.home);

    app.use(express.static(__dirname + '/public'));
    app.use(function(req, res, next){
      res.sendfile(__dirname + '/public/404.html');
    });
  });

  //env specific config
  app.configure('development', function(){
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));

    mongoose.conn = mongoose.connect('mongodb://localhost/openuserjs');
  });

  return config;
};
