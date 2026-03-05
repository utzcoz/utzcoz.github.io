---
layout: post
title:  "APKM File Format Spec from APKMirror"
date:   2026-03-01 14:15 +0800
categories: [Android]
tags: [apk, apkmirror, file-format]
---

## 1) Overview

`.apkm` is a file format created by [APKMirror](https://www.apkmirror.com/) to distribute
Android applications that are built using
[Android App Bundle (AAB)](https://developer.android.com/guide/app-bundle). Since Google Play
generates device-specific split APK sets from AAB files at install time, third-party distributors
like APKMirror cannot distribute a single monolithic APK for bundle-based apps. The `.apkm` format
solves this by packaging the base APK together with all available split APKs into a single
distributable archive.

An `.apkm` file is installed on-device using the
[APKMirror Installer](https://www.apkmirror.com/apk/apkmirror/apkmirror-installer-official/)
application or [APKMInstaller](github.com/utzcoz/APKMInstaller) application from me,
or manually via `adb install-multiple`.

## 2) File structure

An `.apkm` file is a standard **ZIP archive** with the `.apkm` file extension. The archive is
signed by APKMirror using JAR signing (`META-INF/`) and contains metadata, an app icon, split APKs,
and an installer URL shortcut.

### 2.1) Real-world example — Google Play Store 50.3.27

The following is the actual structure of `com.android.vending` v50.3.27 distributed by APKMirror
(48.0 MB compressed, 106.3 MB uncompressed, 42 entries):

```
com.android.vending_50.3.27-31_[...].apkm (ZIP archive)
│
│  # Archive-level signing (JAR Signature v1)
├── META-INF/MANIFEST.MF                                  # SHA1 digests of all entries
├── META-INF/APKMIRRO.SF                                  # Signed manifest
├── META-INF/APKMIRRO.RSA                                 # APKMirror certificate (self-signed)
│
│  # Metadata
├── info.json                                              # Package metadata (required)
├── icon.png                                               # App icon, 96x96 PNG (optional)
├── APKM_installer.url                                     # Windows .url shortcut to APKMirror Installer page
│
│  # Base APK
├── base.apk                                               # 53.7 MB uncompressed
│
│  # ABI configuration splits (3 architectures)
├── split_config.arm64_v8a.apk                             # 8.6 MB
├── split_config.armeabi_v7a.apk                           # 5.4 MB
├── split_config.x86.apk                                   # 9.1 MB
│
│  # Language configuration splits (24 languages)
├── split_config.ar.apk
├── split_config.de.apk
├── split_config.en.apk
├── split_config.es.apk
├── split_config.et.apk
├── split_config.fi.apk
├── split_config.fr.apk
├── split_config.hi.apk
├── split_config.hu.apk
├── split_config.in.apk
├── split_config.it.apk
├── split_config.ja.apk
├── split_config.ko.apk
├── split_config.ms.apk
├── split_config.nl.apk
├── split_config.pl.apk
├── split_config.pt.apk
├── split_config.ru.apk
├── split_config.sv.apk
├── split_config.th.apk
├── split_config.tr.apk
├── split_config.uk.apk
├── split_config.vi.apk
├── split_config.zh.apk
│
│  # Dynamic feature module: phonesky_data_loader
├── split_phonesky_data_loader.apk                         # Module base (16 KB)
├── split_phonesky_data_loader.config.arm64_v8a.apk        # Module ABI split
├── split_phonesky_data_loader.config.armeabi_v7a.apk
├── split_phonesky_data_loader.config.x86.apk
│
│  # Dynamic feature module: phonesky_webrtc_native_lib
├── split_phonesky_webrtc_native_lib.apk                   # Module base (16 KB)
├── split_phonesky_webrtc_native_lib.config.arm64_v8a.apk  # Module ABI split (6.6 MB)
├── split_phonesky_webrtc_native_lib.config.armeabi_v7a.apk
└── split_phonesky_webrtc_native_lib.config.x86.apk
```

### 2.2) Compression

Most entries use `DEFLATED` compression. Only small non-APK assets (`icon.png`,
`APKM_installer.url`) are `STORED` uncompressed. In this example, DEFLATED achieves ~47%
compression on the contained APK files (106 MB → 48 MB).

| Method | Entry count | Usage |
|---|---|---|
| `DEFLATED` | 40 | All `.apk` files, `info.json`, `META-INF/*` |
| `STORED` | 2 | `icon.png`, `APKM_installer.url` |

### 2.3) Archive-level signing

The `.apkm` archive itself is signed using JAR Signature (v1) by APKMirror. The `META-INF/`
directory contains:

| File | Description |
|---|---|
| `MANIFEST.MF` | SHA1 digest of every entry in the archive |
| `APKMIRRO.SF` | Signed copy of the manifest |
| `APKMIRRO.RSA` | Self-signed X.509 certificate from `O=APKMirror.com, C=US, ST=California` |

This allows installers to verify that the archive contents have not been tampered with after
distribution by APKMirror.

### 2.4) Naming conventions

| Entry type | Naming pattern | Example |
|---|---|---|
| Base APK | `base.apk` | `base.apk` |
| ABI split | `split_config.<abi>.apk` | `split_config.arm64_v8a.apk` |
| Density split | `split_config.<density>.apk` | `split_config.xxhdpi.apk` |
| Language split | `split_config.<lang>.apk` | `split_config.en.apk` |
| Feature module | `split_<module>.apk` | `split_phonesky_data_loader.apk` |
| Feature module config | `split_<module>.config.<type>.apk` | `split_phonesky_data_loader.config.arm64_v8a.apk` |

The naming follows the conventions used by Android's
[bundletool](https://github.com/google/bundletool) when generating APK sets from AAB files.

## 3) Metadata — `info.json`

The `.apkm` archive includes an `info.json` file at the root of the archive. This JSON file
describes the package, its available configurations, and APKMirror-specific distribution metadata.

### 3.1) Real-world example — Google Play Store 50.3.27

```json
{
    "apkm_version": 5,
    "apk_title": "Google Play Store 50.3.27-31 [0] [PR] 875414499 (nodpi) (Android 12L+)",
    "app_name": "Google Play Store",
    "release_version": "50.3.27-31 [0] [PR] 875414499",
    "variant": "(universal) (nodpi) (Android 12L+)",
    "release_title": "Google Play Store 50.3.27-31 [0] [PR] 875414499 (nodpi) (Android 12L+)",
    "versioncode": "85032730",
    "pname": "com.android.vending",
    "post_date": "2026-02-27 00:48:12",
    "capabilities": [
        "auto",
        "cardboard"
    ],
    "languages": [
        "ar", "de", "en", "es", "et", "fi", "fr", "hi", "hu", "in",
        "it", "ja", "ko", "ms", "nl", "pl", "pt", "ru", "sv", "th",
        "tr", "uk", "vi", "zh"
    ],
    "arches": [
        "arm64-v8a",
        "armeabi-v7a",
        "x86"
    ],
    "dpis": [
        "nodpi"
    ],
    "min_api": "32",
    "accent_color": "4084f4",
    "apk_id": 12692714,
    "release_id": 12691902
}
```

### 3.2) Field definitions

#### Core fields

| Field | Type | Required | Description |
|---|---|---|---|
| `apkm_version` | integer | Yes | Format version. Known values: `1` through `5`. |
| `pname` | string | Yes | Android package name (application ID). e.g., `"com.android.vending"`. |
| `versioncode` | string | Yes | `versionCode` from the base APK's `AndroidManifest.xml`. Note: encoded as a **string**, not integer. |
| `app_name` | string | Yes | Human-readable application name. |
| `min_api` | string | Yes | Minimum Android API level required. Encoded as a **string**. e.g., `"32"` for Android 12L. |

#### Configuration fields

| Field | Type | Required | Description |
|---|---|---|---|
| `arches` | string[] | No | CPU architectures included. Values: `"arm64-v8a"`, `"armeabi-v7a"`, `"x86"`, `"x86_64"`. |
| `dpis` | string[] | No | Screen density qualifiers. e.g., `["nodpi"]`, `["xxhdpi"]`, `["120dpi", "480dpi"]`. `"nodpi"` indicates density-independent (no density splits). |
| `languages` | string[] | No | BCP 47 language tags for included language splits. |
| `capabilities` | string[] | No | Device capabilities or form factors. Observed values: `"auto"` (Android Auto), `"cardboard"` (Google Cardboard VR). |

#### Distribution metadata (APKMirror-specific)

| Field | Type | Required | Description |
|---|---|---|---|
| `apk_title` | string | No | Full title of the APK listing on APKMirror. |
| `release_version` | string | No | Version string as displayed on APKMirror. |
| `release_title` | string | No | Full release title on APKMirror. |
| `variant` | string | No | Variant descriptor. e.g., `"(universal) (nodpi) (Android 12L+)"`. |
| `post_date` | string | No | UTC timestamp of the APKMirror publication. Format: `"YYYY-MM-DD HH:MM:SS"`. |
| `accent_color` | string | No | Hex color code (without `#`) for UI theming. e.g., `"4084f4"`. |
| `apk_id` | integer | No | Internal APKMirror identifier for this specific APK variant. |
| `release_id` | integer | No | Internal APKMirror identifier for the release. |

## 4) Format versions

| Version | Key changes |
|---|---|
| 1 | Original format. Plain ZIP with only APK files — no `info.json`. |
| 2 | Adds `info.json` with basic fields (`pname`, `versioncode`, `arches`, `languages`). |
| 3–4 | Intermediate revisions (details unconfirmed). |
| 5 | Current version (observed Feb 2026). Adds `capabilities`, `dpis`, `min_api`, `accent_color`, `apk_id`, `release_id`, `icon.png`, `APKM_installer.url`, and archive-level JAR signing. |

For version 1 archives (no `info.json`), the installer must parse `AndroidManifest.xml` from each
contained APK to determine package name, version, and split configuration.

## 5) Split APK types

The split APKs within an `.apkm` file correspond to Android's split APK mechanism introduced in
Android 5.0 (API 21). The following split types may be present:

### 5.1) ABI splits

Contain native libraries (`.so` files) for a specific CPU architecture.

| ABI | Description |
|---|---|
| `armeabi-v7a` | 32-bit ARM |
| `arm64-v8a` | 64-bit ARM (most common) |
| `x86` | 32-bit x86 (emulators) |
| `x86_64` | 64-bit x86 (emulators, some Chromebooks) |

### 5.2) Screen density splits

Contain drawable resources for a specific screen density.

| Density | DPI | Qualifier |
|---|---|---|
| `ldpi` | ~120 | `split_config.ldpi.apk` |
| `mdpi` | ~160 | `split_config.mdpi.apk` |
| `hdpi` | ~240 | `split_config.hdpi.apk` |
| `xhdpi` | ~320 | `split_config.xhdpi.apk` |
| `xxhdpi` | ~480 | `split_config.xxhdpi.apk` |
| `xxxhdpi` | ~640 | `split_config.xxxhdpi.apk` |
| `tvdpi` | ~213 | `split_config.tvdpi.apk` |

### 5.3) Language splits

Contain string resources and other locale-specific resources for a particular language or locale.
In the Google Play Store example, 24 language splits are included:

`ar`, `de`, `en`, `es`, `et`, `fi`, `fr`, `hi`, `hu`, `in`, `it`, `ja`, `ko`, `ms`, `nl`, `pl`,
`pt`, `ru`, `sv`, `th`, `tr`, `uk`, `vi`, `zh`

Language split sizes range from ~340 KB (`split_config.et.apk`) to ~860 KB (`split_config.zh.apk`).

### 5.4) Dynamic feature modules

Contain code and resources for on-demand or install-time feature modules defined in the app's
`build.gradle`. These follow the pattern `split_<module_name>.apk` and may have their own
ABI configuration splits.

In the Google Play Store example, two feature modules are present:

| Module | Base split | ABI config splits |
|---|---|---|
| `phonesky_data_loader` | `split_phonesky_data_loader.apk` (16 KB) | `split_phonesky_data_loader.config.{arm64_v8a,armeabi_v7a,x86}.apk` |
| `phonesky_webrtc_native_lib` | `split_phonesky_webrtc_native_lib.apk` (16 KB) | `split_phonesky_webrtc_native_lib.config.{arm64_v8a,armeabi_v7a,x86}.apk` (4–8 MB each) |

The `phonesky_webrtc_native_lib` module's ABI splits are notably large (6.6 MB for arm64-v8a)
because they contain the WebRTC native library.

## 6) Installation

### 6.1) Using APKMirror Installer

The recommended method. The APKMirror Installer app:

1. Opens the `.apkm` file and reads `info.json` (or parses APKs directly for v1).
2. Selects the appropriate splits for the device (matching ABI, density, and language).
3. Installs the base APK and selected splits using the Android
   [PackageInstaller](https://developer.android.com/reference/android/content/pm/PackageInstaller)
   session API (`createSession` → `openSession` → `openWrite` for each APK → `commit`).

### 6.2) Using APKMInstaller

[APKMInstaller](https://github.com/utzcoz/APKMInstaller) is an open-source, ads-free alternative
installer for `.apkm` files. Built with Kotlin and Jetpack Compose (Material You), it provides:

1. **File picker or intent-based opening** — browse with the system file picker or tap an `.apkm`
   file in any file manager.
2. **Package preview** — displays app icon, name, package name, version, size, split count, and
   declared permissions before installing.
3. **Step-by-step progress** — animated Extract → Verify → Install flow with success/failure states.
4. **Split installation** — extracts all APKs to a temporary cache directory and installs them
   together as a single split-APK session using the Android
   [PackageInstaller](https://developer.android.com/reference/android/content/pm/PackageInstaller)
   API.

Requirements: Android 8.0 (API 26)+, "Install unknown apps" permission granted.

### 6.3) Using adb

For manual installation, extract the archive and use `adb install-multiple`. You must select only
the splits matching your target device:

```bash
# Extract the .apkm file (rename to .zip if your tool doesn't recognize .apkm)
unzip com.android.vending_50.3.27-31_*.apkm -d playstore/

# Install on an arm64 device with English language
adb install-multiple \
    playstore/base.apk \
    playstore/split_config.arm64_v8a.apk \
    playstore/split_config.en.apk \
    playstore/split_phonesky_data_loader.apk \
    playstore/split_phonesky_data_loader.config.arm64_v8a.apk \
    playstore/split_phonesky_webrtc_native_lib.apk \
    playstore/split_phonesky_webrtc_native_lib.config.arm64_v8a.apk
```

> **Note:** When using `adb install-multiple`, you must only include the ABI splits that match your
> target device. Including mismatched ABI splits (e.g., `x86` on an ARM device) will cause
> installation to fail. Language splits for non-installed languages are harmless but unnecessary.
> Feature module base splits and their matching ABI config splits should be included together.

### 6.4) Programmatic installation (Android)

The following code is derived from
[APKMInstaller](https://github.com/utzcoz/APKMInstaller)'s implementation. The full process has
three stages: **extract**, **verify**, and **install**.

#### Stage 1 — Extract APKs from the `.apkm` ZIP

```kotlin
// Open the .apkm file via ContentResolver (works with file pickers, intent shares, etc.)
val apkFiles = mutableListOf<File>()
var totalBytes = 0L
val maxBytes = 2L * 1024 * 1024 * 1024 // 2 GB safety cap

context.contentResolver.openInputStream(apkmUri)?.use { stream ->
    ZipInputStream(stream).use { zip ->
        var entry = zip.nextEntry
        while (entry != null) {
            if (!entry.isDirectory && entry.name.endsWith(".apk")) {
                val outFile = File(cacheDir, entry.name.substringAfterLast('/'))
                outFile.parentFile?.mkdirs()
                FileOutputStream(outFile).use { out ->
                    val written = zip.copyTo(out, bufferSize = 65_536)
                    totalBytes += written
                    require(totalBytes <= maxBytes) { "Package exceeds size limit" }
                }
                apkFiles += outFile
            }
            zip.closeEntry()
            entry = zip.nextEntry
        }
    }
}

// Sort so base.apk is always first
apkFiles.sortWith(compareBy { if (it.name == "base.apk") 0 else 1 })
```

#### Stage 2 — Verify base.apk

```kotlin
val baseApk = apkFiles.first()
val flags = PackageManager.GET_PERMISSIONS or PackageManager.GET_META_DATA
val packageInfo = context.packageManager
    .getPackageArchiveInfo(baseApk.absolutePath, flags)
    ?: throw IllegalArgumentException("Cannot parse base.apk")

// Set sourceDir so the system can load the app icon and label
packageInfo.applicationInfo?.let {
    it.sourceDir = baseApk.absolutePath
    it.publicSourceDir = baseApk.absolutePath
}
```

#### Stage 3 — Install via PackageInstaller session API

```kotlin
val installer = context.packageManager.packageInstaller

// 1. Create a session
val params = SessionParams(SessionParams.MODE_FULL_INSTALL).apply {
    setInstallReason(PackageManager.INSTALL_REASON_USER)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        setRequireUserAction(SessionParams.USER_ACTION_NOT_REQUIRED)
    }
}
val sessionId = installer.createSession(params)

// 2. Write each split APK into the session
installer.openSession(sessionId).use { session ->
    apkFiles.forEachIndexed { index, file ->
        session.openWrite("split_$index.apk", 0, file.length()).use { out ->
            file.inputStream().use { input -> input.copyTo(out) }
            session.fsync(out) // Ensure write is flushed to disk
        }
    }

    // 3. Commit — the system will prompt the user for confirmation
    val action = "com.example.INSTALL_RESULT_$sessionId"
    val pendingIntent = PendingIntent.getBroadcast(
        context, sessionId,
        Intent(action).setPackage(context.packageName),
        PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    session.commit(pendingIntent.intentSender)
}
```

The commit triggers a system callback via the `PendingIntent`. The callback delivers one of:

| Status | Meaning |
|---|---|
| `STATUS_PENDING_USER_ACTION` | System needs user confirmation — launch the `Intent` from `EXTRA_INTENT` as an Activity. |
| `STATUS_SUCCESS` | Installation completed successfully. |
| `STATUS_FAILURE*` | Installation failed — check `EXTRA_STATUS_MESSAGE` for details. |

> **Source:** Simplified from
> [`SplitApkInstaller.kt`](https://github.com/utzcoz/APKMInstaller/blob/main/app/src/main/kotlin/com/apkm/installer/data/SplitApkInstaller.kt)
> and
> [`ApkmParser.kt`](https://github.com/utzcoz/APKMInstaller/blob/main/app/src/main/kotlin/com/apkm/installer/data/ApkmParser.kt)
> in APKMInstaller.

## 7) Relationship to other formats

| Format | Extension | Source | Description |
|---|---|---|---|
| APK | `.apk` | Standard Android | Single installable package (ZIP with DEX, resources, manifest, signature). |
| AAB | `.aab` | Google (App Bundle) | Publishing format uploaded to Google Play; not directly installable. |
| APKS | `.apks` | bundletool | ZIP of split APKs generated by `bundletool build-apks`. Contains `toc.pb` (protobuf table of contents). |
| APKM | `.apkm` | APKMirror | ZIP of split APKs with `info.json` metadata. Designed for redistribution. |
| XAPK | `.xapk` | APKPure | Similar concept; ZIP containing `manifest.json` and split APKs with OBB files support. |

### 7.1) APKM vs APKS

Both formats package split APKs into a ZIP archive, but they differ in metadata format:

- **APKS** uses `toc.pb`, a Protocol Buffers file generated by bundletool, which includes detailed
  targeting information (SDK version ranges, device tiers, etc.).
- **APKM** uses `info.json`, a simpler JSON manifest focused on distribution metadata. It does not
  include granular targeting rules — split selection is handled by the installer at install time.

## 8) MIME type and file association

| Property | Value |
|---|---|
| File extension | `.apkm` |
| MIME type | `application/vnd.apkm` (unofficial, used by APKMirror Installer) |
| Magic bytes | `PK` (`50 4B 03 04`) — standard ZIP magic number |

Since `.apkm` is a ZIP file, standard ZIP tools can open and inspect its contents. The `.apkm`
extension serves as a hint for the APKMirror Installer to register as a handler.

## 9) Security considerations

- **Archive-level signing:** Starting from version 5, the `.apkm` archive itself is signed using JAR
  Signature v1 (`META-INF/APKMIRRO.{RSA,SF}` + `MANIFEST.MF`). The certificate is self-signed by
  APKMirror (`O=APKMirror.com, C=US, ST=California, L=San Francisco`). Installers can verify the
  archive integrity by checking these signatures.
- **APK-level signing:** Each APK within the archive is individually signed using Android's APK
  signing scheme (v1/v2/v3/v4). Installers should verify APK signatures before installation.
- **Package consistency:** All split APKs must be signed with the same certificate as the base APK.
  The Android package manager enforces this during installation.
- **Integrity:** Users should download `.apkm` files only from trusted sources. APKMirror performs
  its own signature verification before publishing.

## 10) References

- [APKMirror](https://www.apkmirror.com/) — The origin of the `.apkm` format.
- [APKMirror Installer](https://www.apkmirror.com/apk/apkmirror/apkmirror-installer-official/) —
  Official installer for `.apkm` files.
- [Android App Bundle documentation](https://developer.android.com/guide/app-bundle) — Google's
  documentation on the AAB format and split APKs.
- [bundletool](https://github.com/google/bundletool) — Google's tool for building and inspecting
  app bundles and APK sets.
- [Split APKs](https://developer.android.com/studio/build/configure-apk-splits) — Android
  documentation on APK splitting.
- [PackageInstaller API](https://developer.android.com/reference/android/content/pm/PackageInstaller) —
  Android API for installing split APK sessions.

> **Disclaimer:** This document is an **unofficial** specification based on publicly observable
> behavior of `.apkm` files distributed by APKMirror and the APKMirror Installer application.
> APKMirror has not published a formal specification. Details may change without notice.
