---
layout: post
title:  "Analyze window resizing"
date:   2020-05-12 13:36 +0800
---

## Code base

`AOSP` 9.0

## Usage

We click the shadow of freeform window, and drag it to resize window.

## Input flinger

The `InputDispatcher.cpp` in input flinger will dispatch the input event to java part. For resizing, it will find
the window which touchable region contains the input event to dispatch the input event.

In `InputDispatcher::findTouchedWindowTargetsLocked`, it uses `InputWindowHandle.cpp`'s `touchableRegionContainsPoint`
to check whether the click point is in its touchable region based on its `touchableRegion` field, a `Region` instance.
The `touchableRegion` field value of `InputWindowHandle.cpp` is just a copy of `InputWindowHandle.java`'s `touchableRegion`.
Okay, who sets it?

In `InputMonitor.addInputWindowHandle`, it will invoke `WindowState.getTouchableRegion` to set the
`InputWindowHandle.java`'s `touchableRegion`:

```java
int getTouchableRegion(Region region, int flags) {
    final boolean modal = (flags & (FLAG_NOT_TOUCH_MODAL | FLAG_NOT_FOCUSABLE)) == 0;
    if (modal && mAppToken != null) {
        // Limit the outer touch to the activity stack region.
        flags |= FLAG_NOT_TOUCH_MODAL;
        // If this is a modal window we need to dismiss it if it's not full screen and the
        // touch happens outside of the frame that displays the content. This means we
        // need to intercept touches outside of that window. The dim layer user
        // associated with the window (task or stack) will give us the good bounds, as
        // they would be used to display the dim layer.
        final Task task = getTask();
        if (task != null) {
            task.getDimBounds(mTmpRect);
        } else {
            getStack().getDimBounds(mTmpRect);
        }
        if (inFreeformWindowingMode()) {
            // For freeform windows we the touch region to include the whole surface for the
            // shadows.
            final DisplayMetrics displayMetrics = getDisplayContent().getDisplayMetrics();
            final int delta = WindowManagerService.dipToPixel(
                    RESIZE_HANDLE_WIDTH_IN_DP, displayMetrics);
            mTmpRect.inset(-delta, -delta);
        }
        region.set(mTmpRect);
        cropRegionToStackBoundsIfNeeded(region);
    } else {
        // Not modal or full screen modal
        getTouchableRegion(region);
    }
    return flags;
}
```

If the window is freeform, the `getTouchableRegion` will add shadow size to window touchable region for resizing.

## WMS and AMS

The `InputDispatcher.cpp`'s dispatch will trigger `android_view_InputEventReceiver.cpp` to dispatch input event to java
part. The `android_view_InputEventReceiver.cpp` will invoke `InputEventReceiver.java`'s `dispatchInputEvent` to dispatch
input event. But there are many `InputEventReceiver` implementation, such as `PointerEventDispatcher.java`,
`WindowInputEventReceiver` in `ViewRootImpl.java`. Who will be invoked? The answer is all of them. Their 
`dispatchInputEvent` will be invoked, but they do different things orthogonal.
The `WindowInputEventHandler` will dispatch the event to view as normal, and `PointerEventDispatch` will check
the window outside event, and change the focused stack dynamically on the global level.
In `WindowManagerService` constructor, we can see the following code:

```java
if(mInputManager != null) {
    final InputChannel inputChannel = mInputManager.monitorInput(TAG_WM);
    mPointerEventDispatcher = inputChannel != null
            ? new PointerEventDispatcher(inputChannel) : null;
} else {
    mPointerEventDispatcher = null;
}
```

The WMS will create `InputChannel` for itself, the same as normal window, and use it as the channel to receive input event
from `InputDispatcher`.

The `PointerEventDispatcher` will invoke `TaskTapPointerEventListener.onPointEvent` to process event, and 
`TaskTapPointerEventListener.onPointEvent` will invoke 
`WindowManagerService.mTaskPositioningController.handleTapOutsideTask` to process event.

```java
void handleTapOutsideTask(DisplayContent displayContent, int x, int y) {
    mHandler.post(() -> {
        int taskId = -1;
        synchronized (mService.mWindowMap) {
            final Task task = displayContent.findTaskForResizePoint(x, y);
            if (task != null) {
                if (!startPositioningLocked(task.getTopVisibleAppMainWindow(), true /*resize*/,
                        task.preserveOrientationOnResize(), x, y)) {
                    return;
                }
                taskId = task.mTaskId;
            } else {
                taskId = displayContent.taskIdFromPoint(x, y);
            }
        }
        if (taskId >= 0) {
            try {
                mActivityManager.setFocusedTask(taskId);
            } catch (RemoteException e) {
            }
        }
    });
}
```
Firstly, it will check whether the input point is in one task shadow region, if found, then it will invoke `startPositioningLocked` to start resizing; if not, it will try to find the task, which content region contains the input point, and then set it to focused task.

When we click one freeform window to make it focused is processed in this method, and this method is also the start point
to start resizing window. But there exists a problem, if we open a freeform window on the launcher, and then we click the launcher, the launcher will be focused, and bring back to front to cover up the freeform window. We can fix this problem, just add a minor patch.

```java
private boolean startPositioningLocked(WindowState win, boolean resize,
        boolean preserveOrientation, float startX, float startY) {

    // check window, input channel and display
    ......
    mTaskPositioner = TaskPositioner.create(mService);
    mTaskPositioner.register(displayContent);
    mInputMonitor.updateInputWindowsLw(true /*force*/);

    // We need to grab the touch focus so that the touch events during the
    // resizing/scrolling are not sent to the app. 'win' is the main window
    // of the app, it may not have focus since there might be other windows
    // on top (eg. a dialog window).
    WindowState transferFocusFromWin = win;
    if (mService.mCurrentFocus != null && mService.mCurrentFocus != win
            && mService.mCurrentFocus.mAppToken == win.mAppToken) {
        transferFocusFromWin = mService.mCurrentFocus;
    }
    if (!mInputManager.transferTouchFocus(
            transferFocusFromWin.mInputChannel, mTaskPositioner.mServerChannel)) {
        Slog.e(TAG_WM, "startPositioningLocked: Unable to transfer touch focus");
        mTaskPositioner.unregister();
        mTaskPositioner = null;
        mInputMonitor.updateInputWindowsLw(true /*force*/);
        return false;
    }

    mTaskPositioner.startDrag(win, resize, preserveOrientation, startX, startY);
    return true;
}
```

It will do some checking, and create `TaskPositioner` instance. And then it will transfer focus from
current task to `TaskPositioner.mServerChannel` by `InputManager.transferTouchFocus`. The purpose
of transferring is to use another virtual target to consume drag input event, and notify the system
to change the size of window. If not, and the window process the coming drag input event, the system
will do new calculation for every input event, because after resizing, the touchable region has changed.

```java
void register(DisplayContent displayContent) {
    final Display display = displayContent.getDisplay();

    if (mClientChannel != null) {
        Slog.e(TAG, "Task positioner already registered");
        return;
    }

    mDisplay = display;
    mDisplay.getMetrics(mDisplayMetrics);
    final InputChannel[] channels = InputChannel.openInputChannelPair(TAG);
    mServerChannel = channels[0];
    mClientChannel = channels[1];
    mService.mInputManager.registerInputChannel(mServerChannel, null);

    mInputEventReceiver = new WindowPositionerEventReceiver(
            mClientChannel, mService.mAnimationHandler.getLooper(),
            mService.mAnimator.getChoreographer());

    mDragApplicationHandle = new InputApplicationHandle(null);
    mDragApplicationHandle.name = TAG;
    mDragApplicationHandle.dispatchingTimeoutNanos =
            WindowManagerService.DEFAULT_INPUT_DISPATCHING_TIMEOUT_NANOS;

    mDragWindowHandle = new InputWindowHandle(mDragApplicationHandle, null, null,
            mDisplay.getDisplayId());
    mDragWindowHandle.name = TAG;
    mDragWindowHandle.inputChannel = mServerChannel;
    mDragWindowHandle.layer = mService.getDragLayerLocked();
    // Initialization of mDragWindowHandle
    ...

    // The drag window cannot receive new touches.
    mDragWindowHandle.touchableRegion.setEmpty();

    // The drag window covers the entire display
    mDragWindowHandle.frameLeft = 0;
    mDragWindowHandle.frameTop = 0;
    final Point p = new Point();
    mDisplay.getRealSize(p);
    mDragWindowHandle.frameRight = p.x;
    mDragWindowHandle.frameBottom = p.y;

    // Pause rotations before a drag.
    mService.pauseRotationLocked();

    mSideMargin = dipToPixel(SIDE_MARGIN_DIP, mDisplayMetrics);
    mMinVisibleWidth = dipToPixel(MINIMUM_VISIBLE_WIDTH_IN_DP, mDisplayMetrics);
    mMinVisibleHeight = dipToPixel(MINIMUM_VISIBLE_HEIGHT_IN_DP, mDisplayMetrics);
    mDisplay.getRealSize(mMaxVisibleSize);

    mDragEnded = false;
}
```

The `register` method of `TaskPositioner` will create itself `InputChannel` to receive the input event from `InputDispatcher`, and the `mServerChannel` is the sever part of `InputChannel` pair, which we saw before. And then it creates a `WindowPositionEventReceiver(inherited from InputEventReceiver)` instance, to receive input event.

And then, it creates an `InputWindowHandle` instance called `mDragWindowHandle` as the input receiver handle.
It will set the size of `mDragWindowHandle` to display size, and the type to `TYPE_DRAG`. Also it will set the `touchableRegion` of `mDragWindowHandle` to empty to reject touch event. In other word, after transferring focus target to `TaskPositioner`, the `TaskPositioner` will create a full screen drag layer to receive and process the coming input event to resize window, until the resizing finished.

In `InputMonitor.updateInputWindowLw(boolean)`, we can see the following code to add `TaskPositioner` drag window handle to input window list:

```java
final boolean inPositioning = mService.mTaskPositioningController.isPositioningLocked();
if (inPositioning) {
    final InputWindowHandle dragWindowHandle =
            mService.mTaskPositioningController.getDragWindowHandleLocked();
    if (dragWindowHandle != null) {
        addInputWindowHandle(dragWindowHandle);
    } else {
        Slog.e(TAG_WM,
                "Repositioning is in progress but there is no drag window handle.");
    }
}
```
After initializing, `TaskPositioningController` will invoke the `TaskPositioner.startDrag` to start drag.

```java
void startDrag(WindowState win, boolean resize, boolean preserveOrientation, float startX,
                   float startY) {
    mTask = win.getTask();
    // Use the dim bounds, not the original task bounds. The cursor
    // movement should be calculated relative to the visible bounds.
    // Also, use the dim bounds of the task which accounts for
    // multiple app windows. Don't use any bounds from win itself as it
    // may not be the same size as the task.
    mTask.getDimBounds(mTmpRect);
    startDrag(resize, preserveOrientation, startX, startY, mTmpRect);
}

@VisibleForTesting
void startDrag(boolean resize, boolean preserveOrientation,
                float startX, float startY, Rect startBounds) {
    // Initialization
    ...

    if (resize) {
        if (startX < startBounds.left) {
            mCtrlType |= CTRL_LEFT;
        }
        if (startX > startBounds.right) {
            mCtrlType |= CTRL_RIGHT;
        }
        if (startY < startBounds.top) {
            mCtrlType |= CTRL_TOP;
        }
        if (startY > startBounds.bottom) {
            mCtrlType |= CTRL_BOTTOM;
        }
        mResizing = mCtrlType != CTRL_NONE;
    }

    // In case of !isDockedInEffect we are using the union of all task bounds. These might be
    // made up out of multiple windows which are only partially overlapping. When that happens,
    // the orientation from the window of interest to the entire stack might diverge. However
    // for now we treat them as the same.
    mStartOrientationWasLandscape = startBounds.width() >= startBounds.height();
    mWindowOriginalBounds.set(startBounds);

    // Notify the app that resizing has started, even though we haven't received any new
    // bounds yet. This will guarantee that the app starts the backdrop renderer before
    // configuration changes which could cause an activity restart.
    if (mResizing) {
        synchronized (mService.mWindowMap) {
            notifyMoveLocked(startX, startY);
        }

        // Perform the resize on the WMS handler thread when we don't have the WMS lock held
        // to ensure that we don't deadlock WMS and AMS. Note that WindowPositionerEventReceiver
        // callbacks are delivered on the same handler so this initial resize is always
        // guaranteed to happen before subsequent drag resizes.
        mService.mH.post(() -> {
            try {
                mService.mActivityManager.resizeTask(
                        mTask.mTaskId, startBounds, RESIZE_MODE_USER_FORCED);
            } catch (RemoteException e) {
            }
        });
    }

    // Make sure we always have valid drag bounds even if the drag ends before any move events
    // have been handled.
    mWindowDragBounds.set(startBounds);
}
```

The `TaskPositioner` will use the current dim bounds of task as the initial bounds, and compare the initial input point with initial bounds to determine the resize direction. And then it will invoke `notifyMoveLocked` to calculate the new window bounds, and notify the task the drag resizing state. Lastly, it will invoke `AMS.resizeTask` to resize the task
finally.

The `resizeDrag` is a pure calculating method, and it will calculate the distance between current input point and start drag point, and use it to calculate the new window bounds. `Task.setDragResizing` will persist the current drag resizing state, and it will be used by `WindowState` to determine whether it needs to notify the `ViewRootImpl` to relayout.

`AMS.resizeTask` notifies the `TaskRecord` to change its size, and use its `WindowContainerController` to notify the window container in WMS space, which will notify the layer in `SurfaceFlinger`.

If `TaskPositioner` receives the `ACTION_UP` or `ACTION_CANCEL` event, it will invoke `AMS.resizeTask` to notify `TaskRecord` the last time, and invoke `TaskPositioningController.finishTaskPositioning` to finish drag resizing. Also it will notify the `Task` the drag resizing finished.

The `finishTaskPositioning` in `TaskPositioningController` is just to unregister `TaskPositioner` from system, and remove it from InputWindow list.

## ViewRootImpl

From the `AMS.resizeTask`, there is an invoking sequence to dispatch resizing event to `WindowState`: 

`AMS.resizeTask` -> `TaskRecord.resize` -> `TaskWindowContainerController.resize` -> `DisplayContent.layoutAndAssignWindowLayersIfNeeded` -> `WindowSurfacePlacer.performSurfacePlacement` -> `WindowSurfacePlacer.performSurfacePlacementLoop`-> `RootWindowContainer.performSurfacePlacement` -> `RootWindowContainer.handleResizingWIndows` -> `WindowState.reportResized` -> `WindowState.dispatchResized`.

```java
private void dispatchResized(Rect frame, Rect overscanInsets, Rect contentInsets,
        Rect visibleInsets, Rect stableInsets, Rect outsets, boolean reportDraw,
        MergedConfiguration mergedConfiguration, boolean reportOrientation, int displayId,
        DisplayCutout displayCutout)
        throws RemoteException {
    final boolean forceRelayout = isDragResizeChanged() || reportOrientation;

    mClient.resized(frame, overscanInsets, contentInsets, visibleInsets, stableInsets, outsets,
            reportDraw, mergedConfiguration, getBackdropFrame(frame), forceRelayout,
            mPolicy.isNavBarForcedShownLw(this), displayId,
            new DisplayCutout.ParcelableWrapper(displayCutout));
    mDragResizingChangeReported = true;
}
```

The `mClient` is `W` in `ViewRootImpl`, and it is passed to `WMS` by `Session.addToDisplay` in `ViewRootImpl.addView`.

In `WindowState.dispatchResized`, it will invok `mClinet.resized` method to notify the resize event, actually `W.resized` method. `W.resized` will invoke `ViewRootImpl.dispatchResized` method dispatch resized event continually.

```java
private void dispatchResized(Rect frame, Rect overscanInsets, Rect contentInsets,
        Rect visibleInsets, Rect stableInsets, Rect outsets, boolean reportDraw,
        MergedConfiguration mergedConfiguration, Rect backDropFrame, boolean forceLayout,
        boolean alwaysConsumeNavBar, int displayId,
        DisplayCutout.ParcelableWrapper displayCutout) {

    // Tell all listeners that we are resizing the window so that the chrome can get
    // updated as fast as possible on a separate thread,
    if (mDragResizing && mUseMTRenderer) {
        boolean fullscreen = frame.equals(backDropFrame);
        synchronized (mWindowCallbacks) {
            for (int i = mWindowCallbacks.size() - 1; i >= 0; i--) {
                mWindowCallbacks.get(i).onWindowSizeIsChanging(backDropFrame, fullscreen,
                        visibleInsets, stableInsets);
            }
        }
    }

    Message msg = mHandler.obtainMessage(reportDraw ? MSG_RESIZED_REPORT : MSG_RESIZED);
    if (mTranslator != null) {
        mTranslator.translateRectInScreenToAppWindow(frame);
        mTranslator.translateRectInScreenToAppWindow(overscanInsets);
        mTranslator.translateRectInScreenToAppWindow(contentInsets);
        mTranslator.translateRectInScreenToAppWindow(visibleInsets);
    }

    // Inflate message content
    ........
    mHandler.sendMessage(msg);
}
```

`ViewRootImpl.dispatchResized` does two important things, the first is to notify the callback the window size changed event when using multi-thread renderer, and the second is to use `Handler` to notify to itself relayout the layout (will invoke `reportNextDraw()`, `forceLayout(mView)`, `requestLayout()`).

The second part will invoke `ViewRootImpl.performTraversals` finally. It's not our focus part, because it is a common process. We will focus on the first part, the callback's `onWindowSizeIsChanging` method. And there is only one important `WindowCallbacks` we should focus, the `DecorView`.

## DecorView

The `DecorView`'s `onAttachedToWindow` will add it as `WindowCallbacks` to `ViewRootImpl`.

In `DecorView`'s `onWindowSizeIsChanging` callback, it will invoke `BackdropFrameRenderer.setTargetRect` to set the
resize target information.

```java
private BackdropFrameRenderer mBackdropFrameRenderer = null;

@Override
public void onWindowSizeIsChanging(Rect newBounds, boolean fullscreen, Rect systemInsets,
        Rect stableInsets) {
    if (mBackdropFrameRenderer != null) {
        mBackdropFrameRenderer.setTargetRect(newBounds, fullscreen, systemInsets, stableInsets);
    }
}
```

In `ViewRootImpl.performTraversal`, it will invoke its `startDragResizing`, and `startDragResizing` will invoke `DecorView.onWindowDragResizeStart`, when starting to drag resizing.

```java
@Override
public void onWindowDragResizeStart(Rect initialBounds, boolean fullscreen, Rect systemInsets,
        Rect stableInsets, int resizeMode) {
    if (mWindow.isDestroyed()) {
        // If the owner's window is gone, we should not be able to come here anymore.
        releaseThreadedRenderer();
        return;
    }
    if (mBackdropFrameRenderer != null) {
        return;
    }
    final ThreadedRenderer renderer = getThreadedRenderer();
    if (renderer != null) {
        loadBackgroundDrawablesIfNeeded();
        mBackdropFrameRenderer = new BackdropFrameRenderer(.....);

        updateElevation();

        updateColorViews(null /* insets */, false);
    }
    mResizeMode = resizeMode;
    getViewRootImpl().requestInvalidateRootRenderNode();
}
```

`onWindowDragResizeStart` will initialize `BackDropFrameRenderer`. So what is `BackDropFrameRenderer`?

## BackDropFrameRenderer

In short word, when window is resizing, we should add a background under its window to fill the part the showing window doesn't cover to gain a acceptable visual effects.

```java
public class BackdropFrameRenderer extends Thread implements Choreographer.FrameCallback {

    public BackdropFrameRenderer(DecorView decorView, ThreadedRenderer renderer, Rect initialBounds,
            Drawable resizingBackgroundDrawable, Drawable captionBackgroundDrawable,
            Drawable userCaptionBackgroundDrawable, int statusBarColor, int navigationBarColor,
            boolean fullscreen, Rect systemInsets, Rect stableInsets, int resizeMode) {
        setName("ResizeFrame");

        mRenderer = renderer;
        onResourcesLoaded(decorView, resizingBackgroundDrawable, captionBackgroundDrawable,
                userCaptionBackgroundDrawable, statusBarColor, navigationBarColor);

        // Create a render node for the content and frame backdrop
        // which can be resized independently from the content.
        mFrameAndBackdropNode = RenderNode.create("FrameAndBackdropNode", null);

        mRenderer.addRenderNode(mFrameAndBackdropNode, true);

        // Set the initial bounds and draw once so that we do not get a broken frame.
        mTargetRect.set(initialBounds);
        mFullscreen = fullscreen;
        mOldFullscreen = fullscreen;
        mSystemInsets.set(systemInsets);
        mStableInsets.set(stableInsets);
        mOldSystemInsets.set(systemInsets);
        mOldStableInsets.set(stableInsets);
        mResizeMode = resizeMode;

        // Kick off our draw thread.
        start();
    }
    // Other code
}
```

The `BackdropFrameRenderer` is just a `Thread`, keeps the `ThreadedRenderer` instance of window, and creates its `RenderNode` called `FrameAndBackdropNode`. When window says it wants to use hardware accelerated by `WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED`, the ViewRootImpl will create a `ThreadedRenderer` instance to it, and use it to render window content by `skia` based on `OpenGL` or directly `OpenGL` to utilize hardware to speed up the rendering. And `ThreadedRenderer` uses `RenderNode` inner too. So `BackdropFrameRenderer`'s `mFrameAndBackdropNode` will use `skia` based on `OpenGL` or directly `OpenGL` to draw content too to utilize hardware.

From above code, we know `DecorView` will invoke `BackdropFrameRenderer.setTargetRect` to update the target resizing window information, including window bounds, when window drag resizing. The `BackdropFrameRenderer.setTargetRect` will trigger its `redrawLocked` method to update the bounds of `mFrameAndBackdropNode`. And when `ViewRootImpl` starts to draw the content, it will invoke `DecorView.onContentDrawn` to update its size, and will trigger `mBackdropFrameRenderer.onContentDrawn` to update the `mRenderer`'s bounds, if `mBackdropFrameRenderer` is not null, in other word, the window is resizing. Its two route to update the `mBackdropFrameNode` and `mRenderer` bounds.

From the above constructor, we can see one line code:

```java
mRenderer.addRenderNode(mFrameAndBackdropNode, true);// The true represents add the render node as the first node.
```

It will add `mFrameAndBackdropNode` to the first node of `mRenderer`. In the native level, they will think the first node of `ThreadedRenderer` as the back drop render node. And use it to restrict the final drawn location of window content.

In `AOSP` 9.0, there is a file called `FrameBuilder.cpp` does that thing for emulator, when emulator uses the `OpenGL` directly:

```c++
void FrameBuilder::deferRenderNodeScene(const std::vector<sp<RenderNode> >& nodes,
                                        const Rect& contentDrawBounds) {
    if (nodes.size() < 1) return;
    if (nodes.size() == 1) {
        if (!nodes[0]->nothingToDraw()) {
            deferRenderNode(*nodes[0]);
        }
        return;
    }
    // It there are multiple render nodes, they are laid out as follows:
    // #0 - backdrop (content + caption)
    // #1 - content (local bounds are at (0,0), will be translated and clipped to backdrop)
    // #2 - additional overlay nodes
    // Usually the backdrop cannot be seen since it will be entirely covered by the content. While
    // resizing however it might become partially visible. The following render loop will crop the
    // backdrop against the content and draw the remaining part of it. It will then draw the content
    // cropped to the backdrop (since that indicates a shrinking of the window).
    //
    // Additional nodes will be drawn on top with no particular clipping semantics.

    // Usually the contents bounds should be mContentDrawBounds - however - we will
    // move it towards the fixed edge to give it a more stable appearance (for the moment).
    // If there is no content bounds we ignore the layering as stated above and start with 2.

    // Backdrop bounds in render target space
    const Rect backdrop = nodeBounds(*nodes[0]);

    // Bounds that content will fill in render target space (note content node bounds may be bigger)
    Rect content(contentDrawBounds.getWidth(), contentDrawBounds.getHeight());
    content.translate(backdrop.left, backdrop.top);
    if (!content.contains(backdrop) && !nodes[0]->nothingToDraw()) {
        // Content doesn't entirely overlap backdrop, so fill around content (right/bottom)

        // Note: in the future, if content doesn't snap to backdrop's left/top, this may need to
        // also fill left/top. Currently, both 2up and freeform position content at the top/left of
        // the backdrop, so this isn't necessary.
        if (content.right < backdrop.right) {
            // draw backdrop to right side of content
            deferRenderNode(0, 0,
                            Rect(content.right, backdrop.top, backdrop.right, backdrop.bottom),
                            *nodes[0]);
        }
        if (content.bottom < backdrop.bottom) {
            // draw backdrop to bottom of content
            // Note: bottom fill uses content left/right, to avoid overdrawing left/right fill
            deferRenderNode(0, 0,
                            Rect(content.left, content.bottom, content.right, backdrop.bottom),
                            *nodes[0]);
        }
    }

    if (!nodes[1]->nothingToDraw()) {
        if (!backdrop.isEmpty()) {
            // content node translation to catch up with backdrop
            float dx = contentDrawBounds.left - backdrop.left;
            float dy = contentDrawBounds.top - backdrop.top;

            Rect contentLocalClip = backdrop;
            contentLocalClip.translate(dx, dy);
            deferRenderNode(-dx, -dy, contentLocalClip, *nodes[1]);
        } else {
            deferRenderNode(*nodes[1]);
        }
    }

    // remaining overlay nodes, simply defer
    for (size_t index = 2; index < nodes.size(); index++) {
        if (!nodes[index]->nothingToDraw()) {
            deferRenderNode(*nodes[index]);
        }
    }
}
```

In `AOSP` 9.0, when we drag to resize the window, the window will jump to the right bottom location when starting drag resizing, and restore to the correct location after dragging resizing. The reason is the `mBackdropFrameNode`'s bounds and `mRenderer`'s bounds use different coordinate system for passed value.

## Summary

When resizing, the input flinger will use touchable region to find the window to receive the input event. In `WindowState`, if the window is freeform, it will add shadow size to its touchable region. So when drag the shadow of freeform window to resize the window, the window will be selected as input target for starting dragging. The WMS will analyze the input event firstly to check whether the user is trying to resize the window, and if yes, it will create a new fullscreen input target to receive the coming input events and transfer current input focus to new input target. The new input target will calculate the commit input events location with origin location to calculate the new window size, and notify the `WMS` and `AMS` to update it. For better resizing effects, the `DecorView` creates `BackdropFrameRenderer` to draw the dim layer under window. After resizing, the `WMS` will destroy the new input target.

In `AOSP` 9.0, the `WMS` sets the new input target to input flinger directly, but in `master`, the setting is done by `SurfaceFlinger`. The `WMS` will create a new surface for new input target, and set the input target to the new surface. And then notifying the `SurfaceFlinger` to add the new input target to input flinger.