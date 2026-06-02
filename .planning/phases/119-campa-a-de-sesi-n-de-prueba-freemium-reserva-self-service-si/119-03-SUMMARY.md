---
phase: 119-campa-a-de-sesi-n-de-prueba-freemium-reserva-self-service-si
plan: 03
subsystem: scheduling (self-service trial reservation)
tags: [scheduling, trials, freemium, promote-and-book, tdd-green]
requires:
  - 119-01 (bookings.source column, createEligibleFreemium fixture, RED scaffolds)
provides:
  - TrialService.reserveTrialSelfService (atomic freemium→prueba + trial booking)
  - TrialService.getTrialEligibility (3 ReservasPage states)
  - BookingService.validateTrialBookingDate (30d window, D-05)
  - BookingService.cancel guard rejecting is_trial (D-03)
  - POST /api/members/scheduling/reserve-trial (D-01)
  - GET /api/members/scheduling/trial-eligibility (D-20)
affects:
  - el-templo-api/src/modules/scheduling
tech-stack:
  added: []
  patterns:
    - "Promote-and-book: UPDATE users + INSERT userStatusHistory + INSERT booking in ONE db.transaction (convertFreemiumToTrial blueprint, D-26)"
    - "Shared date-window validator parameterized by windowDays (+2 member / +30 trial) reused across reserve and validateTrialBookingDate (DRY)"
    - "Server-side state is the only authorization — email token never read (D-21); additionalProperties:false rejects forged token in body"
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/scheduling/trials-service.ts
    - el-templo-api/src/modules/scheduling/booking-service.ts
    - el-templo-api/src/modules/scheduling/routes.ts
    - el-templo-api/src/modules/scheduling/schemas.ts
    - el-templo-api/test/scheduling-reserve-trial.test.ts
    - el-templo-api/test/scheduling-trial-eligibility.test.ts
decisions:
  - "Standalone reserveTrialSelfService (RESEARCH option b), NOT calling bookTrial — bookTrial hard-requires status==='prueba' AND user.branchId===schedule.branchId before booking, which is wrong for a freemium being promoted. The promotion + booking run together in one tx; the one-per-lifetime guard and cancelled-row reactivation are re-implemented inline against the tx."
  - "Booking-window validation extracted into a private assertDateWithinWindow(scheduleRow, date, windowDays) helper; reserve passes MEMBER_BOOKING_WINDOW_DAYS=2, the new public validateTrialBookingDate passes TRIAL_BOOKING_WINDOW_DAYS=30. Both reachable (D-05) and the member window text/behavior is unchanged."
  - "BookingService injected into TrialService as an OPTIONAL 3rd constructor arg so the admin trial flows (bookTrial/listTrials) keep their 2-arg construction; only the member plugin (which needs the 30d window) passes it. A defensive guard turns a missing dependency into a clear 500."
  - "Eligibility check returns the existing trial booking FIRST (alreadyBooked) so the confirmation card still renders after the user is promoted to 'prueba' (status no longer freemium)."
  - "reserveTrialSchema uses additionalProperties:false so a forged campaign token in the body is rejected with 400 (defense-in-depth on top of the server-side state revalidation, D-21)."
metrics:
  duration: ~22min
  completed: 2026-06-02
---

# Phase 119 Plan 03: Self-Service Trial Reservation Summary

Exposes the freemium self-service trial backend the member app (Wave 3) calls: `reserve-trial` atomically promotes a freemium user to `prueba`, writes `user_status_history`, sets the chosen physical branch, and inserts an `is_trial` booking (`source='self_service'`, `createdBy=null`) in one transaction; a 30-day trial booking window (members stay at +2d); trial bookings are uncancelable from the app; and `trial-eligibility` drives the three ReservasPage states — all authorized purely by server-side user state, never the email token.

## What Was Built

### Task 1 — Promote-and-book + 30d window + cancel guard (commit bd8b472f)

- **booking-service.ts**: extracted the date-window/dayOfWeek/holiday/not-past validation (formerly inline in `reserve`) into a private `assertDateWithinWindow(scheduleRow, date, windowDays)`; `reserve` now calls it with `MEMBER_BOOKING_WINDOW_DAYS=2`. Added a public `validateTrialBookingDate(scheduleId, date)` that loads the slot and calls the same helper with `TRIAL_BOOKING_WINDOW_DAYS=30` — keeping dayOfWeek/holiday/not-past checks and deliberately skipping the subscription check (a freemium has none). Re-added the branch-country load inside `reserve` for the cross-country guard (it had depended on the removed inline `branch` lookup). Added a D-03 guard in `cancel` that rejects `is_trial` bookings with a clear message (selecting `isTrial` in the cancel query).
- **trials-service.ts**: `reserveTrialSelfService(userId, { scheduleId, date, branchId })` — 404 if user/branch missing; 409 if not freemium / virtual branch / prior non-cancelled trial / active|paused|scheduled sub; validates the date via the injected BookingService (30d); then in ONE `db.transaction` UPDATEs `users` (status='prueba', leadStatus='en_seguimiento', createdBy=null, branchId=chosen), INSERTs `userStatusHistory` (source='self_service'), and inserts (or reactivates a cancelled exact slot+date row) the `is_trial` booking with `source='self_service'`. Also `getTrialEligibility(userId)` returning `{ eligible, alreadyBooked, booking? }`. BookingService injected as an optional 3rd constructor arg.
- Capacity exclusion (`countActiveBookings` filters `is_trial=false`) verified untouched (D-07).

### Task 2 — Routes + schemas + GREEN tests (commit 998841c7)

- **schemas.ts**: `reserveTrialSchema` (body `scheduleId`/`date`/`branchId`, `additionalProperties:false`, 201/400/404/409) + `trialEligibilitySchema` (200 with optional `booking`).
- **routes.ts**: instantiated `TrialService(fastify.db, fastify.log, bookingService)` in the member plugin; registered `POST /reserve-trial` (delegates to `reserveTrialSelfService(request.user.userId, body)`, 201) and `GET /trial-eligibility` — both under the existing section-level auth hook, both via `handleServiceError`.
- **Tests made GREEN** (replacing the Wave 0 `it.todo` scaffolds): `scheduling-reserve-trial.test.ts` (9 cases) asserts the atomic promote+history+booking, `source='self_service'`, `createdBy=null`, chosen branch, one-per-lifetime 409, is_trial uncancelable 400, 30d allowed vs +35d rejected, forged-token-field 400, non-freemium/active-sub/virtual-branch 409, and no dangling rows on rejection. `scheduling-trial-eligibility.test.ts` (4 cases) asserts the three states.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Re-add branch-country lookup in `reserve` after window refactor**

- **Found during:** Task 1 (typecheck failed TS2304 `Cannot find name 'branch'`).
- **Issue:** The cross-country guard later in `reserve` referenced the `branch` row that was loaded by the inline holiday block I extracted into `assertDateWithinWindow`.
- **Fix:** Added a small `select({ country })` for `scheduleRow.branchId` immediately before the cross-country guard. Behavior unchanged.
- **Files modified:** el-templo-api/src/modules/scheduling/booking-service.ts
- **Commit:** bd8b472f

No architectural changes (Rule 4) were needed. No auth gates. No package installs.

## Tests run in CI, not local

Per the project rule (MEMORY: tests run in CI, not local), the full vitest suite was NOT executed locally. Only typecheck was run:

- Canonical build config `npx tsc --noEmit` (src only, the CLAUDE.md "typecheck local sí") → exit 0.
- A temporary test-inclusive tsconfig confirmed zero type errors in the four touched scheduling source files and the two test files (pre-existing errors in unrelated test files are out of scope).

The two test files will run GREEN in CI after push to staging.

## Verification

- `reserveTrialSelfService` performs UPDATE users + INSERT userStatusHistory + INSERT booking inside a single `db.transaction`.
- booking-service window check is parameterized: both `MEMBER_BOOKING_WINDOW_DAYS = 2` and `TRIAL_BOOKING_WINDOW_DAYS = 30` are reachable; the trial path does NOT hit the subscription check.
- `grep -c "reserve-trial" routes.ts` = 2; `trial-eligibility` present; `reserveTrialSchema` + `trialEligibilitySchema` present with `additionalProperties:false` on the reserve-trial body.
- Capacity exclusion (D-07) regression: `countActiveBookings` still filters `is_trial=false` (unmodified).
- `npx tsc --noEmit` (build config) → exit 0.

## Self-Check: PASSED

All four touched source files and both test files exist on disk; both task commits (bd8b472f, 998841c7) are present in git history.
