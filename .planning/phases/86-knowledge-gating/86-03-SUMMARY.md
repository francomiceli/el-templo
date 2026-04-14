---
phase: 86-knowledge-gating
plan: 03
subsystem: testing
tags:
  [prompt-architecture, regression-test, knowledge-gating, vitest, whatsapp-bot]

# Dependency graph
requires:
  - phase: 86-01
    provides: BASELINE_CHARS = 23646 and frozen PB1.E1A pre-refactor fixture
  - phase: 86-02
    provides: getBusinessKnowledge(clientState?) with discovery gating (37% knowledge-block reduction)
provides:
  - Regression lock on KGATE-05 (revised threshold): rendered PB1.E1A ≤ 18,916 chars
  - Regression lock on structural goal: knowledge block ≥35% smaller for leads
  - Per-state presence/absence assertions for KGATE-02, KGATE-03, KGATE-04
affects:
  - 88-prompt-architecture-validation (will re-run the full 514-test suite)
  - Any future phase that modifies system-prompt.ts or knowledge.ts

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-threshold regression test: behavioral lock (≥20% on rendered prompt) + structural lock (≥35% on gated component). Keeps the original goal enforceable after the outer threshold was relaxed."
    - "test/ai/ subdirectory for cross-cutting AI/prompt concerns (first use; vitest glob `test/**/*.test.ts` already picks it up)"

key-files:
  created:
    - el-templo-bot/test/ai/prompt-size.test.ts
    - el-templo-bot/test/knowledge-gating.test.ts
  modified:
    - .planning/phases/86-knowledge-gating/86-03-PLAN.md

key-decisions:
  - "KGATE-05 threshold revised from ≥35% to ≥20% on full rendered prompt (commit 46caba53); 35% retained as a secondary assertion on knowledge-block-only to preserve the original structural intent"
  - "Non-lead sanity check via trial state only (not all 4 non-lead states) in prompt-size.test.ts — the per-state identity check lives in knowledge-gating.test.ts where it belongs (separation of concerns: size regression vs content gating)"
  - "Literal `*Mejora de plan*` exclusion assertion covers both the section heading and guards against accidental re-inclusion via an unrelated tag change"

patterns-established:
  - "When a threshold is revised mid-phase, update the plan inline with a <threshold_revision/> block citing the commit that encoded the decision, then mirror the rationale in code comments at the assertion site"
  - "Keep both the new and original thresholds in the regression suite when feasible: relaxing outer bounds should not silently erase the original engineering goal"

requirements-completed: [KGATE-02, KGATE-03, KGATE-04, KGATE-05]

# Metrics
duration: 6min
completed: 2026-04-14
---

# Phase 86 Plan 03: Knowledge Gating Regression Tests Summary

**Locked the Phase 86 behavior with 12 new tests: a dual-threshold prompt-size regression (≥20% on rendered prompt / ≥35% on knowledge block) plus per-ClientState presence/absence assertions across lead, trial, active_member, inactive_member, and expired_member.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-14T03:46:13Z
- **Completed:** 2026-04-14T03:48:30Z
- **Tasks:** 2
- **Files created:** 2
- **Files modified:** 1 (plan)

## Accomplishments

- Added `test/ai/prompt-size.test.ts` with 3 assertions: rendered ≤ 80% baseline (KGATE-05 revised), knowledge-block ≤ 65% of full (structural goal), trial still carries member-only sections
- Added `test/knowledge-gating.test.ts` with 9 assertions covering KGATE-02 (lead inclusion + exclusion), KGATE-03 (all 4 non-lead states string-equal to full), KGATE-04 (no-arg + explicit undefined return full)
- Updated `86-03-PLAN.md` inline with the threshold revision (new `<threshold_revision/>` block citing commit `46caba53`)
- Full bot suite now: **514/514 pass** (up from 502; +12 new tests from this plan)
- `pnpm tsc --noEmit` clean (strict mode, no `any`)

## Task Commits

1. **Plan revision: align 86-03 with revised KGATE-05 threshold** — `3c4829f1` (docs)
2. **Task 1: prompt-size regression test** — `ac9f1b57` (test)
3. **Task 2: per-state knowledge gating tests** — `a67f8ac9` (test)

## Files Created/Modified

- `el-templo-bot/test/ai/prompt-size.test.ts` — 45 lines, 3 tests. Imports `BASELINE_CHARS` from the 86-01 fixture (no magic numbers). Dual threshold documented inline.
- `el-templo-bot/test/knowledge-gating.test.ts` — 83 lines, 9 tests. Uses `Exclude<ClientState, "lead">` type for exhaustive non-lead iteration — if a new `ClientState` variant is added, this loop will flag it at compile time.
- `.planning/phases/86-knowledge-gating/86-03-PLAN.md` — added `<threshold_revision/>` block and updated code samples/truths to the 0.80/0.65 pair.

## Measurements (final, post-refactor)

| Metric                                                                            |            Value |    vs Baseline / Full | Against Threshold                             |
| --------------------------------------------------------------------------------- | ---------------: | --------------------: | --------------------------------------------- |
| Rendered PB1.E1A (`clientState='lead', activePlaybook='PB1', currentStage='E1A'`) | **18,617 chars** | **−21.27%** vs 23,646 | ≤ 18,916 allowed — **299 chars headroom**     |
| Knowledge block, `getBusinessKnowledge()`                                         |     13,842 chars |                     — | —                                             |
| Knowledge block, `getBusinessKnowledge('lead')`                                   |  **8,750 chars** | **−36.79%** vs 13,842 | ≤ 8,997 allowed — passes ≥35% structural goal |
| Knowledge block, `getBusinessKnowledge('trial')`                                  |     13,842 chars |  string-equal to full | —                                             |
| Knowledge block, `getBusinessKnowledge('active_member')`                          |     13,842 chars |  string-equal to full | —                                             |
| Knowledge block, `getBusinessKnowledge('inactive_member')`                        |     13,842 chars |  string-equal to full | —                                             |
| Knowledge block, `getBusinessKnowledge('expired_member')`                         |     13,842 chars |  string-equal to full | —                                             |

## Decisions Made

- **Placed prompt-size test at `test/ai/prompt-size.test.ts`** (plan's preferred location). Verified `vitest.config.ts` glob is `test/**/*.test.ts` — no config change required. This is the first use of the `test/ai/` subdirectory; future cross-cutting AI/prompt tests should follow the same pattern.
- **Kept the ≥35% goal alive as a secondary assertion on knowledge-block-only.** The relaxed ≥20% outer threshold protects against regressions in the rendered prompt, and the preserved ≥35% inner threshold protects against regressions in the gating logic itself. A future change that grew the universal framing (system-prompt.ts) could still pass ≥20% while failing the inner ≥35% check — giving us a directional signal about _which_ layer regressed.
- **Exhaustive non-lead iteration via `Exclude<ClientState, "lead">[]`** instead of a hardcoded string list. If a new `ClientState` value is ever added to `state/machine.ts`, TypeScript will flag this array as a compile error — forcing the test author to explicitly decide whether the new state is a lead or a member.

## Deviations from Plan

None — plan executed as (revised) written. Threshold revision was pre-approved by the user (commit `46caba53`) and encoded into the plan in commit `3c4829f1` before any tests were written.

## Issues Encountered

None. Vitest, tsc, and the full 514-test suite all green on first run.

## Next Phase Readiness

- **Phase 88 (Quality Regression) unblocked.** Phase 88 can now run `cd el-templo-bot && pnpm vitest run` and expect 514/514 pass against the combined output of Phases 86 and 87.
- **Watch item:** The 299-char headroom on the rendered prompt is tight. If Phase 87 (Boarding Pass consolidation + Method description) adds universal framing or non-gated knowledge, the rendered prompt could grow past 18,916 and fail KGATE-05. Phase 87 should measure the delta as part of its own verification and, if the margin is exhausted, either gate the new content for leads or re-open the threshold conversation. This is the documented "future phases should be aware" concern.
- **Watch item:** If the knowledge block itself grows (e.g., new discovery-tagged section in Phase 87), the ≥35% inner assertion could fail even if the rendered prompt stays under ≤20%. Same remediation — measure, and either gate or re-threshold.

## Self-Check: PASSED

- FOUND: `el-templo-bot/test/ai/prompt-size.test.ts`
- FOUND: `el-templo-bot/test/knowledge-gating.test.ts`
- FOUND commit: `3c4829f1` (plan revision)
- FOUND commit: `ac9f1b57` (Task 1)
- FOUND commit: `a67f8ac9` (Task 2)
- `pnpm tsc --noEmit` → exit 0
- `pnpm vitest run` → 514/514 pass

---

_Phase: 86-knowledge-gating_
_Completed: 2026-04-14_
