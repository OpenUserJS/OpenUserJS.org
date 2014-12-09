'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var _ = require('underscore');

var getDefaultPagination = require('../libs/templateHelpers').getDefaultPagination;

var findOrDefaultIfNull = function (aQuery, aKey, aValue, aDefaultValue) {
  var conditions = [];
  var condition = {};
  condition[aKey] = aValue;
  conditions.push(condition);
  if (aValue == aDefaultValue) {
    condition = {};
    condition[aKey] = null;
    conditions.push(condition);
  }
  aQuery.and({ $or: conditions });
};
exports.findOrDefaultIfNull = findOrDefaultIfNull;

var orderDirs = ['asc', 'desc'];
var parseModelListSort = function (aModelListQuery, aOrderBy, aOrderDir, aDefaultSortFn) {
  if (aOrderBy) {
    if (_.isUndefined(aOrderDir) || !_.contains(orderDirs, aOrderDir)) {
      aOrderDir = 'asc';
    }

    if (_.has(aModelListQuery.model.schema.paths, aOrderBy)) {
      var sortBy = {};
      sortBy[aOrderBy] = aOrderDir;
      aModelListQuery.sort(sortBy);
      return;
    }
  }
  aDefaultSortFn(aModelListQuery);
};
exports.parseModelListSort = parseModelListSort;

var parseSearchConditions = function (aQ, aPrefixSearchFields, aFullSearchFields) {
  var conditions = [];
  var query = null;
  var prefixStr = '';
  var fullStr = '';
  var prefixRegex = null;
  var fullRegex = null;
  var terms = aQ.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1').split(/\s+/).map(function (aE) { return aE.trim(); });

  // Match all the terms but in any order
  terms.forEach(function (aTerm) {
    var isNonASCII = /^\W/.test(aTerm);
    if (isNonASCII) {
      prefixStr += '(?=.*?([ \n\r\t.,\'"\+!?-]+)' + aTerm + ')';
    } else {
      prefixStr += '(?=.*?\\b' + aTerm + ')';
    }
    fullStr += '(?=.*?' + aTerm + ')';
  });
  prefixRegex = new RegExp(prefixStr, 'i');
  fullRegex = new RegExp(fullStr, 'i');

  // One of the searchable fields must match the conditions
  aPrefixSearchFields.forEach(function (aProp) {
    var condition = {};
    condition[aProp] = prefixRegex;
    conditions.push(condition);
  });

  aFullSearchFields.forEach(function (aProp) {
    var condition = {};
    condition[aProp] = fullRegex;
    conditions.push(condition);
  });
  return conditions;
};
exports.parseSearchConditions = parseSearchConditions;

var parseModelListSearchQuery = function (aModelListQuery, aQuery, aSearchOptions) {
  var q = unescape(aQuery);
  aModelListQuery.and({
    $or: parseSearchConditions(q, aSearchOptions.partialWordMatchFields, aSearchOptions.fullWordMatchFields)
  });
};

var parseScriptSearchQuery = function (aScriptListQuery, aQuery) {
  parseModelListSearchQuery(aScriptListQuery, aQuery, {
    partialWordMatchFields: ['name', 'author', 'about', 'meta.description'],
    fullWordMatchFields: ['meta.include', 'meta.match'],
  });
};
exports.parseScriptSearchQuery = parseScriptSearchQuery;

var parseGroupSearchQuery = function (aGroupListQuery, aQuery) {
  parseModelListSearchQuery(aGroupListQuery, aQuery, {
    partialWordMatchFields: ['name'],
    fullWordMatchFields: [],
  });
};
exports.parseGroupSearchQuery = parseGroupSearchQuery;

var parseDiscussionSearchQuery = function (aDiscussionListQuery, aQuery) {
  parseModelListSearchQuery(aDiscussionListQuery, aQuery, {
    partialWordMatchFields: ['topic'],
    fullWordMatchFields: ['author'],
  });
};
exports.parseDiscussionSearchQuery = parseDiscussionSearchQuery;

var parseCommentSearchQuery = function (aCommentListQuery, aQuery) {
  parseModelListSearchQuery(aCommentListQuery, aQuery, {
    partialWordMatchFields: ['content'],
    fullWordMatchFields: ['author'],
  });
};
exports.parseCommentSearchQuery = parseCommentSearchQuery;

var parseUserSearchQuery = function (aUserListQuery, aQuery) {
  parseModelListSearchQuery(aUserListQuery, aQuery, {
    partialWordMatchFields: ['name'],
    fullWordMatchFields: [],
  });
};
exports.parseCommentSearchQuery = parseCommentSearchQuery;

var parseRemovedItemSearchQuery = function (aRemovedItemListQuery, aQuery) {
  parseModelListSearchQuery(aRemovedItemListQuery, aQuery, {
    partialWordMatchFields: ['content.*'],
    fullWordMatchFields: ['model'],
  });
};
exports.parseCommentSearchQuery = parseCommentSearchQuery;

exports.applyDiscussionCategoryFilter = function (aDiscussionListQuery, aOptions, aCatergorySlug) {
  if (aCatergorySlug === 'all') {
    return;
  }
  if (aCatergorySlug === 'issues') {
    aDiscussionListQuery.find({ issue: true });
  } else {
    aDiscussionListQuery.find({ category: aCatergorySlug });
  }
};

var applyModelListQueryFlaggedFilter = function (aModelListQuery, aOptions, aFlaggedQuery) {
  // Only list flagged items if authedUser >= moderator or if authedUser owns the item.
  if (aOptions.isYou || aOptions.isMod) {
    // Mod
    if (aFlaggedQuery) {
      if (aFlaggedQuery === 'true') {
        aOptions.isFlagged = true;
        aOptions.searchBarPlaceholder = aOptions.searchBarPlaceholder.replace(/^Search /, 'Search Flagged ');
        if (!_.findWhere(aOptions.searchBarFormHiddenVariables, { name: 'flagged' })) {
          aOptions.searchBarFormHiddenVariables.push({ name: 'flagged', value: 'true' });
        }
        aModelListQuery.and({ flags: { $gt: 0 } });
      }
    } else {
      // Remove `flagged` form variable if present
      aOptions.searchBarFormHiddenVariables = _.without(
        aOptions.searchBarFormHiddenVariables,
        _.findWhere(aOptions.searchBarFormHiddenVariables, { name: 'flagged', value: 'true' })
      );
    }
  } else {
    // Hide
    // Script.flagged is undefined by default.
    aModelListQuery.and({ flagged: { $ne: true } });
  }
};
exports.applyModelListQueryFlaggedFilter = applyModelListQueryFlaggedFilter;

var applyModelListQueryDefaults = function (aModelListQuery, aOptions, aReq, aDefaultOptions) {

  // Search
  if (aReq.query.q) {
    aOptions.searchBarValue = aReq.query.q;

    if (aDefaultOptions.parseSearchQueryFn) {
      aDefaultOptions.parseSearchQueryFn(aModelListQuery, aReq.query.q);
    }
  }
  aOptions.searchBarFormAction = aDefaultOptions.searchBarFormAction || '';
  aOptions.searchBarPlaceholder = aDefaultOptions.searchBarPlaceholder || 'Search';
  aOptions.searchBarFormHiddenVariables = aDefaultOptions.searchBarFormHiddenVariables || [];

  // flagged
  if (aDefaultOptions.filterFlaggedItems) {
    applyModelListQueryFlaggedFilter(aModelListQuery, aOptions, aReq.query.flagged);
  }

  // Sort
  parseModelListSort(aModelListQuery, aReq.query.orderBy, aReq.query.orderDir, function () {
    aModelListQuery.sort(aDefaultOptions.defaultSort);
  });

  // Pagination
  var pagination = getDefaultPagination(aReq);
  pagination.applyToQuery(aModelListQuery);
  aOptions.pagination = pagination;
};

exports.applyCommentListQueryDefaults = function (aCommentListQuery, aOptions, aReq) {
  applyModelListQueryDefaults(aCommentListQuery, aOptions, aReq, {
    defaultSort: 'created',
    parseSearchQueryFn: parseCommentSearchQuery,
    searchBarPlaceholder: 'Search Comments',
    filterFlaggedItems: true
  });

  // Populate
  aCommentListQuery.populate({
    path: '_authorId',
    model: 'User',
    select: 'name role'
  });
};

exports.applyDiscussionListQueryDefaults = function (aDiscussionListQuery, aOptions, aReq) {
  applyModelListQueryDefaults(aDiscussionListQuery, aOptions, aReq, {
    defaultSort: '-updated -rating',
    parseSearchQueryFn: parseDiscussionSearchQuery,
    searchBarPlaceholder: 'Search Topics',
    filterFlaggedItems: true
  });
};

exports.applyGroupListQueryDefaults = function (aGroupListQuery, aOptions, aReq) {
  applyModelListQueryDefaults(aGroupListQuery, aOptions, aReq, {
    defaultSort: '-rating name',
    parseSearchQueryFn: parseGroupSearchQuery,
    searchBarPlaceholder: 'Search Groups',
    filterFlaggedItems: true
  });
};

var scriptListQueryDefaults = {
  defaultSort: '-rating -installs -updated',
  parseSearchQueryFn: parseScriptSearchQuery,
  searchBarPlaceholder: 'Search Scripts',
  searchBarFormAction: '/',
  filterFlaggedItems: true
};
exports.scriptListQueryDefaults = scriptListQueryDefaults;
exports.applyScriptListQueryDefaults = function (aScriptListQuery, aOptions, aReq) {
  applyModelListQueryDefaults(aScriptListQuery, aOptions, aReq, scriptListQueryDefaults);
};

var libraryListQueryDefaults = {
  defaultSort: '-rating -installs -updated',
  parseSearchQueryFn: parseScriptSearchQuery,
  searchBarPlaceholder: 'Search Libraries',
  searchBarFormAction: '/',
  searchBarFormHiddenVariables: [
    { name: 'library', value: 'true' }
  ],
  filterFlaggedItems: true
};
exports.libraryListQueryDefaults = libraryListQueryDefaults;
exports.applyLibraryListQueryDefaults = function (aLibraryListQuery, aOptions, aReq) {
  applyModelListQueryDefaults(aLibraryListQuery, aOptions, aReq, libraryListQueryDefaults);
};

exports.applyUserListQueryDefaults = function (aUserListQuery, aOptions, aReq) {
  applyModelListQueryDefaults(aUserListQuery, aOptions, aReq, {
    defaultSort: 'name',
    parseSearchQueryFn: parseUserSearchQuery,
    searchBarPlaceholder: 'Search Users',
    filterFlaggedItems: true
  });
};

exports.applyRemovedItemListQueryDefaults = function (aRemovedItemListQuery, aOptions, aReq) {
  applyModelListQueryDefaults(aRemovedItemListQuery, aOptions, aReq, {
    defaultSort: '-removed',
    parseSearchQueryFn: parseRemovedItemSearchQuery,
    searchBarPlaceholder: 'Search Removed Items',
    filterFlaggedItems: false
  });
};
