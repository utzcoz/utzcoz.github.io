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

For unit test, there are many awesome mock tools for Android: [Mockito][15], [PowerMock][16], and [MockK][7]. But if you want to use fake style tool for Android unit test, Robolectric is a good choice, as [Roboletric's shadow is one type of Android's fake implementation][11]. [New Android testing tutorial prefers to fake style instead of mock style for Android testing][18], and Robolectric is trying to improve its performance to reduce overload when using Robolectric to write unit test, e.g. instrumented android-all jars. Robolectric also supports those mock tools on many occasions when Robolectric's shadow doesn't meet your requirement.

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

# TTD for Android 

![test development cycle](/images/android-test-development-cycle.png)

![TEST-DRIVEN DEVELOPMENT BY EXAMPLE by KENT BECK](https://images-na.ssl-images-amazon.com/images/I/41pO5GqNtzL._SX258_BO1,204,203,200_.jpg)

![Android Test-Driven Development by Tutorials(Second Edition) by raywenderlich Tutorial Team](https://images-na.ssl-images-amazon.com/images/I/511LuHGlfqL._SX404_BO1,204,203,200_.jpg)


<iframe width="500" height="500" src="https://www.youtube.com/embed/WW5TL7070xU" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>


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