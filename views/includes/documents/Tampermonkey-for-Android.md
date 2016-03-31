## Tampermonkey for Android

![Tampermonkey icon][tampermonkeyIcon]

Tampermonkey is a userscript manager extension for [Chrome][Chrome], [Opera][Opera] and other similar web browsers, written by Jan Biniok. However, it is also available as a standalone, userscript enabled web browser for Android mobile devices. The version currently available is a Beta release and is rather basic as a web browser, so it may not have all the features required to make some websites work, but it is reasonably comprehensive in its support for userscripts.

#### Installing Tampermonkey

To get going with Tampermonkey on Android, first you have to install the app from the [Google Play Store][gooPlayStoreTampermonkey]. You need Android v2.2 *(Froyo)* or higher.

![Screenshot of Tampermonkey page in Google Play Store][tampermonkeyGooPlayScreenshot1]

From the Tampermonkey page in the Chrome Store, click the green "Install" button to install the app. Accept the permissions when prompted - it does not require any special access.

![Screenshot of installation confirmation dialog][tampermonkeyAndroidScreenshot1]

Once Tampermonkey is installed, you can launch it from the "Open" button in the Play Store app, or from its icon in your device's app launcher. You will see a basic web browser window, with the Tampermonkey icon in the top right corner.

#### Installing Userscripts

Once Tampermonkey is installed, installing userscripts from [OpenUserJS.org][oujs] is simple. Navigate to the OpenUserJS page for the script, then click the blue "Install" button at the top of the page.

![Screenshot of an OpenUserJS script page][oujsScriptPageScreenshot]

You will be prompted whether to install the userscript with Tampermonkey, or natively with Chrome.

![Screenshot of first userscript installation prompt][tampermonkeyAndroidScreenshot2]

Choose "OK" to install using Tampermonkey. Chosing "cancel" won't install the userscript natively in Chrome - it will just show you the source code of the userscript.

Tampermonkey will then display a screen showing you where the userscript has come from and what websites it can access. If you want to go ahead, choose "OK" to install the userscript.

![Screenshot of Tampermonkey script installation][tampermonkeyAndroidScreenshot3]

Installing userscripts from other sources is a similar process. You just need to find the installation link for the script. This will be a button or link to a file with a name that ends ".user.js"

After installing a userscript, you won't normally notice any further changes until you visit a website that it runs on.

#### Managing Userscripts

Clicking on the Tampermonkey icon at any time will take you to a menu that shows you what userscripts are running on the website you are looking at. It also lets you check for updated scripts *(it does daily automatic checks by default)*, and open the Tampermonkey Options screen.

![Screenshot of Tampermonkey Options screen][tampermonkeyAndroidScreenshot4]

In the Options screen, the "Installed scripts" tab is the main place to manage your userscripts. The numbered circle to the left of each script shows you the order they run in, and whether they are enabled *(green)* or disabled *(red)* - click it to toggle the status. You can also uninstall userscripts *(trash can icon)*, or check for new updates *(click the "last updated" date)*.

#### Trouble shooting

If you think a userscript is causing problems and you have more than one script running on a web page, you can disable them all in Tampermonkey's options then re-enable them one by one, until you find the culprit. Remember to reload the web page each time - userscripts normally only run when a web page loads.

Sometimes, when you use more than one userscript on the same web page, they need to run in a particular order. You can change the order using the Tampermonkey dashboard. In the "Sort" column, click on the green arrow icons to move scripts up or down in the sort order.

#### More

* [Get Tampermonkey from the Google Play Store][gooPlayStoreTampermonkey]
* [Tampermonkey for Opera][tampermonkeyForOpera]
* [Tampermonkey for Chrome][tampermonkeyForChrome]
* [Tampermonkey.net][tampermonkeyNet] - documentation, discussion and downloads for other versions of Tampermonkey.

[githubFavicon]: https://assets-cdn.github.com/favicon.ico
[oujsFavicon]: https://raw.githubusercontent.com/OpenUserJs/OpenUserJS.org/master/public/images/favicon16.png
[tampermonkeyIcon]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/tampermonkey_icon.png "Tampermonkey"
[chrome]: Chrome
[opera]: Opera
[gooPlayStoreTampermonkey]: https://play.google.com/store/apps/details?id=net.biniok.tampermonkey
[tampermonkeyGooPlayScreenshot1]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/tampermonkey_an1.png "Tampermonkey in the Google Play Store"
[tampermonkeyAndroidScreenshot1]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/tampermonkey_an2.png "Accept permisisons"
[oujs]: https://openuserjs.org/
[oujsScriptPageScreenshot]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/openuserjs_script_an.png "Ready to install a script"
[tampermonkeyAndroidScreenshot2]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/tampermonkey_an3.png "Install via Tampermonkey"
[tampermonkeyAndroidScreenshot3]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/tampermonkey_an4.png "Installing a script"
[tampermonkeyAndroidScreenshot4]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/tampermonkey_an5.png "Tampermonkey Options"
[tampermonkeyNet]: http://tampermonkey.net/
[tampermonkeyForOpera]: Tampermonkey-for-Opera
[tampermonkeyForChrome]: Tampermonkey-for-Chrome
