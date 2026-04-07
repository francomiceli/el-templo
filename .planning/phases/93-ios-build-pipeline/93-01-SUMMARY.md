---
phase: 93-ios-build-pipeline
plan: 01
subsystem: infra
tags: [ios, xcode, code-signing, app-store, capacitor]

# Dependency graph
requires:
  - phase: 76-play-store-setup
    provides: Android signing patterns and SECRETS.md structure
provides:
  - Xcode project configured for manual CI signing with Apple Distribution identity
  - iOS signing secrets documentation with step-by-step setup guide
affects: [93-02 build-ios-production workflow reads signing config from pbxproj]

# Tech tracking
tech-stack:
  added: []
  patterns: [manual code signing for Release with Automatic for Debug, MARKETING_VERSION three-part semver matching Android]

key-files:
  created: []
  modified:
    - el-templo-app/src-capacitor/ios/App/App.xcodeproj/project.pbxproj
    - .github/SECRETS.md

key-decisions:
  - "CODE_SIGN_STYLE Manual only on Release config; Debug stays Automatic for local Xcode development"
  - "CURRENT_PROJECT_VERSION stays at 1 in pbxproj; overridden by xcodebuild args in CI (same as Android VERSION_CODE pattern)"
  - "MARKETING_VERSION set to 1.0.0 three-part semver matching Android versionName"

patterns-established:
  - "iOS version management: MARKETING_VERSION in pbxproj for display version, CURRENT_PROJECT_VERSION overridden at build time via xcodebuild args"

requirements-completed: [IOS-01, IOS-05]

# Metrics
duration: 1min
completed: 2026-04-07
---

# Phase 93 Plan 01: Xcode CI Signing Config & iOS Secrets Documentation Summary

**Xcode project configured for manual Release signing with Apple Distribution identity, version aligned to 1.0.0 semver, and SECRETS.md extended with complete iOS certificate/provisioning/API key setup guide**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-07T16:22:50Z
- **Completed:** 2026-04-07T16:24:35Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Xcode project Release config set to Manual signing with Apple Distribution identity and provisioning profile specifier
- MARKETING_VERSION updated to 1.0.0 (three-part semver) in both Debug and Release configs
- SECRETS.md extended with 6 iOS signing secrets, step-by-step Apple Developer portal guide, and encoding instructions for macOS/Linux

## Task Commits

Each task was committed atomically:

1. **Task 1: Configure Xcode project for CI signing and version management** - `dfe8d36c` (chore)
2. **Task 2: Document iOS signing secrets in SECRETS.md** - `2590e7a1` (docs)

## Files Created/Modified
- `el-templo-app/src-capacitor/ios/App/App.xcodeproj/project.pbxproj` - Release config: Manual signing, Apple Distribution identity, PROVISIONING_PROFILE_SPECIFIER; both configs: MARKETING_VERSION 1.0.0
- `.github/SECRETS.md` - iOS Signing section with 6 secrets table, 6-step setup guide (certificate, provisioning profile, API key, encoding, GitHub, backup), updated environment workflows

## Decisions Made
- CODE_SIGN_STYLE set to Manual only on Release config; Debug stays Automatic so local Xcode development works without manual signing setup
- CURRENT_PROJECT_VERSION left at 1 in pbxproj; CI overrides via xcodebuild build setting argument (same pattern as Android VERSION_CODE env var)
- MARKETING_VERSION set to 1.0.0 three-part semver to match Android versionName convention

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required. The user will need to create Apple certificates and add GitHub secrets before running iOS workflows, but the instructions are documented in SECRETS.md.

## Next Phase Readiness
- Xcode project signing configuration ready for Plan 02 (build-ios-production.yml workflow)
- The workflow will use `CODE_SIGN_STYLE=Manual` and `CURRENT_PROJECT_VERSION=${{ github.run_number }}` as xcodebuild args
- User must complete Apple Developer portal setup (documented in SECRETS.md) before first workflow run

---
## Self-Check: PASSED

All files exist and all commits verified.

---
*Phase: 93-ios-build-pipeline*
*Completed: 2026-04-07*
