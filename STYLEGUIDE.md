
# OpenUserJS.org Style Guide

### Preliminary Notes

Many of these conventions are influenced by **Douglas Crockford**'s *[Code Conventions for the JavaScript Programming Language][codeconventions]*.

The long-term value of software to an organization is in direct proportion to the quality of the codebase. Over its lifetime, a program will be handled by many pairs of hands and eyes. If a program is able to clearly communicate its structure and characteristics, it is less likely that it will break when modified in the never-too-distant future.

Code conventions can help in reducing the brittleness of programs.

All of our JavaScript code is sent directly to the public. It should always be of publication quality.

Neatness counts.

**Always use `'use strict';` in all .js files**

Current ECMAScript 5 is implemented and supported at this time. This may change eventually to some ECMAScript 6 from the finalization that occurred in June of 2015.

---

### EditorConfig

To help with the above rules, we use [EditorConfig][editorconfig]. Install the plugin for your text-editor or IDE.

---

### Variable Declarations

All variables should be declared before used. JavaScript does not require this by default, but doing so makes the program easier to read and makes it easier to detect undeclared variables that may become implied globals. Implied global variables should never be used.
Variable declarations without value should be initialized to `null`

All variable statements should be the first statements within the function body.

Each variable declaration should be separate, on its own line, e.g.,
```javascript
var baz = 'meep';
var foo = true;
var qux = 50;
```

Some ECMAScript5.x JavaScript implementations do not have block scope, so defining variables in blocks can confuse programmers who are not experienced with other C family languages. Define all variables at the top of the function.

Use of global variables should be minimized. Implied global variables should never be used.

---

### Function Declarations

All functions should be declared, before they are used, after the variable declarations.

* There should be no space between the name of a function and the left-parenthesis of its parameter list.
* There should be one space between the right-parenthesis and the left-curly-brace that begins the statement body.
* The body itself is indented two spaces.
* The right-curly-brace is aligned with the line containing the beginning of the function declaration.
* Declared parameter lists variables should start with a lower case a, which stands for argument, and continue with [camel casing][camelcase] *(except if the phrase is an acronym like HTML)*.

```javascript
function outer(aC, aD) {
  var e = aC * aD;

  function inner(aA, aB) {
    return (e * aA) + aB;
  }

  return inner(0, 1);
}
```

When a function is to be invoked immediately, the entire invocation expression should be wrapped in parenthesis so that it's clear that the value being produced is the result of the function being invoked and not the function itself.

```javascript
var collection = (function () {
  /* code here */
}());
```

If a function literal is anonymous, there should be one space between the word `function` and the left-parenthesis.
If the space is omitted, then it can appear that the function's name is `function`, which is incorrect.

```javascript
div.onclick = function (aE) {
  return false;
};

that = {
  method: function () {
    return this.datum;
  },
  datum: 0
};
```

---

### JavaScript Files

JavaScript programs should be stored in and delivered as `.js` files.

JavaScript code should not be embedded in HTML files unless the code is specific to a single session.
Code in HTML adds significantly to pageweight with no opportunity for mitigation by caching and compression.

`<script src="filename.js">` tags should be placed as late in the `<body>` as possible.
This reduces the effects of delays imposed by script loading on other page components.
There is no need to use the *language* or *type* attributes. It is the server, not the script tag, that determines the MIME type.

---

### Indentation & White Space

The unit of indentation is two spaces.

* Lines should not have trailing white space.
* Files should contain exactly one newline at the end.
* Blank lines improve readability by setting off sections of code that are logically related.

Blank spaces should be used in the following circumstances:
* A keyword followed by a left-parenthesis should be separated by a space.
* A blank space should not be used between a function value and its left-parenthesis. This helps to distinguish between keywords and function invocations.
* All binary operators except period, left-parenthesis, and left-bracket should be separated from their operands by a space.
* No space should separate a unary operator and its operand except when the operator is a word such as `typeof`
* Each semi-colon in the control part of a `for` statement should be followed with a space.
* Whitespace should follow every comma except when adding a newline

---

### Line Length

Avoid lines longer than 100 characters. When a statement will not fit on a single line, it may be necessary to break it.
Place the break after an operator, ideally after a comma. A break after an operator decreases the likelihood that a copy-paste error will be masked by semicolon insertion.
The next line should be indented 2 spaces more than the previous line on a line-break.

---

### Comments

Be generous with comments. It is useful to leave information that will be read at a later time by people *(possibly yourself)* who will need to understand what you have done.
The comments should be well-written and clear, just like the code they are annotating. An occasional nugget of humor might be appreciated. Frustrations and resentments will not.

It is important that comments be kept up-to-date. Erroneous comments can make programs even harder to read and understand.

Make comments meaningful. Focus on what is not immediately obvious. Don't waste the reader's time with stuff like
```javascript
var i = 0; // set i to zero.
```

Instead, add comments that clarify what a line or block of code is doing, if not already obvious.

Generally, use line comments. Save block comments for formal documentation and for commenting out.

---

### Naming

**Variable and function names should be clearly descriptive of what they contain, in the context of the application**.

Names should be formed from the 26 upper and lower case letters *(A-Z, a-z)*, the 10 digits _(0-9)_, and the underscore *(_)*.
Avoid use of international characters because they may not read well or be understood everywhere and may cause [BOM][wikipediaBOM]s to appear. Do not use the dollar sign *($)* or backslash *(\)* in names.

Do not use an underscore *(_)* as the first character of a name. It is sometimes used to indicate privacy, but it does not actually provide privacy.
If privacy is important, use the forms that provide private members. Avoid conventions that demonstrate a lack of competence.

Normal variables and functions should be [camel-case][camelcase] *(a.k.a interCaps)*, starting with a lower-case letter.

Constructor functions which must be used with the new prefix should start with a capital letter.
JavaScript issues neither a compile-time warning nor a run-time warning if a required `new` is omitted. Bad things can happen if `new` is not used, so the capitalization convention is the only defense we have.

Global variables should be in all caps. *(JavaScript does not have macros or constants, so there isn't much point in using all caps to signify features that JavaScript doesn't have.)*

Variables that contain regular expressions should begin with `r` and be camel-cased *(except if the phrase is an acronym like HTML)*.
```javascript
var rSelector = /^\*|^\.[a-z][\w\d-]*|^#[^ ]+|^[a-z]+|^\[a-z]+/i;   // matches a CSS selector
var rHTML = /<[^>]+>/;                                              // matches a string of HTML
```

Declared parameter lists variables should start with a lower case a, which stands for argument, and continue with [camel casing][camelcase] *(except if the phrase is an acronym like HTML)*.

```javascript
function foo(aName, aValue) {
}
```

---

### Statements

#### Simple Statements

Each line should contain, at most, one statement. Put a semi-colon at the end of every simple statement.
Note that an assignment statement, which is assigning a function literal or object literal, is still an assignment statement and must end with a semicolon.

JavaScript allows any expression to be used as a statement. This can mask some errors, particularly in the presence of semi-colon insertion.
The only expressions that should be used as statements are assignments and invocations.

#### Compound Statements

Compound statements are statements that contain lists of statements enclosed in curly braces `{ }`.

* The enclosed statements should be indented two more spaces.
* The left-curly-brace should be at the end of the line that begins the compound statement.
* The right-curly-brace should begin a line and be indented to align with the beginning of the line containing the matching left-curly-brace.
* Braces should be used around all statements, even single statements, when they are part of a control structure, such as an `if` or `for` statement. This makes it easier to add statements without accidentally introducing bugs.

#### return Statement

A `return` statement with a value should not use parentheses around the value.
The return value expression must start on the same line as the `return` keyword in order to avoid semi-colon insertion.

#### if Statement

The `if` class of statements should have the following form:

```javascript
if (condition) {
  /* statements */
}

if (condition) {
  /* statements */
} else {
  /* statements */
}

if (condition) {
  /* statements */
} else if (condition) {
  /* statements */
} else {
  /* statements */
}
```

#### for Statement

A for class of statements should have the following form:

```javascript
for (initialization; condition; update) {
  /* statements */
}

for (variable in object) {
  if (filter) {
    /* statements */
  }
}
```

The first form should be used with arrays and with loops of a predeterminable number of iterations.

The second form should be used with objects. Be aware that members that are added to the prototype of the object will be included in the enumeration.
It is wise to program defensively by using the `hasOwnProperty` method to distinguish the true members of the object.

#### while Statement

A `while` statement should have the following form:

```javascript
while (condition) {
  /* statements */
}
```

#### do Statement

A `do` statement should have the following form:

```javascript
do {
  /* statements */
} while (condition);
```

Unlike the other compound statements, the `do` statement always ends with a semi-colon.

#### switch Statement

A `switch` statement should have the following form:

```javascript
switch (expression) {
  case expression1:
    /* statements */
    // fallthrough
  case expression2:
    /* previously declared `// fallthrough` statements */
    break;
  case expression3:
  case expression4:
  case expressionNth:
    /* statements */
    break;
  default:
    /* default statements */
}
```

Each logical grouping of statements *(except the default)* should end with `// fallthrough`, `break`, `return`, or `throw`. **NOTE: Complex conditionaling may sometimes be better described with an `if...else` or other ECMAScript syntax for readability purposes.**

#### try Statement

The `try` class of statements should have the following form:

```javascript
try {
  /* statements */
} catch (variable) {
  /* statements */
}

try {
  /* statements */
} catch (variable) {
  /* statements */
} finally {
  /* statements */
}
```

---

### Literals

* Use `{}` instead of `new Object()`
* Use `[]` instead of `new Array()`
* Use `/foo/` instead of `new RegExp('foo')` except where the latter is necessary

Use arrays when the member names would be sequential integers.
Use objects when the member names are arbitrary strings or names.

---

### Assignment Expressions

Avoid doing assignments in the condition part of `if` and `while` statements.

is `if (a = b) {` intentional? Or was `if (a == b) {` intended?
Avoid forms that are indistinguishable from common errors.

---

### Comma Operator

Avoid the use of the comma operator, except for very disciplined use, in the control part of `for` statements.

### Comma Separator

Object literals, array literals, and parameter lists should not have a trailing comma on the last item.

---

### === and !== Operators

It is almost always better to use the `===` and `!==` operators.
The `==` and `!=` operators do [type coercion][typecoercion] and can produce unexpected results.

---

### Confusing Pluses and Minuses

Be careful to not follow a `+` with `+` or `++`. This pattern can be confusing.
Insert parenthesis between them to make your intention clear.

```javascript
total = subtotal + +myInput.value;
```

is better written as

```javascript
total = subtotal + (+myInput.value);
```

so that the `+ +` is not misread as `++`

---

### Restrictions

The following is **strongly** recommended:
* When creating a class or id value try to use a dash instead of underscores and of course camel casing *(a.k.a. interCaps)*.

The following **may not** be used:
* Coffee scripts are prohibited from pull requests.
* Lowercase UTF-8 character encoding assignment... always use uppercase as per [IETF][IETFRFC3629S4].
* implied global variables *([read more][impliedglobals])*
* `eval()`
* `Function` constructor (it uses `eval()`)
* `with()` *(it can be highly inconsistent)*
* `Promise` *(unpredictable and considered unstable in some browser implementations at this time. Utilize callback structure with some standards of receiving `function optionalName(aArg1, aArg2, ..., aCallback)` and sending `function optionalName(aCallback, aArg1, aArg2, ...)` signatures for use with internal Code styling and async package including possible `aErr` argument parameter)*

Do not pass strings to `setTimeout` or `setInterval`. They use `eval()`. If you're trying to force a server side function to run asynchronously use [`setImmediate`][nodejsTimersSetImmediate] *(or [`process.nextTick`][nodejsProcessProcessnextTick] if you really know what you're doing)*.

`parseInt()` must be used with a radix parameter, e.g.,
```javascript
var i = parseInt(num, 10); // base 10 - decimal system
```

Read more on the [awful parts of JavaScript][awfulparts].

[nodejsProcessProcessnextTick]: https://nodejs.org/api/process.html#process_process_nexttick_callback_arg
[nodejsTimersSetImmediate]: http://nodejs.org/api/timers.html#timers_setimmediate_callback_arg
[wikipediaBOM]: https://www.wikipedia.org/wiki/Byte_order_mark
[IETFRFC3629S4]: http://tools.ietf.org/html/rfc3629#section-4
[awfulparts]: http://archive.oreilly.com/pub/a/javascript/excerpts/javascript-good-parts/awful-parts.html
[camelcase]: https://www.wikipedia.org/wiki/CamelCase
[codeconventions]: http://javascript.crockford.com/code.html
[editorconfig]: http://editorconfig.org/
[impliedglobals]: http://www.adequatelygood.com/Finding-Improper-JavaScript-Globals.html
[typecoercion]: http://webreflection.blogspot.com/2010/10/javascript-coercion-demystified.html
