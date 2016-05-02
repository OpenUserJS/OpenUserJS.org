## Greasemonkey for Firefox
![Greasemonkey icon][greasemonkeyIcon]

Greasemonkey is a userscript manager for Firefox, originally written by Aaron Boodman and currently Firefox front-end and back-end maintained by Anthony Lieuallen and Johan Sundström. It is the first extension to allow userscripts to be run in a web browser.

### Installing Greasemonkey

To get userscripts going in Greasemonkey, first you have to install it from the [Mozilla Add-Ons][amoGreasemonkey] website, addons.mozilla.org *(AMO)*. This will show you the latest Greasemonkey version that will work with your version of Firefox.

![Screenshot of Greasemonkey page at addons.mozilla.org][greasemonkeyAMOscreenshot1]

From the Greasemonkey page on AMO, click the green "+ Add to Firefox" button to install the extension. Firefox will show a warning and ask you to confirm the extension. Click "Install".

Firefox will prompt you to restart to complete the installation. You can either restart straight away, or finish what you were doing, close all Firefox windows, then start the browser up again. When Firefox restarts, you may see it do a compatibility check on your add-ons. Once it has finished, you should see Greasemonkey's monkey icon at the top of the window, near the search box.

### Installing Userscripts

Once Greasemonkey is installed, installing userscripts from [OpenUserJS.org][oujs] is simple. Navigate to the OpenUserJS page for the script, then click the blue "Install" button at the top of the page.

![Screenshot of an OpenUserJS script page][oujsScriptPageScreenshot]

A confirmation dialog box should pop up, showing you details about the script and the websites it can access. Click "Install" if you want to go ahead, and you should get a confirmation that the script has been installed.

![Screenshot of Greasemonkey script installation warning][greasemonkeyInstallationScreenshot]

Sometimes, Greasemonkey shows you the source code of the userscript, rather than popping up the installation dialog straight away. At the top, there should be a prompt asking you whether to install it. Click "Install script", and you should get the installation dialog as normal.

Installing userscripts from other sources is a similar process. You just need to find the installation link for the script. This will be a button or link to a file with a name that ends ".user.js"

After installing a userscript, you won't normally notice any further changes until you visit, or refresh, a website that it runs on.

### Managing Userscripts

If you click the arrow to the right of Greasemonkey's monkey icon, there is an option to "Manage User Scripts..." This will take you to a User Scripts page in Firefox's Add-ons Manager, which you can also find at [about:addons][aboutAddons]. Buttons here let you enable, disable or remove each installed script. Clicking the gear icon above the list will let you check for updates *(by default, Greasemonkey also does weekly automatic checks)*.

![Screenshot of Firefox Add-ons Manager User Scripts page][aomUserScriptsScreenshot]

### Trouble shooting

If you think a userscript is causing problems, the easiest way to check is to switch off Greasemonkey, reload the web page, and see if the symptoms go away. You can turn it on or off by clicking the monkey icon, which should turn grey when disabled. A common problem is doing this by accident!

If it looks like you have a script problem and you have more than one script running on a web page, you can disable all of them in the Add-ons Manager, then re-enable them one by one, until you find the culprit. Remember to reload the web page each time - userscripts normally only run when a web page loads.

Sometimes, when you use more than one userscript on the same web page, they need to run in a particular order. You can also use the Add-ons Manager to achieve this. Click "Execution Order" above the list of scripts to see what order they will run in, then right-click on the individual scripts to make them execute first, last, sooner or later.

### More

* [Get Firefox Greasemonkey from Add-ons.Mozilla.org][amoGreasemonkey]
* [Greasespot.net][greasespot] - blog, documentation and discussion about Greasemonkey.

[githubFavicon]: https://assets-cdn.github.com/favicon.ico
[oujsFavicon]: https://raw.githubusercontent.com/OpenUserJs/OpenUserJS.org/master/public/images/favicon16.png
[oujs]: https://openuserjs.org/
[amoGreasemonkey]: https://addons.mozilla.org/firefox/addon/greasemonkey/
[aboutAddons]: about:addons
[aomUserScriptsScreenshot]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/greasemonkey5.png "Userscript management in Firefox"
[greasespot]: http://www.greasespot.net/
[greasemonkeyIcon]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/greasemonkey-icon.png "Greasemonkey"
[greasemonkeyAMOscreenshot1]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/greasemonkey1.gif "Greasemonkey at Mozilla Add-Ons"
[oujsScriptPageScreenshot]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/openuserjs_script.gif "Ready to install a script"
[greasemonkeyInstallationScreenshot]: https://raw.githubusercontent.com/wiki/OpenUserJS/OpenUserJS.org/images/greasemonkey4.gif "Greasemonkey script installation warning"
