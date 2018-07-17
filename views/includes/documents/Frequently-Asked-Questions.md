## Frequently Asked Questions

In this FAQ here are some of the most common questions and answers asked, some more silently than others, about OpenUserJS.org.

### Q: With markdown why does my quoted text merge with my response?

A: Place two line breaks in between your quote and reply like this:

``` md
> Something to be quoted

This is my reply
```

which renders as:
> Something to be quoted

This is my reply

... instead of:

> Something to be quoted
This is my reply

### Q: How do I ensure the correct syntax highlighting of my code snippets?

A: Use markdown like these with named code fences:

Example 1:

<pre>
``` js
var thisIsJavascript = "yahoo!";
```
</pre>

... which renders as:
``` js
var thisIsJavascript = "yahoo!";
```

... instead of:

``` ebnf
var thisIsJavascript = "yahoo!";
```

Example 2:
<pre>
``` json
{"json": "rules"}
```
</pre>

... which renders as:
``` json
{"json": "rules"}
```

... instead of:
<pre>
{"json": "rules"}
</pre>

Example 3:
<pre>
``` css
body {
  background-color: black;
}
```
</pre>

... which renders as:

``` css
body {
  background-color: black;
}
```

... instead of:

<pre>
body {
  background-color: black;
}
</pre>

Example 4:

<pre>
``` console
userscript.html?id=01234567-89ab-cdef-0123-456789abcdef:4 ERROR: Execution of script 'My jQuery Script' failed! $(...).ready is not a function
(anonymous) @ userscript.html?id=01234567-89ab-cdef-0123-456789abcdef:3
(anonymous) @ userscript.html?id=01234567-89ab-cdef-0123-456789abcdef:5
(anonymous) @ userscript.html?id=01234567-89ab-cdef-0123-456789abcdef:983
```
</pre>

... which renders as:
``` console
userscript.html?id=01234567-89ab-cdef-0123-456789abcdef:4 ERROR: Execution of script 'My jQuery Script' failed! $(...).ready is not a function
(anonymous) @ userscript.html?id=01234567-89ab-cdef-0123-456789abcdef:3
(anonymous) @ userscript.html?id=01234567-89ab-cdef-0123-456789abcdef:5
(anonymous) @ userscript.html?id=01234567-89ab-cdef-0123-456789abcdef:983
```

... instead of:

```
userscript.html?id=01234567-89ab-cdef-0123-456789abcdef:4 ERROR: Execution of script 'My jQuery Script' failed! $(...).ready is not a function
(anonymous) @ userscript.html?id=01234567-89ab-cdef-0123-456789abcdef:3
(anonymous) @ userscript.html?id=01234567-89ab-cdef-0123-456789abcdef:5
(anonymous) @ userscript.html?id=01234567-89ab-cdef-0123-456789abcdef:983
```



The smaller the code snippet, or having a flawed Code snippet, the more likely it will automatically pick the wrong highlighting with unnamed code fences, **or worse no highlighting**... so it is best to recommend coercing a snippet to the correct type.

### Q: What is a good way to present a Code change to an Author?

1. Fork the persons script on their scripts Source Code page. This is the easiest way and you can refer to it in a discussion to help show what change you are proposing from the presentational view. Please do not post full script source in a discussion.

2. Use GitHub, or other [SCM][wikipediaSCM] that shows the change. Use a markdown hyperlink in the discussion to point to the commit.

3. If you have Linux or macOS you can utilize the `diff -u a.user.js b.user.js > change.diff` command line interface *(CLI)* directly. `a.user.js` being the original source code and `b.user.js` being the change. This will output a diff file that you can paste into a discussion.

4. Use [git-scm][gitSCM]. You could utilize `git diff file.original file.changed > change.diff`. Git Bash, usually included, should also give you the direct `diff` command under Windows *(similar to the `cmd` prompt terminology for Windows users)*. More detailed usage can be found at [git documentation][gitSCMdoc].

Take for example a simple `RFC 2606§3 - Hello, World!` script. Fixing any changes to the `file.changed` you could present the difference with a snippet in a code fence of type `diff` which renders like this:

Fix typo.

``` diff
diff --git "a/RFC_2606\302\2473_-_Hello,_World!.user.js.original" "b/RFC_2606\302\2473_-_Hello,_World!.user.js.changed"
index a8a6dcc..fdf7833 100644
--- "a/RFC_2606\302\2473_-_Hello,_World!.user.js.original"
+++ "b/RFC_2606\302\2473_-_Hello,_World!.user.js.changed"
@@ -7,6 +7,6 @@
 // @version       0.0.0
 // ==/UserScript==

-  alert('Helo, World!');
+  alert('Hello, World!');

 })();
```

... plus it automatically shows the starting line number within a few lines of where you are mentioning it. Simply count   up from the starting line in `@@ -7,6 +7,6 @@` to the line affected. In this samples case it is line 10 where the change is to occur, e.g. 7 + 3 = 10.

You should, at the very least, use a pair of markdown back ticks, e.g. <code>`</code>, around the Code change to ensure proper visibility especially if there is HTML present which normally gets sanitized and possibly rendered. Named Code fences allow for greater visual improvement and understanding.

### Q: Does OpenUserJS.org have meta?

A: Yes, use the meta routine.

Multiple forms exist for various purposes:

1. `.meta.js` - This is the traditional `// @` delimited usage that outputs **some** of the metadata blocks items from a userscript for updating in userscript engines such as [Greasemonkey][greasemonkeyForFirefox] and is used with `@updateURL`.
    * [https://openuserjs.org/**meta**/username/scriptname.meta.js][metaJSExample]
        * This is the preferred route and goes directly to the necessary items needed for updating. This route is currently unmanaged. If you want your update checks faster most of the time this is the route to choose.
    * [https://openuserjs.org/**install**/username/scriptname.meta.js][metaJSExample2]
        * This is the legacy route and indirectly goes to the necessary items needed for updating. This route is currently managed. If you want your script update checks to potentially not come during high traffic times this is the route to choose.
    * One of these is currently required when OpenUserJS is in lockdown mode. If any script points to an OUJS .user.js url it will not be served. If it is absent it will not be served. Occasionally a script and/or .user.js engine might put out a bugged version and in order to ensure minimal site disruption OUJS may optionally toggle into lockdown mode. Hopefully these instances will be few but there is existing precedence for this use case. Please see [About][oujsAbout] for current site status and your Author Tools panel on each of your scripts source page.
    * You must choose. But choose wisely, for as the true .meta.js will bring you life, a false one will take it from you.
2. `.meta.json` - This is the modern [JSON][JSONHomepage] usage that outputs the information we collect from the metadata blocks.
    * [https://openuserjs.org/**meta**/username/scriptname.meta.json][metaJSONExample]
3. `.user.js` + `text/x-userscript-meta` - Modern Userscript engines **sometimes** may send a special header out in order to retrieve just the meta.
    * [https://openuserjs.org/**install**/username/scriptname.user.js][userJSExampleBrokenAsIntended] plus the Userscript engine sending out the request header.
         * Use of the url form... with `updateURL` in the UserScript metadata block... is **highly discouraged**. The reason why is while your browser is open, and if your internet goes offline *(or the target site is offline)* for any reason this could toggle the userscript engine into a `FAIL` status and then update checks may pull full script source. This is considered bad etiquette for Authors and your users. Some portable devices may incur additional charges for extra bandwidth used so please be considerate. Usually this can be a permanent state unless the configuration file in the engine is modified by hand.

The `username` and `scriptname` "folders" are usually specially formattted and can be URIComponent encoded depending on the Unicode usage with `name` in the UserScript metadata block. This formatting can sometimes be referred to as a "slug" but usually those types of urls are **not** URI or URIComponent encoded and are strict ANSI. See the `href` attribute *(usually copy link, or similar, in a right click context menu)* on the blue Install button for the current encoding for the values on a Userscripts home page.

A Userscript Unit Test is available to demonstrate and test these features at [oujs - Meta View][oujsMetaViewExample] for a graphical representation of these meta routines.

### Q: Is there a way to not count script updates with this sites install counter?

A: Yes, use the raw source route like this in the UserScript metadata block:

``` js
// @updateURL https://openuserjs.org/meta/username/scriptname.meta.js
// @downloadURL https://openuserjs.org/src/scripts/username/scriptname.user.js
```

... notice the **src**/**scripts** p.a.t.h/t.o instead of **install**.

As an added advantage and incentive to utilizing this source route *(URL path)* with `@downloadURL` the "Too Many Requests" period is divided by a sweet factor. In other words this route is currently "less" managed than the install route. This UserScript metadata block key is not currently required but highly encouraged especially due to faulty .user.js engine updaters.

[greasemonkeyForFirefox]: Greasemonkey-for-Firefox
[metaJSExample]: https://openuserjs.org/meta/Marti/oujs_-_Meta_View.meta.js
[metaJSExample2]: https://openuserjs.org/install/Marti/oujs_-_Meta_View.meta.js
[metaJSONExample]: https://openuserjs.org/meta/Marti/oujs_-_Meta_View.meta.json
[userJSExampleBrokenAsIntended]: https://openuserjs.org/install/Marti/.user.js
[oujsMetaViewExample]: https://openuserjs.org/scripts/Marti/oujs_-_Meta_View
[oujsAbout]: https://openuserjs.org/about
[JSONHomepage]: http://json.org/
[wikipediaSCM]: https://www.wikipedia.org/wiki/Version_control
[gitSCM]: https://git-scm.com/
[gitSCMdoc]: https://git-scm.com/doc
