---
layout: post
title: "Android emulator won't boot on AMD GPU? It's your Vulkan driver."
date: 2026-03-21 00:00 +0800
tags: [android, emulator, vulkan, amd, linux]
---

I lost days to this. The Android emulator would launch, show the boot animation, and just sit there. No error dialog in Android Studio, no crash popup, nothing. An infinite boot loop with zero indication of what went wrong.

If you have an AMD GPU on Linux with AMDVLK installed, this post should save you some time.

## The problem

I'm working on an Android project with an emulator image (android-34, x86_64). AMD Ryzen + AMD Radeon RX (RDNA 3), Ubuntu. The emulator process starts fine. QEMU runs, ADB connects, boot animation plays. But `sys.boot_completed` never becomes `1`. The system hangs mid-boot and never recovers.

Android Studio tells you nothing. I tried cold boots, wiping data, recreating the AVD, different API levels. None of it mattered.

## Finding the root cause

I ended up working through this with [Claude Code](https://code.claude.com/docs/en/overview), which got me past the guessing stage and into the system logs. Took maybe 15 minutes once we stopped flailing.

### Confirm the boot is stuck

```bash
adb shell getprop sys.boot_completed
# (empty)

adb shell getprop init.svc.bootanim
# running
```

Empty `sys.boot_completed` and a still-running boot animation. System is alive but stuck.

### Check logcat

```bash
adb logcat -d | grep -i -E 'fatal|crash|vulkan'
```

This surfaced the problem immediately:

```
Vulkan Instance Version: 1.3.0
Device AMD Radeon RX XXXX, API Version 1.3.0, Driver Version 2.0.349
Failed to find appropriate memory type for 10 with properties 6!
```

The Vulkan compositor crashed during init. It couldn't find a memory type it needed.

### Check the crash buffer

```bash
adb logcat -d -b crash
```

Full crash trace:

```
signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x0
Cause: null pointer dereference
Cmdline: /system/bin/surfaceflinger

backtrace:
  #00 libvulkan_compositor.so (GraphicsObject::GetVkDevice() const+0)
  #01 libvulkan_compositor.so (LayerTextureCache::Initialize()+1563)
  #02 libvulkan_compositor.so (compositor::CreateDevice()+864)
  #03 surfaceflinger (VulkanRendererDevice::init()+2284)
```

Followed by:

```
init: process 'surfaceflinger' exited 4 times before boot completed
```

Vulkan memory allocation fails, `VkDevice` comes back null, null pointer dereference, surfaceflinger crashes. Init restarts it, same crash, four times, init gives up. Boot hangs forever.

## Root cause

The Android emulator uses gfxstream to translate Vulkan calls from the guest to your host GPU. It maps guest Vulkan memory types to host memory types.

AMDVLK (AMD's official Vulkan driver) exposes AMD-specific memory property flags through the `VK_AMD_device_coherent_memory` extension:

```
# AMDVLK: 16 memory types, including non-standard ones
Type 0:  DEVICE_LOCAL                                     (0x0001)
Type 1:  HOST_VISIBLE | HOST_COHERENT                     (0x0006)
Type 2:  DEVICE_LOCAL | HOST_VISIBLE | HOST_COHERENT      (0x0007)
Type 3:  HOST_VISIBLE | HOST_COHERENT | HOST_CACHED       (0x000e)
Type 4:  DEVICE_LOCAL | DEVICE_COHERENT_AMD | DEVICE_UNCACHED_AMD  (0x00c1)  <-- non-standard
Type 5:  HOST_VISIBLE | HOST_COHERENT | DEVICE_COHERENT_AMD | ...  (0x00c6)  <-- non-standard
...
```

`DEVICE_COHERENT_BIT_AMD` and `DEVICE_UNCACHED_BIT_AMD` are not part of the core Vulkan spec. gfxstream doesn't know what to do with them. The compositor asks for `HOST_VISIBLE | HOST_COHERENT` memory, gfxstream chokes on the extra AMD flags, the lookup fails.

I verified this by reading the [gfxstream source](https://github.com/google/gfxstream). The bug is a missing filter at three points:

In `vk_emulated_physical_device_memory.cpp`, host memory properties are copied to the guest verbatim:

```cpp
mHostMemoryProperties = hostMemoryProperties;
mGuestMemoryProperties = hostMemoryProperties;  // AMD flags included, no filtering
```

Later, when gfxstream strips `HOST_COHERENT_BIT` for certain configurations, it only strips the standard flag (0x4) and leaves the AMD-specific `DEVICE_COHERENT_BIT_AMD` (0x40) intact. The guest ends up with an inconsistent set of memory flags.

In `vk_decoder_global_state.cpp`, the extension filter list (`kEmulatedDeviceExtensions`) only blocks Android/Fuchsia/external-memory extensions. `VK_AMD_device_coherent_memory` is not in the list, so the guest thinks the extension is available and expects the non-standard memory types to work through gfxstream. They don't.

And in `transformToGuestMemoryRequirements()`, the `memoryTypeBits` are remapped by index but the property flags are never masked. AMD-specific flags pass straight through to the guest compositor, which has no idea what to do with them.

gfxstream should either strip AMD-specific memory property flags from guest memory types, or filter the `VK_AMD_device_coherent_memory` extension from the device extension list. It does neither.

RADV (Mesa's Vulkan driver for AMD) doesn't have this problem because it only exposes standard Vulkan memory types:

```
# RADV: 11 memory types, all standard
Type 0:  DEVICE_LOCAL                                (0x0001)
Type 1:  DEVICE_LOCAL                                (0x0001)
Type 2:  HOST_VISIBLE | HOST_COHERENT                (0x0006)
Type 3:  DEVICE_LOCAL | HOST_VISIBLE | HOST_COHERENT (0x0007)
Type 4:  DEVICE_LOCAL | HOST_VISIBLE | HOST_COHERENT (0x0007)
Type 5:  HOST_VISIBLE | HOST_COHERENT | HOST_CACHED  (0x000e)
...
```

No vendor extensions, no confusion, gfxstream maps everything correctly.

## The fix

Just remove AMDVLK:

```bash
sudo apt remove amdvlk
```

That's it. RADV (which ships with Mesa and is already installed on most Linux distros) becomes the only Vulkan driver. No environment variables, no per-app overrides, no profile files to worry about. Restart Android Studio and the emulator boots.

Verify:

```bash
vulkaninfo --summary 2>&1 | grep driverName
# Should show: radv
```

I initially tried a softer fix, setting `VK_ICD_FILENAMES` to force RADV while keeping AMDVLK installed. That works too, but it's fiddly. You have to put it in `~/.profile` (not `~/.bashrc`) because GUI apps like Android Studio don't source bash configs. And you have to remember to override it back if you ever want AMDVLK for something. Removing the package is simpler and I haven't missed it.

### Quick check: are you affected?

```bash
# Is AMDVLK installed?
dpkg -l | grep amdvlk

# Which driver is active?
vulkaninfo --summary 2>&1 | grep driverName
# "AMD open-source driver" = AMDVLK (problematic)
# "radv" = RADV (works)

# Do you have non-standard memory types?
vulkaninfo 2>&1 | grep DEVICE_COHERENT
# If this returns anything, AMDVLK is active
```

## AMDVLK vs RADV

AMD is [replacing AMDVLK with RADV](https://github.com/GPUOpen-Drivers/AMDVLK/discussions/416) as their official Vulkan driver on Linux. RADV is already the default on Steam Deck, Ubuntu, Fedora, and Arch. If you still have AMDVLK installed, now is a good time to remove it.

## Summary

If your Android emulator won't boot on an AMD GPU on Linux:

1. `adb logcat -d -b crash` -- look for Vulkan crashes
2. `vulkaninfo --summary | grep driverName` -- check your driver
3. If it says "AMD open-source driver":
   ```bash
   sudo apt remove amdvlk
   ```
4. Restart Android Studio and the emulator

I wish the emulator surfaced this error somewhere visible instead of silently hanging. But at least the logcat trail is clear once you know to look.
