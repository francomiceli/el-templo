---
phase: 75-android-signing-release-build
plan: 01
subsystem: infra
tags: [android, gradle, signing, keystore, play-store, github-secrets]

# Dependency graph
requires:
  - phase: 74-pre-release-prep
    provides: "Product flavors, versionCode from CI, androidComponents ProGuard scoping"
provides:
  - "signingConfigs.release block in build.gradle reading from env vars"
  - "productionRelease-scoped signing via applicationVariants.configureEach"
  - "keystore.jks gitignored in android app directory"
  - "Full keystore generation guide in SECRETS.md with 3 new secrets documented"
affects: [75-02-production-workflow, play-store-setup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      "applicationVariants.configureEach for variant-scoped signing config application",
    ]

key-files:
  created: []
  modified:
    - "el-templo-app/src-capacitor/android/app/build.gradle"
    - "el-templo-app/src-capacitor/android/app/.gitignore"
    - ".github/SECRETS.md"

key-decisions:
  - "Variant-scoped signing via applicationVariants.configureEach (not buildTypes.release conditional) to ensure only productionRelease gets signing"
  - "Key alias hardcoded as 'upload' (not secret, not configurable) for simplicity"

patterns-established:
  - "applicationVariants.configureEach pattern: scope build configuration to specific variant by name check"

requirements-completed: [PLAY-05, PLAY-06, PLAY-09]

# Metrics
duration: 4min
completed: 2026-03-21
---

# Phase 75 Plan 01: Gradle Release Signing Summary

**Gradle signingConfigs.release reading from env vars, scoped to productionRelease only via applicationVariants.configureEach, with full keystore generation guide in SECRETS.md**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-21T23:01:54Z
- **Completed:** 2026-03-21T23:06:25Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added signingConfigs.release block reading ANDROID_KEYSTORE_PASSWORD and ANDROID_KEY_PASSWORD from environment variables
- Scoped signing to productionRelease variant only via applicationVariants.configureEach (stagingRelease never gets signing config)
- Added keystore.jks to .gitignore to prevent accidental commits of decoded keystore
- Documented all 3 new secrets and full step-by-step keystore generation guide in SECRETS.md

## Task Commits

Each task was committed atomically:

1. **Task 1: Add signingConfigs.release to build.gradle and gitignore keystore** - `f2a14cdd` (feat)
2. **Task 2: Document keystore generation and signing secrets in SECRETS.md** - `7bb65c59` (docs)

## Files Created/Modified

- `el-templo-app/src-capacitor/android/app/build.gradle` - Added signingConfigs.release block and applicationVariants.configureEach for productionRelease-scoped signing
- `el-templo-app/src-capacitor/android/app/.gitignore` - Added keystore.jks entry
- `.github/SECRETS.md` - Added Android signing secrets table and full keystore generation guide (keytool, base64 encoding, GitHub upload, backup, cleanup)

## Decisions Made

- Used applicationVariants.configureEach pattern instead of buildTypes.release conditional to ensure signing is scoped to productionRelease only (not stagingRelease)
- Hardcoded key alias as "upload" in build.gradle rather than making it configurable via env var (not sensitive, reduces complexity)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **Pre-existing build failure:** `./gradlew assembleStagingDebug` fails with "Could not get unknown property 'optimization'" in the existing androidComponents block (line 49-53). This failure exists BEFORE Phase 75 changes (confirmed by testing with stashed changes). Logged to `deferred-items.md` as out-of-scope. The signing changes do not introduce any new failures -- this is a pre-existing issue from Phase 74.

## User Setup Required

None - no external service configuration required. Keystore generation is a Phase 75 Plan 02 prerequisite (CI workflow) and will be performed by the user before triggering the production workflow.

## Next Phase Readiness

- Signing config is in place, ready for Plan 02 (production build workflow) to use
- Pre-existing `optimization` API issue in build.gradle needs investigation but does not block signing config or workflow creation

---

_Phase: 75-android-signing-release-build_
_Completed: 2026-03-21_
