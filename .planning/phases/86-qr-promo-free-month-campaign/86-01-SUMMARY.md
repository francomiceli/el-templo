---
phase: 86-qr-promo-free-month-campaign
plan: 01
subsystem: api, database
tags: [promo-codes, registration, subscriptions, drizzle, mysql]

# Dependency graph
requires:
  - phase: 45-architecture-foundation
    provides: Virtual ONLINE branch, isOnline subscription plans
  - phase: 48-subscriptions
    provides: SubscriptionService.assignPlan(), subscription_plans table
provides:
  - promo_plans table schema and migration
  - PromoType union type
  - Registration endpoint promo code auto-assignment
  - Seed script for initial promo codes (TEMPLOPASSBCN, AURACLUB1)
affects: [86-02, 86-03, 86-04, 86-05, 86-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Graceful degradation on promo assignment failure during registration"
    - "Self-assignment pattern: userId as both member and admin ID for promo subscriptions"

key-files:
  created:
    - el-templo-api/src/db/schema/promo-plans.ts
    - el-templo-api/src/db/migrations/0063_promo_plans.sql
    - el-templo-api/seed-promos.ts
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-api/src/modules/auth/routes.ts
    - el-templo-api/src/modules/auth/schemas.ts

key-decisions:
  - "AssignPlan called with user's branchId (ONLINE) and paymentMethod='cash' as neutral value since pricePaid=0 skips payment recording"
  - "Manual migration SQL instead of drizzle-kit generate (interactive prompts block non-interactive execution)"

patterns-established:
  - "Promo auto-assignment via graceful degradation: registration always succeeds regardless of promo errors"
  - "promoApplied boolean in registration response signals frontend whether promo was applied"

requirements-completed: [QR-04, QR-05, QR-02]

# Metrics
duration: 5min
completed: 2026-03-27
---

# Phase 86 Plan 01: Promo Plans Backend Summary

**promo_plans table with two seeded QR codes and registration endpoint auto-assigning free 30-day online subscription on valid promo code**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-27T17:22:08Z
- **Completed:** 2026-03-27T17:27:22Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Created promo_plans table with promoCode, subscriptionPlanId, validity windows, redemption tracking, and type enum (qr_auto/admin_assignable)
- Seeded two initial promo codes (TEMPLOPASSBCN, AURACLUB1) with validity window 2026-03-29 03:01 to 2026-03-30 15:00 UTC
- Extended registration endpoint to accept optional promoCode, look up promo plan, validate active status and time window, and auto-assign free subscription via SubscriptionService.assignPlan
- Registration returns promoApplied boolean for frontend UX signaling

## Task Commits

Each task was committed atomically:

1. **Task 1: Create promo_plans schema + migration + seed** - `c5c40875` (feat)
2. **Task 2: Extend registration endpoint for promo auto-assignment** - `b299b0ec` (feat)

## Files Created/Modified
- `el-templo-api/src/db/schema/promo-plans.ts` - promo_plans table schema with promoTypeEnum
- `el-templo-api/src/db/migrations/0063_promo_plans.sql` - Migration SQL for promo_plans table
- `el-templo-api/seed-promos.ts` - Seed script creating "Promo Gratuito 30 Dias" subscription plan and two promo codes
- `el-templo-api/src/db/schema/index.ts` - Added promo-plans export
- `el-templo-api/src/modules/subscriptions/types.ts` - Added PromoType union type
- `el-templo-api/src/modules/auth/routes.ts` - Promo code processing in registration handler with graceful degradation
- `el-templo-api/src/modules/auth/schemas.ts` - Added optional promoCode to register validation schema

## Decisions Made
- Used manual migration SQL file (0063_promo_plans.sql) because drizzle-kit generate has interactive prompts that block in non-interactive environments
- AssignPlan called with branchId from the user's resolved branch (ONLINE for promo registrations) and paymentMethod="cash" as a neutral value since the subscription is free (pricePaid=0 skips payment recording in the service)
- Created a dedicated "Promo Gratuito 30 Dias" subscription plan (isOnline=true, isTrial=true, both prices=0) as the target plan for promo subscriptions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed AssignPlanInput missing required fields**
- **Found during:** Task 2 (Registration promo auto-assignment)
- **Issue:** Plan code snippet called assignPlan with only { planId, startDate, priceTypeApplied } but the actual AssignPlanInput type requires branchId (number) and paymentMethod (PaymentMethod)
- **Fix:** Added branchId (from resolved user branch) and paymentMethod: "cash" to the assignPlan call
- **Files modified:** el-templo-api/src/modules/auth/routes.ts
- **Verification:** npx tsc --noEmit passes cleanly
- **Committed in:** b299b0ec (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Auto-fix necessary for TypeScript compilation. No scope creep.

## Issues Encountered
- drizzle-kit generate hung on interactive prompts about ambiguous column origins; resolved by writing migration SQL manually, which is consistent with the project pattern of custom migration runner
- Worktree lacked .env file for DB credentials; copied from main project to enable migration and seed execution

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- promo_plans table and seed data ready for admin CRUD (Plan 03) and QR redirect routes (Plan 05)
- Registration endpoint ready for frontend integration (Plan 02 registration page changes, Plan 04 integration tests)
- promoApplied response field ready for frontend promo badge UX

---
*Phase: 86-qr-promo-free-month-campaign*
*Completed: 2026-03-27*
