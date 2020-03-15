---
layout: post
title:  "Integrate Houdini to emulator"
date:   2020-03-15 20:38 +0800
categories: aosp
---

In `x86` architecture device, we build the emulator with product target `aosp_x86_64`, which is the `x86_64` architure Android variant.
So it can only run apks without so libraries and with `x86` and `x86_64` architure variant libraries. But it can't run apks with
`armhf` architecture or `arm64` architecture libraries. But if we can integrate `Houdini` to emulator, it will
help emulator to run apks with `armhf` architecture libraries, not for `arm64` architecture, 
because of `Intel` doesn't provide `Houdini` to support it.

## Integrate `libnb`

The easiest way to integrate `Houdini` support is to copy `android-x86` `nativebridge`, what is used
to support `Houdini` in `android-x86`.

We can copy the entire directory of `nativebridge` from `device/generic/common/nativebridge` in
`android-x86` to your `AOSP` code directory `device/generic/common`. The content of directory
`nativebridge` is as following shown:

```
Android.mk  OEMBlackList  OEMWhiteList  ThirdPartySO  bin  nativebridge.mk  src
```

1. The `Android.mk` and `src` defines the module `libnb`, what is the wrapper of `libhoudini`. 
`android-x86` doesn't provide `Houdini` in its source code, and it provides a switch button in
`Settings` to enable `nativebridge`. When the user enables it, it will tirgger `init` to
download `Houdini` from its download page, and mount it to system to use it. To make sure
the system can work without `libhoudini` and with `libhoudini`, it creates the module `libnb`
to wrap the `libhoudini`.

2. `natibridge.mk` defines the product definition for `Houdini`, such as copying enable script to
`system/bin`, setting native bridge abi list, and etc.

3. `bin` contains a script called `enable_nativebridge`, and it will be executed when user
   enables the `nativebridge` supports.

We just need to `inherit` `nativebridge.mk` in our emulator `device.mk` to add `libnb` to our
emulator system, as following showing:

```Makefile
$(call inherit-product-if-exists,device/generic/common/nativebridge/nativebridge.mk)
```

## Download `Houdini`

We know `android-x86` support `Houdini`, so we will download `Houdini` files from `android-x86` page.

``` shell
wget http://dl.android-x86.org/houdini/9_y/houdini.sfs
```

We can use preceding command to download `9_y` version `Houdini` files. `y` represents it supports
`x86_64` kernerl and `armhf` userspace. We can see the version `z` represents the `x86_64` kernel
and `arm64` userspace, but the `Intel` doesn't provide it, so we can't download it from `android-x86`
download page, so we can only use the `y` version `Houdini`.

After download, we should use following command to unzip `houdini.sfs` to our `nativebridge` directory:

```shell
sudo unsquashfs -d device/generic/common/nativebridge/system/lib/arm houdini.sfs
```

Then we needs copy it to the `$OUT/system/lib`, so should add copy command to `nativebridge.mk`:

```Makefile
PRODUCT_COPY_FILES += \
    $(call find-copy-subdir-files,*,device/generic/common/nativebridge/system/lib/arm,system/lib/arm) \
    $(call find-copy-subdir-files,*,device/generic/common/nativebridge/system/lib/arm/nb,system/lib/arm/nb) \
```

The `Android.mk` will delete all `$OUT/system/lib/arm` and `$OUT/system/lib64/arm` to make sure there 
are no `Houdini` files in its release images in `libnb`'s post command. It will delete our copy files
of `Houdini` when we build the system after `make installclean`, so we should remove it:

```Makefile
# LOCAL_POST_INSTALL_CMD := $(hide) \
#     rm -rf $(TARGET_OUT)/*/{arm*,*houdini*} {$(TARGET_OUT),$(PRODUCT_OUT)}/vendor/{*/arm*,*/*houdini*}; \
#     mkdir -p $(TARGET_OUT)/{lib/arm,$(if $(filter true,$(TARGET_IS_64_BIT)),lib64/arm64)}; \
#     touch $(TARGET_OUT)/lib/libhoudini.so $(if $(filter true,$(TARGET_IS_64_BIT)),$(TARGET_OUT)/lib64/libhoudini.so)

LOCAL_POST_INSTALL_CMD := $(hide) \
    mkdir -p $(TARGET_OUT)/{lib/arm,$(if $(filter true,$(TARGET_IS_64_BIT)),lib64/arm64)}; \
    touch $(TARGET_OUT)/lib/libhoudini.so $(if $(filter true,$(TARGET_IS_64_BIT)),$(TARGET_OUT)/lib64/libhoudini.so)
```

Also, we should add following snippet after proceding `PRODUCT_COPY_FILES` snippet in `nativebridge.mk`
to enable `libnb` and specific supported isa for `Houdini`:

```Makefile
PRODUCT_SYSTEM_DEFAULT_PROPERTIES += \
    ro.dalvik.vm.isa.arm=x86 \
    ro.enable.native.bridge.exec=1 \
    persist.sys.nativebridge=1 \

ifeq ($(TARGET_SUPPORTS_64_BIT_APPS),true)
PRODUCT_SYSTEM_DEFAULT_PROPERTIES += \
    ro.dalvik.vm.isa.arm64=x86_64 \
    ro.enable.native.bridge.exec64=1
endif
```

## Add `nativebridge.rc`

As we said before, `android-x86` will execute `bin/enable_nativebridge` after user enables the
`nativebridge` support function in `Settings`. The `enable_nativebridge` scripts needs many `SELinux`
policy to run its command, and some `SELinux` sepolicy breaks the `neverallow` rules in `system/core`.
The `android-x86` changes the `SELinux` to `permissive`, so it works fine on `android-x86`, but not
for normal emulator. We don't want to remove the `enable_nativebridge` `domain` from `neverallow` rules,
so we can create the `nativebridge.rc` to do it on the boot stage:

```init
on boot
    mount binfmt_misc none /proc/sys/fs/binfmt_misc
    mount none /system/lib/arm/libhoudini.so /system/lib/libhoudini.so bind
    copy /system/etc/binfmt_misc/arm_exe /proc/sys/fs/binfmt_misc/register
    copy /system/etc/binfmt_misc/arm_dyn /proc/sys/fs/binfmt_misc/register
```

To make sure `nativebridge.rc` can be parsed and executed by `init`, we should copy it `$OUT/system/etc/init/nativebridge.rc`. So we should append copy command to preceding `PRODUCT_COPY_FILES`:

```Makefile
PRODUCT_COPY_FILES += \
    device/generic/common/nativebridge/nativebridge.rc:system/etc/init/nativebridge.rc \
```

From the `nativebridge.rc`, we know it will copy `arm_exe` and `arm_dyn` to 
`/proc/sys/fs/binfmt_misc/register` to enable `binfmt_misc` for `Houdini`. So we should 
provide those files, and copy them to `$OUT/system/etc/binfmt_misc`:

`arm_exe`

```
:arm_exe:M::\\x7f\\x45\\x4c\\x46\\x01\\x01\\x01\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x02\\x00\\x28::/system/bin/arm/houdini:P
```

`arm_dyn`

```
:arm_dyn:M::\\x7f\\x45\\x4c\\x46\\x01\\x01\\x01\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x03\\x00\\x28::/system/lib/arm/houdini:P
```

`arm_exe` and `arm_dyn`'s content is copied from `enable_nativebridge`. And we add them to
`device/generic/common/nativebridge/system/etc/binfmt_misc`, and append copy command to
preceding `PRODUCT_COPY_FILES`:

```
PRODUCT_COPY_FILES += \
    device/generic/common/nativebridge/system/etc/binfmt_misc/arm_dyn:system/etc/binfmt_misc/arm_dyn \
    device/generic/common/nativebridge/system/etc/binfmt_misc/arm_exe:system/etc/binfmt_misc/arm_exe \
```

## Add `init.te`

The `nativebridge.rc` needs `SELinux` too, but they don't break the `neverallow` rules. We can use create `init.te` in `device/generic/common/sepolicy/plat_private/init.te`

```init
allow init proc:dir mounton;
allow init binfmt_miscfs:file write;
allow init system_file:file mounton;
```

And then we should include sepolicy directory in emulator's `BoardConfig.mk`:

```Makefile
BOARD_PLAT_PRIVATE_SEPOLICY_DIR += device/generic/common/nativebridge/sepolicy/plat_private
```

## Configure `Houdini`

The last thing we should do it to configure `Houdini` in our emulator device.

We should specific target cpu abi list for `Houdini` in emulator `BoardConfig.mk`:

```Makefile
TARGET_CPU_ABI_LIST_64_BIT := $(TARGET_CPU_ABI) $(TARGET_CPU_ABI2) $(NATIVE_BRIDGE_ABI_LIST_64_BIT)
TARGET_CPU_ABI_LIST_32_BIT := $(TARGET_2ND_CPU_ABI) $(TARGET_2ND_CPU_ABI2) $(NATIVE_BRIDGE_ABI_LIST_32_BIT)
TARGET_CPU_ABI_LIST := $(TARGET_CPU_ABI) $(TARGET_CPU_ABI2) $(TARGET_2ND_CPU_ABI) $(TARGET_2ND_CPU_ABI2) $(NATIVE_BRIDGE_ABI_LIST_64_BIT) $(NATIVE_BRIDGE_ABI_LIST_32_BIT)

BUILD_ARM_FOR_X86 := $(WITH_NATIVE_BRIDGE)
```

## Build and test

Now we can build the emulator again, and test it with install some apks with `armhf` achitecture
libraries only, and run them on emulator. In most case, they can run correctly.

## Notice

1. The `Houdini` is `Intel`'s proprietary project, you can't release it with your system images.
If you want to deploy it, maybe you should use the same method as `android-x86` project to download
files from network after user selectes to enable `nativebridge` function.

2. This article is based on the `Android 9.0`.

## Reference

1. The first idea is from the article [Run Arm apk on x86 with Anbox](https://zhsj.me/blog/view/anbox-and-houdini), and it provide a very simple method to integrate `Houdini` to a built
system images.

2. If you want to dig into the detail of `nativebridge`, you can read the book
[Android System Programming: Porting, customizing, and debugging Android HAL](https://www.amazon.com/gp/product/178712536X/ref=dbs_a_def_rwt_bibl_vppi_i0) by [Roger Ye](https://github.com/shugaoye). 
This book provide a very clear step to integrate `Houdini` to emulator from `android-x86` project. 