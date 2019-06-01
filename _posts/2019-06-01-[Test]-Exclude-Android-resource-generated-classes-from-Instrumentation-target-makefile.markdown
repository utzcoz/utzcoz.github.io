---
layout: post
title:  "[Test]Exclude Android resource generated classes from Instrumentation target makefile"
date:   2019-06-01 10:53 +0800
categories: aosp test
---

There are so many instrumentation tests created by Google in AOSP, and they will test basic function of app and ui function based on `Activity`. It works fine for many ocassions, but it doesn't process correctly, when your instrumentation target app uses third-part libraries with resources, and uses `aapt` flags to extra `R` for those packages.

For example, maybe if instrumentation target app use `v7-appcompat`, it may append below rules in its `Android.mk`:

```Makefile
LOCAL_RESOURCE_DIR += frameworks/support/v7/appcompat/res

LOCAL_STATIC_JAVA_LIBRARIES += android-support-v7-appcompat

LOCAL_AAPT_FLAGS := --auto-add-overlay
LOCAL_AAPT_FLAGS += --extra-packages android.support.v7.appcompat
```

Above rules will remap `v7-appcompat` resources with instrumentation target app's resources, and generate a `R.java` called `android.support.v7.appcompat.R.java` with the same content with instrumentation target app's `R.java`.

And then in instrumentation `Android.mk` we will use `LOCAL_INSTRUMENTATION_FOR` to specific the target app. Okay, it works fine to here. But waht if we needs `v7-appcompat` in our instrumentation test app, or including `v7-appcompat` dependency with its `R.java` in some library to our instrumentation test app?

There are two `android.support.v7.appcompat.R.java` in our instrumentation test app runtime environmentation, one in instrumentation test app code, one in instrumentation test app's `classpath`, what is target app's `intermediates` `classes-pre-proguard.jar`, and added by build system. We know those two `R.java` have the same id for `v7-appcompat` resource. And in our test environment, the Android will use id value in instrumentation test app code's `android.support.v7.appcompat.R.java` to get value from the target app resource table, what causes resource non-match error. So if we don't add resources in instrumentation test app, we can remove resource classes, such as `R.java` from instrumentation test app, by adding below rule to our instrumentation test app's `Android.mk`:

```Makefile
LOCAL_JAR_EXCLUDE_FILES := none
```
