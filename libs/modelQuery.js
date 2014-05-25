var _ = require('underscore');

var orderDirs = ['asc', 'desc'];
var parseModelListSort = function(model, modelListQuery, orderBy, orderDir, defaultSortFn) {
  if (orderBy) {
    if (_.isUndefined(orderDir) || !_.contains(orderDirs, orderDir))
      orderDir = 'asc';

    if (_.has(model.schema.paths, orderBy)) {
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

exports.parseScriptSearchQuery = function(scriptListQuery, query) {
  var q = unescape(query);
  var partialWordMatchFields = ['name', 'author', 'about', 'meta.description'];
  var fullWordMatchFields = ['meta.include', 'meta.match'];
  scriptListQuery.find({
    '$or': parseSearchConditions(q, partialWordMatchFields, fullWordMatchFields)
  });
}

exports.parseGroupSearchQuery = function(groupListQuery, query) {
  var q = unescape(query);
  var partialWordMatchFields = ['name'];
  var fullWordMatchFields = [];
  groupListQuery.find({
    '$or': parseSearchConditions(q, partialWordMatchFields, fullWordMatchFields)
  });
}

exports.parseDiscussionSearchQuery = function(discussionListQuery, query) {
  var q = unescape(query);
  var partialWordMatchFields = ['topic'];
  var fullWordMatchFields = ['author'];
  discussionListQuery.find({
    '$or': parseSearchConditions(q, partialWordMatchFields, fullWordMatchFields)
  });
}

exports.parseCommentSearchQuery = function(commentListQuery, query) {
  var q = unescape(query);
  var partialWordMatchFields = ['content'];
  var fullWordMatchFields = ['author'];
  commentListQuery.find({
    '$or': parseSearchConditions(q, partialWordMatchFields, fullWordMatchFields)
  });
}

