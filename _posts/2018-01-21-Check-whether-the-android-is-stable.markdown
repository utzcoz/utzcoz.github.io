---
layout: post
title:  "Check whether the android is stable"
date:   2018-01-21 21:05 +0800
---

> This article based on Android 7.0, and it maybe obsolete.

In `WindowManagerService.java` add a field:

```
long mLastUpdateSurfaceRealTime = SystemClock.elapsedRealtime();
```

And then, in the last of `WindowSurfacePlacer.java->performSurfacePlacementInner(boolean recoveringMemory)` add below code:

```
mService.mLastUpdateSurfaceRealTime = SystemClock.elapsedRealtime();
``` 

Lastly, add a method in `WindowManagerService.java` to check whether the android is stable:

```
public boolean isSystemStable() {
    boolean isDisplayOk = okToDisplay();
    boolean areAllAppsProcessed =
                     mOpeningApps.size() == 0 && mClosingApps.size() == 0;
    long lastUpdateSurfaceToNowInterval =
                     SystemClock.elapsedRealtime() - mLastUpdateSurfaceRealTime;
    boolean isSurfaceStable =
                     lastUpdateSurfaceToNowInterval >= 2000;
    return isDisplayOk && !mWaitingForConfig && !mClientFreezingScreen
                     && areAllAppsProcessed && isSurfaceStable;
}
```

The above code shows the case the system must satisfy when its stable:

1. The display is ok to show content.
2. All configurations are processed.
3. There doesn't exist a client to freeze screen for animation or other purpose.
4. All apps are processed, no opening apps and no closing apps.
5. The surface is stable which means that time interval between the last update surface time and now is exceed our limit(the limit is based on the experience).
