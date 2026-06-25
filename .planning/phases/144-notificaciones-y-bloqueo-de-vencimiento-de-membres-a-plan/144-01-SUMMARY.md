---
phase: 144-notificaciones-y-bloqueo-de-vencimiento-de-membres-a-plan
plan: 01
subsystem: database
tags:
  [notifications, subscriptions, drizzle, mysql-enum, migration, covered-until]

# Dependency graph
requires:
  - phase: 62-push-notifications
    provides: notification_templates / notification_preferences / notificationCategoryEnum, queueNotification
  - phase: subscriptions (v4.x)
    provides: subscriptions table with active/scheduled chain + end_date, getMemberSubscription
provides:
  - "'planes' notification category in schema enum + DB enum on both notification tables"
  - "3 renewal templates (plan_renewal_warning_7d / _3d / _expired) under category 'planes'"
  - "deriveCoveredUntil(db, userId) standalone helper + SubscriptionService.getCoveredUntil delegation (DRY covered-until)"
  - "migration 0158 — enum ALTER on both tables + idempotent 'planes' preference backfill for every member"
affects:
  - "144-02 (push cron): imports deriveCoveredUntil for D-05 suppression, queues plan_renewal_warning_* templates"
  - "144-03 (in-app expiry dialog): consumes covered-until for ≤3d gate"
  - "144-04 (reserve coverage block): uses getCoveredUntil in booking-service reserve()"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single DRY derivation exported standalone (db-only) + thin instance-method delegation for service holders"
    - "Hand-written sequential migration (db:generate non-functional in this repo) with byte-for-byte enum order + idempotent NOT EXISTS backfill"

key-files:
  created:
    - el-templo-api/test/subscriptions/covered-until.test.ts
    - el-templo-api/src/db/migrations/0158_planes_notification_category.sql
  modified:
    - el-templo-api/src/db/schema/notifications.ts
    - el-templo-api/src/modules/notifications/types.ts
    - el-templo-api/src/modules/notifications/service.ts
    - el-templo-api/src/modules/subscriptions/service.ts

key-decisions:
  - "deriveCoveredUntil is ONE standalone fn (MAX(end_date) over active+scheduled, end_date IS NOT NULL); getCoveredUntil delegates — cron imports the fn, booking/routes use the method"
  - "3 separate templates (7d/3d/expired) under new 'planes' category, route /reservas — not one parametrized template"
  - "Migration hand-written as 0158 because db:generate is broken in this repo (pre-existing sessions.goal_plan_type interactive drift + stale meta/_journal.json at 0059)"

patterns-established:
  - "Covered-until: never derive a block/suppress date from a NULL end_date (D-14 guard via end_date IS NOT NULL filter → null result)"
  - "New notification category = schema enum + types union/array + Record<NotificationCategory> defaults + migration MODIFY on both tables + preference backfill"

requirements-completed: [] # foundation only — PLAN-NOTIF/PLAN-POPUP/BOOK-BLOCK complete across plans 02-04

# Metrics
duration: ~12min
completed: 2026-06-25
---

# Phase 144 Plan 01: Notification 'planes' category + DRY covered-until foundation Summary

**Added the `planes` notification category (schema + DB enum on both tables) with three renewal templates, a single DRY `deriveCoveredUntil` helper over the active+scheduled subscription chain, and migration 0158 that ALTERs the enum and backfills a `planes` preference row for every existing member.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-25T~21:55Z
- **Completed:** 2026-06-25T22:13Z
- **Tasks:** 3
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- `notificationCategoryEnum` (column `notification_category`) and the `NotificationCategory` union + `NOTIFICATION_CATEGORIES` array all gained `"planes"`; `getUserPreferences` default record gained `planes: true`.
- Three `TEMPLATE_SEEDS` — `plan_renewal_warning_7d` / `_3d` / `_expired` — under `category: "planes"`, `route: "/reservas"`, with ASCII-safe female copy, bodies verbatim from UI-SPEC §117-121.
- ONE `deriveCoveredUntil(db, userId)` standalone export (`MAX(end_date)` over `status IN ('active','scheduled')` AND `end_date IS NOT NULL`) plus a thin `SubscriptionService.getCoveredUntil` that delegates to it — no duplicated query, ready for three call sites (cron / booking / dialog).
- Integration test `covered-until.test.ts` covering all five behaviors (active-only, active+scheduled furthest, cancelled-only→null, no-subs→null, NULL end_date→null).
- Migration 0158 applied cleanly to `eltemplo_test_1` (3 statements): enum on both notification tables now `(…,'planes')`, and 24/24 members have a `planes` preference row; `_migrations` records `0158_planes_notification_category.sql`.

## Task Commits

1. **Task 1: 'planes' category + 3 renewal templates** - `27a695f2` (feat)
2. **Task 2 (TDD): covered-until derivation** - `0e412f6b` (test, RED) → `53463db7` (feat, GREEN)
3. **Task 3: migration 0158 enum + prefs backfill** - `5d92e763` (chore)

**Plan metadata:** (final docs commit — this SUMMARY + STATE + ROADMAP)

## Files Created/Modified

- `el-templo-api/src/db/schema/notifications.ts` - `planes` appended to `notificationCategoryEnum`
- `el-templo-api/src/modules/notifications/types.ts` - `planes` in union + array; 3 `plan_renewal_warning_*` seeds
- `el-templo-api/src/modules/notifications/service.ts` - `getUserPreferences` default record gains `planes: true` (Rule 3 fix)
- `el-templo-api/src/modules/subscriptions/service.ts` - `deriveCoveredUntil` standalone + `getCoveredUntil` method
- `el-templo-api/test/subscriptions/covered-until.test.ts` - 5-case integration test for the helper
- `el-templo-api/src/db/migrations/0158_planes_notification_category.sql` - enum MODIFY (both tables) + idempotent backfill

## Decisions Made

- **3 separate templates over 1 parametrized:** clearer per-trigger copy; `queueNotification` overrides not needed for static bodies.
- **Standalone fn + delegation:** the cron only holds `db` (instantiating the heavy `SubscriptionService` DI is undesirable), so the derivation lives as a `db`-only export and the service exposes a thin method for callers that already hold it.
- **D-14 guard via SQL:** `end_date IS NOT NULL` in the WHERE means a member whose only covering sub has a NULL end_date derives `null` (never block / never suppress).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `getUserPreferences` default record missing `planes` key**

- **Found during:** Task 1 (adding the category)
- **Issue:** `service.ts` builds `const prefs: Record<NotificationCategory, boolean> = {...}` with the four literals; adding `planes` to the union made `tsc` fail (TS2741: Property 'planes' is missing).
- **Fix:** Added `planes: true` to the default record (every category defaults enabled, consistent with the others).
- **Files modified:** `el-templo-api/src/modules/notifications/service.ts`
- **Verification:** `npx tsc --noEmit` green.
- **Committed in:** `27a695f2` (Task 1 commit)

**2. [Rule 3 - Blocking] Migration generated by hand instead of `db:generate`**

- **Found during:** Task 3 (migration)
- **Issue:** The plan/orchestrator assumed `pnpm db:generate` would auto-assign `0158`. In this repo `db:generate` is non-functional: `meta/_journal.json` is stale at idx 35 / tag `0059` (would mis-number to ~0060) AND it hits a pre-existing `sessions.goal_plan_type` interactive enum-drift prompt — the documented reason migrations 0153/0154/0155 were ALSO hand-written.
- **Fix:** Hand-wrote `0158_planes_notification_category.sql` following the established convention (byte-for-byte enum order, `planes` appended last, idempotent `NOT EXISTS` backfill on column `notification_category`, no `;` inside `--` comments), then applied via `pnpm db:migrate`. Number 0158 matches the orchestrator-confirmed non-colliding number (v5.2 occupies 0153-0157), so no checkpoint was required.
- **Files modified:** `el-templo-api/src/db/migrations/0158_planes_notification_category.sql`
- **Verification:** `pnpm db:migrate` applied 3 statements to `eltemplo_test_1`; enum confirmed `(…,'planes')` on both tables; 24/24 users have a `planes` pref; `_migrations` row present.
- **Committed in:** `5d92e763` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking).
**Impact on plan:** Both necessary to complete the plan. The migration-tooling deviation follows the repo's pre-existing hand-written-migration pattern and preserves the orchestrator's confirmed number 0158. No scope creep.

## Issues Encountered

- The blocking-human checkpoint (Task 3) was pre-resolved by the orchestrator (number 0158 confirmed non-colliding). Reality differed from the orchestrator's assumption that `db:generate` would assign the number, but the resolved _intent_ (use 0158, don't collide) held, and `db:migrate` succeeded — so execution proceeded autonomously without emitting a checkpoint, exactly per the orchestrator's stated condition ("only emit a CHECKPOINT if db:generate assigns a different number or db:migrate fails").

## TDD Gate Compliance

Task 2 followed RED→GREEN: `test(144-01)` commit `0e412f6b` (failing — helper absent) then `feat(144-01)` commit `53463db7` (helper added, `tsc` green). No refactor commit needed. The integration test runs in CI against real MySQL (not run locally per project policy; local `tsc` only).

## Known Stubs

None. The covered-until helper and templates are fully wired for the downstream plans; the member-facing "Planes" preference toggle UI (ProfilePage) is intentionally out of scope for this foundation plan and is surfaced by the app-side plans 03/04.

## User Setup Required

None - no external service configuration required. The migration auto-applies via the standard `pnpm db:migrate` step in the deploy pipeline (and reaches prod on the staging→master merge per project workflow).

## Next Phase Readiness

- **144-02 (push cron):** can import `deriveCoveredUntil` for D-05 suppression and queue `plan_renewal_warning_7d/_3d/_expired`.
- **144-03 (expiry dialog) / 144-04 (reserve block):** `getCoveredUntil` available on the service; reserve()'s coverage check (D-12/D-13) plugs in directly.
- **Requirements:** PLAN-NOTIF / PLAN-POPUP / BOOK-BLOCK are phase-spanning and intentionally NOT marked complete here — they finish when plans 02-04 ship their surfaces.
- **Note for downstream:** prod backfill of the `planes` preference row happens automatically when 0158 runs in the deploy migrate step.

## Self-Check: PASSED

- Files: all 6 present on disk (verified).
- Commits: `27a695f2`, `0e412f6b`, `53463db7`, `5d92e763` all in `git log`.

---

_Phase: 144-notificaciones-y-bloqueo-de-vencimiento-de-membres-a-plan_
_Completed: 2026-06-25_
