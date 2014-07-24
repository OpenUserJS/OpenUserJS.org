'use strict';

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
exports.listScripts = function (aQuery, aParams, aBaseUrl, aCallback) {

  // Don't list flagged scripts by default
  if (aQuery.flagged === null) {
    delete aQuery.flagged;
  } else if (aQuery.flagged !== true) {
    aQuery.flagged = { $ne: true };
  }

  // List both libraries and scripts if isLib is null
  // Only list scripts and omit libraries by default
  if (aQuery.isLib === null) {
    delete aQuery.isLib;
  } else if (!aQuery.isLib) {
    aQuery.isLib = { $ne: true };
  }

  listModels(Script, aQuery, aParams, ['rating', 'installs', 'updated'],
    function (aScripts, aScriptsList) {
      /*var headings = {
        'name': { label: 'Name', width: 50 },
        'author': { label: 'Author', width: 15 },
        'rating': { label: 'Rating', width: 15 },
        'installs': { label: 'Installs', width: 15 }
      };*/
      var heading = null;
      var name = null;
      aScriptsList.scripts = [];
      aScriptsList.headings = [];
      aScriptsList.hasAuthor = aParams[4] ?
        aParams[4].indexOf('author') === -1 : true;

      aScripts.forEach(function (aScript) {
        var isLib = aScript.isLib || false;
        var scriptPath = aScript.installName
          .replace(isLib ? /\.js$/ : /\.user\.js$/, '');
        var editUrl = scriptPath.split('/');

        editUrl.shift();

        aScriptsList.scripts.push({
          name: aScript.name,
          author: aScript.author,
          description: aScript.meta.description || '',
          url: (isLib ? '/libs/' : '/scripts/') + scriptPath,
          install: (isLib ? '/libs/src/' : '/install/') + aScript.installName,
          editUrl: (isLib ? '/lib/' : '/script/') + editUrl.join('/') + '/edit',
          rating: aScript.rating,
          installs: aScript.installs,
          version: aScript.meta.version || '',
          isLib: aScript.isLib,
          updated: formatDate(aScript.updated)
        });
      });

      /*for (name in headings) {
        if (!aScriptsList.hasAuthor && name === 'author') { continue; }
        heading = headings[name];

        if (orderBy === name) {
          heading.direction = '/dir/' +
            (direction === 'asc' ? 'desc' : 'asc');
        } else {
          heading.direction = '';
        }

        heading.name = name;
        aScriptsList.headings.push(heading);
      }*/

      aScriptsList.baseUrl = aBaseUrl + (aQuery.isLib === true ?
        '/liblist' : '/scriptlist');
      aCallback(aScriptsList);
    });
};

// /userlist/size/:size/sort/:orderBy/dir/:direction/page/:page
// Get a list of users and build the options object
// for the corresponding Mustache partial template
exports.listUsers = function (aQuery, aParams, aBaseUrl, aCallback) {
  listModels(User, aQuery, aParams, ['name'],
    function (aUsers, aUsersList) {
      aUsersList.users = [];

      aUsers.forEach(function (aUser) {
        aUsersList.users.push({
          name: aUser.name,
          url: '/users/' + aUser.name,
        });
      });

      aUsersList.baseUrl = aBaseUrl + '/userlist';
      aCallback(aUsersList);
    });
};

// /list/size/:size/sort/:orderBy/dir/:direction/page/:page
// Get a list of removed content and build the options object
// for the corresponding Mustache partial template
exports.listRemoved = function (aQuery, aParams, aBaseUrl, aCallback) {
  listModels(Remove, aQuery, aParams, ['removed'],
    function (aResults, aRemovedList) {
      aRemovedList.removed = [];

      aResults.forEach(function (aResult) {
        var content = aResult.content;
        var key = null;
        var contentArr = [];
        var val = null;

        for (key in content) {
          val = content[key];
          val = val && typeof val === 'object' ? JSON.stringify(val) : val;
          contentArr.push({ 'key': key, 'value': val });
        }

        aRemovedList.removed.push({
          remover: aResult.removerName,
          removed: formatDate(aResult.removed),
          reason: aResult.reason,
          content: contentArr
        });
      });

      aRemovedList.baseUrl = aBaseUrl + '/list';
      aCallback(aRemovedList);
    });
};

// /groups/list/size/:size/sort/:orderBy/dir/:direction/page/:page
// Get a list of groups and build the options object
// for the corresponding Mustache partial template
exports.listGroups = function (aQuery, aParams, aBaseUrl, aCallback) {
  listModels(Group, aQuery, aParams, ['rating'],
    function (aGroups, aGroupsList) {
      aGroupsList.groups = [];

      aGroups.forEach(function (aGroup) {
        aGroupsList.groups.push({
          name: aGroup.name,
          url: '/group/' + aGroup.name.replace(/\s+/g, '_'),
          size: aGroup._scriptIds.length,
          multiple: aGroup._scriptIds.length > 1
        });

        // Wait two hours between group rating updates
        // This calculation runs in the background
        if (new Date().getTime() > (aGroup.updated.getTime() + 1000 * 60 * 60 * 2)) {
          Script.find({ _id: { $in: aGroup._scriptIds } },
            function (aErr, aScripts) {
              if (!aErr && aScripts.length > 1) {
                aGroup.rating = getRating(aScripts);
              }

              aGroup.updated = new Date();
              aGroup.save(function () { });
            });
        }
      });

      aGroupsList.baseUrl = aBaseUrl + '/list';
      aCallback(aGroupsList);
    });
};

// /list/size/:size/sort/:orderBy/dir/:direction/page/:page
// Get a list of discussions and build the options object
// for the corresponding Mustache partial template
exports.listDiscussions = function (aQuery, aParams, aBaseUrl, aCallback) {
  listModels(Discussion, aQuery, aParams, ['updated', 'rating'],
    function (aDiscussions, aDiscussionsList) {
      aDiscussionsList.discussions = [];

      aDiscussions.forEach(function (aDiscussion) {
        aDiscussionsList.discussions.push({
          topic: aDiscussion.topic,
          comments: aDiscussion.comments,
          author: aDiscussion.author,
          created: aDiscussion.created,
          lastCommentor: aDiscussion.author != aDiscussion.lastCommentor ?
            aDiscussion.lastCommentor : null,
          updated: formatDate(aDiscussion.updated),
          rating: aDiscussion.rating,
          url: aDiscussion.path
            + (aDiscussion.duplicateId ? '_' + aDiscussion.duplicateId : '')
        });
      });

      aDiscussionsList.baseUrl = aBaseUrl + '/list';
      aCallback(aDiscussionsList);
    });
};

// /list/size/:size/sort/:orderBy/dir/:direction/page/:page
// Get a list of comments and build the options object
// for the corresponding Mustache partial template
exports.listComments = function (aQuery, aParams, aBaseUrl, aCallback) {
  listModels(Comment, aQuery, aParams, ['created'],
    function (aComments, aCommentsList) {
      aCommentsList.comments = [];

      aComments.forEach(function (aComment) {
        aCommentsList.comments.push({
          author: aComment.author,
          content: renderMd(aComment.content),
          created: formatDate(aComment.created),
          rating: aComment.rating,
          id: aComment.id,
        });
      });

      aCommentsList.baseUrl = aBaseUrl + '/list';
      aCallback(aCommentsList);
    });
};

// options = {
//   size: (Number), orderBy: (String or Array or Object),
//   direction: (String), page: (Number), omit: (Array)
// }
function listModels(aModel, aQuery, aOptions, aDefaultOrder, aCallback) {
  var optArr = null;
  var fields = Object.keys(aModel.schema.tree);
  var orderBy = null;
  var page = 0;
  var direction = 0;
  var size = 0;
  var omit = '';
  var params = { sort: {} };

  // Either use route params or an object
  if (aOptions instanceof Array) {
    optArr = aOptions;
    aOptions = {};
    aOptions.size = optArr[0];
    aOptions.orderBy = optArr[1];
    aOptions.direction = optArr[2];
    aOptions.page = optArr[3];
    aOptions.omit = optArr[4];
  }

  orderBy = aOptions.orderBy || aDefaultOrder;
  page = aOptions.page && !isNaN(aOptions.page) ? aOptions.page - 1 : 0;
  size = aOptions.size || listSize;

  if (page < 0) { page = 0; }

  // Set the sort order for the model list
  if (typeof orderBy === 'string' && -1 !== fields.indexOf(orderBy)) {
    direction = aOptions.direction || aModel.schema.paths[orderBy]
      .instance === 'String' ? 1 : -1;
    params.sort[orderBy] = direction;
  } else if (orderBy instanceof Array) {
    orderBy.forEach(function (aOrder) {
      params.sort[aOrder] = -1 !== fields.indexOf(aOrder) &&
        aModel.schema.paths[aOrder].instance === 'String' ? 1 : -1;
    });
  } else if (typeof orderBy === 'object') {
    params.sort = orderBy;
  }

  // Omit certain fields from the models in the list
  if (typeof aOptions.omit === 'string') {
    aOptions.omit = aOptions.omit.split(' ');
  } else if (!aOptions.omit) {
    aOptions.omit = [];
  }

  if (aOptions.omit instanceof Array) {
    aOptions.omit.forEach(function (aField) {
      var index = fields.indexOf(aField);
      if (index > -1) { fields.splice(index, 1); }
    });
    omit = fields.join(' ');
  }

  // Get the right portion (page) of results
  if (size >= 0) {
    params.limit = size + 1;
    params.skip = size * page;
  }

  aModel.find(aQuery, omit, params,
    function (aErr, aModels) {
      var list = {};
      if (!aModels) { aModels = [] }
      if (size < 0) { size = aModels.length; }
      orderBy = typeof orderBy === 'string' ? orderBy : '';
      direction = direction === 1 ? 'asc' : 'desc';

      // Build the pagination for the Mustache template
      list.size = aOptions.size ? '/size/' + size : '';
      list.orderBy = aOptions.orderBy ? '/sort/' + orderBy : '';
      list.direction = aOptions.direction ? '/dir/' + direction : '';
      page += 1;

      list.pageNumber = page;
      list.next = aModels.length > size ? '/page/' + (page + 1) : '';
      list.previous = page > 1 ? '/page/' + (page - 1) : '';

      if (list.next) { aModels.pop(); }
      aCallback(aModels, list);
    });
};
