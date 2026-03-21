# Phase 75 Deferred Items

## Pre-existing: androidComponents optimization API not available

- **File:** `el-templo-app/src-capacitor/android/app/build.gradle` line 49-53
- **Issue:** `variant.optimization.minification.set(true)` uses an API that is not available in the current AGP version. Error: "Could not get unknown property 'optimization' for object of type com.android.build.api.variant.impl.ApplicationVariantImpl"
- **Impact:** `./gradlew assembleStagingDebug` fails. This was broken BEFORE Phase 75 changes (confirmed by testing with stashed changes).
- **Origin:** Phase 74 (pre-release-prep)
- **Resolution:** Needs investigation of the correct AGP API for variant-level minification scoping, or use `buildTypes.release` conditional instead.
