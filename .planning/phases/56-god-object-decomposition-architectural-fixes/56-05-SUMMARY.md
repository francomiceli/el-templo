---
phase: 56-god-object-decomposition-architectural-fixes
plan: 05
subsystem: testing
tags: [vitest, analytics, drizzle-orm, correlated-subquery, mysql]

# Dependency graph
requires:
  - phase: 52-analytics-dashboard
    provides: Analytics service with KPI, member, attendance, financial endpoints
provides:
  - 6 deterministic analytics test cases (retention, morosos, financial)
  - Fix for Drizzle ORM correlated subquery column reference bug
affects: [payments-service, analytics-service]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Raw SQL column names in Drizzle correlated subqueries (not interpolated refs)"

key-files:
  created: []
  modified:
    - el-templo-api/test/analytics/analytics.test.ts
    - el-templo-api/src/modules/analytics/service.ts

key-decisions:
  - "Raw SQL column names in correlated subqueries — Drizzle ${column} interpolation generates parameter placeholders instead of column references inside subqueries"
  - "Direct DB inserts for test payments — bypass API to ensure subscription_id FK is deterministically set"

patterns-established:
  - "Drizzle correlated subquery pattern: use raw SQL column names (subscriptions.id) not interpolated refs (${schema.subscriptions.id}) inside sql template literal subqueries"

requirements-completed: []

# Metrics
duration: 26min
completed: 2026-03-11
---

# Phase 56 Plan 05: Analytics Test Coverage Summary

**6 deterministic analytics tests with Drizzle correlated subquery bug fix — retention rate, morosos count, totalOutstanding, collectionRate all verified with known computed values**

## Performance

- **Duration:** 26 min
- **Started:** 2026-03-11T22:55:40Z
- **Completed:** 2026-03-11T23:21:40Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Added 6 new test cases with deterministic assertions for analytics business logic
- Discovered and fixed Drizzle ORM bug where correlated subqueries with interpolated column references generate parameter placeholders instead of SQL column references
- Fixed all 5 correlated subquery instances in analytics service (countMorosos, getAttentionList, computeRetentionRate, getOutstandingAndCollection)
- Documented identical bug in payments service as deferred item

## Task Commits

Each task was committed atomically:

1. **Task 1: Add retention rate, morosos, and financial assertion tests** - `bfcc6ea8` (test+fix)

## Files Created/Modified

- `el-templo-api/test/analytics/analytics.test.ts` - 6 new test cases with deterministic assertions
- `el-templo-api/src/modules/analytics/service.ts` - Fixed correlated subquery column references

## Decisions Made

- **Raw SQL column names in correlated subqueries:** Drizzle ORM's `${schema.subscriptions.id}` inside `sql` template literal correlated subqueries generates bound parameter placeholders (`?`) instead of SQL column references (`subscriptions.id`). Fixed by using raw SQL column names directly.
- **Direct DB inserts for payments:** Test payments inserted via `app.db.insert(payments)` instead of the payment API to ensure `subscription_id` FK is deterministically set and to focus test scope on analytics queries.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Drizzle ORM correlated subquery column reference interpolation**

- **Found during:** Task 1 (writing financial assertion tests)
- **Issue:** `getOutstandingAndCollection` and other methods using `${schema.subscriptions.id}` inside `sql` template literal correlated subqueries generated parameter placeholders instead of column references, causing correlated subqueries to always return 0
- **Fix:** Replaced all interpolated column refs (`${schema.subscriptions.id}`) with raw SQL column names (`subscriptions.id`) in 5 locations across countMorosos, getAttentionList, computeRetentionRate, getOutstandingAndCollection
- **Files modified:** `el-templo-api/src/modules/analytics/service.ts`
- **Verification:** All 400 tests pass including new deterministic financial assertions
- **Committed in:** bfcc6ea8 (part of task commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Bug fix was necessary for tests to pass with correct assertions. Pre-existing bug in production analytics — morosos count, totalOutstanding, and collectionRate were silently returning incorrect values.

## Issues Encountered

- Initial test failures led to discovering the Drizzle ORM correlated subquery bug. Required ~15 minutes of debugging to isolate the root cause (comparing raw SQL vs Drizzle-generated SQL to prove the interpolation issue).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Analytics test coverage now includes deterministic business logic assertions
- Same Drizzle bug exists in payments service (deferred-items.md) — should be fixed in a future phase
- Phase 56 complete

---

_Phase: 56-god-object-decomposition-architectural-fixes_
_Completed: 2026-03-11_
