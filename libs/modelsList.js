var Script = require('../models/script').Script;
var User = require('../models/user').User;
var Remove = require('../models/remove').Remove;
var listSize = 10;
var months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];

// /scriptlist/size/:size/sort/:orderBy/dir/:direction/page/:page
// Get a list of scripts and build the options object 
// for the corresponding Mustache partial template
exports.listScripts = function (query, params, baseUrl, callback) {
  if (query.isLib === null) {
    delete query.isLib;
  } else if (!query.isLib) {
    query.isLib = { $ne: true };
  }

  listModels(Script, query, params, ['rating', 'installs', 'updated'],
    function (scripts, size, orderBy, direction, page, options) {
      /*var headings = {
        'name': { label: 'Name', width: 50 },
        'author': { label: 'Author', width: 15 },
        'rating': { label: 'Rating', width: 15 },
        'installs': { label: 'Installs', width: 15 }
      };*/
      var scriptsList = {};
      var heading = null;
      var name = null;
      options.orderBy = orderBy;
      scriptsList.scripts = [];
      scriptsList.headings = [];
      scriptsList.hasAuthor = options.omit.indexOf('author') === -1;

      scripts.forEach(function (script) {
        var isLib = script.isLib || false;
        var scriptPath = script.installName
          .replace(isLib ? /\.js$/ : /\.user\.js$/, '');
        var editUrl = scriptPath.split('/');
        var updated = script.updated;

        editUrl.shift();

        scriptsList.scripts.push({ 
          name: script.name,
          author: script.author,
          description: script.meta.description || '',
          url: (isLib ? '/libs/' : '/scripts/') + scriptPath,
          install: (isLib ? '/libs/src/' : '/install/') + script.installName,
          editUrl: (isLib ? '/lib/' : '/script/') + editUrl.join('/') + '/edit',
          rating: script.rating,
          installs: script.installs,
          version: script.meta.version || '',
          isLib: script.isLib,
          updated: updated.getDate() + ' '
            + months[updated.getMonth()] + ' '
            + updated.getFullYear()
        });
      });

      /*for (name in headings) {
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
      }*/

      scriptsList.baseUrl = baseUrl + (query.isLib === true ? 
        '/liblist' : '/scriptlist');
      
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

// /userlist/size/:size/sort/:orderBy/dir/:direction/page/:page
// Get a list of users and build the options object 
// for the corresponding Mustache partial template
exports.listUsers = function (query, params, baseUrl, callback) {
  listModels(User, query, params, ['name'],
    function (users, size, orderBy, direction, page, options) {
      var usersList = {};
      usersList.users = [];

      users.forEach(function (user) {
        usersList.users.push({ 
          name: user.name,
          url: '/users/' + user.name,
        });
      });

      usersList.baseUrl = baseUrl + '/userlist';
      
      usersList.size = options.size ? '/size/' + size : '';
      usersList.orderBy = options.orderBy ? '/sort/' + orderBy : '';
      usersList.direction = options.direction ? '/dir/' + direction : '';
      page += 1;

      usersList.pageNumber = page;
      usersList.next = users.length > size ? '/page/' + (page + 1) : '';
      usersList.previous = page > 1 ? '/page/' + (page - 1) : '';

      if (usersList.next) { usersList.users.pop(); }
      callback(usersList);
  });
};

// /list/size/:size/sort/:orderBy/dir/:direction/page/:page
// Get a list of removed content and build the options object 
// for the corresponding Mustache partial template
exports.listRemoved = function (query, params, baseUrl, callback) {
  listModels(Remove, query, params, ['removed'],
    function (results, size, orderBy, direction, page, options) {
      var removedList = {};
      removedList.removed = [];

      results.forEach(function (result) {
        var content = result.content;
        var key = null;
        var contentArr = [];
        var val = null;
        
        for (key in content) {
          val = content[key];
          val = val && typeof val === 'object' ? JSON.stringify(val) : val;
          contentArr.push({ 'key': key, 'value': val });
        }

        removedList.removed.push({ 
          remover: result.removerName,
          removed: result.removed.getDate() + ' '
            + months[result.removed.getMonth()] + ' '
            + result.removed.getFullYear(),
          reason: result.reason,
          content: contentArr
        });
      });

      removedList.baseUrl = baseUrl + '/list';
      
      removedList.size = options.size ? '/size/' + size : '';
      removedList.orderBy = options.orderBy ? '/sort/' + orderBy : '';
      removedList.direction = options.direction ? '/dir/' + direction : '';
      page += 1;

      removedList.pageNumber = page;
      removedList.next = results.length > size ? '/page/' + (page + 1) : '';
      removedList.previous = page > 1 ? '/page/' + (page - 1) : '';

      if (removedList.next) { removedList.removed.pop(); }
      callback(removedList);
  });
};

// options = { 
//   size: (Number), orderBy: (String or Array or Object),
//   direction: (String), page: (Number), omit: (Array)
// }
function listModels (model, query, options, defaultOrder, callback) {
  var optArr = null;
  var fields = Object.keys(model.schema.tree);
  var orderBy = null;
  var page = 0;
  var direction = 0;
  var size = 0;
  var omit = '';
  var params = { sort: {} };

  if (options instanceof Array) {
    optArr = options;
    options = {};
    options.size = optArr[0];
    options.orderBy = optArr[1] || defaultOrder;
    options.direction = optArr[2];
    options.page = optArr[3];
    options.omit = optArr[4];
  }

  orderBy = options.orderBy;
  page = options.page && !isNaN(options.page) ? options.page - 1 : 0;
  size = options.size || listSize;

  if (page < 0) { page = 0; }

  if (typeof orderBy === 'string' && -1 !== fields.indexOf(orderBy)) {
    direction = options.direction || model.schema.paths[orderBy]
      .instance === 'String' ? 1 : -1;
    params.sort[orderBy] = direction;
  } else if (orderBy instanceof Array) {
    orderBy.forEach(function (order) {
      params.sort[order] = -1 !== fields.indexOf(order) && 
        model.schema.paths[order].instance === 'String' ? 1 : -1;
    });
  } else if (typeof orderBy === 'object') {
    params.sort = orderBy;
  }

  if (typeof options.omit === 'string') {
    options.omit = options.omit.split(' ');
  } else if (!options.omit) {
    options.omit = [];
  }

  if (options.omit instanceof Array) {
    options.omit.forEach(function (field) {
      var index = fields.indexOf(field);
      if (index > -1) { fields.splice(index, 1); }
    });
    omit = fields.join(' ');
  }

  if (size >= 0) {
    params.limit = size + 1;
    params.skip = size * page;
  }

  model.find(query, omit, params,
    function (err, models) {
      if (!models) { models = [] }
      if (size < 0) { size = models.length; }
      orderBy = typeof orderBy === 'string' ? orderBy : '';
      direction = direction === 1 ? 'asc' : 'desc';

      callback(models, size, orderBy, direction, page, options);
  });
};
