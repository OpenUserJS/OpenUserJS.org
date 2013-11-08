exports.home = function(req, res) {
  res.render('index', { 'title': 'Home page' }, res);
}
