---
phase: 57-registration-types-and-member-creation-flow-fixes
plan: 01
subsystem: api
tags: [auth, members, email, registration, subscriptions, drizzle]

# Dependency graph
requires:
  - phase: 48-subscriptions
    provides: SubscriptionService.assignPlan() for auto-subscription on member creation
  - phase: 56-god-object-decomposition
    provides: Constructor DI pattern for service instantiation
provides:
  - Auth register endpoint with Online default branch, required DNI+phone+firstName+lastName, DNI uniqueness check
  - Admin member creation with plan-first flow (planId required, auto-password, auto-subscription)
  - EmailService module for transactional emails (Resend-based, graceful degradation)
  - Members list API with planName field and planId filter
  - Updated registerUser() test helper with DNI/phone defaults for backward compatibility
affects: [57-02, 57-03, admin-member-creation-ui, app-registration-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      plan-first-member-creation,
      auto-generated-passwords,
      email-service-graceful-degradation,
    ]

key-files:
  created:
    - el-templo-api/src/modules/email/service.ts
    - el-templo-api/src/modules/email/templates.ts
    - el-templo-api/src/modules/email/index.ts
  modified:
    - el-templo-api/src/modules/auth/routes.ts
    - el-templo-api/src/modules/auth/schemas.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/members/schemas.ts
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/modules/members/types.ts
    - el-templo-api/test/helpers.ts
    - el-templo-api/test/auth/auth.test.ts
    - el-templo-api/test/members/members.test.ts
    - el-templo-api/test/subscriptions/subscriptions.test.ts
    - el-templo-api/test/payments/payments.test.ts
    - el-templo-api/test/analytics/analytics.test.ts
    - el-templo-api/test/attendance/attendance.test.ts
    - el-templo-api/test/scheduling/scheduling.test.ts

key-decisions:
  - "Used Resend instead of nodemailer (plan specified nodemailer but project already uses Resend in franchise/gladius/academy services)"
  - "Auto-generated DNI in test helper uses base36 timestamp to fit varchar(20) column limit"
  - "Raw SQL column names in correlated subqueries (subscription_status not status) due to Drizzle enum naming bug"
  - "Test createMember helpers changed from POST /admin/members to registerUser() auth endpoint to avoid auto-subscription side effects"

patterns-established:
  - "Plan-first member creation: admin always selects plan at creation time, subscription auto-assigned"
  - "EmailService graceful degradation: skip email when RESEND_API_KEY not configured (dev/test)"
  - "registerUser() test helper with auto-generated defaults for backward compatibility across all test files"

requirements-completed: []

# Metrics
duration: 15min
completed: 2026-03-12
---

# Phase 57 Plan 01: Backend Registration and Member Creation Flow Summary

**Auth register with Online default branch and DNI/phone requirements; admin member creation with plan-first auto-subscription and password-set email via Resend**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-12T13:30:00Z
- **Completed:** 2026-03-12T13:50:00Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments

- Auth register endpoint defaults to Online branch (not PARK), requires DNI+phone+firstName+lastName, enforces DNI uniqueness with 409
- Admin member creation is plan-first: planId required, password auto-generated via crypto.randomBytes, subscription auto-created via SubscriptionService, password-set email sent via EmailService
- Members list API returns planName per member and supports planId filter (including planId=0 for "Sin plan")
- All 407 tests pass across 21 test files after updating registerUser() helper with DNI/phone defaults

## Task Commits

Each task was committed atomically:

1. **Task 1: Auth register endpoint + email service module** - `315f24a6` (feat)
2. **Task 2: Admin member creation + members list plan filter + test updates** - `56ff3c6c` (feat)

## Files Created/Modified

- `el-templo-api/src/modules/email/service.ts` - EmailService using Resend with graceful degradation
- `el-templo-api/src/modules/email/templates.ts` - Spanish HTML email template for password-set
- `el-templo-api/src/modules/email/index.ts` - Barrel export
- `el-templo-api/src/modules/auth/routes.ts` - Online default branch, DNI/phone in insert, DNI uniqueness check
- `el-templo-api/src/modules/auth/schemas.ts` - dni, phone, firstName, lastName added to required
- `el-templo-api/src/modules/members/routes.ts` - Plan-first creation with auto-subscription and email, planId filter on list
- `el-templo-api/src/modules/members/schemas.ts` - planId in create, planId filter in list, planName in response
- `el-templo-api/src/modules/members/service.ts` - Auto-password generation, planName subquery, planId filter logic
- `el-templo-api/src/modules/members/types.ts` - planId in CreateMemberInput, planName in MemberListItem, planId in MemberListParams
- `el-templo-api/test/helpers.ts` - registerUser() with DNI/phone defaults, error checking on response
- `el-templo-api/test/auth/auth.test.ts` - New tests for DNI/phone validation and DNI uniqueness
- `el-templo-api/test/members/members.test.ts` - Updated for plan-first flow, new planName/planId filter tests
- `el-templo-api/test/{subscriptions,payments,analytics,attendance,scheduling}/*.test.ts` - createMember helpers updated to use registerUser()

## Decisions Made

- **Resend over nodemailer:** Plan specified nodemailer but project already has Resend installed and used in 4 other services. Used Resend for consistency (Rule 3 - blocking).
- **Base36 DNI in tests:** Auto-generated DNI `T${timestamp.toString(36)}${random}` fits varchar(20) limit. Original `DNI-${timestamp}-${random}` was 22 chars, causing 500 errors.
- **Raw SQL in subqueries:** Used `s.subscription_status` instead of Drizzle's `s.status` in correlated subqueries due to known Drizzle enum column naming bug (documented in Phase 56 decisions).
- **registerUser() for test member creation:** Changed 5 test files' createMember helpers from POST /admin/members to registerUser() auth endpoint to avoid auto-subscription side effects introduced by plan-first flow.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used Resend instead of nodemailer for email service**

- **Found during:** Task 1 (Email service module creation)
- **Issue:** Plan specified nodemailer + SMTP, but project already uses Resend in franchise/gladius/academy/app-landing services
- **Fix:** Implemented EmailService using Resend library (already installed) with RESEND_API_KEY env var
- **Files modified:** el-templo-api/src/modules/email/service.ts
- **Verification:** Type check passes, graceful degradation when key not set
- **Committed in:** 315f24a6

**2. [Rule 1 - Bug] Fixed SQL column name in correlated subqueries**

- **Found during:** Task 2 (Members list planName subquery)
- **Issue:** Drizzle generates `s.status` but MySQL column is actually `subscription_status` (enum name becomes column name)
- **Fix:** Used raw SQL `s.subscription_status` in all 3 subqueries (planName, planId filter, planId=0 filter)
- **Files modified:** el-templo-api/src/modules/members/service.ts
- **Verification:** All member list tests pass including planName and planId filter tests
- **Committed in:** 56ff3c6c

**3. [Rule 1 - Bug] Fixed auto-generated DNI exceeding varchar(20) column limit**

- **Found during:** Task 2 (Test execution)
- **Issue:** `DNI-${Date.now()}-${random}` generated 22-char strings, exceeding varchar(20). Caused 500 errors on user insert.
- **Fix:** Changed to `T${Date.now().toString(36)}${random}` producing 12-char strings
- **Files modified:** el-templo-api/test/helpers.ts
- **Verification:** All 407 tests pass
- **Committed in:** 56ff3c6c

**4. [Rule 1 - Bug] Fixed baseMember -> baseMemberDefaults variable rename**

- **Found during:** Task 2 (Test execution)
- **Issue:** attendance.test.ts and scheduling.test.ts referenced old `baseMember.email`/`baseMember.password` after variable was renamed to `baseMemberDefaults`
- **Fix:** Replaced all `baseMember.` references with `baseMemberDefaults.` in both files
- **Files modified:** el-templo-api/test/attendance/attendance.test.ts, el-templo-api/test/scheduling/scheduling.test.ts
- **Verification:** All attendance and scheduling tests pass
- **Committed in:** 56ff3c6c

---

**Total deviations:** 4 auto-fixed (3 bugs, 1 blocking)
**Impact on plan:** All auto-fixes necessary for correctness. Resend substitution matches existing project patterns. No scope creep.

## Issues Encountered

- registerUser() helper returned raw JSON without checking response status, causing confusing `undefined` errors when registration failed. Added status code check with descriptive error message.

## User Setup Required

None - EmailService gracefully degrades when RESEND_API_KEY is not configured. No new env vars needed for development/testing.

## Next Phase Readiness

- Backend API changes complete for registration and member creation flows
- Plan 57-02 (admin UI updates) can proceed -- member creation form needs planId field, member list needs planName column
- Plan 57-03 (app registration UI) can proceed -- registration form needs DNI and phone fields

---

_Phase: 57-registration-types-and-member-creation-flow-fixes_
_Completed: 2026-03-12_
