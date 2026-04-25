# Phase 103 — Deferred Items

Out-of-scope discoveries logged during plan execution. Each item is tracked
to its owning future plan; do not fix them in the discovering plan.

## Pre-existing test failures (discovered Plan 03)

Identified during the full-suite run after Plan 03 Task 2 — none caused by
Plan 03 changes (verified by re-running each suite against `feeb01f1~1`,
i.e. the Plan 02 head). All track back to schema drift introduced by Plan 01
(dropped `users.is_active`) that the owning Plan 04/06 implementations have
not yet caught up with.

### `test/users/users.test.ts` — 4 failures (owned by Plan 06)

Reads `users.isActive` from staff endpoints (`GET /api/admin/users`,
`PUT /api/admin/users/:id`, `PATCH /api/admin/users/:id/status`). The
`users/service.ts` module still selects/updates `isActive` (10+ tsc errors
documented in 103-02-SUMMARY). Plan 06 owns the staff insert null-status +
the `staff_disabled` migration — those edits will fix these tests too.

- Failing tests:
  - `GET /api/admin/users → owner can list staff users`
  - `PUT /api/admin/users/:userId → owner can update user role`
  - `PUT /api/admin/users/:userId → owner can update password (no password in response)`
  - `PATCH /api/admin/users/:userId/status → owner can deactivate a user`

### `test/scheduling/trials.test.ts` — 3 failures (mixed owners)

1. **R3 happy-path test** — selects `users.isActive` post-INSERT (line 183-184).
   Drizzle errors with `Cannot convert undefined or null to object` because
   the column was dropped in Plan 01. Fix: remove the `isActive` projection
   from the select. Owned by Plan 04 (closest semantic owner — handles the
   members/service.ts cleanup of the same isActive references).
2. **102-07 converted_at tests (2)** — `Assigning first plan to a lead sets
users.converted_at` and `GET /api/admin/reports/trial-conversion reflects
converted vs pending`. Failure root cause: the tests use
   `vi.useFakeTimers` pinned to `2026-03-11`, but Plan 02's
   `recomputeUserStatus` SQL helper compares `subscription.end_date >=
CURDATE()` — and MySQL `CURDATE()` is bound to the real DB clock, not
   the JS fake timer. So sub.end_date (= 2026-04-10, calculated from the
   fake startDate) lands BEFORE the real CURDATE (2026-04-25), the helper
   sees no active sub, and `converted_at` is never set. Fix: drop
   `vi.useFakeTimers` from these specific tests and compute booking dates
   from real `new Date()`. Owned by Plan 02 (clock-coupling regression
   introduced when `recomputeUserStatus` started reading `CURDATE()`) but
   safe for any later plan to fix-as-discovered.

### `test/analytics/analytics.test.ts` — 4 failures (owned by Plan 04 or 06)

`analytics/service.ts` still references `users.isActive` (TS2339 documented
in 103-02-SUMMARY). The 4 failing tests all hit endpoints that aggregate
from `users.isActive`. Plan 04 (members API contract change) or a dedicated
analytics-cleanup plan owns the migration to read `users.status`.

- Failing tests:
  - `GET /api/admin/analytics (KPIs) → should return KPI stats with correct activeMembers count`
  - `GET /api/admin/analytics (KPIs) → should accept branchId filter and return branch-scoped results`
  - `GET /api/admin/analytics (KPIs) → should return trend data for each KPI`
  - `Date range filtering → should filter results by dateFrom and dateTo across all endpoints`

## Pre-existing TypeScript errors (still present after Plan 03)

Snapshot from `pnpm tsc --noEmit` after Plan 03 lands: **9 errors total**
(down from 10 at Plan 02 head — Plan 03 fixed the lone `trials-service.ts`
leftover by replacing `isActive: true` with `status: 'prueba'`).

Remaining errors (all `users.isActive` references awaiting Plans 04/06):

- `src/db/import-members.ts:861` — bulk import path
- `src/db/import-vigentes.ts:527` — bulk import path
- `src/modules/analytics/service.ts:205`
- `src/modules/members/service.ts:456` — Plan 04 owns
- `src/modules/members/service.ts:591` — Plan 04 owns
- `src/modules/users/service.ts:35,183,213,233` — Plan 06 owns

None block Plan 03's tests (the 3 cases in
`test/users/member-creation-defaults.test.ts` all pass).

## Post Plan 07 (final grep gate state)

After Plan 07 (auth routes cleanup + new staff_disabled login gate), the
SPEC R3 grep gate `grep -rn "users\.isActive|users\.is_active"` returns
2 documentation comments (both narrating the old column for context):

- `src/modules/analytics/service.ts:203` — comment in `countActiveMembers`
  explaining the migration to `users.status`
- `src/modules/users/service.ts:216` — JSDoc on `toggleDisabled` referencing
  the legacy `toggleActive` it replaced

Neither is an actual read or write — both are historical context for future
maintainers. SPEC R3 is satisfied.

The broader sanity check (`user.isActive|memberProfile.isActive|m.isActive`)
still surfaces:

- `src/db/import-members.ts:804,861,890,975,978` — one-shot bulk import
  script referencing `m.isActive` from a legacy CSV record TYPE. The script
  is now broken against the post-103 schema (will fail at INSERT). Owner:
  follow-up cleanup plan or the next bulk-import operator (whoever runs the
  script next will need to map legacy `isActive` → `status='inactivo'` /
  `'activo'`). Not in Phase 103's scope per SPEC's "Out of scope" section.
- `src/db/import-vigentes.ts:527` — same situation, sibling import script.
- `src/modules/programs/service.ts:183` — `program.isActive` is the
  `programs` entity, NOT `users`. Allowed false-positive per SPEC R3.
- `el-templo-admin/src/pages/AlumnoDetailPage.vue:54-62` — `memberProfile.isActive`
  reads. Owned by **Plan 05 (Wave 5)**, the next plan in this phase.
  Expected to be cleared when Plan 05 ships.

After Plan 05 ships, only the import scripts and the doc comments will
remain — no live `users.isActive` references in the runtime codebase.
