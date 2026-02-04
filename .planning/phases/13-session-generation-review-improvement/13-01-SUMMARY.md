---
phase: 13-session-generation-review-improvement
plan: 01
subsystem: api, database
tags: [drizzle, mysql, session-generation, linear-difficulty, exercises]

# Dependency graph
requires:
  - phase: 05-session-generation
    provides: Exercise fallback ladder, stage-6 pipeline
provides:
  - Linear difficulty scale (1-12) in exercises table
  - Dificultad Lineal column in Ejercicios.csv
  - Nivel Superior mapping to next level at 85%+ intensity
  - Updated exercise selection using dificultadLineal
affects: [13-02, 13-03, session validation, exercise selection]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Linear difficulty calculation: LEVEL_BASE + bucket"
    - "Nivel Superior level shift at 85%+ intensity"

key-files:
  created:
    - "el-templo-api/src/db/migrations/0006_add_linear_difficulty.sql"
  modified:
    - "docs/session-logic/[Planificaciones] - Base de Datos - Ejercicios.csv"
    - "el-templo-api/src/db/schema/exercises.ts"
    - "el-templo-api/src/modules/sessions/pipeline/stage-6-exercises.ts"
    - "el-templo-api/src/modules/sessions/fallback/exercise-fallback.ts"
    - "el-templo-api/src/modules/sessions/fallback/types.ts"
    - "el-templo-api/src/db/seed-spom.ts"

key-decisions:
  - "Use dificultadLineal column instead of calculating on-the-fly"
  - "Nivel Superior triggers at 85%+ intensity (per SPOM-Intensidad.csv)"
  - "Linear scale: Alfa 1-3, Delta 4-6, Sigma 7-8, Omega 9-10, Spartan 11-12"

patterns-established:
  - "Linear difficulty calculation: LEVEL_LINEAR_BASE[level] + bucket"
  - "Level shift on high intensity: next level's first difficulty"

# Metrics
duration: 7min
completed: 2026-02-04
---

# Phase 13 Plan 01: Linear Difficulty Scale Summary

**Linear difficulty scale (1-12) implemented in exercises table and pipeline, with Nivel Superior mapping to next level at 85%+ intensity**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-04T21:39:21Z
- **Completed:** 2026-02-04T21:46:29Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Added Dificultad Lineal column (1-12) to Ejercicios.csv with 1489 exercises mapped
- Updated exercises schema with dificultadLineal field and index
- Created database migration 0006_add_linear_difficulty.sql
- Implemented getLinearDifficultyTarget() function for bucket-to-linear mapping
- Updated fallback ladder to query dificultad_lineal column
- Nivel Superior at 85%+ correctly shifts to next level's first difficulty

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Dificultad Lineal column to CSV and schema** - `1f995f1` (feat)
2. **Task 2: Update pipeline to use linear difficulty** - `12e50b1` (feat)
3. **Task 3: Update seed script for linear difficulty** - `b37d48d` (feat)

## Files Created/Modified
- `docs/session-logic/[Planificaciones] - Base de Datos - Ejercicios.csv` - Added Dificultad Lineal column
- `el-templo-api/src/db/schema/exercises.ts` - Added dificultadLineal field with index
- `el-templo-api/src/db/migrations/0006_add_linear_difficulty.sql` - Migration with ALTER TABLE and UPDATE
- `el-templo-api/src/modules/sessions/pipeline/stage-6-exercises.ts` - getLinearDifficultyTarget() and linear scale mapping
- `el-templo-api/src/modules/sessions/fallback/exercise-fallback.ts` - Query dificultad_lineal column
- `el-templo-api/src/modules/sessions/fallback/types.ts` - maxDificultadLineal in ExerciseRequirements
- `el-templo-api/src/db/seed-spom.ts` - Updated path and Dificultad Lineal mapping

## Decisions Made
- **Linear scale formula:** `LEVEL_LINEAR_BASE[level] + bucket` where bases are: alfa=0, delta=3, sigma=6, omega=8, spartan=10
- **Nivel Superior threshold:** 85% intensity (per SPOM-Intensidad.csv shows "Nivel Superior 1" at 85-95%)
- **Level shift behavior:** At 85%+, target next level's first linear difficulty (e.g., Alfa -> Delta difficulty 4)
- **Seed path update:** Changed DOCS_DIR from `docs/` to `docs/session-logic/` for CSV files

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None - compilation and verification passed on all tasks.

## User Setup Required
After code deployment, run migration manually:
```sql
-- Apply migration 0006_add_linear_difficulty.sql to production database
ALTER TABLE `exercises` ADD COLUMN `dificultad_lineal` int NOT NULL DEFAULT 1;
UPDATE `exercises` SET `dificultad_lineal` = CASE
  WHEN `level` = 'alfa' THEN `difficulty`
  WHEN `level` = 'delta' THEN `difficulty` + 3
  WHEN `level` = 'sigma' THEN `difficulty` + 6
  WHEN `level` = 'omega' THEN `difficulty` + 8
  WHEN `level` = 'spartan' THEN `difficulty` + 10
  ELSE `difficulty`
END;
CREATE INDEX `exercises_dificultad_lineal_idx` ON `exercises` (`dificultad_lineal`);
```

Or reseed with: `pnpm seed:spom`

## Next Phase Readiness
- Linear difficulty scale ready for validation in Phase 13-02
- Pipeline uses maxDificultadLineal for exercise selection
- Ready to compare algorithm output with coach-built examples

---
*Phase: 13-session-generation-review-improvement*
*Completed: 2026-02-04*
