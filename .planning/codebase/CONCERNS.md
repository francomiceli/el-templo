# Codebase Concerns

**Analysis Date:** 2026-03-10

## Tech Debt

**Incomplete activity tracking in member app:**

- Issue: `WeeklyView.vue` has a TODO comment indicating completed activity dates are not yet integrated. Currently hardcoded as empty array.
- Files: `/home/franco/projects/el-templo/el-templo-app/src/modules/training/pages/WeeklyView.vue:82`
- Impact: Users cannot see which workout days they've completed; activity history is incomplete and UI state is inaccurate
- Fix approach: Connect to user activity store to fetch actual completion dates and update the `completedDates` array from store state

**No integration tests for new scheduling module:**

- Issue: Scheduling service (`/home/franco/projects/el-templo/el-templo-api/src/modules/scheduling/service.ts`, 1577 lines) handles complex booking lifecycle with 9+ validation steps but has zero test coverage
- Files: `el-templo-api/src/modules/scheduling/`
- Impact: Regressions in booking creation, cancellation, waitlist promotion, and capacity enforcement undetected; critical payment/subscription interaction untested
- Fix approach: Create `el-templo-api/test/scheduling/scheduling.test.ts` with integration tests for: reserve (happy path + edge cases), cancel, capacity enforcement, waitlist auto-promotion, weekly limits, subscription/payment validation

**No tests for analytics module:**

- Issue: Analytics service (`/home/franco/projects/el-templo/el-templo-api/src/modules/analytics/service.ts`, 1019 lines) with 8+ metric calculation methods untested
- Files: `el-templo-api/src/modules/analytics/service.ts`
- Impact: Dashboard KPIs unverified; regression silently breaks analytics endpoints
- Fix approach: Add `el-templo-api/test/analytics/analytics.test.ts` with tests for each metric: revenue, attendance, compliance, churn calculations

**No tests for attendance module:**

- Issue: Attendance service handles critical check-in/QR functionality but lacks integration test coverage
- Files: `el-templo-api/src/modules/attendance/`
- Impact: QR scanning, check-in state transitions, confirmation workflow untested
- Fix approach: Add `el-templo-api/test/attendance/attendance.test.ts`

**Frontend apps lack unit/component tests:**

- Issue: Zero test files in `el-templo-admin/src` and `el-templo-app/src`
- Files: Both frontend apps
- Impact: Component regressions undetected; refactoring is high-risk
- Fix approach: Establish test patterns with Vitest/Vue Test Utils; start with highest-impact pages: `HorariosPage.vue`, `SessionEditPage.vue`, `DayPlayer.vue`

## Known Bugs

**Potential race condition in booking creation:**

- Symptoms: Two concurrent booking requests for same (member, schedule, date) could both insert (duplicate key unique constraint is on (`memberId`, `scheduleId`, `bookingDate`), but insertion is non-atomic)
- Files: `/home/franco/projects/el-templo/el-templo-api/src/modules/scheduling/service.ts:810-825` (book method)
- Trigger: Concurrent POST requests to `/reserve` endpoint from same member for same slot
- Current mitigation: Unique index `idx_bookings_member_schedule_date` will reject duplicate; error is caught and propagated to user
- Workaround: User sees conflict error and must retry; no automatic recovery
- Fix approach: Wrap booking creation (steps 8-10) in database transaction to ensure atomic duplicate check + insert

**Waitlist auto-promotion may skip or double-promote on concurrent cancellations:**

- Symptoms: When multiple confirmations are cancelled near-simultaneously, waitlist promotion logic may promote same position twice or skip a position
- Files: `/home/franco/projects/el-templo/el-templo-api/src/modules/scheduling/service.ts:891-892` (promoteWaitlist call in cancel method)
- Trigger: Two members cancel confirmed bookings for same slot within milliseconds
- Current mitigation: Waitlist position is incremented but order is not guaranteed
- Fix approach: Reorder waitlist deterministically by `waitlistPosition` and `bookedAt` in transaction

**Session date validation uses loose timezone handling:**

- Symptoms: Edge cases near midnight or DST transitions could allow booking on wrong day-of-week
- Files: `/home/franco/projects/el-templo/el-templo-api/src/modules/scheduling/service.ts:705-711` (reserve method date validation)
- Trigger: User in timezone far from UTC tries to book near midnight; UTC rollover happens during request
- Current mitigation: Uses noon UTC (`T12:00:00Z`) to avoid DST shifts in most cases
- Fix approach: Add explicit client timezone parameter to booking request; validate both client and UTC date-of-week

## Security Considerations

**Password hashing vulnerability in auth:**

- Risk: Using Argon2 (good) but no salt length or iteration count configured explicitly
- Files: `/home/franco/projects/el-templo/el-templo-api/src/modules/auth/routes.ts:80` (hash), `routes.ts:151` (verify)
- Current mitigation: Argon2 library defaults are reasonable; JWT secrets expected in env
- Recommendations:
  - Verify Argon2 configuration at app boot (log configured parameters)
  - Add password strength validation (minimum entropy) before hash
  - Consider rate limiting on login endpoint (currently unguarded)

**Branch isolation incomplete:**

- Risk: Some admin operations may not validate branch ownership; multi-branch setups could allow access to unauthorized data
- Files: `/home/franco/projects/el-templo/el-templo-api/src/modules/scheduling/routes.ts:83-91` (admin guard only checks role, not branch), analytics service uses optional `branchId` with fallback to all branches
- Current mitigation: Coach role restricted but coach's branch affiliation not verified
- Recommendations:
  - Add `coachBranchId` to JWT token payload
  - Validate all coach queries filter by their assigned branch
  - Audit analytics service for branch access control

**JWT tokens lack expiration enforcement:**

- Risk: Token expiry not visible in payloads; long-lived tokens increase breach impact
- Files: `/home/franco/projects/el-templo/el-templo-api/src/modules/auth/routes.ts:95,169` (token signing)
- Current mitigation: Assuming JWT config includes `expiresIn` but not verified in code
- Recommendations:
  - Set explicit `expiresIn: "7d"` (or shorter) in all `fastify.jwt.sign()` calls
  - Add refresh token endpoint for extending sessions
  - Test token expiration flow in auth tests

## Performance Bottlenecks

**Scheduling service reserve() has 10+ sequential database queries:**

- Problem: Reserve endpoint must validate subscription, payment balance, weekly limit, holiday, duplicate, capacity, waitlist position — each a separate query
- Files: `/home/franco/projects/el-templo/el-templo-api/src/modules/scheduling/service.ts:700-825`
- Cause: Validation checks are logically dependent and must run in order
- Improvement path:
  - Batch queries where possible (e.g., fetch schedule + branch + activity in single join)
  - Cache holiday list by country (rarely changes)
  - Cache branch capacity setting (rarely changes)
  - Consider denormalizing active subscription status to users table for faster lookup

**HorariosPage.vue recalculates grid on every property change:**

- Problem: Multiple computed properties (`timeSlots`, `slotMap`, `weekDays`, `gridTemplateStyle`) rebuild entire data structures on any reactive update
- Files: `/home/franco/projects/el-templo/el-templo-admin/src/pages/HorariosPage.vue:605-761`
- Cause: Vue reactivity is overly broad; changes to `selectedSlotDate` or loading flags trigger full grid recompute
- Improvement path:
  - Split grid data into separate reactive objects (times, slots, lookup)
  - Memoize computed properties with explicit dependency arrays
  - Lazy-load slot details instead of loading all cells

**Analytics dashboard queries N+1 branches:**

- Problem: Each branch's metrics may be queried separately
- Files: `/home/franco/projects/el-templo/el-templo-api/src/modules/analytics/service.ts` (multi-param branchId handling)
- Improvement path:
  - Batch branch metrics queries where possible
  - Pre-aggregate common metrics in database view or materialized summary table

## Fragile Areas

**Scheduling service has complex multi-step reservation logic:**

- Files: `/home/franco/projects/el-templo/el-templo-api/src/modules/scheduling/service.ts`
- Why fragile: 10-step validation sequence (holiday, subscription, balance, duplicate, capacity, waitlist) with interdependent state; adding new validation requires careful insertion into sequence
- Safe modification: Add new validations as early steps (before duplicate/capacity check); document step dependencies in comments; add test case for each new step
- Test coverage: Zero integration tests; any refactoring is high-risk
- Fix approach: Create comprehensive test suite that covers all happy paths and failure cases for reserve() method

**HorariosPage.vue is largest component (1385 lines):**

- Files: `/home/franco/projects/el-templo/el-templo-admin/src/pages/HorariosPage.vue`
- Why fragile: Single component manages multiple dialogs, grids, forms, and API calls; state spread across 50+ reactive variables; 2+ watchers creating implicit dependencies
- Safe modification: Extract dialog content to separate components (ActivitiesDialog, HolidaysDialog, ScheduleForm); move grid logic to composable; extract row rendering to sub-components
- Test coverage: Zero tests
- Performance impact: All UI updates trigger grid recompute; multiple loading states not coordinated

**EditableBlockCard.vue (951 lines) handles session block editing:**

- Files: `/home/franco/projects/el-templo/el-templo-admin/src/components/sessions/EditableBlockCard.vue`
- Why fragile: Complex form state with nested exercises, format parameters, validation; inline handlers for save/cancel/delete; edit-in-place pattern with manual cleanup
- Safe modification: Extract exercise list to separate component; extract format param editor to dedicated component; move save/validation logic to service
- Test coverage: Zero tests; form validation untested

**WeeklyView.vue incomplete state (TODO):**

- Files: `/home/franco/projects/el-templo/el-templo-app/src/modules/training/pages/WeeklyView.vue:82`
- Why fragile: Hardcoded `completedDates = []` means completion state never works; refactoring to integrate store may break date calculations
- Safe modification: Add integration test first; then add store connection incrementally
- Test coverage: Zero tests

## Scaling Limits

**Single database for all 4 apps:**

- Current capacity: MySQL single instance (eltemplo_test for testing); no read replicas, no sharding
- Limit: Once member count exceeds ~10k with daily bookings, query latency will increase; no write scaling
- Scaling path:
  - Add MySQL read replica for analytics/reporting queries
  - Implement query caching layer (Redis) for attendance summaries, capacity checks
  - Consider sharding by `branchId` if multi-tenant growth accelerates

**Logger uses client-side console in production for warn/error:**

- Problem: Frontend errors sent to console even in production; only error() sends to Sentry
- Files: `/home/franco/projects/el-templo/el-templo-admin/src/utils/logger.ts:37-44`, `/home/franco/projects/el-templo/el-templo-app/src/utils/logger.ts:37-44`
- Limit: Warnings and errors not aggregated; missing observability of non-fatal issues
- Fix: Send warn() and error() to Sentry (not just error), or at minimum to a backend log aggregator

## Dependencies at Risk

**Nuxt 3 build output (static preset, prerender):**

- Risk: Landing page (`el-templo-web/`) is statically pre-rendered; dynamic content (blog, landing updates) require re-build and re-deploy
- Impact: Blog posts won't update without rebuild; cannot respond to real-time changes
- Migration plan: Consider Nuxt hybrid rendering for blog (`routeRules` with `cache: { maxAge: 3600 }`); move API calls to server routes

**Quasar version not pinned in package.json:**

- Risk: Minor/patch updates could break component layouts (especially HorariosPage grid system)
- Impact: CI could suddenly build with new Quasar version and break page layout
- Recommendations: Pin Quasar to exact version (`3.x.y` not `^3.x.y`) in both admin and app package.json

## Missing Critical Features

**No role-based access control (RBAC) for branches:**

- Problem: Coach role is global; cannot restrict coach to specific branches
- Blocks: Multi-location franchises cannot assign coaches to specific locations
- Fix approach: Add `coachBranches` mapping table; validate branch membership on all queries

**No audit logging:**

- Problem: Admin edits (session changes, member cancellations) not logged
- Blocks: Cannot trace who made what changes; compliance/dispute resolution difficult
- Fix approach: Create audit_logs table; log all mutations in admin routes with user + timestamp

**No offline support for member app:**

- Problem: If network drops during class, user cannot complete workout
- Blocks: Cannot guarantee workout continuity in areas with spotty connectivity
- Fix approach: Add service worker; cache session data locally; sync completion on reconnect

## Test Coverage Gaps

**Scheduling module completely untested:**

- What's not tested: Reserve (capacity, waitlist, validation), cancel (waitlist promotion), holiday enforcement, weekly limits, subscription/payment integration
- Files: `/home/franco/projects/el-templo/el-templo-api/src/modules/scheduling/`
- Risk: Critical booking flow regression undetected; payment/subscription bypass possible
- Priority: **High** — This is user-facing transaction logic

**Attendance/check-in logic untested:**

- What's not tested: QR scanning, confirmation workflow, no-show marking
- Files: `/home/franco/projects/el-templo/el-templo-api/src/modules/attendance/`
- Risk: Check-in state corruption; double-attendance possible
- Priority: **High** — Core feature

**Analytics calculation untested:**

- What's not tested: Revenue, attendance rate, churn, capacity utilization calculations
- Files: `/home/franco/projects/el-templo/el-templo-api/src/modules/analytics/service.ts`
- Risk: Dashboard KPIs silently incorrect; business decisions based on wrong data
- Priority: **High** — Data integrity for business metrics

**Admin frontend component logic untested:**

- What's not tested: Form submissions, dialog open/close, grid row selection, booking add/remove
- Files: `/home/franco/projects/el-templo/el-templo-admin/src/` (all components)
- Risk: UI regressions; complex forms may silently fail to submit
- Priority: **Medium** — Can be caught in manual testing but automation preferred

**Member app components untested:**

- What's not tested: Session player state, booking flow, week navigation, journey selection
- Files: `/home/franco/projects/el-templo/el-templo-app/src/`
- Risk: User experience degradation; navigation bugs block workflow
- Priority: **Medium**

---

_Concerns audit: 2026-03-10_
