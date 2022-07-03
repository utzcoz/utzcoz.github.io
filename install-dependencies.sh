#!/usr/bin/env bash

case "$(uname -s)" in

   Darwin)
     brew install ruby
     brew install ruby-build
     ;;

   *)
     sudo apt install ruby ruby-dev
     ;;
esac

sudo gem install jekyll bundler
sudo gem update jekyll
sudo bundle update
