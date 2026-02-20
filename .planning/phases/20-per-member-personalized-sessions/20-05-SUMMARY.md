---
phase: 20-per-member-personalized-sessions
plan: 05
subsystem: ui
tags: [vue, quasar, composable, journey, session-player, duration-filter, pinia]

# Dependency graph
requires:
  - phase: 20-02
    provides: "Journey pipeline, JourneyService, duration-based block filtering"
  - phase: 20-03
    provides: "Journey API endpoints (session fetch, completion)"
  - phase: 20-04
    provides: "Journey module scaffolding, store, API composable, DurationPicker page"
provides:
  - "useJourneySession composable with duration-based block filtering and session lifecycle"
  - "JourneySession page reusing DayPlayer components for consistent session experience"
  - "JourneyProgressIndicator component showing per-duration semana advancement"
  - "JourneyProgressBar component adapting ProgressBar for variable block count"
  - "journeyStore.completeJourneySession action for journey completion flow"
affects: [20-06, 20-07, 20-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      "Journey session composable follows useSessionPlayer pattern without Deuteros choice",
      "Duration-based block filtering: 20min=2 blocks, 40min=3, 60min=4+",
      "Reuses training components (SplashScreen, CelebrationScreen, SessionSummary, BlockProgressionView)",
      "Post-completion flow: celebration -> summary -> progress indicator -> duration picker",
    ]

key-files:
  created:
    - "el-templo-app/src/modules/journey/composables/useJourneySession.ts"
    - "el-templo-app/src/modules/journey/pages/JourneySession.vue"
    - "el-templo-app/src/modules/journey/components/JourneyProgressIndicator.vue"
    - "el-templo-app/src/modules/journey/components/JourneyProgressBar.vue"
  modified:
    - "el-templo-app/src/modules/journey/stores/journeyStore.ts"

key-decisions:
  - "Journey sessions have no Deuteros choice -- duration determines visible blocks"
  - "Reuse sessionPlayerStore for progress persistence (same storage pattern as regular sessions)"
  - "JourneyProgressBar created instead of reusing ProgressBar (hardcoded to 4 blocks)"
  - "Post-session return navigates to duration picker for next session selection"
  - "Session completion updates activeJourney progress from API response for immediate UI update"

patterns-established:
  - "Journey session composable as simplified useSessionPlayer without Deuteros choice"
  - "Component reuse across journey and training modules via direct imports"

requirements-completed:
  [JOURNEY-SESSION-FLOW, JOURNEY-DURATION-FILTER, JOURNEY-COMPLETION]

# Metrics
duration: 4min
completed: 2026-02-20
---

# Phase 20 Plan 05: Journey Session Player Summary

**Journey session page with duration-based block filtering (20/40/60 min), reusing DayPlayer components, post-session progress indicator with per-duration semana tracking**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-20T17:50:13Z
- **Completed:** 2026-02-20T17:54:30Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created useJourneySession composable managing full session lifecycle with duration-based block filtering (20min=2, 40min=3, 60min=4+ blocks)
- Built JourneySession page reusing all DayPlayer components (SplashScreen, CelebrationScreen, SessionSummary, BlockProgressionView) for consistent session experience
- Created JourneyProgressIndicator showing per-duration semana advancement with progress bars after completion
- Extended journeyStore with completeJourneySession action, currentWeek tracking, and setCurrentWeek

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useJourneySession composable and update journeyStore** - `e589689` (feat)
2. **Task 2: Create JourneySession page and JourneyProgressIndicator** - `0c48ca2` (feat)

## Files Created/Modified

- `el-templo-app/src/modules/journey/composables/useJourneySession.ts` - Session player composable with duration-based block filtering, timer, exercise completion, progress persistence via sessionPlayerStore
- `el-templo-app/src/modules/journey/pages/JourneySession.vue` - Full session player reusing training components, journey-specific header badge, navigation guard, completion flow
- `el-templo-app/src/modules/journey/components/JourneyProgressIndicator.vue` - Post-session progress display with per-duration semana, progress bars, total sessions count
- `el-templo-app/src/modules/journey/components/JourneyProgressBar.vue` - Dynamic progress bar for variable block count (not hardcoded to 4)
- `el-templo-app/src/modules/journey/stores/journeyStore.ts` - Added completeJourneySession, currentWeek, setCurrentWeek

## Decisions Made

- Journey sessions have no Deuteros choice -- unlike regular Entrenamiento sessions where users pick DEUTEROS_1 or DEUTEROS_2, journey sessions use duration to determine which blocks are visible, simplifying the player flow
- Reused sessionPlayerStore for progress persistence -- journey sessions use the same Capacitor Preferences storage pattern with dayId keys, enabling session resume across app restarts
- Created JourneyProgressBar instead of reusing training ProgressBar -- the existing ProgressBar hardcodes 4 block labels; journey sessions have variable block count (2-4+)
- Post-session return navigates to duration picker (`/journey/duration`) so the member can immediately start another session with a different duration
- Session completion calls journeyStore.completeJourneySession which posts to `/api/journeys/complete` and updates the activeJourney progress from the API response, ensuring the progress indicator shows accurate semana values

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Journey session player fully functional: load session, filter blocks by duration, play through blocks, complete with RPE/notes, see progress
- Mi Camino integration (Plan 06) can now access journey completion data via the journeyStore
- Admin journey session management (Plans 07-08) can reference the same session format
- All TypeScript types compile cleanly

---

_Phase: 20-per-member-personalized-sessions_
_Completed: 2026-02-20_
