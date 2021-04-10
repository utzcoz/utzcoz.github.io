---
layout: post
title:  "Analyze AOSP vsync model"
date:   2020-05-02 13:14 +0800
---

## Code base

`AOSP` 9.0

## Preface

[The `Android` UI rendering pipeline has following five stages](https://android-developers.googleblog.com/2020/04/high-refresh-rate-rendering-on-android.html):

> 1. Application's UI thread process input events, calls app's callbacks, and updates the View hierarchy's list of recorded drawing commands.
> 2. Application's  `RenderThread` issues the recorded commands to the GPU.
> 3. GPU draws the frame.
> 4. `SurfaceFlinger`, which is the system service in charge of displaying the different application windows on the screen, composes the screen and submits the frame to the display HAL.
> 5. Display presents the frame.

> The entire pipeline is controlled by the `Android` `Choreographer`. The `Choreographer` is based on the display vertical synchronization (`vsync`) events, which indicate the time the display start to scanout the image and update the display pixels.

So the `vsync` events are the base model for `Android` UI rendering pipeline. This article is to analyze the `AOSP` `vsync` model to show how the `Android` UI rendering pipeline works.

## `vsync` events source

The `SurfaceFlinger` uses the `HWC` to generate vsync events, and the `HWC` sends the events to `SurfaceFlinger`. It is the start of vsync events.

In `SurfaceFlinger::init()`, the `SurfaceFlinger` will register itself as callback for `HWC` to receive the `vsync` events from `HWC`.

```c++
SurfaceFlinger.cpp

getBE().mHwc->registerCallback(this, getBE().mComposerSequenceId);

HWC2.cpp

void Device::registerCallback(ComposerCallback* callback, int32_t sequenceId) {
    if (mRegisteredCallback) {
        ALOGW("Callback already registered. Ignored extra registration "
                "attempt.");
        return;
    }
    mRegisteredCallback = true;
    sp<ComposerCallbackBridge> callbackBridge(
            new ComposerCallbackBridge(callback, sequenceId));
    mComposer->registerCallback(callbackBridge);
}
```

When the `HWC` generated the `vsync` event, it will invoke `SurfaceFlinger::onVsyncReceived` to notify the `vsync` event.

```c++
void SurfaceFlinger::onVsyncReceived(int32_t sequenceId, hwc2_display_t displayId, int64_t timestamp) {
    Mutex::Autolock lock(mStateLock);
    // Ignore any vsyncs from a previous hardware composer.
    if (sequenceId != getBE().mComposerSequenceId) {
        return;
    }

    int32_t type;
    if (!getBE().mHwc->onVsync(displayId, timestamp, &type)) {
        return;
    }

    bool needsHwVsync = false;

    { // Scope for the lock
        Mutex::Autolock _l(mHWVsyncLock);
        if (type == DisplayDevice::DISPLAY_PRIMARY && mPrimaryHWVsyncEnabled) {
            needsHwVsync = mPrimaryDispSync.addResyncSample(timestamp);
        }
    }

    if (needsHwVsync) {
        enableHardwareVsync();
    } else {
        disableHardwareVsync(false);
    }
}
```

The `SurfaceFlinger` will invoke `mPrimaryDispSync`(type is `DispSync`)'s `addResyncSample` to notify the `vsync` event. If the `DispSync` thinks its internal model matches the `HWC` `vsync` events, it will return `false` to notify the `SurfaceFlinger` to disable `HWC` `vsync` events generation. Otherwise, it will return true to notify the `SurfaceFlinger` to receive `HWC` `vsync` events again, and use later `vsync` events to correct its internal model. We will analyze it later.

## `DispSync`

The `DispSync` is a very important utility class.

> It maintains a model of the periodic hardware-based `vsync` events of a display and uses that model to execute period callbacks at specific phase offsets from the hardware `vsync` events. The model is constructed by feeding consecutive hardware event timestamps to the `DispSync` object via the `addResyncSample` method.
> The model is validated using timestaps from `Fence` objects that are passed to the `DispSync` object via the `addPresentFence` method. These fence timestamps should correspond to a hardware `vsync` event, but they need not be consecutive hardware `vsync` times. If this method determines that the current model accurately represents the hardware `vsync` event times it will return `false` to indicate that a resynchronization (vai `addResyncSample`) is not needed.

The above description of `DispSync` is copied from `DispSync.h` comments. It illustrates the function of `DispSync`. It uses the hardware-base `vsync` events to construct its internal model, and then notifying callback the `vsync` event periodic based on its internal model. Also the `SurfaceFlinger` will check `DispSync`'s internal model's accuracy, and use `addResyncSample` to re-construct its internal model if `SurfaceFlinger` thinks `DispSync`'s internal model's accuracy is not enough.

In other word, the `DispSync` is the middle level of real hardware-based `vsync` events, and received `vsync` events of callback. It will feed hardware-based `vsync` events, and simulate it in software. Also there is a mechanism to correct its simulated model.

### Internal model

There are three important fields for internal model:

1. `mPeriod`: The `mPeriod` is the refresh interval or `vsync` events interval, and the value is got from `HWC`. For example, the `mPeriod` is about 16.66ms for 60HZ refresh rate. The `DispSync` will recalculate it based on the real occasion.
2. `mPhase`: The `mPhase` is the phase offset of the modeled `vsync` events. It is the number of nanoseconds from time 0 to the first `vsync` event. The first `vsync` event in this sentence is the first resync event added by `addResyncSample`.
3. `mReferenceTime`: The `mReferenceTime` is the reference time of the modeled `vsync` events. It is the nanosecond timestamp of the first `vsync` event after a resync.

The `DispSync` also has a internal thread class called `DispSyncThread` to use calculated model fields to notify the callbacks the `vsync` event periodic.

When the `SurfaceFlinger` calls `DispSync::addResyncSample` to feed hardware-based `vsync` event to `DispSync`, it will use them to simulate its internal model. 

```c++
bool DispSync::addResyncSample(nsecs_t timestamp) {
    Mutex::Autolock lock(mMutex);

    size_t idx = (mFirstResyncSample + mNumResyncSamples) % MAX_RESYNC_SAMPLES;
    mResyncSamples[idx] = timestamp;
    if (mNumResyncSamples == 0) {
        mPhase = 0;
        mReferenceTime = timestamp;
        mThread->updateModel(mPeriod, mPhase, mReferenceTime);
    }

    if (mNumResyncSamples < MAX_RESYNC_SAMPLES) {
        mNumResyncSamples++;
    } else {
        mFirstResyncSample = (mFirstResyncSample + 1) % MAX_RESYNC_SAMPLES;
    }

    updateModelLocked();

    if (mNumResyncSamplesSincePresent++ > MAX_RESYNC_SAMPLES_WITHOUT_PRESENT) {
        resetErrorLocked();
    }

    if (mIgnorePresentFences) {
        // If we don't have the sync framework we will never have
        // addPresentFence called.  This means we have no way to know whether
        // or not we're synchronized with the HW vsyncs, so we just request
        // that the HW vsync events be turned on whenever we need to generate
        // SW vsync events.
        return mThread->hasAnyEventListeners();
    }

    // Check against kErrorThreshold / 2 to add some hysteresis before having to
    // resync again
    bool modelLocked = mModelUpdated && mError < (kErrorThreshold / 2);
    return !modelLocked;
}
```

If the added resync sample is the first resync sample, it will reset the `mPhase`, `mReferenceTime`, and pass them to `DispSyncThread` to update its model fields. Otherwise, it will save the resync sample, and in `updateModelLocked`, it will use `MIN_RESYNC_SAMPLES_FOR_UPDATE` saved consecutive resync samples to calculate the internal model fields, and update it to `DispSyncThread`.

```c++
void DispSync::updateModelLocked() {
    if (mNumResyncSamples >= MIN_RESYNC_SAMPLES_FOR_UPDATE) {
        nsecs_t durationSum = 0;
        nsecs_t minDuration = INT64_MAX;
        nsecs_t maxDuration = 0;
        for (size_t i = 1; i < mNumResyncSamples; i++) {
            size_t idx = (mFirstResyncSample + i) % MAX_RESYNC_SAMPLES;
            size_t prev = (idx + MAX_RESYNC_SAMPLES - 1) % MAX_RESYNC_SAMPLES;
            nsecs_t duration = mResyncSamples[idx] - mResyncSamples[prev];
            durationSum += duration;
            minDuration = min(minDuration, duration);
            maxDuration = max(maxDuration, duration);
        }

        // Exclude the min and max from the average
        durationSum -= minDuration + maxDuration;
        mPeriod = durationSum / (mNumResyncSamples - 3);

        double sampleAvgX = 0;
        double sampleAvgY = 0;
        double scale = 2.0 * M_PI / double(mPeriod);
        // Intentionally skip the first sample
        for (size_t i = 1; i < mNumResyncSamples; i++) {
            size_t idx = (mFirstResyncSample + i) % MAX_RESYNC_SAMPLES;
            nsecs_t sample = mResyncSamples[idx] - mReferenceTime;
            double samplePhase = double(sample % mPeriod) * scale;
            sampleAvgX += cos(samplePhase);
            sampleAvgY += sin(samplePhase);
        }

        sampleAvgX /= double(mNumResyncSamples - 1);
        sampleAvgY /= double(mNumResyncSamples - 1);

        mPhase = nsecs_t(atan2(sampleAvgY, sampleAvgX) / scale);

        if (mPhase < -(mPeriod / 2)) {
            mPhase += mPeriod;
        }

        // Artificially inflate the period if requested.
        mPeriod += mPeriod * mRefreshSkipCount;

        mThread->updateModel(mPeriod, mPhase, mReferenceTime);
        mModelUpdated = true;
    }
}
```

The `updateModelLocked` will use the average revsync sample interval to calculate the more accurate `mPeriod`. For example, the 60fps refresh rate's ideal `vsync` event interval is `16.66`ms, if we consider the latencies, the real interval may be `17.**`ms or `16.**`ms or `15.**`ms. Because it uses the average value of `MIN_RESYNC_SAMPLES_FOR_UPDATE` - 3(`MIN_RESYNC_SAMPLES_FOR_UPDATE` is 6), so the calculated `mPeriod` can represent the real state.

And then the `updateModelLocked` will use formula [mean of angles](https://en.wikipedia.org/wiki/Mean_of_circular_quantities) to calculate the more accurate `mPhase` based on the average revsync sample reference time difference.

After calculating, the `updateModelLocked` will update calculated fields to `DispSyncThread` and set `mModelUpdated` to `true`. The `mModelUpdated` is `true` will trigger `SurfaceFlinger` to disable `HWC` to generate `vsync` events.

```c++
SurfaceFlinger::onVsyncReceived

if (needsHwVsync) {
    enableHardwareVsync();
} else {
    disableHardwareVsync(false);
}
```

When the `SurfaceFlinger` calls `DispSync::addPresentFence` to check the internal model accuracy, the `DipsSync::addPresentFence` will call `DispSync::updateErrorLocked` to calculate the error square sum:

```c++
void DispSync::updateErrorLocked() {
    if (!mModelUpdated) {
        return;
    }
    // Need to compare present fences against the un-adjusted refresh period,
    // since they might arrive between two events.
    nsecs_t period = mPeriod / (1 + mRefreshSkipCount);
    int numErrSamples = 0;
    nsecs_t sqErrSum = 0;
    for (size_t i = 0; i < NUM_PRESENT_SAMPLES; i++) {
        // Only check for the cached value of signal time to avoid unecessary
        // syscalls. It is the responsibility of the DispSync owner to
        // call getSignalTime() periodically so the cache is updated when the
        // fence signals.
        nsecs_t time = mPresentFences[i]->getCachedSignalTime();
        if (time == Fence::SIGNAL_TIME_PENDING || time == Fence::SIGNAL_TIME_INVALID) {
            continue;
        }

        nsecs_t sample = time - mReferenceTime;
        if (sample <= mPhase) {
            continue;
        }

        nsecs_t sampleErr = (sample - mPhase) % period;
        if (sampleErr > period / 2) {
            sampleErr -= period;
        }
        sqErrSum += sampleErr * sampleErr;
        numErrSamples++;
    }

    if (numErrSamples > 0) {
        mError = sqErrSum / numErrSamples;
        mZeroErrSamplesCount = 0;
    } else {
        mError = 0;
        // Use mod ACCEPTABLE_ZERO_ERR_SAMPLES_COUNT to avoid log spam.
        mZeroErrSamplesCount++;
    }
}
```
If the square sum is larger than the `kErrorThreadshold`(`static const nsecs_t kErrorThreshold = 160000000000`), the `DispSync::addPresentFence` will trigger `SurfaceFlinger::enableHardwareVsync()` to use hardware-base `vsync` to correct `DispSync` internal model.

### `DispSyncThread`

`DispSyncThread` is defined in `DispSync.cpp`, and it is a normal thread. Its `threadLoop` method will loop to find the next target time to send the `vsync` event to callback. If the target time is not now, it will sleep to wait for it. If there is any callback, it will sleep to wait the new callback.

```c++
virtual bool threadLoop() {
    status_t err;
    nsecs_t now = systemTime(SYSTEM_TIME_MONOTONIC);
    while (true) {
        Vector<CallbackInvocation> callbackInvocations;
        nsecs_t targetTime = 0;
        { // Scope for lock
            Mutex::Autolock lock(mMutex);
            // Other code to check state
            targetTime = computeNextEventTimeLocked(now);
            bool isWakeup = false;
            if (now < targetTime) {
                if (targetTime == INT64_MAX) {
                    err = mCond.wait(mMutex);
                } else {
                    err = mCond.waitRelative(mMutex, targetTime - now);
                }
                if (err == TIMED_OUT) {
                    isWakeup = true;
                } else if (err != NO_ERROR) {
                    return false;
                }
            }
            now = systemTime(SYSTEM_TIME_MONOTONIC);
            // Don't correct by more than 1.5 ms
            static const nsecs_t kMaxWakeupLatency = us2ns(1500);
            if (isWakeup) {
                mWakeupLatency = ((mWakeupLatency * 63) + (now - targetTime)) / 64;
                mWakeupLatency = min(mWakeupLatency, kMaxWakeupLatency);
            }
            callbackInvocations = gatherCallbackInvocationsLocked(now);
        }
        if (callbackInvocations.size() > 0) {
            fireCallbackInvocations(callbackInvocations);
        }
    }
    return false;
}
```
The `DispSyncThread::computeNextEventTimeLocked` is to find the nearest next target time of all callbacks, and check the target time to select whether to sleep to wait. If it sleeps to wait and wakeups with timeout, it will add wakeup latency to the later calculation. And then it will use `gatherCallbackInvocationsLocked` to collect callbacks that next target time is less than now now. Lastly, the `DispSyncThread::threadLoop` will use `fireCallbackInvocations` to notify the `vsync` event to callbacks. And then, the `threadLoop` enters to next loop.

```c++
nsecs_t computeListenerNextEventTimeLocked(const EventListener& listener, nsecs_t baseTime) {
    nsecs_t lastEventTime = listener.mLastEventTime + mWakeupLatency;
    if (baseTime < lastEventTime) {
        baseTime = lastEventTime;
    }
    baseTime -= mReferenceTime;
    nsecs_t phase = mPhase + listener.mPhase;
    baseTime -= phase;
    // If our previous time is before the reference (because the reference
    // has since been updated), the division by mPeriod will truncate
    // towards zero instead of computing the floor. Since in all cases
    // before the reference we want the next time to be effectively now, we
    // set baseTime to -mPeriod so that numPeriods will be -1.
    // When we add 1 and the phase, we will be at the correct event time for
    // this period.
    if (baseTime < 0) {
        baseTime = -mPeriod;
    }
    nsecs_t numPeriods = baseTime / mPeriod;
    nsecs_t t = (numPeriods + 1) * mPeriod + phase;
    t += mReferenceTime;
    // Check that it's been slightly more than half a period since the last
    // event so that we don't accidentally fall into double-rate vsyncs
    if (t - listener.mLastEventTime < (3 * mPeriod / 5)) {
        t += mPeriod;
    }
    t -= mWakeupLatency;
    return t;
}
```
The method to calculate the callback's next target time is `DispSyncThread::computeListenerNextEventTimeLocked`, and it will use `mPeriod`,`mPhase` and `mReferenceTime` passed from `DispSync` to calculate the callback's next target time. The final phase is the plus of `mPhase` and `listener.mPhase`. The `listener.mPhase` has two possibly values in current code base: `SurfaceFlinger::vsyncPhaseOffsetNs` for app, and `SurfaceFlinger::sfVsyncPhaseOffsetNs` for `SurfaceFlinger`. We will discuss it in later part.

The `DispSyncThread::gatherCallbackInvocationsLocked` compares current time with all callbacks next target time, and collects next target time is less than current time. It's very simple.

The `DispSyncThread::fireCallbackInvocations` will call callback's `onDispSyncEvent` to notify the `vsync` event.

```c++
void fireCallbackInvocations(const Vector<CallbackInvocation>& callbacks) {
    for (size_t i = 0; i < callbacks.size(); i++) {
        callbacks[i].mCallback->onDispSyncEvent(callbacks[i].mEventTime);
    }
}
```

## `VsyncSource` and `EventThread`

The `DispSyncThread` will call callback's `onDispSyncEvent` to notify the new `vsync` event. The callback is `DispVsyncSource` defined in `SurfaceFlinger.cpp`. In `DispVsyncSource::setVsyncEnabled` method, it will add itself as callback to `mDispSync`, which is `mPrimaryDispSync` in `SurfaceFlinger.cpp` with type `DispSync`.

```c++
void setVSyncEnabled(bool enable) override {
    Mutex::Autolock lock(mVsyncMutex);
    if (enable) {
        status_t err = mDispSync->addEventListener(mName, mPhaseOffset,
                static_cast<DispSync::Callback*>(this));
        if (err != NO_ERROR) {
            ALOGE("error registering vsync callback: %s (%d)",
                    strerror(-err), err);
        }
    } else {
        status_t err = mDispSync->removeEventListener(
                static_cast<DispSync::Callback*>(this));
        if (err != NO_ERROR) {
            ALOGE("error unregistering vsync callback: %s (%d)",
                    strerror(-err), err);
        }
    }
    mEnabled = enable;
}

virtual void onDispSyncEvent(nsecs_t when) {
    VSyncSource::Callback* callback;
    {
        Mutex::Autolock lock(mCallbackMutex);
        callback = mCallback;

        if (mTraceVsync) {
            mValue = (mValue + 1) % 2;
        }
    }
    if (callback != nullptr) {
        callback->onVSyncEvent(when);
    }
}
```

The `DispVysncSource` is a middle level between `DispSync` and the real callback. 

In `SurfaceFlinger::init()`, the `SurfaceFlinger` will create two `DispVsyncSource` instances:

```c++
mEventThreadSource =
        std::make_unique<DispSyncSource>(&mPrimaryDispSync, SurfaceFlinger::vsyncPhaseOffsetNs,
                                            true, "app");
mEventThread = std::make_unique<impl::EventThread>(mEventThreadSource.get(),
                                                    [this]() { resyncWithRateLimit(); },
                                                    impl::EventThread::InterceptVSyncsCallback(),
                                                    "appEventThread");
mSfEventThreadSource =
        std::make_unique<DispSyncSource>(&mPrimaryDispSync,
                                            SurfaceFlinger::sfVsyncPhaseOffsetNs, true, "sf");

mSFEventThread =
        std::make_unique<impl::EventThread>(mSfEventThreadSource.get(),
                                            [this]() { resyncWithRateLimit(); },
                                            [this](nsecs_t timestamp) {
                                                mInterceptor->saveVSyncEvent(timestamp);
                                            },
                                            "sfEventThread");
```

The `mEventThreadSource` is for app, and `mSFEventThreadSource` is for `SurfaceFlinger`. They will use `SurfaceFlinger::vsyncPhaseOffsetNs` and `SurfaceFlinger::sfVsyncPhaseOffsetNs` as the input value for `mPhase` of `DispVsyncSource`, that will set to listener's `mPhase`, what we saw before.

From the code, we can know `DispVsyncSource` will passed to create `EventThread`, and in `EventThread::enableVSyncLocked`, the `EventThread` will set itself as `DispVsyncSource`'s callback:

```c++
void EventThread::enableVSyncLocked() {
    if (!mUseSoftwareVSync) {
        // never enable h/w VSYNC when screen is off
        if (!mVsyncEnabled) {
            mVsyncEnabled = true;
            mVSyncSource->setCallback(this);
            mVSyncSource->setVSyncEnabled(true);
        }
    }
    mDebugVsyncEnabled = true;
}
```

So the real callback is `EventThread`. We will discuss when to call `enableVsyncLocked` later, so we will focus on the logic to response to `vsync` event.

```c++
void EventThread::onVSyncEvent(nsecs_t timestamp) {
    std::lock_guard<std::mutex> lock(mMutex);
    mVSyncEvent[0].header.type = DisplayEventReceiver::DISPLAY_EVENT_VSYNC;
    mVSyncEvent[0].header.id = 0;
    mVSyncEvent[0].header.timestamp = timestamp;
    mVSyncEvent[0].vsync.count++;
    mCondition.notify_all();
}
```

`EventThread::onVsyncEvent` just keeps the `vsync` event timestamp, and notify its internal condition object. `EventThread` is not a thread, but it contains a thread instance, `mThread`. And `EventThread::threadMain` is the loop method of `mThread`. In `EventThread`'s constructor, it initializes the `mThread` and starts it to run its `threadMain` method. 

```c++
EventThread::EventThread(VSyncSource* src, ResyncWithRateLimitCallback resyncWithRateLimitCallback,
                         InterceptVSyncsCallback interceptVSyncsCallback, const char* threadName)
      : mVSyncSource(src),
        mResyncWithRateLimitCallback(resyncWithRateLimitCallback),
        mInterceptVSyncsCallback(interceptVSyncsCallback),
         mThreadName(threadName) {
    // Other initialization code
    mThread = std::thread(&EventThread::threadMain, this);
    pthread_setname_np(mThread.native_handle(), threadName);
    // Other thread initialization code
}
```

`EventThread::threadMain` is very simple, it will use `EventThread::waitForEventLocked` to wait for event, and post events to the remote listener when it receives the new `vsync` event.

```c++
void EventThread::threadMain() NO_THREAD_SAFETY_ANALYSIS {
    std::unique_lock<std::mutex> lock(mMutex);
    while (mKeepRunning) {
        DisplayEventReceiver::Event event;
        Vector<sp<EventThread::Connection> > signalConnections;
        signalConnections = waitForEventLocked(&lock, &event);
        // dispatch events to listeners...
        const size_t count = signalConnections.size();
        for (size_t i = 0; i < count; i++) {
            const sp<Connection>& conn(signalConnections[i]);
            // now see if we still need to report this event
            status_t err = conn->postEvent(event);
            if (err == -EAGAIN || err == -EWOULDBLOCK) {
            } else if (err < 0) {
                // handle any other error on the pipe as fatal. the only
                // reasonable thing to do is to clean-up this connection.
                // The most common error we'll get here is -EPIPE.
                removeDisplayEventConnectionLocked(signalConnections[i]);
            }
        }
    }
}
```

In `EventThread::waitForEventLocked` will check the current `mVsyncEvent` timestamp, that updated by `EventThread::onVsyncEvent`. 

1. If it is valid and there are listeners, it will add listener to returned `signalConnections`. 
2. If the timestamp is not valid, and there are no listeners, it will call `EventThread::disableVsyncLocked()` to disable the receiving `vsync` events from `DispVsyncSource`. 
3. If it is not valid and but there are listeners, it will call `EventThread::enableVsyncLocked` to ensure itself can receive next `vsync` event from `DispVyncSource`. And it will sleep to wait `vsync` event.

We have saw there are two `EventThread` instances in `SurfaceFlinger`, `mEventThread` and `mSfEventThread`. The first is used to notify the `vsync` events to remote listeners for app, and the second is used to notify the `vsync` events to `SurfaceFlinger`. After the `DispSyncSource` receives the `vsync` event, it will send it to its responding `EventThread` to manage. So one `DispSync` manages multiple `DispVsyncSource`s, and one `DispVyncSource` manage one `EventThread`. One `EventThread` manages multiple remote listeners called `Connection`.

## `Connection` and `BitTube`

In `EventThread::threadMain`, we know the `EventThread` use `Connection` to post `vsync` event to remote listener. The `Connection` is defined `EventThread.h`. The `Connection` is also a `BnDisplayEventConnection` type, so its some methods can be called by binder.

In `EventThread::Connection::onFirstRef` it will call `EventThread::registerDisplayEventConnection` to add itself to `EventThread` for later `postEvent`:

```c++
void EventThread::Connection::onFirstRef() {
    // NOTE: mEventThread doesn't hold a strong reference on us
    mEventThread->registerDisplayEventConnection(this);
}
```

Before we analyze `EventThread::Connection::postEvent`, we should introduce the `BitTube`. The `BitTube` is a wrapper for paired socket. It has two fd called `mReceiveFd` and `mSendFd` for receiver and sender to communication. In its `BitTube::init` method, it will initialize the paired socket:

```c++
void BitTube::init(size_t rcvbuf, size_t sndbuf) {
    int sockets[2];
    if (socketpair(AF_UNIX, SOCK_SEQPACKET, 0, sockets) == 0) {
        size_t size = DEFAULT_SOCKET_BUFFER_SIZE;
        setsockopt(sockets[0], SOL_SOCKET, SO_RCVBUF, &rcvbuf, sizeof(rcvbuf));
        setsockopt(sockets[1], SOL_SOCKET, SO_SNDBUF, &sndbuf, sizeof(sndbuf));
        // since we don't use the "return channel", we keep it small...
        setsockopt(sockets[0], SOL_SOCKET, SO_SNDBUF, &size, sizeof(size));
        setsockopt(sockets[1], SOL_SOCKET, SO_RCVBUF, &size, sizeof(size));
        fcntl(sockets[0], F_SETFL, O_NONBLOCK);
        fcntl(sockets[1], F_SETFL, O_NONBLOCK);
        mReceiveFd.reset(sockets[0]);
        mSendFd.reset(sockets[1]);
    } else {
        mReceiveFd.reset();
        ALOGE("BitTube: pipe creation failed (%s)", strerror(errno));
    }
}
```

After initialization, the real receiver will steal the client's `mReceiveFd` to its `BitTube` instance `mReceiveFd`, and receive the socket data from client's `BitTube`. It's useful for `IPC`. The `Connection` has a `BitTube` instance as its field.

The `EventThread::Connection::postEvent` just uses `DisplayEventReceiver::sendEvents` to use `mChannel`(type is `BitTube`) to send event data based on socket:

```c++
status_t EventThread::Connection::postEvent(const DisplayEventReceiver::Event& event) {
    ssize_t size = DisplayEventReceiver::sendEvents(&mChannel, &event, 1);
    return size < 0 ? status_t(size) : status_t(NO_ERROR);
}

ssize_t DisplayEventReceiver::sendEvents(gui::BitTube* dataChannel,
        Event const* events, size_t count)
{
    return gui::BitTube::sendObjects(dataChannel, events, count);
}
```

## `DisplayEventReceiver` and `DisplayEventDispatcher`

The `DisplayEventReceiver` is the `Connection` receiver in app part, and the `DisplayEventDispatcher` is the dispatcher in app native part. When the `SurfaceFlinger` received an `vsync` event, it will use `BitTube` to send data to `DisplayEventReceiver` and notify the `DisplayEventDispatcher` to dispatch to java part; when the app part wants to next `vsync` event, it will invoke `DisplayEventReceiver` method to invoke its internal `Connection` method to use binder to update `SurfaceFlinger` part state.

In `DisplayEventReceiver::DisplayEventReceiver`, it will call `SurfaceFlinger::createDisplayEvent` to create a `Connection` instance:

```c++
DisplayEventReceiver::DisplayEventReceiver(ISurfaceComposer::VsyncSource vsyncSource) {
    sp<ISurfaceComposer> sf(ComposerService::getComposerService());
    if (sf != NULL) {
        mEventConnection = sf->createDisplayEventConnection(vsyncSource);
        if (mEventConnection != NULL) {
            mDataChannel = std::make_unique<gui::BitTube>();
            mEventConnection->stealReceiveChannel(mDataChannel.get());
        }
    }
}

sp<IDisplayEventConnection> SurfaceFlinger::createDisplayEventConnection(
        ISurfaceComposer::VsyncSource vsyncSource) {
    if (vsyncSource == eVsyncSourceSurfaceFlinger) {
        return mSFEventThread->createEventConnection();
    } else {
        return mEventThread->createEventConnection();
    }
}
```

The `SurfaceFlinger::createDisplayEventConnection` will add `Connection` instance in `EventThread` managed list. In `DisplayEventReceiver::DisplayEventReceiver`, the `DisplayEventReceiver` will use `Connection::stealReceiveChannel` to change the connection's receive fd to its data channel. So when the `EventThread::Connection::postEvent` post event by `BitTube`, the `DisplayEventReceiver`'s `mDataChannel` will receive the socket data.

The `DisplayEventDispatcher` has a `DisplayEventReceiver` instance, and use its `mDataChannel`'s `mReceiveFd` as the `Looper` listening fd. When the `EventThread::Connection::postEvent`, the `mLooper` will be notified. And then `DisplayEventDispatcher::handleEvent` will be called to call `DisplayEventReceiver::getEvents` to read event data from socket.

```c++
DisplayEventDispatcher::DisplayEventDispatcher(const sp<Looper>& looper,
        ISurfaceComposer::VsyncSource vsyncSource) :
        mLooper(looper), mReceiver(vsyncSource), mWaitingForVsync(false) {
    ALOGV("dispatcher %p ~ Initializing display event dispatcher.", this);
}

status_t DisplayEventDispatcher::initialize() {
    status_t result = mReceiver.initCheck();
    if (result) {
        ALOGW("Failed to initialize display event receiver, status=%d", result);
        return result;
    }

    int rc = mLooper->addFd(mReceiver.getFd(), 0, Looper::EVENT_INPUT,
            this, NULL);
    if (rc < 0) {
        return UNKNOWN_ERROR;
    }
    return OK;
}

int DisplayEventDispatcher::handleEvent(int, int events, void*) {
    if (events & (Looper::EVENT_ERROR | Looper::EVENT_HANGUP)) {
        return 0; // remove the callback
    }
    if (!(events & Looper::EVENT_INPUT)) {
        return 1; // keep the callback
    }
    // Drain all pending events, keep the last vsync.
    nsecs_t vsyncTimestamp;
    int32_t vsyncDisplayId;
    uint32_t vsyncCount;
    if (processPendingEvents(&vsyncTimestamp, &vsyncDisplayId, &vsyncCount)) {
        mWaitingForVsync = false;
        dispatchVsync(vsyncTimestamp, vsyncDisplayId, vsyncCount);
    }
    return 1; // keep the callback
}

bool DisplayEventDispatcher::processPendingEvents(
        nsecs_t* outTimestamp, int32_t* outId, uint32_t* outCount) {
    bool gotVsync = false;
    DisplayEventReceiver::Event buf[EVENT_BUFFER_SIZE];
    ssize_t n;
    while ((n = mReceiver.getEvents(buf, EVENT_BUFFER_SIZE)) > 0) {
        for (ssize_t i = 0; i < n; i++) {
            const DisplayEventReceiver::Event& ev = buf[i];
            switch (ev.header.type) {
            case DisplayEventReceiver::DISPLAY_EVENT_VSYNC:
                // Later vsync events will just overwrite the info from earlier
                // ones. That's fine, we only care about the most recent.
                gotVsync = true;
                *outTimestamp = ev.header.timestamp;
                *outId = ev.header.id;
                *outCount = ev.vsync.count;
                break;
            // Other code
            }
        }
    }
    return gotVsync;
}
```

The `dispatchVsync` will be invoked to dispatch `vsync` event to java part after reading event data from socket. The `dispatchVsync` is implemented by `NativeDisplayEventReceiver` in `android_view_DisplayEventReceiver.cpp`.

```c++
void NativeDisplayEventReceiver::dispatchVsync(nsecs_t timestamp, int32_t id, uint32_t count) {
    JNIEnv* env = AndroidRuntime::getJNIEnv();
    ScopedLocalRef<jobject> receiverObj(env, jniGetReferent(env, mReceiverWeakGlobal));
    if (receiverObj.get()) {
        env->CallVoidMethod(receiverObj.get(),
                gDisplayEventReceiverClassInfo.dispatchVsync, timestamp, id, count);
    }
    mMessageQueue->raiseAndClearException(env, "dispatchVsync");
}
```

It will call `DisplayEventReceiver.java`'s `dispatchVsync` to dispatch `vsync` event. And finally, `Choreographer.onVsync` will be invoked. And `onVsync` will use `Handler` to call the `Choreographer.doFrame` to notify the java part to update the UI content.

```java
void doFrame(long frameTimeNanos, int frame) {
    // Other check code
    try {
        Trace.traceBegin(Trace.TRACE_TAG_VIEW, "Choreographer#doFrame");
        AnimationUtils.lockAnimationClock(frameTimeNanos / TimeUtils.NANOS_PER_MS);

        mFrameInfo.markInputHandlingStart();
        doCallbacks(Choreographer.CALLBACK_INPUT, frameTimeNanos);

        mFrameInfo.markAnimationsStart();
        doCallbacks(Choreographer.CALLBACK_ANIMATION, frameTimeNanos);

        mFrameInfo.markPerformTraversalsStart();
        doCallbacks(Choreographer.CALLBACK_TRAVERSAL, frameTimeNanos);

        doCallbacks(Choreographer.CALLBACK_COMMIT, frameTimeNanos);
    } finally {
        AnimationUtils.unlockAnimationClock();
        Trace.traceEnd(Trace.TRACE_TAG_VIEW);
    }
    // Other code
}
```

There are four stages: input, animation, traversal and commit. The most of them will be processed by `ViewRootImpl`. The `CALLBACK_TRAVERSAL` callback is `ViewRootImpl.doTraversal`, that is the entry point of view subsystem updating in java part.

## `MessageQueue`

The `DisplayEventReceiver` is used by app part, so what about `SurfaceFlinger` part? The receiver for `SurfaceFlinger` is `MessageQueue`.

In `SurfaceFlinger::init`, the `SurfaceFlinger` will pass `mSFEventThread` to `MessageQueue`:

```c++
mEventQueue->setEventThread(mSFEventThread.get());

void SurfaceFlinger::onFirstRef()
{
    mEventQueue->init(this);
}

void MessageQueue::init(const sp<SurfaceFlinger>& flinger) {
    mFlinger = flinger;
    mLooper = new Looper(true);
    mHandler = new Handler(*this);
}

void MessageQueue::setEventThread(android::EventThread* eventThread) {
    if (mEventThread == eventThread) {
        return;
    }

    if (mEventTube.getFd() >= 0) {
        mLooper->removeFd(mEventTube.getFd());
    }

    mEventThread = eventThread;
    mEvents = eventThread->createEventConnection();
    mEvents->stealReceiveChannel(&mEventTube);
    mLooper->addFd(mEventTube.getFd(), 0, Looper::EVENT_INPUT, MessageQueue::cb_eventReceiver,
                   this);
}
```

The `MessageQueue::setEventThread` will create `Connection` of passed `EventThread`, which is `mSFEventThread`. And then it will steal created `Connection`'s receiver fd to its `mEventTube.getFd()`, just likes `DisplayEventReceiver::DisplayEventReceiver`. So we can consider `MessageQueue` as `SurfaceFlinger`'s `DisplayEventReceiver`.

When the `mLooper` notified by socket data, it will call `MessageQueue::cb_eventReceiver` to process the event:

```c++
int MessageQueue::cb_eventReceiver(int fd, int events, void* data) {
    MessageQueue* queue = reinterpret_cast<MessageQueue*>(data);
    return queue->eventReceiver(fd, events);
}

int MessageQueue::eventReceiver(int /*fd*/, int /*events*/) {
    for (int i = 0; i < n; i++) {
            if (buffer[i].header.type == DisplayEventReceiver::DISPLAY_EVENT_VSYNC) {
                mHandler->dispatchInvalidate();
                break;
            }
        }
    }
    return 1;
}
```
It's very similar with `DisplayEventDispatcher`. When the `vsyn` event coming for `SurfaceFlinger`, the `MessageQueue::dispatchInvalidate` will trigger `SurfaceFlinger::onMessageReceived` to invalidate the surfaces. The next operation is `SurfaceFlinger::handleMessageRefresh`, that combines many familiar operations: `rebuildLayerStacks`, `doComposition`, `postComposition`. They will compose the surfaces with GPU and `HWC`, and post them to GPU to display to show.

## When to enable `vsync`?

From the above analyzing, we know if no-body is interested in `vsync`, the `SurfaceFlinger` will disable the `vsync`, and remove calback from `DispSync`(see `DisplayVsyncSource::setVSynvEnabled`). So there is a problem we should to sovle is when to enable `vsync` after `vsync` is disabled?

To explain this problem, we will use a real occasion - clicking the launcher icon after system is stable without any view changing - to see what happens.

After click the launcher icon, the `InputFlinger` starts to dispatch touch event to `ViewRootImpl.java`. And the `Launcher3` responses `onTouchEvent` to start animation. The `AnimationHandler.MyFrameCallbackProvider` calls the `Choreographer.postCallback` to post callback, that will trigger `Choreographer.scheduleVsyncLocked`.

The `scheduleVsyncLocked` will notify the `EventThread` with a long invoking-chain:

`Choreographer.java scheduleVsyncLocked` -> `DisplayEventReceiver.java scheduleVsync` -> `DisplayEventReceiver.java nativeScheduleVsync` -> `NativeDisplayEventReceiver::scheduleVsync` -> `DisplayEventDispatcher::scheduleVsync` -> `DisplayEventReceiver::requestNextVsync` -> `EventThread::Connection::requestNextVsync` -> `EventThread::requestNextVsync`.

```c++
void EventThread::requestNextVsync(const sp<EventThread::Connection>& connection) {
    std::lock_guard<std::mutex> lock(mMutex);

    if (mResyncWithRateLimitCallback) {
        mResyncWithRateLimitCallback();
    }

    if (connection->count < 0) {
        connection->count = 0;
        mCondition.notify_all();
    }
}
```

The `EventThread::requestNextVsync` will call `mResyncWithRateLimitCallback`, passed by `EventThread` constructor. In `SurfaceFlinger::init`, we knows the `mResyncWithRateLimitCallback` is `SurfaceFlinger::resyncWithRateLimit`:

```c++
void SurfaceFlinger::resyncWithRateLimit() {
    static constexpr nsecs_t kIgnoreDelay = ms2ns(500);
    // No explicit locking is needed here since EventThread holds a lock while calling this method
    static nsecs_t sLastResyncAttempted = 0;
    const nsecs_t now = systemTime();
    if (now - sLastResyncAttempted > kIgnoreDelay) {
        resyncToHardwareVsync(false);
    }
    sLastResyncAttempted = now;
}

void SurfaceFlinger::resyncToHardwareVsync(bool makeAvailable) {
    Mutex::Autolock _l(mHWVsyncLock);
    if (makeAvailable) {
        mHWVsyncAvailable = true;
    } else if (!mHWVsyncAvailable) {
        // Hardware vsync is not currently available, so abort the resync
        // attempt for now
        return;
    }

    const auto& activeConfig = getBE().mHwc->getActiveConfig(HWC_DISPLAY_PRIMARY);
    const nsecs_t period = activeConfig->getVsyncPeriod();

    mPrimaryDispSync.reset();
    mPrimaryDispSync.setPeriod(period);

    if (!mPrimaryHWVsyncEnabled) {
        mPrimaryDispSync.beginResync();
        //eventControl(HWC_DISPLAY_PRIMARY, SurfaceFlinger::EVENT_VSYNC, true);
        mEventControlThread->setVsyncEnabled(true);
        mPrimaryHWVsyncEnabled = true;
    }
}
```

The `SurfaceFlinger::resyncWithRateLimit` will call `SurfaceFlinger::resyncToHardwareVsync` to enable `vsync`, which will add `DispSyncSource` as callback to `DispSync` to receive the `vsync` event.

The above process is for app, what about `SurfaceFlinger`?

In the end of `ViewRootImpl.draw`, it will call `ThreadedRenderer.draw` to send updated frame to GPU. The invoking process is also long:

`ThreadedRenderer.draw` -> `ThreadedRenderer.nSyncAndDrawFrame` -> `android_view_ThreadedRenderer::android_view_ThreadedRenderer_syncAndDrawFrame` -> `RenderProxy::syncAndDrawFrame` -> `DrawFrameTask::drawFrame` -> `DrawFrameTask::run` -> `CanvasContext::draw` -> `RenderPipeline::draw`(in my occasion is `OpenGLPipeline`) -> `EglManager::swapBuffer` ->  `eglApi::eglSwapBuffersWithDamageKHR` -> `Surface::queueBuffer` -> `BpGraphicBufferProducer::queueBuffer` -> `BufferQueueProducer::queueBuffer` -> `BpConsumerListener::onFrameAvailable` -> `ProxyConsumerListener::onFrameAvailable` -> `ConsumerBase::onFrameAvailable` -> `BufferLayer::onFrameAvailable` -> `SurfaceFlinger::signalLayerUpdate` -> `MessageQueue::invalidate`.

The invoking after `MessageQueue::invalidate`, and it will add `mSfEventThreadSource` as the callback for `vsync` event.

## Pull down refresh rate

In high refresh device, we can pull down the refresh rate to let app run smoothly in high refresh rate.

The `DispSYnc::setRefreshSkipCount` will set the `mRefreshSkipCount`, and use it to calculate its `mPeriod` in `DispSync::updateModelLocked`:

```c++
mPeriod += mPeriod * mRefreshSkipCount;
```

For exmple, current refresh rate is 90fps, the default `mPeriod` is 11ms. If we set `mRefreshSkipCount` to 1, the `mPeriod` will be 22ms, and the real refresh rate pulls down to 45fps. And it will give app more computing time before composition.

## Summary

The `HWC` generates hardware-based `vsync` events, and it will be feed to `DispSync` to simulate its internal model corresponding `HWC`'s frame rate. If it finds the `DispSync`'s internal model is not accurate, it will use hardware-based `vsync` to correct it. If the `DispSync` internal model is thought as accurate, the `SurfaceFlinger` will disable the `HWC` generating.

The `DispSync` matains a internal model, and its internal thread `DispSyncThread`  will use its model to find the next target time, and wait to it. When the next target time coming, it will send simulated `vsync` event to callback. If the upper level wants to receive the `vsync` event, it should add callback to `DispSync`. If there are no callbacks, the `DispSyncThread` will sleep to wait notify to reduce the unncessary computing. The `DispSync` is an one-multiple pattern for callback.

The `EventThread` is the real callback of `DispSync`, although there is a `DispSyncSource` in the middle. The `EventThread` manages `EventThread::Connection` to communicate with the real receiver. There are two `EventThread` instances, one is `mEventThread` for app, and another is `mSFEventThread` for `SurfaceFlinger`. So the `EventThread` is also an one-multiple pattern for `EventThread::Connection`. The `EventThread::Connection` is a `Bn` binder type, and it manages a paired socket. So the `EventThread::Connection` can use binder and socket to communicate.

For app, there are classes called `DisplayEventReceiver` and `DisplayEventDispatcher` to receive the event data from `EventThread::Connection`, and dispatch the event to `Choreographer` in java part.

When `Choreographer` receives the `vsync` event, it will arrange java part to update the view frame, and send it to GPU to draw. The draw operation will trigger `SurfaceFlinger` to receive the `vsync` event to do composition for surfaces, and send it to display to show. If the system receives input event after stable, it will trigger resync to `EventThread`, and notify the `EventThread`, `DispSyncThread` to do work.

The `SurfaceFlinger` provides a mechanism based on hardware-based `vsync` to provide period event to notify system to update content. And the system will control how to enable/disable this mechanism to reduce unncessary computing.