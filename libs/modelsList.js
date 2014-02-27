var Script = require('../models/script').Script;
var listSize = 10;
var defaultSort = 'updated';

// /scripts/size/:size/sort/:orderBy/dir/:direction/page/:page
// Get a list of scripts and build the options object 
// for the corresponding Mustache partial template using req.query.params
exports.listScripts = function (query, params, omit, baseUrl, callback) {
  var options = {};
  options.size = params[0];
  options.orderBy = params[1];
  options.direction = params[2];
  options.page = params[3];
  options.omit = omit;

  listModels(Script, query, options,
    function (scripts, size, orderBy, direction, page) {
      var headings = {
        'name': { label: 'Name', width: 50 },
        'author': { label: 'Author', width: 15 },
        'rating': { label: 'Rating', width: 15 },
        'installs': { label: 'Installs', width: 15 }
      };
      var scriptsList = {};
      var heading = null;
      var name = null;
      scriptsList.scripts = [];
      scriptsList.headings = [];
      scriptsList.hasAuthor = omit.indexOf('author') === -1;

      scripts.forEach(function (script) {
        scriptsList.scripts.push({ 
          name: script.name,
          author: script.author,
          description: script.meta.description || '', 
          url: '/install/' + script.installName,
          rating: script.rating,
          installs: script.installs,
          version: script.meta.version
        });
      });

      for (name in headings) {
        if (!scriptsList.hasAuthor && name === 'author') { continue; }
        heading = headings[name];

        if (orderBy === name) {
          heading.direction = '/dir/' + 
            (direction === 'asc' ? 'desc' : 'asc');
        } else {
          heading.direction = '';
        }

        heading.name = name;
        scriptsList.headings.push(heading);
      }

      scriptsList.baseUrl = baseUrl + '/scripts';
      
      scriptsList.size = options.size ? '/size/' + size : '';
      scriptsList.orderBy = options.orderBy ? '/sort/' + orderBy : '';
      scriptsList.direction = options.direction ? '/dir/' + direction : '';
      page += 1;

      scriptsList.pageNumber = page;
      scriptsList.next = scripts.length > size ? '/page/' + (page + 1) : '';
      scriptsList.previous = page > 1 ? '/page/' + (page - 1) : '';

      if (scriptsList.next) { scriptsList.scripts.pop(); }
      callback(scriptsList);
  });
};

// options = { 
//   size: (Number), orderBy: (String), direction: (String), 
//   page: (Number), omit: (Array)
// }
function listModels (model, query, options, callback) {
  var fields = Object.keys(model.schema.tree);
  var orderBy = options.orderBy || defaultSort;
  var page = options.page && !isNaN(options.page) ? options.page - 1 : 0;
  var direction = options.direction === 'asc' ? 1 : -1;
  var size = options.size || listSize;
  var sortObj = {};

  if (-1 === fields.indexOf(orderBy)) { orderBy = defaultSort; }
  if (page < 0) { page = 0; }
  if (!options.direction && 
      typeof model.schema.tree[orderBy]() === 'string') { direction = 1; }
  if (size <= 0) { size = listSize; }

  if (options.omit) {
    options.omit.forEach(function (field) {
      var index = fields.indexOf(field);
      fields.splice(index, 1);
    });
  }

  sortObj[orderBy] = direction;

  model.find(query, fields.join(' '),
    { sort: sortObj,
      skip: size * page,
      limit : size + 1 },
    function (err, models) {
      if (!models) { models = [] }
      direction = direction === 1 ? 'asc' : 'desc';

      callback(models, size, orderBy, direction, page);
  });
}
