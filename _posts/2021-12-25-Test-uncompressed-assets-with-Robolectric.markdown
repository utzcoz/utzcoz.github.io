---
layout: post
title:  "Test uncompressed assets with Robolectric"
date:   2021-12-25 16:30 +0800
---

This article is very short and just used to show how to test uncompressed assets with Robolectric. What you need do is very simple:

1. Using Robolectric from 4.7(4.7.3 is the best recommended version currently with other big improvements). It contains changes to support opening fd from uncompressed file in apk. We can check [Support to open fd for uncompressed file in asset](https://github.com/robolectric/robolectric/pull/6649) and [FileNotFoundException when opening AssetFileDescriptor](https://github.com/robolectric/robolectric/issues/5442) for more details.
2. Using `aaptOptions.noCompress` to specify extension of files you don't want to be compressed. We can check [official documentation of AaptOptions#noCompress](https://developer.android.com/reference/tools/gradle-api/4.2/com/android/build/api/dsl/AaptOptions#nocompress) for more details.
3. Using AGP from 7.1.0-alpha08(including) to support `aaptOptions#noCompress` for unit tests. Before AGP 7.1.0-alpha08, it has a bug to compress all assets for unit tests, and we can check [AGP compresses all assets for unit test .apk regardless of aaptOptions.noCompress](https://issuetracker.google.com/issues/186418206) for more details.

After that, we can write test code looks like:

```java
@RunWith(AndroidJUnit4.class)
public class ExampleUnitTest {
    @Test
    public void openFd_shouldProvideFileDescriptorForAsset() throws IOException {
        Context context = ApplicationProvider.getApplicationContext();
        AssetManager assetManager = context.getAssets();
        AssetFileDescriptor assetFileDescriptor = assetManager.openFd("assetsHome.txt");
        assertThat(CharStreams.toString(new InputStreamReader(
                assetFileDescriptor.createInputStream(), Charset.forName("UTF-8"))))
                .isEqualTo("assetsHome!");
        assertThat(assetFileDescriptor.getLength()).isEqualTo(11);
    }
}
```