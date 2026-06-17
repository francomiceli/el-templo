---
finding_id: 98-FINDING-01
surfaced_during: Phase 98 human-verify (Task 4)
surfaced_on: 2026-06-17
phase_98_status: not_a_phase_98_defect — Phase 98 is approvable as-is (SC#5 clean; its own 4 files are deterministic)
routed_to: Phase 97 — RGUARD-01 scope
priority: blocks RGUARD-01 baseline lock
type: test-infra / tech-debt
file_owner: 97.5 (added by commit cfb13e2c — sub.status/s.status raw-SQL drift RED + sweep-lint)
---

# Finding: Flaky test `ai-tools-membership-drift.test.ts` — shared-state leakage breaks deterministic green baseline

## What

`el-templo-api/test/whatsapp/ai-tools-membership-drift.test.ts` (added by Phase 97.5, commit `cfb13e2c` — the `sub.status` / `s.status` raw-SQL drift RED + sweep-lint guardrail) fails non-deterministically.

## Observed runs during Phase 98 verification

| Run                | When                                 | Result                                        | Failure count in this file              | Suite total                                |
| ------------------ | ------------------------------------ | --------------------------------------------- | --------------------------------------- | ------------------------------------------ |
| Executor early run | Phase 98 execution mid-session       | 24 failures (worst case)                      | flagged as suspected MySQL cleanup race | partial — not the structural-invariant run |
| Operator run 1     | Phase 98 human-verify step 2         | 4 failures total, 3 of which are in this file | 3                                       | 516 passed / 4 failed / 520                |
| Operator run 2     | Phase 98 human-verify step 2 (retry) | 1 failure total (the intended deferred RED)   | 0                                       | 519 passed / 1 failed / 520                |

The single deterministic failure in run 2 is the Phase-95-deferred `BUG-03 (i)` LIKE-search RED at `el-templo-bot/src/ai/tools.ts:455` — that one stays RED by design. All other failures observed across the unstable runs were transient, concentrated in `ai-tools-membership-drift.test.ts`.

## Root-cause hypothesis

**NOT** a parallelism race. `vitest.config.ts` is configured with `fileParallelism: false`, so files run serially.

More likely: **cross-file shared-state leakage** on shared MySQL tables. Both `ai-tools-membership-drift.test.ts` and `ai-tools.test.ts` seed the same tables (notably `branches`, `subscriptions`). When one file's `beforeEach` / `afterEach` cleanup ordering doesn't fully reset shared state (e.g., FK ordering issues, missing row deletes for non-prefixed test data, or incomplete coverage of rows the other file could have seeded), the next file's queries see leftover rows and assertions drift.

Belongs to the carry-forward `DEGR-01` / `LAT-03` flake family that has been hovering over the v5.3.3 test-infra surface.

## Why it matters / why now

Phase 97 RGUARD-01's purpose is to **lock a regression baseline** for the v5.3.3 milestone. A non-deterministic test directly undermines that lock — the "green" baseline depends on which run you happen to get. RGUARD-01 must not lock on a suite that flickers; closing this flake is the prerequisite for a meaningful lock.

## Scope boundary

**NOT a Phase 98 defect.**

- Phase 98 is test-side-only (SC#5 clean — `git diff HEAD~4 HEAD~1 -- 'el-templo-api/src/**' 'el-templo-bot/src/**'` is empty).
- Phase 98's own 4 modified files (`helpers.ts`, `subscriptions.test.ts`, `ai-tools.test.ts`, `webhook.test.ts`) are deterministic across all observed runs.
- The flake lives in a Phase-97.5-owned file and is orthogonal to Phase 98's changes.
- Phase 98 is approvable as-is. This finding is captured during Phase 98 human-verify and routed forward — it does not block Phase 98 ship.

## Suggested fix direction (for Phase 97 planning)

1. Audit `beforeEach` / `afterEach` cleanup in `ai-tools-membership-drift.test.ts` and `ai-tools.test.ts`:
   - **FK-aware truncation order** — child tables before parent (e.g., `subscriptions` before `subscription_plans`; `bookings` before `branches`).
   - **Completeness** — each file's cleanup must delete all rows it could have seeded, not just its own prefixed ones. Cross-file leakage usually means file A leaves rows that file B's filter (`LIKE 'TST%'` or similar) doesn't catch.
2. Consider extracting a **shared cleanup helper** (e.g., `test/helpers/db-reset.ts` or `test/whatsapp/_shared-cleanup.ts`) if both files reset the same tables — single source of truth for the FK-aware order.
3. Re-verify by running `pnpm --filter el-templo-api test --run` ≥10 times in a row. The baseline must hit `519 passed / 1 failed / 520 total` deterministically before RGUARD-01 can lock on it.

## Cross-references

- ROADMAP.md → `### Phase 97: Backlog + Regression Lock` → Notes (new bullet, "RGUARD-01 prerequisite — flake in `ai-tools-membership-drift.test.ts`")
- Phase 97.5 commit chain: `cfb13e2c` (RED) → `56deb8d2` (GREEN) → `6aee5f58` (SUMMARY) → `b19a7400` (post-merge mock fix) → `2483b7aa` (SHIPPED)
- Carry-forward flake family: DEGR-01, LAT-03 (see prior phase CONTEXT.md references)

---

_Captured: 2026-06-17 during Phase 98 human-verify (Task 4 checkpoint). Author: orchestrator on operator's behalf._
