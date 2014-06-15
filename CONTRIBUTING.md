## Contributing

This project uses [editor config](http://editorconfig.org/), please make sure to [download the plugin for your editor](http://editorconfig.org/#download) so that we stay consistent.


### Creating a Local Environment

#### Prerequisites

* [Git](http://git-scm.com/)
* [node.js 0.10.x](http://nodejs.org/)
* [MongoDB](http://www.mongodb.org/) (Optional.  The project is preconfigured to use a [mongolab](https://mongolab.com/) dev DB.)
* [Ruby](https://www.ruby-lang.org/) (required to run [FakeS3](https://github.com/jubos/fake-s3/))
* [FakeS3](https://github.com/jubos/fake-s3) (required to store libraries/scripts without [AWS S3](http://aws.amazon.com/s3/))

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
2. Navigate to the project directory and run `npm install` to install the dependencies defined within [package.json](https://github.com/OpenUserJs/OpenUserJS.org/blob/master/package.json)
3. If not already installed, install Ruby:
  * **Linux:** Run `sudo apt-get install ruby` (or similar for your package manager)
  * **Mac:** Use [Homebrew](http://brew.sh/) and [RubyGems](https://rubygems.org/)
  * **Windows:**  Use [RubyInstaller](http://rubyinstaller.org/)
4. If not already installed, install FakeS3 by running `gem install fakes3`

#### Configuration

1. Navigate to https://github.com/settings/applications and register a new OAuth application, saving the Client ID and Secret.  To ensure GitHub OAuth authentication will work the "Authorization callback URL" value must exactly match `AUTH_CALLBACK_BASE_URL` (see below, e.g. http://localhost:8080).
2. Open a [MongoDB shell](http://docs.mongodb.org/manual/tutorial/getting-started-with-the-mongo-shell/) and run the following (replacing "your_GitHub_client_ID" and "your_GitHub_secret") to create an "oujs_dev" database with a "strategies" collection containing your application instance's GitHub OAuth information.
  * `use oujs_dev`
  * `db.createCollection("strategies")`
  * `db.strategies.insert({id: "your_GitHub_client_ID", key: "your_GitHub_secret", name: "github", display: "GitHub"})`
3. Edit `models/settings.json`, setting your desired session secret, [MongoDB connection string](http://docs.mongodb.org/manual/reference/connection-string/) (if using your own MongoDB instance), etc.

#### Running the Application

**NOTE:** You may set the app to listen on a specific port by setting a `PORT` environment variable.  Additionally, if your application instance will not be accessible at either http://localhost:8080 or http://localhost:<PORT> you should set the `AUTH_CALLBACK_BASE_URL` environment variable to the root (e.g. http://myserver.local:8080)

1. Open a terminal, navigate to the root of the OpenUserJS.org project, and run `./fakes3.sh`.  Windows users will need to run the script commands manually.
2. Open another terminal, navigate to the root of the OpenUserJS.org project, and run `npm start`


### Pull Request Process

To contribute code to OpenUserJS.org the following process should generally be used:

1. Search the [issue tracker](https://github.com/OpenUserJs/OpenUserJS.org/issues) to see if the topic has already been discussed and/or resolved.
  * If you find a **related open issue**, consider whether or not your planned work is unique enough to merit a separate issue.  If someone else is working on a solution for the issue, or a discussion is ongoing, consider joining that effort rather than doing something completely separate.
  * If you find a **related closed issue and feel it should be readdressed**, consider simply commenting on that issue to help determine whether it should be reopened or a new issue created.
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


### Testing

#### Pull Requests

Optionally after setting up the innards of authentication, cloning the `origin` repository, setting the `upstream` remote, etc. ... it is possible to checkout a pull request *(often abbreviated as pr or PR)*

This can be a little tricky and needs some improvement for the docs.

* Find the `.../OpenUserJS.org/.git/config` and edit it. It should look a little something like this:

```
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

```
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


**NOTE** Sometimes `$ git-gui` will not properly craft the necessary url to checkout a specific pull request so it will be necessary to use the console in this case.


See Also
--------

* [STYLEGUIDE.md](STYLEGUIDE.md)
