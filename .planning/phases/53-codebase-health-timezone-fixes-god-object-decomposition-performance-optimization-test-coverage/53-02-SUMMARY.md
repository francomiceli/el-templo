---
phase: 53-codebase-health
plan: 02
subsystem: database
tags: [mysql, indexes, n+1, performance, drizzle-orm, group-by]

# Dependency graph
requires:
  - phase: 50-attendance
    provides: "bookings table with scheduling data"
  - phase: 48-subscriptions
    provides: "subscriptions and payments tables"
provides:
  - "N+1 elimination in getWeeklyGrid (single GROUP BY query)"
  - "Performance indexes on users, subscriptions, payments tables"
  - "Migration 0036 with 8 CREATE INDEX statements"
affects: [scheduling, members, payments, analytics, subscriptions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    ["batch COUNT with GROUP BY + Map lookup instead of N+1 per-row queries"]

key-files:
  created:
    - "el-templo-api/src/db/migrations/0036_performance_indexes.sql"
  modified:
    - "el-templo-api/src/modules/scheduling/service.ts"
    - "el-templo-api/src/db/schema/users.ts"
    - "el-templo-api/src/db/schema/subscriptions.ts"
    - "el-templo-api/src/db/schema/payments.ts"

key-decisions:
  - "N+1 fix committed as part of Plan 01 (wave 1 parallel, same file) -- verified correct in this plan"
  - "Hand-wrote migration SQL due to drizzle-kit schema drift (journey_type column in sessions)"
  - "subscription_status enum name used in CREATE INDEX (MySQL column name matches enum name)"

patterns-established:
  - "Batch GROUP BY + Map lookup: collect IDs, single query with inArray + groupBy, build Map<compositeKey, count>, lookup in loop"
  - "Hand-written migrations: when drizzle-kit generate has interactive drift issues, write CREATE INDEX SQL manually"

requirements-completed: []

# Metrics
duration: 11min
completed: 2026-03-10
---

# Phase 53 Plan 02: Performance Optimization Summary

**N+1 query elimination in getWeeklyGrid via GROUP BY batch query, plus 8 performance indexes on users/subscriptions/payments tables**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-10T22:21:20Z
- **Completed:** 2026-03-10T22:32:45Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Eliminated N+1 booking count queries in getWeeklyGrid: single GROUP BY query with Map lookup replaces per-schedule COUNT loop
- Added 4 indexes on users table (branchId, role, createdAt, isActive) for admin filtering queries
- Added 2 indexes on subscriptions table (status+endDate composite for expire-on-read, branchId for filtering)
- Added 2 indexes on payments table (paymentDate for analytics, paymentDate+paymentMethod composite for financial summaries)
- Hand-wrote migration 0036 and applied to dev database

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix N+1 query in getWeeklyGrid** - `35bb182` (included in Plan 01 wave-1 parallel commit -- same file, different methods)
2. **Task 2: Add missing database indexes and generate migration** - `58a3991` (perf)

## Files Created/Modified

- `el-templo-api/src/modules/scheduling/service.ts` - Replaced N+1 per-schedule COUNT loop with single GROUP BY + Map lookup in getWeeklyGrid
- `el-templo-api/src/db/schema/users.ts` - Added index import, 4 indexes (branchId, role, createdAt, isActive)
- `el-templo-api/src/db/schema/subscriptions.ts` - Added 2 indexes (status+endDate composite, branchId)
- `el-templo-api/src/db/schema/payments.ts` - Added 2 indexes (paymentDate, paymentDate+paymentMethod composite)
- `el-templo-api/src/db/migrations/0036_performance_indexes.sql` - Migration with 8 CREATE INDEX statements

## Decisions Made

- **N+1 fix in Plan 01 commit:** Since Plans 01 and 02 are Wave 1 (parallel) and both touch service.ts, the N+1 fix was committed alongside Plan 01's date-utils refactor. Verified correct in this plan's execution.
- **Hand-written migration:** drizzle-kit generate prompted interactively due to pre-existing schema drift (sessions.journey*type vs discarded*\* columns). Wrote migration SQL manually to avoid blocking.
- **Subscription status column name:** Used `subscription_status` in CREATE INDEX (MySQL enum name) rather than `status` (Drizzle property name).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Hand-wrote migration SQL instead of using drizzle-kit generate**

- **Found during:** Task 2 (migration generation)
- **Issue:** `pnpm db:generate` prompted interactively about sessions.journey_type column (pre-existing schema drift)
- **Fix:** Wrote migration SQL manually with only the 8 CREATE INDEX statements needed
- **Files modified:** el-templo-api/src/db/migrations/0036_performance_indexes.sql
- **Verification:** Migration applied to dev DB, full test suite passes (371/374 tests, 3 pre-existing failures)
- **Committed in:** 58a3991 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Migration achieves same outcome as drizzle-kit would have generated. No scope creep.

## Issues Encountered

- Pre-existing schema drift (sessions.journey_type) blocks non-interactive drizzle-kit generate. Logged to deferred-items.md.
- 3 pre-existing test failures in scheduling (seed route returns 404). Logged to deferred-items.md.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Performance indexes active on dev database
- Weekly grid query optimized for production-scale usage
- Ready for Plan 03 (test coverage improvements)

---

_Phase: 53-codebase-health_
_Completed: 2026-03-10_
