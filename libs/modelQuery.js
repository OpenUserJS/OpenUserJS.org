var _ = require('underscore');

var getDefaultPagination = require('../libs/templateHelpers').getDefaultPagination;

var findOrDefaultIfNull = function(query, key, value, defaultValue) {
  var conditions = [];
  var condition = {};
  condition[key] = value;
  conditions.push(condition);
  if (value == defaultValue) {
    condition = {};
    condition[key] = null;
    conditions.push(condition);
  }
  query.find({$or: conditions});
};
exports.findOrDefaultIfNull = findOrDefaultIfNull;

var orderDirs = ['asc', 'desc'];
var parseModelListSort = function(modelListQuery, orderBy, orderDir, defaultSortFn) {
  if (orderBy) {
    if (_.isUndefined(orderDir) || !_.contains(orderDirs, orderDir))
      orderDir = 'asc';

    if (_.has(modelListQuery.model.schema.paths, orderBy)) {
      var sortBy = {};
      sortBy[orderBy] = orderDir;
      modelListQuery.sort(sortBy);
      return;
    }
  }
  defaultSortFn(modelListQuery);
};
exports.parseModelListSort = parseModelListSort;

var parseSearchConditions = function(q, prefixSearchFields, fullSearchFields) {
  var conditions = [];
  var query = null;
  var prefixStr = '';
  var fullStr = '';
  var prefixRegex = null;
  var fullRegex = null;
  var terms = q.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1').split(/\s+/);

  // Match all the terms but in any order
  terms.forEach(function (term) {
    prefixStr += '(?=.*?\\b' + term  + ')';
    fullStr += '(?=.*?' + term  + ')';
  });
  prefixRegex = new RegExp(prefixStr, 'i');
  fullRegex = new RegExp(fullStr, 'i');

  // One of the searchable fields must match the conditions
  prefixSearchFields.forEach(function (prop) {
    var condition = {};
    condition[prop] = prefixRegex;
    conditions.push(condition);
  });

  fullSearchFields.forEach(function (prop) {
    var condition = {};
    condition[prop] = fullRegex;
    conditions.push(condition);
  });
  return conditions;
};
exports.parseSearchConditions = parseSearchConditions;

var parseModelListSearchQuery = function(modelListQuery, query, searchOptions) {
  var q = unescape(query);
  var partialWordMatchFields = ['name', 'author', 'about', 'meta.description'];
  var fullWordMatchFields = ['meta.include', 'meta.match'];
  modelListQuery.find({
    '$or': parseSearchConditions(q, searchOptions.partialWordMatchFields, searchOptions.fullWordMatchFields)
  });
};

var parseScriptSearchQuery = function(scriptListQuery, query) {
  parseModelListSearchQuery(scriptListQuery, query, {
    partialWordMatchFields: ['name', 'author', 'about', 'meta.description'],
    fullWordMatchFields: ['meta.include', 'meta.match'],
  });
};
exports.parseScriptSearchQuery = parseScriptSearchQuery;

var parseGroupSearchQuery = function(groupListQuery, query) {
  parseModelListSearchQuery(groupListQuery, query, {
    partialWordMatchFields: ['name'],
    fullWordMatchFields: [],
  });
};
exports.parseGroupSearchQuery = parseGroupSearchQuery;

var parseDiscussionSearchQuery = function(discussionListQuery, query) {
  parseModelListSearchQuery(discussionListQuery, query, {
    partialWordMatchFields: ['topic'],
    fullWordMatchFields: ['author'],
  });
};
exports.parseDiscussionSearchQuery = parseDiscussionSearchQuery;

var parseCommentSearchQuery = function(commentListQuery, query) {
  parseModelListSearchQuery(commentListQuery, query, {
    partialWordMatchFields: ['content'],
    fullWordMatchFields: ['author'],
  });
};
exports.parseCommentSearchQuery = parseCommentSearchQuery;

var parseUserSearchQuery = function(userListQuery, query) {
  parseModelListSearchQuery(userListQuery, query, {
    partialWordMatchFields: ['name'],
    fullWordMatchFields: [],
  });
};
exports.parseCommentSearchQuery = parseCommentSearchQuery;


var applyHideFlaggedFromModelListQuery = function(modelListQuery, options) {
  // Only list flagged items if authedUser >= moderator or if authedUser owns the item.
  if (options.isYou || options.isMod) {
    // Show
  } else {
    // Script.flagged is undefined by default.
    modelListQuery.find({flagged: {$ne: true}}); 
  }
};

var applyModelListQueryDefaults = function(modelListQuery, options, req, defaultOptions) {
  // flagged
  applyHideFlaggedFromModelListQuery(modelListQuery, options);

  // Search
  if (req.query.q && defaultOptions.parseSearchQueryFn)
    defaultOptions.parseSearchQueryFn(modelListQuery, req.query.q);

  // Sort
  parseModelListSort(modelListQuery, req.query.orderBy, req.query.orderDir, function(){
    modelListQuery.sort(defaultOptions.defaultSort);
  });

  // Pagination
  var pagination = getDefaultPagination(req);
  pagination.applyToQuery(modelListQuery);
  options.pagination = pagination;
};

exports.applyCommentListQueryDefaults = function(commentListQuery, options, req) {
  applyModelListQueryDefaults(commentListQuery, options, req, {
    defaultSort: 'created -rating',
    parseSearchQueryFn: parseCommentSearchQuery,
  });

  // Populate
  commentListQuery.populate({
    path: '_authorId',
    model: 'User',
    select: 'name role'
  });
};

exports.applyDiscussionListQueryDefaults = function(discussionListQuery, options, req) {
  applyModelListQueryDefaults(discussionListQuery, options, req, {
    defaultSort: '-updated -rating',
    parseSearchQueryFn: parseDiscussionSearchQuery,
  });
};

exports.applyUserListQueryDefaults = function(userListQuery, options, req) {
  applyModelListQueryDefaults(userListQuery, options, req, {
    defaultSort: 'name',
    parseSearchQueryFn: parseUserSearchQuery,
  });
};
