---
phase: 80-tu-dia-daily-game-plan
plan: 02
subsystem: ui
tags: [vue, quasar, progression, segment, personalization, cards, mi-camino]

# Dependency graph
requires:
  - phase: 80-tu-dia-daily-game-plan
    provides: GET /progression/weekly-summary, WeeklySummary type, fetchWeeklySummary composable, UserProfile.segment
  - phase: 79-behavioral-segmentation
    provides: MemberSegment type and segment on /auth/me response
provides:
  - 6 Tu Dia card components (SegmentGreeting, SessionCtaCard, BookingStatusCard, WeeklyProgressCard, RestDayCard, WeeklySummaryCard)
  - Reorganized MiCamino.vue with segment-driven card ordering
  - Simplified GeneralContent.vue (stats/chart/evaluation only)
affects: [80-03 (RPE contextual message), 81 (streaks engagement)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Segment-driven card ordering via computed CardId array and template v-for"
    - "useRouter() import for type-safe routing in card components (avoids vue-tsc $router errors)"
    - "Rest day tip rotation via day-of-epoch modulo"

key-files:
  created:
    - el-templo-app/src/modules/progression/components/SegmentGreeting.vue
    - el-templo-app/src/modules/progression/components/SessionCtaCard.vue
    - el-templo-app/src/modules/progression/components/BookingStatusCard.vue
    - el-templo-app/src/modules/progression/components/WeeklyProgressCard.vue
    - el-templo-app/src/modules/progression/components/RestDayCard.vue
    - el-templo-app/src/modules/progression/components/WeeklySummaryCard.vue
  modified:
    - el-templo-app/src/modules/progression/pages/MiCamino.vue
    - el-templo-app/src/modules/progression/components/GeneralContent.vue

key-decisions:
  - "useRouter() import instead of template $router for vue-tsc type safety in card components"
  - "Card ordering uses computed CardId array with template v-for for dynamic segment-driven reordering"
  - "Rest tip rotation uses Math.floor(Date.now() / 86400000) % length for deterministic daily rotation"
  - "q-linear-progress track-color set via :deep() CSS override since cream-dark is not a Quasar palette color"

patterns-established:
  - "Segment-driven UI pattern: same components for all segments, different ordering via computed array"
  - "Card component pattern: q-card flat bordered with 12px border-radius, useRouter for navigation"

requirements-completed: [ENG-08, ENG-10]

# Metrics
duration: 6min
completed: 2026-03-24
---

# Phase 80 Plan 02: Tu Dia Card Components + MiCamino Reorganization Summary

**6 segment-driven card components with personalized daily briefing layout, replacing static welcome header and generic CTAs with contextual greeting, enhanced session CTA, booking status, weekly progress, rest day tips, and weekly summary**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-24T19:09:31Z
- **Completed:** 2026-03-24T19:16:17Z
- **Tasks:** 2 (Task 3 human-verify pending)
- **Files modified:** 11

## Accomplishments

- Created 6 new Vue 3 SFC card components matching UI-SPEC exactly: SegmentGreeting, SessionCtaCard, BookingStatusCard, WeeklyProgressCard, RestDayCard, WeeklySummaryCard
- Reorganized MiCamino.vue into personalized daily briefing with segment-driven card ordering (en_riesgo/nuevo_guerrero/ghost see booking first; others see session first)
- Refactored GeneralContent.vue to stats/chart/evaluation only, removing CTA cards now handled by dedicated components
- Deleted TuCaminoCard.vue (functionality absorbed by SegmentGreeting with richer segment-driven messaging)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create all 6 Tu Dia card components** - `60b44452` (feat)
2. **Task 2: Reorganize MiCamino, refactor GeneralContent, delete TuCaminoCard** - `70eb7932` (feat)
3. **Task 3: Visual verification** - PENDING (human-verify checkpoint)

## Files Created/Modified

- `el-templo-app/src/modules/progression/components/SegmentGreeting.vue` - Segment-driven greeting header with member name, contextual message, date, LevelDisplay
- `el-templo-app/src/modules/progression/components/SessionCtaCard.vue` - Enhanced session CTA with today's route name, personalizada chip, completed state with RPE/duration
- `el-templo-app/src/modules/progression/components/BookingStatusCard.vue` - Booking status with countdown timer for physical branch members
- `el-templo-app/src/modules/progression/components/WeeklyProgressCard.vue` - Progress bar showing sessions vs budget with motivational text
- `el-templo-app/src/modules/progression/components/RestDayCard.vue` - Rest day indicator with 6 rotating recovery tips
- `el-templo-app/src/modules/progression/components/WeeklySummaryCard.vue` - Weekly aggregate stats card with loading/error/empty states
- `el-templo-app/src/modules/progression/pages/MiCamino.vue` - Complete rewrite: segment greeting, Tu Dia cards with segment ordering, weekly progress, weekly summary, then existing stats/RPE/evaluation
- `el-templo-app/src/modules/progression/components/GeneralContent.vue` - Stripped to stats/chart/evaluation only (CTAs removed)
- `el-templo-app/src/modules/onboarding/components/TuCaminoCard.vue` - DELETED

## Decisions Made

- Used `useRouter()` import instead of template `$router` in SessionCtaCard and BookingStatusCard for type-safe routing (avoids vue-tsc template errors)
- Card ordering implemented as computed `CardId[]` array with `template v-for` for clean segment-driven reordering
- Rest day tip rotation uses deterministic `Math.floor(Date.now() / 86400000) % length` -- same tip all day, changes daily
- WeeklyProgressCard uses `:deep(.q-linear-progress__track)` CSS override for $cream-dark track color since it's not a registered Quasar palette color

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed vue-tsc $router type errors in card components**
- **Found during:** Task 1 (type checking)
- **Issue:** Using `$router.push()` in template causes vue-tsc TS2339 errors in SFC components
- **Fix:** Used `useRouter()` composable import with `router.push()` instead
- **Files modified:** SessionCtaCard.vue, BookingStatusCard.vue
- **Committed in:** 70eb7932 (Task 2 commit, since fix applied during router integration)

**2. [Rule 1 - Bug] Fixed q-linear-progress track-color using non-existent palette color**
- **Found during:** Task 1 (WeeklyProgressCard creation)
- **Issue:** `track-color="cream-dark"` would fail since cream-dark is a SCSS variable, not a Quasar palette color
- **Fix:** Removed track-color prop, used `:deep(.q-linear-progress__track)` CSS override with `$cream-dark`
- **Files modified:** WeeklyProgressCard.vue
- **Committed in:** 60b44452 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correct TypeScript compilation and visual rendering. No scope creep.

## Issues Encountered

None.

## Pending Verification

**Task 3 (human-verify checkpoint)** is pending. The user needs to visually verify the Tu Dia daily game plan on the Mi Camino page in the member app. See plan Task 3 for full verification checklist.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 6 Tu Dia card components created and integrated into MiCamino.vue
- Segment-driven card ordering working with computed CardId array
- Weekly summary card wired to progressionStore data from Plan 01
- Plan 03 (RPE contextual message) already completed in parallel
- Phase 81 (streaks) can add streak display to WeeklySummaryCard where `<!-- streak: Phase 81 -->` comment marks the slot

## Known Stubs

- **BookingStatusCard.vue**: `has-booking` prop always `false` and `next-class-time` always `null` in MiCamino.vue -- booking API does not exist yet. The card renders in "no booking" state as an MVP placeholder. Future plan will wire actual booking data when the booking query API is built.

## Self-Check: PASSED

All 8 files verified present (6 created, 2 modified). TuCaminoCard.vue confirmed deleted. Both commits verified in git log (60b44452, 70eb7932).

---

_Phase: 80-tu-dia-daily-game-plan_
_Completed: 2026-03-24_
