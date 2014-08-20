## Violent Monkey for Opera

![Violent Monkey icon][violentMonkeyIcon]

Violent Monkey is a userscript manager for the [Opera][opera] web browser, written by [gera2ld][gera2ld].

### Installing Violent Monkey

To get userscripts going with the desktop version of Violent Monkey, first you have to install it from the [Opera Add-ons website][operaAddons]. This should automatically give you the correct version of Violent Monkey for your version of Opera, but for older versions, you might need to get a compatible extension from [the Violent Monkey wiki][violentMonkeyOexWiki].

![Screenshot of Violent Monkey page in Opera Add-ons website][operaAddonsScreenshot1]

From the Violent Monkey page in the Opera Add-ons website, click the green "+ Add to Opera" button to install the extension. Once Violent Monkey has finished installing, you should see a pop-up confirming that Violent Monkey has been added to Opera. This should point to a new Violent Monkey icon at the top of the Opera window, next to the address bar.

![Screenshot of Violent Monkey installation][violentMonkeyOperaScreenshot1]

### Installing Userscripts

Once Violent Monkey is installed, installing userscripts from [OpenUserJS.org][oujs] is simple. Navigate to the OpenUserJS page for the script, then click the blue "Install" button at the top of the page.

![Screenshot of an OpenUserJS script page][oujsScriptPageScreenshot]

Violent Monkey will display a screen showing you the source code of the userscript. Click the "Confirm installation" button to finish installing the script.

![Screenshot of Violent Monkey script installation][violentMonkeyOperaScreenshot2]

Installing userscripts from other sources is a similar process. You just need to find the installation link for the script. This will be a button or link to a file with a name that ends ".user.js"

NB After installing a userscript, you won't normally notice any further changes until you visit a website that it runs on.

### Managing Userscripts

Clicking on the Violent Monkey icon at any time will pop up a menu that shows you what userscripts are running on the website you are looking at. You can enable or disable each one by clicking on its name *(ticks mark enabled userscripts)*. The menu also lets you disable userscripts in general, or manage the scripts you have installed.

![Screenshot of Violent Monkey Dashboard][violentMonkeyOperaScreenshot3]

Clicking "Manage scripts" in the Violent Monkey menu takes you a dashboard screen that lists all your installed scripts. Each one can be temporarily disabled or removed totally using the buttons provided. You can also check for updated userscripts.

### Trouble shooting

If you think a userscript is causing problems, the easiest way to check is to switch off Violent Monkey, reload the web page, and see if the symptoms go away. You can do this by clicking on the Violent Monkey icon then clicking "Scripts enabled"; the tick next to the menu item should disappear and the monkey icon will turn grey. If it looks like a script problem and you have more than one script running on a web page, you can disable all of them in Violent Monkey's dashboard then re-enable them one by one until you find the culprit. Remember to reload the web page each time - userscripts normally only run when a web page loads.

Sometimes, when you use more than one userscript on the same web page, they need to run in a particular order. You can change the order using the Violent Monkey dashboard.  Click and drag the triple-line icon to the right of each script entry to move it up or down in the list.

### More

* [Get Violent Monkey from the Opera Add-ons website][operaAddons]
* [Violentmonkey wiki][violentMonkeyWiki] - documentation for Violent Monkey in recent versions of Opera *(v15+, based on the Blink rendering engine)*.
* [Violentmonkey-oex wiki][violentMonkeyOexWiki] - documentation for Violent Monkey in Opera v11.64 or v12 *(based on the Presto rendering engine)*.

[githubFavicon]: https://assets-cdn.github.com/favicon.ico
[oujsFavicon]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/favicon16.png
[oujs]: https://openuserjs.org/
[violentMonkeyIcon]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/violentmonkey_icon.png "Violent Monkey"
[opera]: Opera
[gera2ld]: https://github.com/gera2ld
[operaAddons]: https://addons.opera.com/extensions/details/violent-monkey/
[violentMonkeyOexWiki]: https://github.com/gera2ld/Violentmonkey-oex/wiki
[operaAddonsScreenshot1]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/violentmonkey1.png "Violent Monkey in the Opera Add-ons website"
[violentMonkeyOperaScreenshot1]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/violentmonkey2.png "Violent Monkey installed"
[oujsScriptPageScreenshot]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/openuserjs_script.png "Ready to install a script"
[violentMonkeyOperaScreenshot2]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/violentmonkey3.png "Installing a script"
[violentMonkeyOperaScreenshot3]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/violentmonkey4.png "Violent Monkey Dashboard"
[violentMonkeyWiki]: https://github.com/gera2ld/Violentmonkey/wiki
