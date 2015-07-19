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
  upmix = function (aKey) {
    // Keys need to mirrored in the below rules for detection and transformation
    switch (aKey) {
      case 'homepage':
      case 'source':
      case 'website':
        aKey = 'homepageURL';
        break;
      case 'defaulticon':
      case 'iconURL':
        aKey = 'icon';
        break;
      case 'licence':
        aKey = 'license';
        break;
      case 'installURL':
        aKey = 'downloadURL';
        break;
    }

    return aKey;
  }
}

// Uncomment to parse an entire metadata block for PEG.js site.
// e.g. for testing/development only

/*
block =
  '// ==UserScript==\n'
  lines:line*
  '// ==/UserScript==' ('\n'?)
  {
    return lines;
  }
*/


line =
  '// @'
  keyphrase:
    (
      keyphrase0 /
      keyphrase1 /
      keyphraseLocalized /

      keysphrase1 /
      keysphrase2 /
    )
  '\n'?
  {
    return keyphrase;
  }

whitespace = [ \t\n]+
non_whitespace = $[^ \t\n]+
non_newline = $[^\n]+

keyphrase0 =
  key:
    (
      'unwrap' /
      'noframes'
    )
  {
    var keyUpmixed = upmix(key);

    return {
      key: keyUpmixed,

      unique: true,
      keyword: keyUpmixed
    };
  }

keyphrase1 =
  key:
    (
      'version' /
      'updateURL' /
      'supportURL' /
      'run-at' /
      'namespace' /
      'installURL' /
      'iconURL' /
      'icon' /
      'downloadURL' /
      'defaulticon'
    )
  whitespace
  value: non_newline
  {
    var keyUpmixed = upmix(key);

    return {
      key: keyUpmixed,
      value: value,

      unique: true,
      keyword: keyUpmixed
    };
  }

keyphraseLocalized =
  key:
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
    var keyUpmixed = upmix(key);

    return {
      key: keyUpmixed,
      locale: locale,
      value: value,

      unique: true,
      keyword: keyUpmixed + (locale ? ":" + locale : '')
    };
  }

keysphrase1 =
  key:
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
    var keyUpmixed = upmix(key);

    return {
      key: keyUpmixed,
      value: value,

      keyword: keyUpmixed
    };
  }

keysphrase2 =
  key:
    (
      'resource'
    )
  whitespace
  value1: non_whitespace
  whitespace
  value2: non_newline
  {
    var keyUpmixed = upmix(key);

    return {
      key: keyUpmixed,
      value1: value1,
      value2: value2,

      keyword: keyUpmixed
    };
  }
