var mu = require('mu2');
 
exports.renderFile = function(path, options, response) {
  mu.compileAndRender(path, options).pipe(response);
}
 
/* Usage:
 
app.engine('html', require('muExpress').renderFile);
app.set('view engine', 'html');
app.set('views', __dirname + '/views');
app.get('/', function(req, res) {
  res.render('index', { 'title': 'Home page' }, res);
});
 
*/
