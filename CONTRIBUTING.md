## Contributing

This project uses [editor config](http://editorconfig.org/), please make sure to [download the plugin for your editor](http://editorconfig.org/#download) so that we stay consistent.


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
