---
phase: 93-ios-build-pipeline
plan: 02
subsystem: infra
tags: [ios, github-actions, xcodebuild, app-store-connect, ci-cd]

# Dependency graph
requires:
  - phase: 93-01
    provides: Xcode project with manual Release signing and SECRETS.md iOS guide
  - phase: 76-play-store-setup
    provides: Android production workflow patterns (master branch guard, version tagging)
provides:
  - Complete iOS production build workflow with App Store Connect upload
affects: [App Store submission process]

# Tech tracking
tech-stack:
  added: []
  patterns: [iOS production workflow mirroring staging with branch guard and version tagging, CURRENT_PROJECT_VERSION override via xcodebuild arg for CI build numbers]

key-files:
  created:
    - .github/workflows/build-ios-production.yml
  modified: []

key-decisions:
  - "Production workflow mirrors staging structure exactly, with production-specific env vars, master branch guard, version extraction, and 90-day artifact retention"
  - "CURRENT_PROJECT_VERSION overridden at build time via xcodebuild arg (github.run_number), mirroring Android VERSION_CODE pattern"
  - "No pnpm cache in Node.js setup step, consistent with staging workflow (macOS runners have different caching behavior)"

patterns-established:
  - "iOS production workflow pattern: staging workflow + master branch guard + production env vars + version-tagged artifacts + 90-day retention"

requirements-completed: [IOS-02, IOS-03, IOS-04]

# Metrics
duration: 1min
completed: 2026-04-07
---

# Phase 93 Plan 02: iOS Production Build Workflow Summary

**GitHub Actions workflow for iOS production builds with master branch guard, manual code signing, auto-incrementing build numbers from github.run_number, and App Store Connect upload via xcrun altool**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-07T16:26:29Z
- **Completed:** 2026-04-07T16:27:51Z
- **Tasks:** 1 (auto) + 1 (checkpoint:human-verify)
- **Files modified:** 1

## Accomplishments
- Created build-ios-production.yml mirroring staging workflow with all production-specific changes
- Master branch guard rejects non-master triggers with explicit error (T-93-04 mitigation)
- CURRENT_PROJECT_VERSION from github.run_number auto-increments build numbers across workflow runs
- Version extraction from MARKETING_VERSION in project.pbxproj for artifact naming
- Keychain cleanup in if: always() block prevents certificate leakage (T-93-05 mitigation)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create build-ios-production.yml workflow** - `3b8f832a` (feat)

## Files Created/Modified
- `.github/workflows/build-ios-production.yml` - Complete iOS production build and upload workflow (161 lines): checkout, master branch guard, pnpm/node setup, web build with production env vars, cap sync (no STAGING), CocoaPods install, version extraction, certificate/profile import, xcodebuild archive with manual signing + build number override, ExportOptions.plist, IPA export, App Store Connect upload via altool, version-tagged artifact upload (90-day retention), keychain cleanup

## Decisions Made
- Production workflow mirrors staging structure exactly, with only the necessary production-specific changes (env vars, branch guard, version extraction, retention)
- CURRENT_PROJECT_VERSION overridden at build time via xcodebuild arg using github.run_number, same pattern as Android VERSION_CODE
- No pnpm cache in Node.js setup step -- consistent with staging workflow behavior on macOS runners
- Upload step name changed from "Upload to TestFlight" to "Upload to App Store Connect" for clarity (both go to same place)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

**External services require manual configuration** before the workflow can be triggered:

1. **Apple Developer Portal:** Create Apple Distribution certificate and App Store provisioning profile for com.eltemplo.app
2. **App Store Connect:** Create API key with Developer role
3. **GitHub Secrets:** Add 6 secrets (IOS_BUILD_CERTIFICATE_BASE64, IOS_P12_PASSWORD, IOS_PROVISION_PROFILE_BASE64, APPLE_API_KEY_ID, APPLE_API_ISSUER_ID, APPLE_API_KEY_BASE64)

See `.github/SECRETS.md` "iOS Signing (App Store)" section for step-by-step guide.

## Next Phase Readiness
- Workflow file committed and ready for first run once Apple signing credentials are configured
- Task 2 (human-verify checkpoint) awaits user to create credentials, add secrets, push, and trigger the workflow
- After successful workflow run, the full iOS build pipeline will be operational

## Self-Check: PASSED

All files exist and all commits verified.

---
*Phase: 93-ios-build-pipeline*
*Completed: 2026-04-07*
