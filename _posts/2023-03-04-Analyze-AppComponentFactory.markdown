---
layout: post
title:  "Analyze AppComponentFactory"
date:   2023-03-04 18:24 +0800
---

# Usage

From Android P/SDK 28, Android supports developers to use `AppComponentFactory` to delegate the default `Service`/`BroadcastReceiver`/`ClassLoader`/`Activity`/`Application` initialization. For example, we can use the following example to initialize the `BroadcastReceiver` with custom constructor:

`AndroidManifest.xml`:

```XML
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <application
        android:appComponentFactory=".CustomAppCompFactory"
        ...
        tools:replace="android:appComponentFactory"
        tools:targetApi="31">
        ...
        <receiver
            android:name=".CustomConstructorReceiver"
            android:exported="true">
            <intent-filter>
                <action android:name="com.robolectric.CUSTOM_CONSTRUCTOR" />
            </intent-filter>
        </receiver>
    </application>

</manifest>
```

`CustomAppCompFactory.java`:

```Java
public class CustomAppCompFactory extends AppComponentFactory {
    @NonNull
    @Override
    public BroadcastReceiver instantiateReceiver(@NonNull ClassLoader cl, @NonNull String className, @Nullable Intent intent) throws ClassNotFoundException, IllegalAccessException, InstantiationException {
        if (className.contains("CustomConstructorReceiver")) {
            return new CustomConstructorReceiver(100); 
        }
        return super.instantiateReceiver(cl, className, intent);
    }
    ...
}
```

`CustomConstructorReceiver.java`:

```Java
public class CustomConstructorReceiver extends BroadcastReceiver {
    private int value;

    public CustomConstructorReceiver(int value) {
        this.value = value;
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        ...
    }
}
```

The `AppComponentFactory` is powerful, and this article will analyze how AOSP supports `AppComponentFactory` from Android P/SDK 28. The real supporting analysis can help me to implement similar supporting for Robolectric.

# Analysis

## AOSP

### Parsing `AndroidManifest.xml`

The [`ParsingPackageUtils.java`](https://cs.android.com/android/platform/superproject/+/master:frameworks/base/services/core/java/com/android/server/pm/pkg/parsing/ParsingPackageUtils.java;l=1999-2008?q=appComponentFactory&ss=android&start=61) parses `android:appComponentFactory` value from `AndroidManifest.xml` at its [`parseBaseApplication`](https://cs.android.com/android/platform/superproject/+/master:frameworks/base/services/core/java/com/android/server/pm/pkg/parsing/ParsingPackageUtils.java;l=1861?q=appComponentFactory&ss=android&start=61) method:

```Java
String factory = sa.getNonResourceString(
    R.styleable.AndroidManifestApplication_appComponentFactory);
if (factory != null) {
    String appComponentFactory = ParsingUtils.buildClassName(pkgName, factory);
    if (appComponentFactory == null) {
        return input.error("Empty class name in package " + pkgName);
    }

    pkg.setAppComponentFactory(appComponentFactory);
}
```

And the parsed `andorid:appComponentFactory` string will be passed to `ParsingPackageImpl`'s [`appComponentFactory`](https://cs.android.com/android/platform/superproject/+/master:frameworks/base/services/core/java/com/android/server/pm/pkg/parsing/ParsingPackageImpl.java;l=356?q=appComponentFactory&ss=android&start=31) field:


```Java
@Nullable
@DataClass.ParcelWith(ForInternedString.class)
private String appComponentFactory;

public ApplicationInfo toAppInfoWithoutStateWithoutFlags() {
    ApplicationInfo appInfo = new ApplicationInfo();
    ...
    appInfo.appComponentFactory = appComponentFactory;
    ...
}

@Override
public ParsingPackageImpl setAppComponentFactory(@Nullable String appComponentFactory) {
    this.appComponentFactory = appComponentFactory;
    return this;
}
```

The `ParsingPackageImpl` will pass this `appComponentFactory` string to `ApplicationInfo#appComponentFactory`. This process will pass the `android:appComponentFactory` string in `AndroidManifest.xml` to `ApplicationInfo#appComponentFactory`, from `PackageManagerService` part to application's part.

### Loading `AppComponentFactory` instance

When AOSP passes `android:appComponentFactory` in `AndroidManifest.xml` to [`ApplicationInfo#appComponentFactory`](https://cs.android.com/android/platform/superproject/+/master:frameworks/base/core/java/android/content/pm/ApplicationInfo.java;l=1231-1236?q=appComponentFactory&ss=android&start=11), the next step is to load real custom `AppComponentFactory` instance from this string. We can use exception in test code to get real initialization process:


```
java.lang.RuntimeException: utzocz customAppComponentFactory
    at com.demo.myapplication.CustomAppCompFactory.<init>(CustomAppCompFactory.java:14)
    at java.lang.Class.newInstance(Native Method)
    at android.app.LoadedApk.createAppFactory(LoadedApk.java:273)
    at android.app.LoadedApk.createOrUpdateClassLoaderLocked(LoadedApk.java:1039)
    at android.app.LoadedApk.getClassLoader(LoadedApk.java:1126)
    at android.app.LoadedApk.getResources(LoadedApk.java:1374)
    at android.app.ContextImpl.createAppContext(ContextImpl.java:3090)
    at android.app.ContextImpl.createAppContext(ContextImpl.java:3082)
    at android.app.ActivityThread.handleBindApplication(ActivityThread.java:6650)
```

When `ActivityThread` initializes `Application` and its `Context`, it will create/update `Application`'s `ClassLoader`. Because `AppComponentFactory` is able to provide custom `ClassLoader`, so this process needs to update `AppComponentFactory` instance in `LoadedApk`:

```Java
if (mBaseClassLoader != null) {
    mDefaultClassLoader = mBaseClassLoader;
} else {
    mDefaultClassLoader = ClassLoader.getSystemClassLoader();
}
mAppComponentFactory = createAppFactory(mApplicationInfo, mDefaultClassLoader);
```

### Using `AppComponentFactory` to initialize `BroadcastReceiver`

Although `AppComponentFactory` can provide different critical components of Android, this part only analyzes that how `AppComponentFactory` is used to initialize `BroadcastReceiver`. And it's very simple. The [`ActivityThread#handleReceiver`](https://cs.android.com/android/platform/superproject/+/master:frameworks/base/core/java/android/app/ActivityThread.java;l=4290-4291?q=instantiateReceiver&ss=android) uses `AppComponentFactory#instantiateReceiver` to do this task when it needs to provide a `BroadcastReceiver` instance: 


```Java
private void handleReceiver(ReceiverData data) {
    ...
    receiver = packageInfo.getAppFactory()
        .instantiateReceiver(cl, data.info.name, data.intent);
    ...
```

### `AppComponentFactory` initializes `BroadcastReceiver` finally

```Java
public class CustomAppCompFactory extends AppComponentFactory {
    @NonNull
    @Override
    public BroadcastReceiver instantiateReceiver(@NonNull ClassLoader cl, @NonNull String className, @Nullable Intent intent) throws ClassNotFoundException, IllegalAccessException, InstantiationException {
        if (className.contains("CustomConstructorReceiver")) {
            return new CustomConstructorReceiver(100); 
        }
        return super.instantiateReceiver(cl, className, intent);
    }
    ...
}
```