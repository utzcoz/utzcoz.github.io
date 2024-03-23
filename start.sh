#!/bin/bash

# Use tsinghua tuna ruby gem source
bundle config mirror.https://rubygems.org https://mirrors.tuna.tsinghua.edu.cn/rubygems/
bundle install
bundle exec jekyll serve --watch --trace
