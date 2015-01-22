'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var countTask = require('../libs/tasks').countTask;
var helpers = require('../libs/helpers');
var modelParser = require('../libs/modelParser');
var _ = require('underscore');

var paginateTemplate = function (aOpts) {
  // Required
  var currentPage = aOpts.currentPage;
  var lastPage = aOpts.lastPage;
  var urlFn = aOpts.urlFn;

  // Optional
  var distVisible = aOpts.distVisible || 4;
  var firstVisible = aOpts.firstVisible || true;
  var lastVisible = aOpts.firstVisible || true;
  var soleVisible = aOpts.soleVisible || false;

  if (!soleVisible && lastPage === 1) {
    return null;
  }

  var linkedPages = [];

  for (var i = Math.max(1, currentPage - distVisible); i <= Math.min(currentPage + distVisible, lastPage); i++)
    linkedPages.push(i);

  if (firstVisible && linkedPages.length > 0 && linkedPages[0] !== 1)
    linkedPages.splice(0, 0, 1); // insert the value 1 at index 0

  if (lastVisible && linkedPages.length > 0 && linkedPages[linkedPages.length - 1] !== lastPage)
    linkedPages.push(lastPage);

  if (linkedPages.length === 0) {
    return null;
  }

  var html = '';
  html += '<ul class="pagination">';
  for (var i = 0; i < linkedPages.length; i++) {
    var linkedPage = linkedPages[i];
    html += '<li';
    if (linkedPage === currentPage)
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

var newPagination = function (aCurrentPage, aItemsPerPage) {
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
  pagination.applyToQuery = function (aModelListQuery) {
    pagination.startIndex = (pagination.currentPage * pagination.itemsPerPage) - pagination.itemsPerPage;
    aModelListQuery
      .skip(pagination.startIndex)
      .limit(pagination.itemsPerPage);
  };
  pagination.getCountTask = function (aModelListQuery) {
    return countTask(aModelListQuery, pagination, 'numItems');
  };
  pagination.render = function () {
    return paginateTemplate(pagination);
  };

  //
  pagination.currentPage = aCurrentPage ? helpers.limitMin(1, aCurrentPage) : 1;
  pagination.itemsPerPage = aItemsPerPage ?
    helpers.limitRange(1, aItemsPerPage, maxItemsPerPage, defaultItemsPerPage) :
    defaultItemsPerPage;

  return pagination;
};
exports.newPagination = newPagination;

var getDefaultPagination = function (aReq) {
  var pagination = newPagination(aReq.query.p, aReq.query.limit);
  pagination.renderDefault = function (aReq) {
    pagination.lastPage = Math.ceil(pagination.numItems / pagination.itemsPerPage) || 1;
    pagination.urlFn = function (aPage) {
      return helpers.setUrlQueryValue(aReq.url, 'p', aPage);
    };
    return pagination.render();
  };
  return pagination;
};
exports.getDefaultPagination = getDefaultPagination;

exports.statusCodePage = function (aReq, aRes, aNext, aOptions) {
  var authedUser = aReq.session ? aReq.session.user : null;

  //
  aOptions.statusCode = aOptions.statusCode || 500;
  aOptions.statusMessage = aOptions.statusMessage || 'Error';

  // Session
  authedUser = aOptions.authedUser = modelParser.parseUser(authedUser);
  aOptions.isMod = authedUser && authedUser.isMod;
  aOptions.isAdmin = authedUser && authedUser.isAdmin;

  // Page metadata
  pageMetadata(aOptions, [aOptions.statusCode, aOptions.statusMessage], aOptions.statusMessage);

  //---
  aRes.status(aOptions.statusCode).render('pages/statusCodePage', aOptions);
};

// Add page metadata, containing title, description and keywords.
function pageMetadata(aOptions, aTitle, aDescription, aKeywords) {
  var titles = ['OpenUserJS'];
  if (typeof (aTitle) === "string" && aTitle !== "") {
    titles.unshift(aTitle);
  } else if (_.isArray(aTitle)) {
    titles = aTitle.concat(titles);
  }
  aOptions.title = titles.join(' | ');

  aOptions.pageMetaDescription = 'Download userscripts to enhance your browser.';
  if (typeof (aDescription) !== "undefined" && aDescription !== null) {
    aOptions.pageMetaDescription = aDescription;
  }

  var pageMetaKeywords = [
    'userscript',
    'userscripts',
    'user script',
    'user scripts',
    'user.js',
    'repository',
    'Greasemonkey',
    'Greasemonkey Port',
    'Scriptish',
    'TamperMonkey',
    'Violent monkey',
    'JavaScript',
    'add-ons',
    'extensions',
    'browser'
  ];
  if (typeof (aKeywords) !== "undefined" && aKeywords !== null && _.isArray(aKeywords)) {
    pageMetaKeywords = _.union(pageMetaKeywords, aKeywords);
  }

  aOptions.pageMetaKeywords = pageMetaKeywords.join(', ');
}
exports.pageMetadata = pageMetadata;

// Switch order direction.
function orderDir(aReq, aOptions, aOrderBy, aOrderDirDefault) {
  var orderDirReverse = null;

  aOrderDirDefault = aOrderDirDefault || 'desc';
  orderDirReverse = (aOrderDirDefault === 'desc') ? 'asc' : 'desc';
  if (typeof (aOptions.orderDir) === 'undefined') {
    aOptions.orderDir = {};
  }
  aOptions.orderDir[aOrderBy] = aReq.query.orderDir === aOrderDirDefault ? orderDirReverse : aOrderDirDefault;
}
exports.orderDir = orderDir;
