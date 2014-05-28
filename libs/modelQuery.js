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

var parseScriptSearchQuery = function(scriptListQuery, query) {
  var q = unescape(query);
  var partialWordMatchFields = ['name', 'author', 'about', 'meta.description'];
  var fullWordMatchFields = ['meta.include', 'meta.match'];
  scriptListQuery.find({
    '$or': parseSearchConditions(q, partialWordMatchFields, fullWordMatchFields)
  });
};
exports.parseScriptSearchQuery = parseScriptSearchQuery;

var parseGroupSearchQuery = function(groupListQuery, query) {
  var q = unescape(query);
  var partialWordMatchFields = ['name'];
  var fullWordMatchFields = [];
  groupListQuery.find({
    '$or': parseSearchConditions(q, partialWordMatchFields, fullWordMatchFields)
  });
};
exports.parseGroupSearchQuery = parseGroupSearchQuery;

var parseDiscussionSearchQuery = function(discussionListQuery, query) {
  var q = unescape(query);
  var partialWordMatchFields = ['topic'];
  var fullWordMatchFields = ['author'];
  discussionListQuery.find({
    '$or': parseSearchConditions(q, partialWordMatchFields, fullWordMatchFields)
  });
};
exports.parseDiscussionSearchQuery = parseDiscussionSearchQuery;

var parseCommentSearchQuery = function(commentListQuery, query) {
  var q = unescape(query);
  var partialWordMatchFields = ['content'];
  var fullWordMatchFields = ['author'];
  commentListQuery.find({
    '$or': parseSearchConditions(q, partialWordMatchFields, fullWordMatchFields)
  });
};
exports.parseCommentSearchQuery = parseCommentSearchQuery;


exports.applyCommentListQueryDefaults = function(commentListQuery, options, req) {
  // CommentListQuery: flagged
  // Only list flagged scripts for author and user >= moderator
  if (options.isYou || options.isMod) {
    // Show
  } else {
    // Script.flagged is undefined by default.
    commentListQuery.find({flagged: {$ne: true}}); 
  }

  // CommentListQuery: Populate
  commentListQuery.populate({
    path: '_authorId',
    model: 'User',
    select: 'name role'
  });

  // CommentListQuery: Search
  if (req.query.q)
    parseCommentSearchQuery(commentListQuery, req.query.q);

  // CommentListQuery: Sort
  parseModelListSort(commentListQuery, req.query.orderBy, req.query.orderDir, function(){
    commentListQuery.sort('created -rating');
  });

  // Pagination
  var pagination = getDefaultPagination(req);
  pagination.applyToQuery(commentListQuery);
  options.pagination = pagination;
};

exports.applyDiscussionListQueryDefaults = function(discussionListQuery, options, req) {
  // DiscussionListQuery: flagged
  // Only list flagged scripts for author and user >= moderator
  if (options.isYou || options.isMod) {
    // Show
  } else {
    // Script.flagged is undefined by default.
    discussionListQuery.find({flagged: {$ne: true}}); 
  }

  // DiscussionListQuery: Search
  if (req.query.q)
    parseDiscussionSearchQuery(discussionListQuery, req.query.q);

  // DiscussionListQuery: Sort
  parseModelListSort(discussionListQuery, req.query.orderBy, req.query.orderDir, function(){
    discussionListQuery.sort('-updated -rating');
  });

  // Pagination
  var pagination = getDefaultPagination(req);
  pagination.applyToQuery(discussionListQuery);
  options.pagination = pagination;
};
