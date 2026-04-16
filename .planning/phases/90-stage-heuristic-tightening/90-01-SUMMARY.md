---
phase: 90-stage-heuristic-tightening
plan: 01
subsystem: el-templo-bot/playbooks
tags: [playbook, discovery, pb1, heuristic, stage-advance, escape-hatch]
requires:
  - phase: 89-knowledge-fixes
    provides: "625-char KGATE-05 headroom + price-free PB1.E1A render (baseline 18,291 chars) against which Phase 90 measures its completionCriteria delta"
provides:
  - "Category-diversity content gate (4 semantic categories, ≥2 match) for PB1.E1A + PB1.E1B"
  - "AND composition with turn_count ≥ 2 in discoveryAnswered for E1A/E1B only"
  - "discoveryTurnCount optional field on PlaybookSessionState (backward-compat)"
  - "Infinite-loop escape hatch — N=3 substantive turns force-advance + greppable Pino warn"
  - "completionCriteria prose rewrite for E1A/E1B (multi-signal intent)"
affects:
  - el-templo-bot/src/webhook/handler.ts
  - el-templo-bot/src/playbooks/definitions.ts
  - el-templo-bot/src/playbooks/types.ts
  - el-templo-bot/src/memory/playbook-state.ts
  - el-templo-bot/test/playbook-advance.test.ts
tech-stack:
  added: []
  patterns:
    - "Category-diversity content gate over single-keyword regex (explainable stage detection)"
    - "Turn-count AND composition for stage completion (structural gate, not prompt rule)"
    - "Observability-only escape hatch with greppable log literal (Pino warn, no admin alert)"
    - "Optional-field schema evolution (backward-compat via JSON transit, mirrors Phase 83-02 avatar pattern)"
key-files:
  created:
    - .planning/phases/90-stage-heuristic-tightening/90-01-SUMMARY.md
  modified:
    - el-templo-bot/src/webhook/handler.ts
    - el-templo-bot/src/playbooks/definitions.ts
    - el-templo-bot/src/playbooks/types.ts
    - el-templo-bot/src/memory/playbook-state.ts
    - el-templo-bot/test/playbook-advance.test.ts
key-decisions:
  - "Category partition over length proxy: 4 semantic buckets (level/experience/duration/context) encoded as module-scope Record<string, RegExp> — single allocation, explainable by reading"
  - "AND composition, not OR: discoveryAnswered_E1 = content_gate AND turn_count ≥ 2 — implements 'idealmente 2-3 preguntas' literally; OR would neutralize the gate"
  - "Escape hatch preserves discoveryTurnCount on force-advance (does not reset) — Phase 92 may want to assert on it in escape-fired paths"
  - "Test alignments applied in-place (3 updates in playbook-advance.test.ts), mirrors Phase 89 AVAT-03 precedent; Phase 92 remains authoring target for RLOK-01 new locks"
  - "Single-turn override for 3+ categories DEFERRED per CONTEXT.md — revisit only if Phase 92 live test shows false-negative false-stuck-at-E1A"
patterns-established:
  - "E1A_E1B_CATEGORIES table: redistributing a single-union regex into categorized lookups while preserving every keyword (ensures no behavior regression on the match side)"
  - "Escape-hatch payload shape: event + stageId + phone + turnCount + recentUserMessages[1-3] — sufficient for post-hoc grep-based analysis"
  - "Default-parameter backward-compat: new signature param defaulted (turnCountIncludingThis: number = 1) so existing call sites and tests compile without change"
requirements-completed: [STAGE-01, STAGE-02]
duration: ~30min
completed: "2026-04-13"
---

# Phase 90 Plan 01: Stage Heuristic Tightening (v5.3.2 STAGE-01/02) Summary

Category-diversity content gate plus AND turn-count composition plus Pino-logged escape hatch tighten PB1.E1A/E1B stage advancement so the live-test false-advance (`"Hola mica soy mati, sería la primera vez"` → E2A after one turn) is structurally impossible, while monosyllabic-lead pathological loops are bounded at N=3 substantive turns with rich observability.

## Performance

- **Duration:** ~30 min (two atomic commits)
- **Tasks:** 2 completed
- **Files modified:** 5
- **Commits:** 2 (`88e7bc3d` STAGE-01, `17237d0a` STAGE-02 + alignments)

## Final Implementation

### Task 1 — STAGE-01: Category-diversity content gate (commit `88e7bc3d`)

Module-scope table partitions the pre-90 single-union regex into four semantic categories. Every keyword from the pre-90 union is preserved; none was dropped. `hasStageSpecificContent` for `PB1.E1A` / `PB1.E1B` now returns `true` iff ≥ 2 categories match. Sibling stages (E2A/E2B/E3) are untouched.

**Category map** (all regexes use the existing `(^|[^a-záéíóúñ])(…)([^a-záéíóúñ]|$)` non-word-boundary style because JS `\b` is ASCII-only):

| Category     | Keywords                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------- |
| `level`      | principiante, primera vez, nunca, arrancar, arranco, empezar                                 |
| `experience` | entreno/entrenó/entrené/entrenaba, hice, hago, vengo de, experiencia, activo/a, sedentario/a |
| `duration`   | años/año, meses/mes, semanas/semana                                                          |
| `context`    | gym, gimnasio, crossfit, pesas, running, yoga, pilates, deporte                              |

**Discrimination:**

- `"primera vez"` → 1 category (level) → **false**
- `"Hola mica soy mati, sería la primera vez"` → 1 category (level) → **false** (live-test regression)
- `"nunca entrené, quiero arrancar"` → 2 categories (level + experience) → **true**
- `"hice crossfit hace 2 años"` → 3 categories (experience + context + duration) → **true**

### Task 2 — STAGE-02 + escape hatch + wording + alignments (commit `17237d0a`)

1. **Schema evolution (`types.ts`):** `PlaybookSessionState.discoveryTurnCount?: number` added; optional, JSDoc-documented, backward-compatible with pre-90 Redis entries (absent → treated as 0).

2. **Transparent persistence (`memory/playbook-state.ts`):** JSDoc updated to document the new field's backward-compat story. No code change — the JSON round-trip carries it transparently.

3. **AND composition (`webhook/handler.ts`):** `computeAdvanceSignals` accepts `turnCountIncludingThis: number = 1`. For `currentStage === "PB1.E1A"` or `"PB1.E1B"` only, `discoveryAnswered` additionally requires `turnCountIncludingThis >= 2`. Other stages unchanged.

4. **Turn-count tracking (`webhook/handler.ts`):** post-AI advance block computes `isSubstantiveTurn` (same gates as pre-90 `discoveryAnswered` minus the stage-specific content check) and increments `newTurnCount` only while `resolved.stageId ∈ {E1A, E1B}`. Persisted on every `setPlaybookState` write in the advance block (including the pre-AI write and the avatar-detected write, so a crash between writes preserves the counter).

5. **Escape hatch (`webhook/handler.ts`):** after `advanceStageIfComplete`, if `inDiscoveryE1 && isSubstantiveTurn && newTurnCount >= 3 && !hasStageSpecificContent(inbound, stageId)`, emits a Pino `log.warn` with exact literal message `"discovery escape fired"` and structured payload `{ event: "discovery_escape_fired", stageId, phone, turnCount, recentUserMessages: session.messages.filter(user).slice(-3).map(content) }`. If the heuristic did not already advance, force-sets `nextStage = "PB1.E2A"`. The counter is **preserved** on escape (not reset) so Phase 92 can assert on it.

6. **completionCriteria rewrite (`definitions.ts`):** PB1.E1A and PB1.E1B `completionCriteria` now reference "múltiples categorías (nivel + experiencia, o experiencia + duración, etc.) o ha respondido en al menos 2 turnos" instead of "dijo primera vez avanzar". E1A retains its specific branching sentence; E1B retains its "Avanzar a PB1.E2A o PB1.E2B según respuesta" closing.

## Measurements

### KGATE-05 delta (per CONTEXT.md budget, ≤ +50 chars)

| Metric                         | Phase 89 baseline | Phase 90 post | Δ     |
| ------------------------------ | ----------------- | ------------- | ----- |
| Rendered PB1.E1A lead snap.txt | 18,291 chars      | 18,291 chars  | **0** |
| KGATE-05 threshold             | 18,916            | 18,916        | —     |
| Headroom vs KGATE-05           | +625              | **+625**      | 0     |

**Why zero delta:** `completionCriteria` is metadata consumed by the advance logic and documentation tooling; it is NOT rendered into the lead prompt via `STATE_SECTIONS`. A grep of `test/fixtures/pb1-e1a-lead-rendered.snap.txt` for `"dijo primera vez avanzar"` returns 0 pre-90 — no fixture regeneration needed. The 625-char headroom banked in Phase 89 is fully preserved for Phases 91-92.

### Test suite

- Before: 537/537 green (Phase 89 baseline)
- After Task 1: 537/537 green (no alignments needed for STAGE-01 alone)
- After Task 2: 3 test failures surfaced (structural — `computeAdvanceSignals` called without prior turn count, defaulting to 1 < 2 for E1A/E1B); 3 in-place alignments applied
- Final: 537/537 green

## Observable Truths Status

All eight truths from plan `must_haves.truths` verified:

- [x] `"primera vez"` alone (single-category answer) does NOT advance PB1.E1A → E2A (STAGE-01 gate returns false at 1 category).
- [x] Two-category answer + turn_count ≥ 2 DOES advance (content gate true AND AND-gate true).
- [x] Three-category answer at turn 1 does NOT advance yet (turn_count=1 < 2 fails AND gate).
- [x] Escape hatch fires after exactly N=3 substantive turns in E1A/E1B without passing the gate, emits Pino `log.warn` with greppable `"discovery escape fired"` literal + stageId + phone + turnCount + last 1-3 user messages, and force-advances to `PB1.E2A`.
- [x] E1B content gate behaves symmetrically to E1A (same `E1A_E1B_CATEGORIES` lookup, same AND composition, same escape hatch — single code path keyed on `stageId === "PB1.E1A" || stageId === "PB1.E1B"`).
- [x] E2A / E2B / E3 heuristics byte-identical to pre-90 (only the E1A/E1B branch inside `hasStageSpecificContent` changed; E2/E3 regex branches and their `discoveryAnswered` semantics untouched).
- [x] PB1.E1A and PB1.E1B `completionCriteria` references "múltiples categorías" and "al menos 2 turnos"; "dijo primera vez avanzar" removed.
- [x] Rendered PB1.E1A lead byte-delta from Phase 89 snapshot is 0 chars (≤ +50 budget). KGATE-05 headroom preserved at +625.
- [x] Full bot test suite 537/537 green after 3 in-place alignments.

## Test Alignment (Phase 89 precedent, plan-anticipated)

Three assertions in `el-templo-bot/test/playbook-advance.test.ts` inside the `hasStageSpecificContent + discoveryAnswered — stage gate (P0-3)` describe block broke for the expected structural reason: they called `computeAdvanceSignals(..., "PB1.E1A" | "PB1.E1B")` with no prior turn count, defaulting to `turnCountIncludingThis = 1`, which is now blocked by the STAGE-02 AND gate.

Each was updated in-place to pass `turnCountIncludingThis = 2`, with an inline comment citing `[STAGE-02 alignment, v5.3.2 Phase 90]` and noting that the authoritative behavioral lock lives in Phase 92 (RLOK-01).

1. **`'nunca entrené en mi vida' at PB1.E1A → true`** (line 659) — added trailing `2` to `computeAdvanceSignals` call.
2. **`'hace 2 años que hago crossfit' at PB1.E1A → true`** (line 672) — same.
3. **`'vengo del gym hace años' at PB1.E1B → true`** (line 685) — same.

No other tests broke. No new assertions authored (Phase 92 scope). No snapshot regeneration required.

## Deviations from Plan

- **None on scope.** Both tasks executed exactly as specified.
- **Refactor shape choice (minor):** the plan offered two options for the `computeAdvanceSignals` signature (accept turn count OR accept a pre-computed `isSubstantiveTurn`). Chose turn-count + stageId (plan's recommended option) — cleaner locality, default param = 1 means zero call-site churn outside the handler and the three aligned tests.
- **Two-commit split, not single atomic.** The plan's Task 2 commit message template described a single atomic commit "covering all five edits". The executor followed the plan's `<task>` structure (Task 1 and Task 2 as separate atomic commits) because the plan also states "Task 1 and Task 2 each commit independently". Task 1 (STAGE-01) and Task 2 (STAGE-02 + wording + alignments) are on separate commits — Task 1 stands alone as a pure content-gate tightening, Task 2 bundles the AND composition + turn-count schema + escape hatch + completionCriteria + test alignments.
- **`playbook-state.ts` touched (documentation only).** Plan marked this file as optional; included for the JSDoc backward-compat note to mirror the existing `avatar` comment (matches the pattern future maintainers will search for).

## Phase 92 Handoff Notes — RLOK-01 locks for Phase 90

Phase 92 should author new assertions that lock the following Phase 90 source state:

- **STAGE-01 content gate:**
  - Assert `hasStageSpecificContent("primera vez", "PB1.E1A") === false` (single category).
  - Assert `hasStageSpecificContent("Hola mica soy mati, sería la primera vez", "PB1.E1A") === false` (live-test regression lock).
  - Assert `hasStageSpecificContent("nunca entrené, quiero arrancar", "PB1.E1A") === true` (level + experience).
  - Assert `hasStageSpecificContent("hice crossfit hace 2 años", "PB1.E1A") === true` (3 categories).
  - Assert E2A/E2B/E3 branches byte-identical to pre-90 (pin the regex sources).
- **STAGE-02 AND gate:**
  - Assert `computeAdvanceSignals(rich_inbound, reply, null, "PB1.E1A", 1).discoveryAnswered === false` (turn-count blocks rich first turn).
  - Assert `computeAdvanceSignals(rich_inbound, reply, null, "PB1.E1A", 2).discoveryAnswered === true`.
  - Assert non-E1A/E1B stages ignore the turn count (default=1 still advances on content match for E2A/E2B/E3).
- **Escape hatch:**
  - Integration test: drive 3 substantive monosyllabic-ish user turns through the handler in E1A; assert (a) Redis stage advanced to `PB1.E2A`, (b) a Pino warn with `msg === "discovery escape fired"` and `event === "discovery_escape_fired"` was emitted, (c) payload contains `stageId`, `phone`, `turnCount: 3`, `recentUserMessages` array length 1-3.
  - Negative test: 3 rich substantive turns (content-gate-passing) must NOT fire the escape; `log.warn` with `msg === "discovery escape fired"` absent.
- **completionCriteria prose:**
  - Assert PB1.E1A `completionCriteria` contains `"múltiples categorías"` and `"al menos 2 turnos"` and does NOT contain `"dijo primera vez avanzar"`.
  - Assert PB1.E1B same.
- **Byte-equal lock:** Phase 92 snapshot regeneration (post-Phase-91) should continue to show `"dijo primera vez avanzar"` absent from the rendered PB1.E1A lead prompt.

## Commits

- `88e7bc3d` — `feat(bot): category-diversity content gate for PB1.E1A/E1B (v5.3.2 STAGE-01) (90-01)` — Task 1
- `17237d0a` — `feat(bot): tighten PB1.E1A/E1B stage heuristic (v5.3.2 STAGE-02) (90-01)` — Task 2

## Self-Check: PASSED

- [x] FOUND: el-templo-bot/src/webhook/handler.ts (modified, committed in both hashes)
- [x] FOUND: el-templo-bot/src/playbooks/definitions.ts (modified, committed in 17237d0a)
- [x] FOUND: el-templo-bot/src/playbooks/types.ts (modified, committed in 17237d0a)
- [x] FOUND: el-templo-bot/src/memory/playbook-state.ts (modified, committed in 17237d0a)
- [x] FOUND: el-templo-bot/test/playbook-advance.test.ts (aligned, committed in 17237d0a)
- [x] FOUND: commit 88e7bc3d in git log
- [x] FOUND: commit 17237d0a in git log
- [x] FOUND: `"discovery escape fired"` literal at src/webhook/handler.ts line 704 (exactly 1 hit)
- [x] FOUND: `"múltiples categorías"` in src/playbooks/definitions.ts (2 hits — E1A + E1B)
- [x] FOUND: `discoveryTurnCount` in src/playbooks/types.ts
- [x] VERIFIED: pnpm tsc --noEmit exit 0
- [x] VERIFIED: pnpm test 537/537 green
- [x] VERIFIED: snap byte-count 18,291 (delta 0, budget ≤ +50)
