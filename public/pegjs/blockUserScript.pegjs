// PEG grammar for parsing the UserScript metadata block

/*
Test the generated parser with some input for PEG.js site at http://pegjs.org/online:

// ==UserScript==
// @name            RFC 2606§3 - Hello, World!
// @name:es         ¡Hola mundo!
// @name:fr         Salut tout le monde!
// @namespace       http://localhost.localdomain
// @description     Test values with known UserScript metadata keys.
// @description:es  Prueba de valores con UserScript metadatos llaves conocidas.
// @description:fr  Valeurs d'essai avec des clés de métadonnées UserScript connues.
// @copyright     2013+, OpenUserJS Group (https://github.com/orgs/OpenUserJs/people)
// @license       GPL version 3 or any later version; http://www.gnu.org/copyleft/gpl.html
// @licence       (CC); http://creativecommons.org/licenses/by-nc-sa/3.0/
// @version       1.2.3
// @icon      http://example.com/favicon.ico
// @iconURL   http://example.com/faviconURL.ico
// @run-at    document-end
// @run-at    document-start
// @noframes
// @grant     GM_log
// @grant     none
// @homepageURL  http://example.com/foo/atHomepageURL1
// @homepage     http://example.com/foo/atHomepage2
// @website      http://example.com/foo/atSite3
// @source       http://example.com/foo/atSource4
// @downloadURL http://example.org/foo1.atDownloadURL.user.js
// @installURL  http://example.org/foo2.atInstallURL.user.js
// @downloadURL http://example.org/foo3.atDownloadURL.user.js
// @updateURL     http://example.org/foo1.atUpdateURL.meta.js
// @updateURL     http://example.org/foo2.atUpdateURL.meta.js
// @updateURL     http://example.org/foo3.atUpdateURL.meta.js
// @require   http://example.net/library1.js
// @require   http://example.net/library2.js
// @require   http://example.net/library3.js
// @resource    css http://example.net/library1.css
// @resource    peg http://example.net/grammar2.pegjs
// @resource    img http://example.net/image3.png
// @include   http://example.com/*
// @include   http://example.org/*
// @include   http://example.net/*
// @match       http://example.net/*
// @exclude   http://example.com/foo
// @exclude   http://example.org/foo
// ==/UserScript==

*/

{
  var upmix = function (aKeyword) {
    // Keywords need to mirrored in the below rules for detection and transformation
    switch (aKeyword) {
      case 'homepage':
      case 'source':
      case 'website':
        aKeyword = 'homepageURL';
        break;
      case 'defaulticon':
      case 'iconURL':
        aKeyword = 'icon';
        break;
      case 'licence':
        aKeyword = 'license';
        break;
      case 'installURL':
        aKeyword = 'downloadURL';
        break;
    }

    return aKeyword;
  }
}

block =
  '// ==UserScript==\n'
  lines:line*
  '// ==/UserScript==' ('\n'?)
  {
    return lines;
  }

line =
  '// @'
  data:
    (
      item0 /
      item1 /
      item1Localized /

      items1 /
      items2
    )
  '\n'?
  {
    return data;
  }

whitespace = [ \t\n]+
non_whitespace = $[^ \t\n]+
non_newline = $[^\n]+

item0 =
  keyword:
    (
      'unwrap' /
      'noframes'
    )
  {
    return {
      unique: true,

      key: upmix(keyword)
    };
  }

item1 =
  keyword:
    (
      'version' /
      'updateURL' /
      'supportURL' /
      'run-at' /
      'namespace' /
      'installURL' /
      'iconURL' /
      'icon64' /
      'icon' /
      'downloadURL' /
      'defaulticon'
    )
  whitespace
  value: non_newline
  {
    return {
      unique: true,

      key: upmix(keyword),
      value: value.replace(/\s+$/, '')
    };
  }

item1Localized =
  keyword:
    (
      'name' /
      'description'
    )
  locale: (':' localeValue:$[a-zA-Z-]+ {
    return localeValue;
  })?
  whitespace
  value: non_newline
  {
    var keywordUpmixed = upmix(keyword);

    var obj = {
      unique: true,

      key: keywordUpmixed,
      value: value.replace(/\s+$/, '')
    }

    if (locale) {
      obj.key += ':' + locale;
      obj.keyword = keywordUpmixed;
      obj.locale = locale;
    }

    return obj;
  }

items1 =
  keyword:
    (
      'website' /
      'source' /
      'require' /
      'match' /
      'license' /
      'licence' /
      'include' /
      'homepageURL' /
      'homepage' /
      'grant' /
      'exclude' /
      'copyright'
    )
  whitespace
  value: non_newline
  {
    return {
      key: upmix(keyword),
      value: value.replace(/\s+$/, '')
    };
  }

items2 =
  keyword:
    (
      'resource'
    )
  whitespace
  value1: non_whitespace
  whitespace
  value2: non_newline
  {
    var value2trimmed = value2.replace(/\s+$/, '');

    return {
      key: upmix(keyword),
      value: value1 + '\u0020' + value2trimmed,

      value1: value1,
      value2: value2trimmed
    };
  }
