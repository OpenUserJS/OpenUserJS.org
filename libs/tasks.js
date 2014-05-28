
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
