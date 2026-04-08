---
phase: 85-avatar-adaptation-and-quality
plan: 02
subsystem: testing
tags: [vitest, playbooks, regression, avat-03, avat-04, v5.3-lock]

requires:
  - phase: 85-avatar-adaptation-and-quality
    provides: "AVATAR_TONE_GUIDES + resolver Rule 2.5 from plan 85-01 (the seam this plan's cross-cutting block asserts on)"
  - phase: 84-state-adaptive-playbook-prompts
    provides: "Enriched PB2-PB5 stage content (objection branches, TEAM-CORR-04 pause guards, sin-resistencia rules) that this suite regression-locks"
  - phase: 83-discovery-mode-for-leads
    provides: "PB1 discovery stage content, defer guard, profile-aware branching that this suite regression-locks"
provides:
  - "AVAT-03 lock on conversation-flows.test.ts (14 v5.2 Q1..Q14 under v5.3 engine + 1 integrative engine-on test)"
  - "playbook-flow-coverage.test.ts: per-PB end-to-end flow regression suite (19 tests)"
  - "test/fixtures/avatar-keywords.ts: shared DRY source-of-truth for AVAT-05 keyword contract"
  - "Full v5.3 regression net: future edits to definitions.ts / system-prompt.ts / advance.ts / resolver.ts are measured against these 413 tests"
affects: [v5.3 close-out, future v5.4 changes, avatar additions]

tech-stack:
  added: []
  patterns:
    - "Shared test fixtures under test/fixtures/ for AVAT-05-style contracts imported by multiple suites (DRY over duplicated keyword maps)"
    - "stageContent(playbookId, stageId) helper scoped to stage promptSection — avoids base-prompt poisoning of negative assertions (same idiom as pb1-discovery-flow.test.ts + pb2-pb5-isolation.test.ts)"
    - "Per-PB happy+objection describe block layout (5 PBs × 2 paths + 1 cross-cutting) as the v5.3 regression net template"

key-files:
  created:
    - "el-templo-bot/test/playbook-flow-coverage.test.ts"
    - "el-templo-bot/test/fixtures/avatar-keywords.ts"
  modified:
    - "el-templo-bot/test/conversation-flows.test.ts"
    - "el-templo-bot/test/avatar-tone-guide.test.ts"

key-decisions:
  - "AVAT-03 locked via annotation + single integrative test, not by rewriting Q1..Q14 — preserves v5.2 acceptance contract as historical reference"
  - "AVATAR_KEYWORDS extracted to test/fixtures/avatar-keywords.ts and imported by both suites (DRY per CLAUDE.md engineering preferences)"
  - "One combined playbook-flow-coverage.test.ts over 5 per-PB files: the shared stageContent helper + per-PB describe blocks fit in ~300 lines with no duplication gain from splitting"
  - "Both engine (advanceStageIfComplete) and prompt (getSystemPrompt/stageContent) layers asserted per PB — engine locks transitions, prompt locks what the model sees"
  - "Cross-cutting tone composition block uses intermedio as the canonical avatar (one assertion per PB) — proves AVAT-01 composes with every playbook, not just PB1"
  - "Zero source code changes — test-only plan (verified by git diff scope at final commit)"

requirements-completed: [AVAT-03, AVAT-04]

duration: 12min
completed: 2026-04-08
---

# Phase 85 Plan 02: v5.3 Quality Lock (AVAT-03 + AVAT-04) Summary

**Locked in the v5.3 regression net: annotated the 14 v5.2 QA tests as AVAT-03 with one integrative engine-on case, and shipped a new per-playbook flow coverage suite (19 tests, 5 PBs × happy+objection + tone composition) as the measurement baseline for every future change to the playbook engine, definitions, resolver, or system prompt.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-08T02:25Z
- **Completed:** 2026-04-08T02:37Z
- **Tasks:** 2
- **Files changed:** 4 (2 new + 2 modified)

## Accomplishments

- **AVAT-03 lock:** Added an annotation comment to the `describe("QA questions answered correctly", ...)` block in `conversation-flows.test.ts` explaining the v5.2 baseline contract under the v5.3 engine, plus one integrative `it("AVAT-03: ...")` case at the end that renders `getSystemPrompt` with `PB1.E1A` active + `currentAvatar: "gym_crossover"` (the most-loaded prompt path) and asserts 11 canonical Q1..Q14 tokens are still present. Q1..Q14 source unchanged.
- **AVAT-04 lock:** New `playbook-flow-coverage.test.ts` with 6 describe blocks (5 per-PB + 1 cross-cutting) and 19 `it()` cases — each PB has at least one happy path and one objection path asserted at both the engine layer (`advanceStageIfComplete`) and the prompt layer (`stageContent` + `getSystemPrompt`).
- **DRY refactor:** Extracted `AVATAR_KEYWORDS` (+ `ALL_AVATARS`, `ALL_AVATAR_KEYWORDS`) to `test/fixtures/avatar-keywords.ts` and updated `avatar-tone-guide.test.ts` to import from there — source-of-truth keyword contract now lives in one file and is consumed by both suites.
- **Full bot suite: 413/413 green** (was 393 baseline after plan 85-01; +20 tests from this plan — 19 in the new coverage suite + 1 in the AVAT-03 annotation).
- **Purity invariant preserved:** Grep against `drizzle|prisma|mysql|redis|ioredis|webhook|vi.mock` in `playbook-flow-coverage.test.ts` returns only the two docblock mentions (no actual imports). Total suite runtime for the new file: <200ms.
- **Zero source changes:** Git diff scope verified — only `el-templo-bot/test/**` touched.

## Task Commits

1. **Task 1: AVAT-03 annotation + integrative engine-on test** — `d3b7ed23` (test)
2. **Task 2: Per-playbook flow coverage suite + AVATAR_KEYWORDS fixture extraction** — `00444ab0` (test)

## Files Created/Modified

- `el-templo-bot/test/conversation-flows.test.ts` — Added AVAT-03 lock comment on the `QA questions answered correctly` describe + 1 new `it()` case at the end. 27 → 28 green. Q1..Q14 source unchanged.
- `el-templo-bot/test/playbook-flow-coverage.test.ts` — NEW, ~300 lines, 19 tests across 6 describe blocks:
  - `stageContent helper sanity` (1 test)
  - `PB1 — discovery flow` (3 tests: default E1A→E4 happy, intermedio→E2B avatar branch, defer guard)
  - `PB2 — trial follow-up flow` (3 tests: E1A→E2→E3 happy, phase 84-03 broadened-trigger regression, 4-branch objection content)
  - `PB3 — vencimiento flow` (2 tests: E1A→E2→E3 happy with PRE-vencimiento framing lock, userAccepted-only guard + upgrade anchor content)
  - `PB4 — inactivo flow` (2 tests: E1A→E2 happy + terminal guard, TEAM-CORR-04 plan-conditional pause + request_human)
  - `PB5 — cancelación flow` (3 tests: E1→E2→E3 happy with sin-resistencia rule, userAccepted-only guard + TEAM-CORR-04 dual-guard, E3 escalation + buen término framing)
  - `Phase 85 cross-cutting — avatar tone guide composes with every PB happy path` (5 tests: intermedio tone keywords render for PB1-PB5 entry stages alongside the "Perfil detectado" header)
- `el-templo-bot/test/fixtures/avatar-keywords.ts` — NEW shared fixture (~40 lines) exporting `ALL_AVATARS`, `AVATAR_KEYWORDS`, `ALL_AVATAR_KEYWORDS`. Pure module, no runtime behavior.
- `el-templo-bot/test/avatar-tone-guide.test.ts` — Refactored to import `ALL_AVATARS`, `AVATAR_KEYWORDS`, `ALL_KEYWORDS` from the new fixture. 29 tests still green, no behavior change.

## Decisions Made

- **Annotate, don't rewrite Q1..Q14:** The 14 questions are the v5.2 acceptance contract. Rewriting them would erase historical traceability. The annotation + integrative case is the cheapest way to prove engine-on doesn't break the v5.2 baseline while keeping the original assertions intact.
- **Extract AVATAR_KEYWORDS to `test/fixtures/`:** The plan explicitly flagged the DRY opportunity. A shared fixture is the right home because the keyword map is a test contract, not a production export — production code stays decoupled from the test-side source-of-truth.
- **Single combined coverage file (not 5 per-PB files):** Sharing the `stageContent` helper + imports + cross-cutting block in one file is ~300 lines; splitting would 5× the import boilerplate for zero testability gain. Matches the `pb2-pb5-isolation.test.ts` precedent.
- **Engine + prompt assertions per PB:** Engine-only tests lock transitions but not what the model sees; prompt-only tests lock content but not which stage is selected. Asserting both per PB covers the full "right stage → right content" contract.
- **intermedio as the canonical avatar for the cross-cutting block:** One avatar per PB (not all 4) keeps the test count sane while still proving AVAT-01 composes. `intermedio` has the strongest signature (`"afinar técnica"`, `"siguiente nivel"`) making drift detection reliable.
- **PB4.E2 terminal guard enforced with 3 negative signals:** Plan said "engine-terminal" so I asserted `userAccepted`, `discoveryAnswered`, and `priceObjection` all return null — a regression adding any of those would fire the test immediately.

## Deviations from Plan

None — both tasks executed exactly as written on the first run.

- Task 1: 28/28 green on first test run after annotation + new case.
- Task 2: 19/19 green on first test run after file creation. No source tweaks, no assertion rewrites.
- Scope note from the plan preamble was honored: uncommitted `contexto/` changes were NOT staged.

## Issues Encountered

None.

## User Setup Required

None — pure test plan, no infrastructure.

## Next Phase Readiness

- **AVAT-03 and AVAT-04 closed.** Phase 85 is complete (2/2 plans). This is the **final phase of the v5.3 milestone** — all of v5.3 (Conversational Sales & Playbook Engine) is now shipped and regression-locked.
- The full bot suite stands at **413/413 green**, up from 353 at the start of v5.3 (+60 tests across phases 82-85).
- The coverage suite is the measurement baseline for any future v5.4+ edits to the playbook engine, definitions, resolver, or system prompt — a single regression trips a targeted, well-labelled test.
- No blockers. No deferred items. No open scope.

---

_Phase: 85-avatar-adaptation-and-quality_
_Completed: 2026-04-08_

## Self-Check: PASSED

Verified:

- FOUND: el-templo-bot/test/conversation-flows.test.ts (AVAT-03 annotation + new it case — 28 tests)
- FOUND: el-templo-bot/test/playbook-flow-coverage.test.ts (new file, 19 tests, 6 describe blocks)
- FOUND: el-templo-bot/test/fixtures/avatar-keywords.ts (new shared fixture)
- FOUND: el-templo-bot/test/avatar-tone-guide.test.ts (refactored import — 29 tests still green)
- FOUND commit d3b7ed23 (Task 1)
- FOUND commit 00444ab0 (Task 2)
- Full bot suite: 413/413 green (18 test files)
- Purity grep on playbook-flow-coverage.test.ts: 0 import matches for drizzle/prisma/mysql/redis/ioredis/webhook/vi.mock (2 docblock mentions only)
- Git diff scope verified: only `el-templo-bot/test/**` files touched — zero source code changes
