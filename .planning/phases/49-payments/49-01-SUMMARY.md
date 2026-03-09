---
phase: 49-payments
plan: 01
subsystem: api
tags: [payments, drizzle, fastify, mysql, overdue, financial-summary]

# Dependency graph
requires:
  - phase: 48-subscriptions
    provides: subscriptions table, plans CRUD, subscription lifecycle
provides:
  - Payments table schema and migration
  - PaymentService with record, void, balance, overdue, global list, financial summary
  - 8 admin payment API routes
  - Members list extended with isOverdue flag and overdue filter
  - Morosos count endpoint
  - Integration tests for all payment endpoints
affects: [49-02-payments-ui, 50-attendance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      correlated subquery for overdue detection,
      derived status on read,
      raw SQL joins for recorder alias,
    ]

key-files:
  created:
    - el-templo-api/src/db/schema/payments.ts
    - el-templo-api/src/db/migrations/0033_payments.sql
    - el-templo-api/src/modules/payments/types.ts
    - el-templo-api/src/modules/payments/schemas.ts
    - el-templo-api/src/modules/payments/service.ts
    - el-templo-api/src/modules/payments/routes.ts
    - el-templo-api/src/modules/payments/index.ts
    - el-templo-api/test/payments/payments.test.ts
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/modules/members/types.ts
    - el-templo-api/src/modules/members/schemas.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/app.ts
    - el-templo-api/test/members/members.test.ts
    - el-templo-api/test/subscriptions/subscriptions.test.ts

key-decisions:
  - "Overdue computed on read via correlated subquery -- no stored column, no cron"
  - "PaymentService defines own NotFoundError/BadRequestError for module independence"
  - "Recorder name resolved via raw SQL alias join (users as recorder) to avoid Drizzle self-join conflict"
  - "Financial summary defaults to current month when no date range specified"
  - "Members overdue subquery counts expired subscriptions with insufficient payment sum"

patterns-established:
  - "Correlated subquery for derived status in list queries (overdueCount)"
  - "Raw SQL alias for self-referencing joins (recorder.first_name)"

requirements-completed: [PAY-01, PAY-02, PAY-03, PAY-04]

# Metrics
duration: 9min
completed: 2026-03-09
---

# Phase 49 Plan 01: Payments API Summary

**Payments module with record/void, member balance/overdue detection, global list, financial summary, and 19 integration tests**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-09T22:40:01Z
- **Completed:** 2026-03-09T22:49:00Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments

- Payments table with migration, supporting cash/transfer/card methods, void with reason, subscription FK
- PaymentService with 8 business logic methods: recordPayment, voidPayment, getMemberPayments, getMemberBalance, listPayments, getFinancialSummary, getOverdueMembers, getMorososCount
- 8 admin API routes registered at /api/admin/payments covering member payments, global list, summary, and morosos
- Members list extended with isOverdue computed flag and overdue filter parameter
- 19 integration tests covering all endpoints, edge cases, and authorization

## Task Commits

Each task was committed atomically:

1. **Task 1: Payments DB schema, migration, module, and app registration** - `0376728` (feat)
2. **Task 2: Integration tests for payments API** - `6505bee` (test)

## Files Created/Modified

- `el-templo-api/src/db/schema/payments.ts` - Payments table schema with member, subscription, recorder FKs
- `el-templo-api/src/db/migrations/0033_payments.sql` - DDL for payments table with FKs and indexes
- `el-templo-api/src/modules/payments/types.ts` - All payment types: PaymentDetail, MemberBalance, FinancialSummary, OverdueMember
- `el-templo-api/src/modules/payments/schemas.ts` - Fastify JSON validation schemas for 7 routes
- `el-templo-api/src/modules/payments/service.ts` - PaymentService with 8 methods and custom error classes
- `el-templo-api/src/modules/payments/routes.ts` - FastifyPluginAsync with admin role guard
- `el-templo-api/src/modules/payments/index.ts` - Barrel export
- `el-templo-api/src/app.ts` - Register paymentRoutes at /api/admin/payments
- `el-templo-api/src/modules/members/service.ts` - Added overdue subquery to listMembers
- `el-templo-api/src/modules/members/types.ts` - Added isOverdue to MemberListItem, overdue to MemberListParams
- `el-templo-api/src/modules/members/schemas.ts` - Added isOverdue and overdue filter to JSON schemas
- `el-templo-api/src/modules/members/routes.ts` - Pass overdue filter to service
- `el-templo-api/test/payments/payments.test.ts` - 19 integration tests
- `el-templo-api/test/members/members.test.ts` - Added payments cleanup in FK order
- `el-templo-api/test/subscriptions/subscriptions.test.ts` - Added payments cleanup in FK order

## Decisions Made

- Overdue status computed on read via correlated subquery in members list -- no stored column, no cron job needed
- PaymentService defines its own NotFoundError/BadRequestError for module independence (not importing from subscriptions)
- Recorder name resolved via raw SQL alias join (`users as recorder`) to avoid Drizzle self-join conflict with the member users join
- Financial summary defaults to current month when no date range specified
- Members overdue detection uses a correlated subquery counting subscriptions where endDate < CURDATE() and payments sum < pricePaid

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Payments API fully operational, ready for admin UI (49-02)
- Overdue detection ready for attendance enforcement (Phase 50)
- All existing tests pass with no regressions (279 tests across 16 files)

## Self-Check: PASSED

All 9 key files verified present. Both task commits (0376728, 6505bee) confirmed in git log.

---

_Phase: 49-payments_
_Completed: 2026-03-09_
