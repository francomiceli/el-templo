---
phase: 17-per-block-mobility-exercises
plan: 03
subsystem: admin-ui
tags: [vue, quasar, mobility, descanso-activo, swap-dialog, admin-editing]

# Dependency graph
requires:
  - phase: 17-per-block-mobility-exercises
    plan: 02
    provides: "mobilityExercise field in API response, mobility pool endpoint, mobility swap endpoint"
  - phase: 15-session-editing
    provides: "EditableBlockCard, ExerciseSwapDialog, useEditApi, prescription blur-save pattern"
provides:
  - "Descanso Activo section in admin EditableBlockCard for non-INITIUM blocks"
  - "ExerciseSwapDialog mobilityMode with route-relevant sorting and Relacionado badge"
  - "useEditApi fetchMobilityPool and swapMobilityExercise methods"
  - "SessionEditPage mobility swap and prescription event wiring"
  - "mobilityExercise and exerciseType on admin SessionBlock/SessionExercise types"
affects: [17-04 pdf-mobility-data]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mobility mode prop on ExerciseSwapDialog: mobilityMode=true switches pool fetch, sorting, badges, and action handler"
    - "Descanso Activo labeled section at bottom of block card with inline-editable prescription"
    - "Contraction helper functions (normalize, label, color) added to EditableBlockCard for mobility display"

key-files:
  created: []
  modified:
    - "el-templo-admin/src/types/session.ts"
    - "el-templo-admin/src/composables/useEditApi.ts"
    - "el-templo-admin/src/components/sessions/EditableBlockCard.vue"
    - "el-templo-admin/src/components/sessions/ExerciseSwapDialog.vue"
    - "el-templo-admin/src/pages/SessionEditPage.vue"

key-decisions:
  - "Reuse ExerciseSwapDialog with mobilityMode prop instead of separate component"
  - "Route-relevant exercises sorted first with green Relacionado badge in mobility mode"
  - "Category filter hidden in mobility mode (all MOVILIDAD exercises share one pattern)"
  - "Mobility prescription blur-save uses same updatePrescription API as main exercises"
  - "Contraction helpers duplicated in EditableBlockCard (not extracted to shared util) for component independence"

patterns-established:
  - "Mobility mode on swap dialog: props.mobilityMode switches fetch, sort, display, and action"
  - "Mobility events bubble from BlockCard to SessionEditPage: swap-mobility and update-mobility-prescription"

# Metrics
duration: 5min
completed: 2026-02-12
---

# Phase 17 Plan 03: Admin Descanso Activo UI Summary

**Descanso Activo section in admin block cards with mobility exercise name, contraction badge, editable prescription, and swap dialog with route-relevant MOVILIDAD exercises using Relacionado badges**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-12T14:33:07Z
- **Completed:** 2026-02-12T14:37:59Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Admin block cards show "DESCANSO ACTIVO" section at bottom of non-INITIUM blocks with mobility exercise name, contraction badge, and editable prescription (seconds or reps)
- ExerciseSwapDialog extended with mobilityMode prop: fetches from mobility pool, sorts route-relevant first, shows green "Relacionado" badge, hides category filter
- SessionEditPage wires swap-mobility and update-mobility-prescription events with full in-place reactivity (no page reload on prescription save)
- Admin types updated with mobilityExercise on SessionBlock and exerciseType on SessionExercise
- useEditApi gains fetchMobilityPool and swapMobilityExercise methods

## Task Commits

Each task was committed atomically:

1. **Task 1: Admin types + useEditApi mobility methods** - `6eb513e` (feat)
2. **Task 2: EditableBlockCard Descanso Activo section + ExerciseSwapDialog mobility mode** - `f752215` (feat)

## Files Created/Modified
- `el-templo-admin/src/types/session.ts` - Added mobilityExercise to SessionBlock, exerciseType to SessionExercise
- `el-templo-admin/src/composables/useEditApi.ts` - Added fetchMobilityPool and swapMobilityExercise methods
- `el-templo-admin/src/components/sessions/EditableBlockCard.vue` - Added Descanso Activo section with contraction helpers, swap button, editable prescription
- `el-templo-admin/src/components/sessions/ExerciseSwapDialog.vue` - Added mobilityMode prop, mobility pool fetch, route-relevant sorting, Relacionado badge, swapped-mobility emit
- `el-templo-admin/src/pages/SessionEditPage.vue` - Added mobility event handlers, mobilityMode state, prescription update wiring

## Decisions Made
- Reused ExerciseSwapDialog with mobilityMode prop: 80% of dialog UX is identical, avoids component duplication
- Route-relevant exercises (patternSource='pattern_1') sorted first in mobility mode with green "Relacionado" badge
- Category filter hidden in mobility mode since all MOVILIDAD exercises share one pattern
- Mobility prescription uses same updatePrescription API endpoint as main exercises (same backend, just different prescriptionId)
- Contraction helpers added directly to EditableBlockCard rather than extracting to shared utility: keeps component self-contained

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed missing route field in add-exercise placeholder**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** SessionEditPage onAddExercise created a placeholder SessionExercise without the `route` field, causing TS error after adding exerciseType to the type
- **Fix:** Added `route: null` to the placeholder object
- **Files modified:** el-templo-admin/src/pages/SessionEditPage.vue
- **Verification:** TypeScript compilation passes
- **Committed in:** 6eb513e (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Pre-existing type error exposed by type expansion. Trivial fix, no scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Admin UI complete: coaches can see, edit prescriptions, and swap mobility exercises
- Ready for Plan 04: PDF mobility data substitution can use mobilityExercise field from admin types
- Member app changes (DayPlayer Descanso Activo section) are already present as uncommitted changes from separate work

---
*Phase: 17-per-block-mobility-exercises*
*Completed: 2026-02-12*
