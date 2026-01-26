---
phase: 06-weekly-view
plan: 02
subsystem: ui
tags: [vue, quasar, carousel, scroll-snap, intersection-observer, pinia]

# Dependency graph
requires:
  - phase: 06-01
    provides: TypeScript types, weekStore, date utilities
provides:
  - WeekCarousel component with horizontal scroll and snap behavior
  - DayCard component with 5 state-based styling modes
  - useWeekData composable for parallel session fetching
affects: [06-03, 06-04, 06-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - CSS scroll-snap for carousel navigation
    - IntersectionObserver for detecting centered elements
    - Map-based session caching in composables
    - State-based component styling with computed classes

key-files:
  created:
    - el-templo-app/src/modules/training/components/WeekCarousel.vue
    - el-templo-app/src/modules/training/components/DayCard.vue
    - el-templo-app/src/modules/training/composables/useWeekData.ts
  modified: []

key-decisions:
  - "Use CSS scroll-snap instead of JS-based carousel for native performance"
  - "IntersectionObserver with 50% threshold for centered card detection"
  - "Map-based session storage in composable for efficient lookups"
  - "Auto-center on mount with scrollIntoView, smooth scroll on interaction"
  - "Adjacent card peek effect with 0.7 opacity for visual context"

patterns-established:
  - "Carousel pattern: scroll-snap + IntersectionObserver + store integration"
  - "State-based styling: computed classes from props/state combinations"
  - "Composable API pattern: reactive refs + async functions returned as object"

# Metrics
duration: 3min
completed: 2026-01-26
---

# Phase 6 Plan 02: Week Carousel with State-Based Day Cards

**Horizontal scrollable week carousel with CSS scroll-snap, auto-centered today, and state-based day card styling (today/completed/past/future/rest)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-26T20:53:30Z
- **Completed:** 2026-01-26T20:56:28Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- WeekCarousel component with scroll-snap and IntersectionObserver for auto-detection
- DayCard component with 5 distinct state styles (today-selected, today, completed, past, future, rest)
- useWeekData composable with parallel Promise.all fetching and graceful error handling
- Auto-centering on today's card with smooth scrollIntoView behavior
- Adjacent card peek effect with reduced opacity for visual context

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useWeekData composable for API fetching** - `598e91c` (feat)
2. **Task 2: Create DayCard component** - `9e94308` (feat)
3. **Task 3: Create WeekCarousel component** - `5bf4a57` (feat)

## Files Created/Modified

- `el-templo-app/src/modules/training/composables/useWeekData.ts` - Composable for fetching week sessions via GET /api/sessions/daily, handles Sundays, parallel fetching with Promise.all, graceful error handling per day
- `el-templo-app/src/modules/training/components/DayCard.vue` - Individual day card with props (day, isSelected), emits (select), state-based styling using Quasar CSS variables, displays block count and route
- `el-templo-app/src/modules/training/components/WeekCarousel.vue` - Horizontal scrolling container with CSS scroll-snap-type, IntersectionObserver for detecting centered card, auto-centers today on mount, updates store.selectedDate

## Decisions Made

1. **CSS scroll-snap over JS carousel** - Native browser behavior provides better performance and smoother UX than JavaScript-based sliding
2. **IntersectionObserver 50% threshold** - Card is considered centered when 50% visible, provides accurate detection without complex calculations
3. **Map-based session storage** - Using Map<string, Session|null> in composable allows O(1) lookups by date
4. **Auto vs smooth scroll behavior** - Use 'auto' on mount for immediate positioning, 'smooth' on user interaction for polished feel
5. **Adjacent card opacity 0.7** - Provides visual peek at neighboring days without overwhelming the focused card

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all components implemented smoothly with no blocking issues.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Week carousel foundation complete and ready for integration:
- WeekCarousel can be mounted in any view
- DayCard styling tested across all 5 states
- useWeekData ready for integration with weekStore.setWeekDays
- Next steps: Integrate carousel into main Training page, connect session fetching to actual API

No blockers or concerns.

---
*Phase: 06-weekly-view*
*Completed: 2026-01-26*
