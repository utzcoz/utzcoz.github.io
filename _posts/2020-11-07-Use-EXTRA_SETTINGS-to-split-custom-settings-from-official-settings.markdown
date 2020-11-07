---
layout: post
title:  "Use EXTRA_SETTINGS to split custom settings from official settings"
date:   2020-11-07 12:00 +0800
categories: aosp
---

If you are a ROM developer/maintainer, you maybe need to add some setting item to the official settings app for your custom configuration. For example, I need to add switch for user to enable/disable multi-window and [BoringdroidSystemUI](https://github.com/boringdroid/vendor_packages_apps_BoringdroidSystemUI) based on his/her need. If I add those switch to official settings app, I will manage the fork of official settings app, and apply patches when I upgrade based `AOSP` version, for example, upgrade from `Android` 10 to `Android` 11. So if there is a mechanism to plugin custom settings app to official settings app, it will help to release myself from annoying patch work. Fortunately, the official settings app provide a mechanism called for `EXTRA_SETTINGS` to help us to make it come true. The following first diagram is the official settings app dashboard page, and it loads the [BoringdroidSettings](https://github.com/boringdroid/vendor_packages_apps_BoringdroidSettings) dynamically, and the second diagram is the result after clicking the `BoringdroidSettings` dashboard entry, the shown `BoringdroidSettings` app page.

![`BoringdroidSettings` entry in official settings app dashboard](/images/use-extra-settings-example-official-settings-app-dashboard.png)

![`BoringdroidSettings` settings app page](/images/use-extra-settings-example-boringdroid-settings.png)


## Code base

`AOSP` 10.0

## Configure custom settings app with `EXTRA_SETTINGS`

It is very simple, the following code snippet is the example of `BoringdroidSettings`.

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    coreApp="true"
    package="com.boringdroid.settings"
    android:sharedUserId="android.uid.system">

    <application
        android:name=".BoringdroidSettingsApplication"
        android:allowBackup="false"
        android:defaultToDeviceProtectedStorage="true"
        android:hardwareAccelerated="true"
        android:icon="@drawable/ic_icon"
        android:label="@string/ic_name"
        android:requiredForAllUsers="true"
        android:supportsRtl="true"
        android:taskAffinity=""
        android:theme="@style/Theme.Settings"
        android:usesCleartextTraffic="true">

        <activity
            android:name=".BoringdroidSettings"
            android:exported="true"
            android:icon="@drawable/ic_icon"
            android:label="@string/ic_name">
            <intent-filter>
                <action android:name="com.android.settings.action.EXTRA_SETTINGS" />
            </intent-filter>

            <meta-data
                android:name="com.android.settings.category"
                android:value="com.android.settings.category.ia.homepage" />
            <meta-data
                android:name="com.android.settings.title"
                android:value="@string/boringdorid_dashboard_title" />
            <meta-data
                android:name="com.android.settings.summary"
                android:value="@string/boringdorid_dashboard_summary" />
        </activity>
    </application>
</manifest>
```

Firstly, we should add `EXTRA_SETTINGS` intent-filter for dashboard entry activity:

```xml
<intent-filter>
    <action android:name="com.android.settings.action.EXTRA_SETTINGS" />
</intent-filter>
```

And then we should add critical meta-data list for dashboard entry activity:

```xml
<meta-data
    android:name="com.android.settings.category"
    android:value="com.android.settings.category.ia.homepage" />
<meta-data
    android:name="com.android.settings.title"
    android:value="@string/boringdorid_dashboard_title" />
<meta-data
    android:name="com.android.settings.summary"
    android:value="@string/boringdorid_dashboard_summary" />
```

We must set `com.android.settings.category` with `com.android.settings.category.ia.homepage` to tell the official settings app, the activity wants to be added to dashboard. From the code, we also can use different category values to add activity to other sub page, but I don't check it, if you need, you can try it.

We also should set `com.android.settings.title` and `com.android.settings.summary` to customize your shown title and summary.

The next step is to set `android:icon="@drawable/ic_icon"` for the activity that will be shown on dashboard.

The last what we should do is the set `coreApp` and `shareUid`, that the official settings will check.

After above steps, our custom activity will shown on official settings app dashboard page, and will be started after the user clicks it.

## Develop custom settings app

If we can get system sign key, we can use gradle to develop custom settings app, and use `Android Studio` to build and install to our emulator or other physical devices without key problem. What we should do is to import `androidx` or other preference libraries to develop settings app. The `BoringdroidSettings` uses this way to develop normal functions. If you want to use `Android.mk` or `Android.bp` as build tool, we also can use `androidx` preference libraries to develop custom settings app, because the `AOSP` has those prebuilt libraries. The `BoringdroidSettings` also supports `Android.bp` for `Boringdroid` system build. Another example is [MaruSettings](https://github.com/utzcoz/vendor_maruos_packages_apps_MaruSettings).

## How does `EXTRA_SETTINGS` work?

`com.android.settingslib.drawer.TileUtils` defines the `EXTRA_SETTINGS`:

```java
/**
 * Settings will search for system activities of this action and add them as a top level
 * settings tile using the following parameters.
 *
 * <p>A category must be specified in the meta-data for the activity named
 * {@link #EXTRA_CATEGORY_KEY}
 *
 * <p>The title may be defined by meta-data named {@link #META_DATA_PREFERENCE_TITLE}
 * otherwise the label for the activity will be used.
 *
 * <p>The icon may be defined by meta-data named {@link #META_DATA_PREFERENCE_ICON}
 * otherwise the icon for the activity will be used.
 *
 * <p>A summary my be defined by meta-data named {@link #META_DATA_PREFERENCE_SUMMARY}
 */
public static final String EXTRA_SETTINGS_ACTION = "com.android.settings.action.EXTRA_SETTINGS";
```
From the comment, we know it is used to search *system activities*, that will be added as a top level settings tile. The comment also describe the meta-datas to set title/icon/summary, what we set above.

The `TileUtils.getCategories` retrieves all tiles with specific actions, including `EXTRA_SETTINGS`. It calls the `TileUtils.getTilesForAction` to retrieve the `EXTRA_SETTINGS` meta-datas.

```java
@VisibleForTesting
static void getTilesForAction(Context context,
        UserHandle user, String action, Map<Pair<String, String>, Tile> addedCache,
        String defaultCategory, List<Tile> outTiles, boolean requireSettings) {
    final Intent intent = new Intent(action);
    if (requireSettings) {
        intent.setPackage(SETTING_PKG);
    }
    final PackageManager pm = context.getPackageManager();
    List<ResolveInfo> results = pm.queryIntentActivitiesAsUser(intent,
            PackageManager.GET_META_DATA, user.getIdentifier());
    for (ResolveInfo resolved : results) {
        if (!resolved.system) {
            // Do not allow any app to add to settings, only system ones.
            continue;
        }
        ActivityInfo activityInfo = resolved.activityInfo;
        Bundle metaData = activityInfo.metaData;
        String categoryKey = defaultCategory;

        // Load category
        if ((metaData == null || !metaData.containsKey(EXTRA_CATEGORY_KEY))
                && categoryKey == null) {
                Log.w(LOG_TAG, "Found " + resolved.activityInfo.name + " for intent "
                    + intent + " missing metadata "
                    + (metaData == null ? "" : EXTRA_CATEGORY_KEY));
            continue;
        } else {
            categoryKey = metaData.getString(EXTRA_CATEGORY_KEY);
        }
        // other code
    }
}
```

It skips non-system processes:

```java
if (!resolved.system) {
    // Do not allow any app to add to settings, only system ones.
    continue;
}
```

So we should add `shareUid` to share system process.

It also skip component without `EXTRA_CATEGORY_KEY` meta-data, so we also must set it.

In `com.android.settings.dashboard.DashboardFragment`, it has multi entries to `com.android.settings.dashboard.DashboardFeatureProviderImpl.getTilesForCategory` to get tiles with specific category key. Different dashboard fragment has different key, for example, the top level dashboard of official settings app use the key `com.android.settings.category.ia.homepage`, defined by `com.android.settingslib.drawer.CategoryKey.CATEGORY_HOMEPAGE`. The relationship between key and dashboard fragment instance is defined by `com.android.settings.dashboard.DashboardFragmentRegistry`:

```java
static {
    PARENT_TO_CATEGORY_KEY_MAP = new ArrayMap<>();
    PARENT_TO_CATEGORY_KEY_MAP.put(TopLevelSettings.class.getName(),
            CategoryKey.CATEGORY_HOMEPAGE);
    PARENT_TO_CATEGORY_KEY_MAP.put(
            NetworkDashboardFragment.class.getName(), CategoryKey.CATEGORY_NETWORK);
    // other code
}
```

And the above code also tells use that we can change category key value to add custom setting activity to specific sub dashboard, such as system dashboard.

After that, the `DashboardFragment` will use `Tile` to show all items with 
the same category key. The left things are normal clicking processing, if you want to learn it, just reading the code.

## Summary

With the `EXTRA_SETTINGS`, we can let official settings app to plugin our custom settings app into it very simple. And we can focus on develop custom settings content, and get rid of porting work when upgrading based `AOSP` version. And it supports to add different type setting activity to different dashboard page, such as top level, system, network, and etc. If you want to arrange settings item for official settings app, it is not suitable for you. And it is useful for people only wants to add custom setting items to official settings app.

That's all. Enjoy it.