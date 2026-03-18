---
phase: 63-cash-box
plan: 01
subsystem: api
tags: [fastify, drizzle, payments, subscriptions, migration]

# Dependency graph
requires:
  - phase: 49-payments
    provides: PaymentService with recording, voiding, financial summary
  - phase: 61-qr-access-control
    provides: subscription_schedules junction table, fixed-plan booking generation
provides:
  - subscriptionId NOT NULL migration on payments table
  - morosos/balance/overdue dead code fully removed from payments, members, analytics, attendance, booking
  - subscription-only and voided-exclusion filtering on payment list and summary
  - recepcionista role access on payment routes
  - paymentMethod required on AssignPlanInput and schemas
  - auto-payment recording on plan assign/change
  - renewSubscription method and POST /subscription/renew endpoint
affects: [63-02, 63-03, 64-member-management-enhancements]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Auto-payment recording on subscription lifecycle operations (assign, change, renew)"
    - "Subscription renewal extends existing record instead of creating new"

key-files:
  created:
    - el-templo-api/src/db/migrations/0043_subscription_id_not_null.sql
  modified:
    - el-templo-api/src/db/schema/payments.ts
    - el-templo-api/src/modules/payments/service.ts
    - el-templo-api/src/modules/payments/routes.ts
    - el-templo-api/src/modules/payments/schemas.ts
    - el-templo-api/src/modules/payments/types.ts
    - el-templo-api/src/modules/payments/index.ts
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/routes.ts
    - el-templo-api/src/modules/subscriptions/schemas.ts
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/members/schemas.ts
    - el-templo-api/src/modules/members/types.ts
    - el-templo-api/src/modules/analytics/service.ts
    - el-templo-api/src/modules/analytics/schemas.ts
    - el-templo-api/src/modules/analytics/types.ts
    - el-templo-api/src/modules/attendance/service.ts
    - el-templo-api/src/modules/scheduling/booking-service.ts

key-decisions:
  - "Subscription renewal extends existing record (same ID) rather than creating a new subscription"
  - "Auto-payment recording integrated into assignPlan and renewSubscription via PaymentService DI"
  - "paymentMethod defaults to 'cash' for auto-subscriptions created during member creation"
  - "Morosos/overdue concept fully removed from analytics (KPIs, attention list, financial outstanding/collectionRate)"

patterns-established:
  - "Auto-payment on subscription lifecycle: assign/change/renew all auto-record payments"
  - "Renewal extends endDate from current endDate (if active) or today (if expired)"

requirements-completed: []

# Metrics
duration: 39min
completed: 2026-03-18
---

# Phase 63 Plan 01: Cash Box API Backend Summary

**Schema migration (subscriptionId NOT NULL), morosos/balance/overdue removal across all modules, auto-payment recording on assign/change/renew, and subscription renewal endpoint**

## Performance

- **Duration:** 39 min
- **Started:** 2026-03-18T02:27:44Z
- **Completed:** 2026-03-18T03:06:00Z
- **Tasks:** 2
- **Files modified:** 29

## Accomplishments

- Migration making payments.subscriptionId NOT NULL with orphan cleanup
- Complete morosos/balance/overdue dead code removal from payments, members, analytics, attendance, and booking modules
- Payment list and financial summary now exclude voided payments and only show subscription-linked payments
- AssignPlan and ChangePlan APIs require paymentMethod and auto-record payments
- New POST /members/:userId/subscription/renew endpoint with fixed-plan booking regeneration
- Recepcionista role added to payment route access

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema migration, remove morosos/balance dead code, add subscription-only filtering** - `87184afb` (feat)
2. **Task 2: Add paymentMethod to AssignPlan/ChangePlan API and subscription renewal endpoint** - `515ca84e` (feat)

## Files Created/Modified

- `el-templo-api/src/db/migrations/0043_subscription_id_not_null.sql` - Migration: delete orphan payments, make subscription_id NOT NULL
- `el-templo-api/src/db/schema/payments.ts` - Added .notNull() to subscriptionId column
- `el-templo-api/src/modules/payments/service.ts` - Removed getMemberBalance, getOverdueMembers, getMorososCount; simplified getFinancialSummary; added voided/subscription filters to listPayments
- `el-templo-api/src/modules/payments/routes.ts` - Removed /balance and /morosos routes; added recepcionista to ADMIN_ROLES; made subscriptionId required in body
- `el-templo-api/src/modules/payments/schemas.ts` - Removed balance/morosos schemas; updated subscriptionId to required; removed totalOutstanding/collectionRate from summary
- `el-templo-api/src/modules/payments/types.ts` - Removed MemberBalance, OverdueMember; made subscriptionId required in RecordPaymentInput; simplified FinancialSummary
- `el-templo-api/src/modules/subscriptions/service.ts` - Added PaymentService DI; auto-payment in assignPlan; new renewSubscription method
- `el-templo-api/src/modules/subscriptions/routes.ts` - Pass paymentService to constructor; added POST /subscription/renew route
- `el-templo-api/src/modules/subscriptions/schemas.ts` - Added paymentMethod to assign/change schemas; added renewSubscriptionSchema
- `el-templo-api/src/modules/subscriptions/types.ts` - Added paymentMethod to AssignPlanInput; added RenewSubscriptionInput
- `el-templo-api/src/modules/members/service.ts` - Removed overdueSubquery, overdue filter, isOverdue mapping
- `el-templo-api/src/modules/members/routes.ts` - Removed overdue query param; added paymentMethod to auto-subscription on member creation
- `el-templo-api/src/modules/analytics/service.ts` - Removed morosos KPI, overdue attention list, outstanding/collectionRate computation
- `el-templo-api/src/modules/attendance/service.ts` - Removed overdue check-in block and overdue warning
- `el-templo-api/src/modules/scheduling/booking-service.ts` - Removed overdue reservation block

## Decisions Made

- Subscription renewal extends existing record (same subscription ID) rather than creating a new one -- consistent with the context decision that renewal = same plan
- PaymentService passed as optional constructor parameter to SubscriptionService for backward compatibility with existing code that doesn't pass it
- Member creation auto-subscription defaults to paymentMethod: "cash" since no UI exists to select method during member creation
- Morosos removal cascaded to analytics module (morosos KPI, attention list overdue type, outstanding/collectionRate financial metrics) since they all relied on the removed overdue concept

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed getMemberBalance references from attendance and booking services**

- **Found during:** Task 1
- **Issue:** AttendanceService and BookingService called PaymentService.getMemberBalance which was deleted
- **Fix:** Removed overdue check-in block from attendance service and overdue booking block from booking service
- **Files modified:** el-templo-api/src/modules/attendance/service.ts, el-templo-api/src/modules/scheduling/booking-service.ts
- **Committed in:** 87184afb

**2. [Rule 3 - Blocking] Removed morosos/overdue from analytics module**

- **Found during:** Task 1
- **Issue:** Analytics service had its own morosos KPI, overdue attention list, and outstanding/collectionRate that would fail after payment service changes
- **Fix:** Removed getMorososKpi, countMorosos, getOutstandingAndCollection methods; removed morososCount from KpiStats; removed overdue from attention list; removed totalOutstanding/collectionRate from FinancialAnalytics
- **Files modified:** el-templo-api/src/modules/analytics/service.ts, types.ts, schemas.ts
- **Committed in:** 87184afb

**3. [Rule 3 - Blocking] Updated test files across 5 test suites**

- **Found during:** Task 1 and Task 2
- **Issue:** Tests referenced removed morosos/overdue behavior, missing subscriptionId, and missing paymentMethod
- **Fix:** Removed overdue test cases from attendance and scheduling tests; updated analytics tests to remove morosos/outstanding assertions and fix revenue expectations; updated all assignPlan calls to include paymentMethod
- **Files modified:** 5 test files (payments, analytics, attendance, scheduling, subscriptions)
- **Committed in:** 87184afb, 515ca84e

---

**Total deviations:** 3 auto-fixed (all Rule 3 - blocking)
**Impact on plan:** All auto-fixes necessary because morosos removal cascaded beyond the files listed in the plan. No scope creep.

## Issues Encountered

- Test isolation issues caused transient failures when running the full suite (tests sharing MySQL database), resolved by re-running
- Analytics recordPayment helper needed to track subscriptions per member to avoid duplicate subscription creation when multiple payments are recorded for the same member

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend API fully ready for cash box frontend (Plan 63-02)
- Renewal endpoint ready for frontend renewal dialog (Plan 63-03)
- All tests passing (465 tests across 22 test files)

---

_Phase: 63-cash-box_
_Completed: 2026-03-18_
