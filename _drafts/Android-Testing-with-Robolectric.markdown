---
layout: post
title:  "Android Testing with Robolectric"
date:   2022-01-01 12:47 +0800
---

[Robolectric][1] is the industry-standard unit testing framework for Android. With Robolectric, your tests run in a simulated Android environment inside a JVM, without the overhead and flakiness of an emulator. I have used it and contributed to it very much, and think it is very useful tool for Android app's native testing. This article will explain the reason why we can consider Robolectric, and some practices that I want to recommend when using Robolectric, e.g. sharedTest pattern.

# Test Pyramid

![Test pyramid](/images/android-test-pyramid.png)

![TEST-DRIVEN DEVELOPMENT BY EXAMPLE by KENT BECK](https://images-na.ssl-images-amazon.com/images/I/41pO5GqNtzL._SX258_BO1,204,203,200_.jpg)


![Android Test-Driven Development by Tutorials(Second Edition) by raywenderlich Tutorial Team](https://images-na.ssl-images-amazon.com/images/I/511LuHGlfqL._SX404_BO1,204,203,200_.jpg)


<iframe width="500" height="500" src="https://www.youtube.com/embed/WW5TL7070xU" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

# Test Scope

![Test Scope](/images/android-test-scopes.png)

> Tests also vary depending on size, or degree of isolation:
> 1. Unit tests or small tests only verify a very small portion of the app, such as a method or class.
> 2. End-to-end tests or big tests verify larger parts of the app at the same time, such as a whole screen or user flow.
> 3. Medium tests are in between and check the integration between two or more units.


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