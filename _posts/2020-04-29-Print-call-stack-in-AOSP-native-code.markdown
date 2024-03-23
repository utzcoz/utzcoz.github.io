---
layout: post
title:  "Print call stack in AOSP native code"
date:   2020-04-29 23:59 +0800
---

## AOSP 9.0

1. Add `libutilscallstack` to your `shared_libs` of `Android.bp`.
2. Add `#include <utils/CallStack.h>` to your c++ code.
3. Add below code to the location you want to print call stack:
   
   ```c++
   android::CallStack callstack;
   callstack.update();
   callstack.log("log-tag");
   ```

    The following log is the example I use `CallStack` to print:

    ```
    04-30 00:02:58.768  1569  1599 D enableVsyncLocked: #00 pc 000000000008de95  /system/lib64/libsurfaceflinger.so (android::impl::EventThread::threadMain()+981)
    04-30 00:02:58.768  1569  1599 D enableVsyncLocked: #01 pc 000000000008f956  /system/lib64/libsurfaceflinger.so (_ZNSt3__114__thread_proxyINS_5tupleIJNS_10unique_ptrINS_15__thread_structENS_14default_deleteIS3_EEEEMN7android4impl11EventThreadEFvvEPS9_EEEEEPvSE_+54)
    04-30 00:02:58.768  1569  1599 D enableVsyncLocked: #02 pc 0000000000092c5b  /system/lib64/libc.so (__pthread_start(void*)+27)
    04-30 00:02:58.768  1569  1599 D enableVsyncLocked: #03 pc 000000000002af2d  /system/lib64/libc.so (__start_thread+61)
    04-30 00:02:58.774  1569  1599 D setCallback: #00 pc 00000000000c8159  /system/lib64/libsurfaceflinger.so (android::DispSyncSource::setCallback(android::VSyncSource::Callback*)+73)
    04-30 00:02:58.774  1569  1599 D setCallback: #01 pc 000000000008deda  /system/lib64/libsurfaceflinger.so (android::impl::EventThread::threadMain()+1050)
    04-30 00:02:58.774  1569  1599 D setCallback: #02 pc 000000000008f956  /system/lib64/libsurfaceflinger.so (_ZNSt3__114__thread_proxyINS_5tupleIJNS_10unique_ptrINS_15__thread_structENS_14default_deleteIS3_EEEEMN7android4impl11EventThreadEFvvEPS9_EEEEEPvSE_+54)
    04-30 00:02:58.774  1569  1599 D setCallback: #03 pc 0000000000092c5b  /system/lib64/libc.so (__pthread_start(void*)+27)
    04-30 00:02:58.774  1569  1599 D setCallback: #04 pc 000000000002af2d  /system/lib64/libc.so (__start_thread+61)
    ```  
    It's very useful to inspect or debug c++ code.

## AOSP 11

In AOSP 11, we also need to include `libutils_headers` to project `Android.bp`'s `header_libs` based on previous steps. There is an example from [`libserviceutils`](https://cs.android.com/android/platform/superproject/+/master:frameworks/native/services/utils/Android.bp;l=27-50?q=libutils_headers&ss=android):

```
cc_library_static {
    name: "libserviceutils",

    vendor_available: true,

    cflags: [
        "-Wall",
        "-Werror",
    ],

    srcs: [
        "PriorityDumper.cpp",
    ],

    header_libs: [
        "libutils_headers",
    ],

    export_header_lib_headers: [
        "libutils_headers",
    ],

    export_include_dirs: ["include"],
}

```

Thanks [sysescool](https://github.com/sysescool) for pointing out this change.