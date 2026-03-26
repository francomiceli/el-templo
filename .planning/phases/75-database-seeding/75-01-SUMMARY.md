---
phase: 75-database-seeding
plan: 01
subsystem: database
tags: [drizzle, mysql, migration, seed, branches, schedules]

requires:
  - phase: 74-business-data-integration
    provides: "Business data reference (addresses, schedules, pricing) in contexto/"
provides:
  - "Branch address/phone/googleMapsUrl columns in schema"
  - "Migration 0042 for ALTER TABLE branches"
  - "Idempotent production seed with real per-branch schedule data"
  - "Calisthenics ROM activity for Saturday slots"
affects: [whatsapp-bot, admin-dashboard, api-endpoints]

tech-stack:
  added: []
  patterns: ["Per-branch schedule config map keyed by branch code"]

key-files:
  created:
    - el-templo-api/src/db/migrations/0042_add_branch_address_columns.sql
  modified:
    - el-templo-api/src/db/schema/branches.ts
    - el-templo-api/src/db/seed-production.ts
    - el-templo-api/package.json

key-decisions:
  - "Manual migration file instead of drizzle-kit generate (interactive prompts blocked automation)"
  - "Plan-provided Maps URLs used over tools.ts URLs for Moreno and Mogotes (plan values assumed reviewed/corrected)"
  - "Sesion de Prueba name kept without accent (matches existing DB data)"

patterns-established:
  - "Per-branch schedule config: Record<branchCode, { weekdayTimes, saturdayTimes }>"
  - "Separate activity ID variables (sesionGrupalId vs romActivityId) for explicit schedule-activity mapping"

requirements-completed: [SEED-01, SEED-02, SEED-03, SEED-04, SEED-05]

duration: 3min
completed: 2026-03-26
---

# Phase 75 Plan 01: Database Seeding Summary

**Branch address/maps columns + idempotent production seed with real per-branch schedules, ROM activity, and correct pricing**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-26T16:57:44Z
- **Completed:** 2026-03-26T17:01:10Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added address, phone, googleMapsUrl nullable columns to branches schema with migration
- Rewrote seed-production.ts with real addresses, Maps URLs, and per-branch schedule data
- Added Calisthenics ROM activity with separate activityId for Saturday slots
- Constitucion correctly has 7 weekday slots (no 10:00), no Saturdays
- Only Moreno and Alem have Saturday ROM slots (4 each)
- All 6 subscription plans preserved with correct pricing

## Task Commits

Each task was committed atomically:

1. **Task 1: Add address/phone/maps columns to branches schema + generate migration** - `eb80134c` (feat)
2. **Task 2: Update seed-production.ts with real per-branch data and ROM activity** - `c193e4ed` (feat)

## Files Created/Modified

- `el-templo-api/src/db/schema/branches.ts` - Added address, phone, googleMapsUrl nullable varchar columns
- `el-templo-api/src/db/migrations/0042_add_branch_address_columns.sql` - ALTER TABLE migration for 3 new columns
- `el-templo-api/src/db/seed-production.ts` - Complete rewrite with real business data, per-branch schedules, ROM activity
- `el-templo-api/package.json` - Added seed:production convenience script

## Decisions Made

- Wrote migration SQL manually instead of using `drizzle-kit generate` because the generator entered interactive mode asking about unrelated schema changes (journey_type column). The migration is a straightforward ALTER TABLE with 3 ADD COLUMN statements.
- Used Maps URLs from the plan table rather than tools.ts for Moreno and Mogotes, as the plan values appear to be corrected/updated versions.
- Kept "Sesion de Prueba" without accent to match existing DB convention.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Manual migration instead of drizzle-kit generate**

- **Found during:** Task 1 (schema + migration)
- **Issue:** `pnpm db:generate` entered interactive mode asking about unrelated schema changes (journey_type column rename), blocking automation
- **Fix:** Wrote migration SQL file manually (0042_add_branch_address_columns.sql) with standard ALTER TABLE ADD COLUMN statements
- **Files modified:** el-templo-api/src/db/migrations/0042_add_branch_address_columns.sql
- **Verification:** TypeScript compiles cleanly, migration SQL contains all 3 column additions
- **Committed in:** eb80134c (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Migration file achieves same result as drizzle-kit generate. No scope creep.

## Issues Encountered

None beyond the drizzle-kit interactive prompt issue documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Branch addresses and Maps URLs now in DB schema, ready for bot tools to query instead of hardcoded maps
- Per-branch schedules accurately reflect real business hours
- Migration needs to be applied to production DB (via deploy pipeline or manual `db:run-migrations`)

---

_Phase: 75-database-seeding_
_Completed: 2026-03-26_
