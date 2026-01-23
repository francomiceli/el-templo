---
phase: 04-spom-engine
plan: 02
subsystem: database
tags: [csv-parse, data-import, seeding, spom, periodization]

# Dependency graph
requires:
  - phase: 04-01
    provides: 9 SPOM database schemas with FK relationships and indexes
provides:
  - SPOM data import script with CSV/JSON parsing
  - 4792 rows across 9 tables (routes, intensity, contraction, spom_rules, rotator, formats, compatibility, exercises, config)
  - Hash fingerprints for data validation
  - Idempotent seed operation (clear and reseed)
affects: [05-session-generation]

# Tech tracking
tech-stack:
  added:
    - csv-parse: CSV parsing with streaming support
  patterns:
    - Batch insert for large datasets (1000 row batches)
    - Hash fingerprinting for data validation
    - Map-based FK lookup for efficient foreign key resolution
    - Deduplication via Set for handling CSV duplicates

key-files:
  created:
    - el-templo-api/src/db/seed-spom.ts
  modified:
    - el-templo-api/package.json
    - el-templo-api/src/db/schema/format-compatibility.ts

key-decisions:
  - "Batch inserts of 1000 rows for memory efficiency"
  - "Deduplication for weekly rotator to handle CSV format"
  - "Block enum updated to include initium/athlos/epikos"
  - "Hash fingerprints for reproducibility verification"

patterns-established:
  - "CSV parsing with csv-parse library and streaming"
  - "Complex CSV parsing with manual column indexing"
  - "JSON file parsing for non-CSV data files"

# Metrics
duration: 5min
completed: 2026-01-23
---

# Phase 4 Plan 02: SPOM Data Import Summary

**Data import script seeding 4792 rows across 9 SPOM tables from CSV/JSON files with batch inserts and hash fingerprinting**

## Performance

- **Duration:** 5 min
- **Started:** 2026-01-23T22:10:46Z
- **Completed:** 2026-01-23T22:15:56Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Installed csv-parse dependency for CSV parsing
- Created seed-spom.ts with complete data import pipeline
- Implemented 9 seeder functions with proper FK dependency order
- Seeded 4792 total rows across 9 tables
- Added hash fingerprints for each table for data validation
- Ensured idempotent operation (clear and reseed)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add csv-parse and seed script structure** - `5ad6a43` (feat)
2. **Task 2: Implement seeders for reference tables** - `38ca6a1` (feat)
3. **Task 3: Implement seeders for SPOM rules, rotator, formats, exercises, config** - `67082db` (feat)

## Files Created/Modified

**Created:**
- `el-templo-api/src/db/seed-spom.ts` - Complete SPOM data import script (570 lines)

**Modified:**
- `el-templo-api/package.json` - Added csv-parse dependency and seed:spom script
- `el-templo-api/src/db/schema/format-compatibility.ts` - Updated block enum to match CSV data

## Data Import Results

| Table | Rows | Source File | Hash |
|-------|------|-------------|------|
| routes | 24 | (hardcoded) | cf9cbd57981134d5 |
| intensity_rules | 9 | SPOM - Intensidad.csv | 129f7d07eaa2bbe9 |
| contraction_rules | 20 | Contraccion.txt (JSON) | 6d06cddfeb12934c |
| spom_rules | 1248 | SPOM.csv | 001491401310f9fa |
| weekly_rotator | 468 | Rotador Semanal.csv | ecd310c2dc898998 |
| formats | 46 | Formatos.csv (unique names) | 9e290951098c6515 |
| format_compatibility | 1487 | Formatos.csv | b3e3fa0f15bda370 |
| exercises | 1489 | Ejercicios.csv | 079836fa62f1649e |
| spom_config | 1 | (initialized week 1) | - |
| **TOTAL** | **4792** | | |

## Decisions Made

- **Batch inserts of 1000 rows:** Prevents memory issues with large datasets
- **Block enum update:** Added initium/athlos/epikos to match CSV block types (was missing plethora, added correct blocks)
- **Deduplication for rotator:** CSV had duplicate entries that needed filtering by (week, day, levelGroup)
- **Route codes hardcoded:** Extracted unique codes from both SPOM.csv and Rotador Semanal.csv, stored as reference table

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated block enum in format_compatibility schema**
- **Found during:** Task 3 (format compatibility seeder)
- **Issue:** Schema had `nucleus/deuteros/plethora` but CSV has `Initium/Nucleus/Deuteros/Athlos/Epikos`
- **Fix:** Updated schema to `initium/nucleus/deuteros/athlos/epikos` and altered table column
- **Files modified:** `el-templo-api/src/db/schema/format-compatibility.ts`
- **Commit:** `67082db`

**2. [Rule 1 - Bug] Added deduplication for weekly rotator**
- **Found during:** Task 3 (weekly rotator seeder)
- **Issue:** CSV parsing was creating duplicate (week, day, levelGroup) entries causing unique constraint violation
- **Fix:** Added Set-based deduplication before insert
- **Files modified:** `el-templo-api/src/db/seed-spom.ts`
- **Commit:** `67082db`

---

**Total deviations:** 2 auto-fixed
**Impact on plan:** Schema alignment with actual data, deduplication for data integrity. No scope creep.

## Verification Results

1. **Row counts verified via SQL:**
   - All 9 tables populated with expected row counts
   - SPOM rules: 1248 (52 weeks x 24 routes)
   - Weekly rotator: 468 (26 weeks x 6 days x 3 level groups)
   - Exercises: 1489 (all exercise metadata imported)

2. **SPOM uniqueness verified:**
   - Query `SELECT week, route_id, COUNT(*) FROM spom_rules GROUP BY week, route_id HAVING COUNT(*) > 1` returns empty
   - No duplicate (week, route) combinations

3. **Idempotency verified:**
   - Re-running `pnpm seed:spom` produces identical results
   - Clear and reseed operation works correctly

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All SPOM reference data is now in the database
- Session generation engine can query:
  - `spom_rules` for periodization (week, route -> intensity, wave, pattern)
  - `weekly_rotator` for block assignments (week, day, level_group -> routes)
  - `intensity_rules` for budget calculation (intensity -> reps_budget, exercise_count)
  - `contraction_rules` for CON/EXC/ISO distribution
  - `format_compatibility` for format selection
  - `exercises` for exercise selection
  - `spom_config` for current week
- Ready for Phase 5: Session Generation Engine

---
*Phase: 04-spom-engine*
*Completed: 2026-01-23*
