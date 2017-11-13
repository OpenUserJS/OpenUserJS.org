// peg grammar for parsing the OpenUserJS metadata block

/*
Test the generated parser with some input for peg.js site at https://pegjs.org/online:

// ==OpenUserJS==
// @author          Marti
// @collaborator    sizzle
// @unstableMinify  Some reason
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
      'author' /
      'unstableMinify'
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

items1 =
  keyword:
    (
      'collaborator'
    )
  whitespace
  value: non_newline
  {
    return {
      key: upmix(keyword),
      value: value.replace(/\s+$/, '')
    };
  }
