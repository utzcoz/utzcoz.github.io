---
layout: post
title:  "Show Maru container window to android-xserver"
date:   2021-04-24 15:22 +0800
---

[MaruOS][1] is a project that leverages Android mobile phone's computing unit to run Linux OS, especially Debian now, on Android OS with lxc. It uses its `mflinger` to allocate buffer from Android `gralloc allocator`, and then uses its `mclient` in Linux container to `mmap` this buffer and draw content from `xf86-video-dummy` to this buffer to show the Linux desktop to Android. But there are some Android's `gralloc allocator` implementations doesn't expose write permission to exposing buffer without using `gralloc mapper`. And Linux container can't use `gralloc mapper` directly and easily. If we can use xserver implementation in Android to show x11 window on Android with the normal app buffer, we can fix this problem. So I start to test [android-xserver](https://github.com/nwrkbiz/android-xserver) with [MaruOS][1], and it works fine. This article is used to show steps to using [android-xserver][2] with [MaruOS][1].

## Test environment

I use [maru-0.7](https://github.com/maruos/manifest/tree/maru-0.7) with my phone Pixel XL (codename is marlin). Syncing [maru-0.7](https://github.com/maruos/manifest/tree/maru-0.7) source code, [preparing vendor binaries](https://grapheneos.org/build#extracting-vendor-files-for-pixel-devices), building `maru_marlin-userdebug`, and flashing phone.

## Run android-xserver

Following the `README.md` of [android-xserver][2], building and running it on Pixel XL.

## Setup xserver on Linux container

Firstly, we should find the local ip of the Pixel XL with command `adb shell ifconfig`:

```
marlin:/ # ifconfig
...
wlan0     ...
          inet addr:192.168.0.109  Bcast:192.168.0.255  Mask:255.255.255.0 
...
```

The local ip is `192.168.0.109`.

And then we should use `adb root` to get root permission of the phone, and use the following command to start Linux container from `adb shell`:

```shell
adb shell
lxc-start --name default
```

The default username and password is `maru` and `maru`.

We should ensure `lwm` and `xfe` are installed on Linux container, and install them with the following commands if not:

```shell
sudo apt update
sudo apt install lwm xfe
```

The next step we should do is to assign the local ip as the xserver location to the x11:

```shell
maru@buster-container:~$ export DISPLAY=192.168.0.109:0
maru@buster-container:~$ echo $DISPLAY
192.168.0.109:0
```

Now, we can start `lwm` and `xfe`:

```shell
lwm &
xfe
```

Waiting some seconds, we can see the `xfe` window on the [android-xserver][2]:

![](/images/show-xfe-in-container-to-xserver-android.png)


[1]: <https://github.com/maruos/maruos> "MaruOS"
[2]: <https://github.com/nwrkbiz/android-xserver> "android-xserver"