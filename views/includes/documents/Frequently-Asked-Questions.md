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

A: Use markdown like these:

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


The smaller the code snippet, or having a flawed Code snippet, the more likely it will automatically pick the wrong highlighting with code fences, **or worse no highlighting**... so it is best to recommend coercing a snippet to the correct type.

### Q: Does OpenUserJS.org have meta?

A: Yes, use the meta routine.

Multiple forms exist for various purposes:

1. `.meta.js` - This is the traditional `// @` delimited usage that outputs **some** of the metadata blocks items from a userscript for updating in userscript engines such as [Greasemonkey][greasemonkeyForFirefox] and is used with `@updateURL`.
    * [https://openuserjs.org/**meta**/username/scriptname.meta.js][metaJSExample]
        * This is the preferred route and goes directly to the necessary items needed for updating. This route is currently unmanaged. If you want your update checks faster most of the time this is the route to choose.
    * [https://openuserjs.org/**install**/username/scriptname.meta.js][metaJSExample2]
        * This is the legacy route and indirectly goes to the necessary items needed for updating. This route is currently managed. If you want your script update checks to potentially not come during high traffic times this is the route to choose.
    * One of these is currently required when OpenUserJS is in lockdown mode. If any script points to an OUJS .user.js url it will not be served. If it is absent it will not be served. Occasionally a script and/or .user.js engine might put out a bugged version and in order to ensure minimal site disruption OUJS may optionally toggle into lockdown mode. Hopefully these instances will be few but there is existing precedence for this use case. Please see [About][oujsAbout] for current site status and your Author Tools panel on each of your scripts.
    * You must choose. But choose wisely, for as the true .meta.js will bring you life, a false one will take it from you.
2. `.meta.json` - This is the modern [JSON][JSONHomepage] usage that outputs the information we collect from the metadata blocks.
    * [https://openuserjs.org/**meta**/username/scriptname.meta.json][metaJSONExample]
3. `.user.js` + `text/x-userscript-meta` - Modern Userscript engines **sometimes** may send a special header out in order to retrieve just the meta.
    * [https://openuserjs.org/**install**/username/scriptname.user.js][userJSExampleBrokenAsIntended] plus the Userscript engine sending out the request header.
         * Use of the url form... with `updateURL` in the UserScript metadata block... is **highly discouraged**. The reason why is while your browser is open, and if your internet goes offline *(or the target site is offline)* for any reason this could toggle the userscript engine into a `FAIL` status and then update checks may pull full script source. This is considered bad etiquette for Authors and your users. Some portable devices may incur additional charges for extra bandwidth used so please be considerate. Usually this can be a permanent state unless the configuration file in the engine is modified by hand.

The `username` and `scriptname` "folders" are usually specially formattted and can be URIComponent encoded depending on the Unicode usage with `name` in the UserScript metadata block. This formatting can sometimes be referred to as a "slug" but usually those types of urls are **not** URI or URIComponent encoded and are strict ANSI. See the `href` attribute *(usually copy link, or similar, in a right click context menu)* on the blue Install button for the current encoding for the values on a Userscripts home page.

A Userscript Unit Test is available to demonstrate and test these features at [oujs - Meta View][oujsMetaViewExample] for a graphical representation of these meta routines.

### Q: Is there a way to not to count script updates with this sites install counter?

A: Yes, use the raw source route like this in the UserScript metadata block:

``` js
// @updateURL https://openuserjs.org/meta/username/scriptname.meta.js
// @downloadURL https://openuserjs.org/src/scripts/username/scriptname.user.js
```

... notice the **src**/**scripts** p.a.t.h/t.o instead of **install**.

[greasemonkeyForFirefox]: Greasemonkey-for-Firefox
[metaJSExample]: https://openuserjs.org/meta/Marti/oujs_-_Meta_View.meta.js
[metaJSExample2]: https://openuserjs.org/install/Marti/oujs_-_Meta_View.meta.js
[metaJSONExample]: https://openuserjs.org/meta/Marti/oujs_-_Meta_View.meta.json
[userJSExampleBrokenAsIntended]: https://openuserjs.org/install/Marti/.user.js
[oujsMetaViewExample]: https://openuserjs.org/scripts/Marti/oujs_-_Meta_View
[oujsAbout]: https://openuserjs.org/about
[JSONHomepage]: http://json.org/
