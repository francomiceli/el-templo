---
phase: 15-admin-session-editing
plan: 06
subsystem: ui
tags: [vue, typescript, quasar, dialog, exercise-swap, admin-editing]

# Dependency graph
requires:
  - phase: 15-03
    provides: "Exercise pool API endpoint and swap endpoint"
  - phase: 15-04
    provides: "useEditApi composable with fetchExercisePool and swapExercise methods"
provides:
  - "ExerciseSwapDialog.vue component for exercise-level swap in admin session editing"
  - "SessionBlock.pattern field exposed to frontend types"
affects: ["15-07", "15-08"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "QDialog with v-model for open state, persistent during swap operation"
    - "Watch-based pool fetch on dialog open with contraction filter re-fetch"
    - "Client-side search + API-side contraction filter hybrid approach"

key-files:
  created:
    - "el-templo-admin/src/components/sessions/ExerciseSwapDialog.vue"
  modified:
    - "el-templo-admin/src/types/session.ts"

key-decisions:
  - "Added pattern field to SessionBlock type to pass block pattern context to swap dialog"
  - "Contraction filter triggers API re-fetch while search is client-side for responsiveness"
  - "Cross-route exercises (pattern_2) shown with deep-orange 'Cruce' badge for visual distinction"
  - "Dialog persistent only while swap API call is in flight, closeable otherwise"

patterns-established:
  - "Exercise swap dialog pattern: parent passes exercise + block context, dialog handles pool fetch and swap independently"

# Metrics
duration: 3min
completed: 2026-02-06
---

# Phase 15 Plan 06: Exercise Swap Dialog Summary

**Centered QDialog component showing filtered exercise candidates with contraction/difficulty/pattern badges, sorted by difficulty proximity, with one-click swap and re-prescription**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-06T15:33:44Z
- **Completed:** 2026-02-06T15:36:47Z
- **Tasks:** 1
- **Files created:** 1
- **Files modified:** 1

## Accomplishments

- Created ExerciseSwapDialog.vue -- a centered modal that shows exercise candidates for replacing an exercise in a block
- Dialog fetches exercise pool from API on open, re-fetches when contraction filter changes
- Client-side search filter with 300ms debounce for fast name filtering
- Exercises sorted by closest linear difficulty to the exercise being replaced
- Each exercise displays: name, CON/EXC/ISO badge (blue-grey/teal/orange), difficulty number, pattern badge
- Cross-route exercises (from pattern_2) highlighted with "Cruce" deep-orange badge
- Clicking an exercise triggers swap API call with spinner on the clicked item
- On success: positive toast notification, emits 'swapped' event, closes dialog
- On error: negative toast notification, dialog stays open for retry
- Added `pattern` field to `SessionBlock` frontend type (backend already returns it via spread)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ExerciseSwapDialog component** - `c316902` (feat)

## Files Created/Modified

- `el-templo-admin/src/components/sessions/ExerciseSwapDialog.vue` - New 260-line component with QDialog, contraction filter QSelect, search QInput, scrollable QList with exercise items, swap buttons
- `el-templo-admin/src/types/session.ts` - Added `pattern: string` to `SessionBlock` interface

## Decisions Made

- **SessionBlock.pattern added:** The backend `getSessionWithDetails` already returns `pattern` from the session_blocks spread, but the frontend type was missing it. Added to enable the swap dialog to pass block pattern context for pool filtering.
- **Hybrid filtering approach:** Contraction type filter triggers a fresh API call (server-side filter for accurate pool), while exercise name search is client-side on the already-fetched results for instant responsiveness.
- **"Cruce" badge for cross-route:** Instead of showing "pattern_2" which is technical jargon, exercises from cross-route pools display a "Cruce" (Spanish for cross/crossover) badge in deep-orange to clearly distinguish them from the block's primary pattern exercises.
- **Dialog persistent only during swap:** The `persistent` prop is bound to the `swapping` ref -- dialog is freely closeable while browsing, but cannot be accidentally closed during an active swap API call.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added pattern field to SessionBlock type**
- **Found during:** Task 1, component creation
- **Issue:** The plan specifies `blockPattern` as a prop, but `SessionBlock` in the frontend types did not include `pattern`. The backend already returns it (via object spread in `getSessionWithDetails`), but the type did not capture it.
- **Fix:** Added `pattern: string` to `SessionBlock` interface in `session.ts`
- **Files modified:** `el-templo-admin/src/types/session.ts`
- **Commit:** c316902

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ExerciseSwapDialog ready to be integrated into SessionEditPage (plan 15-07/15-08)
- Parent component needs to pass: modelValue, sessionId, blockId, currentExercise, blockRoute, blockPattern
- Emits 'swapped' event for parent to reload session data after successful swap
- useEditApi composable handles all API communication

## Self-Check: PASSED
