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

Find your web browser in the table below, and follow the links to find out the options for making userscripts work on your platform:

&emsp;&emsp;&emsp;&emsp;&emsp;&emsp; | [Android][android] | [&nbsp;iOS&nbsp;][ios] | [Linux][linux] | [&nbsp;macOS&nbsp;][macos] | [Windows][windows]
--- | :---: | :---: | :---: | :---: | :---:
&emsp; |
**[Chrome][chrome]** | [Tampermonkey][tampermonkeyForAndroid] | &ndash; | [Tampermonkey][tampermonkeyForChrome], [Violentmonkey][violentmonkeyForChrome] | [Tampermonkey][tampermonkeyForChrome], [Violentmonkey][violentmonkeyForChrome] | [Tampermonkey][tampermonkeyForChrome], [Violentmonkey][violentmonkeyForChrome]
&emsp; |
**[Chromium][chromium]** | &ndash; | &ndash; | [Tampermonkey][tampermonkeyForChromium], [Violentmonkey][violentmonkeyForChromium] | [Tampermonkey][tampermonkeyForChromium], [Violentmonkey][violentmonkeyForChromium] | [Tampermonkey][tampermonkeyForChromium], [Violentmonkey][violentmonkeyForChromium]
&emsp; |
**[Edge][edge]** | &ndash; | &ndash; | &ndash; | &ndash; | [Tampermonkey][tampermonkeyForEdge]
&emsp; |
**[Falkon][falkon]** | &ndash; | &ndash; | [GreaseMonkey][falkon] | &ndash; | [GreaseMonkey][falkon]
&emsp; |
**[Firefox][firefox]** | [Greasemonkey][greasemonkeyForFirefox], [Tampermonkey][tampermonkeyForFirefox], [Violentmonkey][violentmonkeyForFirefox] | &ndash; | [Greasemonkey][greasemonkeyForFirefox], [Tampermonkey][tampermonkeyForFirefox], [Violentmonkey][violentmonkeyForFirefox] | [Greasemonkey][greasemonkeyForFirefox], [Tampermonkey][tampermonkeyForFirefox], [Violentmonkey][violentmonkeyForFirefox] | [Greasemonkey][greasemonkeyForFirefox], [Tampermonkey][tampermonkeyForFirefox], [Violentmonkey][violentmonkeyForFirefox]
&emsp; |
**[Opera][opera]** | &ndash; | &ndash; | [Tampermonkey][tampermonkeyForOpera], [Violentmonkey][violentmonkeyForOpera] | [Tampermonkey][tampermonkeyForOpera], [Violentmonkey][violentmonkeyForOpera] | [Tampermonkey][tampermonkeyForOpera], [Violentmonkey][violentmonkeyForOpera]
&emsp; |
**[Pale Moon][palemoon]** | &ndash; | &ndash; | [Greasemonkey &quot;Fork&quot;][palemoon] | &ndash; | [Greasemonkey &quot;Fork&quot;][palemoon]
&emsp; |
**[Safari][safari]** | &ndash; | &ndash; | &ndash; | [Tampermonkey][tampermonkeyForSafari] | &ndash;
&emsp; |
**[SeaMonkey][seamonkey]** | &ndash; | &ndash; | [Greasemonkey Port][greasemonkeyPortForSeaMonkey]| [Greasemonkey Port][greasemonkeyPortForSeaMonkey]| [Greasemonkey Port][greasemonkeyPortForSeaMonkey]
&emsp; |
**[Yandex Browser][yandexbrowser]** | [Tampermonkey][tampermonkeyForChromium], [Violentmonkey][violentmonkeyForChromium] | &ndash; | [Tampermonkey][tampermonkeyForChromium], [Violentmonkey][violentmonkeyForChromium] | [Tampermonkey][tampermonkeyForChromium], [Violentmonkey][violentmonkeyForChromium] | [Tampermonkey][tampermonkeyForChromium], [Violentmonkey][violentmonkeyForChromium]

[githubFavicon]: https://assets-cdn.github.com/favicon.ico
[oujsFavicon]: https://raw.githubusercontent.com/OpenUserJs/OpenUserJS.org/master/public/images/favicon16.png

[greasemonkeyForFirefox]: Greasemonkey-for-Firefox
[greasemonkeyPortForSeaMonkey]: Greasemonkey-Port-for-SeaMonkey

[tampermonkeyForAndroid]: Tampermonkey-for-Android
[tampermonkeyForChrome]: Tampermonkey-for-Chrome
[tampermonkeyForChromium]: Tampermonkey-for-Chromium
[tampermonkeyForEdge]: Tampermonkey-for-Edge
[tampermonkeyForFirefox]: Tampermonkey-for-Firefox
[tampermonkeyForOpera]: Tampermonkey-for-Opera
[tampermonkeyForSafari]: Tampermonkey-for-Safari

[violentmonkeyForChrome]: Violentmonkey-for-Chrome
[violentmonkeyForChromium]: Violentmonkey-for-Chromium
[violentmonkeyForFirefox]: Violentmonkey-for-Firefox
[violentmonkeyForOpera]: Violentmonkey-for-Opera

[android]: Android
[ios]: iOS
[linux]: Linux
[macos]: macOS
[windows]: Windows

[chrome]: Chrome
[chromium]: Chromium
[edge]: Edge
[falkon]: Falkon
[firefox]: Firefox
[opera]: Opera
[palemoon]: Pale-Moon
[safari]: Safari
[seamonkey]: SeaMonkey
[yandexbrowser]: Yandex-Browser
