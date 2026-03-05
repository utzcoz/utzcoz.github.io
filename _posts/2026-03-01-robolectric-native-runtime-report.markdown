---
layout: post
title:  "Robolectric Native Runtime: Architecture & Implementation Report"
date:   2026-03-01 16:00 +0800
categories: [Testing]
tags: [robolectric, native-runtime, jni, testing]
---

## 1. Introduction

Robolectric is the de-facto standard for running Android unit tests on the JVM without a device or
emulator. Historically, Robolectric used hand-written Java "shadow" classes to approximate the
behavior of Android framework native code. Starting around Android O (API 26), Robolectric
introduced **Native Runtime** — a mechanism to load *real* AOSP native libraries (compiled for
host platforms) and delegate Android framework native method calls to them, yielding
pixel-accurate graphics, real SQLite behavior, and authentic text layout.

This report documents how the Robolectric Native Runtime works within the AOSP main source tree:
its architecture, the native libraries involved, how they are compiled for host platforms, how
they are integrated via JNI, and how the shadow layer delegates to them.

---

## 2. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Robolectric Test (JVM)                        │
├──────────────────────────────────────────────────────────────────────┤
│  Test Code (JUnit)                                                   │
│       │                                                              │
│       ▼                                                              │
│  Android Framework Classes (android.graphics.*, android.database.*)  │
│       │  (bytecode-instrumented by Robolectric Sandbox)              │
│       ▼                                                              │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │           Shadow Layer (ShadowNative* classes)                 │  │
│  │  ShadowNativePaint, ShadowNativeBitmap, ShadowNativeCanvas,   │  │
│  │  ShadowNativeSQLiteConnection, ShadowNativeTypeface, ...      │  │
│  │       │                                                        │  │
│  │       ▼                                                        │  │
│  │  Natives Delegate Classes (*Natives.java)                      │  │
│  │  PaintNatives, BitmapNatives, SQLiteConnectionNatives, ...     │  │
│  │       │  (declare Java native methods)                         │  │
│  │       ▼                                                        │  │
│  │  DefaultNativeRuntimeLoader                                    │  │
│  │  - Detects OS/arch, extracts .so/.dylib/.dll from JAR          │  │
│  │  - Sets system properties for class registration               │  │
│  │  - Calls System.load() on the native library                   │  │
│  │  - Copies fonts, ICU data to temp directory                    │  │
│  └────────────────────────────────────────────────────────────────┘  │
│       │  JNI / System.load()                                         │
│       ▼                                                              │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │      Host Native Shared Library (libandroid_runtime.so)        │  │
│  │      ┌──────────────────────────────────────────────────────┐  │  │
│  │      │ HostRuntime.cpp (JNI_OnLoad entry point)             │  │  │
│  │      │  → register_android_core_classes()                   │  │  │
│  │      │  → register_android_graphics_classes()               │  │  │
│  │      │  → loadIcuData(), property_initialize_ro_cpu_abilist │  │  │
│  │      └──────────────────────────────────────────────────────┘  │  │
│  │      ┌──────────────────────────────────────────────────────┐  │  │
│  │      │ libhwui (statically linked for host)                 │  │  │
│  │      │  - Skia CPU pipeline (HWUI_NULL_GPU mode)            │  │  │
│  │      │  - Bitmap, Canvas, Paint, Path, Typeface, etc.       │  │  │
│  │      │  - Text: LineBreaker, MeasuredText, TextRunShaper    │  │  │
│  │      │  - RenderNode, RenderEffect, HardwareRenderer        │  │  │
│  │      └──────────────────────────────────────────────────────┘  │  │
│  │      ┌──────────────────────────────────────────────────────┐  │  │
│  │      │ Other statically linked host libraries               │  │  │
│  │      │  libskia, libandroidfw, libsqlite, libminikin,       │  │  │
│  │      │  libharfbuzz_ng, libft2, libpng, libjpeg, libwebp,   │  │  │
│  │      │  libicu, libz, libhostgraphics, ...                  │  │  │
│  │      └──────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Supported Host Platforms

The native runtime supports the following host configurations
(from `DefaultNativeRuntimeLoader.isSupported()`):

| OS      | Architecture | Library Name                              |
|---------|-------------|-------------------------------------------|
| Linux   | x86_64      | `libandroid_runtime.so` (V+) / `librobolectric-nativeruntime.so` (pre-V) |
| macOS   | x86_64      | `libandroid_runtime.dylib` (V+) / `librobolectric-nativeruntime.dylib` (pre-V) |
| macOS   | aarch64     | `libandroid_runtime.dylib` (V+) / `librobolectric-nativeruntime.dylib` (pre-V) |
| Windows | x86_64      | `libandroid_runtime.dll` (V+) / `robolectric-nativeruntime.dll` (pre-V) |

> **Source evidence**: `DefaultNativeRuntimeLoader.java` lines 325–329:
> ```java
> return (OsUtil.isMac()
>         && (Objects.equals(arch(), "aarch64") || Objects.equals(arch(), "x86_64")))
>     || (OsUtil.isLinux() && Objects.equals(arch(), "x86_64"))
>     || (OsUtil.isWindows() && Objects.equals(arch(), "x86_64"));
> ```

---

## 4. Native Libraries: What Gets Compiled & How

### 4.1 The Core Library: `libandroid_runtime`

The primary native shared library is `libandroid_runtime`, defined in
`frameworks/base/core/jni/Android.bp` (line 512).

**Key characteristics:**
- `host_supported: true` — enabled for host builds
- Inherits from `libandroid_runtime_defaults` which includes both core JNI and graphics JNI code
- On host, uses a **static linking** strategy for most dependencies (libhwui, libskia, libsqlite,
  etc.) to produce a self-contained `.so`

**Host-specific source files** (`frameworks/base/core/jni/Android.bp` lines 440–508):
```
platform/host/HostRuntime.cpp      ← Main JNI_OnLoad entry point
platform/host/native_window_jni.cpp ← Stub native window for host
```

**Host-specific static libraries** (line 451–479):
```
libandroidfw          (Android Framework resources)
libhostgraphics       (Host stubs for graphics surfaces)
libhwui               (Hardware UI / graphics engine)
libft2                (FreeType font rendering)
libharfbuzz_ng        (Text shaping)
libminikin            (Text layout)
libsqlite             (SQLite database engine)
libskia               (2D graphics engine)
libpng, libjpeg, libwebp  (Image codecs)
libz                  (Compression)
libnativehelper_jvm   (JNI helper for host JVM)
libultrahdr           (Ultra HDR support)
```

> **Source evidence**: `frameworks/base/core/jni/Android.bp` lines 451–479.

### 4.2 `libhwui` — The Graphics Engine

`libhwui` is defined in `frameworks/base/libs/hwui/Android.bp` (line 726) with
`host_supported: true`.

**Host mode differences:**
- Compiled with `-DHWUI_NULL_GPU` — disables GPU acceleration, uses **Skia CPU pipeline** only
- Uses `platform/host/` stub implementations for:
  - `renderthread/RenderThread.cpp` — simplified single-threaded rendering
  - `renderthread/CacheManager.cpp` — no GPU cache needed
  - `Readback.cpp` — stub readback
  - `WebViewFunctorManager.cpp` — no WebView support on host
- Includes `libhostgraphics` as substitute for real `libgui`/`libnativewindow`

> **Source evidence**: `frameworks/base/libs/hwui/Android.bp` lines 699–722:
> ```
> host: {
>     srcs: [
>         "platform/host/renderthread/CacheManager.cpp",
>         "platform/host/renderthread/RenderThread.cpp",
>         ...
>     ],
>     cflags: [
>         "-DHWUI_NULL_GPU",
>         "-DNULL_GPU_MAX_TEXTURE_SIZE=4096",
>     ],
> },
> ```

### 4.3 `libhostgraphics` — Host Surface Stubs

Defined in `frameworks/base/libs/hostgraphics/Android.bp`, this library provides
host-compatible stubs for Android-specific display and surface APIs:
- `ANativeWindow.cpp` — stub native window
- `Fence.cpp` — stub sync fence
- `HostBufferQueue.cpp` — stub buffer queue
- `PublicFormat.cpp` — image format utilities
- `ADisplay.cpp` — stub display

### 4.4 Pre-V: `librobolectric-nativeruntime` (Prebuilt)

For Android SDK versions prior to V (VanillaIceCream), the native library is called
`librobolectric-nativeruntime` and ships as **prebuilt binaries** in two forms:

1. **In AOSP**: `prebuilts/misc/common/robolectric-native-prebuilt/`
   - `native/linux/x86_64/librobolectric-nativeruntime.so`
   - `native/mac/librobolectric-nativeruntime.dylib`

2. **In Gradle/Maven**: The `nativeruntime-dist-compat` artifact (version 1.0.17)
   published to Maven Central.

> **Source evidence**: `prebuilts/misc/common/robolectric-native-prebuilt/Android.bp`:
> ```
> // Releases including and since VanillaIceCream ships with a libandroid_runtime.so
> // equivalent to the librobolectric-nativeruntime.so included in this artifact.
> name: "robolectric_nativeruntime_native_prebuilt"
> ```

### 4.5 V+ (Android 15+): `libandroid_runtime` (Built from AOSP)

Starting with Android V, Robolectric uses the **same `libandroid_runtime.so`** that AOSP builds
for host. This library is packaged as a JAR via a `java_genrule`:

> **Source evidence**: `external/robolectric/Android.bp` lines 65–75:
> ```
> java_genrule {
>     name: "libandroid_runtime_jar",
>     host_first_srcs: [":libandroid_runtime"],
>     out: ["libandroid_runtime.jar"],
>     cmd: "mkdir -p ./native/linux/x86_64/ && " +
>         "cp $(location :libandroid_runtime) ./native/linux/x86_64/ && " +
>         "$(location soong_zip) -o $(location libandroid_runtime.jar) -D ./native",
> }
> ```

The resulting JAR is then bundled into `robolectric-host-android_all` (line 123–157).

---

## 5. JNI Registration Mechanism

### 5.1 Two-Phase Registration (V+)

For Android V and above, JNI registration uses a **class-name-driven dynamic lookup** mechanism.
The classes to register are communicated via Java system properties:

```
System.setProperty("core_native_classes", "android.database.CursorWindow,...");
System.setProperty("graphics_native_classes", "android.graphics.Bitmap,...");
System.setProperty("method_binding_format", "$$robo$$${method}$nativeBinding");
```

**Phase 1 — Core Classes** (from `HostRuntime.cpp` → `register_android_core_classes()`):
- Reads `core_native_classes` system property
- Looks up each class name in `gRegJNIMap` (an `unordered_map<string, RegJNIRec>`)
- Calls the corresponding `register_*()` function

**Phase 2 — Graphics Classes** (from `LayoutlibLoader.cpp` → `register_android_graphics_classes()`):
- Reads `graphics_native_classes` system property
- Uses a similar map in `LayoutlibLoader.cpp`

### 5.2 Method Name Rewriting

A critical mechanism is **JNI method name rewriting**. Normally, JNI maps `native void nFoo()` in
class `android.graphics.Paint` to a C function `Java_android_graphics_Paint_nFoo`. But Robolectric's
bytecode instrumentor **replaces** native methods with Java stubs and creates a separate native
binding method with a mangled name.

The format is: `$$robo$$<method>$nativeBinding`

This is set via:
```java
System.setProperty("method_binding_format", "$$robo$$${method}$nativeBinding");
```

On the native side, `graphics_jni_helpers.h` contains `jniRegisterMaybeRenamedNativeMethods()`
which transforms each JNI method registration to use the rewritten name format:

```cpp
// For method "nInit", registers as "$$robo$$nInit$nativeBinding" instead
std::string modifiedName = jniMethodFormat;
modifiedName.replace(methodNamePos, 9, gMethods[i].name);
```

> **Source evidence**: `frameworks/base/libs/hwui/jni/graphics_jni_helpers.h` lines 95–123.

### 5.3 Bytecode Instrumentation

Robolectric's `ClassInstrumentor` (in the `sandbox` module) transforms native methods:

1. **Original**: `native long nInit()` in `android.graphics.Paint`
2. **After instrumentation**:
   - `nInit()` — becomes a non-native Java method that delegates to shadow/handler
   - `$$robo$$nInit$nativeBinding()` — a new **native** method for actual JNI binding

When `callNativeMethodsByDefault = true` on a shadow and no explicit shadow method is found,
`ShadowWrangler` routes the call to the `$nativeBinding` method:

```java
// ShadowWrangler.java line 166-168
Method method = definingClass.getDeclaredMethod(
    ShadowConstants.ROBO_PREFIX + name + "$nativeBinding", paramTypes);
```

> **Source evidence**: `sandbox/src/main/java/.../ClassInstrumentor.java` lines 574–589,
> `ShadowWrangler.java` lines 160–174.

---

## 6. Core Native Class Registrations

### 6.1 Core Classes (`CORE_CLASS_NATIVES`)

These are non-graphics native classes registered for Android V+:

| Class | Native Registration Function | Primary Native Library |
|-------|------------------------------|----------------------|
| `android.animation.PropertyValuesHolder` | `register_android_animation_PropertyValuesHolder` | libandroid_runtime |
| `android.database.CursorWindow` | `register_android_database_CursorWindow` | libandroid_runtime |
| `android.database.sqlite.SQLiteConnection` | `register_android_database_SQLiteConnection` | libandroid_runtime → libsqlite |
| `android.database.sqlite.SQLiteRawStatement` | `register_android_database_SQLiteRawStatement` | libandroid_runtime → libsqlite |
| `android.media.ImageReader` | `register_android_media_ImageReader` | libandroid_runtime |
| `android.view.Surface` | `register_android_view_Surface` | libandroid_runtime |
| `com.android.internal.util.VirtualRefBasePtr` | `register_com_android_internal_util_VirtualRefBasePtr` | libandroid_runtime |
| `libcore.util.NativeAllocationRegistry` | `register_libcore_util_NativeAllocationRegistry` | HostRuntime.cpp |

> **Source evidence**: `DefaultNativeRuntimeLoader.java` lines 59–70.

### 6.2 Graphics Classes (`GRAPHICS_CLASS_NATIVES`)

These are graphics-related native classes (40+ classes):

| Category | Classes |
|----------|---------|
| **Bitmap** | `Bitmap`, `BitmapFactory`, `NinePatch`, `ImageDecoder` |
| **Canvas** | `Canvas`, `RecordingCanvas`, `Picture` |
| **Drawing** | `Paint`, `Shader`, `ColorFilter`, `MaskFilter`, `PathEffect`, `RenderEffect` |
| **Geometry** | `Path`, `PathIterator`, `PathMeasure`, `Matrix`, `Region` |
| **Text** | `Typeface`, `Font`, `FontFamily`, `LineBreaker`, `MeasuredText`, `TextRunShaper` |
| **Render** | `RenderNode`, `HardwareRenderer`, `HardwareRendererObserver` |
| **Animation** | `AnimatedVectorDrawable`, `AnimatedImageDrawable`, `VectorDrawable`, `NativeInterpolatorFactory`, `RenderNodeAnimator` |
| **Color** | `Color`, `ColorSpace` |
| **Other** | `Interpolator`, `Gainmap`, `DrawFilter`, `Camera`, `YuvImage` |

> **Source evidence**: `DefaultNativeRuntimeLoader.java` lines 73–121.

---

## 7. Shadow → Native Delegation Flow

```
┌──────────────────────────────────────────────────────────────────┐
│  Test code:  Paint paint = new Paint();                          │
│                                                                  │
│  1. Android Paint constructor calls native method nInit()        │
│                                                                  │
│  2. Instrumented nInit() → ClassHandler → ShadowWrangler         │
│                                                                  │
│  3. ShadowWrangler finds ShadowNativePaint                       │
│     → @Implementation nInit() method exists:                     │
│       a) Calls DefaultNativeRuntimeLoader.injectAndLoad()        │
│       b) Ensures native library is loaded                        │
│       c) Delegates to PaintNatives.nInit()                       │
│                                                                  │
│  4. PaintNatives.nInit() is a Java native method                 │
│     → JNI resolves to $$robo$$nInit$nativeBinding                │
│     → Calls C++ Paint_init() in libhwui's jni/Paint.cpp         │
│     → Creates real SkPaint object via Skia                       │
│     → Returns native pointer as jlong                            │
│                                                                  │
│  For V+ with callNativeMethodsByDefault = true:                  │
│  If no explicit shadow method exists, ShadowWrangler             │
│  routes directly to $$robo$$<method>$nativeBinding               │
└──────────────────────────────────────────────────────────────────┘
```

### 7.1 Shadow Example: `ShadowNativePaint`

```java
@Implements(value = Paint.class, minSdk = O, callNativeMethodsByDefault = true)
public class ShadowNativePaint {
    @Implementation(minSdk = O, maxSdk = U.SDK_INT)
    protected static long nInit() {
        DefaultNativeRuntimeLoader.injectAndLoad();  // Ensure library loaded
        ShadowNativeTypeface.ensureInitialized();    // Dependency init
        return PaintNatives.nInit();                 // Delegate to real native
    }
    // For V+, most methods use callNativeMethodsByDefault
    // and don't need explicit shadow implementations
}
```

> **Source evidence**: `shadows/framework/.../ShadowNativePaint.java` lines 36–50.

### 7.2 Shadow Example: `ShadowNativeSQLiteConnection`

```java
@Implements(className = "android.database.sqlite.SQLiteConnection",
            callNativeMethodsByDefault = true)
public class ShadowNativeSQLiteConnection extends ShadowSQLiteConnection {
    @Implementation(minSdk = O_MR1, maxSdk = U.SDK_INT)
    protected static long nativeOpen(String path, int openFlags, ...) {
        DefaultNativeRuntimeLoader.injectAndLoad();
        return PerfStatsCollector.getInstance()
            .measure("androidsqlite",
                () -> SQLiteConnectionNatives.nativeOpen(path, openFlags, ...));
    }
}
```

> **Source evidence**: `shadows/framework/.../ShadowNativeSQLiteConnection.java` lines 46–66.

---

## 8. Resource Loading & Initialization

### 8.1 Native Library Loading Flow

```
DefaultNativeRuntimeLoader.ensureLoaded()
│
├── 1. Check isSupported() — verify OS/arch
├── 2. Create TempDirectory("nativeruntime")
├── 3. maybeCopyFonts() — extract fonts from JAR to temp dir
│      └── Sets: robolectric.nativeruntime.fontdir=/tmp/.../fonts/
├── 4. maybeCopyIcuData() — extract ICU data file
│      └── Sets: icu.data.path=/tmp/.../icu/icudt68l.dat
│      └── Sets: icu.locale.default=<default locale tag>
├── 5. [V+ only] Set system properties:
│      ├── core_native_classes=android.database.CursorWindow,...
│      ├── graphics_native_classes=android.graphics.Bitmap,...
│      └── method_binding_format=$$robo$$${method}$nativeBinding
├── 6. loadLibrary() — extract .so/.dylib/.dll and System.load()
│      └── Looks up: native/<os>/<arch>/libandroid_runtime.so
├── 7. [V+ only] invokeDeferredStaticInitializers()
│      └── Calls __staticInitializer__ on classes that need
│          deferred init after JNI registration
└── 8. [V+ only] Typeface.loadPreinstalledSystemFontMap()
```

> **Source evidence**: `DefaultNativeRuntimeLoader.java` lines 176–218.

### 8.2 Library Path Convention

Native libraries are stored in JAR resources at:
```
native/<os>/<arch>/<library_name>
```

Examples:
```
native/linux/x86_64/libandroid_runtime.so
native/mac/x86_64/libandroid_runtime.dylib
native/mac/aarch64/libandroid_runtime.dylib
native/windows/x86_64/libandroid_runtime.dll
```

> **Source evidence**: `DefaultNativeRuntimeLoader.java` lines 332–334.

### 8.3 Bundled Resources

The `nativeruntime` module includes these runtime resources:

| Resource | Purpose |
|----------|---------|
| `fonts/*.ttf` | System fonts (100+ font files including Roboto, Noto families) |
| `fonts/fonts.xml` | Font family configuration |
| `icu/icudt68l.dat` | ICU data (internationalization, date/number formatting, collation) |
| `arsc/` | Android compiled resource data |

---

## 9. AOSP Build Integration (Soong)

### 9.1 Module Dependency Graph

```
Robolectric_all (java_library_host)
├── Robolectric_nativeruntime (java_library_host)
│   ├── robolectric_nativeruntime_native_prebuilt (pre-V prebuilt .so/.dylib)
│   ├── Robolectric_sandbox
│   ├── Robolectric_resources
│   └── Robolectric_pluginapi
├── Robolectric_shadows_framework (shadows layer)
├── Robolectric_robolectric
├── robolectric-host-android_all (java_library)
│   ├── robolectric_android-all-device-deps (framework JARs)
│   │   ├── framework-all, core-libart-for-host, services, ...
│   ├── libandroid_runtime_jar (native .so in JAR for V+)
│   │   └── :libandroid_runtime (cc_library_shared, host)
│   ├── robolectric_framework_res
│   ├── robolectric_props_jar (build.prop via robolectric.go)
│   └── icu-data_host_robolectric
└── ...
```

### 9.2 `android_robolectric_test` Module Type

Platform tests use the `android_robolectric_test` Soong module type which:
1. Adds `Robolectric_all` as a runtime dependency
2. Sets up the classpath with `robolectric-host-android_all`
3. Runs tests on the host JVM with the native library available

### 9.3 `robolectric_build_props`

A custom Soong module (`soong/robolectric.go`) generates a `build.prop` file with
platform-specific properties (SDK version, codename, etc.) that Robolectric reads at runtime:

```go
// soong/robolectric.go
"ro.build.version.sdk=" + ctx.Config().PlatformSdkVersion().String(),
"ro.build.version.release=" + ctx.Config().PlatformVersionName(),
"ro.build.version.codename=" + ctx.Config().PlatformSdkCodename(),
```

> **Source evidence**: `soong/robolectric.go` lines 42–86.

---

## 10. JNI_OnLoad & Native Entry Point

When `System.load()` loads the native library, `JNI_OnLoad` in `HostRuntime.cpp` runs:

```cpp
JNIEXPORT jint JNI_OnLoad(JavaVM* vm, void*) {
    JNIEnv* env = nullptr;
    vm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6);

    // Check if base host runtime should be initialized
    string useBaseHostRuntime = getJavaProperty(env, "use_base_native_hostruntime", "true");
    if (useBaseHostRuntime == "true") {
        Vector<String8> args;
        HostRuntime runtime;
        runtime.onVmCreated(env);   // Store JavaVM reference
        runtime.start("HostRuntime", args, false);  // Register JNI + init
    }
    return JNI_VERSION_1_6;
}
```

`HostRuntime::start()` triggers:
1. `setJniMethodFormat()` — reads `method_binding_format` property for method renaming
2. `startReg()` → `register_android_core_classes()` + `register_android_graphics_classes()`
3. `onStarted()` → `loadIcuData()`, `property_initialize_ro_cpu_abilist()`, set locale

> **Source evidence**: `frameworks/base/core/jni/platform/host/HostRuntime.cpp` lines 296–306.

---

## 11. Version Evolution (Pre-V vs V+)

| Aspect | Pre-V (≤ API 34) | V+ (API 35+) |
|--------|-------------------|--------------|
| Library name | `librobolectric-nativeruntime.{so,dylib,dll}` | `libandroid_runtime.{so,dylib,dll}` |
| Source | Built externally, shipped as prebuilt (`nativeruntime-dist-compat`) | Built from AOSP source via Soong |
| JNI registration | Implicit via native method names | Explicit class-name-driven with system properties |
| Method binding | Standard JNI naming | Renamed via `$$robo$$${method}$nativeBinding` pattern |
| Shadow style | Explicit `@Implementation` for each native method | `callNativeMethodsByDefault = true` — most methods auto-delegate |
| Static initializers | N/A | Deferred via `invokeDeferredStaticInitializers()` |

> **Source evidence**: `DefaultNativeRuntimeLoader.java` lines 336–343, 387–389.

---

## 12. Shadow Inventory

There are **88 ShadowNative* files** in `shadows/framework/src/main/java/.../shadows/`,
covering these major subsystems:

| Subsystem | Key Shadows | Native Delegate |
|-----------|-------------|-----------------|
| **Graphics Core** | ShadowNativeBitmap, ShadowNativeBitmapFactory, ShadowNativeCanvas, ShadowNativeBaseCanvas, ShadowNativeRecordingCanvas | BitmapNatives, BitmapFactoryNatives, CanvasNatives, BaseCanvasNatives, RecordingCanvasNatives |
| **Drawing** | ShadowNativePaint, ShadowNativeShader, ShadowNativeColorFilter, ShadowNativePathEffect, ShadowNativeMaskFilter | PaintNatives, ShaderNatives, ColorFilterNatives, PathEffectNatives, MaskFilterNatives |
| **Geometry** | ShadowNativePath, ShadowNativePathMeasure, ShadowNativeMatrix, ShadowNativeRegion, ShadowNativePathIterator | PathNatives, PathMeasureNatives, MatrixNatives, RegionNatives, PathIteratorNatives |
| **Text/Font** | ShadowNativeTypeface, ShadowNativeFont, ShadowNativeFontFamily, ShadowNativeLineBreaker, ShadowNativeMeasuredText | TypefaceNatives, FontBuilderNatives, FontFamilyNatives, LineBreakerNatives, MeasuredTextNatives |
| **Render Pipeline** | ShadowNativeRenderNode, ShadowNativeHardwareRenderer, ShadowNativeRenderEffect | RenderNodeNatives, HardwareRendererNatives, RenderEffectNatives |
| **Animation** | ShadowNativeAnimatedVectorDrawable, ShadowNativeVectorDrawable, ShadowNativeRenderNodeAnimator | AnimatedVectorDrawableNatives, VectorDrawableNatives, RenderNodeAnimatorNatives |
| **Database** | ShadowNativeSQLiteConnection, ShadowNativeSQLiteRawStatement, ShadowNativeCursorWindow | SQLiteConnectionNatives, CursorWindowNatives |
| **Image** | ShadowNativeImageDecoder, ShadowNativeImageReader, ShadowNativeAnimatedImageDrawable | ImageDecoderNatives, ImageReaderNatives, AnimatedImageDrawableNatives |
| **Color** | ShadowNativeColor, ShadowNativeColorSpaceRgb, ShadowNativeBlendModeColorFilter | ColorNatives, ColorSpaceRgbNatives, BlendModeColorFilterNatives |
| **Surface** | ShadowNativeSurface | SurfaceNatives |
| **Resources** | ShadowNativeApkAssets, ShadowNativeAssetManager, ShadowNativeStringBlock, ShadowNativeXmlBlock | (via libandroidfw) |

---

## 13. Compiled Native Library Dependency Tree

The following is a summary of major native libraries statically linked into the host
`libandroid_runtime.so` and their roles:

```
libandroid_runtime.so (host shared library)
│
├── HostRuntime.cpp — JNI_OnLoad, AndroidRuntime host impl
├── android_database_SQLiteConnection.cpp — SQLite JNI bindings
├── android_database_CursorWindow.cpp — CursorWindow JNI
├── android_view_Surface.cpp — Surface JNI
├── android_animation_PropertyValuesHolder.cpp — Animation JNI
├── com_android_internal_util_VirtualRefBasePtr.cpp — RefBase JNI
│
├── libhwui (static, compiled with HWUI_NULL_GPU)
│   ├── LayoutlibLoader.cpp / jni_runtime.cpp — Graphics JNI registration
│   ├── jni/Paint.cpp, jni/Bitmap.cpp, jni/Canvas.cpp, ... — All graphics JNI
│   ├── hwui/Bitmap.cpp, hwui/Canvas.cpp, hwui/Typeface.cpp — Core graphics impl
│   ├── pipeline/skia/SkiaCpuPipeline.cpp — CPU-only rendering
│   └── platform/host/* — Host-specific stubs
│
├── libskia (static) — Google's 2D graphics engine
├── libminikin (static) — Android text layout engine
├── libharfbuzz_ng (static) — Unicode text shaping
├── libft2 (static) — FreeType font rasterization
├── libandroidfw (static) — Android framework (resources, assets)
├── libsqlite (static) — SQLite database engine
├── libpng (static) — PNG codec
├── libjpeg (static) — JPEG codec
├── libwebp-decode/encode (static) — WebP codec
├── libz (static) — zlib compression
├── libhostgraphics (static) — Host stubs for ANativeWindow, Fence, etc.
├── libicu{i18n,uc} (static) — ICU internationalization
├── libbase (static) — Android base/logging
├── libcutils (static) — Android core utilities
├── liblog (static) — Android logging
└── libutils (static) — Android utility library
```

---

## 14. The `nativeruntime-dist-compat` Maven Artifact

For external (non-AOSP) Gradle builds, Robolectric distributes prebuilt native libraries as
the Maven artifact `org.robolectric:nativeruntime-dist-compat` (current version: `1.0.17`).

This JAR contains pre-compiled native shared libraries for all supported platforms:
```
native/linux/x86_64/librobolectric-nativeruntime.so
native/mac/x86_64/librobolectric-nativeruntime.dylib
native/mac/aarch64/librobolectric-nativeruntime.dylib
native/windows/x86_64/robolectric-nativeruntime.dll
```

It is used in the Gradle build via:
```kotlin
// nativeruntime/build.gradle.kts
implementation(libs.robolectric.nativeruntime.dist.compat)
```

The CI workflow `.github/workflows/graphics_tests.yml` runs graphics tests on all four
platform configurations (Linux x86_64, macOS x86_64, macOS arm64, Windows x86_64).

> **Source evidence**: `gradle/libs.versions.toml` line 2, 186.

---

## 15. Some AOSP Changes for Native Runtime

### 15.1 Thematic Analysis

#### Phase 1: Foundation (Jan–Apr 2022)
The first wave of changes created the entire build infrastructure from scratch:

- **Build target creation** — `I19296fc4d` established the initial `robolectric_native_runtime` 
  build target in `frameworks/base/core/jni/Android.bp`, a `cc_library_shared` with
  `host_supported: true`. This single CL (+164 lines) laid the foundation for the entire effort.

- **Distribution pipeline** — `Ieb351f5b` added the library to `$DIST_DIR/robolectric/nativeruntime`,
  and `I5a99f9f7` similarly distributed the ICU dat file required for text processing.

- **Core JNI classes** — A rapid series of CLs incrementally added JNI registration for the
  most critical Android framework classes:
  - `I9661646a`: Matrix and initial graphics JNI
  - `I046e1447`: Bitmap and BitmapFactory — enabling image decoding
  - `I6071aa4d`: FontFamily with namespace handling (`com.android.internal.graphics.fonts`
    vs `android.graphics.fonts` for different SDK levels)
  - `I369181f0`: Typeface and text classes — completing text layout support

- **Compatibility guard** — `I7aab27c7` added an SDK-level check to only register graphics JNI
  for SDK >= 26 (Android O), avoiding crashes from missing `Matrix` JNI fields in older versions.

#### Phase 2: libnativehelper and ICU (May–Sep 2022)
- **libnativehelper adaptation** (`Icaef0cb0`) — Changed the Buffer internals accessor class from
  a LayoutLib class to `org.robolectric.nativeruntime.NIOAccess`, and enabled a static
  `cc_library` for the host build. This was essential because `libnativehelper` provides
  core JNI helper functions used throughout the native runtime.

- **ICU locale property** (`Ia219a6c2`) — Updated the system property name used for ICU's
  default language tag, ensuring proper locale handling in host text operations.

#### Phase 3: macOS Support (Jan 2023)
- `Ic51c46c8` (**"Add support for building RNG on Mac"**, +75/-57) was a significant change that:
  - Updated the `robolectric_native_runtime` target with macOS-specific build rules
  - Excluded `AnimatedImageDrawable` from Mac builds (requires Linux's `epoll`)
  - Included `CursorWindow.cpp` for Mac (SQLite cursor support)
  - Validated with `ShadowNativeMatrixTest` on Mac artifacts

#### Phase 4: Windows Platform (Dec 2023 – Mar 2024)
The Windows porting effort required changes across multiple AOSP repositories:

- `Ie932ddec` (**"Enable host Windows build"**) — Initial Windows build target. SQLite JNI was
  initially disabled because `CursorWindow.cpp` and SQLite JNI needed `mmap`/`ashmem`.

- `Ie72a5f04` (**"ashmem-host for Windows"**, system/core) — Migrated to `tmpfile`/`fileno` for
  temp file operations (supported on MinGW), enabling CursorWindow on Windows.

- `I138064847` (**"SQLite JNI in Windows"**) — Used libbase's `MappedFile` for cross-platform
  mmap operations in `CursorWindow.cpp` and `android_database_SQLiteConnection.cpp`.

- `I38b67e6f` (**"AnimatedImageDrawable for Mac and Windows"**) — Re-enabled
  `AnimatedImageDrawable` on Mac/Windows by disabling the `AnimatedEndListener` mechanism
  (which requires native Looper, unavailable on host).

Two changes landed on **AOSP main** to improve portability for all host builds:
- `I77b6b548` — Replaced raw `mmap`/`munmap` calls with `MappedFile` in `CursorWindow`
- `I535449c2` — Same replacement in `android_database_SQLiteConnection`

#### Phase 5: ICU and Locale Improvements (Jan–Mar 2024)
- `I7c0ffffe` — Changed the ICU language tag property from
  `robolectric.nativeruntime.languageTag` to `icu.locale.default` for alignment with
  upstream LayoutLib.
- `I894b9b79` (**+84/-18**) — Backported the latest LayoutLib ICU loading logic to the
  hostruntime-dev branch, improving internationalization support.
- `I21e71152` — Used the minimal `"C"` numeric locale in `strtof` calls to prevent float
  parsing failures in locales where commas are decimal separators (e.g., German locale).

#### Phase 6: Hardware Rendering and Surface Support (May–Jul 2024)
This phase added hardware-accelerated rendering support (via CPU-only Skia pipeline):

- `Ic037fea1` — Fixed Mac pixel color swap issue by using `kN32_SkColorType` (architecture-
  dependent) instead of a hardcoded color type for `SkiaHostPipeline`.
- `I949382eb` — Extended `ImageReader` and `HardwareRenderer.syncAndDrawFrame` support to
  Android Q and R (previously only Android S+).
- `If52fe2a4` (+46/-44) — Synchronized hwui files with `sc-layoutlib-native` branch,
  enabling `CanvasContext`, `RootRenderNode`, `RenderThread`, animation logic, and more.
- `I74a7d09e` — Fixed hwui compile errors so `m libhwui` works with the Android toolchain
  (not just the host toolchain).
- `Ieca45f62` — Un-ifdef'd `Surface.lockCanvas` and `Surface.unlockCanvasAndPost` (they
  compile fine on host).
- `I22038e78` — Added `android_view_ThreadedRenderer_setSurfacePtr` for backwards
  compatibility with Android O/P.
- `I1631d08d` — Fixed frameinfo data conversion from the 9-length (Android R) to 12-length
  (Android S+) format for proper HW rendering support.
- `Ic80c6aef` — Added FileDescriptor-based `ImageDecoder.nDecode` variant.

#### Phase 7: Path APIs and Newer SDK Support (Aug 2024 – Jan 2026)
- `Iab0c43c7` (+84) — Backported `PathIterator` JNI from Android U.
- `Ib980365a` (+74/-40) — Added `nConicTo`, `nRConicTo`, `nInterpolate`, `nGetGenerationID`,
  and `nIsInterpolatable` from Android U's Path API.
- `I217e91ae` — Added a host-specific variant of `PathIterator.nNext` JNI.
- `I96475c4b` (+12) — Added unexported symbol list for Mac to prevent symbol clashes between
  `librobolectric-nativeruntime` (pre-V) and `libandroid_runtime` (V+) for `ANativeWindow`
  and `Minikin` symbols.
- `I19e69cd5` (+45/-2, Jul 2025) — Added `android.text.Hyphenator` JNI support with a
  configurable hyphen data directory via system property.
- `I8a533353` (+3/-1, Jan 2026) — Bound `BitmapRegionDecoder` JNI for region-based image decoding.

### 15.2 Development Branch Strategy

```
android12-hostruntime-dev (main development branch)
    │
    │   Most RNR-specific changes land here first
    │   Based on Android 12 codebase
    │   Contains customizations that can't go to main
    │     (host-only ifdef's, backported APIs, etc.)
    │
    ├── Changes stay here: JNI additions, host-only adaptations
    │
    └── Portable improvements → cherry-picked to main
            │
            ▼
        main (AOSP trunk)
            Only gets changes that benefit ALL host builds
            (LayoutLib + Robolectric)
            e.g., MappedFile portability improvements
```

The `android12-hostruntime-dev` branch serves as a **long-running development branch** where
RNR-specific modifications are made independently of AOSP main. This approach is necessary
because:

1. **Many changes are host-only** — They add `#ifdef __ANDROID__` guards, host-specific
   code paths, or backported APIs that don't belong in the shipping Android platform.

2. **The base is Android 12** — The native runtime needs to support older SDK levels (O through R)
   with a stable codebase, while main continuously evolves.

3. **Select improvements get upstreamed** — Portable changes (like `MappedFile` for mmap) that
   benefit both Robolectric and LayoutLib are cherry-picked to AOSP main.

### 15.3 Cross-Repository Impact

The changes touch **6 AOSP repositories**, demonstrating the breadth of modifications needed:

| Repository | # Changes | Purpose |
|------------|-----------|---------|
| `platform/frameworks/base` | ~30+ | Core JNI, hwui, SQLite, graphics — the bulk of changes |
| `platform/libnativehelper` | 1 | Buffer access class adaptation for Robolectric |
| `platform/frameworks/native` | 1 | libnativewindow headers for Windows |
| `platform/system/core` | 2 | ashmem-host Windows support, OWNERS |
| `platform/external/icu` | 1 | ICU data distribution |
| `platform/manifest` | 1 | Branch mapping for system/core |

### 15.4 Key Engineering Patterns

1. **Incremental JNI binding** — Rather than a single massive CL, classes were added in small
   groups (Matrix → Bitmap → Font → Typeface), each tested independently.

2. **Platform-first, then broaden** — Linux was first, then Mac (Jan 2023), then Windows
   (Dec 2023), with each platform bringing unique challenges (epoll, mmap, symbol visibility).

3. **Upstream when possible** — Portable improvements (MappedFile) go to `main`; host-only
   customizations stay on `android12-hostruntime-dev`.

4. **API backporting** — Newer APIs (PathIterator from U, Hyphenator) are backported to the
   hostruntime-dev branch so RNR can support them across all SDK levels.

5. **Shared infrastructure with LayoutLib** — Many patterns (ICU loading, locale handling,
   JNI method format) are shared with Android Studio's LayoutLib, reducing duplication.

---

## 16. Summary

Robolectric's Native Runtime achieves **high-fidelity Android emulation on the JVM** by:

1. **Compiling real AOSP C++ libraries** (libhwui, libskia, libsqlite, libminikin, etc.) for
   host platforms (Linux/macOS/Windows) with GPU support disabled (`HWUI_NULL_GPU`)

2. **Packaging them as a single shared library** (`libandroid_runtime.so`) that statically links
   all dependencies

3. **Using bytecode instrumentation** to redirect native method calls through a renaming scheme
   (`$$robo$$<method>$nativeBinding`) that allows the shadow layer to intercept calls when needed
   while defaulting to real native execution

4. **Providing 88+ shadow classes** that ensure correct initialization, lazy loading of the
   native library, and version-specific API compatibility across Android O through V+

5. **Bundling runtime resources** (fonts, ICU data, build properties) that the native code
   requires for correct operation

This approach delivers pixel-accurate graphics rendering, real SQLite behavior, and authentic
text layout in Robolectric tests, significantly improving test fidelity compared to the older
shadow-only approach.
