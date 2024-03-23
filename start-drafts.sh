#!/bin/bash

# Use tsinghua tuna ruby gem source
bundle config mirror.https://rubygems.org https://mirrors.tuna.tsinghua.edu.cn/rubygems/
bundle install
# We should run follow commented command to fix ffi compatibility problem on M1.
# gem install --user-install ffi -- --enable-libffi-alloc
bundle exec jekyll serve --watch --trace --drafts
