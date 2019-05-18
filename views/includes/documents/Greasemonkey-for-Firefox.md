## Greasemonkey for Firefox
![Greasemonkey icon][greasemonkeyIcon]

Greasemonkey is a userscript manager for Firefox, originally written by Aaron Boodman and currently Firefox front-end and back-end maintained by Anthony Lieuallen and Johan Sundström. It is the first extension to allow userscripts to be run in a web browser.

### Installing Greasemonkey

To get userscripts going in Greasemonkey, first you have to install it from the [Mozilla Add-Ons][amoGreasemonkey] website, addons.mozilla.org *(AMO)*. This will show you the latest Greasemonkey version that will work with your version of Firefox.

![Screenshot of Greasemonkey page at addons.mozilla.org][greasemonkeyAMOscreenshot1]

From the Greasemonkey page on AMO, click the blue "+ Add to Firefox" button to install the extension. Firefox will show a warning and ask you to confirm adding the extension. Click "Add".

Once it has finished, you should see Greasemonkey's monkey icon at the top of the window, near the address bar.

### Installing Userscripts

Once Greasemonkey is installed, installing userscripts from [OpenUserJS.org][oujs] is simple. Navigate to the OpenUserJS page for the script, then click the blue "Install" button at the top of the page.

![Screenshot of an OpenUserJS script page][oujsScriptPageScreenshot]

A confirmation dialog box should pop up, showing you details about the script and the websites it can access. Click "Install" if you want to go ahead, and you should get a confirmation that the script has been installed.

If you only see a white boxed window try resizing it with the mouse grippy usually around the window border until the contents are visible as shown below:

![Screenshot of Greasemonkey script installation warning][greasemonkeyInstallationScreenshot]

Sometimes, you may see just the source code of the userscript, rather than popping up the installation dialog straight away. Usually this means Greasemonkey is disabled. You will need to reenable it from the Greasemonkey monkey icon and reinstall. However if you ticked the "Open in editor after install completes" option the editor will open. You may choose to install a Userscript in a disabled state as well.

Installing userscripts from other sources is a similar process. You just need to find the installation link for the script. This will be a button or link to a file with a name that ends ".user.js"

After installing a userscript, you won't normally notice any further changes until you visit, or refresh, a website that it runs on.

### Managing Userscripts

If you click the Greasemonkey's monkey icon, currently there is a list of installed Userscripts. Menu items here let you enable, disable or remove each installed script. Under each script menu entry in a sub-menu is the manual or automatic check for updates.

![Screenshot of Firefox Add-ons Manager with Greasemonkey monkey menu][aomUserScriptsScreenshot]

### Trouble shooting

If you think a userscript is causing problems, the easiest way to check is to switch off Greasemonkey, reload the web page, and see if the symptoms go away. You can turn it on or off by clicking the monkey icon and toggling the "Greasemonkey is active" to a disabled state. Remember to refresh any applicable windows and/or tabs.

If it looks like you have a script problem and you have more than one script running on a web page, you can disable all of them in the Greasemonkey monkey menu, then re-enable them one by one, until you find the culprit. Remember to reload the web page each time - userscripts normally only run when a web page loads.

Sometimes, when you use more than one userscript on the same web page, they may need to run in a particular order. The latest release of Greasemonkey does not currently accommodate this natively.

Sometimes, usually on a portable device, it may look like the userscript manager is not working. Try closing all tabs and load them fresh.

### More

* [Get Firefox Greasemonkey from Add-ons.Mozilla.org][amoGreasemonkey]
* [Greasespot.net][greasespot] - blog, documentation and discussion about Greasemonkey.

[githubFavicon]: https://assets-cdn.github.com/favicon.ico
[oujsFavicon]: https://raw.githubusercontent.com/OpenUserJs/OpenUserJS.org/master/public/images/favicon16.png
[oujs]: https://openuserjs.org/
[amoGreasemonkey]: https://addons.mozilla.org/firefox/addon/greasemonkey/
[aboutAddons]: about:addons
[aomUserScriptsScreenshot]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/greasemonkey5.gif "Userscript management in Firefox"
[greasespot]: https://www.greasespot.net/
[greasemonkeyIcon]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/greasemonkey_icon.png "Greasemonkey"
[greasemonkeyAMOscreenshot1]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/greasemonkey1.gif "Greasemonkey at Mozilla Add-Ons"
[oujsScriptPageScreenshot]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/openuserjs_script.gif "Ready to install a script"
[greasemonkeyInstallationScreenshot]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/greasemonkey4.gif "Greasemonkey script installation warning"
