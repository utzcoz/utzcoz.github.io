---
layout: post
title:  "How Taskbar start app in freeform windowing mode"
date:   2021-09-12 17:34 +0800
---

[Taskbar][1] is a awesome Android launcher which supports start app to [freefrom][3] windowing mode directly to provide desktop UI for Android user. And it is integrated into [Android-x86][6] and [BlissOS][7] as alternative launcher to provide desktop experience for users. If you are not familiar with it, you can visit [Taskbar's Google Play Store page][2] to download and experience it. This article is mainly used to introduce how Taskbar implements this feature, and which requirements of Android system needs to support Taskbar to start app in freeform windowing mode.

## It needs Android device supports freeform

At section "3.8.14. Multi-windows" of [Android 7.0 CDD][4], Google needs device implementation with screen size `xlarge` *should* support freeform mode:

> Device implementations MUST NOT offer split-screen or freeform mode if both the screen height and width is less than 440 dp.
>
> Device implementations with screen size xlarge SHOULD support freeform mode.

At [Android 11 CDD section multi-windows][5], it also keeps this definition and restriction. So if Android device has xlarge screen size, and it is released with CTS passed, we can assume it supports freeform windowing mode, and Taskbar can work correctly to start app with freeform windowing mode. There are also many Android variants to provide desktop experience for users support freeform windowing mode directly, such as Android-x86 and BlissOS.

If you are a ROM developer or Android frameworks developer, and you want to make your device to support freeform windowing mode, you need `config_freeformWindowManagement` config is set to true at your `frameworks/base/core/res/res/values/config.xml`. It is recommended to set it with vendor overrides as what I did for [boringdroid][9] at its [vendor_boringdroid][10] project. You also should copy `frameworks/native/data/etc/android.software.freeform_window_management.xml` to device `system/etc/permissions/android.software.freeform_window_management.xml` similar likes [boringdroid.mk at vendor_boringdroid][14]

If you are a normal Android user, you can enable `Enable freeform windows` item at `Settings`' `Developer Options` page by following [Android Policy's article "Freeform windows can be enabled in Android Q without hacks"][12].

## It needs app supports multi-window

[Android developer multi-window section][8] shows how app to declare itself that supports multi-window, including freeform windowing mode. It is very important, because not all apps can work correctly when you resizing its window to specific size. 

If you are a ROM developer or Android frameworks developer, and you want to force all activities resizable for freeform windowing mode or other multi-window modes, you can modify `ActivityManagerService` to force all activities resizable similar like [boringdroid commit: Make sure all activities support resizable][13]. From Android 10, we also can set `display.settings.xml=freeform` to your device, and set display to freeform, that will permit any Activity started on this display can enter freeform windowing mode. There is an example from [goldfish config.ini.freeform][15].

If you are an app developer, you can follow [official manual to prepare your app for large screens and multi-window][11] to ensure your app can work perfectly when it is in freeform windowing mode and other multi-window modes.

If you are a normal user, and you want to force all activities are resizable and let it can be started into freeform windowing mode by Taskbar, you can enable `Make all activities resizable for multi-window, regardless of manifest values` similar likes to enable freeform windows forcibly.

## Let's start an app with freeform windowing mode

> The following code snippets are both from [Taskbar's U.java][16].


When we start an app or an `Activity`, we can assign a `Bundle` to `startActivity` method. Android provides another class called [`ActivityOptions`][17] that can be serialized to `Bundle` to pass launching parameters related to this `Activity` to `frameworks`, and it will calculate the final windowing mode based on `ActivityOptions` and other display and device configs. If your display is freeform, and every `Activity` started on this display will enter freeform mode, if we don't specific any fixed fullscreen/split screen/picture in picture windowing mode with `ActivityOptions`. If you display is not freeform, and the Android devices support freeform, and the `Activity` will be started supports freeform, we can add freeform windowing mode to `ActivityOptions` and pass it to `startActivity`, and frameworks will let this `Activity` enter freeform windowing mode. It's very simle and clear, right?

But there are many restrictions for third-party apps, including Taskbar. The first difficulty is that old Android versions use stack id to represent freeform windowing mode at `ActivityOptions`, but new versions use windowing mode id to represent freeform windowing mode. So Taskbar should make a compatibility to set freeform windowing mode for `Activity` for different Android versions. The second thing is restriction on non-SDK interfaces. The methods of `ActivityOptions` to set freeform windowing mode is hidden, and we must use reflection to access them. [But from Android 9, Android restricts app to access hidden APIs][18]. Taskbar uses some tricks to bypass this restriction.

Let's start to dive into Taskbar's source code to see what it does to overcome those difficulties and let the function be realized.

The first station is `U#allowReflection()`:

```java
public static void allowReflection() {
    GlobalHelper helper = GlobalHelper.getInstance();
    if(helper.isReflectionAllowed()) return;

    try {
        Method forName = Class.class.getDeclaredMethod("forName", String.class);
        Method getDeclaredMethod = Class.class.getDeclaredMethod("getDeclaredMethod", String.class, Class[].class);

        Class<?> vmRuntimeClass = (Class<?>) forName.invoke(null, "dalvik.system.VMRuntime");
        Method getRuntime = (Method) getDeclaredMethod.invoke(vmRuntimeClass, "getRuntime", null);
        Method setHiddenApiExemptions = (Method) getDeclaredMethod.invoke(vmRuntimeClass, "setHiddenApiExemptions", new Class[]{String[].class});

        Object vmRuntime = getRuntime.invoke(null);
        setHiddenApiExemptions.invoke(vmRuntime, new Object[]{new String[]{"L"}});
    } catch (Throwable ignored) {}

    helper.setReflectionAllowed(true);
}
```

It's main work is to use reflection to get [VMRuntime#setHiddenApiExemptions][19] without restriction, and pass `L` as input to exempt all hidden APIs. Actually this method only work correctly on API 29 and earlier. If you also want to bypass this restriction on API 30, you can check [StackOverflow's question: Bypass Android's hidden API restrictions][20].

Now, Taskbar can use reflection to get hidden fields and call hidden methods. The next station is `U#getFreeformWindowModeId()`:

```java
// From android.app.ActivityManager.StackId
private static final int FULLSCREEN_WORKSPACE_STACK_ID = 1;
private static final int FREEFORM_WORKSPACE_STACK_ID = 2;

// From android.app.WindowConfiguration
private static final int WINDOWING_MODE_FULLSCREEN = 1;
private static final int WINDOWING_MODE_FREEFORM = 5;

private static int getFreeformWindowModeId() {
    if(getCurrentApiVersion() >= 28.0f)
        return WINDOWING_MODE_FREEFORM;
    else
        return FREEFORM_WORKSPACE_STACK_ID;
}
```
`U#getFreeformWindowModeId()` is used to get freeform windowing mode that defined in Android frameworks. Taskbar doesn't use reflection to get those hidden fields from `ActivityManager` or `WindowConfiguration`, and copy their values to its source code directly. The `U#getFreeformWindowModeId()` will return different values for different Android versions.

When it gets correct freeform windowing mode id, and it will pass it to `ActivityOptions` at `U#getActivityOptions(Context context, ApplicationType applicationType, View view)`:

```java
if(stackId != -1) {
    allowReflection();
    try {
        Method method = ActivityOptions.class.getMethod(getWindowingModeMethodName(), int.class);
        method.invoke(options, stackId);
    } catch (Exception ignored) {}
}
```

The `U#getActivityOptions(Context context, ApplicationType applicationType, View view)` uses `U#allowReflection()` shown above to access hidden API of `ActivityOptions`. It use `U#getWindowingModeMethodName()` to get API to pass freeform windowing mode id for different Android versions:

```java
private static String getWindowingModeMethodName() {
    if(getCurrentApiVersion() >= 28.0f)
        return "setLaunchWindowingMode";
    else
        return "setLaunchStackId";
}
```

Those APIs are not exposed publicly, so Google can change it if need. The user such as Taskbar must make itself methods compatible with different Android versions.

After setting correct freeform windowing mode id for `ActivityOptions`, the next station is to set launch bounds or window bounds to `Activity`'s `ActivityOptions`. It is at `getActivityOptionsBundle(Context context,ApplicationType applicationType, View view, int left, int top, int right, int bottom)`:

```java
ActivityOptions options = getActivityOptions(context, applicationType, view);
if(options == null) return null;

if(Build.VERSION.SDK_INT < Build.VERSION_CODES.N)
    return options.toBundle();

return options.setLaunchBounds(new Rect(left, top, right, bottom)).toBundle();
```

The launch bounds is the initial bounds of `Activity`'s window after it started. Actually, Taskbar can't get final bounds before window closed. So it uses default bounds for `Activity` when every start. To fix this problem, I have added a commit [Support persist window bounds][21] to ignore launch bounds from `ActivityOptions` and keep bounds at frameworks/base.

## Summary

It's very clear how Taskbar start app with freeform windowing mode. If app and system supports freeform windowing mode, it uses reflection to get freeform windowing mode id and pass it to `ActivityOptions`. And it will use `startActivity` with `Bundle` generated from `ActivityOptions` to tell frameworks to start specific `Activity` or app to freeform windowing mode. When we start an app from Launcher, we actually start its main `Activity`, so there some mix-uses between `Activity` and app. If you're clear about it, just going head to implement your custom launcher to start app in freeform windowing mode.

[1]: <https://github.com/farmerbb/Taskbar> "Taskbar GitHub page"
[2]: <https://play.google.com/store/apps/details?id=com.farmerbb.taskbar> "Taskbar Google Play Store page"
[3]: <https://www.xda-developers.com/android-nougats-freeform-window-mode-what-it-is-and-how-developers-can-utilize-it/> "XDA article to describe freeform windowing mode from Android 7"
[4]: <https://source.android.com/compatibility/7.0/android-7.0-cdd> "Android 7.0 CDD"
[5]: <https://source.android.com/compatibility/11/android-11-cdd#3_8_14_multi-windows> "Android 11 CDD section multi-windows"
[6]: <https://www.android-x86.org/> "Android-x86"
[7]: <https://blissos.org/> "BlissOS"
[8]: <https://developer.android.com/guide/topics/ui/multi-window#multi-window> "Android developer document page to show how app to declare itself that supports multi-window"
[9]: <https://boringdroid.github.io/> "boringdroid site"
[10]: <https://github.com/boringdroid/vendor_boringdroid/blob/boringdroid-11.0.0/overlay/frameworks/base/core/res/res/values/config.xml#L20-L22> "boringdroid frameworks/base config.xml overrides"
[11]: <https://developer.android.com/guide/topics/ui/responsive-layout-overview> "Official manual to prepare your app for large screens and multi-window"
[12]: <https://www.androidpolice.com/2019/03/14/freeform-windows-can-be-enabled-in-android-q-without-hacks/> "Enable freeform windowing mode from settings app"
[13]: <https://github.com/boringdroid/platform_frameworks_base/commit/155e81cae95e225f190a02643a2a9330f9ffa139> "boringdroid commit: Make sure all activities support resiable"
[14]: <https://github.com/boringdroid/vendor_boringdroid/blob/boringdroid-11.0.0/boringdroid.mk> "boringdroid.mk at vendor_boringdroid"
[15]: <https://cs.android.com/android/platform/superproject/+/master:device/generic/goldfish/data/etc/config.ini.freeform> "config.ini.freeform"
[16]: <https://github.com/farmerbb/Taskbar/blob/65fa0006b876b8efdb500a9edde672f7ea82faf3/app/src/main/java/com/farmerbb/taskbar/util/U.java> "Taskbar's U.java"
[17]: <https://developer.android.com/reference/android/app/ActivityOptions> "ActivityOptions API page"
[18]: <https://developer.android.com/guide/app-compatibility/restrictions-non-sdk-interfaces> " Restrictions on non-SDK interfaces"
[19]: <https://cs.android.com/android/platform/superproject/+/master:libcore/libart/src/main/java/dalvik/system/VMRuntime.java;l=517?q=VMRuntime> "VMRuntime#setHiddenApiExemptions"
[20]: <https://stackoverflow.com/questions/55970137/bypass-androids-hidden-api-restrictions> "StackOverflow's question: Bypass Android's hidden API restrictions"
[21]: <https://osdn.net/projects/android-x86/scm/git/frameworks-base/commits/f3b4e6b21d6372c2118cf7f200469c897b296929> "Android-x86 pie-x86 commit: Support persist window bounds"