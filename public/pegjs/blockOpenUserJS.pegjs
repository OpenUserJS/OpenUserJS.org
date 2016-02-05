// PEG grammar for parsing the OpenUserJS metadata block

/*
Test the generated parser with some input for PEG.js site at http://pegjs.org/online:

// ==OpenUserJS==
// @author          Marti
// @collaborator    sizzle
// @unstableMinify  Some reason
// ==/OpenUserJS==

*/

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
  key:
    (
      'author' /
      'unstableMinify'
    )
  whitespace
  value: non_newline
  {
    return {
      unique: true,

      key: key,
      value: value.replace(/\s+$/, '')
    };
  }

items1 =
  key:
    (
      'collaborator'
    )
  whitespace
  value: non_newline
  {
    return {
      key: key,
      value: value.replace(/\s+$/, '')
    };
  }
