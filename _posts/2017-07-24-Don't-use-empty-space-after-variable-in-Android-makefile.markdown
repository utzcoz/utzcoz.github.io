---
layout: post
title:  "Don't use empty space after variable in Android makefile"
date:   2017-07-24 21:14:00 +0800
categories: aosp
---

In Android makefile, we always assign a value to a variable. But if we add one or more empty space after variable value, it may cause some build error.

For example, If we want to add a preinstall apk to system, we may use makefile template such as below:

```
LOCAL_PATH := $(call my-dir)
include $(CLEAR_VARS)

LOCAL_MODULE := LeanbackSampleApp
LOCAL_SRC_FILES := $(LOCAL_MODULE).apk
LOCAL_MODULE_CLASS := APPS
LOCAL_MODULE_TAGS := optional
LOCAL_MODULE_SUFFIX := $(COMMON_ANDROID_PACKAGE_SUFFIX)
LOCAL_CERTIFICATE := platform

include $(BUILD_PREBUILT)

```

Above makefile template is copied from `AOSP`. The template is simply, but if we add empty space after `LeanbackSampleApp`, the build system will use `'LeanbackSampleApp .apk'` to find local src files, which will cause build error. 

The build system does not trim the variable value, which careless operation will cause absurd error. Unfortunatelly, a company's development intern has encountered this problem today.
