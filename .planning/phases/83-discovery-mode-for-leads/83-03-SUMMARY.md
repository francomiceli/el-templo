---
phase: 83-discovery-mode-for-leads
plan: 03
subsystem: el-templo-bot / playbooks
tags: [playbook, PB1, advance, stage-progression, guards, vitest]

# Dependency graph
requires:
  - phase: 82-playbook-engine
    provides: advanceStageIfComplete + AdvanceSignals (pure stage helper)
  - phase: 83-02
    provides: AvatarProfile union + optional avatar field on PlaybookSessionState + handler extracts/persists priorAvatar
provides:
  - Enriched AdvanceSignals (detectedAvatar, directQuestionAsked, userInsistedDirect)
  - Profile-aware PB1.E1A/E1B → E2A vs E2B branching
  - Defer + insistence guards that hold the discovery stage for one turn
  - computeAdvanceSignals regex extension for Spanish direct-question / insistence phrasings
affects: [phase-84 (PB2-PB5 transitions), phase-85 (per-avatar tone)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure helper + handler-side regex pair: the engine stays IO-free while the handler does the linguistic matching"
    - "Backward-compat by default: null/omitted detectedAvatar falls through to E2A so phase-82 callers still work"
    - "Engine-level guard layer reinforces prompt-level rules — defer and insistence hold the stage even if the prompt fails"

key-files:
  created: []
  modified:
    - el-templo-bot/src/playbooks/advance.ts
    - el-templo-bot/src/webhook/handler.ts
    - el-templo-bot/test/playbook-advance.test.ts

key-decisions:
  - "Guard short-circuits at the top of the PB1 block, BEFORE any E1/E2/E3 branch — the stage holds regardless of which discovery sub-stage is active"
  - "Branch only on detectedAvatar ∈ {intermedio, retorna} → E2B; the default (null, undefined, cero_absoluto, gym_crossover) falls through to E2A so all 21 phase-82 tests stay green without edits"
  - "computeAdvanceSignals stays inline in handler.ts per plan explicit instruction (no extraction to intents.ts — phase 83 doesn't have enough call sites)"
  - "Direct-question regex intentionally narrow: explicit Spanish phrasings for price/schedule/location only, no generic interrogatives, to avoid false positives that would block legitimate discovery advancement"
  - "TODO(phase-83) comment removed from advance.ts — the refinement it tracked is now implemented"

patterns-established:
  - "Engine + handler regex pair for turn-level behavioral signals: handler does linguistic matching, engine consumes booleans"
  - "Purity guards in tests — both input-mutation assertion and 100-call determinism for new branching paths"

requirements-completed: [DISC-02, DISC-05, DISC-07]

# Metrics
duration: ~25min
completed: 2026-04-07
---

# Phase 83 Plan 03: PB1 Smart Stage Progression Summary

**Profile-aware PB1 branching (E1A/E1B → E2A vs E2B) plus defer and insistence guards that hold the discovery stage when the user asks direct logistical questions or explicitly refuses profiling — closes the `TODO(phase-83)` phase 82 left in `advance.ts`.**

## Performance

- **Duration:** ~25 min active
- **Tasks:** 3
- **Files modified:** 3
- **Tests added:** 15 (21 → 36 in `playbook-advance.test.ts`)

## Accomplishments

- `AdvanceSignals` interface extended with `detectedAvatar: AvatarProfile | null`, `directQuestionAsked: boolean`, and `userInsistedDirect: boolean` — all optional, all backward-compatible with phase-82 callers.
- `advanceStageIfComplete` gained a top-of-PB1 guard block that returns `null` when either defer or insistence signal is set, reinforcing the DISC-03 + DISC-07 rules at the engine level.
- PB1.E1A / E1B now branches to `PB1.E2B` when the detected avatar is `intermedio` or `retorna`, and falls through to `PB1.E2A` otherwise — the smart split phase 82 marked as `TODO(phase-83)`.
- `computeAdvanceSignals` in `handler.ts` accepts a `detectedAvatar` third parameter and extracts `directQuestionAsked` / `userInsistedDirect` via narrow Spanish regex. The single call site inside `processWithAi` passes `detectedAvatar ?? priorAvatar ?? null`, honoring both freshly-detected (this turn) and previously-stored (prior turn) avatars.
- Removed the phase-82 `TODO(phase-83)` comment from `advance.ts`; the tracker comment up top now documents the implemented behavior instead.
- Purity preserved: `advance.ts` still has zero `console.`, zero `Date.`, zero Redis/webhook/ai imports — grep-verified.
- 15 new unit tests covering all 4 avatars × E1A branching, backward-compat defaults, defer guard at E1A + E2A, insistence guard at E1A + E3, normal E3 → E4 path, E2B → E3 path, plus two purity guards (mutation check + 100-call determinism with `intermedio`).

## Task Commits

Each task was committed atomically on `feature/whatsapp-bot-scaffold`:

1. **Task 1: profile-aware PB1 branching + defer/insistence guards in `advance.ts`** — `185d3df1` (feat)
2. **Task 2: extend `computeAdvanceSignals` with avatar + direct/insistence regex** — `8a5d562a` (feat)
3. **Task 3: 15 new advance tests covering the new branching + guards + purity** — `a9450ac3` (test)

## Files Created/Modified

- `el-templo-bot/src/playbooks/advance.ts` — Extended `AdvanceSignals`, imported `AvatarProfile`, added guard block + profile-aware E1→E2A/E2B branching, removed phase-82 TODO, updated top docblock.
- `el-templo-bot/src/webhook/handler.ts` — Extended `computeAdvanceSignals` signature with `detectedAvatar: AvatarProfile | null` parameter + two new regex-derived signals, updated the one call site in `processWithAi` to pass `detectedAvatar ?? priorAvatar ?? null`.
- `el-templo-bot/test/playbook-advance.test.ts` — New `describe("PB1 phase-83 refinements", ...)` block with 15 cases (7 branching, 4 guards, 1 normal path, 1 E2B path, 2 purity guards).

## Verification

- `cd el-templo-bot && pnpm tsc --noEmit` — exit 0 (after each task)
- `cd el-templo-bot && pnpm test playbook-advance` — **36/36 passing** (was 21)
- `cd el-templo-bot && pnpm test` — **14 files / 280 tests passing** (was 265)
- `grep "detectedAvatar\|directQuestionAsked\|userInsistedDirect" el-templo-bot/src/playbooks/advance.ts` — all 3 fields referenced (interface + guard + branch)
- `grep "console\\.\\|Date\\." el-templo-bot/src/playbooks/advance.ts` — 0 matches (purity preserved)
- `grep "TODO(phase-83)" el-templo-bot/src/playbooks/advance.ts` — 0 matches (TODO removed)
- `grep "directQuestionAsked\|userInsistedDirect\|detectedAvatar" el-templo-bot/src/webhook/handler.ts` — all 3 names referenced in `computeAdvanceSignals` + call site

## Requirements Closed

| ID      | Description                                                      | Evidence                                                                         |
| ------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| DISC-02 | Cap discovery at 2-3 adaptive questions                          | PB1.E1→E2→E3→E4 is at most 3 discovery turns; E3→E4 always exits discovery       |
| DISC-05 | Per-avatar PB1 progression (E2A for beginners, E2B for advanced) | advance.ts branches on `detectedAvatar` — intermedio/retorna → E2B, others → E2A |
| DISC-07 | Insistence rule — respect leads who refuse discovery             | `userInsistedDirect` + `directQuestionAsked` guards hold the stage at top of PB1 |

## Decisions Made

- **Guard placed ABOVE branching, not interleaved.** Returning `null` at the top of the PB1 block (before any E1/E2/E3 match) is simpler than threading the guards into each transition individually and makes the engine-level reinforcement of DISC-03 + DISC-07 obvious on read.
- **Default to E2A for null/undefined avatar.** This keeps all 21 phase-82 `playbook-advance` tests green without edits — any signal object that doesn't set `detectedAvatar` behaves exactly like phase 82 did. Only `intermedio` and `retorna` trigger the new E2B branch.
- **`computeAdvanceSignals` stays inline in `handler.ts`.** Plan explicitly instructed not to extract to `intents.ts`; phase 83 has only one call site and the regex block is small enough to inline without hurting readability.
- **Narrow Spanish regex for new signals.** `directQuestionAsked` matches only explicit logistical phrasings (cuanto sale / qué precio / qué horarios / qué días / dónde está/queda / dirección / sede / qué planes) — generic `?` questions do NOT trip it, so legitimate discovery questions from Mica (which already drive `discoveryAnswered`) are unaffected. `userInsistedDirect` matches refusals (solo quiero / pasame / no tengo tiempo / sin vueltas / al grano / decime directo) — does NOT overlap with affirmatives like `dale` / `perfecto`.

## Deviations from Plan

None — plan executed exactly as written. All three tasks landed in the order specified, typecheck + targeted tests + full suite all passed on the first attempt.

## Issues Encountered

None.

## User Setup Required

None — change is entirely inside the bot process. No env vars, no migrations, no external service configuration.

## Next Phase Readiness

- Phase 83-04 (PB1 integration tests) can now assert the engine routes intermedio/retorna leads to PB1.E2B and that the defer/insistence guards hold the stage end-to-end.
- Phase 85 (AVAT-01/AVAT-02) can layer per-avatar tone on top of the already-branching E2A/E2B stages without touching `advance.ts` again.
- DISC-02, DISC-05, DISC-07 closed.

## Self-Check: PASSED

Verified files exist:

- FOUND: el-templo-bot/src/playbooks/advance.ts (modified, committed)
- FOUND: el-templo-bot/src/webhook/handler.ts (modified, committed)
- FOUND: el-templo-bot/test/playbook-advance.test.ts (modified, committed)

Verified commits exist on feature/whatsapp-bot-scaffold:

- FOUND: 185d3df1 (Task 1)
- FOUND: 8a5d562a (Task 2)
- FOUND: a9450ac3 (Task 3)

Verified tests + checks:

- 36/36 playbook-advance tests green (15 new + 21 prior)
- 280/280 full bot suite green (was 265)
- `pnpm tsc --noEmit` exit 0
- advance.ts purity grep: 0 matches for `console.` / `Date.`
- TODO(phase-83) grep: 0 matches (removed as part of this plan)

---

_Phase: 83-discovery-mode-for-leads_
_Completed: 2026-04-07_
