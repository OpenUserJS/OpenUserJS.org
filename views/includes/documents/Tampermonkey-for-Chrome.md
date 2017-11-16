## Tampermonkey for Chrome

![Tampermonkey icon][tampermonkeyIcon]

Tampermonkey is a userscript manager extension for [Android][Android], [Chrome][Chrome], [Chromium][Chromium], [Edge][Edge], [Opera][Opera], and other similar web browsers, written by Jan Biniok. There are also versions for [Android][tampermonkeyForAndroid], [Chromium][tampermonkeyForChromium], [Edge][tampermonkeyForEdge], and [Opera][tampermonkeyForOpera].

### Installing Tampermonkey

To get userscripts going with the desktop version of Tampermonkey, first you have to install it from the [Chrome Web Store][gooChromeWebStoreTampermonkey]. The version in the store works with recent versions of Chrome *(v22 or newer, which are based on the Blink rendering engine)*. If you have to use an older version of Chrome, you may be able to get a compatible extension from [Tampermonkey.net][tampermonkeyNet].

![Screenshot of Tampermonkey page in Chrome Web Store][tampermonkeyGooChromeWebStoreScreenshot]

From the Tampermonkey page in the Chrome Store, click the blue "+ FREE" button to install the extension. Chrome will ask you to confirm the extension. Click "Add".

![Screenshot of Chrome's confirm extension dialog][tampermonkeyChromeScreenshot1]

Once Tampermonkey has finished installing, you should see a confirmation page from the Tampermonkey website and a pop-up confirming that Tampermonkey has been added to Chrome. This should point to a new Tampermonkey icon at the top of the Chrome window, next to the Omnibox.

![Screenshot of Tampermonkey installation][tampermonkeyChromeScreenshot2]

### Installing Userscripts

Once Tampermonkey is installed, installing userscripts from [OpenUserJS.org][oujs] is simple. Navigate to the OpenUserJS page for the script, then click the blue "Install" button at the top of the page.

![Screenshot of an OpenUserJS script page][oujsScriptPageScreenshot1]

Tampermonkey will display a screen showing you where the userscript has come from, what websites it can access, its source code, and a warning to only install scripts from sources that you trust. If you do want to install the script, click the "Install" button, otherwise click "Cancel".

![Screenshot of Tampermonkey script installation][tampermonkeyChromeScreenshot3]

Installing userscripts from other sources is a similar process. You just need to find the installation link for the script. This will be a button or link to a file with a name that ends ".user.js"

After installing a userscript, you won't normally notice any further changes until you visit a website that it runs on.

### Managing Userscripts

Clicking on the Tampermonkey icon at any time will pop up a menu that shows you what userscripts are running on the website you are looking at. It also lets you check for updated scripts *(it does daily automatic checks by default)*, and open the Tampermonkey Dashboard.

![Screenshot of Tampermonkey Dashboard][tampermonkeyChromeScreenshot4]

In the Dashboard, the "Installed scripts" tab is the main place to manage your userscripts. The numbered circle to the left of each script shows you the order they run in, and whether they are enabled *(green)* or disabled *(red)* - click it to toggle the status. You can also uninstall userscripts *(trash can icon)*, or check for new updates *(click the "last updated" date)*.

### Trouble shooting

If you think a userscript is causing problems, the easiest way to check is to switch off Tampermonkey, reload the web page, and see if the symptoms go away. You can do this by clicking on the Tampermonkey icon then clicking "Enabled"; the tick icon should change to a cross. If it looks like a script problem and you have more than one script running on a web page, you can disable them all in Tampermonkey's dashboard then re-enable them one by one, until you find the culprit. Remember to reload the web page each time - userscripts normally only run when a web page loads.

Sometimes, when you use more than one userscript on the same web page, they need to run in a particular order. You can change the order using the Tampermonkey dashboard. In the "Sort order" column, click on the 'three lines' icon for the script you want to move, move the mouse up or down to change the order, then click again.

### More

* [Get Tampermonkey from the Chrome Web Store][gooChromeWebStoreTampermonkey]
* [Get Tampermonkey Beta from the Chrome Web Store][gooChromeWebStoreTampermonkeyBeta]
* [Tampermonkey.net][tampermonkeyNet] - documentation, discussion and downloads for other versions of Tampermonkey.

* [Tampermonkey for Android][tampermonkeyForAndroid]
* [Tampermonkey for Chromium][tampermonkeyForChromium]
* [Tampermonkey for Edge][tampermonkeyForEdge]
* [Tampermonkey for Opera][tampermonkeyForOpera]

<!-- # References -->

<!-- ## Statics -->
[githubFavicon]: https://assets-cdn.github.com/favicon.ico
[oujsFavicon]: https://raw.githubusercontent.com/OpenUserJs/OpenUserJS.org/master/public/images/favicon16.png
[oujs]: https://openuserjs.org/

<!-- ## Browser pages -->
[android]: Android
[chrome]: Chrome
[chromium]: Chromium
[edge]: Edge
[opera]: Opera

<!-- ## .user.js engine external linkage -->
[tampermonkeyIcon]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/tampermonkey_icon.png "Tampermonkey"
[tampermonkeyNet]: http://tampermonkey.net/
[gooChromeWebStoreTampermonkey]: https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo
[gooChromeWebStoreTampermonkeyBeta]: https://chrome.google.com/webstore/detail/tampermonkey-beta/gcalenpjmijncebpfijmoaglllgpjagf

<!-- ## Screenshots -->
[tampermonkeyGooChromeWebStoreScreenshot]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/tampermonkey1.png "Tampermonkey in the Chrome Web Store"
[tampermonkeyChromeScreenshot1]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/tampermonkey2.png "Confirm extension"
[tampermonkeyChromeScreenshot2]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/tampermonkey3.png "Tampermonkey installed"
[oujsScriptPageScreenshot1]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/openuserjs_script.gif "Ready to install a script"
[tampermonkeyChromeScreenshot3]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/tampermonkey4.png "Installing a script"
[tampermonkeyChromeScreenshot4]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/tampermonkey5.png "Tampermonkey Dashboard"

<!-- ## Other related .user.js engine internal pages -->
[tampermonkeyForAndroid]: Tampermonkey-for-Android
[tampermonkeyForChromium]: Tampermonkey-for-Chromium
[tampermonkeyForEdge]: Tampermonkey-for-Edge
[tampermonkeyForOpera]: Tampermonkey-for-Opera
