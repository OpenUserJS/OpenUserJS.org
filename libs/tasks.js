'use strict';

var defaultOnErrFn = console.log;

var onErr = function (aErr, aOnErrFn) {
  if (aOnErrFn) {
    aOnErrFn(aErr);
  } else {
    defaultOnErrFn(aErr);
  }
};

exports.countTask = function (aModelListQuery, aDict, aKey, aOnErrFn) {
  return function (aCallback) {
    aModelListQuery.model.count(aModelListQuery._conditions, function (aErr, aModelListCount) {
      if (aErr) {
        onErr(aErr, aOnErrFn);
        aCallback();
      } else {
        aDict[aKey] = aModelListCount;
        aCallback();
      }
    });
  };
};

exports.execQueryTask = function (aQuery, aDict, aKey, aOnErrFn) {
  return function (aCallback) {
    aQuery.exec(function (aErr, result) {
      if (aErr) {
        onErr(aErr, aOnErrFn);
        aCallback();
      } else {
        aDict[aKey] = result;
        aCallback();
      }
    });
  };
};
