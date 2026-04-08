---
phase: 84-state-adaptive-playbook-prompts
plan: 03
subsystem: el-templo-bot / playbooks
tags: [playbook, advance, isolation, regression, PBPR-05, PBPR-06, TEAM-CORR-04]
requires:
  - phase 84-01 (PB2/PB3 enrichment landed; PB3.entryStageId = PB3.E1A)
  - phase 84-02 (PB4/PB5 enrichment landed; request_human invocations + plan-conditional pause)
provides:
  - "advance.ts: PB3 (E1A/E1B→E2, E2→E3), PB4 (E1A/E1B→E2), PB5 (E1→E2, E2→E3) stage transitions"
  - "advance.ts: PB2.E2 → PB2.E3 broadened from priceObjection to discoveryAnswered (all four 84-01 objection branches now advance)"
  - "playbook-advance.test.ts: +17 new tests across 3 new describe blocks (PB3/PB4/PB5) plus PB2.E2 regression"
  - "pb2-pb5-isolation.test.ts: pre-flight signature audit, 5×5 cross-state matrix, escalation reuse, v5.3 scope guards including TEAM-CORR-04 dual-guard for PB4.E2 + PB5.E2"
affects:
  - el-templo-bot/src/playbooks/advance.ts
  - el-templo-bot/test/playbook-advance.test.ts
  - el-templo-bot/test/pb2-pb5-isolation.test.ts (new)
tech-stack:
  added: []
  patterns:
    - "Pure stage transition: signal-driven advance helper, no IO/Redis/Date/console — extends the phase 83-03 PB1 pattern to PB3/PB4/PB5"
    - "Pre-flight signature audit: assert each isolation signature phrase appears verbatim in its own entry-stage rendered prompt before running the cross-state matrix (catches non-entry-stage signatures at authoring time)"
    - "Cross-state isolation matrix (5×5): for every (active, other) playbook pair, assert other-PB signatures absent from the active prompt — semantic counterpart to phase-82's structural single-section invariant"
    - "Dual-guard scope test: TEAM-CORR-04 plan-conditional pause asserted in BOTH PB4.E2 and PB5.E2 stage promptSections by direct PLAYBOOKS access (those stages aren't entry stages, so the matrix can't reach them via getSystemPrompt rendering)"
key-files:
  created:
    - el-templo-bot/test/pb2-pb5-isolation.test.ts
  modified:
    - el-templo-bot/src/playbooks/advance.ts
    - el-templo-bot/test/playbook-advance.test.ts
decisions:
  - "PB2.E2 → PB2.E3 trigger broadened from priceObjection to discoveryAnswered. Plan 84-01 enriched PB2.E2 with FOUR objection branches (precio, tiempo, identidad/miedo, difusa); the narrow priceObjection-only trigger would have stranded 3/4 branches on PB2.E2 forever. priceObjection field stays on AdvanceSignals for backward-compat with handler.ts but no longer gates this transition."
  - "PB5.E2 → PB5.E3 only advances on userAccepted (engine-level conservative). The refusal path is owned by Mica's reasoning + the prompt rule in PB5.E3, not by a dedicated 'refused' signal that doesn't exist in v5.3 AdvanceSignals."
  - "PB4.E2 is engine-terminal in v5.3. Escalation from PB4 (severe injury, service complaint, etc.) is owned by the existing handler humanTakeoverTriggered path that fires on the request_human tool invocation — there's nothing to advance to."
  - "Signature phrase choices (final, after pre-flight iteration): PB1 = 'Idealmente 2-3 preguntas' (NOT 'REGLA FUERTE' which collides with PB4/PB5); PB2 = ['check-in post-prueba', '¿Cómo te sentís después de la clase'] (both verbatim in PB2.E1A entry stage); PB3 = 'Se te viene la renovación' (verbatim in PB3.E1A, NOT 'Ancla de Upgrade' which is PB3.E2 and would never appear in entry-stage rendering); PB4 = 'No es reclamo eh' (verbatim in PB4.E1A); PB5 = ['sin resistencia', 'NO retengas con urgencia'] (verbatim in PB5.E1 — case-sensitive uppercase NO matters)."
  - "Pre-flight test caught one signature collision at runtime: initial draft used 'no retengas con urgencia' (lowercase), actual content has 'NO retengas con urgencia' (uppercase). Fixed in-place; the pre-flight describe block paid for itself on the first run."
  - "Base-prompt escalation phrase verified at system-prompt.ts line 94 (canonical: 'Te paso con alguien del equipo, te escriben enseguida 🙌'). Asserted against the no-playbook render so any future edit to that line breaks the test."
  - "TEAM-CORR-04 dual-guard uses direct PLAYBOOKS.PBx.stages.find() access for PB4.E2 and PB5.E2 because those are NOT entry stages — getSystemPrompt cross-state matrix renders entry stages only, so it can't reach E2 content. Direct definition access closes the gap."
  - "advance.ts purity invariant preserved: zero new imports, zero IO/Redis/logger/Date/console references after the edits. Verified via grep."
  - "handler.ts and system-prompt.ts UNTOUCHED across the entire phase (84-01, 84-02, AND 84-03). Empty diff against 4854f30f baseline for both files plus el-templo-api/drizzle, el-templo-bot/src/scheduler, and el-templo-admin."
metrics:
  tasks_completed: 3
  files_modified: 2
  files_created: 1
  duration: ~15min
  completed_date: 2026-04-08
requirements_closed: [PBPR-05]
---

# Phase 84 Plan 03: Advance Transitions + Cross-State Isolation Regression Summary

Wired stage advancement transitions for PB3, PB4, and PB5 in the pure `advance.ts` helper, refined the PB2.E2 → PB2.E3 trigger so that all four objection branches from plan 84-01 advance correctly, and shipped a cross-state regression test suite that proves each playbook's distinctive content stays isolated to its own active state — closing PBPR-05 (objection-handling scripts only appear when that playbook is active).

## What Changed

### `advance.ts` — stage transitions

- **PB2.E2 → PB2.E3 trigger refined.** Was: `signals.priceObjection === true` (the v5.2 narrow path). Now: `signals.discoveryAnswered === true` (any substantive reply after objection handling). Plan 84-01 enriched PB2.E2 with four branches (precio, tiempo, identidad/miedo, difusa); conditioning on `priceObjection` alone would have stranded 3/4 branches forever. The `priceObjection` field stays on `AdvanceSignals` for backward compatibility with `handler.ts` and any test that still passes it — it just no longer gates this transition.

- **PB3 transitions added.**
  - `PB3.E1A | PB3.E1B + discoveryAnswered → PB3.E2` (warm reminder to upgrade anchor on user reply)
  - `PB3.E2 + userAccepted → PB3.E3` (upgrade anchor to facilitar pago on explicit accept)

- **PB4 transitions added.**
  - `PB4.E1A | PB4.E1B + discoveryAnswered → PB4.E2` (empathetic check-in to listen+solution on user reply)
  - PB4.E2 is engine-terminal in v5.3 — escalation (when triggered) is owned by the existing `humanTakeoverTriggered` handler path that fires on `request_human` tool invocation.

- **PB5 transitions added.**
  - `PB5.E1 + discoveryAnswered → PB5.E2` (sin-resistencia listen to motivo-resolution on user reply)
  - `PB5.E2 + userAccepted → PB5.E3` (alternative-resolution to baja/escalate on explicit accept)
  - The refusal path is intentionally NOT signal-gated — it's owned by Mica's reasoning + the prompt rule inside `PB5.E3` plus the visible-handoff safety net from plan 84-02.

- **Top-of-file docblock updated** to document phase 84-03 transitions and the PB2.E2 trigger refinement.

- **Purity invariant preserved.** Zero new imports. `grep -cE "console\.|Date\."` → 0. `grep -cE "import.*redis|import.*logger|import.*webhook"` → 0.

### `playbook-advance.test.ts` — unit tests

- **PB2.E2 test block updated** to reflect the broadened trigger:
  - `PB2.E2 + discoveryAnswered → PB2.E3` (new positive case)
  - `PB2.E2 + priceObjection ALONE → null` (regression: priceObjection no longer gates advance)
  - `PB2.E2 + priceObjection AND discoveryAnswered → PB2.E3` (discoveryAnswered carries it)
  - `PB2.E2 + no signals → null`
  - `PB2.E3 + any signals → null` (terminal)

- **`describe("PB3 transitions (phase 84)", ...)`** — 7 tests including E1A/E1B → E2, E2 → E3, hold-on-no-signal cases, terminal E3, and a purity-mutation guard.

- **`describe("PB4 transitions (phase 84)", ...)`** — 4 tests including E1A/E1B → E2, hold-on-no-signal, and terminal E2 (any signals → null).

- **`describe("PB5 transitions (phase 84)", ...)`** — 6 tests including E1 → E2, E2 → E3 on userAccepted, conservative-hold on discoveryAnswered alone, terminal E3, and a purity-mutation guard.

- **PB1 tests untouched.** The phase-83 PB1 describe blocks and refinement tests are byte-identical to pre-plan state.

- **Final count:** `pnpm test playbook-advance` → **52 / 52 passing** (was 35 before this plan).

### `pb2-pb5-isolation.test.ts` (NEW) — PBPR-05 regression suite

Closes PBPR-05 by asserting each playbook's distinctive content only appears in the rendered system prompt when that playbook is active. Three groups of assertions plus scope guards:

- **Pre-flight signature audit (5 tests).** For each PB, render its entry-stage prompt via `getSystemPrompt({activePlaybook, currentStage: entryStageId})` and assert every `SIGNATURE_PHRASES[id]` entry is verbatim present. This catches the "signature points to a non-entry stage" bug at authoring time. (It already paid for itself on the first run — caught the lowercase/uppercase mismatch in the PB5 phrase.)

- **Cross-state isolation matrix (25 tests = 5×5).** For each `(activeId, otherId)` pair, render the active prompt and assert NO `SIGNATURE_PHRASES[otherId]` entry appears as a substring. Each active block also reasserts that its own signatures are present (the 5 "contains its own signature phrases" tests).

- **Escalation reuse (3 tests, PBPR-06).** PB4.E2 and PB5.E3 rendered prompts both contain `request_human`. The base prompt (no playbook) rendered with `getSystemPrompt({})` contains the canonical handoff phrase `"Te paso con alguien del equipo, te escriben enseguida"` (verified at `system-prompt.ts:94`).

- **v5.3 scope guards (5 tests).**
  - No playbook prompt mentions `CREATE TABLE | ALTER TABLE | drizzle | migration`.
  - PB2 stages contain zero `grupo nuevo | arranca un grupo | cohorte` (TEAM-CORR-06).
  - **PB4.E2 names Foundation, Foundation+, Performance, Flex (TEAM-CORR-04)** — direct PLAYBOOKS access because PB4.E2 is not an entry stage.
  - **PB5.E2 names Foundation, Foundation+, Performance, Flex (TEAM-CORR-04)** — direct PLAYBOOKS access for the same reason. The dual guard catches any future edit that drops the plan-conditional pause from one of the two stages.
  - No banned skill names (`muscle up | front lever | planche | handstand | pistol squat`) anywhere in any PB stage.

- **Total isolation file: 38 tests.**

## Verification

- `cd el-templo-bot && pnpm tsc --noEmit` — exit 0
- `cd el-templo-bot && pnpm test playbook-advance` — **52 / 52 passing**
- `cd el-templo-bot && pnpm test pb2-pb5-isolation` — **38 / 38 passing**
- `cd el-templo-bot && pnpm test` — **353 / 353 passing** (16 test files; baseline 299 + 54 new tests across the two suites)
- `grep -c 'playbookId === "PB3"\|playbookId === "PB4"\|playbookId === "PB5"' el-templo-bot/src/playbooks/advance.ts` — **3**
- `grep -cE "console\.|Date\." el-templo-bot/src/playbooks/advance.ts` — **0**
- `grep -cE "import.*redis|import.*logger|import.*webhook" el-templo-bot/src/playbooks/advance.ts` — **0**
- `git diff 4854f30f..HEAD -- el-templo-api/drizzle el-templo-bot/src/scheduler el-templo-admin` — **empty** (zero migrations, zero scheduler changes, zero admin changes across all of phase 84)
- `grep -rn "CREATE TABLE\|ALTER TABLE" el-templo-bot/src/playbooks/` — **0 matches**
- `git diff 4854f30f..HEAD -- el-templo-bot/src/webhook/handler.ts el-templo-bot/src/ai/system-prompt.ts` — **empty** (handler + system-prompt untouched across the entire phase)

## Requirements Closed

| ID      | Description                                                                                                              | Evidence                                                                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PBPR-05 | Cross-state regression test proves each playbook's objection scripts are absent from prompts rendered for other 4 states | `pb2-pb5-isolation.test.ts` 5×5 matrix passes; pre-flight audit catches mis-located signatures at authoring time; scope guards include TEAM-CORR-04 dual-guard |

## Deviations from Plan

**1. [Rule 1 — Bug] PB5 signature phrase case mismatch caught by pre-flight**

- **Found during:** Task 3 first test run
- **Issue:** Initial draft used `"no retengas con urgencia"` (lowercase `no`) as a PB5 signature. Actual content in PB5.E1 promptSection is `"NO retengas con urgencia"` (uppercase `NO`). `expect(prompt).toContain(...)` is case-sensitive, so the pre-flight failed for `when PB5 is active → contains its own signature phrases`.
- **Fix:** Updated `SIGNATURE_PHRASES.PB5` to use the verbatim uppercase `"NO retengas con urgencia"`. The pre-flight describe block (whose entire purpose is to catch this class of bug at authoring time) flagged it on the first run — exactly what it was designed to do.
- **Files modified:** `el-templo-bot/test/pb2-pb5-isolation.test.ts` (folded into the same Task 3 commit)
- **Commit:** `de06e548`

**2. [Plan-spec gap — already covered] PB2 signature choice substituted**

- **Found during:** Task 3 authoring
- **Issue:** The plan body suggested `"Objeción precio"` as the PB2 signature, but `"Objeción precio"` lives in PB2.E2 (NOT the entry stage). The pre-flight test renders the entry stage PB2.E1A, so the plan-suggested phrase would have failed pre-flight.
- **Fix:** Selected two phrases verbatim from PB2.E1A instead: `"check-in post-prueba"` and `"¿Cómo te sentís después de la clase"`. Both are unique to PB2 (verified via grep across `definitions.ts` and `src/`), both verbatim in the entry stage, neither a substring of the base prompt or business knowledge block. The plan body explicitly anticipated this iteration ("iterate phrase choices until all isolation assertions pass").
- **Files modified:** `el-templo-bot/test/pb2-pb5-isolation.test.ts`
- **Commit:** `de06e548`
- **Scope note:** The plan listed this as in-scope iteration work, so this is a substitution-during-authoring rather than a Rule deviation — documented for traceability.

## Test Count Delta

| File                        | Before | After | Delta                                                                  |
| --------------------------- | ------ | ----- | ---------------------------------------------------------------------- |
| `playbook-advance.test.ts`  | 35     | 52    | +17                                                                    |
| `pb2-pb5-isolation.test.ts` | (new)  | 38    | +38                                                                    |
| **All bot tests**           | 299    | 353   | **+54** (with 1 net loss from removed PB2.E2-only-priceObjection test) |

Test files: 15 → 16 (+1).

## Commits

- `528a5266` — feat(84-03): wire PB3/PB4/PB5 transitions + refine PB2.E2 trigger
- `de06e548` — test(84-03): cross-state PB1-PB5 isolation regression suite (PBPR-05)

## Self-Check: PASSED

- FOUND: el-templo-bot/src/playbooks/advance.ts (modified, committed in 528a5266)
- FOUND: el-templo-bot/test/playbook-advance.test.ts (modified, committed in 528a5266)
- FOUND: el-templo-bot/test/pb2-pb5-isolation.test.ts (created, committed in de06e548)
- FOUND: commit 528a5266 (advance.ts + playbook-advance.test.ts)
- FOUND: commit de06e548 (pb2-pb5-isolation.test.ts)
- FOUND: .planning/phases/84-state-adaptive-playbook-prompts/84-03-SUMMARY.md (this file)
- Purity grep: 0 IO/Redis/Date/console references in advance.ts
- Scope-guard diff: empty for drizzle/scheduler/admin/handler.ts/system-prompt.ts vs 4854f30f
- `pnpm test`: 353/353 green
