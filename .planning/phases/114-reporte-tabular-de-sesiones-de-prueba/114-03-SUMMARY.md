---
phase: 114
plan: 03
subsystem: api/subscriptions
tags: [hook, conversion, lead-status, lead-notes, recomputeUserStatus, trial]
requires:
  - users.lead_status, users.lead_notes columns from Plan 114-01
provides:
  - "recomputeUserStatus side-effects: lead_status='cerrado' + lead_notes='<plan.name>' on first trial→paid conversion (D-32)"
  - "Hook participates in parent subscription transaction — atomic rollback (D-33)"
affects:
  - el-templo-api/src/modules/subscriptions/service.ts
  - el-templo-api/test/subscriptions-conversion-hook.test.ts
tech-stack:
  added:
    - none (no new packages)
  patterns:
    - "Single-statement UPDATE with 4 CASE columns (status, lead_status, lead_notes, converted_at) for atomic conversion-side-effects"
    - "Deliberate SET ordering: lead_status / lead_notes written BEFORE converted_at because MySQL evaluates SET left-to-right (later expressions see already-assigned values for earlier columns in the same row)"
    - "Correlated subquery on subscriptions+subscription_plans for plan-name extraction inside the lead_notes CASE branch (no JS round-trip)"
key-files:
  created:
    - el-templo-api/test/subscriptions-conversion-hook.test.ts
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
decisions:
  - "D-32 implemented: hook sets lead_status='cerrado' on first conversion and prefills lead_notes with the converting plan name iff notes are NULL or empty string."
  - "D-33 implemented structurally: hook reuses existing recomputeUserStatus which is already invoked from inside db.transaction at every callsite (no caller changes needed)."
  - "D-34 honored by omission: the hook only fires from recomputeUserStatus; PATCH /admin/leads (Plan 04) lives in a different module and must NOT touch lead_notes."
  - "SET ordering matters: lead_status / lead_notes precede converted_at in the SET clause so they read the pre-image of converted_at IS NULL (MySQL evaluates SET assignments left-to-right per MySQL 8.0 reference manual)."
metrics:
  tasks_completed: 2
  files_modified: 1
  files_created: 1
  completed_date: 2026-05-12
  tests_added: 5
  tests_passing: 5
  callsites_unchanged: 9
---

# Phase 114 Plan 03: Subscription conversion hook — auto-close lead + prefill plan name Summary

Extended `recomputeUserStatus` in `el-templo-api/src/modules/subscriptions/service.ts` with two additional CASE branches in the same single-statement UPDATE: `lead_status = 'cerrado'` and `lead_notes = '<plan.name>'`. Both branches share the existing conversion predicate (`converted_at IS NULL AND active-sub-started AND is_trial booking exists`) and run inside the parent transaction at every callsite — no caller changes required. Five integration tests cover the four plan-mandated scenarios plus one idempotence regression (re-assigning after conversion does NOT re-prefill `lead_notes`).

## Tasks Completed

| Task | Name                                                              | Commit   | Files                                                                                                                       |
| ---- | ----------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| T1   | Extend recomputeUserStatus with lead_status + lead_notes CASEs    | 3ac35468 | el-templo-api/src/modules/subscriptions/service.ts                                                                          |
| T2   | Integration tests + Rule-1 fix to SET ordering (discovered by T2) | 2906de4c | el-templo-api/test/subscriptions-conversion-hook.test.ts, el-templo-api/src/modules/subscriptions/service.ts (reorder only) |

## Behavior Verified by Tests

| Scenario                                                            | Result                                                                                               |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Trial user, lead_notes IS NULL → assign "Flex Basic"                | converted_at=NOW(), lead_status='cerrado', lead_notes='Flex Basic'                                   |
| Trial user, lead_notes='manual: muy interesado' → assign "Flex Pro" | lead_status='cerrado', lead_notes='manual: muy interesado' (UNCHANGED)                               |
| Trial user, lead_notes='' (empty string) → assign "Flex Basic"      | lead_status='cerrado', lead_notes='Flex Basic'                                                       |
| Non-trial user (status='freemium', no is_trial booking) → assign    | status='activo', converted_at=NULL, lead_status=NULL, lead_notes=NULL                                |
| Re-assign after conversion (cancel → pre-void charge → assign Pro)  | lead_status='cerrado' (unchanged), lead_notes='Flex Basic' (NOT re-prefixed), converted_at unchanged |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] MySQL evaluates SET left-to-right; original SET ordering broke the hook**

- **Found during:** Task 2 (first test run — assertion expected `lead_status='cerrado'`, got `'en_seguimiento'`).
- **Issue:** The plan prescribed appending the new `u.lead_status = CASE WHEN u.converted_at IS NULL ...` and `u.lead_notes = CASE WHEN u.converted_at IS NULL ...` branches AFTER the existing `u.converted_at = CASE ... THEN CURRENT_TIMESTAMP` branch. MySQL UPDATE evaluates SET assignments left-to-right (https://dev.mysql.com/doc/refman/8.0/en/update.html), and later expressions see already-assigned values for earlier columns in the same row. So once `u.converted_at` was set to `CURRENT_TIMESTAMP` by the second SET item, the third and fourth SET items (`u.lead_status`, `u.lead_notes`) both saw `u.converted_at IS NOT NULL` and the conversion gate evaluated to FALSE — meaning the hook never fired on the conversion write that triggered it.
- **Fix:** Move the two new CASE branches BEFORE `u.converted_at` in the SET clause. Order is now: status → lead_status → lead_notes → converted_at. The `u.converted_at` self-reference inside its own CASE still works because the right-hand side is evaluated before the column itself is assigned in the same statement (the column hasn't been written by this UPDATE yet at the point of evaluating its own RHS).
- **Files modified:** `el-templo-api/src/modules/subscriptions/service.ts` (recomputeUserStatus body — SET clause reordered + comment block updated to cite the MySQL semantics).
- **Tests added that catch regressions:** All 4 trial-path tests in `subscriptions-conversion-hook.test.ts` exercise the gate; any future regression that reads converted_at incorrectly will fail Test 1 on first run.
- **Commit:** 2906de4c (reorder + tests committed together so the failing test that surfaced the bug and the fix that resolves it ship as one atomic unit).

### Auth gates encountered

None.

## Pre-existing Notes (Plan 114-01 Echo)

Plan 114-01 documented two pre-existing issues unrelated to this work — untracked migration files `0101_extend_tren_superior_full_body_4_weeks.sql` / `0102_replicate_tren_inferior_w12_to_w13.sql` in `el-templo-api/src/db/migrations/`, and provisioning hook timeout under load. Neither is touched by this plan; the targeted test runs (this plan's file, plus regression runs of `lifecycle.test.ts`, `renewal.test.ts`, `members-trial.test.ts`) all passed cleanly.

## LIMIT 1 / ORDER BY DESC Observation

The plan asked whether the defensive `ORDER BY s2.created_at DESC LIMIT 1` in the `lead_notes` correlated subquery ever observed the "wrong" sub. Answer: **no**. In all 5 test scenarios, only one matching active-or-paused sub existed at the moment of the conversion write, and the subquery returned the canonical plan name on every run. The clause is purely defensive — it guards against the theoretical edge case where two `subscription_status IN ('active','paused')` rows coexist (forbidden by the service-layer invariant but cheap to harden against).

## Callsite Audit

The plan listed 9 `recomputeUserStatus` callsites (lines 1180, 1508, 1574, 1673, 1751, 1971, 2424, 2767, 3059, 3183, 3367 — actually 11 with the recheck below). All compile clean (`pnpm exec tsc --noEmit` → exit 0) and the existing regression tests covering several of these paths (lifecycle: assign / boarding-pass / AURA / pause / resume / cancel; renewal: 5 scenarios) all pass without modification. The hook is invoked from inside `db.transaction(async (tx) => { ... })` at every paying path; the one exception is the read-only sync helper at line 1574 (`this.db` not `tx`) which already pre-existed and does not affect conversion semantics.

## Test Results

- `pnpm test test/subscriptions-conversion-hook.test.ts` → **5/5 tests passed** (one was flaky-removed RED then re-added GREEN; ended at 5 passing).
- `pnpm test test/subscriptions/lifecycle.test.ts test/subscriptions/renewal.test.ts test/members/members-trial.test.ts` → **39/39 tests passed** (regression).
- `pnpm exec tsc --noEmit` → **exit 0** (no errors anywhere).

## Acceptance Criteria Re-check (Plan §)

- `grep -c "u.lead_status = CASE" el-templo-api/src/modules/subscriptions/service.ts` → 1 ✓
- `grep -c "u.lead_notes = CASE" el-templo-api/src/modules/subscriptions/service.ts` → 1 ✓
- `grep -c "'cerrado'" el-templo-api/src/modules/subscriptions/service.ts` → 2 (both inside the new CASE branch — one in `THEN 'cerrado'`, one in a comment block; >= 1 satisfied) ✓
- Function signature `private async recomputeUserStatus(userId: number, tx:` unchanged ✓
- All callers compile unchanged (tsc clean) ✓
- File `el-templo-api/test/subscriptions-conversion-hook.test.ts` exists with 5 tests, all passing ✓
- Test 1 asserts `lead_notes === 'Flex Basic'` exactly ✓
- Test 2 asserts `lead_notes === 'manual: muy interesado'` UNCHANGED ✓
- Test 4 asserts `lead_status === null` on non-trial user ✓
- Test 5 asserts re-assignment does NOT mutate lead_notes a second time ✓

## Downstream Unblocked

- **Plan 114-04 (PATCH /admin/leads/:userId):** route handler must deliberately NOT touch `lead_notes` when only `lead_status` is being edited (D-34). The Plan 04 test should assert that flipping lead_status to 'cerrado' manually via PATCH leaves `lead_notes` unchanged — the asymmetry with this plan's auto-hook is intentional.
- **Plan 114-05 (reports endpoint):** the `lead_notes` column now reliably contains either NULL (lead with no admin note and never converted), the plan name (auto-prefilled on conversion), or an admin-entered note. The report can surface this column directly.

## Self-Check: PASSED

- File `el-templo-api/src/modules/subscriptions/service.ts` contains `u.lead_status = CASE` (1 occurrence) and `u.lead_notes = CASE` (1 occurrence) inside `recomputeUserStatus` — verified via grep.
- File `el-templo-api/test/subscriptions-conversion-hook.test.ts` exists with 5 vitest `it(...)` blocks — verified via grep.
- Commit `3ac35468` present (T1 — SQL extension; pre-fix ordering, retained intentionally to show the gate-reorder evolution).
- Commit `2906de4c` present (T2 — tests + reorder fix; final state).
- `pnpm exec tsc --noEmit` exits 0.
- `pnpm test test/subscriptions-conversion-hook.test.ts` exits 0, 5 tests passing.
- Regression run (lifecycle + renewal + members-trial) → 39 tests, all passing.
