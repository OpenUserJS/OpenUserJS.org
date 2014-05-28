
exports.countTask = function(modelListQuery, dict, key) {
  return function (callback) {
    modelListQuery.model.count(modelListQuery._conditions, function(err, modelListCount){
      if (err) {
        callback();
      } else {
        dict[key] = modelListCount;
        callback();
      }
    });
  };
};

exports.execQueryTask = function(query, dict, key) {
  return function (callback) {
    query.exec(function(err, result){
      if (err) {
        callback();
      } else {
        dict[key] = result
        callback();
      }
    });
  };
};
