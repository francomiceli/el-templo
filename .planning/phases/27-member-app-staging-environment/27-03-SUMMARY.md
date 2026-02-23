---
phase: 27-member-app-staging-environment
plan: 03
subsystem: infra
tags: [capacitor, gradle, android, github-actions, staging]

requires:
  - phase: 27-02
    provides: "Staging deploy workflow and CI triggers"
provides:
  - "Dynamic Capacitor config for staging/production app identity"
  - "Gradle product flavors for staging applicationId"
  - "Android staging APK build workflow"
affects: [27-05]

tech-stack:
  added: []
  patterns:
    [
      "STAGING env var toggle for Capacitor config",
      "Gradle product flavors for environment separation",
    ]

key-files:
  created:
    - "el-templo-app/src-capacitor/capacitor.config.ts"
    - ".github/workflows/build-android-staging.yml"
  modified:
    - "el-templo-app/src-capacitor/android/app/build.gradle"

key-decisions:
  - "Converted capacitor.config.json to .ts for dynamic staging/production switching via STAGING env var"
  - "Gradle product flavors (staging/production) with applicationIdSuffix for device coexistence"
  - "Debug APK only (no signing keystore needed for sideloading)"

patterns-established:
  - "STAGING=true env var pattern for Capacitor config: controls appId and appName"

duration: 2min
completed: 2026-02-16
---

# Plan 27-03: Android Staging APK Build Summary

**Dynamic Capacitor config (.ts) with staging/production toggle, Gradle product flavors, and manual Android APK build workflow**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-16
- **Completed:** 2026-02-16
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Converted static capacitor.config.json to dynamic TypeScript config that switches app identity based on STAGING env var
- Added Gradle product flavors (staging/production) with applicationIdSuffix for separate installs on same device
- Created manual workflow_dispatch GitHub Actions workflow for staging debug APK builds with 30-day artifact retention

## Task Commits

Each task was committed atomically:

1. **Task 1: Configure Capacitor and Gradle for staging builds** - `79a4991` (feat)
2. **Task 2: Create Android staging APK build workflow** - `1a34dab` (feat)

## Files Created/Modified

- `el-templo-app/src-capacitor/capacitor.config.ts` - Dynamic config: staging appId com.eltemplo.app.staging, production com.eltemplo.app
- `el-templo-app/src-capacitor/android/app/build.gradle` - Added flavorDimensions and productFlavors block
- `.github/workflows/build-android-staging.yml` - Manual Android staging APK build workflow
- `el-templo-app/src-capacitor/capacitor.config.json` - Deleted (replaced by .ts)

## Decisions Made

- Converted JSON to TS config for dynamic switching (Capacitor CLI supports both)
- Used debug APK (no keystore needed) for sideloading distribution
- Manual workflow_dispatch trigger only (not automated on push)

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

None.

## Next Phase Readiness

- Android staging APK workflow ready for use once GitHub Secrets are configured
- Capacitor config ready for both staging and production builds

---

_Phase: 28-member-app-staging-environment_
_Completed: 2026-02-16_
