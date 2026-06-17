---
phase: 98-test-hygiene-98-a-b-c
plan: 01
subsystem: testing
tags: [test-infra, cherry-pick, patch-apply, vi-mock, recovery]
status: tasks-1-3-green-awaiting-task-4-checkpoint
completed_at: 2026-06-17
duration: "13m 8s"

dependency_graph:
  requires:
    - "phase-98-preserve/task-1-green-baseline @ 95d58f98 (cherry-pick source)"
    - ".planning/phases/98-test-hygiene-98-a-b-c/98-TASK-2-WIP.patch (sha256 5d452fc7...)"
    - "Phase 97.5 SHIPPED (cfb13e2c → 56deb8d2 → 6aee5f58 → b19a7400 → 2483b7aa) — precondition that made SC#5-clean retry viable"
  provides:
    - "Green API test baseline (single deferred RED: BUG-03 (i) at tools.ts:455)"
    - "futureDateISO(daysFromToday: number): string in test/helpers.ts"
  affects:
    - "Phase 97 RGUARD-01 (unblocks regression-suite baseline lock)"

tech-stack:
  added: []
  patterns:
    - "vi.mock with importOriginal spread (mirror existing sendTextMessage mock at webhook.test.ts:27-39)"
    - "MySQL SQL round-trip for next-occurrence date (D-12 Option 2; mirrors prod tools.ts:329 formula)"
    - "Semantic-substring assertion for getNonTextFallback ('imagen' substring)"
    - "waitForHandler() replaces setTimeout(r, 100) for async-handler tests"

key-files:
  created: []
  modified:
    - "el-templo-api/test/helpers.ts (+ futureDateISO export, via cherry-pick)"
    - "el-templo-api/test/subscriptions/subscriptions.test.ts (6 stale startDate sites + :366/:374/:375 dynamic-ized, via cherry-pick)"
    - "el-templo-api/test/whatsapp/ai-tools.test.ts (10 sites via WIP patch + D-12 date-fix on 2 check_schedule tests + lleno→sin cupos)"
    - "el-templo-api/test/whatsapp/webhook.test.ts (AI provider vi.mock + 2 echo asserts + image-test rewrite)"

decisions:
  - "Followed D-14: cherry-pick from phase-98-preserve/task-1-green-baseline (commit 95d58f98). D-02 deviation (no addDays import) preserved per HALT.md operator authorization."
  - "Followed D-13: applied 98-TASK-2-WIP.patch (sha256 5d452fc7...) verbatim for the 10 operator-authorized sites in 98-B."
  - "Followed D-12 Option 2: SQL round-trip via MySQL `SELECT DATE_ADD(CURDATE(), INTERVAL (? - DAYOFWEEK(CURDATE()) + 8) % 7 DAY)`; inline derivation in both check_schedule test bodies — no new helper (mirrors prod tools.ts:329 byte-equivalently)."
  - "Rule 1 deviation (Task 2): changed `expect(result).toContain('lleno')` to `expect(result).toContain('sin cupos')` because tools.ts:389 emits 'sin cupos' when spotsRemaining <= 0 (not 'lleno'; 'lleno' only appears in knowledge.ts:292 as doc text). Semantic intent preserved."
  - "Followed D-07: AI provider vi.mock mirrors sendTextMessage mock pattern; canned reply `{content: 'Hola, soy Mica.', toolCalls: []}`; empty toolCalls keeps handler on no-tool path (handler.ts:708)."

metrics:
  duration_seconds: 788
  duration_human: "13m 8s"
  tasks_completed: 3
  tasks_checkpoint: 1
  files_modified: 4
  commits: 3
---

# Phase 98 Plan 01: Test Hygiene (98-A/B/C) — Summary

Restored the green API test baseline post-97.5 by closing the test-side failures via a 3-commit atomic chain (98-A cherry-pick → 98-B patch+date-fix → 98-C vi.mock + image-test rewrite). Single deferred RED (BUG-03 (i) LIKE-search at `tools.ts:455`) preserved per Phase 95's deferred-scope marker; zero production source changes per SC#5 HARD GUARD.

## Tasks Completed

| #   | Task                                                                                                             | Commit       | Files                             | Pass delta                    |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------- | ----------------------------- |
| 1   | 98-A: cherry-pick 95d58f98 (rewrite 6 stale startDate sites + add futureDateISO helper)                          | `9b02c830`   | helpers.ts, subscriptions.test.ts | 6 → 0 (file all-pass: 26/26)  |
| 2   | 98-B: apply WIP patch (10 sites) + D-12 check_schedule next-occurrence date fix + Rule 1 lleno→sin cupos         | `d70fb5b5`   | ai-tools.test.ts                  | 20 → 0 (file all-pass: 20/20) |
| 3   | 98-C: AI provider vi.mock + echo asserts at :292/:298 + image-test rewrite (waitForHandler + 'imagen' substring) | `bfdcba1f`   | webhook.test.ts                   | 3 → 0 (file all-pass: 7/7)    |
| 4   | Phase 98 sign-off: 8-step operator verification                                                                  | (checkpoint) | —                                 | — (awaiting operator)         |

## Recovery Provenance

- **98-A** landed via `git cherry-pick 95d58f98` from `phase-98-preserve/task-1-green-baseline`. SHA verified pre-cherry-pick (`git rev-parse phase-98-preserve/task-1-green-baseline` matched `95d58f981470bcc5adb95ff63d1c7cda2cdc1a82` exactly). Clean cherry-pick, no conflicts. D-02 deviation preserved (no addDays import).
- **98-B** landed via `git apply` of `.planning/phases/98-test-hygiene-98-a-b-c/98-TASK-2-WIP.patch`. sha256 verified pre-apply (`5d452fc7f73e3bc561bc6d7564e8420bbc42f91e7c9ce51f102beea3ccf875f1`); `git apply --check` exited 0. D-12 next-occurrence date-fix layered inline on top of the patch in the same atomic commit; Rule 1 wording deviation (lleno → sin cupos) also included because the WIP patch and D-12 recipe didn't cover it.
- **98-C** is fresh implementation per D-07/D-08/D-09/D-10. AI provider `vi.mock` shape mirrors the existing `sendTextMessage` mock at `webhook.test.ts:27-39`. Image test rewritten to match post-quick-16-fix-3 store+reply behavior (handler.ts:323-358) using `waitForHandler()` instead of `setTimeout(r, 100)`.

## SC Verification Outputs

| Gate                     | Command                                                                                                                   | Result                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SC#1                     | `cd el-templo-api && pnpm test --run`                                                                                     | `519 passed                                                                                         | 1 failed | 520 total`. Single failure: `BUG-03 candidate (i) — LIKE-search ambiguity at tools.ts:455 > RED: returns exactly one disambiguated branch for substring-match input (FAILS on master)`in`test/whatsapp/v5-3-3-booking.integration.test.ts:130`. Plan-locked SC#1 wording said "511/1/512" pre-97.5; post-97.5 the baseline shifted to 520 total (97.5 added `raw-sql-column-drift.test.ts` with 5 tests plus other adds). The structural intent (single deferred RED = BUG-03 (i), every other test green) is met. |
| SC#5                     | `git diff HEAD~3 HEAD -- 'el-templo-api/src/**' 'el-templo-bot/src/**' \| wc -l`                                          | `0` (zero src/\*\* changes across the Phase 98 commit range).                                       |
| SC#6a                    | `cd el-templo-api && pnpm exec tsc --noEmit`                                                                              | exit `0`                                                                                            |
| SC#6b                    | `cd el-templo-bot && pnpm exec tsc --noEmit`                                                                              | exit `0`                                                                                            |
| 6-pair invariant         | `awk '/^```$/{f=!f;next} f && /DEBOUNCE_TTL_SECONDS/ {found=1} f && found {print}' .planning/ROADMAP.md \| shasum -a 256` | `67670b1e1099bf7c8a5285414736f16e8a010a010348bf6566790d0db3163344` (UNCHANGED)                      |
| File-count               | `git diff --name-only HEAD~3 HEAD \| wc -l`                                                                               | `4` (helpers.ts + 3 test files; no leaks)                                                           |
| Commit naming            | `git log HEAD~3..HEAD --format=%s \| grep -cE '^test\(98-[ABC]\): '`                                                      | `3`                                                                                                 |
| BUG-03 (i) RED preserved | `cd el-templo-api && pnpm test --run test/whatsapp/v5-3-3-booking.integration.test.ts`                                    | exit non-zero; failed test description contains `BUG-03 candidate (i)` and `LIKE-search ambiguity`. |
| Patch integrity (pre-T2) | `shasum -a 256 .planning/phases/98-test-hygiene-98-a-b-c/98-TASK-2-WIP.patch`                                             | `5d452fc7f73e3bc561bc6d7564e8420bbc42f91e7c9ce51f102beea3ccf875f1`                                  |
| Cherry-pick source       | `git rev-parse phase-98-preserve/task-1-green-baseline`                                                                   | `95d58f981470bcc5adb95ff63d1c7cda2cdc1a82`                                                          |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test asserted `"lleno"` against production text that emits `"sin cupos"`**

- **Found during:** Task 2 (after WIP patch applied + D-12 date-fix layered). 20/20 ai-tools tests would have been 19/20 (1 fail) without this fix.
- **Issue:** `el-templo-api/test/whatsapp/ai-tools.test.ts:216` (post-edit line, was inside the "shows 'lleno' when at capacity" test body) asserted `expect(result).toContain("lleno")`. Production at `el-templo-bot/src/ai/tools.ts:389` renders `spotsRemaining <= 0 ? "sin cupos" : ...` — the string `"lleno"` is only present in `knowledge.ts:292` as documentation text, not in tools.ts's actual emit. The D-12 date-fix exposed this latent assertion mismatch by making bookings count correctly for the first time.
- **Fix:** Changed `expect(result).toContain("lleno")` → `expect(result).toContain("sin cupos")` with an inline comment explaining prod's actual full-capacity wording. Semantic intent (capacity-reached marker) preserved.
- **Files modified:** `el-templo-api/test/whatsapp/ai-tools.test.ts` (folded into Task 2 commit).
- **Commit:** `d70fb5b5` (same atomic commit as the WIP patch + D-12 fix).

### Environment / Tooling

**2. [Rule 3 - Blocking] Worktree lacked installed node_modules and .env files**

- **Found during:** Task 1 Step 5 (first attempt at `pnpm tsc --noEmit` reported "Command 'tsc' not found"; first `pnpm test` reported `ER_ACCESS_DENIED_ERROR` connecting to MySQL).
- **Issue:** New worktree starts with neither node_modules (each app has its own pnpm install, no monorepo workspace) nor app-specific `.env` files (gitignored, only `.env.example` is tracked).
- **Fix:** Ran `pnpm install --prefer-offline` in `el-templo-api/`, `el-templo-bot/`, and the worktree root (~5s total). Symlinked `el-templo-api/.env → /Users/bores/el-templo/el-templo-api/.env` and `el-templo-bot/.env → /Users/bores/el-templo/el-templo-bot/.env` so the test config can read DB credentials. Symlinks don't modify tracked files and don't leak credentials back into git (still gitignored).
- **Files modified:** None (node_modules and .env are gitignored).

## Authentication Gates

None. Tests run against local MySQL + local Redis using credentials from the existing `.env` file.

## Known Stubs

None.

## Threat Flags

None — Phase 98 attack-surface delta is ZERO (test-infra only; SC#5 HARD GUARD verified clean across commit range).

## TDD Gate Compliance

Plan is type `execute` (not `tdd`), so the plan-level TDD gate sequence does not apply. Per-task verification is via the targeted `pnpm test --run <file>` gates which all returned all-pass for the modified files.

## Notes on SC#1 Baseline Shift

The plan's SC#1 wording locks "511 passed / 1 failed / 512 total" but the post-97.5 baseline is **520 total** because Phase 97.5 added `test/lint/raw-sql-column-drift.test.ts` (5 tests) plus several other test additions in the prod-fix commit chain (`cfb13e2c..2483b7aa`). The structural invariant — single deferred RED (BUG-03 (i)) with all other tests green — is satisfied; the absolute total count changed because of orthogonal landed work outside Phase 98's scope. This is consistent with the plan's intent (Phase 98 closes 29 newly-green tests; preserves 1 deferred RED) — the delta is +8 in total because of 97.5's additions, not because Phase 98 introduced new failures.

One transient observation worth recording: the first full-suite run in the worktree reported 496/24/520 (24 failures), but every subsequent run reports 519/1/520. The 23-test variance concentrated in files that exercise the shared MySQL test DB and looks like a startup-time cleanup race against fresh container state; not a regression introduced by Phase 98 (the modified files all pass deterministically in targeted runs). Operator should be aware in case the 8-step Task 4 verification surfaces it.

## Next Step in v5.4.0 Path

Phase 97 RGUARD-01 is unblocked once Task 4 sign-off lands: the green API test baseline now exists for the regression-suite lock to anchor on.

## Self-Check

Files claimed to exist:

- `.planning/phases/98-test-hygiene-98-a-b-c/98-01-SUMMARY.md` (this file)

Commits claimed:

- `9b02c830` test(98-A): rewrite 6 stale startDate sites + add futureDateISO helper
- `d70fb5b5` test(98-B): apply WIP patch (10 sites: cleanup/wording/column-renames/addresses) + check_schedule next-occurrence date fix + lleno→sin cupos wording
- `bfdcba1f` test(98-C): add AI provider vi.mock + align echo asserts + rewrite image test for store+reply

Self-check verification at commit time below.

## Self-Check: PASSED
