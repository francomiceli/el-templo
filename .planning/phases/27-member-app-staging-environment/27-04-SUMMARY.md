---
phase: 27-member-app-staging-environment
plan: 04
subsystem: infra
tags: [ios, testflight, github-actions, xcode, capacitor, ci-cd]

# Dependency graph
requires:
  - phase: 27-02
    provides: "Staging deployment workflow and STAGING_VITE_* secrets convention"
  - phase: 27-03
    provides: "Dynamic capacitor.config.ts with STAGING env var support"
provides:
  - "iOS staging TestFlight build workflow via GitHub Actions macOS runner"
  - "Documented prerequisites for Apple Developer account and certificate setup"
affects: [mobile-builds, ios-deployment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      "GitHub Actions macOS runner for iOS builds",
      "Keychain import/cleanup lifecycle in CI",
      "ExportOptions.plist for app-store method IPA export",
    ]

key-files:
  created:
    - ".github/workflows/build-ios-staging.yml"
  modified: []

key-decisions:
  - "Removed spurious notarytool line from plan template (notarytool is for macOS notarization, not iOS TestFlight)"
  - "Kept altool for TestFlight upload with deprecation warning comment and alternatives documented"
  - "CODE_SIGN_STYLE=Manual for xcodebuild archive to match CI certificate import pattern"

patterns-established:
  - "iOS CI builds: workflow_dispatch only (macOS runners ~10x cost)"
  - "Apple secrets naming: IOS_* for certificates, APPLE_* for App Store Connect API"

# Metrics
duration: 2min
completed: 2026-02-16
---

# Phase 27 Plan 04: iOS Staging TestFlight Build Workflow Summary

**GitHub Actions macOS workflow for iOS staging builds with manual trigger, certificate management, Xcode archive, and TestFlight upload via altool**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-16T15:12:00Z
- **Completed:** 2026-02-16T15:14:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created complete iOS staging build workflow with manual workflow_dispatch trigger
- Documented all 8 required GitHub Secrets with setup steps for Apple Developer account
- Workflow handles full lifecycle: web build, cap sync, CocoaPods, certificate import, Xcode archive, IPA export, TestFlight upload, artifact backup, keychain cleanup

## Task Commits

Each task was committed atomically:

1. **Task 1: Create iOS staging TestFlight build workflow** - `1a34dab` (feat)
   - Note: Committed as part of 27-03 execution which included this file

**Plan metadata:** `7c0b473` (docs: complete plan)

## Files Created/Modified

- `.github/workflows/build-ios-staging.yml` - iOS staging TestFlight build workflow with manual trigger, macOS runner, certificate/provisioning profile import, Xcode archive, IPA export, altool upload, artifact backup, and keychain cleanup

## Decisions Made

- **Removed notarytool no-op line:** The plan template included `xcrun notarytool submit --wait || true` before the altool upload. Notarytool is for macOS app notarization, not iOS TestFlight upload. Removed to avoid confusion.
- **Kept altool with deprecation notice:** Apple has partially deprecated altool, but it still works. Added comments documenting alternatives (apple-actions/upload-testflight-build, App Store Connect API).
- **CODE_SIGN_STYLE=Manual:** Required for CI builds where certificates are imported manually into a temporary keychain, not via Xcode automatic signing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed spurious notarytool line**

- **Found during:** Task 1 (Create iOS staging TestFlight build workflow)
- **Issue:** Plan template included `xcrun notarytool submit --wait || true` in the Upload to TestFlight step. Notarytool is for macOS app notarization, not iOS TestFlight upload -- this was a no-op/misleading line.
- **Fix:** Removed the line, kept only the altool upload command with deprecation notice comment.
- **Files modified:** `.github/workflows/build-ios-staging.yml`
- **Verification:** Workflow file has clean upload step with only altool
- **Committed in:** `1a34dab`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor cleanup of misleading no-op command. No scope change.

## Issues Encountered

- The workflow file was already committed by the 27-03 plan execution (commit `1a34dab`). Verified the committed content matches all plan requirements. No re-commit needed.

## User Setup Required

This workflow requires Apple Developer Program membership and manual configuration before first run:

1. Apple Developer Program enrollment ($99/year)
2. Register `com.eltemplo.app.staging` in App Store Connect
3. Create Distribution certificate and export as .p12
4. Create Provisioning Profile for the staging bundle ID
5. Create App Store Connect API key with Developer role
6. Base64-encode all certificates/keys and add as GitHub Secrets
7. Set all 8 required secrets (documented in workflow header comments)

## Next Phase Readiness

- iOS staging build workflow is ready for use once Apple Developer account and secrets are configured
- Plan 27-05 (staging seed script) can proceed independently

## Self-Check: PASSED

- [x] `.github/workflows/build-ios-staging.yml` - FOUND (168 lines, valid YAML)
- [x] Commit `1a34dab` - FOUND (verified via git log)
- [x] `27-04-SUMMARY.md` - FOUND

---

_Phase: 28-member-app-staging-environment_
_Completed: 2026-02-16_
