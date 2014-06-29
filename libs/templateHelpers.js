var countTask = require('../libs/tasks').countTask;
var helpers = require('../libs/helpers');
var modelParser = require('../libs/modelParser');
var _ = require('underscore');

var paginateTemplate = function (opts) {
  // Required
  var currentPage = opts.currentPage;
  var lastPage = opts.lastPage;
  var urlFn = opts.urlFn;

  // Optional
  var distVisible = opts.distVisible || 4;
  var firstVisible = opts.firstVisible || true;
  var lastVisible = opts.firstVisible || true;

  var linkedPages = [];

  for (var i = Math.max(1, currentPage - distVisible); i <= Math.min(currentPage + distVisible, lastPage); i++)
    linkedPages.push(i);

  if (firstVisible && linkedPages.length > 0 && linkedPages[0] != 1)
    linkedPages.splice(0, 0, 1); // insert the value 1 at index 0

  if (lastVisible && linkedPages.length > 0 && linkedPages[linkedPages.length - 1] != lastPage)
    linkedPages.push(lastPage);

  var html = '';
  html += '<ul class="pagination">';
  for (var i = 0; i < linkedPages.length; i++) {
    var linkedPage = linkedPages[i];
    html += '<li';
    if (linkedPage == currentPage)
      html += ' class="active"';
    html += '>';
    html += '<a href="';
    html += urlFn(linkedPage);
    html += '">';
    html += linkedPage;
    html += '</a>';
    html += '</li>';
  }
  html += '</ul>';
  return html;
};
exports.paginateTemplate = paginateTemplate;

var newPagination = function (currentPage, itemsPerPage) {
  // Options
  var maxItemsPerPage = 100;
  var defaultItemsPerPage = 25;

  //
  var pagination = {
    currentPage: null,
    itemsPerPage: null,
    startIndex: null,
    numItems: null
  };
  pagination.applyToQuery = function (modelListQuery) {
    pagination.startIndex = (pagination.currentPage * pagination.itemsPerPage) - pagination.itemsPerPage;
    modelListQuery
      .skip(pagination.startIndex)
      .limit(pagination.itemsPerPage);
  };
  pagination.getCountTask = function (modelListQuery) {
    return countTask(modelListQuery, pagination, 'numItems');
  };
  pagination.render = function () {
    return paginateTemplate(pagination);
  };

  //
  pagination.currentPage = currentPage ? helpers.limitMin(1, currentPage) : 1;
  pagination.itemsPerPage = itemsPerPage ? helpers.limitRange(1, itemsPerPage, maxItemsPerPage) : defaultItemsPerPage;

  return pagination;
};
exports.newPagination = newPagination;

var getDefaultPagination = function (req) {
  var pagination = newPagination(req.query.p, req.query.limit);
  pagination.renderDefault = function (req) {
    pagination.lastPage = Math.ceil(pagination.numItems / pagination.itemsPerPage) || 1;
    pagination.urlFn = function (p) {
      return helpers.setUrlQueryValue(req.url, 'p', p);
    };
    return pagination.render();
  };
  return pagination;
};
exports.getDefaultPagination = getDefaultPagination;

exports.statusCodePage = function (req, res, next, options) {
  var authedUser = req.session ? req.session.user : null;

  //
  options.statusCode = options.statusCode || 500;
  options.statusMessage = options.statusMessage || 'Error';

  // Session
  authedUser = options.authedUser = modelParser.parseUser(authedUser);
  options.isMod = authedUser && authedUser.isMod;
  options.isAdmin = authedUser && authedUser.isAdmin;

  // Page metadata
  pageMetadata(options, [options.statusCode, options.statusMessage], options.statusMessage);

  //---
  res.status(options.statusCode).render('pages/statusCodePage', options);
};

// Add page metadata, containing title, description and keywords.
function pageMetadata(options, title, description, keywords) {
  var titles = ['OpenUserJS'];
  if (typeof (title) === "string" && title !== "") {
    titles.unshift(title);
  } else if (_.isArray(title)) {
    titles = title.concat(titles);
  }
  options.title = titles.join(' | ');

  options.pageMetaDescription = 'Download userscripts to enhance your browser.';
  if (typeof (description) !== "undefined" && description !== null) {
    options.pageMetaDescription = description;
  }

  var pageMetaKeywords = ['userscript', 'userscripts', 'javascript', 'Greasemonkey', 'Scriptish',
    'Tampermonkey', 'extension', 'browser'];
  if (typeof (keywords) !== "undefined" && keywords !== null && _.isArray(keywords)) {
    pageMetaKeywords = _.union(pageMetaKeywords, keywords);
  }

  options.pageMetaKeywords = pageMetaKeywords.join(', ');
}
exports.pageMetadata = pageMetadata;
