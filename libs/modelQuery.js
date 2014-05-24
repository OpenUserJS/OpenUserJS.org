var orderDirs = ['asc', 'desc'];
function parseScriptsSortQuery(scriptsQuery, query, defaultFn) {
  if (query.orderBy) {
    var orderBy = query.orderBy;
    var orderDir = query.orderDir;
    if (_.isUndefined(query.orderDir) || !_.contains(orderDirs, orderDir))
      orderDir = 'asc';

    if (_.has(Script.schema.paths, query.orderBy)) {
      var sortBy = {};
      sortBy[orderBy] = orderDir;
      scriptsQuery.sort(sortBy);
      return;
    }
  }
  defaultFn(scriptsQuery);
}

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

exports.parseScriptSearchQuery = function(scriptsQuery, query) {
  var q = unescape(query);
  var partialWordMatchFields = ['name', 'author', 'about', 'meta.description'];
  var fullWordMatchFields = ['meta.include', 'meta.match'];
  scriptsQuery.find({
    '$or': parseSearchConditions(q, partialWordMatchFields, fullWordMatchFields)
  });
}