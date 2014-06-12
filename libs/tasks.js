var defaultOnErrFn = console.log;

var onErr = function(err, onErrFn) {
  if (onErrFn)
    onErrFn(err);
  else
    defaultOnErrFn(err);
};

exports.countTask = function(modelListQuery, dict, key, onErrFn) {
  return function (callback) {
    modelListQuery.model.count(modelListQuery._conditions, function(err, modelListCount){
      if (err) {
        onErr(err, onErrFn);
        callback();
      } else {
        dict[key] = modelListCount;
        callback();
      }
    });
  };
};

exports.execQueryTask = function(query, dict, key, onErrFn) {
  return function (callback) {
    query.exec(function(err, result){
      if (err) {
        onErr(err, onErrFn);
        callback();
      } else {
        dict[key] = result
        callback();
      }
    });
  };
};
