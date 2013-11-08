var mu = require('mu2');
 
exports.renderFile = function(path, options, response) {
  mu.compileAndRender(path, options).pipe(response);
}
