---
phase: 103
plan: 03
subsystem: api/auth + api/scheduling
tags: [user-status, freemium, prueba, member-creation, integration-tests]
dependency_graph:
  requires:
    - users.status enum column (Plan 01)
    - SubscriptionService.recomputeUserStatus + assignPlan tx-wrap (Plan 02)
  provides:
    - POST /api/auth/register inserts users.status='freemium' explicitly
    - POST /api/admin/scheduling/trials inserts users.status='prueba' explicitly
    - End-to-end integration coverage for the 3 R7 scenarios owned by Plan 03
    - Verified end-to-end: promo path /register → assignPlan → recomputeUserStatus
      flips status from 'freemium' to 'activo' inside the same transaction
  affects:
    - el-templo-api/src/modules/auth/routes.ts (Part A)
    - el-templo-api/src/modules/scheduling/trials-service.ts (Part B + Rule 3 leftover cleanup)
    - downstream Plan 04 (createMember inserts 'prueba'), Plan 06 (staff insert null)
tech_stack:
  added: []
  patterns:
    - "`status: 'freemium' as const` / `status: 'prueba' as const` for narrow enum-literal type inference at insert sites"
    - "Real-clock integration tests when an SQL helper depends on MySQL CURDATE() (vi.useFakeTimers desyncs JS Date.now() from CURDATE())"
key_files:
  created:
    - el-templo-api/test/users/member-creation-defaults.test.ts
    - .planning/phases/103-user-status-enum/deferred-items.md
  modified:
    - el-templo-api/src/modules/auth/routes.ts
    - el-templo-api/src/modules/scheduling/trials-service.ts
decisions:
  - "Replaced trials-service.ts leftover `isActive: true` (column dropped in Plan 01) with the new `status: 'prueba'` line in the same edit — kills two birds (Rule 3 unblocker + Plan 03 R7 implementation) without an extra commit."
  - "Used real clock (no vi.useFakeTimers) in member-creation-defaults.test.ts because Plan 02's recomputeUserStatus helper compares subscription.end_date >= MySQL CURDATE(); fake JS timers desync from the DB and the activo transition becomes invisible."
  - "Only 3 of the 6 R7 acceptance scenarios live in this test file. The other 3 (createMember with/without planId, staff-role null status) are deferred to Plans 04 and 06 per the single-owner rule on members/service.ts and users/service.ts."
metrics:
  duration: ~10min
  completed_date: 2026-04-25
  tasks_completed: 2
  commits: 2
  test_cases: 3
  test_status: all-passing (3/3)
requirements_completed: [R7-partial]
---

# Phase 103 Plan 03: Per-Endpoint Status Defaults at /register and /api/admin/trials

**One-liner:** /register inserts users.status='freemium' and /api/admin/scheduling/trials inserts users.status='prueba'; integration tests verify both, plus the auto-flip to 'activo' when /register includes a valid promoCode (Plan 02's recomputeUserStatus chain).

## What Shipped

### Task 1 — explicit status at the two entry points (commit feeb01f1)

**Part A — `el-templo-api/src/modules/auth/routes.ts:130`**

```ts
const result = await fastify.db.insert(users).values({
  email,
  passwordHash,
  branchId,
  firstName,
  lastName,
  dni,
  phone,
  gender,
  role: "member",
  level: "alfa",
  // Phase 103-03 (R7, D-12, D-13): online self-register starts as freemium.
  // If a valid promoCode follows, assignPlan → recomputeUserStatus flips
  // it to 'activo' inside the same transaction (Plan 02 wiring).
  status: "freemium" as const,
});
```

Single line addition (the as-const ensures the literal narrows to the enum
value). The promo-path block at lines 162-173 is untouched — `assignPlan`
already triggers Plan 02's `recomputeUserStatus` automatically inside its
transaction.

**Part B — `el-templo-api/src/modules/scheduling/trials-service.ts:147`**

```ts
const userInsert = await tx.insert(schema.users).values({
  email: null,
  passwordHash,
  firstName: input.firstName,
  lastName: input.lastName,
  phone: input.phone,
  dni: null,
  documentType: null,
  branchId: input.branchId,
  level: "alfa",
  role: "member",
  // Phase 103-03 (R7, D-12): trial endpoint creates a presential lead.
  // Replaces the leftover `isActive: true` (column dropped in Plan 01).
  status: "prueba" as const,
});
```

Replaced the broken `isActive: true` (TypeScript error since Plan 01
dropped the column) with the correct `status: 'prueba'`. This closes 1 of
the 10 pre-existing tsc errors documented in 103-02-SUMMARY.

### Task 2 — integration tests for the 3 R7 scenarios in scope (commit ef284fa3)

`el-templo-api/test/users/member-creation-defaults.test.ts` — 3 cases, all
passing against real MySQL (`eltemplo_test`):

```
✓ POST /register without promoCode → status='freemium'        (362ms)
✓ POST /register with valid promoCode → status='activo'
   (verifies Plan 02 recomputeUserStatus chain)               (~300ms)
✓ POST /api/admin/scheduling/trials → status='prueba'         (~480ms)
```

Each test reads `users.status` from the DB after the endpoint returns and
asserts the exact enum literal — no derivation, no aliasing.

The promo-path test is the most load-bearing assertion: it proves the full
Phase 103 chain end-to-end —
`/register insert (freemium)` → `assignPlan(promoSubPlanId)` →
`recomputeUserStatus(userId, tx)` → `users.status = 'activo'` — all inside
one transaction. If Plan 02's wiring regresses, this test fails.

## Acceptance Gate Verification

| Gate                                                                                        | Status                                                                                                                     |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `grep -n "status: \"freemium\"" el-templo-api/src/modules/auth/routes.ts`                   | ✓ (L130)                                                                                                                   |
| `grep -n "status: \"prueba\"" el-templo-api/src/modules/scheduling/trials-service.ts`       | ✓ (L147)                                                                                                                   |
| No `isActive: true` or `isActive: false` literals remain in the 2 modified files            | ✓                                                                                                                          |
| `pnpm tsc --noEmit` introduces 0 new errors in auth/routes.ts or trials-service.ts          | ✓ (down 10→9)                                                                                                              |
| `pnpm test test/users/member-creation-defaults.test.ts` passes                              | 3/3 ✓                                                                                                                      |
| New test file: 0 `any`, 0 `console.` calls                                                  | ✓                                                                                                                          |
| members/service.ts and users/service.ts NOT touched (single-owner rule for Plans 04 and 06) | ✓ (verified `git diff feeb01f1~1..feeb01f1 -- el-templo-api/src/modules/members el-templo-api/src/modules/users` is empty) |

## Why Only 3 of 6 R7 Scenarios Tested Here

The plan called out 6 R7 acceptance scenarios. Plan 03 owns the 2 entry
points whose source files are not concurrently being edited by another
plan (`auth/routes.ts` and `scheduling/trials-service.ts`). The other 4
scenarios all touch source files owned by other plans per the single-owner
rule:

| R7 Scenario                               | Source file                              | Owning Plan                            |
| ----------------------------------------- | ---------------------------------------- | -------------------------------------- |
| `/register` no promo → freemium           | `auth/routes.ts`                         | **Plan 03** ✓                          |
| `/register` with promo → activo (chain)   | `auth/routes.ts` + `subs/service.ts`     | **Plan 03** ✓ (verifies Plan 02 chain) |
| `/api/admin/scheduling/trials` → prueba   | `scheduling/trials-service.ts`           | **Plan 03** ✓                          |
| `/api/admin/members` no planId → prueba   | `members/service.ts`                     | Plan 04                                |
| `/api/admin/members` with planId → activo | `members/service.ts` + `subs/service.ts` | Plan 04                                |
| Staff role insert → status NULL           | `users/service.ts`                       | Plan 06                                |

Plans 04 and 06 will add their tests (or extend this file) when they ship.
The 6 scenarios will all be covered before Phase 103 closes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] trials-service.ts had `isActive: true` leftover after Plan 01**

- **Found during:** baseline `pnpm tsc --noEmit` before Task 1.
- **Issue:** `el-templo-api/src/modules/scheduling/trials-service.ts:145` still
  set `isActive: true` on the lead INSERT — but Plan 01 dropped the
  `users.is_active` column from the schema, so the line errored TS2353
  ("Object literal may only specify known properties, and 'isActive' does
  not exist"). This was 1 of the 10 documented pre-existing tsc errors
  from 103-02-SUMMARY's "Out-of-scope discoveries" list.
- **Fix:** Folded into Task 1 Part B by replacing the broken line with the
  required `status: 'prueba' as const`. No extra commit, no extra
  diff — same edit accomplishes both the deletion of the dead reference
  and the addition of the new explicit status.
- **Why Rule 3 not Rule 4:** mechanical column-replacement; semantically
  identical to what Plan 01 intended (the trial endpoint always creates
  active leads). The replacement is also documented in CONTEXT.md D-12 as
  the entry-point intent for `/trials`.
- **Files modified:** `trials-service.ts` (1 line replaced).
- **Commit:** `feeb01f1`.

### Out-of-scope Discoveries (deferred to later plans)

Logged in `.planning/phases/103-user-status-enum/deferred-items.md`. Summary:

- **`test/users/users.test.ts` — 4 failures.** Pre-existing. Read
  `users.isActive` from staff endpoints. Owned by Plan 06.
- **`test/scheduling/trials.test.ts` — 3 failures.** Pre-existing. (1) R3
  test reads `users.isActive` from a SELECT projection — owned by Plan 04.
  (2) Two 102-07 converted_at tests fail because they use
  `vi.useFakeTimers` pinned to 2026-03-11 while Plan 02's
  `recomputeUserStatus` reads MySQL `CURDATE()` (real clock) → sub.end_date
  is in the past → no active sub → no activo transition → no converted_at
  set. Drop the fake timers in those tests when Plan 02 (or any later
  plan touching trials.test.ts) cleans them up.
- **`test/analytics/analytics.test.ts` — 4 failures.** Pre-existing.
  `analytics/service.ts` still reads `users.isActive`. Owned by Plan 04 or
  a future analytics cleanup plan.

All 11 failures verified pre-existing by running `pnpm test
test/scheduling/trials.test.ts` against `feeb01f1~1` (the Plan 02 head)
with my Plan 03 changes stashed — same 3 failures observed there. Plan 03
introduces zero new test failures.

## Threat Surface Scan

No new external surface. Both endpoints already existed (Phase 1 and Phase
102 respectively). The change is server-side hardening: the status value
is hardcoded as a literal in the INSERT, so a client cannot forge it via
the request body (Fastify's AJV validator drops unknown fields). T-103-04
(Tampering at /register) and T-103-05 (Elevation via crafted promoCode) —
both already mitigated/accepted dispositions in the plan's threat model
remain valid.

## Self-Check: PASSED

- File `el-templo-api/test/users/member-creation-defaults.test.ts`: FOUND
- File `.planning/phases/103-user-status-enum/deferred-items.md`: FOUND
- Source `el-templo-api/src/modules/auth/routes.ts:130` has `status: "freemium" as const`: FOUND
- Source `el-templo-api/src/modules/scheduling/trials-service.ts:147` has `status: "prueba" as const`: FOUND
- Commit `feeb01f1` (Task 1 — status defaults): FOUND in `git log`
- Commit `ef284fa3` (Task 2 — integration tests): FOUND in `git log`
- 3/3 new tests pass: VERIFIED (`pnpm test test/users/member-creation-defaults.test.ts`)
- members/service.ts and users/service.ts NOT modified by Plan 03: VERIFIED (`git diff` against parent commit shows only auth/routes.ts and trials-service.ts in src changes)
- Total tsc errors went 10 → 9 (one closed by Rule 3 fold-in): VERIFIED
