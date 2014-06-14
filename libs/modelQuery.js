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
  query.and({$or: conditions});
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
  modelListQuery.and({
    $or: parseSearchConditions(q, searchOptions.partialWordMatchFields, searchOptions.fullWordMatchFields)
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

var parseRemovedItemSearchQuery = function(removedItemListQuery, query) {
  parseModelListSearchQuery(removedItemListQuery, query, {
    partialWordMatchFields: ['content.*'],
    fullWordMatchFields: ['model'],
  });
};
exports.parseCommentSearchQuery = parseCommentSearchQuery;


var applyModelListQueryFlaggedFilter = function(modelListQuery, options, flaggedQuery) {
  // Only list flagged items if authedUser >= moderator or if authedUser owns the item.
  if (options.isYou || options.isMod) {
    // Mod
    if (flaggedQuery) {
      if (flaggedQuery == 'true') {
        modelListQuery.and({flags: {$gt: 0 }});
      } else if (flaggedQuery == false) {
        // modelListQuery.and({$or: [
        //   {flags: {$exists: false}},
        //   {flags: {$lte: 0} },
        // ]});
      }
    }
  } else {
    // Hide
    // Script.flagged is undefined by default.
    modelListQuery.and({flagged: {$ne: true}});
  }
};
exports.applyModelListQueryFlaggedFilter = applyModelListQueryFlaggedFilter;

var applyModelListQueryDefaults = function(modelListQuery, options, req, defaultOptions) {

  // Search
  if (req.query.q) {
    options.searchBarValue = req.query.q;

    if (defaultOptions.parseSearchQueryFn)
      defaultOptions.parseSearchQueryFn(modelListQuery, req.query.q);
  }
  options.searchBarFormAction = defaultOptions.searchBarFormAction || '';
  options.searchBarPlaceholder = defaultOptions.searchBarPlaceholder || 'Search';
  options.searchBarFormHiddenVariables = defaultOptions.searchBarFormHiddenVariables || [];

  // flagged
  if (defaultOptions.filterFlaggedItems)
    applyModelListQueryFlaggedFilter(modelListQuery, options, req.query.flagged);


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
    defaultSort: 'created',
    parseSearchQueryFn: parseCommentSearchQuery,
    searchBarPlaceholder: 'Search Comments',
    filterFlaggedItems: true,
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
    searchBarPlaceholder: 'Search Topics',
    filterFlaggedItems: true,
  });
};

exports.applyGroupListQueryDefaults = function(groupListQuery, options, req) {
  applyModelListQueryDefaults(groupListQuery, options, req, {
    defaultSort: '-rating name',
    parseSearchQueryFn: parseGroupSearchQuery,
    searchBarPlaceholder: 'Search Groups',
    filterFlaggedItems: true,
  });
};

var scriptListQueryDefaults = {
  defaultSort: '-rating -installs -updated',
  parseSearchQueryFn: parseScriptSearchQuery,
  searchBarPlaceholder: 'Search Scripts',
  searchBarFormAction: '/',
  filterFlaggedItems: true,
};
exports.scriptListQueryDefaults = scriptListQueryDefaults;
exports.applyScriptListQueryDefaults = function(scriptListQuery, options, req) {
  applyModelListQueryDefaults(scriptListQuery, options, req, scriptListQueryDefaults);
};

var libraryListQueryDefaults = {
  defaultSort: '-rating -installs -updated',
  parseSearchQueryFn: parseScriptSearchQuery,
  searchBarPlaceholder: 'Search Libraries',
  searchBarFormAction: '/',
  searchBarFormHiddenVariables: [
    {name: 'library', value: 'true'},
  ],
  filterFlaggedItems: true,
};
exports.libraryListQueryDefaults = libraryListQueryDefaults;
exports.applyLibraryListQueryDefaults = function(libraryListQuery, options, req) {
  applyModelListQueryDefaults(libraryListQuery, options, req, libraryListQueryDefaults);
};

exports.applyUserListQueryDefaults = function(userListQuery, options, req) {
  applyModelListQueryDefaults(userListQuery, options, req, {
    defaultSort: 'name',
    parseSearchQueryFn: parseUserSearchQuery,
    searchBarPlaceholder: 'Search Users',
    filterFlaggedItems: true,
  });
};

exports.applyRemovedItemListQueryDefaults = function(removedItemListQuery, options, req) {
  applyModelListQueryDefaults(removedItemListQuery, options, req, {
    defaultSort: '-removed',
    parseSearchQueryFn: parseRemovedItemSearchQuery,
    searchBarPlaceholder: 'Search Removed Items',
    filterFlaggedItems: false,
  });
};
