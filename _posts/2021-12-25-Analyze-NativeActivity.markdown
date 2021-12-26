---
layout: post
title:  "Analyze NativeActivity"
date:   2021-12-25 17:25 +0800
---

`NativeActivity` is added to Android from API 9, and used for games and apps that write almost of all logic with native code. The `NativeActivity` is used to pass basic Android app's lifecycle to native code, and help them to manage its logic with Android app lifecycle aware. There are also some glue code from NDK for `NativeActivity` and real native logic to pass Android app's lifecycle. This article will show the pipeline of passing Android app's lifecycle from `NativeActivity` to native code.

## Code base

`AOSP` android-12.0.0_r21

## App sample

This article uses official [`NativeActivity` sample](https://github.com/android/ndk-samples/tree/master/native-activity) for analyzing. If you are not familiar with `NativeActivity`, you can clone this project and run it with emulator to experience `NativeActivity`.

## What does `NativeActivity` in pure Java world do?

> frameworks/base/core/java/android/app/NativeActivity.java

### Receive and pass lifecycle to native

The `NativeActivity` is an implementation of `Activity`, and used to receive Android app's lifecycle:

```java
public class NativeActivity extends Activity implements SurfaceHolder.Callback2,
        InputQueue.Callback, OnGlobalLayoutListener {
    //...
    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        byte[] state = onSaveInstanceStateNative(mNativeHandle);
        if (state != null) {
            outState.putByteArray(KEY_NATIVE_SAVED_STATE, state);
        }
    }

    @Override
    protected void onStart() {
        super.onStart();
        onStartNative(mNativeHandle);
    }
    //...
    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (!mDestroyed) {
            onConfigurationChangedNative(mNativeHandle);
        }
    }

    @Override
    public void onLowMemory() {
        super.onLowMemory();
        if (!mDestroyed) {
            onLowMemoryNative(mNativeHandle);
        }
    }
    //...
}
```

The `NativeActivity` uses native methods, such as `onLowMemoryNative`, `onConfigurationChangeNative` etc, to pass lifecycle state to native. Those native methods are bound to JNI methods, and we will take look at those JNI methods at later part.


### Load app's native code

App may implements almost logic at native, so `NativeActivity` defines a contract for native library, and will load assigned native library at `NativeActivity#onCreate`:

```java
// ...
/**
 * Optional meta-that can be in the manifest for this component, specifying
 * the name of the native shared library to load.  If not specified,
 * "main" is used.
 */
public static final String META_DATA_LIB_NAME = "android.app.lib_name";
    
/**
 * Optional meta-that can be in the manifest for this component, specifying
 * the name of the main entry point for this native activity in the
 * {@link #META_DATA_LIB_NAME} native code.  If not specified,
 * "ANativeActivity_onCreate" is used.
 */
public static final String META_DATA_FUNC_NAME = "android.app.func_name";
    
private static final String KEY_NATIVE_SAVED_STATE = "android:native_state";
// ...
@Override
protected void onCreate(Bundle savedInstanceState) {
    String libname = "main";
    String funcname = "ANativeActivity_onCreate";
    ActivityInfo ai;
    
    try {
        ai = getPackageManager().getActivityInfo(
                getIntent().getComponent(), PackageManager.GET_META_DATA);
        if (ai.metaData != null) {
            String ln = ai.metaData.getString(META_DATA_LIB_NAME);
            if (ln != null) libname = ln;
            ln = ai.metaData.getString(META_DATA_FUNC_NAME);
            if (ln != null) funcname = ln;
        }
    } catch (PackageManager.NameNotFoundException e) {
        throw new RuntimeException("Error getting activity info", e);
    }

    BaseDexClassLoader classLoader = (BaseDexClassLoader) getClassLoader();
    String path = classLoader.findLibrary(libname);

    if (path == null) {
        throw new IllegalArgumentException("Unable to find native library " + libname +
                                        " using classloader: " + classLoader.toString());
    }

    byte[] nativeSavedState = savedInstanceState != null
        ? savedInstanceState.getByteArray(KEY_NATIVE_SAVED_STATE) : null;

    mNativeHandle = loadNativeCode(path, funcname, Looper.myQueue(),
        getAbsolutePath(getFilesDir()), getAbsolutePath(getObbDir()),
        getAbsolutePath(getExternalFilesDir(null)),
        Build.VERSION.SDK_INT, getAssets(), nativeSavedState,
        classLoader, classLoader.getLdLibraryPath());

    if (mNativeHandle == 0) {
        throw new UnsatisfiedLinkError(
                "Unable to load native library \"" + path + "\": " + getDlError());
    }
    // ...
}
```

The `NativeActivity#onCreate` will read `android.app.lib_name` and `android.app.func_name` as so file name and native created method name from app's meta data defined in `AndroidManifest.xml`. There is an example from official [`NativeActivity` sample](https://github.com/android/ndk-samples/tree/master/native-activity):

```xml
<!-- Tell NativeActivity the name of our .so -->
<meta-data android:name="android.app.lib_name"
        android:value="native-activity" />
```

After reading so file name and native created method name(maybe not existed), `NativeActivity#onCreate` uses `BaseDexClassLoader#findLibrary` to search so file's full path. The so file will be found at extracted apk directory, if [extractNativeLibs](https://developer.android.com/guide/topics/manifest/application-element#extractNativeLibs) is enabled(default value is `true`); otherwise it will be found at apk file. We don't discuss the occasion that system apps use so file added at `/system/lib*`, `vendor/lib*` or [other supported so search paths](https://source.android.com/devices/tech/config/namespaces_libraries).

If so file path is found, the `NativeActivity#onCreate` will call native method `loadNativeCode` to load so file to load native code.

## Meets `NativeActivity`'s JNI

> frameworks/base/core/jni/android_app_NativeActivity.cpp

### Bind methods between Java and native

In previous part, we have saw `NativeActivity` in pure Java world logic to load native library and pass lifecycle with native methods, such as `loadNativeCode`. Those methods are defined in `NativeActivity`'s JNI part:

```C++
static const JNINativeMethod g_methods[] = {
    { "loadNativeCode",
        "(Ljava/lang/String;Ljava/lang/String;Landroid/os/MessageQueue;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;ILandroid/content/res/AssetManager;[BLjava/lang/ClassLoader;Ljava/lang/String;)J",
        (void*)loadNativeCode_native },
    { "getDlError", "()Ljava/lang/String;", (void*) getDlError_native },
    { "unloadNativeCode", "(J)V", (void*)unloadNativeCode_native },
    { "onStartNative", "(J)V", (void*)onStart_native },
    { "onResumeNative", "(J)V", (void*)onResume_native },
    // ...
};

static const char* const kNativeActivityPathName = "android/app/NativeActivity";

int register_android_app_NativeActivity(JNIEnv* env)
{
    //ALOGD("register_android_app_NativeActivity");
    jclass clazz = FindClassOrDie(env, kNativeActivityPathName);

    gNativeActivityClassInfo.finish = GetMethodIDOrDie(env, clazz, "finish", "()V");
    gNativeActivityClassInfo.setWindowFlags = GetMethodIDOrDie(env, clazz, "setWindowFlags",
                                                               "(II)V");
    gNativeActivityClassInfo.setWindowFormat = GetMethodIDOrDie(env, clazz, "setWindowFormat",
                                                                "(I)V");
    gNativeActivityClassInfo.showIme = GetMethodIDOrDie(env, clazz, "showIme", "(I)V");
    gNativeActivityClassInfo.hideIme = GetMethodIDOrDie(env, clazz, "hideIme", "(I)V");

    return RegisterMethodsOrDie(env, kNativeActivityPathName, g_methods, NELEM(g_methods));
}
```

The `g_methods` defines the bound relationship between native methods in `NativeActivity.java` and `android_app_NativeActivity.cpp`. For example, the method `loadNativeCode_native` in `android_app_NativeActivity.cpp` is the real implementation of `loadNativeCode` in `NativeActivity.java`. 

### Load native library code

The `loadNativeCode_native` uses `OpenNativeLibrary` in `art/libnativeloader/native_loader.h` to load native library found by `BaseDexClassLoader` in `NativeActivity.java`:

```C++
ScopedUtfChars pathStr(env, path);
std::unique_ptr<NativeCode> code;
bool needs_native_bridge = false;

char* nativeloader_error_msg = nullptr;
void* handle = OpenNativeLibrary(env,
                                sdkVersion,
                                pathStr.c_str(),
                                classLoader,
                                nullptr,
                                libraryPath,
                                &needs_native_bridge,
                                &nativeloader_error_msg);
```

Maybe you can notify the variable `needs_native_bridge` in `loadNativeCode_native`. `needs_native_bridge` is used for native bridge to determine whether need to load bridge libraries for ABI compatibility, for example loading x86_64 arch libraries for ARM arch libraries on Android-x86 platform. 

### Establish MessageQueue and Looper

Another work of `loadNativeCode_native` is to establish message queue with looper mechanism:

```C++
code->messageQueue = android_os_MessageQueue_getMessageQueue(env, messageQueue);
if (code->messageQueue == NULL) {
    g_error_msg = "Unable to retrieve native MessageQueue";
    ALOGW("%s", g_error_msg.c_str());
    return 0;
}

int msgpipe[2];
if (pipe(msgpipe)) {
    g_error_msg = android::base::StringPrintf("could not create pipe: %s", strerror(errno));
    ALOGW("%s", g_error_msg.c_str());
    return 0;
}
code->mainWorkRead = msgpipe[0];
code->mainWorkWrite = msgpipe[1];
int result = fcntl(code->mainWorkRead, F_SETFL, O_NONBLOCK);
SLOGW_IF(result != 0, "Could not make main work read pipe "
        "non-blocking: %s", strerror(errno));
result = fcntl(code->mainWorkWrite, F_SETFL, O_NONBLOCK);
SLOGW_IF(result != 0, "Could not make main work write pipe "
        "non-blocking: %s", strerror(errno));
code->messageQueue->getLooper()->addFd(
        code->mainWorkRead, 0, ALOOPER_EVENT_INPUT, mainWorkCallback, code.get());
```
It creates a pair pipe, one for writing, and one for reading. `code->mainWorkWrite` is used by native methods need passing values, such as `android_NativeActivity_setWindowFlags` in `android_app_NativeActivity.cpp`:

```C++
void android_NativeActivity_setWindowFlags(
        ANativeActivity* activity, int32_t values, int32_t mask) {
    NativeCode* code = static_cast<NativeCode*>(activity);
    write_work(code->mainWorkWrite, CMD_SET_WINDOW_FLAGS, values, mask);
}
```

and `code->mainWorkRead` is used for looper of message queue to receive pipe data from `code->mainWorkWrite` and trigger a callback method calling of looper. The real callback is `ANativeActivityCallbacks` defined in `frameworks/native/include/android/native_activity.h`. And `loadNativeCode_native` calls `code->createActivityFunc(code.get(), rawSavedState, rawSavedSize)` to call defined `ANativeActivity` initialized methods or default `ANativeActivity_onCreate` to initialize `ANativeActivityCallbacks`. We have saw logic to parse `android.app.func_name` at `NativeActivity.java`'s `onCreate` method, and its default value is `ANativeActivity_onCreate`.

After searching and analyzing, `android_NativeActivity_setWindowFlags` looks like called by native test code finally(for example `external/deqp/framework/platform/android/tcuAndroidTestActivity.cpp`). In another word, `code->mainWorkWrite` is used for native code.

### Initialize JNI environment

The third thing that `loadNativeCode_native` does is to initialize JNI env for native code:

```C++
code->env = env;
code->clazz = env->NewGlobalRef(clazz);

const char* dirStr = env->GetStringUTFChars(internalDataDir, NULL);
code->internalDataPathObj = dirStr;
code->internalDataPath = code->internalDataPathObj.string();
env->ReleaseStringUTFChars(internalDataDir, dirStr);

if (externalDataDir != NULL) {
    dirStr = env->GetStringUTFChars(externalDataDir, NULL);
    code->externalDataPathObj = dirStr;
    env->ReleaseStringUTFChars(externalDataDir, dirStr);
}
code->externalDataPath = code->externalDataPathObj.string();

code->sdkVersion = sdkVersion;

code->javaAssetManager = env->NewGlobalRef(jAssetMgr);
code->assetManager = NdkAssetManagerForJavaObject(env, jAssetMgr);
```
It initializes `AssetManager` for native code too. And `AssetManager` will provide the ability to load Android resources for native code.

### Pass app lifecycle

In `NativeActivity.java`, it calls `onPauseNative` at `onPause` method to pass pause state to native. And `onPause_native` in `android_app_NativeActivity.cpp` is the real implementation of `onPauseNative`:

```C++
static void
onPause_native(JNIEnv* env, jobject clazz, jlong handle)
{
    if (kLogTrace) {
        ALOGD("onPause_native");
    }
    if (handle != 0) {
        NativeCode* code = (NativeCode*)handle;
        if (code->callbacks.onPause != NULL) {
            code->callbacks.onPause(code);
        }
    }
}
```
`onPause_native` calls `onPause` of `ANativeActivityCallbacks` to pass pause state to app's native code. We know `ANativeActivity_onCreate` in app native code will initialize those callbacks, but where is `ANativeActivity_onCreate` implementation?

### NDK's glue code

> prebuilts/ndk/current/sources/android/native_app_glue/android_native_app_glue.c

At `android_native_app_glue.c`, we can see the implementation of `ANativeActivity_onCreate` and the initialization of callbacks, including `onPause`:

```C++
//...
static void onPause(ANativeActivity* activity) {
    LOGV("Pause: %p", activity);
    android_app_set_activity_state(ToApp(activity), APP_CMD_PAUSE);
}
//...
static void android_app_set_activity_state(struct android_app* android_app, int8_t cmd) {
    pthread_mutex_lock(&android_app->mutex);
    android_app_write_cmd(android_app, cmd);
    while (android_app->activityState != cmd) {
        pthread_cond_wait(&android_app->cond, &android_app->mutex);
    }
    pthread_mutex_unlock(&android_app->mutex);
}
//...
JNIEXPORT
void ANativeActivity_onCreate(ANativeActivity* activity, void* savedState, size_t savedStateSize) {
    LOGV("Creating: %p", activity);

    activity->callbacks->onConfigurationChanged = onConfigurationChanged;
    activity->callbacks->onContentRectChanged = onContentRectChanged;
    activity->callbacks->onDestroy = onDestroy;
    activity->callbacks->onInputQueueCreated = onInputQueueCreated;
    activity->callbacks->onInputQueueDestroyed = onInputQueueDestroyed;
    activity->callbacks->onLowMemory = onLowMemory;
    activity->callbacks->onNativeWindowCreated = onNativeWindowCreated;
    activity->callbacks->onNativeWindowDestroyed = onNativeWindowDestroyed;
    activity->callbacks->onNativeWindowRedrawNeeded = onNativeWindowRedrawNeeded;
    activity->callbacks->onNativeWindowResized = onNativeWindowResized;
    activity->callbacks->onPause = onPause;
    activity->callbacks->onResume = onResume;
    activity->callbacks->onSaveInstanceState = onSaveInstanceState;
    activity->callbacks->onStart = onStart;
    activity->callbacks->onStop = onStop;
    activity->callbacks->onWindowFocusChanged = onWindowFocusChanged;

    activity->instance = android_app_create(activity, savedState, savedStateSize);
}
```
When `onPause` in `android_native_app_glue.c` is called, it will send `APP_CMD_PAUSE` command to app's native code with method named `android_app_set_activity_state` and `android_app_write_cmd`. Actually, `android_app_write_cmd` use pair pipe to pass data too, and we can see the initialization at `android_app_create` in `android_native_app_glue.c`. We know `android_app_create` is called at the end of `ANativeActivity_onCreate`, and it will create the instance of `android_app` defined in `prebuilts/ndk/current/sources/android/native_app_glue/android_native_app_glue.h`, and return it to `activity->instance`. 

One thing about `android_app_create` should be pointed out specifically: this method creates custom thread for `android_app`:

```C++
pthread_attr_t attr;
pthread_attr_init(&attr);
pthread_attr_setdetachstate(&attr, PTHREAD_CREATE_DETACHED);
pthread_create(&android_app->thread, &attr, android_app_entry, android_app);

// Wait for thread to start.
pthread_mutex_lock(&android_app->mutex);
while (!android_app->running) {
   pthread_cond_wait(&android_app->cond, &android_app->mutex);
}
pthread_mutex_unlock(&android_app->mutex);
```

So app's native code will run in separate thread, and it is the reason that `android_app` needs pair pipe for communication.

## Go to app finally

> https://github.com/android/ndk-samples/tree/master/native-activity

`android_native_app_glue.c` is provided by NDK, and app can use it directly like `native-activity`'s `app/src/main/cpp/CMakeLists.txt`:

```cmake
add_library(native_app_glue STATIC
    ${ANDROID_NDK}/sources/android/native_app_glue/android_native_app_glue.c)
```

And `android_app_create` in `android_native_app_glue.c` calls `pthread_create` to run `android_thread_entry` method in single thread:

```C++
pthread_create(&android_app->thread, &attr, android_app_entry, android_app);
```

And `android_app_entry` will call `android_main` methods in native library to run app's native code:

```C++
android_main(android_app);
```
If app's native code implements `android_main` method, and it will be used as native code entry. We can see the implementation of `native-activity` at `app/src/main/cpp/main.cpp`:

```C++
/**
 * This is the main entry point of a native application that is using
 * android_native_app_glue.  It runs in its own thread, with its own
 * event loop for receiving input events and doing other things.
 */
void android_main(struct android_app* state) {
    struct engine engine{};

    memset(&engine, 0, sizeof(engine));
    state->userData = &engine;
    state->onAppCmd = engine_handle_cmd;
    state->onInputEvent = engine_handle_input;
    engine.app = state;
    //...
}
```
`native-activity` uses its `engine_handle_cmd` method as callback for app command, including app lifecycle. The `onAppCmd` is bound to looper at `android_app_entry` in `android_native_app_glue.c`:

```C++
ALooper* looper = ALooper_prepare(ALOOPER_PREPARE_ALLOW_NON_CALLBACKS);
ALooper_addFd(looper, android_app->msgread, LOOPER_ID_MAIN, ALOOPER_EVENT_INPUT, NULL,
        &android_app->cmdPollSource);
android_app->looper = looper;
```

When there are events coming to looper, `android_main` in `app/src/main/cpp/main.cpp` will call `process` method to trigger `onAppCmd` calling(see `process_cmd` in `android_native_app_glue.c`):

```C++
while ((ident=ALooper_pollAll(engine.animating ? 0 : -1, nullptr, &events,
                                (void**)&source)) >= 0) {

    // Process this event.
    if (source != nullptr) {
        source->process(state, source);
    }
    //...
}
```
The `android_main` initializes app's native method as callback to process app commands. It also call `ALooper_pollAll` to wait looper events from NDK's app glue and call `source->process` to leverage app glue's process to call `onAppCmd` implementation, app's `engine_handle_cmd` to process app lifecycle and other commands. The `source` is `android_poll_source` instance, and `android_poll_source` is defined in NDK's `app_native_app_glue.h`, so app's native library works under NDK's app glue.

App's `engine_handle_cmd` is responsible for passing commands. Unfortunately, `native-activity` doesn't process `APP_CMD_PAUSE`, we can take look at another command:

```C++
case APP_CMD_INIT_WINDOW:
    // The window is being shown, get it ready.
    if (engine->app->window != nullptr) {
        engine_init_display(engine);
        engine_draw_frame(engine);
    }
    break;
```

When `APP_CMD_INIT_WINDOW` coming, it will call `engine_init_display` to initialize OpenGL ES environment, and call `engine_draw_frame` after it to draw contents. Other app commands use similar process and logic to process.

## Share Surface between Java and native code

App's native code uses OpenGL ES and EGL to draw contents on Android's surface:

```C+++
surface = eglCreateWindowSurface(display, config, engine->app->window, nullptr);
```

And it uses `engine->app->window`, aka `android_app->window`(see `android_native_app_glue.h`), as Android's surface for `eglCreateWindowSurface`. So where does `android_app->window` comes from?

`android_app->window` is initialized with `android_app->pendingWindow` by `android_app_pre_exec_cmd` in `android_native_app_glue.c`. And `android_app->pendingWindow` is initialized by `android_app_set_window` in `android_native_app_glue.c`. The `android_app_set_window` is called by `onNativeWindowCreated` of `android_native_app_glue.c`.

If we come back to `NativeActivity.java`, we know `NativeActivity.java` uses `getWindow().takeSurface(this)` to take ownership of window surface that `NativeActivity` attached to, and call native callbacks when surface lifecycle changed, including surface created:

```java
public void surfaceCreated(SurfaceHolder holder) {
    if (!mDestroyed) {
        mCurSurfaceHolder = holder;
        onSurfaceCreatedNative(mNativeHandle, holder.getSurface());
    }
}
```
The implementation of `onSurfaceCreatedNative` in `android_app_NativeActivity.cpp` will convert surface passed from Java to `ANativeWindow`:

```C++
//...
void setSurface(jobject _surface) {
    if (_surface != NULL) {
        nativeWindow = android_view_Surface_getNativeWindow(env, _surface);
    } else {
        nativeWindow = NULL;
    }
}
//...
static void
onSurfaceCreated_native(JNIEnv* env, jobject clazz, jlong handle, jobject surface)
{
    if (kLogTrace) {
        ALOGD("onSurfaceCreated_native");
    }
    if (handle != 0) {
        NativeCode* code = (NativeCode*)handle;
        code->setSurface(surface);
        if (code->nativeWindow != NULL && code->callbacks.onNativeWindowCreated != NULL) {
            code->callbacks.onNativeWindowCreated(code,
                    code->nativeWindow.get());
        }
    }
}
//...
```
`onSurfaceCreated_native` calls `onNativeWindowCreated` finally to pass `ANativeWindow` instance, converted from surface passed from Java part, to `android_app_set_window`. With previous analyzing, the window surface that `NativeActivity.java` bound to, will passed to `android_app->window`, and used for egl and OpenGL ES drawing. There is an official article called [EGLSurfaces and OpenGL ES](https://source.android.com/devices/graphics/arch-egl-opengl) that describes the relationship between egl, OpenGL ES and `ANativeWindow`, and you can read it you have interested in it.

## Custom `NativeActivity.java`

Actually, we can implement `NativeActivity.java` and add our custom logic to it. But we should take care about [`android:hasCode`](https://developer.android.com/guide/topics/manifest/application-element#code) in `AndroidManifest.xml`'s `<application>` tag. If `hasCode` is false, frameworks will not load any custom Java code, and our customized `NativeActivity.java` will not be used. We must set it to true if we have customized `NativeActivity.java` or other Java code.

## Summary

I only analyze app lifecycle process and surface sharing between Java and native code briefly at this article, and I don't analyze more detailed content, because skeleton of `NativeActivity` is enough for me. `NativeActivity` provides a mechanism to pass Android's specific lifecycle and input mechanism to app's native code with NDK's app glue. `NativeActivity` make native library Android platform aware and provide the ability to get platform related surface for egl and OpenGL ES drawing for app's native library. It's very useful and important for cross-platform GUI apps to add minimum platform related codes to let itself run Android platform too. If you have similar need, `NativeActivity` can be a candidate solution for you. 