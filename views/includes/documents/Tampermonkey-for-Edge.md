## Tampermonkey for Edge

![Tampermonkey icon][tampermonkeyIcon]

Tampermonkey is a userscript manager extension for [Android][Android], [Chrome][Chrome], [Chromium][Chromium], [Edge][Edge], [Opera][Opera], and other similar web browsers, written by Jan Biniok. There are also versions for [Android][tampermonkeyForAndroid], [Chrome][tampermonkeyForChrome], [Chromium][tampermonkeyForChromium], and [Opera][tampermonkeyForOpera].

### Installing Tampermonkey

To get userscripts going with the Edge version of Tampermonkey, first you have to install it from the [Windows Store][edgeAddons]. It works with recent versions of Windows 10 *(14342.0 or higher required)*.

![Screenshot of Tampermonkey page in Windows Store website][tampermonkeyMSWebStoreScreenshot]

From the Tampermonkey page in the Windows Store, click the blue "Get the App" button to launch the Windows Store app. In the Store click "Get" to start downloading and installing the Extension. Once Tampermonkey has finished installing, the Store button should change to a blue "Launch".

When you first launch Edge with Tampermonkey installed, Edge will prompt you to turn on the Extension.

Clicking the ... at the top right of Edge will show the Tampermonkey extension, or you can go to Extensions &rarr; Tampermonkey and set the option to Show the button next to the address bar.

### Installing Userscripts

Once Tampermonkey is installed, installing userscripts from [OpenUserJS.org][oujs] is simple. Navigate to the OpenUserJS page for the script, then click the blue "Install" button at the top of the page.

![Screenshot of an OpenUserJS script page][oujsScriptPageScreenshot1]

Tampermonkey will display a screen showing you where the userscript has come from, what websites it can access, its source code, and a warning to only install scripts from sources that you trust. If you do want to install the script, click the "Install" button, otherwise click "Cancel".

![Screenshot of Tampermonkey script installation][tampermonkeyEdgeScreenshot3]

Installing userscripts from other sources is a similar process. You just need to find the installation link for the script. This will be a button or link to a file with a name that ends ".user.js"

After installing a userscript, you won't normally notice any further changes until you visit a website that it runs on.

### Managing Userscripts

Clicking on the Tampermonkey icon at any time will pop up a menu that shows you what userscripts are running on the website you are looking at. It also lets you check for updated scripts *(it does daily automatic checks by default)*, and open the Tampermonkey Dashboard.

![Screenshot of Tampermonkey dashboard][tampermonkeyEdgeScreenshot4]

In the Dashboard, the "Installed scripts" tab is the main place to manage your userscripts. The numbered circle to the left of each script shows you the order they run in, and whether they are enabled *(green)* or disabled *(red)* - click it to toggle the status. You can also uninstall userscripts *(trash can icon)*, or check for new updates *(click the "last updated" date)*.

### Trouble shooting

If you think a userscript is causing problems, the easiest way to check is to switch off Tampermonkey, reload the web page, and see if the symptoms go away. You can do this by clicking on the Tampermonkey icon then clicking "Enabled"; the tick icon should change to a cross. If it looks like a script problem and you have more than one script running on a web page, you can disable them all in Tampermonkey's dashboard then re-enable them one by one, until you find the culprit. Remember to reload the web page each time - userscripts normally only run when a web page loads.

Sometimes, when you use more than one userscript on the same web page, they need to run in a particular order. You can change the order using the Tampermonkey dashboard. In the "Sort order" column, click on the triple-line icon for the script you want to move, move the mouse up or down to change the order, then click again.

### More

* [Get Tampermonkey from the Windows 10 Store][edgeAddons]
* [Tampermonkey.net][tampermonkeyNet] - documentation, discussion and downloads for other versions of Tampermonkey.

* [Tampermonkey for Android][tampermonkeyForAndroid]
* [Tampermonkey for Chrome][tampermonkeyForChrome]
* [Tampermonkey for Chromium][tampermonkeyForChromium]
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
[edgeAddons]: https://www.microsoft.com/store/apps/9NBLGGH5162S

<!-- ## Screenshots -->
[tampermonkeyMSWebStoreScreenshot]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/tampermonkey_edge.gif "Tampermonkey in the Windows Store"
[oujsScriptPageScreenshot1]:        https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/openuserjs_script.gif "Ready to install a script"
[tampermonkeyEdgeScreenshot3]:      https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/tampermonkey_edge4.gif "Installing a script"
[tampermonkeyEdgeScreenshot4]:      https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/tampermonkey_edge5.png "Tampermonkey dashboard"

<!-- ## Other related .user.js engine internal pages -->
[tampermonkeyForAndroid]: Tampermonkey-for-Android
[tampermonkeyForChrome]: Tampermonkey-for-Chrome
[tampermonkeyForChromium]: Tampermonkey-for-Chromium
[tampermonkeyForOpera]: Tampermonkey-for-Opera
