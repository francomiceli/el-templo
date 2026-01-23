---
phase: 04-spom-engine
plan: 01
subsystem: database
tags: [drizzle, mysql, spom, periodization, schema]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Database connection plugin, Drizzle ORM setup, base schema patterns
provides:
  - 9 SPOM database schemas with foreign keys and indexes
  - Route reference table for FK relationships
  - SPOM periodization rules with unique (week, route) constraint
  - Weekly rotator with day/levelGroup enums
  - Exercise database with multi-column filter index
  - Format compatibility matrix
  - Singleton config table with CHECK constraint
affects: [04-02 (data import), 05-session-generation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Composite unique indexes for lookup patterns
    - Foreign key references via Drizzle references()
    - mysqlEnum for constrained string values
    - CHECK constraint for singleton tables

key-files:
  created:
    - el-templo-api/src/db/schema/routes.ts
    - el-templo-api/src/db/schema/spom-rules.ts
    - el-templo-api/src/db/schema/intensity-rules.ts
    - el-templo-api/src/db/schema/contraction-rules.ts
    - el-templo-api/src/db/schema/weekly-rotator.ts
    - el-templo-api/src/db/schema/formats.ts
    - el-templo-api/src/db/schema/format-compatibility.ts
    - el-templo-api/src/db/schema/exercises.ts
    - el-templo-api/src/db/schema/spom-config.ts
    - el-templo-api/src/db/migrations/0001_petite_triathlon.sql
  modified:
    - el-templo-api/src/db/schema/index.ts

key-decisions:
  - "Route codes stored in reference table with FK relationships"
  - "Exercise level stored as enum, level group computed at runtime"
  - "Difficulty stored as string to support 'Nivel Superior' values"
  - "SPOM config uses CHECK constraint for single-row enforcement"

patterns-established:
  - "Composite unique indexes: uniqueIndex().on(col1, col2) for lookup patterns"
  - "Enum pattern: define enum outside table, reference in column"
  - "Schema exports: all schemas re-exported from index.ts"

# Metrics
duration: 6min
completed: 2026-01-23
---

# Phase 4 Plan 01: SPOM Database Schemas Summary

**9 Drizzle schemas for SPOM periodization engine with FK relationships, composite indexes, and MySQL enums**

## Performance

- **Duration:** 6 min
- **Started:** 2026-01-23T22:03:26Z
- **Completed:** 2026-01-23T22:09:02Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- Created 9 SPOM table schemas with proper column types and constraints
- Established foreign key relationships (spom_rules -> routes, weekly_rotator -> routes x4, format_compatibility -> formats)
- Added composite unique indexes for primary lookup patterns (week+route, week+day+level)
- Implemented CHECK constraint for single-row spom_config table
- Generated and applied Drizzle migration to database

## Task Commits

Each task was committed atomically:

1. **Task 1: Create routes and core reference schemas** - `79b7bee` (feat)
2. **Task 2: Create SPOM rules and weekly rotator schemas** - `90709b6` (feat)
3. **Task 3: Create formats, exercises, config schemas and update index** - `1f4d9a4` (feat)

**Migration commit:** `4612553` (chore: add drizzle migration for SPOM tables)

## Files Created/Modified

**Created:**
- `el-templo-api/src/db/schema/routes.ts` - Route reference table (id, code, displayName)
- `el-templo-api/src/db/schema/intensity-rules.ts` - Intensity mapping (repsBudget, difficulty, exerciseCount)
- `el-templo-api/src/db/schema/contraction-rules.ts` - Contraction distribution (CON/EXC/ISO counts)
- `el-templo-api/src/db/schema/spom-rules.ts` - Periodization rules with FK to routes
- `el-templo-api/src/db/schema/weekly-rotator.ts` - Block assignments with 4 route FKs
- `el-templo-api/src/db/schema/formats.ts` - Format definitions
- `el-templo-api/src/db/schema/format-compatibility.ts` - Compatibility matrix with FK to formats
- `el-templo-api/src/db/schema/exercises.ts` - Exercise database with multi-column index
- `el-templo-api/src/db/schema/spom-config.ts` - Singleton config with CHECK constraint
- `el-templo-api/src/db/migrations/0001_petite_triathlon.sql` - Generated DDL migration

**Modified:**
- `el-templo-api/src/db/schema/index.ts` - Added exports for all 9 new schemas

## Decisions Made

- **Route codes in reference table:** Cleaner FKs than embedding route strings, allows future metadata
- **Difficulty as string:** Supports "Nivel Superior" values alongside numeric 1/2/3
- **Level as enum, group computed:** Store original alfa/delta/sigma/omega/spartan, compute ALFA_DELTA/SIGMA/OMEGA groups at runtime
- **CHECK constraint for singleton:** MySQL enforces single row in spom_config via `id = 1` check

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cleaned up old Phase 4 tables from database**
- **Found during:** Verification (drizzle-kit push)
- **Issue:** Database had old tables from backup branch (exercise_levels, periodization_rules, gym_config, generated_sessions) conflicting with new schema
- **Fix:** Dropped old tables and applied migration SQL directly
- **Files modified:** None (database only)
- **Verification:** `SHOW TABLES` confirms 11 tables (9 SPOM + branches + users)
- **Committed in:** N/A (database cleanup, no code change)

---

**Total deviations:** 1 auto-fixed (blocking issue)
**Impact on plan:** Database cleanup necessary due to state from previous Phase 4 attempt. No scope creep.

## Issues Encountered

- **drizzle-kit push interactive prompts:** The push command detected old tables and prompted for rename/create decisions. Resolved by dropping old tables and applying migration SQL directly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 9 SPOM schemas exist in database ready for data import
- Foreign key constraints enforce referential integrity
- Composite indexes optimize lookup patterns for session generation
- Ready for Phase 4 Plan 02: Data import from CSV files

---
*Phase: 04-spom-engine*
*Completed: 2026-01-23*
