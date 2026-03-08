---
phase: 45-architecture-foundation
plan: 01
subsystem: database
tags: [drizzle, mysql, aura, virtual-branch, schema, migration]

requires:
  - phase: none
    provides: existing branches and users schema

provides:
  - is_virtual column on branches table for online member support
  - aura_transactions ledger table with 8 source types and double-award prevention
  - aura_balances cached balance table with one-per-user constraint
  - aura_config table mapping source types to default amounts
  - Templo Online virtual branch seed data
  - AURA config seed data with 8 default source types

affects: [45-02, 45-03, aura-service, member-onboarding, admin-aura-management]

tech-stack:
  added: []
  patterns:
    - "Module comment headers (// Module: aura) for schema organization"
    - "Polymorphic references via referenceType/referenceId columns"
    - "Unique composite index for idempotent transaction recording"
    - "Separate enum per table to avoid MySQL enum column name conflicts"

key-files:
  created:
    - el-templo-api/src/db/schema/aura-transactions.ts
    - el-templo-api/src/db/schema/aura-balances.ts
    - el-templo-api/src/db/schema/aura-config.ts
    - el-templo-api/src/db/migrations/0030_aura_virtual_branch.sql
  modified:
    - el-templo-api/src/db/schema/branches.ts
    - el-templo-api/src/db/schema/index.ts

key-decisions:
  - "Used separate mysqlEnum for aura_config (aura_config_source_type) to avoid MySQL column name collision with aura_transactions source_type"
  - "Wrote migration manually rather than drizzle-kit generate due to interactive prompts from unrelated schema drift"

patterns-established:
  - "Module comment headers: // Module: [name] at top of schema files"
  - "Polymorphic references: referenceType (varchar) + referenceId (int) for flexible FK patterns"

requirements-completed: [RSTRC-01, RSTRC-02, RSTRC-03]

duration: 4min
completed: 2026-03-08
---

# Phase 45 Plan 01: Virtual Branch + AURA Foundation Schema Summary

**Drizzle schema for virtual branch support (is_virtual column) and AURA economy tables (transactions ledger, balances, config) with migration and seed data**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-08T15:28:22Z
- **Completed:** 2026-03-08T15:32:05Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added is_virtual boolean column to branches table, enabling virtual branch concept without nullable branchId
- Created aura_transactions ledger with all 8 source types, polymorphic references, and unique constraint for double-award prevention
- Created aura_balances table with one-balance-per-user constraint for fast balance lookups
- Created aura_config table mapping each source type to configurable default amounts
- Migration 0030 includes DDL for all changes plus seed data for Templo Online branch and 8 AURA config defaults

## Task Commits

Each task was committed atomically:

1. **Task 1: Add is_virtual to branches and create AURA schema files** - `ef20d9b` (feat)
2. **Task 2: Generate migration and seed Templo Online branch + AURA config defaults** - `da52d50` (feat)

## Files Created/Modified

- `el-templo-api/src/db/schema/branches.ts` - Added isVirtual boolean column
- `el-templo-api/src/db/schema/aura-transactions.ts` - AURA ledger table with sourceTypeEnum, unique constraint, user FK
- `el-templo-api/src/db/schema/aura-balances.ts` - Cached AURA balance per user with unique userId
- `el-templo-api/src/db/schema/aura-config.ts` - Source type to default amount mapping
- `el-templo-api/src/db/schema/index.ts` - Added barrel exports for 3 new AURA schemas
- `el-templo-api/src/db/migrations/0030_aura_virtual_branch.sql` - DDL + seed data migration

## Decisions Made

- Used separate mysqlEnum name for aura_config (`aura_config_source_type`) vs aura_transactions (`source_type`) to avoid MySQL enum column name collision at the database level
- Wrote migration SQL manually rather than using drizzle-kit generate, which required interactive prompts due to unrelated schema drift (journey_type column rename detection). The manual migration follows the same SQL patterns as existing migrations

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- drizzle-kit generate and drizzle-kit push both require interactive input due to existing schema drift (unrelated tables). This is a known drizzle-kit behavior when the DB state doesn't exactly match the schema snapshot. The migration was written manually with correct SQL matching Drizzle's output patterns.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All AURA foundation tables ready for service layer implementation (Plan 02)
- Virtual branch concept established for online member support
- Schema barrel exports complete, all new tables available via `import { ... } from './db/schema'`

---

_Phase: 45-architecture-foundation_
_Completed: 2026-03-08_
