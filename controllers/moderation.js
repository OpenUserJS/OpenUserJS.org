var modelsList = require('../libs/modelsList');

exports.flagged = function (req, res, next) {
  var user = req.session.user;
  var type = req.route.params.shift() || 'users';
  var baseUrl = '/flagged' + (type ? '/' + type : '');
  var options = { title: 'Flagged Content', moderation: true, 
    username: user ? user.name : '' };

  options[type + 'Type'] = true;

  if (!user || user.role > 3) { return next(); }

  switch (type) {
  case 'users':
    if (!req.route.params[1]) { 
      req.route.params[1] = ['flags'];
    }

    modelsList.listUsers({ flagged: true }, req.route.params, baseUrl,
      function (usersList) {
        options.usersList = usersList;
        res.render('flagged', options);
    });
    break;
  case 'scripts':
    if (!req.route.params[1]) { 
      req.route.params[1] = ['flags', 'updated'];
    }

    modelsList.listScripts({ flagged: true, isLib: null },
      req.route.params, baseUrl,
      function (scriptsList) {
        options.scriptsList = scriptsList;
        res.render('flagged', options);
    });
    break;
  default:
    next();
  }
};

exports.graveyard = function (req, res, next) {
  var contentTypes = {
    'users' :
    { 
      'name': 'User',
      'selected': false,
    }, 
    'scripts':
    {
      'name': 'Script',
      'selected': false
    }
  };
  var user = req.session.user;
  var type = req.route.params.shift() || 'users';
  var baseUrl = '/graveyard' + (type ? '/' + type : '');
  var contentType = contentTypes[type];
  var options = { title: 'The Graveyard', username: user ? user.name : '' };

  if (!contentType || !user || user.role > 3) { return next(); }

  modelsList.listRemoved({ model: contentType.name }, req.route.params, baseUrl,
    function (removedList) {
      var type = null;
      var name = null;
      contentType.selected = true;
      options.removedList = removedList;
      options.contentTypes = [];
      options[contentType.name] = true;

      for (name in contentTypes) {
        type = contentTypes[name];
        type.url = '/graveyard/' + name;
        type.name += 's';
        options.contentTypes.push(type);
      }
      options.contentTypes[options.contentTypes.length - 1].last = true;
      
      res.render('graveyard', options);
    });
};
