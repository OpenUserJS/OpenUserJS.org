// peg grammar for parsing the OpenUserJS metadata block

/*
Test the generated parser with some input for peg.js site at https://pegjs.org/online:

// ==OpenUserJS==
// @author          Marti
// @collaborator    sizzle
// @unstableMinify  Some reason
// @name            RFC 2606§3 - Hello, World!
// @name:es         ¡Hola mundo!
// @name:fr         Salut tout le monde!
// @description     Test values with known UserScript metadata keys.
// @description:es  Prueba de valores con UserScript metadatos llaves conocidas.
// @description:fr  Valeurs d'essai avec des clés de métadonnées UserScript connues.
// @version       1.2.3
// @license       GPL version 3 or any later version; http://www.gnu.org/copyleft/gpl.html
// @licence       (CC); https://creativecommons.org/licenses/by-nc-sa/3.0/
// @copyright     2013+, OpenUserJS Group (https://github.com/orgs/OpenUserJs/people)
// ==/OpenUserJS==

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
  '// ==OpenUserJS==\n'
  lines:line*
  '// ==/OpenUserJS==' ('\n'?)
  {
    return lines;
  }

line =
  '// @'
  data:
    (
      item1 /
      items1 /
      item1Localized
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
      'author' /
      'unstableMinify' /
      'version'
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
      'collaborator' /
      'license' /
      'licence' /
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
