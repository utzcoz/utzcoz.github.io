---
layout: post
title:  "Analyze AOSP input architecture"
date:   2020-05-06 20:05 +0800
---

> This article based on `AOSP` 9.0.

This article is based on [Jonathan Levin](http://newandroidbook.com/)'s [presentation about `Android` input architecture](http://newandroidbook.com/files/AndroidInput.pdf). It's an excellent presentation for `Android` input architecture.

The following diagrams are copied from presentation:

![The Android input architecture from device to application](/images/android-input-architecture-p1.png)
![The Android input architecture from application to View](/images/android-input-architecture-p2.png)

The first diagram shows the `Android` input architecture from device to application, and the second diagram shows the `Android` input architecture from application to view. The following parts will present the architecture based on above two diagrams, and then append some important contents but doesn't show on them.

## Jonathan Levin's presentation

### Device driver

When the input device generates an input event, the device will use interrupt to notify the `CPU`, and the `CPU` will response to interrupts to notify device driver. The kernel will write data to device file `/dev/input/eventXX`.

### Input flinger

The `EventHub` in input flinger uses the `epoll_wait` to wait input events from `/dev/input/eventXX` in its method `getEvents`.

```c++
static const char *DEVICE_PATH = "/dev/input";

EventHub::EventHub

int result = inotify_add_watch(mINotifyFd, DEVICE_PATH, IN_DELETE | IN_CREATE);

EventHub::getEvents

int pollResult = epoll_wait(mEpollFd, mPendingEventItems, EPOLL_MAX_EVENTS, timeoutMillis);
```

The `InputReader` in input flinger uses a thread called `InputReaderThread` to call `EventHub::getEvents` to get raw input events, and then use its method `InputReader::processEventsLocked` to transfer(also called `cook` in code) raw input events to typed input events, such as `KeyEvent`, `MotionEvent`. It also process the device added/removed events. After processing, the `InputReader` will call `InputDispatcher` in input flinger to dispatch typed input events.

The `InputDispatcher` uses a thread called `InputDistacherThread` to loop to wait input events, and dispatch them. The `InputDispatcher` is in native part in `system_server` process, and the receiver is in the app process. They are in different processes, so they need an `IPC` mechanism to communicate. The input flinger selects the `socketpair`. Why `socketpair` not `binder`? The input event only dequeued after app or system responses to it(input flinger uses a queue to store input event), and it is very useful to check `ANR` with non-response timeout. And we can only get `binder` caller `pid` from `binder`, but one `pid` can create multiple `socketpair`s. If one process creates multi windows, they can use different `socketpair` to identify different windows. But if we use `binder`, we must use one parameter to do it.

The `socketpair` is wrapped by `InputChannel`(defined in `InputTransport.h`) in native, and there is a java class called `InputChannel` too, which is wrapper for `InputChannel` in native. When `WindowManagerService` creates a window, it will create an `InputChannel` instance to bind new window to input flinger.

`WindowManagerService.addWindow->WindowState.openInputChannel`.

The `InputDispatcher::startDispatchCycleLocked` will call `InputPublisher::publishMotionEvent` or `InputPublisher::publishKeyEvent` to use `InputChannel` to publish input event to java part.

```c++
InputDispatcher::startDispatchCycleLocked

// Publish the key event.
status = connection->inputPublisher.publishKeyEvent(dispatchEntry->seq,
                    keyEntry->deviceId, keyEntry->source,
                    dispatchEntry->resolvedAction, dispatchEntry->resolvedFlags,
                    keyEntry->keyCode, keyEntry->scanCode,
                    keyEntry->metaState, keyEntry->repeatCount, keyEntry->downTime,
                    keyEntry->eventTime);

// Publish the motion event.
status = connection->inputPublisher.publishMotionEvent(dispatchEntry->seq,
                    motionEntry->deviceId, motionEntry->source, motionEntry->displayId,
                    dispatchEntry->resolvedAction, motionEntry->actionButton,
                    dispatchEntry->resolvedFlags, motionEntry->edgeFlags,
                    motionEntry->metaState, motionEntry->buttonState,
                    xOffset, yOffset, motionEntry->xPrecision, motionEntry->yPrecision,
                    motionEntry->downTime, motionEntry->eventTime,
                    motionEntry->pointerCount, motionEntry->pointerProperties,
                    usingCoords);


InputPublisher::publishMotionEvent

return mChannel->sendMessage(&msg);
```

The `InputChannel::sendMessage` just uses `::send` to send data to receiver socket. The receiver is `ViewRootImpl.WindowInputEventReceiver`.
When `WindowManagerService` uses `WindowState.openInputChannel` to create `InputChannel` with `socketpair`, it will transfer the opened `socketpair` to `WindowState.openInputChannel` input field `outInputChannel`. The `outInputChannel` is passed by `ViewRootImpl` with calling sequences:

`ViewRootImpl.setView`
->`Session.addToDisplay`
->`WindowManagerService.addWindow`
->`WindowState.openInputChannel`.

After calling `Session.addToDisplay`, it will opened `InputChannel` to create `ViewRootImpl.WindowInputEventReceiver`, that is an implementation of `InputEventReceiver`. Its initialization method will use `JNI` to create `NativeInputEventReceiver` in `android_view_InputEventReceiver.cpp` to consume the data from `socketpair`. The `NativeInputEventReceiver::consumeEvents` will call `InputEventReceiver.dispatchInputEvent` to dispatch input event to java part, and it will call `onInputEvent` to process input event. The `WindowInputEventReceiver.onInputEvent` will dispatch input event to application. Before we analyze the following dispatching, we will analyze the `FINISHED` callback.

If the java part consumes the input event, and it will set the input event to be `FINISHED`. `WindowState.openInputChannel` registers receiver fd with `InputWindowHandle` to `InputDispatcher`. The `InputDispatcher` use looper to listen the receiver fd, and read data from socket after receiving notifying to send to java part.

`WindowState.openInputChannel`
->`InputManagerService.registerInputChannel`
->`android_view_server_input_InputManagerService::nativeRegisterInputChannel`
->`NativeInputChannel::registerInputChannel`
->`InputDispatcher::registerInputChannel`.

```c++
InputDispatcher::registerInputChannel

sp<Connection> connection = new Connection(inputChannel, inputWindowHandle, monitor);

int fd = inputChannel->getFd();
mConnectionsByFd.add(fd, connection);

mLooper->addFd(fd, 0, ALOOPER_EVENT_INPUT, handleReceiveCallback, this);
```

The `ViewRootImpl` will call `WindowInputEventReceiver.finishInputEvent` to notify the input flinger the input event is `FINISHED`. It will use `InputChannel` to send data based on `socketpair`. The `InputDispatcher` will receive the notify by looper, and use its `handleReceiveCallback` to process `FINISHED`. The `InputDispatcher` will finish the current dispatching cycle with the following calling sequences:

`InputDispatcher::handleReceiveCallback`
->`InputDispatcher::finishDispatchCycleLocked`
->`InputDispatcher::onDispatchCycleFinishedLocked`
->`InputDispatcher::doDispatchCycleFinishedLockedInterruptible`

And `InputDispatcher::doDispatchCycleFinishedLockedInterruptible` will dequeue the event, and start the next cycle.

```c++
InputDispatcher::doDispatchCycleFinishedLockedInterruptible

// Dequeue the event and start the next cycle.
// Note that because the lock might have been released, it is possible that the
// contents of the wait queue to have been drained, so we need to double-check
// a few things.
if (dispatchEntry == connection->findWaitQueueEntry(seq)) {
    connection->waitQueue.dequeue(dispatchEntry);
    traceWaitQueueLengthLocked(connection);
    if (restartEvent && connection->status == Connection::STATUS_NORMAL) {
                connection->outboundQueue.enqueueAtHead(dispatchEntry);
                traceOutboundQueueLengthLocked(connection);
    } else {
        releaseDispatchEntryLocked(dispatchEntry);
    }
}
```

If `InputDispatcher` doesn't receive `FINISHED` event and dequeue event, `InputDispatcher:checkWindowReadyForMoreInputLocked` will says the target is not ready for more input locked.

```c++
InputDispatcher:checkWindowReadyForMoreInputLocked

if (!connection->waitQueue.isEmpty()
        && currentTime >= connection->waitQueue.head->deliveryTime
                + STREAM_AHEAD_EVENT_TIMEOUT) {
    return StringPrintf("Waiting to send non-key event because the %s window has not "
            "finished processing certain input events that were delivered to it over "
            "%0.1fms ago.  Wait queue length: %d.  Wait queue head age: %0.1fms.",
            targetType, STREAM_AHEAD_EVENT_TIMEOUT * 0.000001f,
            connection->waitQueue.count(),
            (currentTime - connection->waitQueue.head->deliveryTime) * 0.000001f);
}
```

If the wait time is larger than `InputDispatcher::mInputTargetWaitTimeoutTime`, it will trigger `ANR`. The `mInputTargetWaitTimeoutTime` will use the timeout from `InputWindowHandle.dispatchingTimeoutNanos` of java part, the default value is 5s, defined in `WindowManagerService.DEFAULT_INPUT_DISPATCHING_TIMEOUT_NANOS`.

### ViewRootImpl

`ViewRootImpl` uses a stage pipeline to dispatch input event.

a. `ViewPreImeInputStage`: Basic processing, (almost) always forwards.
b. `ImeInputStage`: Dispatches to InputMethodManager.
c. `EearlyPostImeInputStage`: Process key/pointer events, forwards others.
d. `ViewPostImeInputStage`: Process all events, suspends window updating during processing for non-key events.
e. `SyntheticInputStage`: Synthesizes new events from unhandled input events.

### InputDispatcherPolicyInterface and InputReaderPolicyInterface

The `InputReader` and `InputDispatcher` will use `InputReaderPolicyInterface` and `InputDispatcherPolicyInterface` to get policy config from java part to process the data, for example, whether intercepting input event by `PhoneWindowManager` before dispatching to application.

The `NativeInputManager` in `com_android_server_input_InputManagerService.cpp` is the implementation of `InputDispatcherPolicyInterface` and `InputReaderPolicyInterface`. And it will response policy command directly based on the value returned by `InputManagerService` in java part. The `NativeInputManager` is also the implementation of `PointerControllerPolicyInterface` for pointer layer.

The WindowManagerFuncs has moved to WindowManagerPolicy.

The entry of policy in java part is in `InputManagerService`. Let's look at methods used for policy:

| policy methods|
| ------------- |
| `filterInputEvent` |
| `interceptKeyBeforeQueueing` |
| `interceptMotionBeforeQueueingNonInteractive` |
| `interceptKeyBeforeDispatching` |
| `checkInjectEventsPermission` |
| `getVirtualKeyQuietTimeMillis` |
| `getExcludeedDeviceNames` (read file from `system/etc/excluded-input-devices.xml`) |
| `getKeyRepeatTimeout` |
| `getKeyRepeatDelay` |
| `getHoverTapTimeout` |
| `getHoverTapSlop` |
| `getDoubleTapTimeout` |
| `getLongPressTimeout` |
| `getPointerLayer` (the layer id for pointer, in another word, the Android assign a single layer for pointer) |
| `getPointerIcon` |
| `getKeyboardLayerOverlay` (get the keyboard layer for input device, that can set by input method) |
| `getDeviceAlias` |

## Appended content

### Intercepting before dispatching

Actually, for key event, `InputDispatcher` will request `PhoneWindowManager` whether intercepting key before dispatching. If it says yes, by returns  -1 from its `interceptKeyBeforeDispatching`, the `InputDispatcher` will drop this key event. The `PhoneWindowManager.interceptKeyBeforeDispatching` is an entry to consume some system level key, for example, `ALT + TAB` for showing recents.

```c++
InputDispatcher::dispatchKeyLocked

if (entry->interceptKeyResult == KeyEntry::INTERCEPT_KEY_RESULT_UNKNOWN) {
    if (entry->policyFlags & POLICY_FLAG_PASS_TO_USER) {
        CommandEntry* commandEntry = postCommandLocked(
                & InputDispatcher::doInterceptKeyBeforeDispatchingLockedInterruptible);
        if (mFocusedWindowHandle != NULL) {
            commandEntry->inputWindowHandle = mFocusedWindowHandle;
        }
        commandEntry->keyEntry = entry;
        entry->refCount += 1;
        return false; // wait for the command to run
    } else {
        entry->interceptKeyResult = KeyEntry::INTERCEPT_KEY_RESULT_CONTINUE;
    }
} else if (entry->interceptKeyResult == KeyEntry::INTERCEPT_KEY_RESULT_SKIP) {
    if (*dropReason == DROP_REASON_NOT_DROPPED) {
        *dropReason = DROP_REASON_POLICY;
    }
}

InputDispatcher::doInterceptKeyBeforeDispatchingLockedInterruptible

nsecs_t delay = mPolicy->interceptKeyBeforeDispatching(commandEntry->inputWindowHandle,
        &event, entry->policyFlags);
```

```java
PhoneWindowManager.interceptKeyBeforeDispatching

// Display task switcher for ALT-TAB.
if (down && repeatCount == 0 && keyCode == KeyEvent.KEYCODE_TAB) {
    if (mRecentAppsHeldModifiers == 0 && !keyguardOn && isUserSetupComplete()) {
        final int shiftlessModifiers = event.getModifiers() & ~KeyEvent.META_SHIFT_MASK;
        if (KeyEvent.metaStateHasModifiers(shiftlessModifiers, KeyEvent.META_ALT_ON)) {
            mRecentAppsHeldModifiers = shiftlessModifiers;
            showRecentApps(true);
            return -1;
        }
    }
}
```

The `PhoneWindowManager` can only process some fixed number system level keys, but if you want to add your custom system level shortcut, you should use `IShorcutService`.

In the last of `PhoneWindowManager.interceptKeyBeforeDispatching`, it will try to get the IShortcutService for current key:

```java
PhoneWindowManager.interceptKeyBeforeDispatching

if (down) {
    long shortcutCode = keyCode;
    // Code to add meta info
    IShortcutService shortcutService = mShortcutKeyServices.get(shortcutCode);
    if (shortcutService != null) {
        try {
            if (isUserSetupComplete()) {
                shortcutService.notifyShortcutKeyPressed(shortcutCode);
            }
        } catch (RemoteException e) {
            mShortcutKeyServices.delete(shortcutCode);
        }
        return -1;
    }
}
```

If there is an `IShortcutService` for current key, it will intercept it and notify the `IShortcutService` to process it.

There is only one register for shortcut, it is `ShortcutKeyDispatcher`. It calls `WindowManagerService.registerShortcutService` to register itself as shortcut service for `SC_DOCK_LEFT(Win + [)` and `SC_LOCK_RIGHT(Win + ])` for dock. This is a concise method to add system level shortcuts for ROM developer.

### Pointer Layer

#### SpriteController

`SpriteController` is the base of pointer layer, and it use surfaceflinger API to obtain native Surface, and draw pointer icon on it.

```c++
sp<SurfaceControl> SpriteController::obtainSurface(int32_t width, int32_t height) {
    ensureSurfaceComposerClient();

    sp<SurfaceControl> surfaceControl = mSurfaceComposerClient->createSurface(
            String8("Sprite"), width, height, PIXEL_FORMAT_RGBA_8888,
            ISurfaceComposerClient::eHidden |
            ISurfaceComposerClient::eCursorWindow);
    if (surfaceControl == NULL || !surfaceControl->isValid()) {
        ALOGE("Error creating sprite surface.");
        return NULL;
    }
    return surfaceControl;
}
```

The layer use the type `eCursorWindow`. And the surface has its layer:

```c++
void SpriteController::SpriteImpl::setLayer(int32_t layer) {
    AutoMutex _l(mController->mLock);
    if (mLocked.state.layer != layer) {
        mLocked.state.layer = layer;
        invalidateLocked(DIRTY_LAYER);
    }
}
```

We will discuss how to get layer number later. The `SpriteController` will not update content automatically, the client should update its properties as needed to update content or animate it. The updating of `SpriteController` is asynchronously.

#### PointerController

`PointerController` is the wrapper of `SpriteController` to let it show pointer icon, including mouse icon and spot icon. `PointerController` is the implementation of `PointerControllerInterface`. And the `PointerControllerInterface` defines some types for PointerController:

a. Transition: `TRANSITION_IMMEDIATE` and `TRANSITION_GRADUAL` to control the fade/unfade style.
b. Presentation: `PRESENTATION_POINTER` and `PRESENTATION_SPOT` to control the showing icon type.

Also, the `PointerController` is a receiver of display event to receive the vsync event to update its pointer content.

```c++
PointerController::PointerController

if (mDisplayEventReceiver.initCheck() == NO_ERROR) {
    mLooper->addFd(mDisplayEventReceiver.getFd(), Looper::POLL_CALLBACK,
                    Looper::EVENT_INPUT, mCallback, nullptr);
} else {
    ALOGE("Failed to initialize DisplayEventReceiver.");
}
```

The pointer layer and pointer icon is got from `PointerControllerPolicyInterface`, we will discuss later, and we will discuss who and when to use `PointerController`.

#### InputReader

In `InputReader`, there are two locations to create `PointerController`: `TouchInputMapper::configureSurface`(invoked by `TouchInputMapper::configure`) and `CursorInputMapper::configure`.

In `InputReader::addDeviceLocked`, when an input device is added to system, the `InputReader` will create an `InputDevice` instance for it, and then invoke its `configure` method to configure device. The `InputReader::createDeviceLocked` will create different mapper for device based on the device type:

```c++
InputReader::createDeviceLocked

// Cursor-like devices.
if (classes & INPUT_DEVICE_CLASS_CURSOR) {
    device->addMapper(new CursorInputMapper(device));
}

// Touchscreens and touchpad devices.
if (classes & INPUT_DEVICE_CLASS_TOUCH_MT) {
    device->addMapper(new MultiTouchInputMapper(device));
} else if (classes & INPUT_DEVICE_CLASS_TOUCH) {
    device->addMapper(new SingleTouchInputMapper(device));
}
```

The `MultiTouchInputMapper` and `SingleTouchInputMapper` are the implementation of `TouchInputMapper`. So the `InputReader` will create `PointerController` when the cursor-like devices, touchscreens or touch pad devices added to system, and use it to show mouse icon for cursor-like devices or spot icon for touchable devices.

And the `InputReader` will move/resize/fade/unfade the point layer based on the `PointController` API. For example, for touchable devices, the `InputReader` will update pointer layer based on the gesture type:

```c++
TouchInputMapper::dispatchPointerGestures

case PointerGesture::TAP:
case PointerGesture::TAP_DRAG:
case PointerGesture::BUTTON_CLICK_OR_DRAG:
case PointerGesture::HOVER:
case PointerGesture::PRESS:
case PointerGesture::SWIPE:
    // Unfade the pointer when the current gesture manipulates the
    // area directly under the pointer.
    mPointerController->unfade(PointerControllerInterface::TRANSITION_IMMEDIATE);
    break;
case PointerGesture::FREEFORM:
    // Fade the pointer when the current gesture manipulates a different
    // area and there are spots to guide the user experience.
    if (mParameters.gestureMode == Parameters::GESTURE_MODE_MULTI_TOUCH) {
        mPointerController->fade(PointerControllerInterface::TRANSITION_GRADUAL);
    } else {
        mPointerController->unfade(PointerControllerInterface::TRANSITION_IMMEDIATE);
    }
    break;
```

#### PointerControllerPolicyInterface

The `PointerController` creation and properties changing are done by `PointerControllerPolicyInterface`. The `NativeInputManager` is the implementation of `PointerControllerPolicyInterface`. In `NativeInputManager::obtainPointerController`, it will create `PointerController` and assign pointer layer for `PointerController`.

```c++
NativeInputManager::obtainPointerController

ensureSpriteControllerLocked();
controller = new PointerController(this, mLooper, mLocked.spriteController);
mLocked.pointerController = controller;

DisplayViewport& v = mLocked.internalViewport;
controller->setDisplayViewport(
        v.logicalRight - v.logicalLeft,
        v.logicalBottom - v.logicalTop,
        v.orientation);

NativeInputManager::ensureSpriteControllerLocked

jint layer = env->CallIntMethod(mServiceObj, gServiceClassInfo.getPointerLayer);
if (checkAndClearExceptionFromCallback(env, "getPointerLayer")) {
    layer = -1;
}
mLocked.spriteController = new SpriteController(mLooper, layer);
```

The `NativeInputManager::ensureSpriteControllerLocked` will call `InputManagerService::getPointerLayer` to get the pointer layer number from java part.  The calculating formula is :

```java
InputMonitor

@Override
public int getPointerLayer() {
    return mService.mPolicy.getWindowLayerFromTypeLw(WindowManager.LayoutParams.TYPE_POINTER)
            * WindowManagerService.TYPE_LAYER_MULTIPLIER
            + WindowManagerService.TYPE_LAYER_OFFSET;
}
```

The `NativeInputManager::loadPointerResources` can be used to load pointer icon:

```c++
NativeInputManager::loadPointerResources

loadSystemIconAsSprite(env, mContextObj, POINTER_ICON_STYLE_SPOT_HOVER,
        &outResources->spotHover);

NativeInputManager::loadSystemIconAsSprite

loadSystemIconAsSpriteWithPointerIcon(env, contextObj, style, &pointerIcon, outSpriteIcon);

NativeInputManager::loadSystemIconAsSpriteWithPointerIcon

status_t status = android_view_PointerIcon_loadSystemIcon(env,
        contextObj, style, outPointerIcon);
```


The `android_view_PointerIcon_loadSystemIcon` is defined in `android_view_PointerIcon.cpp`, which is the `JNI` implementation of `PointerIcon` in java part.

There are many system defined icons for pointer, we can execute `find . -iname "pointer*.png"` in frameworks directory, we will see the whole png file set for pointer. The view also can set the custom pointer icon of mouse for itself. If we invoke `View.setPointerIcon`, it will trigger `ViewRootImpl.updatePointerIcon` to update the custom pointer icon to `PointerController` in native.

The `ViewRootImpl.updatePointerIcon` will call `WindowManagerService.updatePointerIcon`, and it will check the calling window is the window, whose touchable region is under the mouse pointer. 

The view also can set pointer icon in xml with `android:pointerIcon`.

### Focused window

If the input event is key event or non-touch event, such as trackball, the `InputDispatcher` will use `findFocusedWindowTargetsLocked` to find the focused window as the dispatching target. Before dispatching, it will check the dispatching permission for focused window.

The focused window is set by `NativeInputManager::setInputWindows`, called by `InputManagerService` in java part. When one window becomes focused, it will set itself as focused window to input flinger.

When we send key event to the input flinger, if the `PhoneWindowManager` intercepts it, the `PhoneWindowManager` consumes it; otherwise the focused window will consume it. If we want to use key to change the focused window, the `PhoneWindowManager` should consume key and do it. The `InputDispatcher` just needs to request whether to intercept, if not just dispatch it to focused window, and doesn't need to consider whether
the un-focused window should consume it.

### Touchable region

If the input event is touch event, `InputDispatcher` will find the window, whose touchable region contains the input location, as the dispatching target, and send outside event to other windows by  `InputDispatcher::findTouchedWindowTargetsLocked`. It will get touchable region from `InputWindowHandle.touchableRegion` in java part. The `InputWindowHandle.touchableRegion` will be updated by `WindowState.getTouchableRegion`.

### ViewRootImpl dispatching chain

We will use touch event as an example.

The following chain is the dispatching chain from `ViewRootImpl.ViewPostImeInputStage`:

`ViewRootImpl.ViewPostImeInputStage.onProcess -> ViewRootImpl.ViewPostImeInputStage.processPointerEvent-> DecorView.dispatchPointerEvent(actual View.dispatchPointerEvent) -> DecorView.dispatchTouchEvent
-> Activity.dispatchTouchEvent(type Window.Callback) -> DecorView.superDispatchTouchEvent`

If `DecorView`(is `ViewGroup`) consumes touch event, the dispatching will stop here, otherwise it will dispatch it with `Activity.onTouchEvent`.

The `DecorView.superDispatchTouchEvent` actually calls `ViewGroup.dispatchTouchEvent` to check whether the view tree will consume it.

So the magic is in the method `ViewGroup.dispatchTouchEvent`:

```java
ViewGroup.dispatchTouchEvent

if (onFilterTouchEventForSecurity(ev)) {
    // important code
}
```
The first thing `dispatchTouchEvent` does is to check whether we should dispatch this event based on the security policy. If yes, the if inner code will try to dispatch it.

```java
ViewGroup.dispatchTouchEvent

// Check for interception.
final boolean intercepted;
if (actionMasked == MotionEvent.ACTION_DOWN
    || mFirstTouchTarget != null) {
    final boolean disallowIntercept = (mGroupFlags & FLAG_DISALLOW_INTERCEPT) != 0;
    if (!disallowIntercept) {
        intercepted = onInterceptTouchEvent(ev);
        ev.setAction(action); // restore action in case it was changed
    } else {
        intercepted = false;
    }
} else {
    // There are no touch targets and this action is not an initial down
    // so this view group continues to intercept touches.
    intercepted = true;
}
```
Before dispatching, it checks whether to intercept event, by combining group flag and `ViewGroup.onInterceptTouchEvent`. If the `ViewGroup`
sets the `FLAG_DISALLOW_INTERCEPT`, the `ViewGroup` won't intercept event. We can use `ViewGroup.requestDisallowInterceptTouchEvent` to disallow touch event intercepting. Otherwise, it will call `onInterceptTouchEvent` to check whether to intercept touch event.

The disallow intercept is a very useful flag, especially when working with nested scrollable view. For example, if we add a horizontal scroll view to a vertical scroll view, and we want to swipe from left to right to scroll the horizontal scroll view, and swipe from top to bottom to vertical scroll view. The first method is intercept touch events from the horizontal view, and if it thinks the swiping is from left to right, it calls vertical scroll view to update its position. Otherwise, it will update its position. The second method is the horizontal scroll view uses the vertical scroll view's `requestDisallowInterceptTouchEvent` to disable the horizontal scroll view's intercepting, and it checks the swiping direction. If it thinks the swiping is from left to right, it will update itself position, otherwise it will call vertical scroll view's method to update its position.

Going back to `dispatchTouchEvent`, if the touch event is not intercepted by `ViewGroup`, it will loop its children views, and check whether they want to consume the touch event with the `z` order.  If there is a view consumes the touch event, the `ViewGroup` will call its `addTouchTarget` to add the view to `mFirstTarget` to keep it.

```java
ViewGroup.dispatchTouchEvent

if (dispatchTransformedTouchEvent(ev, false, child, idBitsToAssign)) {
    // Child wants to receive touch within its bounds.
    mLastTouchDownTime = ev.getDownTime();
    if (preorderedList != null) {
        // childIndex points into presorted list, find original index
        for (int j = 0; j < childrenCount; j++) {
            if (children[childIndex] == mChildren[j]) {
                mLastTouchDownIndex = j;
                break;
            }
        }
    } else {
        mLastTouchDownIndex = childIndex;
    }
    mLastTouchDownX = ev.getX();
    mLastTouchDownY = ev.getY();
    newTouchTarget = addTouchTarget(child, idBitsToAssign);
    alreadyDispatchedToNewTouchTarget = true;
    break;
}

ViewGroup.addTouchTarget

final TouchTarget target = TouchTarget.obtain(child, pointerIdBits);
target.next = mFirstTouchTarget;
mFirstTouchTarget = target;
return target;
```

From the code, we know the `TouchTarget` is a linked list, and the head is the real view to consume touch event, and its next is its parent.

So the `DecorView`'s `mFirstTarget` is the head of linked list, and it's the touch target of the view that consumes the touch event.

A normal complete touch with some sequences touch events, for example, `DOWN` and `UP`, or `DOWN` and `CANCEL`, or `DOWN`, `MOVE`, `MOVE`, ..., `UP`/`CANCEL`,

The above processing is executed when the `DOWN` event coming, and keeps the touch target that consumes the `DOWN` event. And after other later touch events coming, it will use the `mFirstTarget` to dispatch the touch event directly.

```java
TouchTarget target = mFirstTouchTarget;
while (target != null) {
    final TouchTarget next = target.next;
    if (alreadyDispatchedToNewTouchTarget && target == newTouchTarget) {
        // The DOWN event will come here.
        handled = true;
    } else {
        // Other events will come here.
        final boolean cancelChild = resetCancelNextUpFlag(target.child) 
                                        || intercepted;
        if (dispatchTransformedTouchEvent(ev, cancelChild,
                target.child, target.pointerIdBits)) {
            handled = true;
        }
        if (cancelChild) {
            if (predecessor == null) {
                mFirstTouchTarget = next;
            } else {
                predecessor.next = next;
            }
            target.recycle();
            target = next;
            continue;
        }
    }
    predecessor = target;
    target = next;
}
```

The `mFirstTouchTarget` can help to optimize the performance of touch event dispatching. Also it can help to keep the touch event dispatching stable. If view A consumes the `DOWN` event, and view B says it will consume `UP` event, one touch is dispatched to multi targets, what causes inconsistent.

The `ViewGroup.dispatchTransformedTouchEvent` will call child's `dispatchTouchEvent` to try to dispatch touch event to child. If the child is `ViewGroup` instance, it will do the similar work as above description; otherwise it will call `View`'s `onTouchListener`, `onTouchEvent` with order to check whether it wants to consume touch event.