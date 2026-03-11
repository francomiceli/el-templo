---
phase: 55-pattern-fixes-composable-instantiation-type-safety-convention-compliance
plan: 02
subsystem: ui
tags: [axios, type-safety, composables, vue, typescript]

# Dependency graph
requires:
  - phase: 54-quick-fixes-dry-utility-extraction
    provides: extractError pattern established in admin app
provides:
  - extractError utility in member app (mirrors admin version)
  - Convention-compliant useWakeLock composable with cleanup()/initialize()
affects: [app-error-handling, composable-conventions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "extractError utility for type-safe Axios error extraction in app"
    - "Composable lifecycle convention: expose initialize()/cleanup(), no internal lifecycle hooks"

key-files:
  created:
    - el-templo-app/src/utils/extract-error.ts
  modified:
    - el-templo-app/src/stores/useAuthStore.ts
    - el-templo-app/src/stores/useUserStore.ts
    - el-templo-app/src/modules/training/stores/weekStore.ts
    - el-templo-app/src/modules/training/composables/useWeekData.ts
    - el-templo-app/src/modules/training/composables/useWakeLock.ts
    - el-templo-app/src/modules/progression/composables/useProgressionApi.ts
    - el-templo-app/src/pages/LoginPage.vue
    - el-templo-app/src/pages/RegisterPage.vue
    - el-templo-app/src/pages/ReservasPage.vue
    - el-templo-app/src/pages/CheckInPage.vue
    - el-templo-app/src/modules/training/pages/DayPlayer.vue
    - el-templo-app/src/modules/journey/pages/JourneySession.vue

key-decisions:
  - "extractError in app mirrors admin version exactly -- same API, same fallback chain (error then message field)"
  - "useWakeLock.initialize() registers visibilitychange listener -- moved from removed onMounted"

patterns-established:
  - "extractError: unified error extraction across both app and admin codebases"
  - "Composable convention: initialize() + cleanup() exposed, no lifecycle hooks inside composables"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-03-11
---

# Phase 55 Plan 02: Type Safety and Convention Compliance Summary

**Replaced 12 unsafe Axios `as` casts with extractError utility and fixed useWakeLock composable convention violation (no internal lifecycle hooks)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-11T21:49:36Z
- **Completed:** 2026-03-11T21:53:00Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- Created extractError utility in member app matching admin version (checks both .error and .message response fields)
- Replaced all 12 `err as { response?: ... }` unsafe casts with type-safe extractError() calls
- Fixed useUserStore `response.data as MemberSubscription` with proper generic typing
- Refactored useWakeLock to expose initialize() and cleanup() instead of using internal onMounted/onUnmounted
- Updated both consumer pages (DayPlayer.vue, JourneySession.vue) to call initialize/cleanup at page level

## Task Commits

Each task was committed atomically:

1. **Task 1: Create extractError utility and replace unsafe Axios casts** - `e81e829` (refactor)
2. **Task 2: Fix useWakeLock composable convention violation** - `11e77ca` (refactor)

## Files Created/Modified

- `el-templo-app/src/utils/extract-error.ts` - Type-safe Axios error extraction utility
- `el-templo-app/src/stores/useAuthStore.ts` - 2 unsafe casts replaced with extractError
- `el-templo-app/src/stores/useUserStore.ts` - response.data cast replaced with generic api.get<T>
- `el-templo-app/src/modules/training/stores/weekStore.ts` - 1 unsafe cast replaced
- `el-templo-app/src/modules/training/composables/useWeekData.ts` - 1 unsafe cast replaced
- `el-templo-app/src/modules/progression/composables/useProgressionApi.ts` - 2 unsafe casts replaced
- `el-templo-app/src/pages/LoginPage.vue` - 1 unsafe cast replaced
- `el-templo-app/src/pages/RegisterPage.vue` - 1 unsafe cast replaced
- `el-templo-app/src/pages/ReservasPage.vue` - 3 unsafe casts replaced
- `el-templo-app/src/pages/CheckInPage.vue` - 1 unsafe cast replaced
- `el-templo-app/src/modules/training/composables/useWakeLock.ts` - Removed lifecycle hooks, added initialize/cleanup
- `el-templo-app/src/modules/training/pages/DayPlayer.vue` - Added wakeLock.initialize/cleanup calls
- `el-templo-app/src/modules/journey/pages/JourneySession.vue` - Added wakeLock.initialize/cleanup calls

## Decisions Made

- extractError in app mirrors admin version exactly -- same API, same fallback chain
- useWakeLock.initialize() registers visibilitychange listener (moved from removed onMounted hook)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All unsafe Axios casts eliminated from member app
- Composable convention fully enforced for useWakeLock
- Ready for Plan 55-03

## Self-Check: PASSED

- All created files verified on disk
- All commit hashes verified in git log

---

_Phase: 55-pattern-fixes-composable-instantiation-type-safety-convention-compliance_
_Completed: 2026-03-11_
