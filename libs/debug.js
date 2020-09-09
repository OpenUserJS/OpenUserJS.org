'use strict';

var fs = require('fs');
var os = require('os');

var git = require('git-rev-sync');

var pkg = require('../package.json');
pkg.org = pkg.name.substring(0, pkg.name.indexOf('.'));

var isPro = process.env.NODE_ENV === 'production';
var isDev = !isPro;
var isDbg = typeof v8debug === 'object';

var isSecure = null;
var privkey = null;
var fullchain = null;
var chain = null;


var uaOUJS = null;
var hash = null;


try {
  // Check for primary keys
  privkey = './keys/private.key';
  fullchain = './keys/cert.crt';
  chain = './keys/intermediate.crt';

  fs.accessSync(privkey, fs.constants.F_OK);
  fs.accessSync(fullchain, fs.constants.F_OK);
  fs.accessSync(chain, fs.constants.F_OK);

  exports.privkey = privkey;
  exports.fullchain = fullchain;
  exports.chain = chain;
  exports.isSecured = true;

} catch (aE) {
  // Check for backup alternate keys
  try {
    privkey = './keys/privkey.pem';
    fullchain = './keys/fullchain.pem';
    chain = './keys/chain.pem';

    fs.accessSync(privkey, fs.constants.F_OK);
    fs.accessSync(fullchain, fs.constants.F_OK);
    fs.accessSync(chain, fs.constants.F_OK);

    exports.privkey = privkey;
    exports.fullchain = fullchain;
    exports.chain = chain;
    exports.isSecured = true;

  } catch (aE) {
    // Ensure that all items are nulled or equivalent
    exports.privkey = null;
    exports.fullchain = null;
    exports.chain = null;
    exports.isSecured = false;
  }
}

exports.isPro = isPro;
exports.isDev = isDev;
exports.isDbg = isDbg;


hash = git.short(); // NOTE: Synchronous
uaOUJS = pkg.org + '/' + pkg.version
  + ' (' + os.type() + '; ' + os.arch() + '; rv:' + hash + ') '
    + 'OUJS/20131106 ' + pkg.name + '/' + hash;
exports.uaOUJS = uaOUJS;


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
