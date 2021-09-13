---
layout: post
title:  "Introduce SystemUI OverviewProxyService"
date:   2020-04-02 14:20 +0800
---

> This article based on `AOSP` 9.0

From `AOSP` 9.0, if we click the recents button in navigation bar, the `Launcher3` will show its recents view, instead of `SystemUI`. In another word, from `AOSP` 9.0, the `SystemUI` provide a method to implement recents out the `SystemUI`. And if there is an another implementation, the `SystemUI` will use its fallback implementation. The bridge that permits to implement another recents is `OverviewProxyService` in `SystemUI`.

## Initialize `OverviewProxyService`

### `Dependency`

In `Dependency.start`, there is a piece of code to initialize `OverviewProxyService`:

```java
mProviders.put(OverviewProxyService.class, () -> new OverviewProxyService(mContext));
```
 And then, other code can use `Dependency.get(OverviewProxyService.class)` to get the `OverviewProxyService` instance, such as following code snippet in `Recents`:

 ```java
mOverviewProxyService = Dependency.get(OverviewProxyService.class);
 ```

### `OverviewProxyService`

In `OverviewProxyService`, it get the recents component name from system config:

```java
mRecentsComponentName = ComponentName.unflattenFromString(context.getString(
    com.android.internal.R.string.config_recentsComponentName));
```

The default `config_recentsComponentName` is `com.android.launcher3/com.android.quickstep.RecentsActivity`, the `RecentsActivity` in `Launcher3`.

And then use got component name to create quick step service `Intent`:

```java
private static final String ACTION_QUICKSTEP = "android.intent.action.QUICKSTEP_SERVICE";

mQuickStepIntent = new Intent(ACTION_QUICKSTEP)
        .setPackage(mRecentsComponentName.getPackageName());
```
Next, the `OverviewProxyService` will check the enable state of `RecentsActivity`:

```java
private void updateEnabledState() {
    mIsEnabled = mContext.getPackageManager().resolveServiceAsUser(mQuickStepIntent,
            MATCH_DIRECT_BOOT_UNAWARE,
            ActivityManagerWrapper.getInstance().getCurrentUserId()) != null;
}
```

If the `RecentsActivity` is enabled, there are all left things.

### `NotificationLockscreenUserManager`

In `NotificationLockscreenuserManager`, if it receives the `ACTION_USER_UNLOCKED` broadcast, it will invoke `OverviewProxyService.startConnectionToCurrentUser` to start to connect the `Launcher3` quick step service:

```java
if (Intent.ACTION_USER_UNLOCKED.equals(action)) {
    // Start the overview connection to the launcher service
    Dependency.get(OverviewProxyService.class).startConnectionToCurrentUser();
}
```

### `OverviewProxyService`

The `OverviewProxyService.startConnectionToCurrentUser` will use normal method to bind quick step service:

```java
Intent launcherServiceIntent = new Intent(ACTION_QUICKSTEP)
        .setPackage(mRecentsComponentName.getPackageName());
boolean bound = false;
try {
    bound = mContext.bindServiceAsUser(launcherServiceIntent,
            mOverviewServiceConnection, Context.BIND_AUTO_CREATE,
            UserHandle.of(mDeviceProvisionedController.getCurrentUser()));
} catch (SecurityException e) {
    Log.e(TAG_OPS, "Unable to bind because of security error", e);
}
```

If it is failed to bind quick step service, it will try again later; If it is successfully to bind quick step service, it will cast the received `IBinder` service to `IOverviewProxy`:

```java
private final ServiceConnection mOverviewServiceConnection = new ServiceConnection() {
    @Override
    public void onServiceConnected(ComponentName name, IBinder service) {
        ....
        mOverviewProxy = IOverviewProxy.Stub.asInterface(service);
        ...
        try {
            mOverviewProxy.onBind(mSysUiProxy);
        } catch (RemoteException e) {
            Log.e(TAG_OPS, "Failed to call onBind()", e);
        }
        ...
    }
};
```

And then use `onBind` method to pass its `mSysUiProxy`:

```java
private ISystemUiProxy mSysUiProxy = new ISystemUiProxy.Stub() {
    ....
}

interface ISystemUiProxy {
    GraphicBufferCompat screenshot(in Rect sourceCrop, int width, int height, int minLayer,
            int maxLayer, boolean useIdentityTransform, int rotation) = 0;
    void startScreenPinning(int taskId) = 1;
    void setInteractionState(int flags) = 4;
    void onSplitScreenInvoked() = 5;
    void onOverviewShown(boolean fromHome) = 6;
    Rect getNonMinimizedSplitScreenSecondaryBounds() = 7;
    void setBackButtonAlpha(float alpha, boolean animate) = 8;
}
```

Let' do a summary of definite period, when the user unlocked, the `OverviewProxyService` will connect to quick step service, defined in pre-defined `RecentsActivity` package, in our occasion is `Launcher3`. The quick step service should receive the action `android.intent.action.QUICKSTEP_SERVICE`, and return `IOverviewProxy` instance as `onBind` method result. The `OverviewProxyService` will use `IOverviewProxy`'s `onBind` method to pass `ISystemUiProxy` instance to quick step service. In `Launcher3`, the quick step service is called `TouchInteractionService`. So the sequence of communication is as following graph:

```
     ,--------------------.                          ,-----------------------.
     |OverviewProxyService|                          |TouchInteractionService|
     `---------+----------'                          `-----------+-----------'
               |                   bind service                  |            
               | ------------------------------------------------>            
               |                                                 |            
               |          return IOverviewProxy instance         |            
               | <- - - - - - - - - - - - - - - - - - - - - - - -             
               |                                                 |            
               | use IOverviewProxy.onBind to pass ISystemUiProxy|            
               | ------------------------------------------------>            
     ,---------+----------.                          ,-----------+-----------.
     |OverviewProxyService|                          |TouchInteractionService|
     `--------------------'                          `-----------------------'
```

Now the `OverviewProxyService` in `SystemUI` has a proxy called `IOverviewProxy` to send command to `Launcher3`, and `TouchInteractionService` in `Launcher3` has another proxy called `ISysUiProxy` to send command to `SystemUI`. What we should dig into is when to communication between them.

## Show recents

Despite of using `ALT + TAB`, or clicking recents app button in navigation bar to show recents app, they will call the `PhoneWindowManager.showRecentApps(boolean)` to show the recents app. And later sequence is as following diagram:

```
     ,------------------.          ,----------.          ,------------.          ,-------.          ,------------------------------.
     |PhoneWindowManager|          |IStatusBar|          |CommandQueue|          |Recents|          |IOverviewProxy.onOverviewShown|
     `--------+---------'          `----+-----'          `-----+------'          `---+---'          `--------------+---------------'
              | showRecentsApps(boolean)|                      |                     |                             |                
              | ------------------------>                      |                     |                             |                
              |                         |                      |                     |                             |                
              |                         |    showRecentApps    |                     |                             |                
              |                         | --------------------->                     |                             |                
              |                         |                      |                     |                             |                
              |                         |                      |   showRecentApps    |                             |                
              |                         |                      | ------------------->|                             |                
              |                         |                      |                     |                             |                
              |                         |                      |                     |       showRecentApps        |                
              |                         |                      |                     |---------------------------->|                
     ,--------+---------.          ,----+-----.          ,-----+------.          ,---+---.          ,--------------+---------------.
     |PhoneWindowManager|          |IStatusBar|          |CommandQueue|          |Recents|          |IOverviewProxy.onOverviewShown|
     `------------------'          `----------'          `------------'          `-------'          `------------------------------'
```

If `Recents` finds the existing `IOverviewProxy`, it will call the `IOverviewProxy.onOverviewShown` and return; otherwise it will show the fallback recents in `SystemUI`. Other operation such as hide recents, use the likely sequence.

## Set back button alpha

When `TouchInteractionService` receives the `ISystemUiProxy`, it will pass it to its inner state, such as `OverviewInteractionState`. If `OverviewInteractionState` wants to set the alpha of back button in navigation bar, it will call the `ISystemUiProxy.setBackButtonAlpha`:

```java
private void applyBackButtonAlpha(float alpha, boolean animate) {
    if (mISystemUiProxy == null) {
        return;
    }
    try {
        mISystemUiProxy.setBackButtonAlpha(alpha, animate);
    } catch (RemoteException e) {
        Log.w(TAG, "Unable to update overview back button alpha", e);
    }
}
```

In `OverviewProxyService`'s `ISystemUiProxy` instance, it will response the command at its `setBackButtonAlpha` method:

```java
public void setBackButtonAlpha(float alpha, boolean animate) {
    long token = Binder.clearCallingIdentity();
    try {
        mHandler.post(() -> {
            notifyBackButtonAlphaChanged(alpha, animate);
        });
    } finally {
        Binder.restoreCallingIdentity(token);
    }
}
```

The left thing is `SystemUI`'s response to set back button alpha command by set the alpha for back button.

## Summary

The core of `OverviewProxyService` is to connect to service with the specific action, and exchange the defined proxy instance to communicate with each. When `SystemUI` wants to change the state, it will notify the `Launcher3` with proxy `IOverviewProxy`, and if `Launcher3` wants to change the state, it will notify the `SystemUI` with proxy `ISystemUiProxy`. The left thing is to hook the proxy interface invoking in correct point. The structure is clear and simple, and we can use the similar structure to do the similar things.



