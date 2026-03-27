---
phase: 86-qr-promo-free-month-campaign
plan: 06
subsystem: testing
tags: [vitest, integration-tests, promo-codes, registration, admin-crud]

requires:
  - phase: 86-01
    provides: promo_plans schema, migration, registration promo auto-assignment
  - phase: 86-05
    provides: admin promo CRUD API endpoints (list, create, deactivate)
provides:
  - Integration tests for promo registration flow (6 test cases)
  - Integration tests for admin promo CRUD endpoints (8 test cases)
  - Updated cleanAllTestData with promoPlans deletion for FK-safe cleanup
  - Updated registerUser helper with promoCode and promoApplied types
affects: []

tech-stack:
  added: []
  patterns:
    - "Promo test seeding pattern: seedPromo helper with configurable dates and isActive"
    - "makeRegPayload with unique email/dni generation for test isolation"

key-files:
  created:
    - el-templo-api/test/auth/promo-registration.test.ts
    - el-templo-api/test/subscriptions/promo-plans.test.ts
  modified:
    - el-templo-api/test/helpers.ts

key-decisions:
  - "promoPlans deletion placed in Layer 3 before subscriptions to respect FK ordering"

patterns-established: []

requirements-completed: [QR-04, QR-05, QR-11]

duration: 7min
completed: 2026-03-27
---

# Phase 86 Plan 06: Promo Integration Tests Summary

**14 integration tests covering promo registration flow (valid/expired/invalid/inactive/no-promo/duplicate) and admin promo CRUD (list/auth/roles/create/duplicate/invalid-ref/deactivate/404)**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-27T17:40:12Z
- **Completed:** 2026-03-27T17:47:54Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- 6 promo registration tests verifying graceful degradation: valid promo auto-assigns subscription, expired/invalid/inactive promos allow registration without subscription, duplicate email still returns 409
- 8 admin promo CRUD tests covering auth (401), role gating (403 for members), creation with unique code validation (409), subscription plan reference validation (404), and deactivation with DB verification
- Updated cleanAllTestData to include promoPlans deletion in correct FK order
- Full test suite passes (635 tests across 35 files) with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Update test helpers + add promo registration tests** - `4d3d8e75` (test)
2. **Task 2: Add admin promo CRUD integration tests** - `3ed76d45` (test)

## Files Created/Modified
- `el-templo-api/test/helpers.ts` - Added promoPlans cleanup, promoCode to registerUser type
- `el-templo-api/test/auth/promo-registration.test.ts` - 6 integration tests for promo registration flow
- `el-templo-api/test/subscriptions/promo-plans.test.ts` - 8 integration tests for admin promo CRUD

## Decisions Made
- promoPlans deletion placed in Layer 3 of cleanAllTestData before subscriptionPlans to respect FK ordering (promo_plans.subscriptionPlanId references subscription_plans)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All promo API endpoints now have comprehensive integration test coverage
- Full test suite green with 635 passing tests
- No blockers

## Self-Check: PASSED

- All 3 created/modified files verified on disk
- Both task commits (4d3d8e75, 3ed76d45) verified in git history

---
*Phase: 86-qr-promo-free-month-campaign*
*Completed: 2026-03-27*
