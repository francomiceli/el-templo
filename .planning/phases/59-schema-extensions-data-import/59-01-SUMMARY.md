---
phase: 59-schema-extensions-data-import
plan: 01
subsystem: database, api
tags: [drizzle, mysql, migration, members, schema]

# Dependency graph
requires:
  - phase: 58-production-deployment
    provides: Production-deployed API with members module and subscription management
provides:
  - "document_type ENUM column on users table (DNI, Pasaporte, NIE, NIF, Otro)"
  - "address VARCHAR(500) column on users table"
  - "is_archived BOOLEAN column on subscription_plans table"
  - "Full API CRUD support for documentType and address fields"
affects:
  [
    59-02,
    59-03,
    59-04,
    60-plan-configuration,
    64-member-management-enhancements,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns: [nullable schema extension with backward compatibility]

key-files:
  created:
    - el-templo-api/src/db/migrations/0039_schema_extensions.sql
  modified:
    - el-templo-api/src/db/schema/users.ts
    - el-templo-api/src/db/schema/subscription-plans.ts
    - el-templo-api/src/modules/members/types.ts
    - el-templo-api/src/modules/members/schemas.ts
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/test/members/members.test.ts

key-decisions:
  - "All new columns nullable/defaulted for safe backward compatibility with existing data"
  - "documentType and address optional in CreateMemberInput (required enforcement deferred to admin UI plan)"
  - "documentType included in member list items for future filtering/badge display"

patterns-established:
  - "Nullable column extension: add column with DEFAULT NULL, update Drizzle schema, propagate through types/schemas/service in one pass"

requirements-completed: [DATA-01, DATA-02, MEMBER-04]

# Metrics
duration: 9min
completed: 2026-03-16
---

# Phase 59 Plan 01: Schema Extensions Summary

**Migration 0039 adding documentType/address to users and isArchived to subscription_plans with full API CRUD propagation**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-16T17:25:14Z
- **Completed:** 2026-03-16T17:34:25Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Migration 0039 adds document_type ENUM, address VARCHAR(500) to users table and is_archived BOOLEAN to subscription_plans table
- Full API layer support: types, JSON schemas, service queries all handle documentType and address in create, update, get, and list operations
- 6 new integration tests covering all CRUD operations with new fields, including backward compatibility and null clearing
- All 413 tests pass, TypeScript compiles cleanly

## Task Commits

Each task was committed atomically:

1. **Task 1: Create migration 0039 and update Drizzle schemas** - `291ff039` (feat)
2. **Task 2 RED: Failing tests for new fields** - `d41ccc0b` (test)
3. **Task 2 GREEN: Implement API layer changes** - `ac3c2cc6` (feat)

## Files Created/Modified

- `el-templo-api/src/db/migrations/0039_schema_extensions.sql` - DDL for 3 new columns across 2 tables
- `el-templo-api/src/db/schema/users.ts` - Added documentTypeEnum and address column to Drizzle schema
- `el-templo-api/src/db/schema/subscription-plans.ts` - Added isArchived column to Drizzle schema
- `el-templo-api/src/modules/members/types.ts` - Added DocumentType union type, updated MemberProfile, MemberListItem, CreateMemberInput, UpdateMemberInput
- `el-templo-api/src/modules/members/schemas.ts` - Added documentType/address to all relevant Fastify JSON schemas
- `el-templo-api/src/modules/members/service.ts` - Updated getMemberById, listMembers, createMember, updateMember to handle new columns
- `el-templo-api/test/members/members.test.ts` - 6 new tests for documentType/address CRUD operations

## Decisions Made

- All new columns use nullable/default values for safe backward compatibility with existing production data
- documentType and address are optional in CreateMemberInput (required enforcement will come when admin UI is wired in a later plan)
- documentType is included in member list items for future filtering/badge display in admin UI
- isArchived column placed after isActive for logical grouping in subscription_plans

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-existing migration runner issue: migration 0028 fails on dev DB due to duplicate format entry. This is unrelated to our changes and out of scope. Applied migration 0039 directly to dev DB. Test DB is created fresh by vitest globalSetup so our migration runs cleanly there.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Schema foundation complete for data import (plan 59-02)
- isArchived flag available for import script to create legacy plans
- documentType/address available for member profile editing enhancement

---

_Phase: 59-schema-extensions-data-import_
_Completed: 2026-03-16_
