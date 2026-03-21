---
phase: 75-android-signing-release-build
plan: 02
subsystem: infra
tags: [android, github-actions, ci-cd, signing, aab, apk, play-store]

# Dependency graph
requires:
  - phase: 75-01
    provides: "signingConfigs.release in build.gradle, scoped to productionRelease via applicationVariants.configureEach"
provides:
  - "GitHub Actions production build workflow producing signed AAB + APK artifacts"
  - "Master branch guard enforcing production-only builds"
  - "Version-tagged artifact naming with 90-day retention"
affects: [play-store-setup, play-store-listing, internal-testing-launch]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      "Master branch guard step as first check after checkout in production workflows",
      "Base64 keystore decode from GitHub Secrets into Gradle-expected path",
      "Dual artifact upload (AAB + APK) with version+commit naming",
    ]

key-files:
  created:
    - ".github/workflows/build-android-production.yml"
  modified: []

key-decisions:
  - "Master branch guard as explicit shell check (not branch filter) so workflow_dispatch from non-master fails with clear error"
  - "Production env vars from secrets.VITE_API_URL and secrets.VITE_SENTRY_DSN (not staging prefixed)"
  - "No STAGING env var in Capacitor sync step -- production flavor is the default"

patterns-established:
  - "Production workflow pattern: manual trigger + branch guard + secret decode + dual build + dual artifact upload"

requirements-completed: [PLAY-07, PLAY-08]

# Metrics
duration: 2min
completed: 2026-03-21
---

# Phase 75 Plan 02: Production Build Workflow Summary

**GitHub Actions production workflow with master branch guard, keystore decode, signed AAB + APK build, and version-tagged dual artifact upload with 90-day retention**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-21T23:12:31Z
- **Completed:** 2026-03-21T23:13:52Z
- **Tasks:** 1 (auto) + 1 (checkpoint:human-verify pending)
- **Files created:** 1

## Accomplishments

- Created production build workflow cloned from staging with production-specific changes
- Added master branch guard as first step after checkout (rejects non-master runs with clear error)
- Configured keystore decode step placing keystore.jks in the exact path build.gradle expects
- Version extraction from build.gradle versionName + commit SHA for artifact naming
- Dual Gradle tasks (bundleProductionRelease + assembleProductionRelease) with signing env vars
- Dual artifact upload (AAB + APK) with version-tagged names and 90-day retention

## Task Commits

Each task was committed atomically:

1. **Task 1: Create build-android-production.yml workflow** - `5bbfd6d2` (feat)
2. **Task 2: Verify keystore generation, secrets setup, and workflow execution** - checkpoint:human-verify (pending)

## Files Created/Modified

- `.github/workflows/build-android-production.yml` - Full production build workflow: checkout, branch guard, pnpm/Node/Java setup, web build with production env vars, Capacitor sync, keystore decode, version extraction, signed AAB + APK build, dual artifact upload

## Decisions Made

- Master branch guard implemented as shell `if` check (not GitHub branch filter) so workflow_dispatch from any branch still triggers but fails immediately with a clear error message
- Production env vars use `secrets.VITE_API_URL` and `secrets.VITE_SENTRY_DSN` (no STAGING prefix)
- No `STAGING` env var anywhere in the workflow -- production flavor is the default behavior

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**Before the production workflow can succeed, the following manual steps are required:**

1. Generate upload keystore locally using keytool (see `.github/SECRETS.md`)
2. Base64 encode the keystore file
3. Add 3 GitHub Secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`
4. Push changes to master and trigger the workflow from GitHub Actions UI
5. Verify both AAB and APK artifacts are produced
6. Trigger staging workflow to confirm no regression

## Next Phase Readiness

- Production build workflow is ready -- requires GitHub Secrets configuration before first successful run
- Both staging and production workflows will coexist (no conflicts)
- AAB artifact is ready for Play Store upload once Phase 76 (Play Console setup) is done

---

_Phase: 75-android-signing-release-build_
_Completed: 2026-03-21_
