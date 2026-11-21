# utzcoz.github.io

 Personal blog powered by [Jekyll](https://jekyllrb.com/).

### Install dependencies

#### macOS (Homebrew)

Install Ruby with Homebrew and install the gems from `Gemfile` (no `sudo` needed):

```shell
brew install ruby
export PATH="$(brew --prefix ruby)/bin:$PATH"
bundle install
```

#### Linux

```shell
source install-dependencies.sh
```
 
### Start local instance

```shell
source start.sh
```

### Start local instance including drafts content

```shell
source start-drafts.sh
```

### Update dependencies

```shell
sudo bundle update
```
