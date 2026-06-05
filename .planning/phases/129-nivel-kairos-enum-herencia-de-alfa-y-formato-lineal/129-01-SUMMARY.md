---
phase: 129-nivel-kairos-enum-herencia-de-alfa-y-formato-lineal
plan: 01
subsystem: database
tags:
  [
    drizzle,
    mysql-enum,
    migration,
    level-system,
    kairos,
    session-generation,
    vue,
  ]

# Dependency graph
requires:
  - phase: 99-session-generation
    provides: the level union/Record sources (training-constants, level-display) kept byte-identical across API/app
  - phase: 126-dag-progressions
    provides: latest committed migration 0139 (next free number is 0140)
provides:
  - "`kairos` is a first-class member level: present in the API users.level MySQL enum (migration 0140), every typed level union/Record across API/app/admin, and the kairos->alfa_delta level-group mapping"
  - "Migration 0140 additively widens users.level AND completed_sessions.session_level (additive, DEFAULT stays alfa, no row writes)"
  - "New ContentLevel type (Exclude<ExerciseLevel,'kairos'>) cleanly separates the member-level set (includes kairos) from the exercise-content level set (exercises.level enum, no kairos)"
  - "toContentLevel() helper encodes the kairos->Alfa content inheritance (D-03) in one place for Plan 02 to build on"
affects:
  [
    129-02 kairos generation layer,
    130 kairos default+selector,
    tree-progress,
    session-pipeline,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ContentLevel = Exclude<ExerciseLevel,'kairos'>: distinguishes member levels from exercise-content levels at the type layer"
    - "toContentLevel(): single chokepoint encoding kairos->Alfa content inheritance (D-03)"

key-files:
  created:
    - el-templo-api/src/db/migrations/0140_add_kairos_level_enum.sql
  modified:
    - el-templo-api/src/db/schema/users.ts
    - el-templo-api/src/db/schema/completed-sessions.ts
    - el-templo-api/src/modules/sessions/types.ts
    - el-templo-api/src/modules/sessions/routes.ts
    - el-templo-api/src/modules/shared/training-constants.ts
    - el-templo-api/src/modules/progression/service.ts
    - el-templo-api/src/modules/sessions/pipeline/utils/level-mapping.ts
    - el-templo-api/src/modules/sessions/pipeline/initium-pipeline.ts
    - el-templo-api/src/modules/sessions/pipeline/stage-6-exercises.ts
    - el-templo-api/src/modules/sessions/fallback/types.ts
    - el-templo-api/src/modules/sessions/fallback/exercise-fallback.ts
    - el-templo-api/src/modules/tree-progress/service.ts
    - el-templo-app/src/modules/training/level-display.ts
    - el-templo-app/src/modules/training/utils/levelDisplay.ts
    - el-templo-app/src/modules/progression/types.ts
    - el-templo-app/src/modules/onboarding/types.ts
    - el-templo-admin/src/constants/levels.ts
    - el-templo-admin/src/composables/useMembersApi.ts

key-decisions:
  - "kairos added FIRST in every level enumeration (order kairos,alfa,delta,sigma,omega,spartan), DEFAULT stays alfa (default change deferred to phase 130)"
  - "kairos->levelGroup alfa_delta via explicit switch case (D-02); no new LevelGroup added"
  - "Introduced ContentLevel + toContentLevel() rather than putting a meaningless kairos entry into exercise-content maps — exercises.level has no kairos content (D-03)"
  - "Widened completed_sessions.session_level in the same migration (discovered: presencial check-in snapshots users.level, which can now be kairos)"

patterns-established:
  - "ContentLevel type separates member levels from exercise-content levels"
  - "toContentLevel() as the single kairos->Alfa inheritance encoding point"

requirements-completed: [KAIROS-01]

# Metrics
duration: ~35min
completed: 2026-06-05
---

# Phase 129 Plan 01: Kairos enum foundation Summary

**`kairos` is now a first-class member level across the API MySQL enum (migration 0140), every typed level union/Record in API/app/admin, and the kairos->alfa_delta level-group map — with a new ContentLevel type cleanly separating member levels from kairos-less exercise-content levels.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-06-05T04:59:51Z
- **Tasks:** 2/2
- **Files modified:** 17 (+1 migration created)

## Accomplishments

- Added `kairos` FIRST to the API `levelEnum` (`users.level`) and wrote additive migration **0140** widening the MySQL enum to `('kairos','alfa','delta','sigma','omega','spartan')`, keeping `DEFAULT 'alfa'`. Migration value list/order is byte-identical to the TS schema (enum-drift lesson 125/126), no semicolons in any comment line.
- Threaded `kairos` through every typed level union/Record across all three apps: API `ExerciseLevel`, `TRAINING_LEVELS`, `LEVEL_DIFFICULTY_MAP`, `GREEK_LETTER_MAP`; app `TRAINING_LEVELS`/`Level` + `Record<Level>` display+greek maps + loose util maps + progression/onboarding contract unions; admin `LEVEL_ORDER` (first) + `SessionLevelKey`.
- Added explicit `case "kairos": return "alfa_delta"` to `levelToLevelGroup` (D-02).
- Introduced `ContentLevel = Exclude<ExerciseLevel,'kairos'>` and `toContentLevel()` to encode the kairos->Alfa content inheritance (D-03) once, applied at every member-level->content boundary (stage-6, fallback ladder, tree-progress, level-mapping maps).
- All local gates green: API `pnpm exec tsc --noEmit`, app `lint`+`build`, admin `lint`+`build`.

## Task Commits

1. **Task 1: Add kairos to API levelEnum + migration 0140** - `fc97feae` (feat)
2. **Task 2: Thread kairos through every typed level union + map to alfa_delta** - `fca0bd95` (feat)

## Files Created/Modified

- `el-templo-api/src/db/migrations/0140_add_kairos_level_enum.sql` - additive ALTER on users.level + completed_sessions.session_level (kairos first, DEFAULT alfa unchanged)
- `el-templo-api/src/db/schema/users.ts` - levelEnum gains kairos first; DEFAULT unchanged
- `el-templo-api/src/db/schema/completed-sessions.ts` - session_level enum widened in lock-step (presencial check-in snapshots kairos)
- `el-templo-api/src/modules/sessions/types.ts` - ExerciseLevel gains kairos; new ContentLevel type
- `el-templo-api/src/modules/sessions/routes.ts` - explicit kairos->alfa_delta case
- `el-templo-api/src/modules/shared/training-constants.ts` - kairos in TRAINING_LEVELS + LEVEL_DIFFICULTY_MAP (reuses alfa's 3)
- `el-templo-api/src/modules/progression/service.ts` - kairos in GREEK_LETTER_MAP (reuses alfa glyph)
- `el-templo-api/src/modules/sessions/pipeline/utils/level-mapping.ts` - ContentLevel + toContentLevel(); content maps retyped to ContentLevel
- `el-templo-api/src/modules/sessions/pipeline/initium-pipeline.ts` - INITIUM_LEVELS retyped to ContentLevel
- `el-templo-api/src/modules/sessions/pipeline/stage-6-exercises.ts` - resolves memberLevel via toContentLevel at the content boundary
- `el-templo-api/src/modules/sessions/fallback/types.ts` + `exercise-fallback.ts` - fallback ladder retyped to ContentLevel
- `el-templo-api/src/modules/tree-progress/service.ts` - levelCeiling resolves kairos->alfa
- `el-templo-app/src/modules/training/level-display.ts` - kairos in TRAINING_LEVELS + Record<Level> greek/display maps
- `el-templo-app/src/modules/training/utils/levelDisplay.ts` - kairos in loose greek/name maps
- `el-templo-app/src/modules/progression/types.ts` + `onboarding/types.ts` - kairos added to contract unions for parity
- `el-templo-admin/src/constants/levels.ts` - kairos first in LEVEL_ORDER
- `el-templo-admin/src/composables/useMembersApi.ts` - kairos in SessionLevelKey contract union

## Decisions Made

- kairos reuses Alfa's difficulty cap (3) and Alfa's Greek glyph (α) since it inherits Alfa content (D-03).
- No new `LevelGroup` value (kairos reuses `alfa_delta`, D-02).
- No selector/default UI changes (deferred to phase 130 per CONTEXT.md).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Widen completed_sessions.session_level enum (schema + migration)**

- **Found during:** Task 1 (API tsc after adding kairos to users.level)
- **Issue:** `attendance/service.ts` snapshots `user.level` (now `kairos | ...`) into `completed_sessions.session_level`, a separate narrower MySQL enum (alfa..spartan). tsc failed (TS2769); at runtime a kairos member's presencial check-in would be rejected/truncated by the narrower column enum, and CI rebuilds the test DB from committed migrations.
- **Fix:** Widened `completedSessions.sessionLevel` in `completed-sessions.ts` (kairos first, same order) and added a second additive `ALTER TABLE completed_sessions MODIFY session_level ...` to migration 0140. Additive, no DEFAULT (column has none), no row writes.
- **Files modified:** el-templo-api/src/db/schema/completed-sessions.ts, el-templo-api/src/db/migrations/0140_add_kairos_level_enum.sql
- **Verification:** API tsc passes; migration has 2 ALTER statements, no semicolons in comments.
- **Committed in:** fc97feae (Task 1 commit)

**2. [Rule 3 - Blocking] Introduce ContentLevel to separate member levels from exercise-content levels**

- **Found during:** Task 2 (API tsc after widening ExerciseLevel)
- **Issue:** Widening `ExerciseLevel` cascaded into ~12 errors where the type flows into `exercises.level` queries (a narrower DB enum with no kairos) and `Record<ExerciseLevel,...>` content maps (now non-exhaustive). Putting a kairos entry into content maps would be semantically wrong — kairos has no own exercise content (D-03).
- **Fix:** Added `ContentLevel = Exclude<ExerciseLevel,'kairos'>` + `toContentLevel()` (kairos->alfa). Retyped the fallback ladder, INITIUM_LEVELS, level-mapping content maps/progression, and tree-progress LEVEL_ORDER to ContentLevel. Applied `toContentLevel()` at the two member-level->content boundaries (stage-6 `getLinearDifficultyTarget`, tree-progress `levelCeiling`), and adjusted the high-intensity-shift trace guard so kairos->alfa content resolution is not mistaken for an intensity shift.
- **Files modified:** types.ts, level-mapping.ts, initium-pipeline.ts, stage-6-exercises.ts, fallback/types.ts, fallback/exercise-fallback.ts, tree-progress/service.ts
- **Verification:** API tsc passes (exit 0).
- **Committed in:** fca0bd95 (Task 2 commit)

**3. [Rule 2 - Missing critical] Add kairos to app/admin contract unions not enumerated in the plan**

- **Found during:** Task 2
- **Issue:** The plan's interface list enumerated the canonical level modules but not the app's `progression/types.ts`, `onboarding/types.ts` (TemploLevel) or the admin `SessionLevelKey` contract unions. These mirror `users.level`/session-level data which can now be kairos; leaving them out is a contract-parity gap.
- **Fix:** Added kairos to those four contract unions. Did NOT touch admin selector/preview UI (`DISPLAY_LEVELS`, MemberFormDialog options) — that is phase 130 per the plan.
- **Files modified:** el-templo-app/src/modules/progression/types.ts, el-templo-app/src/modules/onboarding/types.ts, el-templo-admin/src/composables/useMembersApi.ts (level-display.ts/levelDisplay.ts/constants were in scope)
- **Verification:** app lint+build, admin lint+build all pass.
- **Committed in:** fca0bd95 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 missing-critical/parity)
**Impact on plan:** All three were required for correctness and to keep tsc/build green. The ContentLevel split is a small, type-honest abstraction that Plan 02 builds directly on (toContentLevel is the kairos->Alfa inheritance encoding D-03 needs). No selector/default UI was touched (correctly deferred to phase 130). No scope creep.

## Issues Encountered

- `progression/service.ts` GREEK_LETTER_MAP used `\uXXXX` escapes (rendered as glyphs in Read); had to match raw bytes with anchored Edit. Resolved.
- Local test policy honored: ran API `tsc` + app/admin `lint`+`build` (vue-tsc absent as expected); did NOT run vitest locally — integration suite runs in CI.

## User Setup Required

None - no external service configuration required. Migration 0140 applies automatically via the project runner (`pnpm db:migrate` locally, `node dist/db/run-migrations.js` in the deploy pipeline).

## Next Phase Readiness

- KAIROS-01 structurally complete: kairos is a valid level everywhere, mapped to alfa_delta.
- Plan 02 (generation layer) can hang Kairos behavior off `memberLevel === 'kairos'` and `toContentLevel()`.
- **Not yet shipped:** migration 0140 must run in CI/prod (push to origin/staging for CI is a human gate — staging-first, no push performed here). Default change + selector UI remain phase 130.

## Self-Check: PASSED

- FOUND: el-templo-api/src/db/migrations/0140_add_kairos_level_enum.sql
- FOUND: .planning/phases/129-.../129-01-SUMMARY.md
- FOUND commit: fc97feae (Task 1)
- FOUND commit: fca0bd95 (Task 2)

---

_Phase: 129-nivel-kairos-enum-herencia-de-alfa-y-formato-lineal_
_Completed: 2026-06-05_
