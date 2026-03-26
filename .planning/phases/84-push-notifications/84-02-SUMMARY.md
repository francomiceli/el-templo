---
phase: 84-push-notifications
plan: 02
subsystem: ui
tags: [capacitor, push-notifications, fcm, pinia, vue3]

# Dependency graph
requires:
  - phase: 78-onboarding-user-profiling
    provides: "Onboarding completion flow (permission prompt integration point)"
provides:
  - "Capacitor PushNotifications boot file with FCM token lifecycle"
  - "Pinia notification store (permission status, token, pending route)"
  - "Push notifications composable (permission check/request)"
  - "@capacitor/push-notifications installed in both app and src-capacitor"
affects: [84-push-notifications, notification-preferences-ui, mi-templo-permission-banner]

# Tech tracking
tech-stack:
  added: ["@capacitor/push-notifications@8.0.3"]
  patterns: ["Capacitor push listener setup in boot file", "FCM token registration on every app launch"]

key-files:
  created:
    - el-templo-app/src/boot/push-notifications.ts
    - el-templo-app/src/stores/useNotificationStore.ts
    - el-templo-app/src/composables/usePushNotifications.ts
  modified:
    - el-templo-app/quasar.config.js
    - el-templo-app/package.json
    - el-templo-app/src-capacitor/package.json

key-decisions:
  - "Logger error() second arg must be LogData object, not plain string -- wrapped error messages in { message: ... }"
  - "openNotificationSettings re-triggers requestPermission instead of unused dynamic @capacitor/app import"
  - "Boot file placed after modules in boot array (sentry, axios, auth, modules, push-notifications)"

patterns-established:
  - "Capacitor push listener pattern: boot file registers global listeners, composable provides per-component API"
  - "FCM token sent to backend on every launch via registration listener"

requirements-completed: [ENG-22]

# Metrics
duration: 2min
completed: 2026-03-26
---

# Phase 84 Plan 02: Capacitor Push Client Setup Summary

**Capacitor PushNotifications plugin with FCM token lifecycle, foreground suppression, deep link routing, and opened tracking**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-26T18:42:30Z
- **Completed:** 2026-03-26T18:44:58Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Installed @capacitor/push-notifications in both el-templo-app and src-capacitor packages
- Created Pinia notification store tracking permission status, FCM token, and pending deep link route
- Created push notifications composable with permission check/request and native platform guard
- Created boot file with all 4 Capacitor PushNotifications listeners (registration, registrationError, pushNotificationReceived, pushNotificationActionPerformed)
- FCM token registered with backend on every app launch when permission granted
- Foreground notifications suppressed (no UI shown per D-29)
- Notification tap navigates to deep link route and reports opened to backend (per D-28, D-32)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create notification store and composable** - `e3edefee` (feat)
2. **Task 2: Create push notification boot file with listeners** - `a94b414a` (feat)

## Files Created/Modified
- `el-templo-app/src/stores/useNotificationStore.ts` - Pinia store for push notification state (permission, token, pending route)
- `el-templo-app/src/composables/usePushNotifications.ts` - Composable for permission check/request with native platform guard
- `el-templo-app/src/boot/push-notifications.ts` - Boot file initializing all Capacitor push listeners and FCM token lifecycle
- `el-templo-app/quasar.config.js` - Added push-notifications to boot array after auth
- `el-templo-app/package.json` - Added @capacitor/push-notifications dependency
- `el-templo-app/src-capacitor/package.json` - Added @capacitor/push-notifications dependency

## Decisions Made
- Logger `error()` second argument must be `LogData` (Record<string, unknown>), not a plain string. Wrapped error messages in `{ message: ... }` objects for type safety.
- Removed unused dynamic `@capacitor/app` import from `openNotificationSettings` -- the composable simply re-triggers `requestPermission()` which shows the OS dialog on Android 13+.
- Boot order: push-notifications placed after modules (last in boot array) since it needs auth token available for API calls.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed logger error() signature mismatch**
- **Found during:** Task 2 (boot file creation)
- **Issue:** Plan code passed plain strings as second arg to `log.error()` but logger expects `LogData` (Record<string, unknown>)
- **Fix:** Wrapped all error messages in `{ message: ... }` objects
- **Files modified:** el-templo-app/src/boot/push-notifications.ts
- **Verification:** TypeScript type check passes
- **Committed in:** a94b414a (Task 2 commit)

**2. [Rule 1 - Bug] Removed dead code in openNotificationSettings**
- **Found during:** Task 1 (composable creation)
- **Issue:** Plan code dynamically imported `@capacitor/app` but never used the import for anything useful
- **Fix:** Removed the unused import, kept the core behavior (re-trigger requestPermission)
- **Files modified:** el-templo-app/src/composables/usePushNotifications.ts
- **Verification:** Composable still provides all expected functions
- **Committed in:** e3edefee (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bug fixes)
**Impact on plan:** Both auto-fixes improve type safety and code cleanliness. No scope creep.

## Issues Encountered
- Plan referenced `quasar.config.ts` but actual file is `quasar.config.js` -- resolved by editing the correct file.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Capacitor push client fully wired -- boot file, store, and composable ready for use
- Backend endpoints (POST /api/notifications/token and POST /api/notifications/:id/opened) needed from plan 84-01
- Firebase project setup and google-services.json needed for actual FCM functionality
- Permission prompt UI (plan 84-06) and MiTemplo banner (plan 84-06) can now integrate with the composable

## Self-Check: PASSED

All created files verified on disk. All commit hashes verified in git log.

---
*Phase: 84-push-notifications*
*Completed: 2026-03-26*
