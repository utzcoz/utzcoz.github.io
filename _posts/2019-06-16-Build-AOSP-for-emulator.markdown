---
layout: post
title:  "Build AOSP for emulator"
date:   2019-06-16 18:20 +0800
categories: aosp
---

```
source build/envsetup.sh
lunch sdk_phone_x86_64-userdebug
m
emulator
```

I have tested with target `aosp_arm64`, but the emulator will crash when running Android frequently, so I change target to `aosp_x86_64`, and emulator works fine in my work machine with architecture `x86_64`.

If you want to show the debug information of `emulator`, you can use the command `emulator -verbose` to start the `emualtor`. It will show many useful information to customize `emualtor` such as the path of `emulator` config(`device/generic/goldfish/data/etc/config.ini`).

Tips:

Please don't build `eng` variant for `emulator`, it will cause `Developer Optioins` crash, because of the lack of `oem_lock` service.