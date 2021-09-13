---
layout: post
title:  "Analyze window size changing sequence"
date:   2020-04-11 21:14 +0800
---

> This article based on `AOSP` 9.0

It's important to learn the changing sequence of window size from `ActivityManager` space to `WindowManager` space. This article will analyze this sequence to learn some important data structures of Android window system.

## `ActivityManager` space

```
   ,--------------------------------------------------.   
   |ActivityDisplay                                   |   
   |--------------------------------------------------|   
   |DisplayWindowController mWindowContainerController|   
   |--------------------------------------------------|   
   `--------------------------------------------------'   
                             |                            
                             |                            
    ,------------------------------------------------.    
    |ActivityStack                                   |    
    |------------------------------------------------|    
    |StackWindowController mWindowContainerController|    
    |------------------------------------------------|    
    `------------------------------------------------'    
                             |                            
,--------------------------------------------------------.
|TaskRecord                                              |
|--------------------------------------------------------|
|TaskWindowContainerController mWindowContainerController|
|--------------------------------------------------------|
`--------------------------------------------------------'
                             |                            
                                                          
,-------------------------------------------------------. 
|ActivityRecord                                         | 
|-------------------------------------------------------| 
|AppWindowContainerController mWindowContainerController| 
|-------------------------------------------------------| 
`-------------------------------------------------------' 
```

In `ActivityManager` space, there are four important classes, that represents the application object:

1. `ActivityDisplay`: represents display in the system. It will use display size as its size bounds. It holds zero or more attached `ActivityStack`s to the display it represents.
2. `ActivityStack`: It holds zero or more attached `TaskRecord`s that exist in it. There are many stacks for different usage. For example, home stack for home app or apps started from home app, and want to exist in home stack; fullscreen stack for normal fullscreen apps.
3. `TaskRecord`: It holds zero or more attached `ActivityRecord`s that exist in it. The initial `ActivityRecord` in `TaskRecord` is `realActivity`, and it can start other `ActivityRecord`. If the flag indicates that it want to create a new task for new `ActivityRecord`, the created `ActivityRecord` will be stored in the same `TaskRecord`.
4. `ActivityRecord`: represents the `Activity` instance.

The four classes represents the critical concept of application in `ActivityManager` space. The `ActivityManager` space has its rules to calculate and change `Activity` or window size. For example, in multi-window mode, there are many codes to change window size from `ActivityManager` space. We know, the `ActivityManager` space is the pure abstract of application lifecycle. It doesn't render the window actually. So it should notify the window attributes, such as window size to `WindowManager` space, and let it to do left things.

From the preceding diagram, we can find there is a `WindowContainerController` instance in every level. They will notify the window attribute to corresponding level in `WindowManager` space. And following diagram shows the relationship:

```
DisplayWindowController -> DisplayContent

StackWindowContainerController -> TaskStack

TaskWindowContainerController -> Task

AppWindowContainerController -> AppWindowToken
```

When `WindowContainerController` in `ActivityManager` space is created, it will trigger `WindowManager` to create corresponding `WindowContainer` in `WindowManager` space.

## `WindowManager` space

`DisplayContent`, `TaskStack`, `Task` and `AppWindowToken` both extend from `WindowContainer`. Before analyzing, we should look into the important content in those classes.

### `WindowContainer`

```java
/**
 * Defines common functionality for classes that can hold windows directly or through their
 * children in a hierarchy form.
 */
class WindowContainer<E extends WindowContainer> extends ConfigurationContainer<E>
        implements Comparable<WindowContainer>, Animatable {

    /**
     * The parent of this window container.
     * For removing or setting new parent {@link #setParent} should be used, because it also
     * performs configuration updates based on new parent's settings.
     */
    private WindowContainer<WindowContainer> mParent = null;
    // List of children for this window container. List is in zorder as the children appear on
    // screen with the top-most window container at the tail of the list.
    protected final WindowList<E> mChildren = new WindowList<E>();
    // The owner/creator for this container. No controller if null.
    WindowContainerController mController;

    // Every window container has a SurfaceControl
    protected SurfaceControl mSurfaceControl;
    private int mLastLayer = 0;
    private SurfaceControl mLastRelativeToLayer = null;
    protected final SurfaceAnimator mSurfaceAnimator;
    protected final WindowManagerService mService;

    @Override
    public void onConfigurationChanged(Configuration newParentConfig) {
        super.onConfigurationChanged(newParentConfig);
        updateSurfacePosition();
        scheduleAnimation();
    }

    // Other codes
 }
```
From the above `WindowContainer` code snippet, we can find every `WindowContainer` has a `SurfaceControl` instance, and it will used to create `Layer` in `SurfaceFlinger`. And it will be used in later content.

### `DisplayContent`

1. `AboveAppWindowContainers mAboveAppWindowContainers`: The container to store all non-app window containers that should be displayed above the app containers, e.g. Status bar.
2. `NonAppWindowContainers mBelowAppWindowsContainers`: The container to store all non-app window containers that should be displayed below the app containers, e.g. Wallpaper.
3. `NonMagnifiableWindowContainers mImeWindowContainers`: The container to store all IME window containers. Note that the z-ordering of the IME windows will depend on the IME target. We mainly have this container grouping so we can keep track of all the IME window containers together and move them in-sync if/when needed. We use a subclass of WindowContainer which is omitted from screen magnification, as the IME is never magnified.
4. `SurfaceControl mOverlayLayer`: We organize all top-level Surfaces in to the following layers. mOverlayLayer contains a few Surfaces which are always on top of others and omitted from Screen-Magnification, for example the strict mode flash or the magnification overlay itself.

### `AppWindowToken`

`AppWindowToken` extends from `WindowToken`, and `WindowToken` extends from `WindowContainer<WindowState>`, So there is an inherited field:

```java
protected final WindowList<WindowState> mChildren = new WindowList<WindowState>();
```

### `WindowState`

From above `WindowContainer` code snippet, we can find that `WindowContainer` holds its parent `WindowContainer`, and its children `WindowContainer`. In `ActivityManager` space, we know `WindowContainerController` has a parent/children relationship, also their corresponding `WindowContainer`s in `WindowManager` space have the same parent/children relationship.

`AppWindowToken` in `WindowManager` space is corresponding to `ActivytRecord` in `ActivityManager` space to represent the actual `Activity` or window(in most occasion, one `Activity` has one window). And `AppWindowToken` uses `WindowState` to store the window attribute, and calculate window frame based on current system and window state.

From the above `WindowContainer` code snippet, we can also find that there is field called `mSurfaceControl`. It will create a `Layer` in `SurfaceFlinger` space, and update window size to `Layer`. The `SurfaceFlinger` will render window content to display by `HWC` or `GPU` based on `Layer` content.

```java
private void updateSurfacePosition(Transaction t) {
    if (mSurfaceControl == null) {
        return;
    }

    transformFrameToSurfacePosition(mFrame.left, mFrame.top, mSurfacePosition);

    // Freeze position while we're unrotated, so the surface remains at the position it was
    // prior to the rotation.
    if (!mSurfaceAnimator.hasLeash() && mPendingForcedSeamlessRotate == null &&
            !mLastSurfacePosition.equals(mSurfacePosition)) {
        t.setPosition(mSurfaceControl, mSurfacePosition.x, mSurfacePosition.y);
        mLastSurfacePosition.set(mSurfacePosition.x, mSurfacePosition.y);
        if (surfaceInsetsChanging() && mWinAnimator.hasSurface()) {
            mLastSurfaceInsets.set(mAttrs.surfaceInsets);
            t.deferTransactionUntil(mSurfaceControl,
                    mWinAnimator.mSurfaceController.mSurfaceControl.getHandle(),
                    getFrameNumber());
        }
    }
}
```

For example, preceding code snippet is copied from `WindowState`, and it invokes `mSurfaceControl` to update the window position to `Layer` in `SurfaceFlinger`.

### Create `WindowState`

From the above analyzing, we know when `ActivityManager` space creates specific `WindowContainerController`, the `WindowContainerController` will create specific `WindowContainer`. The `AppWindowToken` is the `WindowContainer` corresponding to `ActivityRecord`, not `WindowState`. And `AppWindowToken` holds the `WindowState`. So when to create `WindowState` and bind it to `AppWindowToken`?

When `ActivityManager` space initializes `Activity`, it will create `ViewRootImpl` for it, and invoke `ViewRootImpl`'s `setView` to initialize layout. In `ViewRootImpl`'s `setView` will use global window session(`WindowManagerGlobal.getWindowSession()`) to pass the window attribute from `ActivityManager` space to `WindowManager` space by its method `addToDisplay`. Then `WindowManagerService` will use passed window attribute to create `WindowState`, and add it to the `AppWindowToken` bound to specific `ActivityRecord`.

## Bounds restriction

In `ActivityManager` space and `WindowManager` space, the system use parent/children to describe the relationship between different abstracts. Also, the system will the parent/children relationship to restrict final window bounds. For example, if the the `TaskRecord`'s bound is (100, 100, 700, 700), and the `ActivityRecord`'s bound is (50, 50, 500, 500), the final window size will be cropped to (100, 100, 500, 500) based on its parent bound.

The real cropping logic is in `Layer.cpp` in `SurfaceFlinger`:

```c++
FloatRect Layer::computeBounds(const Region& activeTransparentRegion) const {
    const Layer::State& s(getDrawingState());
    Rect win(s.active.w, s.active.h);

    if (!s.crop.isEmpty()) {
        win.intersect(s.crop, &win);
    }

    const auto& p = mDrawingParent.promote();
    FloatRect floatWin = win.toFloatRect();
    FloatRect parentBounds = floatWin;
    if (p != nullptr) {
        // We pass an empty Region here for reasons mirroring that of the case described in
        // the computeScreenBounds reduceTransparentRegion=false case.
        parentBounds = p->computeBounds(Region());
    }

    Transform t = s.active.transform;


    if (p != nullptr || !s.finalCrop.isEmpty()) {
        floatWin = t.transform(floatWin);
        floatWin = floatWin.intersect(parentBounds);

        if (!s.finalCrop.isEmpty()) {
            floatWin = floatWin.intersect(s.finalCrop.toFloatRect());
        }
        floatWin = t.inverse().transform(floatWin);
    }

    // subtract the transparent region and snap to the bounds
    return reduce(floatWin, activeTransparentRegion);
}
```

If we use [dumpsys-parser](https://github.com/utzcoz/dumpsys-parser) to parse the `adb shell dumpsys SurfaceFlinger` result, we will see the result likes following content:

```
|-- Display Overlays#0, isOpaque false, region Rect(0, 0, 3840, 3840)
`-- Display Root#0, isOpaque false, region Rect(0, 0, 3840, 3840)
    |-- com.android.server.wm.DisplayContent$TaskStackContainers@8b527d1#0, isOpaque false, region Rect(0, 0, 3840, 3840)
    |   |-- Stack=0#0, isOpaque false, region Rect(0, 0, 1920, 1080)
    |   |   `-- Task=43#0, isOpaque false, region Rect(0, 0, 3840, 3840)
    |   |       `-- AppWindowToken{67b5d6b token=Token{637baba ActivityRecord{5470fe5 u0 com.farmerbb.taskbar.androidx86/com.farmerbb.taskbar.activity.HomeActivity t43}}}#0, isOpaque false, region Rect(0, 0, 3840, 3840)
    |   |           `-- 2e7b096 com.farmerbb.taskbar.androidx86/com.farmerbb.taskbar.activity.HomeActivity#0, isOpaque false, region Rect(0, 0, 3840, 3840)
    |   |               `-- com.farmerbb.taskbar.androidx86/com.farmerbb.taskbar.activity.HomeActivity#0, isOpaque false, region Rect(0, 0, 1920, 1080)
    |   |-- animationLayer#0, isOpaque false, region Rect(0, 0, 3840, 3840)
    |   |-- boostedAnimationLayer#0, isOpaque false, region Rect(0, 0, 3840, 3840)
    |   |-- homeAnimationLayer#0, isOpaque false, region Rect(0, 0, 3840, 3840)
    |   `-- splitScreenDividerAnchor#0, isOpaque false, region Rect(0, 0, 3840, 3840)
    |-- mAboveAppWindowsContainers#0, isOpaque false, region Rect(0, 0, 3840, 3840)
    |   |-- WindowToken{1e95e8e android.os.BinderProxy@ff44e89}#0, isOpaque false, region Rect(0, 0, 3840, 3840)
    |   |   `-- b00b6af AssistPreviewPanel#0, isOpaque false, region Rect(0, 1080, 3840, 4920)
    |   |-- WindowToken{4f36f0f android.os.BinderProxy@b4c3c6e}#0, isOpaque false, region Rect(0, 0, 3840, 3840)
    |   |   `-- c170b9c com.farmerbb.taskbar.androidx86#0, isOpaque false, region Rect(0, 1008, 3840, 4848)
    |   |-- WindowToken{85a4589 android.os.BinderProxy@3ead890}#0, isOpaque false, region Rect(0, 0, 3840, 3840)
    |   |   `-- 95898e DockedStackDivider#0, isOpaque false, region Rect(0, 0, 3840, 3840)
    |   |-- WindowToken{8d12250 android.os.BinderProxy@d49a013}#0, isOpaque false, region Rect(0, 0, 3840, 3840)
    |   |   `-- 3602c49 NavigationBar#0, isOpaque false, region Rect(0, 1008, 3840, 4848)
    |   |       `-- NavigationBar#0, isOpaque false, region Rect(0, 1008, 1920, 1080)
    |   |-- WindowToken{9c004 android.os.BinderProxy@e781417}#0, isOpaque false, region Rect(0, 0, 3840, 3840)
    |   |   `-- 3c029ed com.farmerbb.taskbar.androidx86#0, isOpaque false, region Rect(0, 918, 3840, 4758)
    |   |       `-- #0, isOpaque false, region Rect(0, 918, 1920, 1008)
    |   |-- WindowToken{a22180c android.os.BinderProxy@aa273f}#0, isOpaque false, region Rect(0, 0, 3840, 3840)
    |   |   `-- 9201555 StatusBar#0, isOpaque false, region Rect(0, 0, 3840, 3840)
    |   |       `-- StatusBar#0, isOpaque false, region Rect(0, 0, 1920, 36)
    |   `-- WindowToken{b01ed2b android.os.BinderProxy@703b17a}#0, isOpaque false, region Rect(0, 0, 3840, 3840)
    |       `-- 78b6b46 com.farmerbb.taskbar.androidx86#0, isOpaque false, region Rect(0, 36, 3840, 3876)
    |-- mBelowAppWindowsContainers#0, isOpaque false, region Rect(0, 0, 3840, 3840)
    |   `-- WallpaperWindowToken{2817237 token=android.os.Binder@9213336}#0, isOpaque false, region Rect(0, 0, 3840, 3840)
    |       `-- 8b85d8d com.android.systemui.ImageWallpaper#0, isOpaque false, region Rect(0, 0, 3840, 3840)
    |           `-- com.android.systemui.ImageWallpaper#0, isOpaque true, region Rect(-480, -740, 2400, 1820)
    `-- mImeWindowsContainers#0, isOpaque false, region Rect(0, 0, 3840, 3840)
        `-- WindowToken{3827d8c android.os.Binder@a5eb2bf}#0, isOpaque false, region Rect(0, 0, 3840, 3840)
```

The tree liking result is compatible to the above analyzing. So if we found window size is not correct, we should check the above result of window and its parent size whether meeting our expection. If not, just to find the location to set or change it to find the reason.

## Summary

```
     ,--------------------------------------------------.                                               
     |ActivityDisplay                                   |     
     |--------------------------------------------------|  ,--------------.   ,------------------------.
     |DisplayWindowController mWindowContainerController|--|DisplayContent|---|Layer for DisplayContent|
     |--------------------------------------------------|  `--------------'   `------------------------'
     `--------------------------------------------------'          |
                                |                                  |                                    
                                |                                  |                                    
       ,------------------------------------------------.          |   
       |ActivityStack                                   |          |          ,-------------------.     
       |------------------------------------------------|     ,---------.     |Layer for TaskStack|     
       |StackWindowController mWindowContainerController|-----|TaskStack|-----`-------------------'   
       |------------------------------------------------|     `---------'          
       `------------------------------------------------'          |                                   
                                |                                  |                                   
   ,--------------------------------------------------------.      |                                   
   |TaskRecord                                              |      |                 
   |--------------------------------------------------------|   ,----.           ,--------------.       
   |TaskWindowContainerController mWindowContainerController|---|Task|-----------|Layer for Task|       
   |--------------------------------------------------------|   `----'           `--------------'        
   `--------------------------------------------------------'      |              
                               |                                   |                                    
                               |                                   |                                    
,-------------------------------------------------------.          | 
|ActivityRecord                                         |          |          ,------------------------.
|-------------------------------------------------------|  ,--------------.   |Layer for AppWindowToken|
|AppWindowContainerController mWindowContainerController|--|AppWindowToken|---`------------------------'
|-------------------------------------------------------|  `--------------'   
`-------------------------------------------------------'                                               
```