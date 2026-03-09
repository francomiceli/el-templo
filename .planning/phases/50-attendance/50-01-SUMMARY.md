---
phase: 50-attendance
plan: 01
subsystem: api
tags: [attendance, qr, hmac, aura, fastify, drizzle, mysql]

# Dependency graph
requires:
  - phase: 48-subscriptions
    provides: SubscriptionService, subscription_plans.multiBranch, auto-expire on read
  - phase: 49-payments
    provides: PaymentService.getMemberBalance().isOverdue for overdue enforcement
  - phase: 45-architecture-foundation
    provides: AuraService.award() with attendance sourceType
provides:
  - Attendance table with registrado/confirmado status enum
  - AttendanceService with QR token generation/validation, check-in enforcement, batch confirm, manual check-in
  - Admin routes (QR gen, today, confirm, manual, list, member history)
  - Member routes (QR check-in, own history)
  - Migration 0034 for attendance table
  - 18 integration tests covering all endpoints and error paths
affects: [50-02-attendance-admin-ui, 50-03-attendance-member-app, 51-scheduling]

# Tech tracking
tech-stack:
  added: []
  patterns: [HMAC-SHA256 QR tokens with JWT_SECRET, two-step check-in model]

key-files:
  created:
    - el-templo-api/src/db/schema/attendance.ts
    - el-templo-api/src/db/migrations/0034_attendance.sql
    - el-templo-api/src/modules/attendance/types.ts
    - el-templo-api/src/modules/attendance/schemas.ts
    - el-templo-api/src/modules/attendance/service.ts
    - el-templo-api/src/modules/attendance/routes.ts
    - el-templo-api/src/modules/attendance/index.ts
    - el-templo-api/test/attendance/attendance.test.ts
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/app.ts
    - el-templo-api/test/members/members.test.ts
    - el-templo-api/test/subscriptions/subscriptions.test.ts
    - el-templo-api/test/payments/payments.test.ts

key-decisions:
  - "HMAC-SHA256 QR tokens using JWT_SECRET (reuses existing env var, no new dependency)"
  - "AuraService instantiated without logger to avoid Pino type mismatch (same pattern as SubscriptionService)"
  - "Overdue check triggers for paused subscriptions past end date (active subs auto-expire first)"
  - "Dynamic non-virtual branch discovery in tests (migration seeds Templo Online before test seed data)"

patterns-established:
  - "Two-step attendance: QR scan creates registrado, coach batch-confirm promotes to confirmado + AURA"
  - "Dual route plugin pattern: attendanceAdminRoutes (role-guarded) + attendanceMemberRoutes (auth-only)"

requirements-completed: [ATTN-01, ATTN-02, ATTN-03, ATTN-04, ATTN-05]

# Metrics
duration: 11min
completed: 2026-03-09
---

# Phase 50 Plan 01: Attendance API Summary

**HMAC-signed QR check-in with subscription/overdue/branch enforcement, coach batch confirmation with AURA awards, and 18 integration tests**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-09T23:46:49Z
- **Completed:** 2026-03-09T23:57:38Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- Attendance table schema with registrado/confirmado status, qr/manual source enums, composite indexes
- AttendanceService with full check-in enforcement chain: QR validation, active subscription, overdue balance, branch restriction, once-per-day
- Batch confirm updates status and awards AURA per record with graceful duplicate handling
- Manual check-in auto-confirms with immediate AURA award
- 18 integration tests covering happy paths and all 6 error conditions
- Existing test suites updated with attendance cleanup (FK constraint order)

## Task Commits

Each task was committed atomically:

1. **Task 1: Attendance DB schema, migration, service, routes, and app registration** - `d19ed83` (feat)
2. **Task 2: Integration tests for attendance API** - `ad09519` (test)

## Files Created/Modified

- `el-templo-api/src/db/schema/attendance.ts` - Attendance table with status/source enums, relations, indexes
- `el-templo-api/src/db/migrations/0034_attendance.sql` - DDL migration matching Drizzle schema
- `el-templo-api/src/modules/attendance/types.ts` - AttendanceRecord, CheckInInput, QrPayload, AttendanceListParams
- `el-templo-api/src/modules/attendance/schemas.ts` - Fastify JSON schemas for all endpoints
- `el-templo-api/src/modules/attendance/service.ts` - Full business logic (QR, check-in, batch confirm, queries)
- `el-templo-api/src/modules/attendance/routes.ts` - Admin + member route plugins
- `el-templo-api/src/modules/attendance/index.ts` - Barrel export
- `el-templo-api/src/db/schema/index.ts` - Added attendance export
- `el-templo-api/src/app.ts` - Registered attendance admin + member route plugins
- `el-templo-api/test/attendance/attendance.test.ts` - 18 integration tests
- `el-templo-api/test/members/members.test.ts` - Added attendance cleanup to FK order
- `el-templo-api/test/subscriptions/subscriptions.test.ts` - Added attendance cleanup to FK order
- `el-templo-api/test/payments/payments.test.ts` - Added attendance cleanup to FK order

## Decisions Made

- HMAC-SHA256 QR tokens using existing JWT_SECRET env var (no new dependency needed)
- AuraService instantiated without logger param to avoid Pino Logger vs FastifyBaseLogger type mismatch (same pattern as SubscriptionService)
- Overdue enforcement triggers for paused subscriptions past end date -- active subs auto-expire first and are caught by "no active subscription" check
- Dynamic branch discovery in tests -- migration 0030 seeds Templo Online (virtual, id=1) before test seed data inserts Test Branch (non-virtual, id=2)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added attendance cleanup to existing test cleanup functions**

- **Found during:** Task 2 (Integration tests)
- **Issue:** Members/subscriptions/payments test cleanupAll functions could not delete users due to new attendance FK constraint
- **Fix:** Added `await app.db.delete(attendance)` as first cleanup step in members.test.ts, subscriptions.test.ts, payments.test.ts
- **Files modified:** test/members/members.test.ts, test/subscriptions/subscriptions.test.ts, test/payments/payments.test.ts
- **Verification:** Full test suite (301 tests) passes with no regressions
- **Committed in:** ad09519 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed test branch ID assumption**

- **Found during:** Task 2 (Integration tests)
- **Issue:** Tests assumed branchId=1 is non-virtual, but migration 0030 seeds Templo Online (virtual) as id=1. Test Branch (non-virtual) gets id=2.
- **Fix:** Dynamic branch discovery using `WHERE is_virtual = false` instead of hardcoded id=1
- **Files modified:** test/attendance/attendance.test.ts
- **Verification:** QR generation test passes for correct non-virtual branch
- **Committed in:** ad09519 (Task 2 commit)

**3. [Rule 1 - Bug] Fixed overdue check-in test scenario**

- **Found during:** Task 2 (Integration tests)
- **Issue:** Expired subscriptions auto-expire on read, making them invisible to getMemberSubscription. Overdue check never triggers for expired subs.
- **Fix:** Used paused subscription (not auto-expired) past end date to test overdue path. Added separate test for expired-subscription-no-active-sub path.
- **Files modified:** test/attendance/attendance.test.ts
- **Verification:** Both overdue and expired test cases pass with correct error messages
- **Committed in:** ad09519 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All auto-fixes necessary for test correctness and existing test compatibility. No scope creep.

## Issues Encountered

- AuraService constructor expects optional Pino `Logger` type, while FastifyBaseLogger is not assignable -- resolved by omitting logger param (AuraService already makes it optional, same pattern as SubscriptionService uses)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Attendance API fully operational, all endpoints tested
- Plans 02 (Admin UI) and 03 (Member App) can build against these routes
- QR token format documented: base64url(JSON payload).base64url(HMAC-SHA256 signature)

---

_Phase: 50-attendance_
_Completed: 2026-03-09_
