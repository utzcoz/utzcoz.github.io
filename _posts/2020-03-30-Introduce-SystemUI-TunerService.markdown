---
layout: post
title:  "Introduce SystemUI TunerService"
date:   2020-03-30 14:20 +0800
categories: aosp
---

## Code base

AOSP 9.0

## Preview

If you use pure `AOSP` built image,  we can use following command to enable the `TunerActivity`:

```shell
adb shell pm enable com.android.systemui/com.android.systemui.tuner.TunerActivity
```

And then use following command to start the `TunerActivity`:

```shell
adb shell am start com.android.systemui/.tuner.TunerActivity
```

We can click the `Navigation Bar` to navigation bar tuner page, and click the  `Layout` to the page to tuner navigation bar style.

The following first image is old navigation bar style before tuning, and the second image is new navigation bar style after tuning by selecting `Left-leaning`.

![Old navigation bar style before tuning](/images/navigation-bar-before-tuning.png)

Old navigation bar style before tuning

![New navigation bar style after tuning](/images/navigation-bar-after-tuning.png)

New navigation bar style after tuning

It's an example for navigation bar, there are many tuners for other parts, such as status bar. The next section we will deep into the code to show the work flow of `TunerService`.

## `TunerService`, `Tunable` and `Dependency`

### `Dependency`

The `Dependency` is a `SystemUI` service to control other `SystemUI` service, and it create many `SystemUI` service implementations when it started, and provide static methods to expose them to invoker.

The `TunerService` is a `SystemUI` service, and it is controlled by `Dependency`:

```java
mProviders.put(TunerService.class, () ->
        new TunerServiceImpl(mContext));
```

And we can use `Dependency.get(TunerService.class)` to get the instance of `TunerService`.

So when the `Dependency` started, it will start the `TunerService`.

### `TunerService`

```java
public abstract class TunerService {
    public abstract void clearAll();
    public abstract void destroy();

    public abstract String getValue(String setting);
    public abstract int getValue(String setting, int def);
    public abstract String getValue(String setting, String def);

    public abstract void setValue(String setting, String value);
    public abstract void setValue(String setting, int value);

    public abstract void addTunable(Tunable tunable, String... keys);
    public abstract void removeTunable(Tunable tunable);

    public interface Tunable {
        void onTuningChanged(String key, String newValue);
    }

    public static final void setTunerEnabled(Context context, boolean enabled) {
        userContext(context).getPackageManager().setComponentEnabledSetting(
                new ComponentName(context, TunerActivity.class),
                enabled ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                        : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP);
    }

    public static final boolean isTunerEnabled(Context context) {
        return userContext(context).getPackageManager().getComponentEnabledSetting(
                new ComponentName(context, TunerActivity.class))
                == PackageManager.COMPONENT_ENABLED_STATE_ENABLED;
    }

    public static final void showResetRequest(final Context context, final Runnable onDisabled) {
        // Some implementation
    }
}
```

The `TunerService` provides some interface to add/remove `Tunable`, and set/get setting value.

Let's see the `TunerService` implementation `TunerServiceImpl`:

```java
public class TunerServiceImpl extends TunerService {
    // Things that use the tunable infrastructure but are now real user settings and
    // shouldn't be reset with tuner settings.
    private static final String[] RESET_BLACKLIST = new String[] {
            QSTileHost.TILES_SETTING,
            Settings.Secure.DOZE_ALWAYS_ON
    };
    private final Context mContext;

    public TunerServiceImpl(Context context) {
        mContext = context;
        mContentResolver = mContext.getContentResolver();

        for (UserInfo user : UserManager.get(mContext).getUsers()) {
            mCurrentUser = user.getUserHandle().getIdentifier();
            if (getValue(TUNER_VERSION, 0) != CURRENT_TUNER_VERSION) {
                upgradeTuner(getValue(TUNER_VERSION, 0), CURRENT_TUNER_VERSION);
            }
        }

        mCurrentUser = ActivityManager.getCurrentUser();
        mUserTracker = new CurrentUserTracker(mContext) {
            @Override
            public void onUserSwitched(int newUserId) {
                mCurrentUser = newUserId;
                reloadAll();
                reregisterAll();
            }
        };
        mUserTracker.startTracking();
    }

    @Override
    public String getValue(String setting) {
        return Settings.Secure.getStringForUser(mContentResolver, setting, mCurrentUser);
    }

    @Override
    public void setValue(String setting, String value) {
         Settings.Secure.putStringForUser(mContentResolver, setting, value, mCurrentUser);
    }

    @Override
    public void addTunable(Tunable tunable, String... keys) {
        for (String key : keys) {
            addTunable(tunable, key);
        }
    }

    private void addTunable(Tunable tunable, String key) {
        if (!mTunableLookup.containsKey(key)) {
            mTunableLookup.put(key, new ArraySet<Tunable>());
        }
        mTunableLookup.get(key).add(tunable);
        if (LeakDetector.ENABLED) {
            mTunables.add(tunable);
            Dependency.get(LeakDetector.class).trackCollection(mTunables, "TunerService.mTunables");
        }
        Uri uri = Settings.Secure.getUriFor(key);
        if (!mListeningUris.containsKey(uri)) {
            mListeningUris.put(uri, key);
            mContentResolver.registerContentObserver(uri, false, mObserver, mCurrentUser);
        }
        // Send the first state.
        String value = Settings.Secure.getStringForUser(mContentResolver, key, mCurrentUser);
        tunable.onTuningChanged(key, value);
    }

    @Override
    public void removeTunable(Tunable tunable) {
        for (Set<Tunable> list : mTunableLookup.values()) {
            list.remove(tunable);
        }
        if (LeakDetector.ENABLED) {
            mTunables.remove(tunable);
        }
    }
}

```

The `TunerServiceImpl` will store setting value to `Settings.Secure`, and the setting value is the user's tuning selection. And it uses the `ContentObserver` to observe the setting value changed, and if it receives the value changed event, it will invoke the `onTuningChanged` of `Tunable` instance that combined with the setting key.

### `Tunable`

From `TunerServiceImpl`, we know we someone invoke the `TunerService.addTunable`, it will pass the setting keys it wants to listen. So who is the invoker?

This is `NavigationBarInflaterView` for natigation bar layout.

```java
@Override
protected void onAttachedToWindow() {
    super.onAttachedToWindow();
    Dependency.get(TunerService.class).addTunable(this, NAV_BAR_VIEWS, NAV_BAR_LEFT,
            NAV_BAR_RIGHT);
    Dependency.get(PluginManager.class).addPluginListener(this,
            NavBarButtonProvider.class, true /* Allow multiple */);
}
```

When the `NavigationBarInflaterView` is attached to window, it will register itself as a `Tunable` to `TunerService` with listening keys: `NAV_BAR_VIEWS`, `NAV_BAR_LEFT` and `NAV_BAR_RIGHT`. And the `NAV_BAR_VIEWS` is for navigation bar layout. And `NavigationBarInflaterView` will reload the navigation bar in `onTuningChanged` to response the setting value changed event.

## `TunerActivity`

Okay, we know how to start `TunerService`, and real responser how to register and response to tuning setting value changed event. So who does change the setting value?

Obviously, it's `TunerActivity`. In the [Preview](#preview) section, we should enable the `TunerActivity`, and select new layout style for navigation bar in it. For navigation bar layout,  we can see following setting value logic in `NavBarTuner`:

```java
private void bindLayout(ListPreference preference) {
    addTunable((key, newValue) -> mHandler.post(() -> {
        String val = newValue;
        if (val == null) {
            val = "default";
        }
        preference.setValue(val);
    }), NAV_BAR_VIEWS);
    preference.setOnPreferenceChangeListener((preference1, newValue) -> {
        String val = (String) newValue;
        if ("default".equals(val)) val = null;
        Dependency.get(TunerService.class).setValue(NAV_BAR_VIEWS, val);
        return true;
    });
}
```

The `NAV_BAR_VIEWS` appears again. It's clear.

## What's the use of `TunerService`?

From the previous analyzing, the `AOSP` doesn't want to expose `TunerService`'s UI `TunerActivity` to normal user. But it provides a complete mechanism to control some `SystemUI` widgets from UI dynamically. If you are a ROM developer, maybe you can add more customization, and expose them to user by UI or setting, so that the user can customize the system based on their preference.