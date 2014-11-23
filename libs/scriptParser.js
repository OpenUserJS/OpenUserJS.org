exports.userscriptHeaderRegex = /^(?:\uFEFF)?\/\/ ==UserScript==([\s\S]*?)^\/\/ ==\/UserScript==/m;

// Modified from Count Issues (http://userscripts.org/scripts/show/69307)
// By Marti Martz (http://userscripts.org/users/37004)
function parseMeta(aString, aNormalize) {
  var rLine = /\/\/ @(\S+)(?:\s+(.*))?/;
  var headers = {};
  var name = null;
  var prefix = null;
  var key = null;
  var value = null;
  var line = null;
  var lineMatches = null;
  var lines = {};
  var uniques = {
    'description': true,
    'icon': true,
    'name': true,
    'namespace': true,
    'version': true,
    'oujs:author': true
  };
  var unique = null;
  var one = null;
  var matches = null;

  lines = aString.split(/[\r\n]+/).filter(function (aElement, aIndex, aArray) {
    return (aElement.match(rLine));
  });

  for (line in lines) {
    var header = null;

    lineMatches = lines[line].replace(/\s+$/, '').match(rLine);
    name = lineMatches[1];
    value = lineMatches[2];
    if (aNormalize) {
      // Upmix from...
      switch (name) {
        case 'homepage':
        case 'source':
        case 'website':
          name = 'homepageURL';
          break;
        case 'defaulticon':
        case 'iconURL':
          name = 'icon';
          break;
        case 'licence':
          name = 'license';
          break;
      }
    }
    name = name.split(/:/).reverse();
    key = name[0];
    prefix = name[1];
    if (key) {
      unique = {};
      if (prefix) {
        if (!headers[prefix]) {
          headers[prefix] = {};
        }
        header = headers[prefix];
        if (aNormalize) {
          for (one in uniques) {
            matches = one.match(/(.*):(.*)$/);
            if (uniques[one] && matches && matches[1] === prefix) {
              unique[matches[2]] = true;
            }
          }
        }
      } else {
        header = headers;
        if (aNormalize) {
          for (one in uniques) {
            if (uniques[one] && !/:/.test(one)) {
              unique[one] = true;
            }
          }
        }
      }
      if (!header[key] || aNormalize && unique[key]) {
        header[key] = value || '';
      } else if (!aNormalize || header[key] !== (value || '')
          && !(header[key] instanceof Array && header[key].indexOf(value) > -1)) {
        if (!(header[key] instanceof Array)) {
          header[key] = [header[key]];
        }
        header[key].push(value || '');
      }
    }
  }
  return headers;
}
exports.parseMeta = parseMeta;



var getMeta = function (aChunks, aCallback) {
  // We need to convert the array of buffers to a string to
  // parse the header. But strings are memory inefficient compared
  // to buffers so we only convert the least number of chunks to
  // get the user script header.
  var str = '';
  var i = 0;
  var len = aChunks.length;
  var header = null;

  for (; i < aChunks.length; ++i) {
    header = null;
    str += aChunks[i];
    header = exports.userscriptHeaderRegex.exec(str);

    if (header && header[1]) { return aCallback(parseMeta(header[1], true)); }
  }

  aCallback(null);
};
exports.getMeta = getMeta;
