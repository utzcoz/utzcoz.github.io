---
layout: post
title:  "Android Testing with Robolectric"
date:   2022-01-01 12:47 +0800
---

[Robolectric][1] is the industry-standard local testing framework for Android. With Robolectric, your tests run in a simulated Android environment inside a JVM, without the overhead and flakiness of an emulator. At [Android testing Fundamentals tutorial][12], Google gives a name for Robolectric: simulator. I have used it and contributed to it very much, and think it is very useful tool for Android app's local testing. This article will explain the reason why we should consider Robolectric, and some practices that I want to recommend when using Robolectric, e.g. sharedTest pattern.

# Test Pyramid and Test Scope

Before we discuss Robolectric details, we can discuss test pyramid and scope firstly.

In old Android testing tutorial, Android testing team uses [test pyramid][13] variant diagram to clarify test types in Android area: 

![test pyramid](/images/android-test-pyramid.png)

And in [new Android testing tutorial][12], Android testing team introduces test scope to express similar concepts but with test's scope consideration:  

![Test Scope](/images/android-test-scopes.png)

> Tests also vary depending on size, or degree of isolation:
> 1. Unit tests or small tests only verify a very small portion of the app, such as a method or class.
> 2. End-to-end tests or big tests verify larger parts of the app at the same time, such as a whole screen or user flow.
> 3. Medium tests are in between and check the integration between two or more units.

From unit test to e2e test, the fidelity, execution time, tested item scope, and the difficulty of maintenance and debugging grow progressive. When we write tests, we should balance between fidelity and development speed. We could write more tests at unit test and integration test level with some fidelity lost to improve development speed, and write small but critical e2e/ui tests to ensure fidelity finally with lower running frequency. The recommend percents of test scope from unit test to e2e test are: 70%, 20%, 10%.

At different test scope, there are some tools we can choose:

1. unit test: Mockito/MockK/PowerMock/Robolectric.
2. integration test: Robolectric/AndroidX test.
3. e2e test: Robolectric/AndroidX test.

For unit test, there are many awesome mock tools for Android: [Mockito][15], [PowerMock][16], and [MockK][17]. But if you want to use fake style tool for Android unit test, Robolectric is a good choice, as [Roboletric's shadow is one type of Android's fake implementation][11]. [New Android testing tutorial prefers to fake style instead of mock style for Android testing][18], and Robolectric is trying to improve its performance to reduce overload when using Robolectric to write unit test, e.g. instrumented android-all jars. Robolectric also supports those mock tools on many occasions when Robolectric's shadow doesn't meet your requirement.

For integration test, we can use Robolectric as simulator and run those tests on JVM, and AndroidX test library to run those tests on Emulator or real devices. Robolectric also supports AndroidX test library, and [developers can run tests written with AndroidX test library on Robolectric 4.x+][20]. In this scope, we can run those tests on CI more easily when using Robolectric, because we only need JVM.

For e2e test, Robolectric also can work sometimes with better development speed and easily CI integration when writing UI related tests. And Robolectric also has advantage when testing app with system's core services/settings, because it has various shadow APIs to control those services/settings.

Beside of test pyramid and test scope, I prefer to use [local test][21] to identify the occasion that I select Robolectric as the first choice for Android testing. If I want to run tests on local development machine or CI machine, I prefer to use Robolectric to write tests, including unit test, integration test and e2e test or instrumentation test.

# Why Robolectric?

We have discussed some reasons of selecting Robolectric to write tests. We can summarize these advantages together(thanks hoisie for summarizing these advantages):

## Performance

Robolectric tests run on the JVM. This avoids all of the overhead with Emulators, such as startup time, APK dexing + packaging + copying + installing.

## Flakiness

Tests on Emulators have more concurrent threads, leading to nondeterminism and flakiness.

## APIs

Robolectric offers lots of powerful and extensible testing APIs (shadow APIs) not available in Emulators.

Those advantages come when comparing Robolectric with Emulator for instrumentation test. And many folks also think Robolectric is useful for instrumentation test. But what about unit test? We can use mock tools for unit test totally if related logic doesn't have too much dependencies on Android's Context or other system APIs. If not, we can prefer Robolectric to reduce our work to mock those system APIs, and write unit test more conveniently. If test method involves a lot of modules, including hidden Android system modules, I will group it to integration test although this test method only has three lines of test code, and prefer Robolectric if I want to run it locally.

# How to integrate Robolectric?

Integrating Robolectric is very simple: enabling `unitTests.includeAndroidResources` to use Robolectric's maintained resource mechanism, and adding Robolectric and related recommended dependencies([AndroidX test][22], [Google Truth][23] and [JUnit4][24]).

```groovy
android {
    testOptions {
        unitTests.includeAndroidResources = true
    }
}

dependencies {
    testImplementation 'junit:junit:4.13.2'
    testImplementation 'androidx.test:monitor:1.4.0'
    testImplementation 'androidx.test:runner:1.4.0'
    testImplementation 'androidx.test:rules:1.4.0'
    testImplementation 'androidx.test.ext:junit:1.1.3'
    testImplementation 'androidx.test.ext:junit-ktx:1.1.3'
    testImplementation 'androidx.test.ext:truth:1.4.0'
    testImplementation 'androidx.test:core:1.4.0'
    testImplementation 'com.google.truth:truth:1.1.3'
    testImplementation 'org.robolectric:robolectric:4.7.3'
}
```

Now, we can write test with Robolectric:

```Kotlin
@RunWith(RobolectricTestRunner::class)
class MainActivityRobolectricTest {
   @Test
   fun `click hint button and hint view should update content with text Hint`() {
       ActivityScenario.launch(MainActivity::class.java).use { scenario ->
           scenario.onActivity { activity: MainActivity ->
               val button = activity.findViewById<Button>(R.id.btn_show_hint)
               button.performClick()
               val tvHint = activity.findViewById<TextView>(R.id.tv_hint)
               assertThat(tvHint.text).isEqualTo("Hint")
           }
       }
   }
}
```

With six lines of test code, we can test the response of one button's clicking logic, and run it on JVM with command `./gradlew test`. This test sample also leverages AndroidX test APIs to test UI related logic. We can change test runner to `AndroidJUnit4` and run this test on real Emulator. We will discuss it at later sharedTest pattern part.

# Core features

Robolectric is very simple to integration, it also has many core features that useful to simplifier tests.

## Real resources

The supporting of real resources is one of my favorite core feature of Robolectric. We can test logic with resources very easily with enabling `unitTests.includeAndroidResources` for project:

```groovy
android {
    testOptions {
        unitTests.includeAndroidResources = true
    }
}
```

After that, we can access resources directly in our tests with Robolectric:

```Kotlin
val button = activity.findViewById<Button>(R.id.btn_show_hint)
button.performClick()
val tvHint = activity.findViewById<TextView>(R.id.tv_hint)
assertThat(tvHint.text).isEqualTo(MainActivity.HINT_HINT)
```

It's not recommended to use legacy resources supporting, because it's not maintained and supported with high priority by Robolectric team now.

## Configure SDK

Robolectric supports Android SDK from 16-31 now if we use Robolectric 4.7.3(the latest version that recommended to use). We can use configurable SDK to control test's testing range. Although almost of all APIs of Android SDK are stable, but there are some changes between different SDKs. For example, [`Activity#onMultiWindowModeChanged(boolean)`][25] is added from SDK 24, and deprecated from SDK 26 with added replacement [`onMultiWindowModeChanged (boolean isInMultiWindowMode, Configuration newConfig)`][26]. Many apps need support many Android versions, and have compatible behaviors on different Android versions. If you have this need, Robolectric's configurable SDK can help a lot.

The following test is used to test `Activity#onMultiWindowModeChanged(boolean)` from SDK `N` to `N_MR1`:

```Kotlin
@Config(minSdk = N, maxSdk = N_MR1)
@Test
fun `old multi window mode changed and hint view should update content with text old-multi-window`() {
   rule.scenario.use { scenario: ActivityScenario<MainActivity> ->
       scenario.onActivity { activity: MainActivity ->
           // Deprecated from SDK 26
           activity.onMultiWindowModeChanged(true)
           val tvHint = activity.findViewById<TextView>(R.id.tv_hint)
           assertThat(tvHint.text).isEqualTo(MainActivity.HINT_OLD_MULTI_WINDOW)
       }
   }
}
```

And the next test is used to test `onMultiWindowModeChanged (boolean isInMultiWindowMode, Configuration newConfig)` from SDK `O`:

```Kotlin
@Config(minSdk = O)
@Test
fun `multi window mode changed and hint view should update content with text multi-window`() {
   rule.scenario.use { scenario: ActivityScenario<MainActivity> ->
       scenario.onActivity { activity: MainActivity ->
           activity.onMultiWindowModeChanged(true, activity.resources.configuration)
           val tvHint = activity.findViewById<TextView>(R.id.tv_hint)
           assertThat(tvHint.text).isEqualTo(MainActivity.HINT_MULTI_WINDOW)
       }
   }
}
```

We can run `./gradlew test` now to test `onMultiWindowChanged` callbacks for different Android versions. 

## Configure qualifiers

With Robolectric, we can configure resource qualifier for test class or test method. 

```Kotlin
// https://developer.android.com/guide/topics/resources/providing-resources.html#QualifierRules
@Config(qualifiers = "port")
@Test
fun `orientation hint view should show normal for portrait layout`() {
   rule.scenario.use { scenario: ActivityScenario<MainActivity> ->
       scenario.onActivity { activity: MainActivity ->
           val tvHintOrientation = activity.findViewById<TextView>(R.id.tv_hint_orientation);
           assertThat(tvHintOrientation.text).isEqualTo(
               activity.resources.getString(R.string.hint_orientation_normal)
           )
       }
   }
}

// https://developer.android.com/guide/topics/resources/providing-resources.html#QualifierRules
@Config(qualifiers = "land")
@Test
fun `orientation hint view should show landscape for landscape layout`() {
   rule.scenario.use { scenario: ActivityScenario<MainActivity> ->
       scenario.onActivity { activity: MainActivity ->
           val tvHintOrientation = activity.findViewById<TextView>(R.id.tv_hint_orientation);
           assertThat(tvHintOrientation.text).isEqualTo(
               activity.resources.getString(R.string.hint_orientation_landscape)
           )
       }
   }
}

```

For example, we can use `@Config` to configure display's landscape or port state, and test different screen state for cross-device apps. It's recommend use it with real resources enabling. We can follow [Android's qualifier rules][27] to configure qualifier rules based on real need.

## Configure display

Another core feature used by many projects, e.g. Flutter, is configuring display state when testing.

```Java
private void setExpectedDisplayRotation(int rotation) {
 ShadowDisplay display =
     Shadows.shadowOf(
         ((WindowManager)
                 RuntimeEnvironment.systemContext.getSystemService(Context.WINDOW_SERVICE))
             .getDefaultDisplay());
 display.setRotation(rotation);
}
```

Above example is copied from Flutter test code, and is used to change display's rotation when testing. It's very useful to test logic related to display rotation and rotation changing. It's not convenient to configure display rotation when testing with Emulator. 

## APIs

IMO, Robolectric is a fake implementation of Android frameworks, and provides massive APIs for developer to configure frameworks's state and get framework's state. For example, there is a `BroadcastReceiver` implementation class to receive special action, and start a foreground service: 

```Java
public class ShowHideTaskbarReceiver extends BroadcastReceiver {
   @Override
   public void onReceive(Context context, Intent intent) {
       if (intent == null || !ACTION_SHOW_HIDE_TASKBAR.equals(intent.getAction())) {
           return;
       }
       // some checks
       Intent notificationIntent = new Intent(context, NotificationService.class);
       // some checks
       U.startForegroundService(context, notificationIntent);
   }
}
```

We can use following `ShadowSettings` to enable `canDrawOverlay` to pass this receiver's checking, and use `ShadowApplication#peekNextStartedService` to get last started service after passing special action to this receiver's `onReceive` method:

```Kotlin
@Test
fun `show hidden Taskbar when receiving ACTION_SHOW_HIDE_TASKBAR`() {
   val intent = Intent(Constants.ACTION_SHOW_HIDE_TASKBAR)
   // Seen things of Shadow.
   ShadowSettings.setCanDrawOverlays(true)
   Shadows.shadowOf(application).clearStartedServices()
   // onReceive will start/notify notification service to show Taskbar.
   // Robolectric will start service for it.
   // hidden thing of Shadow.
   showHideTaskbarReceiver.onReceive(context, intent)
   // Robolectric will store started service component for testing.
   // Another seen thing of Shadow.
   val startedServiceIntent = Shadows.shadowOf(application).peekNextStartedService()
   Assert.assertNotNull(startedServiceIntent)
   Assert.assertEquals(notificationIntent.component, startedServiceIntent.component)
}
```

Robolectric simulates a "real" service starting logic, stores started service to internal fields, and exposure those state with shadow APIs. We can visit Robolectric's online javadoc to check supported shadow APIs, e.g. [Robolectric's 4.7 javadoc][5].

## Multi build system support

Beside of [Gradle][31], [robolectric-bazel][29] is used to support [Bazel][30]. If you are using Bazel for your Android project(I know there are many companies are using Bazel for it), you can use [Bazel's rules_jvm_external][32] to integrate Robolectric:

```Python
http_archive(
    name = "robolectric",
    urls = ["https://github.com/robolectric/robolectric-bazel/archive/4.7.3.tar.gz"],
    strip_prefix = "robolectric-bazel-4.7.3",
)
load("@robolectric//bazel:robolectric.bzl", "robolectric_repositories")
robolectric_repositories()
http_archive(
    name = "rules_jvm_external",
    strip_prefix = "rules_jvm_external-4.1",
    sha256 = "f36441aa876c4f6427bfb2d1f2d723b48e9d930b62662bf723ddfb8fc80f0140",
    url = "https://github.com/bazelbuild/rules_jvm_external/archive/4.1.zip",
)
load("@rules_jvm_external//:defs.bzl", "maven_install")
maven_install(
    artifacts = [
        "org.robolectric:robolectric:4.7.3",
    ],
    repositories = [
        "https://maven.google.com",
        "https://repo1.maven.org/maven2",
    ],
)

android_local_test(
    name = "greeter_activity_test",
    srcs = ["GreeterTest.java"],
    manifest = "TestManifest.xml",
    test_class = "com.example.bazel.GreeterTest",
    deps = [
        ":greeter_activity",
        "@maven//:org_robolectric_robolectric",
        "@robolectric//bazel:android-all",
    ],
)
```

There is [an official example of local_test with robolectric-bazel][33] from rules_jvm_external.

## M1 support

M1 is very popular, Robolectric also knows it. From Robolectric 4.7, it started to support M1 with native SQLite mechanism with massive performance improvement. Many users, including me have run Robolectric on their M1 development machine. If you are using a M1 machine, what about giving a try for Robolectric?

# sharedTest pattern

Google has introduced an interesting project called: Project Nitrogen

![project-nitrogen](/images/project-nitrogen.png)

It aspires to achieve the goal of [Write Once, Run Everywhere Tests on Android][34]. [Robolectirc has supported AndroidX Test from 4.0][20], and [we can use a wide-used pattern called sharedTest pattern to re-structure our tests that can run on Robolectric and Emulator][4].

For example, there is a test class with AndroidX test library, and can run Robolectric and Emulator:

```Java
@RunWith(AndroidJUnit4::class)
class MainActivityCommonTest {
   @Test
   fun clickHintButton_hintViewShouldShowTextHint() {
       ActivityScenario.launch(MainActivity::class.java).use { scenario ->
           scenario.onActivity { activity: MainActivity ->
               val button = activity.findViewById<Button>(R.id.btn_show_hint)
               button.performClick()
               val tvHint = activity.findViewById<TextView>(R.id.tv_hint)
               assertThat(tvHint.text).isEqualTo("Hint")
           }
       }
   }
}
```

The `AndroidJUnit4` can select proper runner based on running environment, e.g. `RobolectricTestRunner` when running on Robolectric and `AndroidJUnit4ClassRunner` when running on Emulator.

We can use following structure to our tests:

```
├── androidTest
│   └── java
│       └── demo
│           └── ExampleInstrumentedTest.kt
├── sharedTest
│   └── java
│       └── demo
│           └── MainActivityCommonTest.kt
└── test
    └── java
        └── demo
            └── MainActivityRobolectricTest.kt
```

And configuring test source with following config:

```Groovy
sourceSets {
   String sharedTestDir = 'src/sharedTest/'
   String sharedTestSourceDir = sharedTestDir + 'java'
   String sharedTestResourceDir = sharedTestDir + 'resources'
   test.resources.srcDirs += sharedTestResourceDir
   test.java.srcDirs += sharedTestSourceDir
   androidTest.resources.srcDirs += sharedTestResourceDir
   androidTest.java.srcDirs += sharedTestSourceDir
}
```

I also recommend to use [ATD + GMD][35] to run tests on Emulator quickly:

```Groovy
import com.android.build.api.dsl.ManagedVirtualDevice

testOptions {
   unitTests.includeAndroidResources = true
   devices {
       // ./gradlew -Pandroid.sdk.channel=3 nexusOneApi30DebugAndroidTest
       nexusOneApi30(ManagedVirtualDevice) {
           device = "Nexus One"
           apiLevel = 30
           systemImageSource = "aosp-atd"
           abi = "x86"
       }
   }
}
```

Now, we can use following commands to run tests on both Robolectric and Emulator:

```shell
./gradlew test
./gradlew -Pandroid.sdk.channel=3 nexusOneApi30DebugAndroidTest
```

It's a long-term goal, and there are massive things left to do, but IMO it deserves a try. Actually, Android Studio doesn't support sharedTest pattern's sharedTest directory, we can star https://issuetracker.google.com/issues/132426298 to raise awareness of shardTest pattern supporting to Android Studio team. 

# Open-source projects use Robolectric

There are many open-source projects use Robolectric for their local tests, and we can check it with link https://github.com/search?q=org.robolectric%3Arobolectric.

1. code: 819K
2. commits: 13K+
3. Issues: 1K+

Before adopting/using Robolectric, we can check how some top open-source projects how to use Robolectric to write tests.

## Flutter

https://github.com/flutter/engine/tree/main/shell/platform/android/test/io/flutter is Flutter's local test directory, and we can show an example of Flutter to use Robolectric to test navigation bar's location for different SDKs and display rotations.

This is Flutter's logic to calculate navigation bar's location: 

```Java
if (orientation == Configuration.ORIENTATION_LANDSCAPE) {
 if (rotation == Surface.ROTATION_90) {
   return ZeroSides.RIGHT;
 } else if (rotation == Surface.ROTATION_270) {
   // In android API >= 23, the nav bar always appears on the "bottom" (USB) side.
   return Build.VERSION.SDK_INT >= 23 ? ZeroSides.LEFT : ZeroSides.RIGHT;
 }
 // Ambiguous orientation due to landscape left/right default. Zero both sides.
 else if (rotation == Surface.ROTATION_0 || rotation == Surface.ROTATION_180) {
   return ZeroSides.BOTH;
 }
}
```

The result depends on display rotation and SDK version. And Flutter uses following two tests to test all behaviors with configuring display and configuring SDK:

```Java
@Test
@Config(minSdk = 20, maxSdk = 22)
public void systemInsetHandlesFullscreenNavbarRightBelowSDK23() {
 RuntimeEnvironment.setQualifiers("+land");
 FlutterView flutterView = spy(new FlutterView(RuntimeEnvironment.systemContext));
 setExpectedDisplayRotation(Surface.ROTATION_270);
 // ...
 flutterView.onApplyWindowInsets(windowInsets);
 // ...
 validateViewportMetricPadding(viewportMetricsCaptor, 100, 0, 0, 0);
}

@Test
@Config(minSdk = 23, maxSdk = 29)
public void systemInsetHandlesFullscreenNavbarRight() {
 RuntimeEnvironment.setQualifiers("+land");
 FlutterView flutterView = spy(new FlutterView(RuntimeEnvironment.systemContext));
 setExpectedDisplayRotation(Surface.ROTATION_90);
 // ...
 flutterView.onApplyWindowInsets(windowInsets);
 // ...
 validateViewportMetricPadding(viewportMetricsCaptor, 100, 0, 0, 0);
}
```
Actually, we can improve those tests by using `@Config` to set `land` qualifier instead of `RuntimeEnvironment.setQualifiers`. Robolectric works with mockito, and Flutter also uses mockito with Robolectric to simply test logic. 

## AOSP

We can check projects that use Robolectric with link https://cs.android.com/search?q=android_robolectric_test&sq=&ss=android. And we will show CarSettings' some tests as an example for AOSP usage.

CarSettings' `ScreenshotContextPreferenceControllerTest` uses real resource supporting to response `Preference`'s state change:

```Java
@Test
public void refreshUi_screenshotDisabled_preferenceUnchecked() {
   mTwoStatePreference.setChecked(true);

   Settings.Secure.putInt(mContext.getContentResolver(),
           Settings.Secure.ASSIST_SCREENSHOT_ENABLED, 0);
   mController.refreshUi();

   assertThat(mTwoStatePreference.isChecked()).isFalse();
}
```

CarSettings' `ErrorDialogTest` also uses real source supporting to response button click action:


```Java
@Test
public void testOkDismissesDialog() {
   ErrorDialog dialog = ErrorDialog.show(mTestFragment, R.string.delete_user_error_title);

   assertThat(isDialogShown()).isTrue(); // Dialog is shown.

   // Invoke cancel.
   DialogTestUtils.clickPositiveButton(dialog);

   assertThat(isDialogShown()).isFalse(); // Dialog is dismissed.
}
```

## Chromium

We can visit https://source.chromium.org/search?q=robolectric_all_java&sq=&ss=chromium to check Chromium's usage of Robolectric.

`ShadowColorUtils` leverages Robolectric's shadow mechanism to shadow its `ColorUtils` methods to provide a fake implementation for its `isNightMode`. And `WebContentsDarkModeControllerUnitTest` adds it to shadow list, and `ShadowColorUtils#isNightMode` is called when normal code calls `ColorUtils#isNightMode`. The following tests use `ShadowColorUtils` to control night mode value, and test related logic.

```Java
/** Shadow class for {@link org.chromium.ui.util.ColorUtils} */
@Implements(ColorUtils.class)
public class ShadowColorUtils {
   public static boolean sInNightMode;

   @Implementation
   public static boolean inNightMode(Context context) {
       return sInNightMode;
   }
}

@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE, shadows = {ShadowRecordHistogram.class, ShadowColorUtils.class})
public class WebContentsDarkModeControllerUnitTest {
    //...
    @Test
    public void testFeatureEnabled() {
        ShadowColorUtils.sInNightMode = true;
        mIsGlobalSettingsEnabled = true;
        Assert.assertTrue(
                "Feature should be enabled, if both global settings and night mode enabled.",
                WebContentsDarkModeController.isFeatureEnabled(mMockContext, mMockProfile));
    }

    @Test
    public void testFeatureEnabled_LightMode() {
        ShadowColorUtils.sInNightMode = false;
        mIsGlobalSettingsEnabled = true;
        Assert.assertFalse("Feature should be disabled when not in night mode.",
                WebContentsDarkModeController.isFeatureEnabled(mMockContext, mMockProfile));
    }

    @Test
    public void testFeatureEnabled_NoUserSettings() {
        ShadowColorUtils.sInNightMode = true;
        mIsGlobalSettingsEnabled = false;
        Assert.assertFalse("Feature should be disabled when global settings disabled.",
                WebContentsDarkModeController.isFeatureEnabled(mMockContext, mMockProfile));
    }
}
```

# Summary

Robolectric is not a perfect solution for local test, but it has massive features and fake implementation of Android frameworks to make running Android tests on JVM come true. The Robolectric team is also trying to improve Robolectric's performance and enrich Robolectric's functionality to provide great experience for developers. If you don't use Robolectric ever before, and above features and examples can attract you, what about using Robolectric to write local tests? Looking forward to receive your feedback about Robolectric.

Robolectric has an official [Twitter account][3], you can follow it if you want to receive latest news about Robolectric.

[1]: <https://github.com/robolectric/robolectric> "Robolectric GitHub repo"
[2]: <http://robolectric.org/> "robolectric.org"
[3]: <https://twitter.com/robolectric/> "Robolectric official Twitter account"
[4]: <http://robolectric.org/blog/2021/10/06/sharedTest/> "sharedTest pattern article"
[5]: <http://robolectric.org/javadoc/4.7/> "Robolectric 4.7 javadoc"
[6]: <https://developer.android.com/training/testing> "Official Android testing training"
[7]: <https://www.amazon.com/Test-Driven-Development-Kent-Beck-dp-0321146530/dp/0321146530> "TEST-DRIVEN DEVELOPMENT BY EXAMPLE by KENT BECK"
[8]: <https://www.amazon.com/Android-Test-Driven-Development-Tutorials-Second/dp/1950325415> "Android Test-Driven Development by Tutorials(Second Edition) by raywenderlich Tutorial Team"
[9]: <https://developer.android.com/training/testing/fundamentals#scope> "Test Scope"
[10]: <https://www.youtube.com/watch?v=WW5TL7070xU> "TDD on Android (DevFest 2019) by Danny Preussler"
[11]: <https://developer.android.com/training/testing/fundamentals/test-doubles#types> "Shadow is another test double in Android"
[12]: <https://developer.android.com/training/testing/fundamentals> "Android Testing Fundamentals"
[13]: <https://martinfowler.com/bliki/TestPyramid.html> "Test pyramid from Martin Fowler"
[14]: <https://martinfowler.com/articles/mocksArentStubs.html> "Mocks Aren't Stubs"
[15]: <https://site.mockito.org/> "Mockito"
[16]: <https://github.com/powermock/powermock> "PowerMock"
[17]: <https://mockk.io/> "MockK"
[18]: <https://developer.android.com/training/testing/fundamentals/test-doubles> "Use test doubles in Android"
[19]: <https://medium.com/androiddevelopers/write-once-run-everywhere-tests-on-android-88adb2ba20c5> "Write Once, Run Everywhere Tests on Android"
[20]: <http://robolectric.org/blog/2018/10/25/robolectric-4-0/> "Robolectric 4.0 Released!"
[21]: <https://developer.android.com/training/testing/local-tests> "Local tests"
[22]: <https://github.com/android/android-test> "AndroidX test"
[23]: <https://github.com/google/truth> "Google Truth"
[24]: <https://junit.org/junit4/> "JUnit4"
[25]: <https://developer.android.com/reference/android/app/Activity#onMultiWindowModeChanged(boolean)> "Activity#onMultiWindowModeChanged(boolean)"
[26]: <https://developer.android.com/reference/android/app/Activity#onMultiWindowModeChanged(boolean,%20android.content.res.Configuration)> "Activity#onMultiWindowModeChanged(boolean, android.content.res.Configuration)"
[27]: <https://developer.android.com/guide/topics/resources/providing-resources.html#QualifierRules> "qualifier rules"
[28]: <https://github.com/flutter/engine/blob/c058dd1896010a03f2dc60056d52b66de0faab26/shell/platform/android/test/io/flutter/embedding/android/FlutterViewTest.java#L1057-L1064> "Flutter's setExpectedDisplayRotation"
[29]: <https://github.com/robolectric/robolectric-bazel> "robolectric-bazel"
[30]: <https://bazel.build/> "Bazel"
[31]: <https://gradle.org/> "Gradle"
[32]: <https://github.com/bazelbuild/rules_jvm_external> "rules_jvm_external"
[33]: <https://github.com/bazelbuild/rules_jvm_external/tree/master/examples/android_local_test> "rules_jvm_external's android_local_test"
[34]: <https://medium.com/androiddevelopers/write-once-run-everywhere-tests-on-android-88adb2ba20c5> "Write Once, Run Everywhere Tests on Android"
[35]: <https://android-developers.googleblog.com/2021/10/whats-new-in-scalable-automated-testing.html> "ATD + GMD"