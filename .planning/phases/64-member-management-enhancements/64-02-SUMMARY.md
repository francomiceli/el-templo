---
phase: 64-member-management-enhancements
plan: 02
subsystem: api, ui
tags: [proration, subscription, plan-change, upgrade, downgrade]

requires:
  - phase: 63-cash-box
    provides: PaymentService DI in SubscriptionService for auto-payment recording
provides:
  - Backend proration logic (class-based and unlimited plans)
  - GET /change-plan-preview endpoint returning ChangePlanPreview
  - Upgrade/downgrade validation in changePlan with prorated payment
  - Frontend price comparison summary in AssignPlanDialog change mode
affects: [member-management-enhancements]

tech-stack:
  added: []
  patterns:
    - "Proration by remaining classes ratio (class-based) or remaining days ratio (unlimited)"
    - "Preview endpoint pattern: GET endpoint for previewing mutation effects before POST"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-api/src/modules/subscriptions/schemas.ts
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/routes.ts
    - el-templo-api/test/subscriptions/subscriptions.test.ts
    - el-templo-api/test/setup.ts
    - el-templo-admin/src/types/subscription.ts
    - el-templo-admin/src/composables/useSubscriptionsApi.ts
    - el-templo-admin/src/components/AssignPlanDialog.vue

key-decisions:
  - "Proration credit uses pricePaid (what member actually paid) not priceRegular"
  - "Net amount = max(0, targetPlan.priceRegular - proration.remainingValue) ensures non-negative"
  - "changePlan applies proration via priceOverrideAmount/Reason to reuse existing assignPlan payment logic"

patterns-established:
  - "Preview endpoint pattern: GET /change-plan-preview?targetPlanId=X returns mutation preview with allowed/blocked status"
  - "Change mode in AssignPlanDialog skips pricing/date steps, goes directly to confirm with proration summary"

requirements-completed: [MEMBER-02]

duration: 48min
completed: 2026-03-18
---

# Phase 64 Plan 02: Plan Change with Proration Summary

**Mid-cycle plan upgrade with prorated credit calculation, downgrade blocking, preview endpoint, and price comparison UI in AssignPlanDialog**

## Performance

- **Duration:** 48 min
- **Started:** 2026-03-18T03:56:15Z
- **Completed:** 2026-03-18T04:44:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Backend proration logic: class-based plans use remaining classes ratio, unlimited plans use remaining days ratio
- GET /change-plan-preview endpoint returns proration details or downgrade block message with expiry date
- changePlan POST validates upgrade/downgrade and applies prorated credit to auto-recorded payment
- Frontend AssignPlanDialog change mode shows price comparison summary (current plan, prorated credit, new plan, net amount to charge)
- Downgrade blocked with clear message showing subscription expiry date

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend proration logic (TDD)** - `3c993eea` (test: failing tests), `bd17cce3` (feat: implementation + setup fix)
2. **Task 2: Frontend price comparison UI** - `e7b7cdf0` (feat: AssignPlanDialog change mode UI)

## Files Created/Modified

- `el-templo-api/src/modules/subscriptions/types.ts` - Added ProrationResult and ChangePlanPreview interfaces
- `el-templo-api/src/modules/subscriptions/schemas.ts` - Added changePlanPreviewSchema for request/response validation
- `el-templo-api/src/modules/subscriptions/service.ts` - Added calculateProration, getChangePlanPreview, and modified changePlan with proration
- `el-templo-api/src/modules/subscriptions/routes.ts` - Added GET /change-plan-preview route
- `el-templo-api/test/subscriptions/subscriptions.test.ts` - 6 new tests for proration (upgrade, downgrade, class-based, unlimited, same price, payment)
- `el-templo-api/test/setup.ts` - Fixed test setup to use mysql CLI + drizzle-kit push (WSL2 compatibility)
- `el-templo-admin/src/types/subscription.ts` - Added ProrationResult and ChangePlanPreview types
- `el-templo-admin/src/composables/useSubscriptionsApi.ts` - Added getChangePlanPreview method
- `el-templo-admin/src/components/AssignPlanDialog.vue` - Price comparison UI for change mode

## Decisions Made

- Proration credit uses `pricePaid` (actual amount member paid) rather than `priceRegular` to handle cases where member got a discount
- Net amount formula: `max(0, targetPlan.priceRegular - proration.remainingValue)` ensures non-negative payment
- Backend applies proration via `priceOverrideAmount` + `priceOverrideReason` to reuse existing `assignPlan` payment recording logic
- Change mode in AssignPlanDialog skips pricing/date selection steps entirely -- proration determines the price, not the regular pricing engine

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed test setup.ts for MySQL 8 / WSL2 compatibility**

- **Found during:** Task 1 (running tests)
- **Issue:** MySQL 8 on WSL2 has race conditions with DROP DATABASE where async filesystem cleanup causes subsequent operations to fail with "Unknown database". The execute() prepared statement driver also silently fails for DDL statements.
- **Fix:** Rewrote test setup to use mysql CLI for DB creation (CREATE DATABASE IF NOT EXISTS + drop all tables) and drizzle-kit push for schema creation. Teardown changed to no-op.
- **Files modified:** el-templo-api/test/setup.ts
- **Verification:** All 42 subscription tests pass, including 6 new proration tests
- **Committed in:** bd17cce3 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Setup fix was required to run tests at all. No scope creep.

## Issues Encountered

- MySQL 8 on WSL2 has multiple interacting issues: (1) execute() silently fails for DDL, (2) DROP DATABASE has async filesystem cleanup that races with subsequent CREATE DATABASE + DDL in the same session, (3) multi-statement batches can lose database context. Solution: use mysql CLI with separate calls for DB management and drizzle-kit push for schema.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan change with proration is complete and tested
- Ready for Phase 64 Plan 03 (member export/management enhancements)
- Backend proration logic reusable if future plans need similar credit calculations

---

_Phase: 64-member-management-enhancements_
_Completed: 2026-03-18_
