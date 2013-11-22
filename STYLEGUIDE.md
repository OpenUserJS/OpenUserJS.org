# OpenUserJS.org Style Guide

When contributing code to the project, please adhere to the style guide as much as possible. Periodically, files may be reformatted to fit the style guide.

### Whitespace

- ALWAYS indent code levels with two spaces. Do not use tabs.
- Lines MUST NOT have trailing whitespace.
- Files MUST contain exactly one newline at the end.

To help with the above rules, we use [EditorConfig](http://editorconfig.org/). [Install the plugin for your editor](http://editorconfig.org/#download) and it will do it's thing.

- Use a single blank line between larger sections of code to improve readability.
- Surrround binary operators with one space.

```javascript
// Good.
someString = 'Hello ' + name + ', welcome!';

// Bad.
someString='Hello '+name+', welcome!';
```

- Put a single space after keywords (if, for, etc.) and between the closing paren and opening brace. Do not put spaces between the parens and condition.

```javascript
// Good.
if (condition) {
  // ...
}

// Bad.
if(condition){
  // ...
}

if( condition ){
  // ...
}
```

### Braces and brackets

- ALWAYS use braces. It removes ambiguity and allows for easy additions of code.
- Braces MUST go on the same line as the statement.

```javascript
// Good.
if (condition) {
  // ...
}

// Bad.
if (condition)
{
  // ...
}
```

### Semicolons

ALWAYS use semicolons to remove ambiguity. Relying on implicit insertion can cause subtle, hard to debug problems.

### Quotes

- Single quotes for JavaScript.
- Double quotes for CSS selectors.
- Double quotes for HTML attributes.

If using a quote breaks out of the string, escape it.

### Naming conventions

- Variables, functions, and methods use camelCase: `myChangingData`
- Constants use uppercase with underscores: `SOME_CONSTANT`
- Constructors use Pascal case: `MyModule`
- Booleans values use lowercase: `true`, `false`
- Regular expressions begin with `r`: `rMatchThat`
- Properly pluralize where needed:
  - `dog` is a string
  - `dogs` is an array of `dog` strings

Give reference names meaning; don't abbreviate to the point where it isn't clear what the reference name means. The only exception to this is a single iterator (`i`). If there is more then one iterator (nested loops), they should begin with `i` and describe the loop: `iDescribeIt`

```javascript
// Good.
function query(selector) {
  return document.querySelectorAll(selector);
}

var i,
  elements = [],
  foos = query('#foo');

for (i = 0; i < foos.length; i++) {
  elements.push(foos[i]);
}

// Bad.
function q(s) {
  return document.querySelectorAll(s);
}

var i,
  a = [],
  els = q('#foo');

for (i = 0; i < els.length; i++) {
  a.push(els[i]);
}
```

### Declarations
- Variables MUST be declared with a `var`.
- Variables SHOULD be declared as near to their use as possible. Keep in mind that variables get added to the scope of the function where they were declared.
- Variables MUST be declared exactly once per scope.
- Constants MUST be declared with a `var` keyword. Do not use `const`.
- Regular expressions SHOULD use the literal form wherever possible: `/foobar/g`. Use the RegExp constructor only when you need a dynamic match: `new RegExp('foo' + name + 'bar', 'g')`
- Variables and constants MUST be declared with one `var` keyword per statement:

```javascript
// Good.
var foo = '';
var bar = '';
var QUUX;

// Bad.
var foo = '',
  bar = '',
  QUUX;
```

### Type Checking

#### Actual Types

- String: `typeof variable === 'string'`
- Number: `typeof variable === 'number'`
- Boolean: `typeof variable === 'boolean'`
- Object: `typeof variable === 'object'`
- Array: `Array.isArray(arrayLikeObject)` wherever possible
- null: `variable === null`
- null or undefined: `variable == null`
- undefined: `typeof variable === 'undefined'`

#### Equality and inequality

Except in the case of *null or undefined* above, ALWAYS use strict equality when comparing values.

- Use `===` instead of `==`.
- Use `!==` instead of `!=`.

#### Coerced Types

Where a value might not be the format you expect, use explicit typing:

```javascript
var number = 1,
  string = '1',
  bool = false;

number;
// 1

String(number);
// '1'

string;
// '1'

Number(string)
// 1

bool;
// false

Number(bool);
// 0

String(bool);
// "false"
```

#### Truthy / Falsy

Wherever possible, evaluate *truthiness* or *falsiness* for conditions.

- Boolean values: `true`, `false`
- Truthy values: `'foo'`, `1`
- Falsy values: `''`, `0`, `null`, `undefined`, `NaN`, `void 0`

Evaluating that an array has length:
```javascript
// instead of this:
if (array.length > 0) ...

// ...evaluate truthiness, like this:
if (array.length) ...
```

Evaluating that an array is empty:
```javascript
// instead of this:
if (array.length === 0) ...

// ...evaluate truthiness, like this:
if (!array.length) ...
```

Evaluating that a string is not empty:
```javascript
// instead of this:
if (string !== '') ...

// ...evaluate truthiness, like this:
if (string) ...
```

Evaluating that a string *is* empty:
```javascript
// instead of this:
if (string === '') ...

// ...evaluate falsiness, like this:
if (!string) ...
```

Evaluating that a reference is `true`:
```javascript
// instead of this:
if (foo === true) ...

// ...evaluate like you mean it, take advantage of built in capabilities:
if (foo) ...
```

Evaluating that a reference is `false`:
```javascript
// instead of this:
if (foo === false) ...

// ...use negation to coerce a true evaluation:
if (!foo) ...

// ...Be careful, this will also match: 0, '', null, undefined, NaN
// If you MUST test for a boolean false, then use:
if (foo === false) ...
```

## Comments

Comment where it is not immediately obvious what a block of code will do. Be generous, but not to the point where there is a commet every other line. If code requires lots of commmets, consider refactoring instead to make it more clear.

- JavaScript and CSS comments use `// ...` for single lines, and `/* ... */` for blocks.
- HTML comments use `<!-- ... -->` for both single lines and blocks.
- Comments SHOULD be written in English and be as clear as possible.
- Comments MUST appear above the code you are commenting on:

```javascript
// Good.

// Some description of foo.
var foo = doSomething();

// Bad.

var foo = doSomething(); // Some description of foo.

```

## Commits

- Branches SHOULD be created using the issue number: `issue-123`
- Commit messages SHOULD be present tense: fix, change, add, create. Word it as if you were asked "What will that commit do?" It will `change something for some reason`.
- Commits SHOULD be relevant to a single topic. Don't put code refactoring and new features together in one commit, or even together in a branch if at all possible.
- Where commits have a related issue, you SHOULD reference them in the commit message: `Fixes #123` or `Refs #123`. If you forget, reference the commit SHA on the issue so that it can be tracked easier.
