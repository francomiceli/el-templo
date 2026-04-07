---
phase: 83-discovery-mode-for-leads
plan: 04
subsystem: el-templo-bot / tests
tags: [vitest, pure-tests, pb1, discovery, regression-guard, ci]

# Dependency graph
requires:
  - phase: 83-01
    provides: PB1.E1A/E1B/E2A/E2B/E3/E4/E5 enriched promptSections (warm intro, 2-3 cap, defer rule, insistence rule, REGLA FUERTE, soft trial close)
  - phase: 83-02
    provides: profile-tag parser (extractProfileTag/stripProfileTag), conditional "Detección de perfil" + "Perfil detectado" prompt directives
  - phase: 83-03
    provides: AdvanceSignals.detectedAvatar/directQuestionAsked/userInsistedDirect, profile-aware E1→E2A/E2B branching, defer+insistence guards
provides:
  - End-to-end-style regression suite for the v5.3 PB1 discovery flow that runs without an AI provider, Redis, or MySQL
  - One describe block per DISC requirement (DISC-01..07) so a failed test points directly at the broken contract
  - stageContent() helper that scopes content assertions to PB1 stage promptSections so business knowledge in the base prompt does not poison negative checks
affects:
  [phase-84 (PB2-PB5 transitions test foundation), phase-85 (per-avatar tone)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stage-scoped content assertions: read PLAYBOOKS.PB1.stages directly for what a stage DOES/DOES NOT contain; reserve getSystemPrompt rendering for wrapper-directive assertions"
    - "One-describe-per-requirement structure that maps test failures 1:1 to DISC IDs"
    - "Pure regression guards composed from three earlier plans without re-importing their internals"

key-files:
  created:
    - el-templo-bot/test/pb1-discovery-flow.test.ts
  modified: []

key-decisions:
  - "Content assertions are scoped to stage.promptSection (via a stageContent() helper) instead of the full getSystemPrompt() output. The full system prompt embeds the entire business knowledge string, which legitimately mentions 'precio', 'pagar', 'Foundation', 'Performance', 'Flex', '$', etc. — those would poison the negative assertions the plan asked for. The wrapper-directive tests (Detección de perfil / Perfil detectado / playbook header) still run against getSystemPrompt because that IS the contract being pinned at the render layer."
  - "Defer-rule and insistence-rule tests assert presence in EVERY discovery stage (E1A/E1B/E2A/E2B/E3), not just E1A. This catches the failure mode where the rule gets dropped from one variant during a copy refactor."
  - "DISC-04 keeps the negative-list assertion ('Foundation/Performance/Flex/$') because phase-83 promised plan-name absence at the stage level — the stageContent() scoping makes this safe and meaningful."
  - "DISC-06 explicitly asserts presence of 'NO empieces a vender el plan' in E5 instead of asserting absence of the literal token 'plan'. The negation IS the behavioral contract; asserting absence of 'plan' would force a copy rewrite that obscures the rule."
  - "Test file is pure (no async, no mocks, no IO, no Redis/webhook/MySQL imports) — verified by grep + zero process-level side effects in vitest output."

patterns-established:
  - "Phase-level conversation-flow tests live in el-templo-bot/test/ as pure unit tests, not in el-templo-api/test/ — the playbook engine has no DB touch points and the bot CLAUDE.md only requires API-touching tests to live in el-templo-api/test/whatsapp/"
  - "Stage promptSection inspection via PLAYBOOKS lookup is the canonical way to assert stage copy contracts going forward (phase 84 will reuse this for PB2-PB5)"

requirements-completed:
  [DISC-01, DISC-02, DISC-03, DISC-04, DISC-05, DISC-06, DISC-07]

# Metrics
duration: ~20min
completed: 2026-04-07
---

# Phase 83 Plan 04: PB1 Discovery Flow Conversation Tests Summary

**Locked in all 7 v5.3 DISC success criteria as 19 pure Vitest cases against `getSystemPrompt`, `advanceStageIfComplete`, and the `<profile>` tag parser — composing the outputs of plans 83-01/02/03 into a single regression-proof suite that runs in <200 ms with no AI calls, no Redis, and no DB.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 1
- **Files created:** 1
- **Tests added:** 19 (280 → 299 in the bot suite)

## Accomplishments

- New file `el-templo-bot/test/pb1-discovery-flow.test.ts` with exactly 7 `describe` blocks (DISC-01 through DISC-07), 19 `it` cases total, every case carrying an explanatory comment mapping it to its DISC ID and to the specific behavior under test.
- A small `stageContent(stageId)` helper that resolves a PB1 stage promptSection directly from `PLAYBOOKS.PB1.stages` so content-scoped assertions are not polluted by the base persona + business knowledge embedded in the full system prompt.
- DISC-01: warm-intro + first-question coverage for both E1A and E1B variants, plus a regression guard that the explicit `NUNCA preguntes` ban on the generic opener stays inlined in both stages.
- DISC-02: prompt-level "Idealmente 2-3 preguntas" cap is asserted in both E1A and E1B, and the engine-level cap is locked in by walking E1A → E2A → E3 → E4 through `advanceStageIfComplete` plus a registry guard that no `PB1.E4B` discovery sub-stage exists.
- DISC-03: defer-rule presence asserted across all five discovery stages (E1A/E1B/E2A/E2B/E3), `directQuestionAsked=true` proven to hold the stage at E1A, `false` proven not to block normal advancement.
- DISC-04: `REGLA FUERTE`, `NO recomend`, `clase de prueba`, and `gratis` all asserted in E4 promptSection; plan names (`Foundation`, `Performance`, `Flex`) and `$` asserted absent at the stage level.
- DISC-05: parser round-trips all 4 avatars including `stripProfileTag` cleanup; conditional injection of `Detección de perfil` only on `PB1` + `currentAvatar=null`, replaced by `Perfil detectado` once an avatar is known; `intermedio` at E1A advances to E2B via `advanceStageIfComplete`.
- DISC-06: E4 close presents `clase de prueba` + `gratis` + the `Te paso los detalles después de la clase` re-anchor; absence of `urgencia` and `promoción` enforced. E5 carries `agendo` + `ropa cómoda` and the `NO empieces a vender el plan` rule, while `pagar` and `precio` are asserted absent at the stage scope.
- DISC-07: insistence rule asserted across all five discovery stages; `userInsistedDirect=true` proven to hold E1A, `false` proven to resume the normal default path AND the avatar-aware path (`detectedAvatar=retorna` → E2B).

## Task Commits

1. **Task 1: pb1-discovery-flow.test.ts covering DISC-01..07** — `bd2f53bf` (test)

## Files Created/Modified

- `el-templo-bot/test/pb1-discovery-flow.test.ts` — New, 357 lines, 7 describe blocks, 19 test cases, single helper function (`stageContent`).

## Verification

- `cd el-templo-bot && pnpm tsc --noEmit` — exit 0
- `cd el-templo-bot && pnpm test pb1-discovery-flow` — **19/19 passing**
- `cd el-templo-bot && pnpm test` — **15 files / 299 tests passing** (was 280, +19)
- `grep -E "drizzle|prisma|mysql|redis|ioredis|webhook" el-templo-bot/test/pb1-discovery-flow.test.ts` — 0 matches (purity confirmed)
- File contains exactly 7 `describe(` blocks, all titled `DISC-NN — ...`
- Test duration: 19 ms (well under the <5 s budget)

## Decisions Made

- **Stage-scoped content assertions via `stageContent()` helper instead of full `getSystemPrompt()` rendering for content checks.** Discovered during the first test run: `getSystemPrompt({clientState: "lead", ...})` includes the entire business knowledge string, which legitimately contains `precio`, `pagar`, `Foundation`, `Performance`, `Flex`, and `$` because the bot needs to answer questions about plans and payments at the Mica/knowledge layer. Negative assertions at the stage layer require scoping to the stage's `promptSection`. The wrapper-directive tests (Detección de perfil / Perfil detectado / playbook header injection) still run against `getSystemPrompt` because those directives ARE injected at the render layer and would not exist on a raw `stages[].promptSection` lookup.
- **Defer + insistence rule presence asserted in EVERY discovery stage**, not just E1A. The plan only required E1A coverage, but a copy refactor that drops the rule from a single variant (e.g. only E2B) would silently regress for leads who entered through that branch. The five-stage assertion catches that failure mode for ~5 lines of test code.
- **DISC-06 E5 negation asserted directly** rather than via absence of the token `plan`. The phrase `NO empieces a vender el plan` IS the behavioral rule; rewriting E5 to drop the literal `plan` word would obscure the contract. We assert what the rule says, not what tokens it avoids.
- **No `vi.mock`, no async, no helper IO.** The plan called for pure tests; the only helper is `stageContent()` which is a synchronous registry lookup with zero side effects.

## Deviations from Plan

**[Rule 1 — Bug] Content assertions originally scoped to full system prompt, refactored to stage promptSection.**

- **Found during:** First `pnpm test pb1-discovery-flow` run (4 failures out of 19).
- **Issue:** The plan's literal pattern was "render `getSystemPrompt(...)` then assert `.toContain` / `.not.toContain` on stage-specific content". This breaks because the base system prompt embeds the entire business knowledge string, which legitimately mentions `Foundation`, `Performance`, `Flex`, `$`, `precio`, `pagar`, etc. for the Mica persona. Four of the planned negative assertions (DISC-04 plan-name absence, DISC-06 E4 hard-sell absence, DISC-06 E5 `pagar`/`precio` absence) were impossible against the full prompt.
- **Fix:** Introduced a tiny `stageContent(stageId)` helper that returns `PLAYBOOKS.PB1.stages.find(s => s.id === stageId).promptSection` directly. All content-scoped DISC tests (DISC-01, DISC-02 prompt half, DISC-03 prompt half, DISC-04, DISC-06, DISC-07 prompt half) now use this helper. The wrapper-directive tests in DISC-05 still call `getSystemPrompt` because they ARE asserting injected directives.
- **Files modified:** `el-templo-bot/test/pb1-discovery-flow.test.ts` only (refactor was inside the new file before commit; no other code touched).
- **Commit:** `bd2f53bf` (single commit for the final, passing version of the test file).

**[Rule 1 — Bug] Defer-rule literal `Si el lead te hace una pregunta directa` was capitalized in the plan but lowercase `si` in the source.**

- **Found during:** Same first test run (DISC-03 case).
- **Issue:** The plan asked to assert `prompt.toContain("Si el lead te hace una pregunta directa")` (capital S). The actual stage promptSection in `definitions.ts` line 29 uses lowercase `si` because it sits mid-sentence after `*Regla de defer (...):*`.
- **Fix:** Lowercased the assertion in DISC-03 to match the source. Also broadened the test to assert presence in all 5 discovery stages, not just E1A.

**[Improvement — extra coverage] DISC-03 and DISC-07 prompt-rule tests now span all 5 discovery stages.**

- The plan only required E1A coverage. Asserting in all 5 catches the more realistic failure mode where a copy refactor drops the rule from a single stage variant.
- **Files modified:** Same test file, single commit.

## Issues Encountered

None beyond the scoping/casing issues documented above as Rule-1 deviations — both were caught on the first test run and fixed before commit.

## User Setup Required

None — the plan is purely additive (one new test file), no env vars, no DB migrations, no external service configuration, no production code touched.

## Next Phase Readiness

- **Phase 83 is COMPLETE.** All 4 plans done (83-01 prompt copy, 83-02 profile-tag detection, 83-03 advance.ts refinement, 83-04 regression suite). All 7 DISC requirements have prompt-level + engine-level + test-level coverage.
- Phase 84 (PB2-PB5 state-driven prompts) can reuse the `stageContent()` pattern and the one-describe-per-requirement structure for its own conversation-flow tests.
- Phase 85 (per-avatar tone) can layer per-avatar promptSection blocks on top of E2A/E2B with DISC-05 already locked in by these tests — any avatar-detection regression now fails CI loudly.

## Self-Check: PASSED

Verified files exist:

- FOUND: el-templo-bot/test/pb1-discovery-flow.test.ts (created, 357 lines after prettier)
- FOUND: .planning/phases/83-discovery-mode-for-leads/83-04-SUMMARY.md (this file)

Verified commit exists on feature/whatsapp-bot-scaffold:

- FOUND: bd2f53bf — test(83-04): cover PB1 discovery flow against DISC-01..07

Verified tests + checks:

- 19/19 pb1-discovery-flow tests green
- 299/299 full bot suite green (was 280, +19)
- `pnpm tsc --noEmit` exit 0
- 7 describe blocks present, one per DISC-01..07
- Purity grep (drizzle|prisma|mysql|redis|ioredis|webhook) — 0 matches

---

_Phase: 83-discovery-mode-for-leads_
_Completed: 2026-04-07_
