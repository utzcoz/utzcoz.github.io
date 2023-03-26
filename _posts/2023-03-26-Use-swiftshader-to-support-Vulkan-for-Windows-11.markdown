---
layout: post
title:  "Use swiftshader to support Vulkan for Windows 11 that runs in the VirtualBox"
date:   2023-03-26 14:05 +0800
---

# Purpose

I want to build and run Vulkan applications on Windows 11 that runs in VirtualBox. I have tried to upgrade VirtualBox to 7.x, a version with GPU improvements, but it didn't enable the supporting for Vulkan. So I decide to use [swiftshader](1).

# Build

```Bash
git clone https://github.com/google/swiftshader.git --recursive
cd build
cmake .. -DSWIFTSHADER_ENABLE_VULKAN_DEBUGGER=0 -G "Visual Studio 17 2022"
cmake --build . --config Release
```

You can change the generate "Visual Studio 17 2022" based on your environment. I think "Visual Studio 16 2019" also can work.

We need to set `SWIFTSHADER_ENABLE_VULKAN_DEBUGGER` to 0 explicitly to avoid that system shows "Wait to debugger" dialog when running Vulkan applications.

After building, we can get related configuration files and dll files in the directory `swiftshader/build/Windows`.

# Configure the swiftshader as the default Vulkan driver

We need to add the full path of `vk_swiftshader_icd.json` like `C:\Users\test\swiftshader\build\Windows\vk_swiftshader_icd.json` to the system environment variable called [`VK_DRIVER_FILES`](2). THe `VK_DRIVER_FILES` will tell the the Vulkan loader the driver icd configuration file of `swiftshader`. And the Vulkan loader can find necessary `swiftshader` driver files based on this icd configuration json file. 

# Run Vulkan application

We can run Vulkan application with a CPU based Vulkan driver now.


[1]: <https://github.com/google/swiftshader> "swiftshader"
[2]: <https://github.com/KhronosGroup/Vulkan-Loader/blob/main/docs/LoaderInterfaceArchitecture.md#table-of-debug-environment-variables> "VK_DRIVER_FILES"