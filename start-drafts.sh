#!/bin/bash

bundle install
# We should run follow commented command to fix ffi compatibility problem on M1.
# gem install --user-install ffi -- --enable-libffi-alloc
bundle exec jekyll serve --watch --trace --drafts
