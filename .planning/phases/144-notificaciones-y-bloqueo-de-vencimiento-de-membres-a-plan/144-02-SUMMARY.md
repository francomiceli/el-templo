---
phase: 144-notificaciones-y-bloqueo-de-vencimiento-de-membres-a-plan
plan: 02
subsystem: notifications
tags: [notifications, cron, subscriptions, renewal, push, covered-until]

# Dependency graph
requires:
  - phase: 144-01
    provides: deriveCoveredUntil(db, userId), 'planes' category + 3 plan_renewal_warning_* templates, migration 0158
  - phase: 62-push-notifications
    provides: NotificationService.queueNotification (template lookup + per-category preference gate + device-token gate + pending_notifications insert), seedTemplates
provides:
  - "runPlanRenewalWarnings(db, notificationService) — exported cron block enqueuing the 7d/3d/expiry Planes push"
  - "Wiring into the existing 03:00 AR batch cron (after the Program Renewal Warning block)"
  - "Integration test covering the three windows + scheduled-successor suppression + Planes opt-out + out-of-band"
affects:
  - "144-03 (in-app expiry dialog): independent surface; no shared code touched"
  - "144-04 (reserve coverage block): independent surface; no shared code touched"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Exact-date band (end_date = CURDATE() + N) as per-threshold idempotency — daily cron, no tracking column"
    - "D-05 suppression by comparing deriveCoveredUntil(chain MAX) === threshold date — scheduled successor pushes covered-until past the band"
    - "queueNotification returns -1 on skip (disabled/opt-out/no-token); count only >= 0 as real enqueues"

key-files:
  created:
    - el-templo-api/test/notification-plan-renewal.test.ts
  modified:
    - el-templo-api/src/jobs/notification-cron.ts

key-decisions:
  - "SQL CURDATE() DATE arithmetic (not JS Date math) for all threshold comparisons — stays in the AR-local DATE domain that matches subscriptions.end_date"
  - "Suppression reuses the shared deriveCoveredUntil standalone fn (imported with only db) — never re-derives the chain in the cron"
  - "Three thresholds mapped to the three 144-01 templates (plan_renewal_warning_7d / _3d / _expired); no parametrized single template"

requirements-completed: [] # PLAN-NOTIF is phase-spanning; entregable 1 (push) lands here, app surfaces in 03/04

# Metrics
duration: ~8min
completed: 2026-06-25
---

# Phase 144 Plan 02: Plan Renewal Warning cron Summary

**Added `runPlanRenewalWarnings` — a daily 03:00 AR cron block that enqueues a "Planes" push when a member's covered-until lands exactly today+7, today+3, or today (expiry day), suppressing anyone who already renewed (scheduled successor) or who silenced the category — plus a six-case integration test.**

## Performance

- **Duration:** ~8 min
- **Tasks:** 2
- **Files:** 2 (1 created, 1 modified)

## Accomplishments

- `runPlanRenewalWarnings(db, notificationService): Promise<number>` exported from `notification-cron.ts`, iterating three thresholds `[{7d}, {3d}, {expiry}]`. For each it selects DISTINCT `userId` from `subscriptions` where `status IN ('active','scheduled')` AND `end_date = DATE_ADD(CURDATE(), INTERVAL N DAY)` — the exact-date band is the per-threshold idempotency (no tracking column).
- **D-05 suppression:** each candidate is gated on `deriveCoveredUntil(db, userId) === target`; a member with a `scheduled` successor extending coverage beyond the band has covered-until > target, so they are skipped (already renewed).
- **D-02 opt-out:** enqueue routes through `queueNotification`, whose per-category preference gate honors the `planes` silence; the cron never writes `pending_notifications` directly. `queueNotification`'s `-1` skip return is excluded from the queued count.
- Wired into the existing 03:00 AR batch cron, right after the Program Renewal Warning block, in its own defensive try/catch (`log.error`, never throws) — matching the molde.
- Six-case integration test (`notification-plan-renewal.test.ts`): seeds the three templates via `seedTemplates()` in `beforeEach` (after `cleanAllTestData` wipes them), then asserts 7d/3d/expiry each enqueue exactly their template, scheduled-successor suppresses, Planes opt-out suppresses, and today+5 (out-of-band) yields zero rows. Dates seeded with SQL `CURDATE()` arithmetic for timezone stability.

## Task Commits

1. **Task 1: runPlanRenewalWarnings cron block** - `fd1eb984` (feat)
2. **Task 2: window + suppression + opt-out integration test** - `f973becd` (test)

## Files Created/Modified

- `el-templo-api/src/jobs/notification-cron.ts` - `inArray` + `deriveCoveredUntil` imports; `PLAN_RENEWAL_THRESHOLDS` const; `runPlanRenewalWarnings` export; call site inside the 03:00 cron with defensive try/catch.
- `el-templo-api/test/notification-plan-renewal.test.ts` - six-case integration test (created).

## Decisions Made

- **CURDATE() over JS Date:** the candidate query and the threshold string both come from SQL `DATE_ADD(CURDATE(), INTERVAL N DAY)` so the comparison stays in the same AR-local DATE domain as `end_date`, avoiding a midnight-boundary timezone skew between the Node process and MySQL.
- **`>= 0` enqueue counting:** `queueNotification` returns the inserted id on success and `-1` on every skip path (disabled template, silenced category, no device token), so the cron counts only `>= 0` as a real enqueue — the logged `totalQueued` reflects pushes that will actually send.
- **No new templates / no migration:** all three template keys and the `planes` category were delivered by 144-01; this plan is pure cron logic + test, touching no schema.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. The cron block is fully wired into the live 03:00 batch and queues against the 144-01 templates; the member-facing surfaces (in-app dialog, reserve block) are intentionally separate plans (144-03 / 144-04).

## TDD Gate Compliance

This plan is not marked `tdd`; tasks are `type="auto"`. Task 1 (cron) and Task 2 (test) were committed separately as `feat` then `test`. The integration test runs against real MySQL in CI (not run locally per project policy — local `tsc --noEmit` only, which passed green for both tasks).

## Self-Check: PASSED

- Files: `el-templo-api/src/jobs/notification-cron.ts` and `el-templo-api/test/notification-plan-renewal.test.ts` both present on disk.
- Commits: `fd1eb984` (feat) and `f973becd` (test) both in `git log`.
- `npx tsc --noEmit` green after each task.

---

_Phase: 144-notificaciones-y-bloqueo-de-vencimiento-de-membres-a-plan_
_Completed: 2026-06-25_
