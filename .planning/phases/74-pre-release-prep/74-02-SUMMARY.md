---
phase: 74-pre-release-prep
plan: 02
subsystem: infra
tags: [android, gradle, capacitor, proguard, permissions, play-store, ci]

# Dependency graph
requires:
  - phase: 74-01
    provides: Capacitor v8 native project with AGP 8.13, Gradle 8.14, Groovy assignment syntax
provides:
  - Production-hardened Android configuration with manifest overlays
  - CAMERA permission for QR check-in feature
  - ProGuard minification for production release builds only
  - Network security config enforcing HTTPS-only in production
  - CI-driven versionCode via VERSION_CODE env var
affects: [75-android-signing-release-build, 76-play-store-setup-listing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Flavor-specific manifest overlays for staging/production cleartext traffic control"
    - "androidComponents API for per-variant ProGuard/R8 enablement (AGP 8.x)"
    - "CI-driven versionCode via System.getenv with local fallback"

key-files:
  created:
    - el-templo-app/src-capacitor/android/app/src/staging/AndroidManifest.xml
    - el-templo-app/src-capacitor/android/app/src/production/AndroidManifest.xml
    - el-templo-app/src-capacitor/android/app/src/production/res/xml/network_security_config.xml
  modified:
    - el-templo-app/src-capacitor/android/app/src/main/AndroidManifest.xml
    - el-templo-app/src-capacitor/android/app/build.gradle
    - el-templo-app/src-capacitor/android/app/proguard-rules.pro
    - .github/workflows/build-android-staging.yml

key-decisions:
  - "Production-only ProGuard via androidComponents API (staging unminified for readable stack traces)"
  - "withName('productionRelease') selector over kotlin.Pair flavor selector for Groovy compatibility"
  - "Cleartext traffic controlled via flavor manifest overlays, not main manifest"

patterns-established:
  - "Flavor manifest overlays: staging enables cleartext, production disables + adds network security config"
  - "androidComponents { onVariants(selector().withName(variantName)) } for per-variant build configuration"

requirements-completed: [PLAY-02, PLAY-03, PLAY-04]

# Metrics
duration: 2min
completed: 2026-03-21
---

# Phase 74 Plan 02: Android Production Hardening Summary

**Production-hardened Android config with CAMERA permission, flavor manifest overlays for cleartext control, ProGuard for production release only, network security config, and CI-driven versionCode**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-21T22:03:22Z
- **Completed:** 2026-03-21T22:05:30Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Main manifest stripped of usesCleartextTraffic, CAMERA permission added for QR check-in, density added to configChanges for Capacitor 8 foldable support
- Staging/production manifest overlays created for flavor-specific cleartext traffic control
- ProGuard rules written for WebView bridge and Sentry source maps; minification enabled only for productionRelease variant
- Network security config enforcing HTTPS-only added for production builds
- versionCode wired to CI environment variable (github.run_number), staging workflow updated

## Task Commits

Each task was committed atomically:

1. **Task 1: Production hardening -- manifest overlays, permissions, ProGuard, network security** - `40f9f4f4` (feat)
2. **Task 2: Wire versionCode from CI and update staging workflow** - `28e40db6` (feat)

## Files Created/Modified

- `el-templo-app/src-capacitor/android/app/src/main/AndroidManifest.xml` - Removed usesCleartextTraffic, added CAMERA permission, added density to configChanges
- `el-templo-app/src-capacitor/android/app/src/staging/AndroidManifest.xml` - Created: staging overlay enabling cleartext traffic
- `el-templo-app/src-capacitor/android/app/src/production/AndroidManifest.xml` - Created: production overlay disabling cleartext + network security config ref
- `el-templo-app/src-capacitor/android/app/src/production/res/xml/network_security_config.xml` - Created: HTTPS-only enforcement for production
- `el-templo-app/src-capacitor/android/app/proguard-rules.pro` - Rewritten: WebView bridge keep rules + Sentry source map preservation
- `el-templo-app/src-capacitor/android/app/build.gradle` - Added androidComponents block for production-only minification, versionCode from CI env var
- `.github/workflows/build-android-staging.yml` - Added VERSION_CODE env var to Gradle build step

## Decisions Made

- Used `withName("productionRelease")` selector instead of `kotlin.Pair` flavor selector for cleaner Groovy DSL compatibility
- Cleartext traffic control moved to flavor-specific manifest overlays rather than toggling in main manifest
- ProGuard enabled only for productionRelease via androidComponents API (staging stays unminified per user decision for readable stack traces)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Android app is now production-hardened with proper permissions, ProGuard, and network security
- Ready for Phase 75: Android signing configuration and release build pipeline
- versionCode will auto-increment via CI run number when builds are triggered

---

_Phase: 74-pre-release-prep_
_Completed: 2026-03-21_
