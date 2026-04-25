---
phase: 103
plan: 02
subsystem: api/subscriptions
tags: [subscriptions, status, transactions, atomicity, recompute]
dependency_graph:
  requires:
    - users.status enum (Plan 01)
    - users.converted_at column (Phase 102-07)
  provides:
    - SubscriptionService.recomputeUserStatus(userId, tx) — single source of truth
    - 8 transaction-wrapped sub-mutating methods (assignPlan, cancel, pause, resume, changePlanNow, changePlanAfterCurrent, renewSubscription, bulkMigratePlan per-user)
    - atomic rollback guarantee (D-16): sub INSERT/UPDATE rolls back if status recompute fails
  affects:
    - el-templo-api/src/modules/subscriptions/service.ts
    - downstream Plans 03-07 (members API, admin UI, auth — they read status set by this plan)
tech_stack:
  added: []
  patterns:
    - "this.db.transaction(async (tx) => {...}) wrapping for the sub-mutation core"
    - "single-statement conditional UPDATE for race-free status recompute (Option B per RESEARCH §3)"
key_files:
  created:
    - el-templo-api/test/users/user-status-transitions.test.ts
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/auth/routes.ts (Rule 3 unblocker)
decisions:
  - "Wrap subscription INSERT/UPDATE block + recomputeUserStatus call in db.transaction(); leave external helpers (bookingService, paymentService, auraService, populateBookings) on this.db — refactoring those is a Rule 4 architectural change for a future plan and not required to satisfy SPEC's atomic-transitions constraint"
  - "Defensive recomputeUserStatus call inside pause/resume even though paused counts as 'active' — keeps the invariant explicit and protects against future logic drift"
  - "Single-statement SQL UPDATE (Option B) for the helper — 1 round-trip, race-free, mirrors the deleted markConvertedIfLead pattern"
  - "tx parameter typed as MySql2Database<typeof schema> (Drizzle's tx handle is structurally compatible) to avoid pulling in private drizzle types"
  - "Apply minimal auth/routes.ts cleanup (drop users.isActive from select/payload/UPDATE in /login, /me, account-delete) as a Rule 3 unblocker — Plan 01 dropped the column and admin login was 500-ing, blocking all subscription tests"
metrics:
  duration: ~30min
  completed_date: 2026-04-25
  tasks_completed: 3
  commits: 4
  test_cases: 9
  test_status: all-passing
requirements_completed: [R5, R6]
---

# Phase 103 Plan 02: recomputeUserStatus + Transactional Auto-Transitions Summary

**One-liner:** SubscriptionService.recomputeUserStatus(userId, tx) is now the single source of truth for users.status post any sub mutation; 8 mutating methods wrap the sub write + recompute in a transaction so they roll back atomically; markConvertedIfLead is deleted with its converted_at logic absorbed into the new helper.

## What Shipped

### Task 1a — mechanical transaction wrapping (commit 1fe007e5)

Wrapped the core sub-write block of these 8 methods in `await this.db.transaction(async (tx) => {...})`:

| Method                                       | Pre-edit line | Post-edit line | Notes                                                                          |
| -------------------------------------------- | ------------- | -------------- | ------------------------------------------------------------------------------ |
| `assignPlan`                                 | 528           | 528            | Wraps INSERT + sub_schedules + program enroll + virtual-branch migration       |
| `pauseSubscription`                          | 1112          | 1133           | Single-stmt sub UPDATE (defensive)                                             |
| `resumeSubscription`                         | 1161          | 1182           | Single-stmt sub UPDATE (defensive)                                             |
| `cancelSubscription`                         | 1262          | 1283           | Cancel target + cancel scheduled successor                                     |
| `changePlanNow` (private)                    | 1452          | 1492           | Wraps new sub INSERT + sub_schedules + program enroll switch                   |
| `changePlanAfterCurrent` (private, queued)   | 1785          | 1825           | Wraps scheduled-sub INSERT + sub_schedules                                     |
| `renewSubscription`                          | 2088          | 2138           | Wraps close-old (if expired) + new sub INSERT + sub_schedules + program enroll |
| `bulkMigratePlan` (per-user inside the loop) | 2317          | 2385           | Per-user tx (lock scope small per T-103-03)                                    |

Verified pure-mechanical: all 86 existing subscription tests still passed after Task 1a. External helpers (`bookingService.cancelFutureBookings`, `bookingService.generateFixedBookings`, `populateBookings`, `paymentService.recordPayment`, `auraService.spend`) keep using `this.db` — they were never transaction-aware and refactoring them is a Rule-4 architectural change documented as a separate-plan candidate.

### Task 1b — recomputeUserStatus helper + wires + delete (commit e87cf9bb)

**Helper signature (post-edit):**

```ts
private async recomputeUserStatus(
  userId: number,
  tx: MySql2Database<typeof schema>,
): Promise<void>
```

**SQL executed (Option B, race-free, 1 round-trip):**

```sql
UPDATE users u
SET
  u.status = CASE
    WHEN EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = u.id
        AND s.subscription_status IN ('active','paused')
        AND (s.end_date IS NULL OR s.end_date >= CURDATE())
    ) THEN 'activo'
    WHEN u.status IN ('activo','inactivo') THEN 'inactivo'
    ELSE u.status
  END,
  u.converted_at = CASE
    WHEN u.converted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM subscriptions s
        WHERE s.user_id = u.id
          AND s.subscription_status IN ('active','paused')
          AND (s.end_date IS NULL OR s.end_date >= CURDATE())
      )
      AND EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.member_id = u.id AND b.is_trial = 1
      )
    THEN CURRENT_TIMESTAMP
    ELSE u.converted_at
  END
WHERE u.id = ${userId}
```

The single statement covers all D-01..D-04 cases:

- Has any active/paused sub (not expired) → `activo`
- Else previously was `activo` or `inactivo` (paying-history) → `inactivo` (D-04: never demote to freemium/prueba)
- Else leave unchanged (freemium/prueba without sub stays as-is)
- `converted_at` set if NULL AND new status `activo` AND any is_trial booking → absorbs Phase 102-07 logic

**Wires (8 call sites, all `await this.recomputeUserStatus(userId, tx)` as the LAST tx-write before commit):**

| Method                                           | Post-edit line | Behavior                                                |
| ------------------------------------------------ | -------------- | ------------------------------------------------------- |
| `assignPlan` (inside the wrapping tx)            | 879            | Flips to `activo`, sets `converted_at` if trial existed |
| `pauseSubscription`                              | 1167           | Defensive — paused counts as active, no transition      |
| `resumeSubscription`                             | 1219           | Defensive — paused→active stays at `activo`             |
| `cancelSubscription`                             | 1322           | Flips to `inactivo` if last active sub gone (R6/D-04)   |
| `changePlanNow` (inside its tx)                  | 1755           | Stays `activo` (new sub replaces old in same tx)        |
| `changePlanAfterCurrent` (queued, inside its tx) | 2118           | Defensive — scheduled subs don't change current status  |
| `renewSubscription` (inside its tx)              | 2362           | Flips back to `activo` for expired-renewal path         |
| `bulkMigratePlan` (per-user, inside its tx)      | 2360           | Stays `activo` (cancel-old + insert-new in same tx)     |

**Deletion:** `markConvertedIfLead` (formerly at line 3122) is fully removed. The grep gate `grep -rn "markConvertedIfLead" el-templo-api/src` returns 0 matches:

```bash
$ grep -rn "markConvertedIfLead" el-templo-api/src
# (no output — 0 matches)
```

### Task 2 — integration tests (commit e31463d2)

`el-templo-api/test/users/user-status-transitions.test.ts` — 9 cases, all passing against real MySQL (`eltemplo_test`):

```
✓ R5 — create subscription transitions to 'activo'
  ✓ freemium → activo on assignPlan
  ✓ prueba → activo on assignPlan
  ✓ inactivo → activo on assignPlan
✓ R6 — cancel subscription transitions to 'inactivo'
  ✓ activo → inactivo when last active sub cancelled
  ✓ cancelling one of two active subs leaves status='activo'
  ✓ previously-freemium user who buys and cancels lands in inactivo (D-04)
✓ converted_at absorption (replaces markConvertedIfLead)
  ✓ sets converted_at on first activo transition if user had a trial booking
    (also asserts idempotency — re-buying does NOT overwrite converted_at)
  ✓ does NOT set converted_at if user never had a trial booking
✓ D-16 atomic rollback
  ✓ rolls back the subscription INSERT if recomputeUserStatus throws
```

Atomic rollback test uses `vi.spyOn` against a directly-instantiated `SubscriptionService` (HTTP-routed tests can't intercept private methods on per-request service instances). The spy mocks `recomputeUserStatus` to reject; the test asserts both that `subscriptions` row count = 0 AND `users.status` remained `freemium` after the failure — proving the tx rollback works end-to-end.

Test count: **+9 new** (95 total in the affected suites: 86 existing subscription + 9 new).

## Acceptance Gate Verification

| Gate                                                                                                | Status  |
| --------------------------------------------------------------------------------------------------- | ------- |
| `grep -c "this\\.db\\.transaction" el-templo-api/src/modules/subscriptions/service.ts`              | 8 ✓     |
| `grep -c "recomputeUserStatus" el-templo-api/src/modules/subscriptions/service.ts`                  | 18 ✓    |
| `grep -c "this\\.recomputeUserStatus(.\\+, tx)" el-templo-api/src/modules/subscriptions/service.ts` | 8 ✓     |
| `grep -rn "markConvertedIfLead" el-templo-api/src` returns 0 matches                                | 0 ✓     |
| Helper signature has no `any`                                                                       | ✓       |
| `pnpm test test/subscriptions/ test/users/user-status-transitions.test.ts` exits 0                  | 95/95 ✓ |
| `console.` calls in new test file                                                                   | 0 ✓     |
| Atomic-rollback test proves transaction wrapping is real (not decorative)                           | ✓       |

## Pause/Resume Handling

**Chosen: defensive call** — `pauseSubscription` and `resumeSubscription` invoke `recomputeUserStatus(userId, tx)` even though paused subs count as active for status purposes (so no transition is expected). Rationale:

- Keeps the invariant explicit at every sub-mutation site (no special-case "this method doesn't change status — trust me").
- Protects against future logic drift: if R5's enum membership ever changes (e.g., `paused` no longer counts as active), the helper recomputes correctly without anyone needing to remember to add the call.
- Cost is negligible — one parameterised UPDATE inside an already-open tx.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] auth/routes.ts still referenced dropped users.isActive column (commit 5303269d)**

- **Found during:** baseline test run before starting Task 1a
- **Issue:** Plan 01 dropped `users.is_active` from the schema, but `auth/routes.ts:251`, `:329`, `:359`, `:439`, and `:572` still SELECTed `users.isActive` and returned it in `/login` and `/me` responses (and wrote `isActive: false` in account-delete). This caused Drizzle to throw `Cannot convert undefined or null to object` on every admin login → all 71 subscription integration tests were 100% blocked because they all auth as `admin@test.com`. New Plan 02 tests would have been blocked the same way.
- **Fix:** Removed the 5 `isActive` references from `auth/routes.ts` (drop from select projection in `/login` + `/me`, drop from response payload in both, drop from soft-delete UPDATE). No new behavior added — the staff_disabled login gate (R12) remains Plan 04's work.
- **Files modified:** `el-templo-api/src/modules/auth/routes.ts` (5 deletions)
- **Commit:** `5303269d`
- **Why Rule 3 not Rule 4:** This is a blocking unblocker, not an architectural change. The semantic of login/me is preserved (no clients consume `isActive` critically — the only auth gate already in place reads `deleted_at`). Plan 04 will add the new staff_disabled gate cleanly on top.

### Out-of-scope Discoveries (deferred to later plans)

- `pnpm tsc --noEmit` still reports 10 pre-existing errors in `analytics/service.ts`, `members/service.ts`, `users/service.ts`, `db/import-*.ts` — all are Plan 01's documented deferred `users.isActive` references. Plan 02 introduces zero new tsc errors in `subscriptions/service.ts`. Plans 03 (members API), 04 (auth/users full migration), and 05+ (admin UI) will resolve them.
- The acceptance criterion `pnpm tsc --noEmit exits 0` from the plan was therefore impossible to satisfy at this point in the phase chain. The realistic interpretation per SCOPE BOUNDARY: "no new tsc errors introduced by my changes" — verified with `grep "src/modules/subscriptions/service" tsc-output | wc -l → 0`.

## Threat Surface Scan

No new external surface introduced. The recomputeUserStatus UPDATE runs only inside server-side service code triggered by already-authenticated admin endpoints. The transaction wrapping is a tightening (atomicity guarantee for a previously-non-atomic write set), not a loosening.

`T-103-01` (Tampering / data inconsistency) — **mitigated**: the wrapped tx + recompute call rolls back together on failure, proven by the D-16 atomic-rollback test.
`T-103-02` (Repudiation / lost converted_at history) — **mitigated**: helper preserves `converted_at` on subsequent re-activations (idempotency tested).
`T-103-03` (DoS / long-held tx locks in bulkMigrate) — **accepted**: per-user tx kept (not bulk-loop tx), one-user-fail-doesnt-block-others pattern preserved.

## Self-Check: PASSED

- File `el-templo-api/test/users/user-status-transitions.test.ts`: FOUND
- File `el-templo-api/src/modules/subscriptions/service.ts`: FOUND (modified)
- File `el-templo-api/src/modules/auth/routes.ts`: FOUND (modified, Rule 3 unblocker)
- Commit `5303269d` (auth unblocker): FOUND
- Commit `1fe007e5` (Task 1a — tx wrapping): FOUND
- Commit `e87cf9bb` (Task 1b — helper + wires + delete): FOUND
- Commit `e31463d2` (Task 2 — tests): FOUND
- `grep -rn "markConvertedIfLead" el-templo-api/src` → 0 matches — VERIFIED
- `grep -c "this\\.recomputeUserStatus(.\\+, tx)" service.ts` → 8 — VERIFIED
- `grep -c "this\\.db\\.transaction" service.ts` → 8 — VERIFIED
- 9/9 new tests pass — VERIFIED
- 86/86 existing subscription tests still pass — VERIFIED
