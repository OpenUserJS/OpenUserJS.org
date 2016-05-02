## Userscript Beginners HOWTO

These pages are a work in progress, but are intended to help users with no previous knowledge understand how to install and use userscripts on their computer.

### What is a User Script?

Userscripts *(a.k.a User Scripts, User scripts, or `.user.js`)* are open-source licensed add-ons for web browsers that change web pages as they are loaded.  They give users the power to make websites do what they want them to, rather than what was originally intended. This kind of script is usually file named on your computer as `site it affects - what useful name you want to call it.user.js` and always **does** end in `.user.js`.

Useful tasks like improving layout, fixing bugs, automating common tasks and adding new functions can all be done by userscripts. More complicated userscripts can create mash-ups by combining information from different websites or embedding new data into a web page, e.g. to add reviews or price comparisons to a shopping website.


### What is a Library Script?

Library scripts *(a.k.a libs, libraries, or plain `.js`)* are reusable open-source licensed pieces of code that are shared for common uses in other Userscripts. This kind of script is usually file named `what useful name you want to call it.js` and always **does not** end in `.user.js`.

### How do I use a userscript?

It requires the installation of an extension specific to your browser. These extensions help simplify management tasks like installing, removing and updating userscripts.  The original userscript manager was Greasemonkey for the Firefox browser, so you may often hear userscripts referred to as Greasemonkey scripts.  To find out how to get going, look at the options for your browser in the table below.

### What are the risks?

You should be aware of privacy issues when using userscripts, and should not install them from sources you do not trust.  Userscripts can carry out actions on your behalf and can potentially access any information on a website you have access to, or that you enter into a website. They are often permitted to carry out functions that scripts on normal websites cannot, such as storing information on your computer and sharing it between website.  Badly written userscripts could potentially also be exploited by malicious websites.

To reduce security risks, most userscript managers let you control which websites a userscript can access and whether it can operate on secure *(https)* websites or local files on your computer. On OpenUserJS, the source code of every userscript is available to be examined, so that other programmers can see whether or not there is any malicious code or dangerous bugs.

### How do I get going?

Find your web browser in the tables below, and follow the links to find out the options for making userscripts work on your computer.

#### Desktop

Browser | Installation Method
---  | ---
[Chrome][chrome] | [Tampermonkey][tampermonkeyForChrome]
[Chromium][chromium] | [Tampermonkey][tampermonkeyForChromium]
[Firefox][firefox] | [Greasemonkey][greasemonkeyForFirefox]
[Opera][opera] | [Violent monkey][violentmonkeyForOpera]
[Opera][opera] *(v15 and above only)* | [Tampermonkey][tampermonkeyForOpera]
[QupZilla][qupzilla] | *(native support)*
[SeaMonkey][seamonkey] | [Greasemonkey Port][greasemonkeyPortForSeaMonkey]

#### Portable

Browser | Installation Method
---  | ---
Android| [Tampermonkey][tampermonkeyForAndroid]


[githubFavicon]: https://assets-cdn.github.com/favicon.ico
[oujsFavicon]: https://raw.githubusercontent.com/OpenUserJs/OpenUserJS.org/master/public/images/favicon16.png
[greasemonkeyForFirefox]: Greasemonkey-for-Firefox
[greasemonkeyPortForSeaMonkey]: Greasemonkey-Port-for-SeaMonkey
[tampermonkeyForOpera]: Tampermonkey-for-Opera
[tampermonkeyForChrome]: Tampermonkey-for-Chrome
[tampermonkeyForChromium]: Tampermonkey-for-Chromium
[tampermonkeyForAndroid]: Tampermonkey-for-Android
[violentmonkeyForOpera]: Violent-monkey-for-Opera
[chrome]: Chrome
[chromium]: Chromium
[firefox]: Firefox
[opera]: Opera
[qupzilla]: QupZilla
[seamonkey]: SeaMonkey

