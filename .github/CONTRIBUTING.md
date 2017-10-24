## Contributing

This project uses [editor config](http://editorconfig.org/), please make sure to [download the plugin for your editor](http://editorconfig.org/#download) so that we stay consistent. Current ECMAScript 5 is implemented and supported at this time. This may change eventually to some ECMAScript 6 from the finalization that occurred in June of 2015.


### Creating a Local Environment

#### Prerequisites

* [Git](http://git-scm.com/)
* [node.js](http://nodejs.org/) *(see [`./package.json`](https://github.com/OpenUserJs/OpenUserJS.org/blob/master/package.json) engines for specific requirements)*
* [MongoDB](http://www.mongodb.org/) (Optional.  The project is preconfigured to use a dev DB on [MongoLab](https://mongolab.com/).)
* [Ruby](https://www.ruby-lang.org/) (required to run [FakeS3](https://github.com/jubos/fake-s3/))
* [FakeS3](https://github.com/jubos/fake-s3) (required to store libraries/scripts without [AWS S3](http://aws.amazon.com/s3/)) handled by [bundler](https://github.com/bundler/bundler)

#### GitHub Fork Setup

**NOTE:** GitHub provides a useful [git help site](https://help.github.com/).

1. Log in to GitHub and navigate to https://github.com/OpenUserJs/OpenUserJS.org
2. Click the "Fork" button to create your own fork of the project
3. After your fork has been created copy the "SSH clone URL" value, open a terminal, navigate to a desired local directory, and run the following (replacing the URL with your own):
  * `git clone git@github.com:your_username_here/OpenUserJS.org.git`
4. You now have a local copy associated with your fork (referred to as the "origin" remote) on GitHub.  To ensure you can retrieve the latest code from the original project, run the following to create an "upstream" remote:
  * `git remote add upstream git@github.com:OpenUserJs/OpenUserJS.org.git`
5. You are now able to commit changes to your fork, initiate pull requests via your fork's GitHub page, and retrieve the latest code from "upstream" (e.g. `git pull upstream master`).


#### Installation

1. Follow the forking instructions above to get a local copy of the project, or simply retrieve the code [as a ZIP](https://github.com/OpenUserJs/OpenUserJS.org/archive/master.zip) and extract it somewhere.
2. If not already installed, install Ruby:
  * **Linux:** Run `sudo apt-get install ruby` (or similar for your package manager)
  * **Mac:** Use [Homebrew](http://brew.sh/) and [RubyGems](https://rubygems.org/)
  * **Windows:**  Use [RubyInstaller](http://rubyinstaller.org/)
3. If not already installed, install bundler by running `sudo gem install bundler`
4. Navigate to the project directory and run `npm install` to install the dependencies defined within [package.json](https://github.com/OpenUserJs/OpenUserJS.org/blob/master/package.json) and [Gemfile](https://github.com/OpenUserJs/OpenUserJS.org/blob/master/Gemfile)

#### Configuration

1. Navigate to https://github.com/settings/applications and register a new OAuth application, saving the Client ID and Secret.  To ensure GitHub OAuth authentication will work the "Authorization callback URL" value must exactly match `AUTH_CALLBACK_BASE_URL` (see below, e.g. http://localhost:8080).
2. Open a [MongoDB shell](http://docs.mongodb.org/manual/tutorial/getting-started-with-the-mongo-shell/) and run the following (replacing "your_GitHub_client_ID" and "your_GitHub_secret") to create an "oujs_dev" database with a "strategies" collection containing your application instance's GitHub OAuth information.
  * `use oujs_dev`
  * `db.createCollection("strategies")`
  * `db.strategies.insert({id: "your_GitHub_client_ID", key: "your_GitHub_secret", name: "github", display: "GitHub"})`
3. Edit `models/settings.json`, setting your desired session secret, [MongoDB connection string](http://docs.mongodb.org/manual/reference/connection-string/) (if using your own MongoDB instance), etc.

#### Running the Application

**NOTE:** You may set the app to listen on a specific port by setting a `PORT` environment variable.  Additionally, if your application instance will not be accessible at either http://localhost:8080 or http://localhost:<PORT> you should set the `AUTH_CALLBACK_BASE_URL` environment variable to the root (e.g. http://myserver.local:8080)

1. Open a terminal, navigate to the root of the OpenUserJS.org project, and run `dev/fakes3.sh`.  Windows users will need to run the script commands manually.
2. Open another terminal, navigate to the root of the OpenUserJS.org project, and run `npm start`


### Pull Request Process

To contribute code to OpenUserJS.org the following process should generally be used:

1. Search the [issue tracker](https://github.com/OpenUserJs/OpenUserJS.org/issues) to see if the topic has already been discussed and/or resolved.
  * If you find a **related open issue**, consider whether or not your planned work is unique enough to merit a separate issue.  If someone else is working on a solution for the issue e.g. the Assignee, or a discussion is ongoing, consider joining that effort rather than doing something completely separate. When someone assigns themselves to an issue *(especially if that contributor wrote a good deal of the code that is affected and it isn't a critical issue)* they should be given time to present their solution. If you want to help them out, push your code to a branch and let them know about it so they can add you as a remote, but don't go behind their back and submit a PR. It just isn't polite.
  * If you find a **related closed issue and feel it should be readdressed**, consider simply commenting on that issue to help determine whether it should be reopened or a new issue created.
  * Pay attention to the labels created. These may change over time as the project matures.
2. If you don't find a related issue, or it's determined a new issue would be more appropriate, visit the [issue tracker](https://github.com/OpenUserJs/OpenUserJS.org/issues) and create a new issue with a descriptive title and body.  The body should describe the change you would like to see implemented.  Additionally, and if possible, bug reports should include clear steps to reproduce the bug.
3. Open a terminal, navigate to the root of the OpenUserJS.org project, and run the following commands to update your local project from "upstream" and create a branch named `issue-NUM` (where `NUM` is the number of the issue you either created or discovered from the previous steps):
  * `git pull upstream master`
  * `git checkout -b issue-NUM master`
4. Implement the change(s) **only** related to the issue, ensuring you adhere to the [Style Guide](https://github.com/OpenUserJs/OpenUserJS.org/blob/master/STYLEGUIDE.md).  Commits should be made at logical points in the development process, however they should not be used excessively.  Consider including the issue number in commit messsages as "#NUM".
5. Push your new branch to your fork on GitHub using the following command (replacing `NUM`):
  * `git push origin issue-NUM`
6. Navigate to your fork and issue branch on GitHub and click the "Compare, review, create a pull request" button followed by the "Create pull request" button.
7. Click the "Edit" button and ensure the "base fork" branch is `master` (or desired target branch upstream) and the "head fork" branch is `issue-NUM`.
8. Click the "Create pull request" button and enter a descriptive title and comment, referencing the original issue number.
9. Click the "Create pull request" button to submit your pull request.
10. When one person submits a pull request, someone else with privileges should merge it when a consensus has been reached. Please allow appropriate time for evaluation from others. The only exception is the active maintainer *(because some stuff just needs to get done without waiting for input)*

#### Usage of Labels

The following is a brief list of **some** of the labels used on the project and is used to establish teamwork. Not everyone has permission to set these and usually will be set by someone, unless expressly prohibited, either when an Issue or Pull Request *(PR)* is created or after an Issue is reported:

##### BLOCKING
Only the establishing owner and in extreme cases the active maintainer of the project may add this. Removal is done by the establishing owner. Recommendations by other contributors and collaborators are always accepted to have this put on or removed. This label means that merging unrelated or non-bug fix PRs will be put on hold until this label has been removed.

---

##### UI
Pertains inclusively to the User Interface

##### DB
Pertains inclusively to the Database operations.

##### DOC
Pertains inclusively to the Documentation operations.

##### CODE
If it's not any of the above three then it's probably some other Code related issue and it should clearly describe what it is affecting in a comment.

---

##### team biz
Team members can put this label on an issue that isn't related directly to the software we are developing. This means everyone involved directly with the project should consider adding input. This is similar to a meta discussion.

##### needs discussion
After an Assignee takes an Issue with announcement there may need to be further discussion on a particular resolution. The Assignee is asking for additional support from the rest of the community.

##### needs testing
Anyone can add this but it is primarily there for the Assignee indicating that Testers are wanted and needed.

##### needs mitigation
Bascially this means following up with a preferable related enhancement issue and/or pull request. Removal of this can only occur by the hierarchy of Establishing Owner &rarr; Owner &rarr; Active Maintainer and then remaining Collaboratorion teams...and of course whoever initially put it on. In the event of a conflict of two same team categories the label is to stay on until a member of the higher up team can mediate. This can be used when someone in development feels something is or is not related and should be readdressed to reduce the perceived friction during voting/discussion process. This is usually non-blocking.

##### feature
Something we don't already have implemented to the best of your knowledge but would like to see.

##### enhancement
Something we do have implemented already but needs improvement upon to the best of your knowledge.

##### bug
You've guessed it... this means a bug is reported.

##### migration
Migration issues come up occasionally when a large refactor is done on the UI, DB or CODE. Use this to indicate that it may apply to an existing or announced migration.

##### security
This means a security issue may have been identified or applies to a reported security issue.

##### hung
This means an issue is hung up or pony'd as Greasemonkey refers to it. E.g. The Assignee is not sure what to do about a particular issue to continue. Assignee must resign the issue to allow others a chance to remedy the issue.

##### PR READY
This is used to indicate that a pull request *(PR)* is ready for evaluation. This can be toggled on by only the originating pull request author... within reason anyone can remove it if there is a major bug found in a PR... just comment as to why.

##### expedite
Strong recommendation to do this as soon as possible. Don't abuse this unless you feel strongly enough to have this addressed as an Emergency Service Release *(esr)*. This should always be cleared on any PR and related Issue that is merged. There must be a clear explanation of why this has such high priority or the label will be removed.

##### sooner
Recommendation to have this done sooner rather than later. This should always be cleared on any PR and related Issue that is merged.

##### later
Recommendation to have this done later. This doesn't mean never *(that may be a mightfix or wontfix label)*. This should always be cleared on any PR and related Issue that is merged.

##### mightfix
Someone with privileges is considering adding a fix in to acccomodate a feature or enhancement.

##### wontfix
Someone with privileges is stating that a feature or enhancement will not be currently implemented.

##### question
This means a question has been encountered by anyone and has remained unanswered until cleared.

##### intended behavior
This means this is how it was intended to be implemented and is usually used for reports from non-collaborators and non-owners.

##### duplicate
This means already been reported. Always reference in a comment what issue or pull request number it is used in context with.

##### invalid
This means it works for me and is usually used for reports from non-collaborators and non-owners.

##### tracking upstream
Means somewhere upstream we're waiting on an answer for something.

On a final note... Assignees should be cleared on Issues when a particular Issue is closed and optionally merged from a PR to avoid accidental reassigning back to the original Collaborator taking on the issue.


### Testing

#### Fetching Pull Requests

Optionally after setting up the innards of authentication, cloning the `origin` repository, setting the `upstream` remote, etc. ... it is possible to checkout a pull request *(often abbreviated as pr or PR)*

This can be a little tricky and needs some improvement for the docs.

* Find the `.../OpenUserJS.org/.git/config` and edit it. It should look a little something like this:

``` apacheconf
[core]
  repositoryformatversion = 0
  filemode = true
  bare = false
  logallrefupdates = true
[user]
  email = emailname@example.com
  name = username
[remote "origin"]
  url = git@github.com:username/OpenUserJS.org.git
  fetch = +refs/heads/*:refs/remotes/origin/*
[remote "upstream"]
  url = git@github.com:OpenUserJs/OpenUserJS.org.git
  fetch = +refs/heads/*:refs/remotes/upstream/*
```

* and change it to add the following line of `fetch = +refs/pull/*/head:refs/remotes/upstream/pr/*` so it ends up looking a little like this:

``` apacheconf
[core]
  repositoryformatversion = 0
  filemode = true
  bare = false
  logallrefupdates = true
[user]
  email = emailname@example.com
  name = username
[remote "origin"]
  url = git@github.com:username/OpenUserJS.org.git
  fetch = +refs/heads/*:refs/remotes/origin/*
[remote "upstream"]
  url = git@github.com:OpenUserJs/OpenUserJS.org.git
  fetch = +refs/heads/*:refs/remotes/upstream/*
  fetch = +refs/pull/*/head:refs/remotes/upstream/pr/*
```

* Then one can use:

``` sh-session
$ git fetch upstream
$ git checkout upstream/pr/129
```

* To remove the pull requests from use:

``` sh-session
$ git prune upstream
```


**NOTE**: Sometimes `$ git-gui` will not properly craft the necessary url to checkout a specific pull request so it will be necessary to use the terminal in this case.

### Compiling

#### node.js
There are multiple ways to retrieve this however this appears to work best for most cases. Please ensure that you have the proper dependencies installed first depending on the version selected and your distribution:

Get it with:
``` sh-session
$ git clone git@github.com:nodejs/node.git
$ cd node
```

Update it with:

``` sh-session
$ git checkout master
$ git pull
```

Check it out with:

``` sh-session
$ git checkout tags/v4.2.1
```

Configure it with:
```
$ ./configure --prefix=/usr
```

Compile it with:
```
$ make
```

Test the success of the build with:

``` sh-session
$ ./node -e "console.log('Hello from node.js ' + process.version);"
```

Finally install it:

``` sh-session
$ sudo make install
```


Think you may have messed up with installation or compiling then use these commands to clean up:

``` sh-session
$ sudo make uninstall
$ make clean
```
... **NOTE**: You can always rerun the above `./configure` command when necessary to change the start path for installation and rerun `make`.

Checking your installation is a snap by by:

``` sh-session
$ node -v
$ npm -v
```
It may be recommended to update to the latest npm by using npm itself to update itself with:

``` sh-session
$ sudo npm install npm -g
```

See Also
--------

* [STYLEGUIDE.md](../STYLEGUIDE.md)
* [Privacy-Policy.md](../views/includes/documents/Privacy-Policy.md)
* [Terms-of-Service.md](../views/includes/documents/Terms-of-Service.md)
