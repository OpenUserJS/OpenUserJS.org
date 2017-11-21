'use strict';

var isPro = process.env.NODE_ENV === 'production';
var isDev = !isPro;
var isDbg = typeof v8debug === 'object';

exports.isPro = isPro;
exports.isDev = isDev;
exports.isDbg = isDbg;

// ES6+ in use to eliminate extra property
class statusError extends Error {
  constructor (aStatus, aCode) {
    super(JSON.stringify(aStatus, null, ' '));
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
    this.status = aStatus;
    this.code = aCode;
  }
}
exports.statusError = statusError;
