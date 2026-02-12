---
phase: 16-pdf-generation-format-config-app-exercise-tracking
plan: 06
subsystem: ui
tags: [vue, quasar, composables, session-player, api, drizzle, exercise-completion]

# Dependency graph
requires:
  - phase: 16-05
    provides: Per-exercise completion tracking in sessionPlayerStore and useSessionPlayer
  - phase: 10-session-completion
    provides: Session completion API route and useSessionCompletion composable
  - phase: 07-day-player
    provides: DayPlayer page, ExerciseCard, ExerciseList components
provides:
  - Per-exercise completion checkmarks in DayPlayer UI
  - Visual feedback for completed exercises (muted styling, strikethrough, green checkmark)
  - Exercise completion progress indicator (count + linear progress bar)
  - exercisesCompleted JSON column in completed_sessions DB table
  - Session completion API accepts and stores per-exercise completion data
  - Frontend sends exercisesCompleted alongside blocksCompleted on session finish
affects: [16-07-verification, weekly-view-consistency]

# Tech tracking
tech-stack:
  added: []
  patterns: [exercise completion UI pattern, nullable JSON column for backward compat]

key-files:
  created:
    - el-templo-api/src/db/migrations/0011_exercises_completed.sql
  modified:
    - el-templo-app/src/modules/training/components/player/ExerciseCard.vue
    - el-templo-app/src/modules/training/components/player/ExerciseList.vue
    - el-templo-app/src/modules/training/pages/DayPlayer.vue
    - el-templo-app/src/modules/training/composables/useSessionCompletion.ts
    - el-templo-api/src/db/schema/completed-sessions.ts
    - el-templo-api/src/modules/sessions/schemas.ts
    - el-templo-api/src/modules/sessions/routes.ts

key-decisions:
  - "ExerciseCard uses row layout with details on left, checkmark on right for easy tapping"
  - "ExerciseList shows checkmark in header for both collapsed and expanded views"
  - "exercisesCompleted column nullable for backward compatibility with existing records"
  - "exercisesCompleted schema uses type ['object', 'null'] with integer array values"

patterns-established:
  - "Completion checkmark pattern: radio_button_unchecked (grey) -> check_circle (positive/green)"
  - "Exercise progress indicator: count text + q-linear-progress bar above exercise list"

# Metrics
duration: 4min
completed: 2026-02-11
---

# Phase 16 Plan 06: App Exercise Completion UI Summary

**Per-exercise completion checkmarks in DayPlayer with exercise progress bar and exercisesCompleted API persistence**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-12T01:32:34Z
- **Completed:** 2026-02-12T01:36:44Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Exercise cards show tappable completion checkmarks (grey circle -> green check) with muted styling
- Exercise list headers display per-exercise completion state for quick scanning
- DayPlayer shows exercise progress indicator (completed/total count + linear progress bar)
- completed_sessions table extended with exercisesCompleted JSON column (nullable)
- Session completion API accepts and stores per-exercise data alongside blocksCompleted
- Frontend passes completedExercises from useSessionPlayer to API on session finish

## Task Commits

Each task was committed atomically:

1. **Task 1: Add exercise completion UI to DayPlayer components** - `afe45a3` (feat)
2. **Task 2: Extend session completion API with exercisesCompleted** - `423090a` + `e905c97` (feat + fix)

## Files Created/Modified
- `el-templo-app/src/modules/training/components/player/ExerciseCard.vue` - Added completed prop, toggle-complete emit, checkmark icon with green/grey states, row layout with details + check, muted/strikethrough styling when complete
- `el-templo-app/src/modules/training/components/player/ExerciseList.vue` - Added completedExercises prop, toggle-exercise-complete emit, per-exercise checkmark in collapse header, completed name styling
- `el-templo-app/src/modules/training/pages/DayPlayer.vue` - Wired completedExercises/counts from useSessionPlayer, added exercise progress indicator, toggle-exercise-complete handler, passes exercisesCompleted to completion API
- `el-templo-app/src/modules/training/composables/useSessionCompletion.ts` - Added exercisesCompleted to CompletionData interface and API payload
- `el-templo-api/src/db/schema/completed-sessions.ts` - Added exercisesCompleted JSON column (nullable)
- `el-templo-api/src/db/migrations/0011_exercises_completed.sql` - Migration to add exercises_completed column
- `el-templo-api/src/modules/sessions/schemas.ts` - Added exercisesCompleted to CompleteSessionInput type and JSON schema validation
- `el-templo-api/src/modules/sessions/routes.ts` - Destructure and store exercisesCompleted in both insert and update paths of completion route

## Decisions Made

**1. ExerciseCard uses row layout with details on left, checkmark on right**
- Easy tap target for mobile users
- Details section gets opacity 0.5 and name gets strikethrough when complete
- 0.3s transitions for smooth state changes

**2. ExerciseList shows checkmark in header for both collapsed and expanded views**
- Users can mark exercises complete without expanding the detail view
- Click.stop prevents checkmark tap from toggling the expansion item

**3. exercisesCompleted column nullable for backward compatibility**
- Existing completed_sessions rows won't break (NULL value)
- New completions include exercise data; old ones have null
- No migration of existing data required

**4. exercisesCompleted schema uses type ['object', 'null'] with integer array values**
- Fastify JSON schema validation ensures correct shape before database insert
- additionalProperties with integer arrays validates the Record<string, number[]> structure

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Linter reverted staged changes before commit**
- **Found during:** Task 2
- **Issue:** A linter process reverted edits to useSessionCompletion.ts, routes.ts, schemas.ts, and completed-sessions.ts between staging and commit, resulting in only the migration file being committed
- **Fix:** Re-applied changes (linter auto-restored them) and created a follow-up commit (e905c97) with the remaining 5 files
- **Files modified:** All Task 2 files
- **Committed in:** e905c97

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor commit splitting due to external linter. All planned functionality delivered.

## Issues Encountered

None beyond the linter timing issue documented in deviations.

## User Setup Required

**Database migration required.** Run the migration to add the exercises_completed column:
```sql
ALTER TABLE completed_sessions ADD COLUMN exercises_completed JSON;
```
Migration file: `el-templo-api/src/db/migrations/0011_exercises_completed.sql`

## Next Phase Readiness

- Exercise completion UI fully wired in DayPlayer
- API accepts and stores per-exercise completion data
- Auto-advance on all-complete works (from Plan 05 logic)
- Manual "Listo" button still works as skip
- Weekly View consistency maintained (completion still uses same API endpoint)

## Self-Check: PASSED

**Files:**
- FOUND: el-templo-app/src/modules/training/components/player/ExerciseCard.vue
- FOUND: el-templo-app/src/modules/training/components/player/ExerciseList.vue
- FOUND: el-templo-app/src/modules/training/pages/DayPlayer.vue
- FOUND: el-templo-app/src/modules/training/composables/useSessionCompletion.ts
- FOUND: el-templo-api/src/db/schema/completed-sessions.ts
- FOUND: el-templo-api/src/db/migrations/0011_exercises_completed.sql
- FOUND: el-templo-api/src/modules/sessions/schemas.ts
- FOUND: el-templo-api/src/modules/sessions/routes.ts

**Commits:**
- FOUND: afe45a3 (Task 1 - Exercise completion UI)
- FOUND: 423090a (Task 2 - Migration file)
- FOUND: e905c97 (Task 2 - Schema/routes/frontend payload)

---
*Phase: 16-pdf-generation-format-config-app-exercise-tracking*
*Completed: 2026-02-12*
