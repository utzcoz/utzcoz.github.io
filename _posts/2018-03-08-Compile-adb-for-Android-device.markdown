---
layout: post
title:  "Compile adb for Android device"
date:   2018-03-08 21:24 +0800
---

Actually, before `Android 6.0`, there is a `adb` in `system/bin`, which can be used in `Android`, and we can use this `adb` to connect itself or other `Android device`. But from `Android 6.0`, the `Android` official remove the build script for `adb` used in `Android` from `system/core/adb/Android.mk` because of the building problem. 

So, if you want to bring `adb` used in `Android` back, just append below script to your `system/core/adb/Android.mk`.(*Note: it works fine for `Android 6.0` only.*)


```
# libadb
# =========================================================
include $(CLEAR_VARS)
LOCAL_CLANG := true
LOCAL_MODULE := libadb
LOCAL_CFLAGS := $(LIBADB_CFLAGS) -DADB_HOST=1 -DADB_HOST_ON_TARGET=1
LOCAL_SRC_FILES := \
    $(LIBADB_SRC_FILES) \
    $(LIBADB_linux_SRC_FILES) \
    adb_auth_host.cpp \

LOCAL_SHARED_LIBRARIES := libbase

# Even though we're building a static library (and thus there's no link step for
# this to take effect), this adds the SSL includes to our path.
LOCAL_STATIC_LIBRARIES := libcrypto_static

include $(BUILD_STATIC_LIBRARY)

# adb host for device
# =========================================================
include $(CLEAR_VARS)

LOCAL_CLANG := true

LOCAL_SRC_FILES := \
    adb_main.cpp \
    console.cpp \
    commandline.cpp \
    adb_client.cpp \
    services.cpp \
    file_sync_client.cpp \

LOCAL_CFLAGS += \
    $(ADB_COMMON_CFLAGS) \
    -D_GNU_SOURCE \
    -DADB_HOST=1 \
    -DADB_HOST_ON_TARGET=1

LOCAL_MODULE := adb
LOCAL_MODULE_TAGS := debug

LOCAL_STATIC_LIBRARIES := \
    libadb \
    libbase \
    libcrypto_static \
    libcutils \
    liblog

include $(BUILD_EXECUTABLE)
```

After modified, just make your `Android` source code, the `adb` will appear in `$OUT/system/bin` after building finished.

If you want to use `adb` used in `Android` to connect itself(device), just set its `adbd` to `tcp` mode, and use `adb` to connect itself over tcp , which is over `Android` device inner local network.

If you want to use `adb` used in `Android` to connect another `Android` device, we call before as `USB host`, later as `USB device`, use common `USB cable` to connect them, the `USB host` uses `Type-A` and `USB device` uses `Micro` or `Type-C`, and then you can use `adb` in `USB host` to connect `USB device` and executes other useful commands.

For the `adb` detail, [ADB: How it works?](https://events.static.linuxfound.org/images/stories/pdf/lf_abs12_kobayashi.pdf) will help.

For the `USB host` and `USB device`, [Unboxing Android USB](https://www.amazon.com/Unboxing-Android-USB-approach-examples/dp/1430262087/ref=sr_1_1?ie=UTF8&qid=1520517260&sr=8-1&keywords=Unboxing+Android+USB) will help.

