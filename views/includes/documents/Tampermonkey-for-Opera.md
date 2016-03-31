## Tampermonkey for Opera

![Tampermonkey icon][tampermonkeyIcon]

Tampermonkey is a userscript manager for Opera and other similar web browsers, written by Jan Biniok. There are also versions for [Chrome][tampermonkeyForChrome] and [Android][tampermonkeyForAndroid].

### Installing Tampermonkey

To get userscripts going with the Opera version of Tampermonkey, first you have to install it from the [Opera Add-ons website][operaAddons]. It works with recent versions of Opera *(v15 or newer, which are based on the Blink rendering engine)*. If you have to use an older version of Opera, you probably need to use [Violent Monkey][violentMonkeyForOpera] instead of Tampermonkey.

![Screenshot of Tampermonkey page in Opera Add-ons][operaAddonsScreenshot1]

From the Tampermonkey page in Opera Add-ons, click the green "+ Add to Opera" button to install the extension. Once Tamperonkey has finished installing, you should see a pop-up confirming that it has been added to Opera. This should point to a new Tampermonkey icon at the top of the Opera window, next to the address bar.

![Screenshot of Tampermonkey installation][tampermonkeyOperaScreenshot1]

### Installing Userscripts

Once Tampermonkey is installed, installing userscripts from [OpenUserJS.org][oujs] is simple. Navigate to the OpenUserJS page for the script, then click the blue "Install" button at the top of the page.

![Screenshot of an OpenUserJS script page][oujsScriptPageScreenshot1]

Tampermonkey will display a screen showing you where the userscript has come from, what websites it can access, its source code, and a warning to only install scripts from sources that you trust. If you do want to install the script, click the "Install" button, otherwise click "Cancel".

![Screenshot of Tampermonkey script installation][tampermonkeyOperaScreenshot2]

Installing userscripts from other sources is a similar process. You just need to find the installation link for the script. This will be a button or link to a file with a name that ends ".user.js"

After installing a userscript, you won't normally notice any further changes until you visit a website that it runs on.

### Managing Userscripts

Clicking on the Tampermonkey icon at any time will pop up a menu that shows you what userscripts are running on the website you are looking at. It also lets you check for updated scripts *(it does daily automatic checks by default)*, and open the Tampermonkey Dashboard.

![Screenshot of Tampermonkey dashboard][tampermonkeyOperaScreenshot3]

In the Dashboard, the "Installed scripts" tab is the main place to manage your userscripts. The numbered circle to the left of each script shows you the order they run in, and whether they are enabled *(green)* or disabled *(red)* - click it to toggle the status. You can also uninstall userscripts *(trash can icon)*, or check for new updates *(click the "last updated" date)*.

### Trouble shooting

If you think a userscript is causing problems, the easiest way to check is to switch off Tampermonkey, reload the web page, and see if the symptoms go away. You can do this by clicking on the Tampermonkey icon then clicking "Enabled"; the tick icon should change to a cross. If it looks like a script problem and you have more than one script running on a web page, you can disable them all in Tampermonkey's dashboard then re-enable them one by one, until you find the culprit. Remember to reload the web page each time - userscripts normally only run when a web page loads.

Sometimes, when you use more than one userscript on the same web page, they need to run in a particular order. You can change the order using the Tampermonkey dashboard. In the "Sort order" column, click on the triple-line icon for the script you want to move, move the mouse up or down to change the order, then click again.

### More

* [Get Tampermonkey from the Opera Add-ons website][operaAddons]
* [Tampermonkey for Chrome][tampermonkeyForChrome]
* [Tampermonkey for Android][tampermonkeyForAndroid]
* [Tampermonkey.net][tampermonkeyNet] - documentation, discussion and downloads for other versions of Tampermonkey.

[githubFavicon]: https://assets-cdn.github.com/favicon.ico
[oujsFavicon]: https://raw.githubusercontent.com/OpenUserJs/OpenUserJS.org/master/public/images/favicon16.png
[oujs]: https://openuserjs.org/
[tampermonkeyIcon]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/tampermonkey_icon.png "Tampermonkey"
[chrome]: Chrome
[tampermonkeyForChrome]: Tampermonkey-for-Chrome
[tampermonkeyForAndroid]: Tampermonkey-for-Android
[operaAddons]: https://addons.opera.com/extensions/details/tampermonkey-beta/
[violentMonkeyForOpera]: Violentmonkey-for-Opera
[operaAddonsScreenshot1]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/tampermonkey_op1.png "Tampermonkey in the Opera Add-ons website"
[tampermonkeyOperaScreenshot1]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/tampermonkey_op2.png "Tampermonkey installed"
[oujsScriptPageScreenshot1]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/openuserjs_script.gif "Ready to install a script"
[tampermonkeyOperaScreenshot2]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/tampermonkey4.png "Installing a script"
[tampermonkeyOperaScreenshot3]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/tampermonkey5.png "Tampermonkey Dashboard"
[tampermonkeyForAndroid]: Tampermonkey-for-Android
[tampermonkeyForChrome]: Tampermonkey-for-Chrome
[tampermonkeyNet]: http://tampermonkey.net/
