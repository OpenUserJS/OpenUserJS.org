var Script = require('../models/script').Script;
var User = require('../models/user').User;
var Remove = require('../models/remove').Remove;
var Group = require('../models/group').Group;
var Discussion = require('../models/discussion').Discussion;
var Comment = require('../models/comment').Comment;
var getRating = require('./collectiveRating').getRating;
var renderMd = require('./markdown').renderMd;
var formatDate = require('./helpers').formatDate;
var listSize = 10;

// /scriptlist/size/:size/sort/:orderBy/dir/:direction/page/:page
// Get a list of scripts and build the options object
// for the corresponding Mustache partial template
exports.listScripts = function (query, params, baseUrl, callback) {

  // Don't list flagged scripts by default
  if (query.flagged === null) {
    delete query.flagged;
  } else if (query.flagged !== true) {
    query.flagged = { $ne: true };
  }

  // List both libraries and scripts if isLib is null
  // Only list scripts and omit libraries by default
  if (query.isLib === null) {
    delete query.isLib;
  } else if (!query.isLib) {
    query.isLib = { $ne: true };
  }

  listModels(Script, query, params, ['rating', 'installs', 'updated'],
    function (scripts, scriptsList) {
      /*var headings = {
        'name': { label: 'Name', width: 50 },
        'author': { label: 'Author', width: 15 },
        'rating': { label: 'Rating', width: 15 },
        'installs': { label: 'Installs', width: 15 }
      };*/
      var heading = null;
      var name = null;
      scriptsList.scripts = [];
      scriptsList.headings = [];
      scriptsList.hasAuthor = params[4] ?
        params[4].indexOf('author') === -1 : true;

      scripts.forEach(function (script) {
        var isLib = script.isLib || false;
        var scriptPath = script.installName
          .replace(isLib ? /\.js$/ : /\.user\.js$/, '');
        var editUrl = scriptPath.split('/');

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
          updated: formatDate(script.updated)
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
      callback(scriptsList);
    });
};

// /userlist/size/:size/sort/:orderBy/dir/:direction/page/:page
// Get a list of users and build the options object
// for the corresponding Mustache partial template
exports.listUsers = function (query, params, baseUrl, callback) {
  listModels(User, query, params, ['name'],
    function (users, usersList) {
      usersList.users = [];

      users.forEach(function (user) {
        usersList.users.push({
          name: user.name,
          url: '/users/' + user.name,
        });
      });

      usersList.baseUrl = baseUrl + '/userlist';
      callback(usersList);
    });
};

// /list/size/:size/sort/:orderBy/dir/:direction/page/:page
// Get a list of removed content and build the options object
// for the corresponding Mustache partial template
exports.listRemoved = function (query, params, baseUrl, callback) {
  listModels(Remove, query, params, ['removed'],
    function (results, removedList) {
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
          removed: formatDate(result.removed),
          reason: result.reason,
          content: contentArr
        });
      });

      removedList.baseUrl = baseUrl + '/list';
      callback(removedList);
    });
};

// /groups/list/size/:size/sort/:orderBy/dir/:direction/page/:page
// Get a list of groups and build the options object
// for the corresponding Mustache partial template
exports.listGroups = function (query, params, baseUrl, callback) {
  listModels(Group, query, params, ['rating'],
    function (groups, groupsList) {
      groupsList.groups = [];

      groups.forEach(function (group) {
        groupsList.groups.push({
          name: group.name,
          url: '/group/' + group.name.replace(/\s+/g, '_'),
          size: group._scriptIds.length,
          multiple: group._scriptIds.length > 1
        });

        // Wait two hours between group rating updates
        // This calculation runs in the background
        if (new Date().getTime() > (group.updated.getTime() + 1000 * 60 * 60 * 2)) {
          Script.find({ _id: { $in: group._scriptIds } },
            function (err, scripts) {
              if (!err && scripts.length > 1) {
                group.rating = getRating(scripts);
              }

              group.updated = new Date();
              group.save(function () { });
            });
        }
      });

      groupsList.baseUrl = baseUrl + '/list';
      callback(groupsList);
    });
};

// /list/size/:size/sort/:orderBy/dir/:direction/page/:page
// Get a list of discussions and build the options object
// for the corresponding Mustache partial template
exports.listDiscussions = function (query, params, baseUrl, callback) {
  listModels(Discussion, query, params, ['updated', 'rating'],
    function (discussions, discussionsList) {
      discussionsList.discussions = [];

      discussions.forEach(function (discussion) {
        discussionsList.discussions.push({
          topic: discussion.topic,
          comments: discussion.comments,
          author: discussion.author,
          created: discussion.created,
          lastCommentor: discussion.author != discussion.lastCommentor ?
            discussion.lastCommentor : null,
          updated: formatDate(discussion.updated),
          rating: discussion.rating,
          url: discussion.path
            + (discussion.duplicateId ? '_' + discussion.duplicateId : '')
        });
      });

      discussionsList.baseUrl = baseUrl + '/list';
      callback(discussionsList);
    });
};

// /list/size/:size/sort/:orderBy/dir/:direction/page/:page
// Get a list of comments and build the options object
// for the corresponding Mustache partial template
exports.listComments = function (query, params, baseUrl, callback) {
  listModels(Comment, query, params, ['created'],
    function (comments, commentsList) {
      commentsList.comments = [];

      comments.forEach(function (comment) {
        commentsList.comments.push({
          author: comment.author,
          content: renderMd(comment.content),
          created: formatDate(comment.created),
          rating: comment.rating,
          id: comment.id,
        });
      });

      commentsList.baseUrl = baseUrl + '/list';
      callback(commentsList);
    });
};

// options = {
//   size: (Number), orderBy: (String or Array or Object),
//   direction: (String), page: (Number), omit: (Array)
// }
function listModels(model, query, options, defaultOrder, callback) {
  var optArr = null;
  var fields = Object.keys(model.schema.tree);
  var orderBy = null;
  var page = 0;
  var direction = 0;
  var size = 0;
  var omit = '';
  var params = { sort: {} };

  // Either use route params or an object
  if (options instanceof Array) {
    optArr = options;
    options = {};
    options.size = optArr[0];
    options.orderBy = optArr[1];
    options.direction = optArr[2];
    options.page = optArr[3];
    options.omit = optArr[4];
  }

  orderBy = options.orderBy || defaultOrder;
  page = options.page && !isNaN(options.page) ? options.page - 1 : 0;
  size = options.size || listSize;

  if (page < 0) { page = 0; }

  // Set the sort order for the model list
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

  // Omit certain fields from the models in the list
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

  // Get the right portion (page) of results
  if (size >= 0) {
    params.limit = size + 1;
    params.skip = size * page;
  }

  model.find(query, omit, params,
    function (err, models) {
      var list = {};
      if (!models) { models = [] }
      if (size < 0) { size = models.length; }
      orderBy = typeof orderBy === 'string' ? orderBy : '';
      direction = direction === 1 ? 'asc' : 'desc';

      // Build the pagination for the Mustache template
      list.size = options.size ? '/size/' + size : '';
      list.orderBy = options.orderBy ? '/sort/' + orderBy : '';
      list.direction = options.direction ? '/dir/' + direction : '';
      page += 1;

      list.pageNumber = page;
      list.next = models.length > size ? '/page/' + (page + 1) : '';
      list.previous = page > 1 ? '/page/' + (page - 1) : '';

      if (list.next) { models.pop(); }
      callback(models, list);
    });
};
