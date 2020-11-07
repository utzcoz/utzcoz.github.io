---
layout: post
title:  "Test LiveData in Instrumentation tests"
date:   2019-06-02 23:23 +0800
categories: aosp test
---

The `LiveData.observe` method should run in main thread, but our test methods run in background thread, so we should use some tricks to avoid it if we want to test `LiveData` in Instrumentation tests.

There is a method to use `InstantTaskExecutorRule` in library `androidx.arch.core:core-testing` to hook `DefaultTaskExecutor` to a normal `TaskExecutor` which pretends to run main thread. But it works fine when we use it with `testImplementation` for unit tests, but not for `androidTestImplementation` for Instrumentation tests because of test runner(maybe). But we can fix it to imitate `InstantTaskExecutorRule`, like below code snipped:

```java
public static void hookMainThreadForLiveData() {
    ArchTaskExecutor archTaskExecutor = ArchTaskExecutor.getInstance();
    try {
        Method methodSetDelegate =
                archTaskExecutor.getClass().getDeclaredMethod("setDelegate", TaskExecutor.class);
        methodSetDelegate.setAccessible(true);
        methodSetDelegate.invoke(archTaskExecutor, new TaskExecutor() {
            @Override
            public void executeOnDiskIO(@NonNull Runnable runnable) {
                runnable.run();
            }

            @Override
            public void postToMainThread(@NonNull Runnable runnable) {
                runnable.run();
            }

            @Override
            public boolean isMainThread() {
                return true;
            }
        });
    } catch (Exception e) {
        throw new RuntimeException("Failed to hook main thread for live data", e);
    }
}

public static void resetMainThreadForLiveData() {
    ArchTaskExecutor archTaskExecutor = ArchTaskExecutor.getInstance();
    try {
        Method methodSetDelegate =
                archTaskExecutor.getClass().getDeclaredMethod("setDelegate", TaskExecutor.class);
        methodSetDelegate.setAccessible(true);
        methodSetDelegate.invoke(archTaskExecutor, new Object[]{null});
    } catch (Exception e) {
        throw new RuntimeException("Failed to reset hook thread for live data", e);
    }
}

@Before
public void setUp() {
    TestUtil.hookMainThreadForLiveData();
}

@After
public void tearDown() {
    TestUtil.resetMainThreadForLiveData();
}
```

To wait and check `LiveData` value better, we can use [jraska's livedata-testing](https://github.com/jraska/livedata-testing) to simply the work to test `LiveData`. And we can include to our project with below `gralde` command:

```groovy
androidTestImplementation 'com.jraska.livedata:testing:1.1.0'
```
