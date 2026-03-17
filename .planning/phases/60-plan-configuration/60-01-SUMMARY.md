---
phase: 60-plan-configuration
plan: 01
subsystem: api, database
tags: [drizzle, mysql, fastify, subscriptions, settings, class-tracking]

requires:
  - phase: 59-schema-extensions-data-import
    provides: "subscription_plans with classesPerWeek, bookingMode, durationDays"
provides:
  - "Migration 0040: classes_remaining, fixed_days, grace_check_ins_after_expiry on subscriptions"
  - "system_settings table for global config (grace_period_days)"
  - "SettingsService with grace period CRUD"
  - "Budget calculation: ceil(durationDays/7) * classesPerWeek on subscription assign"
  - "Fixed days storage on subscription for fixed-mode plans"
  - "Enhanced SubscriptionDetail with classesRemaining, fixedDays, graceCheckInsAfterExpiry"
  - "GET /api/admin/subscriptions/members/:userId/class-usage endpoint"
  - "GET/PUT /api/admin/settings/grace-period endpoints"
affects: [60-02-PLAN, 60-03-PLAN, attendance enforcement, booking enforcement]

tech-stack:
  added: []
  patterns:
    [
      "system_settings key-value table for global config",
      "budget calculation at subscription creation time",
    ]

key-files:
  created:
    - "el-templo-api/src/db/migrations/0040_plan_configuration.sql"
    - "el-templo-api/src/db/schema/system-settings.ts"
    - "el-templo-api/src/modules/settings/service.ts"
    - "el-templo-api/src/modules/settings/routes.ts"
    - "el-templo-api/src/modules/settings/schemas.ts"
    - "el-templo-api/src/modules/settings/index.ts"
    - "el-templo-api/test/settings/settings.test.ts"
  modified:
    - "el-templo-api/src/db/schema/subscriptions.ts"
    - "el-templo-api/src/db/schema/index.ts"
    - "el-templo-api/src/modules/subscriptions/service.ts"
    - "el-templo-api/src/modules/subscriptions/types.ts"
    - "el-templo-api/src/modules/subscriptions/schemas.ts"
    - "el-templo-api/src/modules/subscriptions/routes.ts"
    - "el-templo-api/src/modules/subscriptions/index.ts"
    - "el-templo-api/src/app.ts"
    - "el-templo-api/test/subscriptions/subscriptions.test.ts"

key-decisions:
  - "system_settings as key-value table rather than per-setting columns for extensibility"
  - "Budget pre-calculated at subscription creation (not computed on-the-fly) for performance"
  - "fixedDays stored as JSON array on subscription record for per-subscription flexibility"
  - "Grace period validation range 0-30 days (admin-only access)"

patterns-established:
  - "Settings module pattern: key-value system_settings table with typed service accessor"
  - "Budget calculation: ceil(durationDays/7) * classesPerWeek at assign time"

requirements-completed: [PLANS-01, PLANS-02, PLANS-03, PLANS-04, PLANS-05]

duration: 25min
completed: 2026-03-17
---

# Phase 60 Plan 01: Schema + Settings + Budget Calculation Summary

**Class tracking schema (classesRemaining, fixedDays, graceCheckIns), system_settings table with grace period CRUD, and budget calculation at subscription assignment with enhanced detail API**

## Performance

- **Duration:** 25 min
- **Started:** 2026-03-17T00:26:49Z
- **Completed:** 2026-03-17T00:52:00Z
- **Tasks:** 2 (both TDD: RED + GREEN)
- **Files modified:** 17 (7 created, 10 modified)

## Accomplishments

- Migration 0040 adds class tracking columns to subscriptions and creates system_settings table
- SettingsService with get/set grace period (0-30 days validation, admin-only)
- Budget calculation on subscription assign: ceil(durationDays/7) \* classesPerWeek
- Fixed days stored as JSON when plan is fixed mode
- Enhanced SubscriptionDetail returns classesRemaining, fixedDays, graceCheckInsAfterExpiry
- Class usage endpoint returns weekly attendance count with plan limits
- 11 new tests (5 settings + 6 class tracking), all 466 tests pass

## Task Commits

Each task was committed atomically (TDD: test + implementation):

1. **Task 1: Schema migration + Drizzle models + settings service**
   - `96ca7cef` (test) - Failing tests for settings API grace period
   - `17c7efed` (feat) - Migration 0040, system_settings schema, SettingsService, grace period API

2. **Task 2: Subscription service -- budget calculation + enhanced detail**
   - `884efe44` (test) - Failing tests for class tracking and budget calculation
   - `06710972` (feat) - Budget calculation, fixedDays, enhanced detail, class usage endpoint

## Files Created/Modified

**Created:**

- `el-templo-api/src/db/migrations/0040_plan_configuration.sql` - Migration: 3 columns on subscriptions + system_settings table
- `el-templo-api/src/db/schema/system-settings.ts` - Drizzle schema for system_settings
- `el-templo-api/src/modules/settings/service.ts` - SettingsService with grace period get/set
- `el-templo-api/src/modules/settings/routes.ts` - GET/PUT /api/admin/settings/grace-period
- `el-templo-api/src/modules/settings/schemas.ts` - Fastify JSON schemas for settings endpoints
- `el-templo-api/src/modules/settings/index.ts` - Module barrel export
- `el-templo-api/test/settings/settings.test.ts` - Integration tests for settings API

**Modified:**

- `el-templo-api/src/db/schema/subscriptions.ts` - Added classesRemaining, fixedDays, graceCheckInsAfterExpiry columns
- `el-templo-api/src/db/schema/index.ts` - Re-exports system-settings
- `el-templo-api/src/modules/subscriptions/service.ts` - Budget calculation, enhanced queries, class usage method
- `el-templo-api/src/modules/subscriptions/types.ts` - AssignPlanInput.fixedDays, SubscriptionDetail new fields, ClassUsageInfo
- `el-templo-api/src/modules/subscriptions/schemas.ts` - fixedDays in assign, new fields in detail, classUsageSchema
- `el-templo-api/src/modules/subscriptions/routes.ts` - GET /members/:userId/class-usage endpoint
- `el-templo-api/src/modules/subscriptions/index.ts` - Export ClassUsageInfo type
- `el-templo-api/src/app.ts` - Register settings routes at /api/admin/settings
- `el-templo-api/test/subscriptions/subscriptions.test.ts` - 6 new class tracking tests

## Decisions Made

- **system_settings as key-value table**: Extensible pattern for future settings (e.g., booking window, max class size) without schema changes per setting
- **Budget pre-calculated at subscription creation**: ceil(durationDays/7) \* classesPerWeek stored on the subscription row, not computed on-the-fly -- avoids recalculation on every check-in/booking query
- **fixedDays as JSON on subscription**: Allows per-subscription day assignment flexibility (admin can change days without affecting other subscriptions)
- **Grace period validation 0-30**: Prevents misconfiguration; superadmin-only access enforced via admin role guard

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Schema foundation complete for Plans 02 (enforcement at check-in/booking) and 03 (admin UI)
- system_settings table seeded with default grace_period_days = 5
- classesRemaining, fixedDays, and graceCheckInsAfterExpiry columns available for enforcement logic
- Class usage endpoint ready for admin UI to display weekly attendance stats

## Self-Check: PASSED

- All 7 created files verified on disk
- All 4 task commits verified in git log (96ca7cef, 17c7efed, 884efe44, 06710972)

---

_Phase: 60-plan-configuration_
_Completed: 2026-03-17_
