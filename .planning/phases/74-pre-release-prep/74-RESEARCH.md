# Phase 74: Pre-Release Prep - Research

**Researched:** 2026-03-21
**Domain:** Capacitor v7-to-v8 migration, Android production hardening, Play Store readiness
**Confidence:** HIGH

## Summary

Phase 74 upgrades the native Capacitor project from v7 to v8, establishes version management for Play Store releases, and hardens the Android app for production. The codebase is in good shape: the main `package.json` already runs Capacitor v8 plugins, so the mismatch is isolated to `src-capacitor/package.json` which pins v7 native dependencies. The upgrade path is well-documented by Capacitor with a CLI migration tool (`npx cap migrate`) that handles most changes automatically.

One critical finding: **Capacitor 8 requires minSdkVersion 24**, not 23. The CONTEXT.md states "keep minSdk 23" but this is incompatible with Capacitor 8. The bump from 23 to 24 drops Android 6.0 (Marshmallow) support, retaining Android 7.0+ (Nougat). Given that Android 6.0 has ~0.5% market share and is 10+ years old, this is a non-issue for a gym app targeting Argentina and Barcelona. Additionally, compileSdkVersion and targetSdkVersion must increase from 35 to 36, and the AGP must update from 8.7.2 to 8.13.0 with Gradle wrapper 8.14.3.

**Primary recommendation:** Run `npx cap migrate` in `src-capacitor/` to automate the bulk of changes, then manually apply production hardening (ProGuard, network security config, CAMERA permission, versionCode from CI).

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- First Play Store release is **v1.0.0** -- clean slate for public perception
- `package.json` version aligned to 1.0.0 (single source of truth across app + Android)
- `versionCode`: auto-increment via GitHub Actions CI run number -- never manual
- `versionName`: manually bumped in `build.gradle` for meaningful releases
- Play Store releases are intentional milestone events, not tied to every deploy
- Upgrade native project (`src-capacitor/package.json`) from v7 to v8
- Include iOS native plugins in the upgrade (same package.json)
- Disable `usesCleartextTraffic` for production flavor; staging keeps it enabled
- Add network security config with `*.eltemplo.org` domain whitelist for production
- Enable ProGuard/R8 minification for release builds (`minifyEnabled true`), production flavor only
- Same Sentry project for mobile as web production
- Add CAMERA permission for QR check-in
- Staging workflow must not regress

### Claude's Discretion

- Exact ProGuard rules needed for Capacitor plugins
- Network security config XML structure
- How to wire versionCode from CI run number into Gradle build
- Capacitor v8 migration specifics (Gradle version bumps, config changes)

### Deferred Ideas (OUT OF SCOPE)

- Full app polish phase (separate Phase 76.1)
- Push notifications (Firebase Cloud Messaging)
- Privacy policy page (Phase 76)
- Play Store screenshots (Phase 76)
- Store listing language
- App update strategy

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                                          | Research Support                                                                                                                                                                                         |
| ------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PLAY-01 | Capacitor version alignment -- CLI (v8) and native plugins (v7.4.5) on same major version            | Capacitor v8 migration guide fully researched; `npx cap migrate` handles most changes; version bumps for variables.gradle, build.gradle, Gradle wrapper documented                                       |
| PLAY-02 | Version management strategy -- `versionCode` auto-increments per build, `versionName` follows semver | GitHub Actions `${{ github.run_number }}` pattern documented; Gradle `build.gradle` changes to read from CI env var documented                                                                           |
| PLAY-03 | App metadata audit -- app name, package ID, icon, splash screen production-ready                     | Current state audited: app name "El Templo", package ID `com.eltemplo.app`, icons/splash already generated via @capacitor/assets from source logos                                                       |
| PLAY-04 | Android permissions audit -- only necessary permissions declared                                     | Current manifest has only INTERNET; CAMERA needed for html5-qrcode (confirmed: uses getUserMedia via WebView, Capacitor BridgeWebChromeClient handles permission prompt, but CAMERA must be in manifest) |

</phase_requirements>

## Standard Stack

### Core (Already in project -- version upgrades only)

| Package                           | Current                      | Target | Purpose                  |
| --------------------------------- | ---------------------------- | ------ | ------------------------ |
| `@capacitor/core`                 | 7.4.5 (native) / 8.0.1 (app) | 8.2.0  | Capacitor runtime        |
| `@capacitor/cli`                  | 7.0.0 (native) / 8.1.0 (app) | 8.2.0  | CLI tooling              |
| `@capacitor/android`              | 7.4.5                        | 8.2.0  | Android native bridge    |
| `@capacitor/ios`                  | 7.4.5                        | 8.2.0  | iOS native bridge        |
| `@capacitor/app`                  | 7.0.0 (native) / 8.0.0 (app) | 8.0.1  | App lifecycle plugin     |
| `@capacitor/preferences`          | 7.0.3 (native) / 8.0.0 (app) | 8.0.1  | Key-value storage plugin |
| `@capacitor/haptics`              | 8.0.0 (app only)             | 8.0.1  | Haptic feedback          |
| `@capacitor-community/keep-awake` | 8.0.0 (app only)             | 8.0.0  | Screen keep-awake        |

### Android Build Toolchain (version bumps required)

| Component              | Current | Target | Source                      |
| ---------------------- | ------- | ------ | --------------------------- |
| Android Gradle Plugin  | 8.7.2   | 8.13.0 | Capacitor 8 migration guide |
| Gradle wrapper         | 8.11.1  | 8.14.3 | Capacitor 8 migration guide |
| google-services plugin | 4.4.2   | 4.4.4  | Capacitor 8 migration guide |
| minSdkVersion          | 23      | 24     | Capacitor 8 requirement     |
| compileSdkVersion      | 35      | 36     | Capacitor 8 requirement     |
| targetSdkVersion       | 35      | 36     | Capacitor 8 requirement     |

**Note on targetSdkVersion 36:** Play Store requires targetSdkVersion 35+ for new app submissions as of 2025. Capacitor 8 targets 36, which exceeds the requirement.

### variables.gradle Target Values

| Variable                           | Current  | Target   |
| ---------------------------------- | -------- | -------- |
| `minSdkVersion`                    | 23       | 24       |
| `compileSdkVersion`                | 35       | 36       |
| `targetSdkVersion`                 | 35       | 36       |
| `androidxActivityVersion`          | '1.9.2'  | '1.11.0' |
| `androidxAppCompatVersion`         | '1.7.0'  | '1.7.1'  |
| `androidxCoordinatorLayoutVersion` | '1.2.0'  | '1.3.0'  |
| `androidxCoreVersion`              | '1.15.0' | '1.17.0' |
| `androidxFragmentVersion`          | '1.8.4'  | '1.8.9'  |
| `coreSplashScreenVersion`          | '1.0.1'  | '1.2.0'  |
| `androidxWebkitVersion`            | '1.12.1' | '1.14.0' |
| `androidxJunitVersion`             | '1.2.1'  | '1.3.0'  |
| `androidxEspressoCoreVersion`      | '3.6.1'  | '3.7.0'  |
| `cordovaAndroidVersion`            | '10.1.1' | '14.0.1' |

**Version verification date:** 2026-03-21 (npm registry)

### No New Dependencies Required

All changes are version bumps to existing dependencies. No new libraries are needed.

## Architecture Patterns

### Current Build Architecture

```
el-templo-app/
  package.json              # Main app: Vue/Quasar + Capacitor v8 plugins
  src-capacitor/
    package.json            # Native deps: Capacitor v7 (THE MISMATCH)
    capacitor.config.ts     # Dynamic staging/production identity
    assets/                 # Source logos for icon/splash generation
    android/
      build.gradle          # Root: AGP 8.7.2, google-services
      variables.gradle      # SDK versions, AndroidX versions
      gradle/wrapper/        # Gradle 8.11.1
      app/
        build.gradle        # App: product flavors, versionCode/Name
        proguard-rules.pro  # Empty (boilerplate comments only)
        src/main/
          AndroidManifest.xml   # INTERNET only, cleartextTraffic=true
          res/                  # Icons (mipmap), splash (drawable)
    ios/
      App/
        Podfile             # CocoaPods with v7 paths
```

### Pattern 1: Product Flavor Manifest Overlays

**What:** Per-flavor `AndroidManifest.xml` overrides for production vs staging
**When to use:** To disable `usesCleartextTraffic` for production while keeping it for staging
**Example:**

```
android/app/src/
  main/AndroidManifest.xml          # Base: INTERNET, CAMERA permissions
  staging/AndroidManifest.xml       # Override: usesCleartextTraffic="true"
  production/AndroidManifest.xml    # Override: usesCleartextTraffic="false", networkSecurityConfig
```

The main manifest should NOT set `usesCleartextTraffic` at all -- let each flavor overlay define it. Android's manifest merger combines them.

### Pattern 2: versionCode from CI Environment Variable

**What:** Gradle reads `VERSION_CODE` env var from CI, falls back to 1 for local builds
**When to use:** Always for production workflows
**Example:**

```groovy
defaultConfig {
    versionCode (System.getenv("VERSION_CODE") ?: "1").toInteger()
    versionName "1.0.0"
}
```

In GitHub Actions:

```yaml
env:
  VERSION_CODE: ${{ github.run_number }}
```

### Pattern 3: Network Security Config for Production

**What:** XML-based domain whitelist replacing the global `usesCleartextTraffic` flag
**When to use:** Production flavor to restrict network traffic to HTTPS only, with domain-specific exceptions if needed
**Example file** `android/app/src/production/res/xml/network_security_config.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
```

No domain whitelist needed -- `*.eltemplo.org` uses HTTPS. The config just enforces "no cleartext anywhere."

### Anti-Patterns to Avoid

- **Setting usesCleartextTraffic in main manifest:** Use flavor overlays instead. The main manifest should be flavor-agnostic.
- **Hardcoding versionCode:** Never manually increment. Always derive from CI.
- **Running `npx cap migrate` without checking native project state:** Always commit before running migrate, as it modifies files in-place.

## Don't Hand-Roll

| Problem                            | Don't Build                    | Use Instead                                                                | Why                                                                                     |
| ---------------------------------- | ------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Capacitor v7-to-v8 migration       | Manual file-by-file edits      | `npx cap migrate` CLI                                                      | Handles package.json, Gradle, Podfile, variables.gradle, settings changes automatically |
| Icon/splash generation             | Manual resizing of images      | `npx @capacitor/assets generate`                                           | Generates all density variants from source images                                       |
| ProGuard rules for Capacitor       | Custom keep rules from scratch | Capacitor's bundled `proguard-rules.pro` (ships with `@capacitor/android`) | Already covers plugin annotations, PluginMethod, BridgeActivity                         |
| WebView camera permission handling | Custom WebChromeClient         | Capacitor's `BridgeWebChromeClient`                                        | Already implements `onPermissionRequest` with proper permission launcher flow           |

**Key insight:** Capacitor's `BridgeWebChromeClient` already handles the `getUserMedia` -> `onPermissionRequest` -> native permission prompt flow. The only requirement from our side is declaring `<uses-permission android:name="android.permission.CAMERA" />` in the manifest so the runtime permission prompt can fire.

## Common Pitfalls

### Pitfall 1: Version Mismatch After Partial Migration

**What goes wrong:** Running `npx cap migrate` in `src-capacitor/` updates `package.json` but `pnpm install` resolves different versions than expected, or `cap sync` fails because lockfile is stale.
**Why it happens:** pnpm's strict dependency resolution + monorepo structure.
**How to avoid:** After `npx cap migrate`: (1) run `pnpm install` to regenerate lockfile, (2) run `npx cap sync android` and `npx cap sync ios`, (3) verify with `npx cap doctor`.
**Warning signs:** `npx cap doctor` reports version mismatches; `capacitor.settings.gradle` still references v7 paths.

### Pitfall 2: minSdkVersion Conflict

**What goes wrong:** Capacitor 8 requires minSdkVersion 24 but CONTEXT.md says "keep minSdk 23." Using 23 with Capacitor 8 will cause build failures.
**Why it happens:** The v7-era project used minSdk 23. Capacitor 8 dropped Android 6.0 support.
**How to avoid:** Accept minSdkVersion 24. Android 6.0 (Marshmallow) has negligible market share (~0.5% globally) and is irrelevant for a gym app.
**Warning signs:** Build errors mentioning "minSdkVersion" or "uses-sdk:minSdkVersion".

### Pitfall 3: ProGuard Breaking WebView Bridge

**What goes wrong:** R8 minification strips Capacitor bridge classes or plugin methods, causing runtime crashes (methods not found, reflection failures).
**Why it happens:** R8 sees Capacitor plugin methods as unused because they're called via reflection from JavaScript.
**How to avoid:** Capacitor v8's `@capacitor/android` package bundles ProGuard consumer rules that automatically apply during release builds. The existing `proguard-rules.pro` in the app module is additive. Verify by building a release APK locally and testing basic flows.
**Warning signs:** App launches but plugins don't respond; `PluginMethod not found` errors in logcat.

### Pitfall 4: Missing Density in ConfigChanges

**What goes wrong:** Capacitor 8 requires `|density` appended to the activity's `android:configChanges` attribute. Without it, the activity restarts on display density changes (foldables, display settings).
**Why it happens:** New Capacitor 8 requirement for modern Android displays.
**How to avoid:** Add `|density` to the `configChanges` attribute in `AndroidManifest.xml`.
**Warning signs:** App restarts unexpectedly when switching display modes.

### Pitfall 5: Groovy DSL Deprecation Warnings

**What goes wrong:** AGP 8.13.0 produces deprecation warnings for method-call syntax (`compileSdk 35`) instead of assignment syntax (`compileSdk = 35`).
**Why it happens:** Gradle deprecated the Groovy shorthand in newer AGP versions.
**How to avoid:** Update `build.gradle` to use `=` assignment: `namespace = "com.eltemplo.app"`, `compileSdk = rootProject.ext.compileSdkVersion`, etc.
**Warning signs:** Yellow warnings in build output about "deprecated Groovy DSL syntax."

### Pitfall 6: iOS Podfile Hardcoded Paths

**What goes wrong:** The current `Podfile` has hardcoded paths referencing v7 pnpm store paths (e.g., `@capacitor+ios@7.4.5_@capacitor+core@7.4.5`). After upgrading, these paths point to non-existent directories.
**Why it happens:** `cap sync ios` regenerates the Podfile with correct paths, but if skipped, `pod install` fails.
**How to avoid:** Always run `npx cap sync ios` after upgrading packages, then `pod install` in `ios/App/`.
**Warning signs:** `pod install` fails with "No such file or directory" for Capacitor pods.

## Code Examples

### build.gradle (app-level) -- Target State

```groovy
// Source: Capacitor 8 migration guide + user decisions
apply plugin: 'com.android.application'

android {
    namespace = "com.eltemplo.app"
    compileSdk = rootProject.ext.compileSdkVersion
    defaultConfig {
        applicationId = "com.eltemplo.app"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode = (System.getenv("VERSION_CODE") ?: "1").toInteger()
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        aaptOptions {
            ignoreAssetsPattern = '!.svn:!.git:!.ds_store:!*.scc:.*:!CVS:!thumbs.db:!picasa.ini:!*~'
        }
    }
    buildTypes {
        release {
            minifyEnabled = true
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
    flavorDimensions = ["environment"]
    productFlavors {
        production {
            dimension = "environment"
        }
        staging {
            dimension = "environment"
            applicationIdSuffix = ".staging"
        }
    }
}
```

### ProGuard Rules (proguard-rules.pro) -- Recommended

```proguard
# Capacitor WebView bridge -- keep JavaScript interface classes
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep source file names and line numbers for Sentry stack traces
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Note: Capacitor's @capacitor/android ships its own consumer ProGuard rules
# that keep plugin classes, annotations, and PluginMethod-annotated methods.
# No need to duplicate those here.
```

### Production Manifest Overlay (src/production/AndroidManifest.xml)

```xml
<?xml version="1.0" encoding="utf-8" ?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:usesCleartextTraffic="false"
        android:networkSecurityConfig="@xml/network_security_config" />
</manifest>
```

### Staging Manifest Overlay (src/staging/AndroidManifest.xml) -- already exists, extend

```xml
<?xml version="1.0" encoding="utf-8" ?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:usesCleartextTraffic="true" />
</manifest>
```

### Network Security Config (src/production/res/xml/network_security_config.xml)

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
```

### Main AndroidManifest.xml Changes

```xml
<!-- Add to <manifest> element (before <application>) -->
<uses-permission android:name="android.permission.CAMERA" />

<!-- Update activity configChanges (add |density) -->
android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density"

<!-- Remove usesCleartextTraffic from <application> (moved to flavor overlays) -->
```

### versionCode from CI in GitHub Actions

```yaml
# In build-android-production.yml (and staging)
- name: Build production release APK
  working-directory: el-templo-app/src-capacitor/android
  env:
    VERSION_CODE: ${{ github.run_number }}
  run: ./gradlew assembleProductionRelease
```

## State of the Art

| Old Approach                        | Current Approach                 | When Changed             | Impact                                               |
| ----------------------------------- | -------------------------------- | ------------------------ | ---------------------------------------------------- |
| Capacitor v7 native                 | Capacitor v8 native              | Capacitor 8.0 (2025)     | New SDK targets, Gradle versions, minSdk 24          |
| `adjustMarginsForEdgeToEdge` config | System Bars plugin + CSS `env()` | Capacitor 8.0            | App already uses CSS env() -- no migration needed    |
| CocoaPods default (iOS)             | SPM default for new projects     | Capacitor 8.0            | Existing projects keep CocoaPods -- no change needed |
| Method-call Groovy syntax           | Assignment (`=`) syntax          | AGP 8.x                  | Deprecation warnings if not updated                  |
| Manual versionCode                  | CI-driven versionCode            | Best practice            | `github.run_number` auto-increments                  |
| Global `usesCleartextTraffic`       | Network security config XML      | Android 9+ best practice | Per-domain control, production-safe defaults         |

## Open Questions

1. **Capacitor v8 edge-to-edge on Android 15+ (API 35+)**
   - What we know: Capacitor 8 removes `adjustMarginsForEdgeToEdge`. The app already uses CSS `env(safe-area-inset-*)` in MainLayout and app.scss. Quasar's QHeader/QFooter support safe areas natively.
   - What's unclear: Whether Android 15+ enforces edge-to-edge regardless of app config, potentially causing content behind status bar. Some WebView versions < 140 have buggy safe-area values.
   - Recommendation: Test on a physical device after upgrade. If issues appear, add `@capacitor-community/safe-area` plugin. Low risk given existing CSS setup.

2. **ProGuard with Capacitor HTTP plugin**
   - What we know: `CapacitorHttp` is enabled in `capacitor.config.ts`. Capacitor's bundled ProGuard consumer rules should cover this.
   - What's unclear: Whether CapacitorHttp's internal OkHttp usage needs additional keep rules.
   - Recommendation: Build a release APK, install on device, test API calls. If they fail, add `-keep class com.getcapacitor.plugin.http.** { *; }`.

## Validation Architecture

> `workflow.nyquist_validation` is not set in config.json -- treating as enabled.

### Test Framework

| Property           | Value                                                        |
| ------------------ | ------------------------------------------------------------ |
| Framework          | Vitest 4.x (frontend), manual device testing (Android build) |
| Config file        | `el-templo-app/vitest.config.ts` or inline in `vite.config`  |
| Quick run command  | `cd el-templo-app && pnpm test`                              |
| Full suite command | `cd el-templo-app && pnpm test`                              |

### Phase Requirements -> Test Map

| Req ID  | Behavior                                          | Test Type | Automated Command                                                                             | File Exists?         |
| ------- | ------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------- | -------------------- |
| PLAY-01 | Capacitor CLI + native plugins same major version | smoke     | `cd el-templo-app/src-capacitor && npx cap doctor`                                            | N/A -- CLI tool      |
| PLAY-02 | versionCode reads from CI env, falls back to 1    | manual    | Build APK with/without `VERSION_CODE` env, check output APK metadata                          | N/A -- Gradle config |
| PLAY-03 | App name, package ID, icon, splash correct        | manual    | Install APK on device, verify launcher name/icon                                              | N/A -- visual check  |
| PLAY-04 | Only INTERNET + CAMERA permissions in manifest    | smoke     | `grep "uses-permission" el-templo-app/src-capacitor/android/app/src/main/AndroidManifest.xml` | N/A -- grep check    |

### Sampling Rate

- **Per task commit:** `npx cap doctor` (version alignment check)
- **Per wave merge:** Build staging debug APK via `./gradlew assembleStagingDebug`
- **Phase gate:** Full staging APK build succeeds; `npx cap doctor` clean

### Wave 0 Gaps

None -- this phase is primarily configuration/build changes. No application code tests needed. Verification is build success + `cap doctor` + manual device install.

## Sources

### Primary (HIGH confidence)

- [Capacitor 8.0 Migration Guide](https://capacitorjs.com/docs/updating/8-0) -- complete migration steps, version requirements
- [Capacitor System Bars API](https://capacitorjs.com/docs/apis/system-bars) -- edge-to-edge replacement
- [Capacitor ProGuard Rules (GitHub)](https://github.com/ionic-team/capacitor/blob/main/android/capacitor/proguard-rules.pro) -- bundled consumer rules
- [Capacitor BridgeWebChromeClient (GitHub)](https://github.com/ionic-team/capacitor/blob/main/android/capacitor/src/main/java/com/getcapacitor/BridgeWebChromeClient.java) -- camera permission handling via onPermissionRequest
- npm registry -- verified all package versions 2026-03-21
- [Android Network Security Config](https://developer.android.com/privacy-and-security/security-config) -- official docs
- [Google Play Target API Requirements](https://support.google.com/googleplay/android-developer/answer/11926878) -- targetSdkVersion 35+ required

### Secondary (MEDIUM confidence)

- [html5-qrcode WebView Issues (GitHub #414)](https://github.com/mebjas/html5-qrcode/issues/414) -- confirms getUserMedia used, needs CAMERA manifest permission
- [html5-qrcode WebView Compatibility (GitHub #544)](https://github.com/mebjas/html5-qrcode/issues/544) -- WebView camera streaming details
- [Capacitor Android Build with GitHub Actions](https://khromov.se/build-your-capacitor-android-app-bundle-using-github-actions/) -- versionCode from run_number pattern

### Tertiary (LOW confidence)

- None

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH -- versions verified against npm registry, migration guide is official Capacitor docs
- Architecture: HIGH -- product flavor overlays and network security config are standard Android patterns with official documentation
- Pitfalls: HIGH -- based on official migration guide known breaking changes and verified codebase state
- Camera permission: HIGH -- verified Capacitor source code (BridgeWebChromeClient.java) handles onPermissionRequest; CAMERA manifest declaration is the only requirement

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (Capacitor 8 is stable; unlikely to change)
