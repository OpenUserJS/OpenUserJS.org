'use strict';

var isPro = process.env.NODE_ENV === 'production';
var isDev = !isPro;
var isDbg = typeof v8debug === 'object';

exports.isPro = isPro;
exports.isDev = isDev;
exports.isDbg = isDbg;
