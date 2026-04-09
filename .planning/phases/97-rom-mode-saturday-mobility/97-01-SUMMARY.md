---
phase: 97-rom-mode-saturday-mobility
plan: 01
subsystem: api
tags: [rom-mode, session-generation, day-modes, schema]
dependency_graph:
  requires: []
  provides: [rom-generator, day-modes-table, session-mode-column, day-modes-api]
  affects: [admin-service, member-routes, exercise-swap, session-validators]
tech_stack:
  added: []
  patterns: [separate-generator-bypassing-pipeline, day-mode-config-table, level-mapping-for-rom]
key_files:
  created:
    - el-templo-api/src/db/schema/day-modes.ts
    - el-templo-api/src/modules/sessions/rom-generator.ts
    - el-templo-api/src/db/migrations/0080_rom_mode_day_modes.sql
    - el-templo-api/test/unit/rom-generator.test.ts
  modified:
    - el-templo-api/src/db/schema/sessions.ts
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/modules/sessions/types.ts
    - el-templo-api/src/modules/sessions/service.ts
    - el-templo-api/src/modules/shared/training-constants.ts
    - el-templo-api/src/modules/sessions/validators/block-validator.ts
    - el-templo-api/src/modules/sessions/validators/session-validator.ts
    - el-templo-api/src/modules/sessions/pipeline/stage-5-format.ts
    - el-templo-api/src/modules/admin/service.ts
    - el-templo-api/src/modules/admin/routes.ts
    - el-templo-api/src/modules/admin/exercise-swap-service.ts
    - el-templo-api/src/modules/sessions/routes.ts
    - el-templo-admin/src/types/session.ts
decisions:
  - "ROM generator as separate module bypassing 7-stage SPOM pipeline (goal-plan-pipeline precedent)"
  - "Manual migration SQL (0080) to avoid interactive drizzle-kit prompts (Phase 86/90 precedent)"
  - "Session validators updated with ROM-aware checks (3 blocks valid, no INITIUM/ATHLOS checks for ROM)"
  - "ROM blocks use formatId=0 since they bypass the formats table lookup"
metrics:
  duration: 28min
  completed: "2026-04-09T01:30:00Z"
  tasks: 2
  files: 17
---

# Phase 97 Plan 01: ROM Mode API Foundation Summary

ROM session generator with body-zone exercise selection, day_modes configuration table, generateWeek ROM integration, admin day-modes CRUD, member-level mapping for ROM days, and exercise swap body-zone filtering.

## What Was Built

### Task 1: Schema + Types + ROM Generator + Day Modes Seeding

**Schema changes:**
- Added `session_mode` VARCHAR(10) column to `sessions` table (default 'regular')
- Created `day_modes` table with unique `day_of_week` index
- Migration 0080 seeds 6 day_modes rows (Mon-Fri regular, Sat rom)

**Type extensions:**
- `BlockRole` union extended with `ROM_LOWER`, `ROM_CORE`, `ROM_UPPER`
- `DaySession` interface includes optional `sessionMode` field
- `DAY_NAME_TO_NUMBER` constant added for day_modes lookups

**ROM Generator (`rom-generator.ts`):**
- Queries all MOVILIDAD exercises, filters by body zone via `mobilityRelated` field
- `ROM_ZONE_MOBILITY_MAP`: ROM_LOWER -> LS, ROM_CORE -> FL/TTB/MN, ROM_UPPER -> PL
- Difficulty filtering: alfa (1-3), delta (4-6) with graceful fallback on thin pools
- Fixed For Quality x3 format, shuffled [20,30,40] reps, 30s rest
- 9 unit tests covering structure, body-zone mapping, difficulty, format, and fallback

**Downstream fixes:**
- Session validators handle ROM sessions (3 blocks valid, skip INITIUM/ATHLOS checks)
- Block validator includes ROM roles in FORMAT_COMPATIBILITY map
- Pipeline stage-5-format handles ROM roles (unreachable but needed for exhaustiveness)
- `saveSession` and `reconstructSession` pass through `sessionMode`

### Task 2: generateWeek Integration + Day Modes API + Member Level Mapping + Exercise Swap

**generateWeek ROM integration:**
- Loads `day_modes` table at start of batch generation
- ROM days generate only alfa/delta sessions via `generateRomSession`
- Regular days continue through standard SPOM pipeline (unchanged)

**Admin API:**
- `GET /admin/sessions/day-modes` returns all 6 day mode rows
- `PUT /admin/sessions/day-modes` updates modes with validation (dayOfWeek 1-6, sessionMode enum)
- Both endpoints behind TRAINING_ROLES auth hook

**getSessions improvements:**
- `sessionMode` field in query select and response
- ROM blocks display zone names (Tren Inferior/Zona Media/Tren Superior) in routesSummary

**Exercise swap body-zone filtering:**
- `ExerciseSwapService.getExercisePool()` detects ROM block roles
- ROM blocks get dedicated `getRomExercisePool()` with mobilityRelated-based filtering
- Applies contraction, maxDifficulty, and exclude filters

**Member API level mapping (D-29):**
- `/sessions/daily`: checks day_modes, maps non-alfa to delta for ROM days
- `/sessions/weekly`: loads day_modes once, builds dayIds with effective level
- `sessionToResponse` includes `sessionMode` field

**Admin types:**
- `SessionSummary` includes optional `sessionMode` field

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed BlockRole exhaustiveness in validators and pipeline**
- **Found during:** Task 1
- **Issue:** Adding ROM_LOWER/ROM_CORE/ROM_UPPER to BlockRole type caused TS errors in `Record<BlockRole, ...>` maps in block-validator.ts, session-validator.ts, and stage-5-format.ts
- **Fix:** Added ROM entries to FORMAT_COMPATIBILITY, INTENSITY_RANGES, and roleToBlock switch. Updated session-validator to detect ROM sessions and skip regular-only checks.
- **Files modified:** block-validator.ts, session-validator.ts, stage-5-format.ts
- **Commit:** c2cd33fe

## Verification

- API TypeScript: compiles clean (0 errors)
- Admin TypeScript: 4 pre-existing errors (ProgramWizardDialog, session-pdf-builder) -- none from this plan
- Unit tests: 9 ROM generator tests pass, 671 total tests pass (37 files)
- Migration 0080 applied to both dev and test databases

## Self-Check: PASSED

- [x] el-templo-api/src/db/schema/day-modes.ts exists
- [x] el-templo-api/src/modules/sessions/rom-generator.ts exists
- [x] el-templo-api/src/db/migrations/0080_rom_mode_day_modes.sql exists
- [x] el-templo-api/test/unit/rom-generator.test.ts exists
- [x] Commit 3bd7d195 exists (RED tests)
- [x] Commit c2cd33fe exists (Task 1 GREEN)
- [x] Commit 655f52ca exists (Task 2)
