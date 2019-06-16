---
layout: post
title:  "Build AOSP for emulator"
date:   2019-06-16 18:20 +0800
categories: aosp
---

```
. build/envsetup.sh
lunch aosp_x86_64-eng
make
emulator
```

I have tested with target `aosp_arm64`, but the emualtor will carsh when running Android frequently, so I change target to `aosp_x86_64`, and emulator works fine in my work machine with architecture `x86_64`.

Screenshot:

![emulator-with-target-aosp_x86_64](/images/emulator-with-target-aosp_x86_64.png "emulator with target aosp_x86_64")
