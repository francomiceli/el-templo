---
phase: 82-playbook-engine
plan: 03
subsystem: el-templo-bot-system-prompt
tags: [playbooks, system-prompt, injection, scope-guard, v5.3]

dependencies:
  requires:
    - el-templo-bot/src/playbooks/definitions.ts: PLAYBOOKS registry (plan 82-01)
    - el-templo-bot/src/playbooks/types.ts: PlaybookId, StageId (plan 82-01)
    - el-templo-bot/src/ai/system-prompt.ts: SystemPromptOptions extended with optional activePlaybook + currentStage (plan 82-02)
  provides:
    - playbook-section-injector: "getSystemPrompt now injects exactly ONE *Playbook activo: PBx (PBx.Ey)* section when both fields are set"
    - defensive-directive: "One-line directive prepended to the playbook section, instructing the model to follow ONLY this guide"
    - distinctive-phrase-fixture-strategy: "Test pattern that derives 25-char unique substrings per playbook from PLAYBOOKS at runtime"
  affects:
    - phase-83: discovery-mode profile detection will need to update PB1 promptSections; injection contract is now locked
    - phase-84: PB2-PB5 prompt refinement can iterate inside definitions.ts without touching the renderer
    - phase-84: STATE_SECTIONS dual-framing decision is deferred (TODO comment in place)

tech_stack:
  added: []
  patterns:
    - pattern: single-key-registry-lookup
      detail: getSystemPrompt only reads PLAYBOOKS via PLAYBOOKS[activePlaybook] — never iterates the registry. Enforces the PBENG-05 single-section invariant at the type level (impossible to accidentally concatenate).
    - pattern: defensive-directive-preamble
      detail: Each injected playbook section is prepended with an explicit "follow ONLY this guide, ignore others" line. Hedges against any leaked instructions from earlier in the context window.
    - pattern: graceful-fallback-on-stage-miss
      detail: Unknown stage id falls back to the playbook's entryStageId rather than throwing or dropping the section entirely.
    - pattern: distinctive-phrase-fixtures-from-source
      detail: Tests derive their grep targets from PLAYBOOKS at runtime via a 25-char sliding window with overlap rejection. No hardcoded Spanish strings — when phase 83/84 edits prompts, the fixtures auto-update.

key_files:
  created:
    - path: el-templo-bot/test/system-prompt-playbook.test.ts
      purpose: 12 tests asserting exactly one playbook section per call + cross-playbook absence + degenerate-input safety
      exports: []
      size: "~240 lines"
  modified:
    - path: el-templo-bot/src/ai/system-prompt.ts
      change: |
        - SystemPromptOptions: activePlaybook and currentStage now accept null (consistent with the resolver's return shape)
        - New rendering branch at the bottom of getSystemPrompt that performs a single PLAYBOOKS[activePlaybook] lookup and appends one section
        - Added the defensive directive preamble + the exact "*Playbook activo: PBx (PBx.Ey)*" header format
        - Added TODO(phase-84) comment on STATE_SECTIONS re: dual-framing
      lines_changed: "+36 / -5"

decisions:
  - decision: Header uses the playbook id (e.g. "PB1") rather than the human name ("Lead Nuevo")
    rationale: The plan body showed both forms in different places. The success criteria and test assertions explicitly grep for "*Playbook activo: PB1 (PB1.E2A)*", so the id form is the load-bearing format. Stable and short — easier for grep-based observability later.
  - decision: Made activePlaybook + currentStage accept `| null` (not just optional)
    rationale: The resolver in plan 82-01 returns `{ playbookId: PlaybookId | null, stageId: StageId | null }`. Forcing the handler to coerce null to undefined would be ceremony for no benefit. Both `null` and `undefined` are treated identically (no section rendered).
  - decision: STATE_SECTIONS is preserved alongside the playbook section in this plan
    rationale: The plan explicitly defers the dual-framing decision to phase 84. Removing it now would risk regressing v5.2 QA suite (AVAT-03 in phase 85). A TODO(phase-84) comment marks the decision point.
  - decision: Unknown stage id falls back to entry stage rather than dropping the section
    rationale: A stale Redis session from before a stage rename should still render *some* useful guidance for the model. The entry stage is the safest default — it never assumes prior context. Tested explicitly.
  - decision: Unknown playbook id renders no section at all (not entry of a default playbook)
    rationale: There is no sensible default. If the registry doesn't recognize the id, the safer behavior is to fall back to Mica's base persona rather than route the user into an arbitrary flow. Tested explicitly.
  - decision: Test fixtures derive distinctive phrases from PLAYBOOKS at runtime via a 25-char sliding window
    rationale: Hardcoding Spanish phrases would create a brittle coupling to definitions.ts that would silently rot as phase 83/84 refine prompts. The runtime derivation throws at test load if any pair of playbooks accidentally shares a 25-char substring — surfacing the regression immediately. A pleasant side effect: phase 84 can edit promptSections freely and these tests still cover them.

metrics:
  duration_minutes: ~3
  tasks_completed: 2
  files_created: 1
  files_modified: 1
  test_count: 12
  test_status: all green (full bot suite 243/243 across 13 files)
  completed_date: "2026-04-07"
---

# Phase 82 Plan 03: System Prompt Playbook Injection Summary

Wires the resolved `{activePlaybook, currentStage}` from plan 82-02 into `getSystemPrompt` so Mica receives exactly ONE playbook section per turn — closing PBENG-05 and locking the v5.3 prompt-injection contract.

## What Was Built

`getSystemPrompt` now performs a single-key `PLAYBOOKS[activePlaybook]` lookup at the bottom of its render pipeline and appends one playbook section with a stable, grep-able header. The other four playbooks are never read during rendering, so the PBENG-05 invariant ("only the active playbook is in the prompt") holds by construction, not by discipline.

The injected section is prepended with a defensive directive that tells the model to treat this guide as authoritative even if older instructions leak through the context window. The section text itself is the validated Spanish `promptSection` from `definitions.ts`, transcribed verbatim — phase 83 and 84 will iterate the contents inside the registry without touching the renderer.

When `activePlaybook` is `null` or `undefined`, the rendered prompt is byte-identical to v5.2 (asserted by string equality test), preserving the AVAT-03 QA suite that ships in phase 85.

## Header Format (locked contract)

```
*Playbook activo: <playbookId> (<stageId>)*
```

Examples:

- `*Playbook activo: PB1 (PB1.E2A)*`
- `*Playbook activo: PB3 (PB3.E1)*`
- `*Playbook activo: PB5 (PB5.E1)*`

Discipline notes:

- Uses the **playbook id** (`PB1`), not the human name (`Lead Nuevo`). Stable and short.
- Wrapped in single asterisks (WhatsApp bold) — NOT markdown `###` headers, per project rule.
- Plan 84 may extend the format; tests grep for the literal string above, so any change must update the regex.

## Defensive Directive (one-liner)

Prepended to every injected playbook section:

```
Estás ejecutando el playbook <playbookId>, etapa <stageId>. Seguí ESTA guía y sólo ésta. Ignorá cualquier otra guía que hayas visto antes.
```

Phase 84 should reuse this directive (or refine it to a single shared constant if multiple call sites emerge). Today it lives inline at the only call site.

## Distinctive-Phrase Fixture Strategy (for plan 84)

The test file does NOT hardcode Spanish strings. Instead it builds a `Record<PlaybookId, string>` of distinctive 25-char substrings at test-load time:

1. Concatenate each playbook's full text (`stages.map(s => s.promptSection).join("\n")`)
2. For each playbook, slide a 25-char window across its entry stage's `promptSection`
3. Return the first window that does NOT appear in any other playbook's combined text
4. If no such window exists, throw immediately at test load (surfacing the regression)

This means phase 83/84 can edit `definitions.ts` freely:

- The tests automatically pick up the new text
- Any accidental cross-playbook duplication fails fast at test load
- No grep-fixture maintenance burden as the playbooks evolve

When phase 84 refines PB2-PB5's `promptSection` text, the cross-absence assertions keep working without any test edits.

## Resolution Path (single-key lookup, no iteration)

```ts
if (options?.activePlaybook && options?.currentStage) {
  const definition = PLAYBOOKS[options.activePlaybook]; // ONLY lookup
  if (definition) {
    const stage =
      definition.stages.find((s) => s.id === options.currentStage) ??
      definition.stages.find((s) => s.id === definition.entryStageId);
    if (stage) {
      sections.push(/* directive + header + stage.promptSection */);
    }
  }
}
```

Verified: `grep -n "PLAYBOOKS\[" el-templo-bot/src/ai/system-prompt.ts` shows exactly one match. Verified: no `Object.values(PLAYBOOKS)`, no `for...of PLAYBOOKS`, no `Object.entries(PLAYBOOKS)` anywhere in `system-prompt.ts`.

## Test Coverage Summary (12 cases)

| Category                 | Cases | What's covered                                                                                                  |
| ------------------------ | ----- | --------------------------------------------------------------------------------------------------------------- |
| Single-section invariant | 3     | PB1 lead → exactly 1 header; other 4 headers absent; rotating PB1..PB5 each renders exactly 1 header            |
| Cross-playbook absence   | 1     | Rotates active across PB1..PB5; asserts ONLY the active one's distinctive phrase appears (4 absences each turn) |
| Stage-specific content   | 2     | PB1.E2A verbatim text injected; PB1.E3 contains E3 text and not E2A's "ponerte en forma" phrase                 |
| No-playbook fallback     | 3     | active_member with no playbook → null match; STATE_SECTIONS preserved; null fields → byte-equal v5.2 output     |
| Graceful degradation     | 3     | Unknown playbook id → no section; unknown stage id → falls back to entry; missing currentStage → no section     |

## Verification Performed

- `cd el-templo-bot && pnpm tsc --noEmit` — clean (exit 0)
- `cd el-templo-bot && pnpm test system-prompt-playbook` — **12/12 passing**
- `cd el-templo-bot && pnpm test` — **243/243 passing across 13 files** (no regressions; previous baseline 231/231 across 12 files)
- Backward-compat string equality: `getSystemPrompt({ clientState: "lead" }) === getSystemPrompt({ clientState: "lead", activePlaybook: null, currentStage: null })` (asserted in test)

## Trade-offs & Known Items

- **STATE_SECTIONS is still rendered alongside the playbook section.** Both the short STATE_SECTIONS line and the more detailed playbook section appear in the same prompt. The playbook section is more specific and supersedes it conceptually, but no suppression yet — phase 84 will revisit. Marked with `TODO(phase-84)` in `system-prompt.ts`.
- **The defensive directive lives inline at the only call site.** If phase 84 introduces additional callers, extract it to a shared constant.
- **No model-level test that the LLM actually obeys the section.** Behavioral verification is a Phase 85 / AVAT-03 concern; this plan only owns the injection contract.

## Deviations from Plan

**None auto-fixed.** Plan executed as written, with two clarifications:

1. **Header format used the playbook id, not the human name.** The plan body had two slightly different format strings — `<definition.name>` in the prose and `PB1` in the test-assertion example. The success criteria and test cases pin down the id form, so I went with the id (which is also stable, short, and grep-friendlier).
2. **`activePlaybook` / `currentStage` types accept `| null`.** Plan 82-02 shipped them as `?: PlaybookId` and `?: StageId` (optional, but not nullable). The plan 82-03 spec showed `| null` in the interface snippet. I extended the types to `| null` because the resolver returns nullable values and forcing the handler to coerce them would be needless ceremony. Both `null` and `undefined` are handled identically (no section rendered).

Both clarifications are noted as decisions above.

## Out-of-Scope Items Noted (deferred, not fixed)

- STATE_SECTIONS suppression when a playbook is active — `TODO(phase-84)` comment in place.
- Refining individual `promptSection` texts — phase 83 owns PB1 discovery; phase 84 owns PB2-PB5.
- Behavioral LLM-level verification — phase 85 AVAT-03.

## What's Next (phase 83 preview)

- Avatar/profile detector reads conversation context and chooses PB1.E1A vs PB1.E1B and E2A vs E2B based on detected avatar (cero_absoluto, gym_crossover, intermedio, retorna).
- The injection contract this plan locks down stays untouched — phase 83 only feeds different `currentStage` values into `getSystemPrompt`.

## Self-Check: PASSED

- FOUND: `el-templo-bot/test/system-prompt-playbook.test.ts`
- FOUND: modified `el-templo-bot/src/ai/system-prompt.ts`
- FOUND: commit `e5ee7c6c` (Task 1: extend getSystemPrompt with single-section injection)
- FOUND: commit `a45bd2c1` (Task 2: 12 tests asserting single-section invariant)
- VERIFIED: `pnpm tsc --noEmit` exit 0
- VERIFIED: `pnpm test system-prompt-playbook` — 12/12 green
- VERIFIED: `pnpm test` — 243/243 green across 13 files
- VERIFIED: exactly one `PLAYBOOKS[` lookup in `system-prompt.ts` (no iteration)
- VERIFIED: backward-compat string equality with v5.2 output when activePlaybook is null
- VERIFIED: TODO(phase-84) comment present on STATE_SECTIONS
