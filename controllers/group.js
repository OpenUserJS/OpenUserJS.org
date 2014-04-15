var Group = require('../models/group').Group;

exports.search = function (req, res) {
  var queryStr = '';
  var queryRegex = null;
  var terms = req.route.params.term
    .replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1').split(/\s+/);

  terms.forEach(function (term) {
    queryStr += '(?=.*?' + term  + ')';
  });
  queryRegex = new RegExp(queryStr, 'i');

  Group.find({ name: queryRegex }, 'name', function (err, groups) {
    var results = null;
    if (err) { groups = []; }

    results = groups.map(function (group) {
      return group.name;
    });

    res.end(JSON.stringify(results));
  });
};
