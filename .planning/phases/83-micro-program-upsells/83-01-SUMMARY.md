---
phase: 83-micro-program-upsells
plan: 01
subsystem: database
tags: [drizzle, mysql, schema, micro-programs, enrollments, aura]

# Dependency graph
requires: []
provides:
  - micro_programs and micro_program_content_blocks schema tables
  - program_enrollments schema table with status lifecycle
  - Extended AURA source types (program_week_completion, program_completion)
  - Shared TypeScript types for programs module (MicroProgram, ProgramEnrollment, etc.)
  - Migration SQL 0061_micro_programs.sql
affects: [83-02, 83-03, 83-04, 83-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Program content blocks: polymorphic block_type enum (video/text/pdf/exercise) with nullable type-specific columns"
    - "Enrollment status lifecycle: active -> completed/expired/cancelled with timestamp tracking per transition"

key-files:
  created:
    - el-templo-api/src/db/schema/micro-programs.ts
    - el-templo-api/src/db/schema/program-enrollments.ts
    - el-templo-api/src/modules/programs/types.ts
    - el-templo-api/src/db/migrations/0061_micro_programs.sql
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/db/schema/aura-transactions.ts
    - el-templo-api/src/db/schema/aura-config.ts
    - el-templo-api/src/modules/aura/types.ts

key-decisions:
  - "Polymorphic content blocks with nullable type-specific columns (videoUrl, content, exerciseId) rather than separate tables per type"
  - "Program enrollment tracks sessions_completed_this_week and week_unlocked_at for session-gated weekly unlocks"

patterns-established:
  - "Content block polymorphism: single table with block_type enum + nullable type-specific columns"
  - "Enrollment lifecycle: status enum with per-transition timestamps (completedAt, expiredAt, cancelledAt)"

requirements-completed: [ENG-18]

# Metrics
duration: 8min
completed: 2026-03-25
---

# Phase 83 Plan 01: Schema & Types Summary

**Drizzle schema for micro-programs (3 tables), content blocks with video/text/pdf/exercise types, enrollment lifecycle, AURA source type extensions, and shared TypeScript interfaces for the programs module**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-25T17:32:59Z
- **Completed:** 2026-03-25T17:41:34Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Created micro_programs table with configurable pricing, duration, session thresholds, and AURA bonus settings
- Created micro_program_content_blocks table with polymorphic block types (video/text/pdf/exercise) and week-based organization
- Created program_enrollments table with full status lifecycle (active/completed/expired/cancelled) and session tracking per week
- Extended AURA source type enums in all 3 locations (2 schema + 1 TypeScript) with program_week_completion and program_completion
- Defined comprehensive TypeScript interfaces for admin CRUD, member-facing catalog, enrollment progress, and analytics

## Task Commits

Each task was committed atomically:

1. **Task 1: Create schema files for micro-programs and enrollments** - `a51c0ffc` (feat)
2. **Task 2: Create shared TypeScript types for programs module** - `0a8ca15c` (feat)

## Files Created/Modified
- `el-templo-api/src/db/schema/micro-programs.ts` - micro_programs and micro_program_content_blocks tables with relations
- `el-templo-api/src/db/schema/program-enrollments.ts` - program_enrollments table with status enum and relations
- `el-templo-api/src/db/schema/index.ts` - Added exports for new schema files
- `el-templo-api/src/db/schema/aura-transactions.ts` - Extended sourceTypeEnum with program source types
- `el-templo-api/src/db/schema/aura-config.ts` - Extended auraConfigSourceTypeEnum with program source types
- `el-templo-api/src/modules/programs/types.ts` - All shared interfaces for programs module
- `el-templo-api/src/modules/aura/types.ts` - Extended AuraSourceType union
- `el-templo-api/src/db/migrations/0061_micro_programs.sql` - Migration SQL for new tables and enum changes

## Decisions Made
- Polymorphic content blocks via single table with block_type enum and nullable type-specific columns (videoUrl for video, content for text/pdf, exerciseId for exercise) -- avoids table-per-type complexity while remaining queryable
- Program enrollment tracks sessions_completed_this_week as a counter reset per week, with week_unlocked_at timestamp for time gating -- keeps the data model simple for the service layer to implement session-gated weekly unlocks

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Schema and types are the foundation for all downstream plans (83-02 through 83-05)
- Migration SQL ready to apply (0061_micro_programs.sql)
- Programs module directory created at src/modules/programs/ ready for service and route files

## Self-Check: PASSED

All 4 created files verified on disk. Both commit hashes (a51c0ffc, 0a8ca15c) found in git log.

---
*Phase: 83-micro-program-upsells*
*Completed: 2026-03-25*
