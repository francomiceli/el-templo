---
phase: 48-subscriptions
plan: 01
subsystem: api
tags: [fastify, drizzle, mysql, subscriptions, plans, pricing, aura, lifecycle]

# Dependency graph
requires:
  - phase: 45-architecture-foundation
    provides: "AURA schema, AuraService with spend/getBalance, mysqlEnum naming pattern"
  - phase: 47-members-management
    provides: "Members module pattern (service, routes, schemas, types), admin role guard, isDuplicateKeyError helper"
provides:
  - "Subscription plans CRUD API (5 endpoints) at /api/admin/subscriptions/plans"
  - "Subscription lifecycle API (7 endpoints) at /api/admin/subscriptions/members/:userId/subscription"
  - "subscription_plans table with tier, booking mode, prices, duration"
  - "subscriptions table with lifecycle fields, pricing, AURA discount tracking"
  - "SubscriptionService with plans CRUD, assign, pause, resume, cancel, auto-expire, pricing preview"
  - "AURA discount tiers integration (spend AURA for subscription discounts)"
  - "Boarding pass one-time discount with user-level tracking"
  - "Migration 0032 with DDL for both tables and boarding_pass_used on users"
  - "26 integration tests covering all endpoints and edge cases"
affects: [48-02, 49-payments, 50-attendance, 51-scheduling]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Expire-on-read: auto-update expired subscriptions when queried (no cron)"
    - "AURA spend integration: service-to-service call for discount deduction"
    - "Price override with required reason field for audit trail"

key-files:
  created:
    - "el-templo-api/src/db/schema/subscription-plans.ts"
    - "el-templo-api/src/db/schema/subscriptions.ts"
    - "el-templo-api/src/db/migrations/0032_subscriptions.sql"
    - "el-templo-api/src/modules/subscriptions/types.ts"
    - "el-templo-api/src/modules/subscriptions/schemas.ts"
    - "el-templo-api/src/modules/subscriptions/service.ts"
    - "el-templo-api/src/modules/subscriptions/routes.ts"
    - "el-templo-api/src/modules/subscriptions/index.ts"
    - "el-templo-api/test/subscriptions/subscriptions.test.ts"
  modified:
    - "el-templo-api/src/db/schema/users.ts"
    - "el-templo-api/src/db/schema/index.ts"
    - "el-templo-api/src/app.ts"
    - "el-templo-api/test/members/members.test.ts"

key-decisions:
  - "Drizzle mysqlEnum name becomes the column name in SQL — migration must use 'subscription_status' not 'status' to match enum name"
  - "One active/paused subscription per member enforced at service layer (MySQL lacks partial unique indexes)"
  - "AURA discount tiers: 500=5%, 1000=10%, 2000=20%, 5000=30% — members spend AURA for price reduction"
  - "Boarding pass tracked on users.boarding_pass_used — one-time use per member, admin-applied"
  - "Price override requires reason field for audit trail"

patterns-established:
  - "Expire-on-read: auto-update subscription status when endDate < today, checked on every read operation"
  - "Service-to-service DI: SubscriptionService creates AuraService internally with shared db instance"
  - "Cancel body schema: POST routes with optional body must still send {} to satisfy Fastify schema validation"

requirements-completed: [SUBS-01, SUBS-02, SUBS-03, SUBS-04]

# Metrics
duration: 24min
completed: 2026-03-09
---

# Phase 48 Plan 01: Subscriptions API Summary

**Complete subscriptions module with plans CRUD, subscription lifecycle (assign/pause/resume/cancel/auto-expire), AURA discount pricing engine, boarding pass support, and 26 integration tests**

## Performance

- **Duration:** 24 min
- **Started:** 2026-03-09T17:32:52Z
- **Completed:** 2026-03-09T17:57:36Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- Created subscription_plans table with full field set (tier, booking mode, 3 price columns, duration, classes/week, trial/group flags)
- Created subscriptions table with lifecycle fields (status, dates, pricing breakdown, discount tracking)
- Built SubscriptionService with plans CRUD, subscription assign with pricing engine (boarding pass, AURA discount tiers, price override), pause/resume/cancel lifecycle, and expire-on-read auto-detection
- 12 admin API endpoints registered at /api/admin/subscriptions with role-based auth guard
- 26 integration tests covering plans CRUD, all subscription lifecycle paths, AURA discount integration, boarding pass edge cases, pricing preview, and authorization
- All 259 tests pass across the entire test suite (including 26 new subscription tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Database schema, migration, and subscriptions module** - `025d6a2` (feat)
2. **Task 2: Integration tests for subscriptions API** - `c3b89df` (test)

## Files Created/Modified

- `el-templo-api/src/db/schema/subscription-plans.ts` - Plans table schema with tier/booking mode enums, prices, duration
- `el-templo-api/src/db/schema/subscriptions.ts` - Subscriptions table with lifecycle fields, pricing, indexes
- `el-templo-api/src/db/schema/users.ts` - Added boardingPassUsed boolean column
- `el-templo-api/src/db/schema/index.ts` - Barrel exports for new schemas
- `el-templo-api/src/db/migrations/0032_subscriptions.sql` - DDL for both tables, FKs, indexes, users column
- `el-templo-api/src/modules/subscriptions/types.ts` - TypeScript interfaces, enum unions, AURA discount tiers constant
- `el-templo-api/src/modules/subscriptions/schemas.ts` - Fastify JSON validation schemas for all routes
- `el-templo-api/src/modules/subscriptions/service.ts` - Business logic: plans CRUD, subscription lifecycle, pricing engine
- `el-templo-api/src/modules/subscriptions/routes.ts` - 12 admin endpoints with error handling
- `el-templo-api/src/modules/subscriptions/index.ts` - Module barrel export
- `el-templo-api/src/app.ts` - Registered subscriptionRoutes plugin
- `el-templo-api/test/subscriptions/subscriptions.test.ts` - 26 integration tests
- `el-templo-api/test/members/members.test.ts` - Updated cleanup to handle subscriptions FK

## Decisions Made

- Drizzle `mysqlEnum("subscription_status", ...)` generates the column name as the enum name, so migration DDL must use `subscription_status` (not `status`) as the column name. Same pattern as Phase 45's AURA enum naming.
- One active/paused subscription per member enforced at service layer because MySQL does not support partial unique indexes (need to allow multiple cancelled/expired rows per user).
- AURA discount tiers set at 500/1000/2000/5000 AURA for 5%/10%/20%/30% off — members actively spend AURA for discounts.
- Boarding pass eligibility tracked on `users.boarding_pass_used` — one-time use, admin-applied at assignment.
- Price override requires a `priceOverrideReason` field to maintain audit trail.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed migration column name for subscription_status**

- **Found during:** Task 2 (Integration tests)
- **Issue:** Migration DDL used `status` as column name but Drizzle generates `subscription_status` (from the mysqlEnum name), causing "Unknown column 'subscriptions.subscription_status'" errors
- **Fix:** Updated migration to use `subscription_status` as the column name to match Drizzle's enum naming convention
- **Files modified:** `el-templo-api/src/db/migrations/0032_subscriptions.sql`
- **Verification:** All subscription lifecycle tests pass
- **Committed in:** c3b89df (Task 2 commit)

**2. [Rule 1 - Bug] Updated members test cleanup for FK constraints**

- **Found during:** Task 2 (Integration tests)
- **Issue:** Members test `cleanupTestMembers()` failed to delete users because the new `subscriptions` table has FK references to users. When subscription tests ran first, leftover data prevented user deletion.
- **Fix:** Added subscriptions, subscriptionPlans, auraTransactions, auraBalances deletion to members cleanup before deleting users
- **Files modified:** `el-templo-api/test/members/members.test.ts`
- **Verification:** All 259 tests pass in full suite (both files run together)
- **Committed in:** c3b89df (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes essential for correctness. The enum naming pattern is consistent with Phase 45 convention but was missed in migration DDL. The FK cleanup is a direct consequence of adding the subscriptions table.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None - no external service configuration required. Migration 0032 needs to be run on staging/production databases.

## Next Phase Readiness

- Complete subscriptions API ready for Plan 02 (admin UI — plans page and member subscription tab)
- All 12 endpoints available at /api/admin/subscriptions for frontend integration
- Pricing engine with AURA discount integration tested and working
- Migration 0032 ready for staging/production deployment

## Self-Check: PASSED

- All 13 files verified present on disk
- Commit 025d6a2 (Task 1) verified in git log
- Commit c3b89df (Task 2) verified in git log
- TypeScript compiles cleanly (`tsc --noEmit`)
- All 259 tests pass (including 26 new subscription tests)

---

_Phase: 48-subscriptions_
_Completed: 2026-03-09_
