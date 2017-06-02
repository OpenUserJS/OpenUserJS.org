## Violentmonkey for Opera

![Violentmonkey icon][violentmonkeyIcon]

Violentmonkey is a userscript manager for the [Opera][opera], [Chrome][chrome], [Firefox][firefox] web browser, written by [gera2ld][gera2ld].

### Installing Violentmonkey

To get userscripts going with the desktop version of Violentmonkey, first you have to install it from the [Opera Add-ons website][operaAddons]. This should automatically give you the correct version of Violentmonkey for your version of Opera, but for older versions, you might need to get a compatible extension from [the violentmonkey-oex releases][violentmonkeyOexReleases].

![Screenshot of Violentmonkey page in Opera Add-ons website][operaAddonsScreenshot1]

From the Violentmonkey page in the Opera Add-ons website, click the green "+ Add to Opera" button to install the extension. Once Violentmonkey has finished installing, you should see a pop-up confirming that Violentmonkey has been added to Opera. This should point to a new Violentmonkey icon at the top of the Opera window, next to the address bar.

### Installing Userscripts

Once Violentmonkey is installed, installing userscripts from [OpenUserJS.org][oujs] is simple. Navigate to the OpenUserJS page for the script, then click the blue "Install" button at the top of the page.

![Screenshot of an OpenUserJS script page][oujsScriptPageScreenshot]

Violentmonkey will display a screen showing you the source code of the userscript. Click the "Confirm installation" button to finish installing the script.

![Screenshot of Violentmonkey script installation][violentmonkeyOperaScreenshot2]

Installing userscripts from other sources is a similar process. You just need to find the installation link for the script. This will be a button or link to a file with a name that ends ".user.js"

After installing a userscript, you won't normally notice any further changes until you visit, or refresh, a website that it runs on.

### Managing Userscripts

Clicking on the Violentmonkey icon at any time will pop up a menu that shows you what userscripts are running on the website you are looking at. You can enable or disable each one by clicking on its name *(ticks mark enabled userscripts)*. The menu also lets you disable userscripts in general, or manage the scripts you have installed.

![Screenshot of Violentmonkey Dashboard][violentmonkeyOperaScreenshot3]

Clicking "Manage scripts" in the Violentmonkey menu takes you a dashboard screen that lists all your installed scripts. Each one can be temporarily disabled or removed totally using the buttons provided. You can also manually check for updated userscripts.

### Trouble shooting

If you think a userscript is causing problems, the easiest way to check is to switch off Violentmonkey, reload the web page, and see if the symptoms go away. You can do this by clicking on the Violentmonkey icon then clicking "Scripts enabled"; the tick next to the menu item should disappear and the monkey icon will turn grey. If it looks like a script problem and you have more than one script running on a web page, you can disable all of them in Violentmonkey's dashboard then re-enable them one by one until you find the culprit. Remember to reload the web page each time - userscripts normally only run when a web page loads.

Sometimes, when you use more than one userscript on the same web page, they need to run in a particular order. You can change the order using the Violentmonkey dashboard.  Click and drag the bounding box of each script in the list to move it up or down in the list.

### More

* [Get Violentmonkey from the Opera Add-ons website][operaAddons]
* [Violentmonkey IO][violentmonkeyIO] - some documentation for Violentmonkey in recent versions of Opera *(v15+, based on the Blink rendering engine)*.
* [Violentmonkey-oex wiki][violentmonkeyOexWiki] - documentation for Violentmonkey in Opera v12.x *(based on the Presto rendering engine)*.

[githubFavicon]: https://assets-cdn.github.com/favicon.ico
[oujsFavicon]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/favicon16.png
[oujs]: https://openuserjs.org/
[violentmonkeyIcon]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/violentmonkey_icon.png "Violentmonkey"
[opera]: Opera
[chrome]: Chrome
[Firefox]: Firefox
[gera2ld]: https://github.com/gera2ld
[operaAddons]: https://addons.opera.com/extensions/details/violent-monkey/
[violentmonkeyOexWiki]: https://github.com/gera2ld/Violentmonkey-oex/wiki
[violentmonkeyOexReleases]: https://github.com/gera2ld/Violentmonkey-oex/releases
[operaAddonsScreenshot1]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/violentmonkey1.gif "Violentmonkey in the Opera Add-ons website"
[oujsScriptPageScreenshot]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/openuserjs_script.gif "Ready to install a script"
[violentmonkeyOperaScreenshot2]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/violentmonkey3.gif "Installing a script"
[violentmonkeyOperaScreenshot3]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/violentmonkey4.png "Violentmonkey Dashboard"
[violentmonkeyIO]: https://violentmonkey.github.io/
