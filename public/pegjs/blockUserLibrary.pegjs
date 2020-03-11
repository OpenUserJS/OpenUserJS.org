// peg grammar for parsing the UserLibrary metadata block

/*
Test the generated parser with some input for peg.js site at https://pegjs.org/online:

// ==UserLibrary==
// @name            RFC 2606§3 - Hello, World!
// @name:es         ¡Hola mundo!
// @name:fr         Salut tout le monde!
// @description     Test values with known UserScript metadata keys.
// @description:es  Prueba de valores con UserScript metadatos llaves conocidas.
// @description:fr  Valeurs d'essai avec des clés de métadonnées UserScript connues.
// @copyright     2013+, OpenUserJS Group (https://github.com/orgs/OpenUserJs/people)
// @license       CC-BY-NC-SA-4.0; https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode
// @licence       GPL-3.0; http://www.gnu.org/licenses/gpl-3.0.txt
// @version       1.2.3
// ==/UserLibrary==

*/

{
  var upmix = function (aKeyword) {
    // Keywords need to mirrored in the below rules for detection and transformation
    switch (aKeyword) {
      case 'licence':
        aKeyword = 'license';
        break;
    }

    return aKeyword;
  }
}

block =
  '// ==UserLibrary==\n'
  lines:line*
  '// ==/UserLibrary==' ('\n'?)
  {
    return lines;
  }

line =
  '// @'
  data:
    (
      item1 /
      item1Localized /

      items1
    )
  '\n'?
  {
    return data;
  }

whitespace = [ \t\n]+
non_whitespace = $[^ \t\n]+
non_newline = $[^\n]+

item1 =
  keyword:
    (
      'version'
    )
  whitespace
  value: non_newline
  {
    return {
      unique: true,

      key: upmix(keyword),
      value: value.trim()
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
      value: value.trim()
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
      'license' /
      'licence' /
      'copyright'
    )
  whitespace
  value: non_newline
  {
    return {
      key: upmix(keyword),
      value: value.trim()
    };
  }
