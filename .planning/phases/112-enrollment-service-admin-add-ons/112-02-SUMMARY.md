---
phase: 112-enrollment-service-admin-add-ons
plan: 02
subsystem: programs
tags: [refactor, programs, enrollments, subscriptions, di]
requires:
  - program_enrollments.source enum + subscription_id (Plan 01)
  - program_enrollments paused status (Plan 01)
  - TxHandle canonical export from finance/balance-service (Phase 111-02)
provides:
  - EnrollmentService class — single chokepoint for program_enrollments writes
  - EnrollmentService.enrollFromPlan(userId, planFlags, subId, tx?) — replaces 6 inline insert sites
  - EnrollmentService.tearDownForSubscription(subId, tx?) — generalized teardown driven by subscription_id, replaces tearDownBundleEnrollments + tearDownLinkedProgramEnrollment
  - EnrollmentService.getActiveEnrollmentsForSubscription(subId, tx?) — lookup for Plans 03/04
  - EnrollmentService.enrollAddon (stub, Plan 04)
  - EnrollmentService.transferAddons (stub, Plan 03)
  - EnrollmentService.pauseForSubscription (stub, Plan 03)
  - EnrollmentService.resumeForSubscription (stub, Plan 03)
affects:
  - 11 SubscriptionService DI sites across auth/subscriptions/members/scheduling/attendance/jobs (5th positional arg)
tech-stack:
  added: []
  patterns:
    - "Constructor DI with optional 5th parameter (Phase 56 / 105-03 pattern, mirrors transactionService rollout shape)"
    - "Service mutator atomicity: caller-owned tx (Phase 111-02 auditLog.write pattern) — service NEVER opens its own transaction"
    - "requireServiceX() runtime guard for optional DI param (T-112-02-02 mitigation)"
    - "Plan-flag preconditions wrap requireService calls so test instantiations omitting EnrollmentService still work for plans without programs binding"
    - "Backward-compat fallback inside teardown: include legacy subscription_id IS NULL rows matching plan binding (preserves phase-111 regression test semantics for ambiguous backfilled rows)"
key-files:
  created:
    - el-templo-api/src/modules/programs/enrollment-service.ts
  modified:
    - el-templo-api/src/modules/programs/index.ts
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/auth/routes.ts
    - el-templo-api/src/modules/subscriptions/routes.ts
    - el-templo-api/src/modules/subscriptions/member-routes.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/scheduling/routes.ts
    - el-templo-api/src/modules/attendance/routes.ts
    - el-templo-api/src/jobs/auto-resume-pauses.ts
decisions:
  - "Plan-flag precondition guards added around all enrollFromPlan call sites: enrollFromPlan only invoked when plan.linkedProgramId || plan.grantsAllPrograms — keeps test instantiations omitting EnrollmentService working for pure-presencial plans, and avoids spurious DI-missing errors on flows with no enrollment work"
  - "Renewal + activateScheduledSub call sites preserve legacy 'skip if active enrollment exists' guard around enrollFromPlan — enrollFromPlan's linked-program branch is cancel-then-insert by contract (assignPlan/changePlan need that), but renewal of an active sub mid-program would otherwise reset currentWeek=1 and destroy progress"
  - "tearDownForSubscription uses dual lookup: (a) rows with subscription_id = subId (canonical post-Phase-112 wiring), AND (b) user-scoped rows with subscription_id IS NULL matching the cancelled sub's plan binding (legacy backfill fallback) — required to keep R4 protection regression test passing without modification"
  - "Activate scheduled successor: tearDownForSubscription(scheduled.previousSubscriptionId) chosen over inline UPDATE — keeps the cancel going through the EnrollmentService chokepoint (matches D-05 single chokepoint goal)"
  - "EnrollmentService constructor param stays optional during this rollout (matches transactionService precedent); a future plan may flip to required once admin tooling/tests are migrated"
metrics:
  duration: ~24min
  tasks: 3
  files: 9
  completed: 2026-05-04
requirements:
  - ENROLL-01
  - ENROLL-02
  - ENROLL-03
  - ENROLL-04
  - ENROLL-05
---

# Phase 112 Plan 02: EnrollmentService Extraction Summary

`programEnrollments` writes are now centralized behind a single `EnrollmentService` chokepoint in `el-templo-api/src/modules/programs/enrollment-service.ts`. Six inline insert sites and two legacy teardown helpers in `subscriptions/service.ts` collapsed into a small named surface (`enrollFromPlan`, `tearDownForSubscription`, `getActiveEnrollmentsForSubscription`) with four explicit-throw stubs reserved for Plans 03/04. Phase 111 regression tests pass without modification; full subscription + programs suites stay green.

## What Shipped

- **`EnrollmentService` class (490 LOC).** 7 public methods with `tx?: TxHandle` optional trailing param. `TxHandle` imported canonically from `finance/balance-service` (no redefine). 3 method bodies filled (`enrollFromPlan`, `tearDownForSubscription`, `getActiveEnrollmentsForSubscription`); 4 stubs throw `Error("Plan 0N — ...")` so accidental invocation surfaces loudly.
- **`subscriptions/service.ts` slimmed by 423 LOC** (4440 → 4017). Zero direct programEnrollments mutations remain. Both legacy private helpers (`tearDownBundleEnrollments`, `tearDownLinkedProgramEnrollment`) deleted. Constructor extended with optional 5th arg `enrollmentService`. New `requireEnrollmentService()` guard (T-112-02-02 mitigation).
- **11 DI sites wired** (Task 3): auth, subscriptions/admin, subscriptions/member, members×3, scheduling×2, attendance×2, jobs/auto-resume-pauses. Each constructs `new EnrollmentService(db, log)` and passes it as the 5th positional arg to `new SubscriptionService(...)`.
- **Programs module index re-exports**: `EnrollmentService` + `EnrollFromPlanInput` + `EnrollAddonInput` + `ActiveEnrollmentSummary` types.

## Refactor Map

### Insert sites collapsed (6 → 5 unique calls)

| Site | Method                                                    | Before (LOC) | After                                                                       |
| ---- | --------------------------------------------------------- | ------------ | --------------------------------------------------------------------------- |
| 1+2  | assignPlan (linkedProgramId + grantsAllPrograms branches) | ~104 lines   | 1 enrollFromPlan call (covers both branches)                                |
| 3+4  | changePlanNow (cancel-old + linked + bundle)              | ~110 lines   | 1 enrollFromPlan call (cancel-old now via tearDownForSubscription)          |
| 5    | renewSubscription (linked, idempotent)                    | ~32 lines    | enrollFromPlan wrapped in legacy "skip if active" guard                     |
| 6    | activateScheduledSub (linked, predecessor)                | ~58 lines    | tearDownForSubscription(prevSubId) + enrollFromPlan wrapped in legacy guard |

### Teardown sites collapsed (4 calls → 3 unique sites)

| Caller                          | Before                                                                | After                                                 |
| ------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------- |
| cancelSubscription              | tearDownBundleEnrollments + tearDownLinkedProgramEnrollment (2 calls) | tearDownForSubscription(sub.id, tx)                   |
| changePlanNow pre-block         | conditional tearDownBundleEnrollments                                 | unconditional tearDownForSubscription(existingSub.id) |
| autoExpireSubscriptions loop    | tearDownBundleEnrollments + tearDownLinkedProgramEnrollment per row   | tearDownForSubscription(subId) per row                |
| activateScheduledSub cancel-old | inline UPDATE                                                         | tearDownForSubscription(prevSubId)                    |

### Helpers deleted

- `tearDownBundleEnrollments` (~140 LOC, JSDoc + body)
- `tearDownLinkedProgramEnrollment` (~120 LOC, JSDoc + body)

## Verification

| Check                                                                          | Result                                                                       |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| `pnpm tsc --noEmit`                                                            | exit 0                                                                       |
| `grep -nE "(insert                                                             | update).\*programEnrollments" src/modules/subscriptions/service.ts \| wc -l` | 0                                                       |
| `grep -c "tearDownBundleEnrollments\\                                          | tearDownLinkedProgramEnrollment" src/modules/subscriptions/service.ts`       | 2 (both inside post-refactor explanation comments only) |
| `grep -rn "new SubscriptionService" src/ \| wc -l`                             | 11                                                                           |
| `grep -rn "new EnrollmentService" src/ \| wc -l`                               | 11                                                                           |
| `grep -rln "import.*EnrollmentService" src/ \| wc -l`                          | 8 (7 listed + subscriptions/service.ts)                                      |
| `grep -c "this.requireEnrollmentService" src/modules/subscriptions/service.ts` | 8                                                                            |
| `grep -cE ": any\\                                                             | as any" src/modules/programs/enrollment-service.ts`                          | 0                                                       |
| `git diff el-templo-api/test/` (before commit)                                 | empty (test files unmodified)                                                |
| `pnpm test test/subscriptions/expire-cancel-linked-program.test.ts`            | 4/4 PASS (D-08 hard regression gate)                                         |
| `pnpm test test/subscriptions/bundle-todos-los-programas.test.ts`              | 9/9 PASS (D-08 hard regression gate)                                         |
| `pnpm test test/subscriptions/ test/programs/`                                 | 130/130 PASS                                                                 |

## Phase 111 Regression Gate (D-08)

The two hard-gate test files run UNMODIFIED:

- `expire-cancel-linked-program.test.ts` — 4/4 pass. Covers cancelSubscription+autoExpire teardown of linked-program enrollments + protection by another active sub + recompute users.status.
- `bundle-todos-los-programas.test.ts` — 9/9 pass. Covers bundle assign/change/cancel/expire + R4 protection (where one program is also covered by a non-bundle linked sub) + pointer cleanup.

`git diff el-templo-api/test/` returns zero output — no test file touched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wrapped renewSubscription enrollFromPlan call in legacy "skip if active enrollment exists" guard.**

- **Found during:** Task 2 design pass.
- **Issue:** Plan author wrote: "the existing renewal logic only created when no active enrollment exists; `enrollFromPlan` handles this idempotency internally via the cancel-then-insert pattern (cancel of an already-cancelled row is a no-op)." That reasoning conflates idempotency-of-double-renewal (where the prior enrollment is already cancelled) with preservation-of-active-progress (where the prior enrollment is still alive at currentWeek=N>1). enrollFromPlan's linked-program branch is unconditionally cancel-then-insert; calling it on a still-active enrollment would reset currentWeek to 1 and destroy mid-program progress. Same reasoning for activateScheduledSub.
- **Fix:** At each of the 2 sites (renewSubscription, activateScheduledSub) wrapped the enrollFromPlan call in `if (existingEnrollment.length === 0)` (or analogous) — preserves legacy progress-preservation semantics while still routing through the chokepoint.
- **Files modified:** `el-templo-api/src/modules/subscriptions/service.ts`.
- **Why not a CHECKPOINT:** No regression test exercised this code path so it would not have been caught at the gate, but the semantic regression is real and silent — destroying member program progress on renewal is a Rule-1 bug class. Auto-fix is conservative (preserves legacy behavior) and visible (extra guard block is straightforward to read).

**2. [Rule 1 - Bug] tearDownForSubscription dual-lookup: subscription_id + legacy null-sub fallback.**

- **Found during:** Task 2 verify (test "R4 protection — bundle teardown preserves enrollment also covered by another sub's linkedProgramId" failed on first run).
- **Issue:** The plan author specified the new tearDown semantics as "driven by subscription_id" (Step 3 of the algorithm). But the R4 protection regression test (`bundle-todos-los-programas.test.ts:375`) DIRECT-DB-INSERTS bundle enrollment rows for p2/p3 without setting `subscription_id`, then triggers autoExpire and expects them to be cancelled. Legacy `tearDownBundleEnrollments` matched by `userId + status='active'` (NOT by subscription_id), so it caught those rows; the new pure-subscription_id semantics did not. This also matters in production: Plan 01 SUMMARY noted 1 backfilled row in dev with `subscription_id IS NULL` (ambiguous-multi-match case), and any future rows missed by backfill would similarly leak.
- **Fix:** Extended Step 3 to query in two parts: (a) rows with `subscription_id = subId` (canonical wiring), AND (b) user-scoped rows with `subscription_id IS NULL` whose programId matches the cancelled sub's plan binding (linkedProgramId or grantsAllPrograms). Both candidate sets feed the same protection filter (Step 4) before cancellation.
- **Files modified:** `el-templo-api/src/modules/programs/enrollment-service.ts`.
- **Why not a CHECKPOINT:** Test was a hard regression gate (D-08 explicit) — fixing it BY THE SERVICE not by changing the test is the documented expectation. The fix is additive (legacy semantics preserved on top of new semantics), not a contract change.

**3. [Rule 3 - Blocking] Plan-flag preconditions around enrollFromPlan call sites.**

- **Found during:** Task 3 verify (test/subscriptions/charge-on-assign.test.ts:323 instantiates SubscriptionService directly without EnrollmentService; assignPlan call then threw "EnrollmentService not injected" instead of the simulated balance failure the test expects to assert).
- **Issue:** The plan said "constructor parameter `enrollmentService` stays optional. Task 3 wires every DI site so the parameter is always provided" — but failed to anticipate test-side direct instantiations that pre-date Phase 112. Per CRITICAL RULES test files MUST stay unchanged.
- **Fix:** Wrapped each enrollFromPlan call site (assignPlan, changePlanNow) with `if (plan.linkedProgramId || plan.grantsAllPrograms)`. For plans with neither flag — the test scenario, plus pure-presencial plans in production — the chokepoint is skipped entirely so `requireEnrollmentService()` never runs. T-112-02-02 mitigation (DI rollout coverage in production) remains intact: any flow that DOES need enrollment writes WILL throw if a DI site forgot to wire EnrollmentService. Renewal + activateScheduledSub call sites already had the guard via the legacy progress-preservation wrapper from Rule 1 above.
- **Files modified:** `el-templo-api/src/modules/subscriptions/service.ts`.

### Deferred Issues

_None._ Plan 02 ships everything intended.

## Behavior Preservation Notes

- **Log messages preserved verbatim** for the bundle "Foundation excluded" path (`"Bundle (Todos los Programas) auto-enroll completed (Foundation excluded)"`) and the linked-program creation path (`"Auto-created program enrollment from plan (linkedProgramId)"`). Downstream Pino log monitors are unaffected.
- **tearDown log message changed** from per-helper messages (`"Bundle (Todos los Programas) teardown completed (pointer cleared if stale)"` / `"Linked-program enrollment teardown completed (pointer cleared if stale)"`) to a single unified `"Enrollment teardown completed (tearDownForSubscription)"`. Justification: the helpers themselves no longer exist, so per-helper logs cannot be preserved; the unified message includes the same observable fields (subscriptionId, userId, cancelledCount, protectedProgramCount, plus a new anyProtectorIsBundle boolean).
- **Atomicity preserved**: every callsite that previously wrapped writes in `db.transaction(tx => ...)` still does so, and passes `tx` through to `enrollFromPlan` / `tearDownForSubscription`. No service-internal `db.transaction` introduced.

## DI Sites Updated (11)

| #   | File                                                       | Line | Context                                                   |
| --- | ---------------------------------------------------------- | ---- | --------------------------------------------------------- |
| 1   | `el-templo-api/src/modules/auth/routes.ts`                 | 215  | Promo registration handler (anonymous endpoint)           |
| 2   | `el-templo-api/src/modules/subscriptions/routes.ts`        | 67   | Admin subscription plugin top-level                       |
| 3   | `el-templo-api/src/modules/subscriptions/member-routes.ts` | 21   | Member-facing subscription read                           |
| 4   | `el-templo-api/src/modules/members/routes.ts`              | 497  | createMember auto-assign                                  |
| 5   | `el-templo-api/src/modules/members/routes.ts`              | 701  | Trial conversion (cancel-then-create)                     |
| 6   | `el-templo-api/src/modules/members/routes.ts`              | 845  | deleteMember (cancel sub)                                 |
| 7   | `el-templo-api/src/modules/scheduling/routes.ts`           | 75   | Admin scheduling routes                                   |
| 8   | `el-templo-api/src/modules/scheduling/routes.ts`           | 467  | Member booking routes                                     |
| 9   | `el-templo-api/src/modules/attendance/routes.ts`           | 36   | Admin attendance routes                                   |
| 10  | `el-templo-api/src/modules/attendance/routes.ts`           | 172  | Member attendance routes                                  |
| 11  | `el-templo-api/src/jobs/auto-resume-pauses.ts`             | 26   | Daily cron — auto-resume pauses + activate scheduled subs |

(Line numbers reflect post-prettier-format positions.)

## Pre-existing tests adjusted

**Zero.** `git diff el-templo-api/test/` empty before, during, and after Plan 02 commits.

## Auth Gates

None — fully autonomous execution against the local dev environment.

## Operator Checkpoints (Pending — DO NOT auto-run)

1. **Staging code deploy** — Plan 02 is pure TS; no migration required. Deploy via the standard pipeline. Smoke-test: assign a plan with linkedProgramId, observe a `program_enrollments` row with `subscription_id` set; cancel the sub, observe the enrollment goes to `cancelled`.
2. **Production code deploy** — only after staging is sanity-checked. No migration required (Plan 01's migration must already be live; check `_migrations` table for `0111_program_enrollments_addon_columns`).

## Commits (per-task)

| Task | Description                                                                                                                                      | Hash       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 1    | EnrollmentService skeleton (7 method signatures, 1 read body, 4 stubs, 2 task-2-stubs)                                                           | `6c479f0d` |
| 2    | Refactor subscriptions/service.ts: replace 6 inserts + 4 teardown calls + delete 2 helpers; fill enrollFromPlan + tearDownForSubscription bodies | `e841745e` |
| 3    | Wire EnrollmentService into all 11 SubscriptionService DI sites                                                                                  | `b2b16e83` |

## Self-Check: PASSED

- ✓ `el-templo-api/src/modules/programs/enrollment-service.ts` exists (FOUND, 490 LOC)
- ✓ `el-templo-api/src/modules/programs/index.ts` modified (FOUND: EnrollmentService re-export)
- ✓ `el-templo-api/src/modules/subscriptions/service.ts` modified (FOUND: 4017 LOC, 423 lines removed)
- ✓ All 7 DI-site files modified (FOUND in git status)
- ✓ Commit `6c479f0d` (FOUND in `git log --oneline`)
- ✓ Commit `e841745e` (FOUND)
- ✓ Commit `b2b16e83` (FOUND)
- ✓ `pnpm tsc --noEmit` — exit 0
- ✓ `pnpm test test/subscriptions/expire-cancel-linked-program.test.ts test/subscriptions/bundle-todos-los-programas.test.ts` — 13/13 PASS (regression gate)
- ✓ `pnpm test test/subscriptions/ test/programs/` — 130/130 PASS (full suite)
- ✓ `git diff el-templo-api/test/` — empty (test files unmodified)
