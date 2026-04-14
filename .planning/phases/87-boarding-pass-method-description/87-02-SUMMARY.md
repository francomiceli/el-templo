---
phase: 87-boarding-pass-method-description
plan: 02
subsystem: prompt-architecture
tags: [knowledge, method, deflection, system-prompt, whatsapp-bot, prompt-size]

# Dependency graph
requires:
  - phase: 87-01
    provides: "Consolidated Boarding Pass canonical + pointer pattern, 197-char KGATE-05 headroom"
  - phase: 86-knowledge-gating
    provides: "Tagged SECTIONS array with discovery filtering; KGATE-05 regression lock"
provides:
  - "Two new knowledge sections: Metodo (elevator) [discovery] + Metodo (detalle) [full-only]"
  - "Universal method-internals deflection rule in system-prompt.ts framing"
  - "KGATE-05 regression lock still green (rendered PB1.E1A lead = 18,858 ≤ 18,916)"
affects: [87-03, 88-regression-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Behavioral deflection rule in universal framing (system-prompt.ts) vs factual content in knowledge.ts — preserves model visibility of the behavior for ALL client states without bloating the knowledge gate"
    - "Split method content: compressed elevator (discovery-gated) + verbatim long-form (full-only) to preserve team voice while respecting KGATE-05 budget"

key-files:
  created: []
  modified:
    - el-templo-bot/src/ai/knowledge.ts
    - el-templo-bot/src/ai/system-prompt.ts

key-decisions:
  - "Elevator compressed to 95 chars (from initial 131) to fit combined budget after deflection rule was added — preserves all three team hooks (método internacional, cuatro niveles, no salirte del grupo)"
  - "Dropped (ver *Reglas Zero*) pointer suffix at all 6 BP mention sites in discovery-tagged sections (TRIAL_FLOW x2, SALES_TECHNIQUES x2, OBJECTIONS_SALES x2). BP name itself preserved at every site; canonical definition in Reglas Zero untouched"
  - "Deflection rule placed inside *Reglas de conversacion* block (line 194) — reaches all client states, not gated on discovery"
  - "Final deflection wording: Draft C (user-approved). 231 chars; tuteo form, mechanical triggers enumerated, exception for 'qué es el método' protects elevator"
  - "METHOD_DETAIL kept byte-for-byte verbatim from 87-CONTEXT.md pending_content — no trimming, paraphrasing, or reformat at any point"

patterns-established:
  - "When a deflection behaves identically across client states, put it in system-prompt.ts framing (universal) rather than knowledge.ts (gated). Avoids paying lead-prompt token cost for non-lead behavior."
  - "Budget remediation hierarchy when KGATE-05 tight: (1) compress elevator, (2) drop BP pointers in discovery-tagged sections, (3) structural moves — never trim team content"

requirements-completed: [METHOD-01, METHOD-02, METHOD-03, METHOD-04]

# Metrics
duration: 6 min
completed: 2026-04-14
---

# Phase 87 Plan 02: Method Sections + Deflection Rule Summary

**Added team-authored method sections (elevator + verbatim detalle) to knowledge.ts and a universal method-internals deflection rule to system-prompt.ts; KGATE-05 regression lock preserved with 58-char headroom after targeted budget remediation.**

## Performance

- **Duration:** ~6 min (including checkpoint + remediation)
- **Started:** ~2026-04-14T04:50:00Z
- **Completed:** 2026-04-14T04:56:36Z
- **Tasks:** 3 (Task 1 + Task 2 + CHECKPOINT Task 3)
- **Files modified:** 2

## Accomplishments

- `Metodo (elevator)` section inserted at SECTIONS position 2, tagged `['discovery']` — body 95 chars
- `Metodo (detalle)` section inserted at SECTIONS position 3, tagged `[]` — body byte-for-byte verbatim from CONTEXT.md pending_content
- Method-internals deflection rule added to `*Reglas de conversacion*` block in system-prompt.ts (line 194, universal framing — reaches all client states)
- Elevator compressed from 131 to 95 chars after user picked remediation (a)+(b) at Task-3 checkpoint
- 6 `(ver *Reglas Zero*)` pointer suffixes dropped from discovery-tagged sections (TRIAL_FLOW, SALES_TECHNIQUES, OBJECTIONS_SALES) per remediation (b)
- All 514 bot tests green; `tsc --noEmit` clean
- KGATE-05 regression lock passes: rendered PB1.E1A lead = 18,858 chars (≤ 18,916 threshold, 58-char headroom)

## Task Commits

1. **Task 1: Insert Metodo (elevator) + Metodo (detalle) sections** — `d4efc229` (feat)
2. **Remediation (a): Compress elevator to 95 chars** — `8ded0ca1` (refactor)
3. **Remediation (b): Drop BP pointers in discovery-tagged sections** — `6a353270` (refactor)
4. **Task 2: Add method-internals deflection rule to system prompt framing** — `55e394c5` (feat)

## Files Modified

- `el-templo-bot/src/ai/knowledge.ts` — 2 new sections + ELEVATOR_TEXT/METHOD_DETAIL constants + 6 BP pointer removals in discovery-tagged sections; SECTIONS length 14 → 16
- `el-templo-bot/src/ai/system-prompt.ts` — 1 new bullet in `*Reglas de conversacion*` block (line 194)

## Final Elevator Text

```
Método internacional de calistenia, cuatro niveles por clase — progresás sin salirte del grupo.
```

**Length:** 95 chars. Preserves all three CONTEXT.md hooks (método internacional, cuatro niveles, no salirte del grupo) and tuteo (progresás). Rendered in `Metodo (elevator)` section body with the `*Metodo (elevator)*\n\n` title header.

## Final Deflection Rule

**Location:** `el-templo-bot/src/ai/system-prompt.ts` line 194, inside `*Reglas de conversacion*` block (universal framing — rendered for every client state).

```
- Preguntas mecánicas sobre el método (progresiones, bloques, ejercicios, sets, reps): no expliques técnicamente — "lo sentís cuando llegás" y re-anclá la clase de prueba. Excepción: "qué es el método" responde con Metodo (elevator).
```

**Length:** 232 chars (incl. leading `- `). User-approved wording (Draft C). Tuteo preserved: `expliques`, `sentís`, `llegás`, `re-anclá`, `responde`. Trigger list enumerates mechanical question types (progresiones, bloques, ejercicios, sets, reps); explicit exception protects the elevator answer.

**Verification (all true):**

- Rendered PB1.E1A (lead) contains `lo sentís cuando llegás`: ✅
- Rendered PB1.E1A (active_member) contains `lo sentís cuando llegás`: ✅
- Lead rendered contains `Metodo (elevator)`: ✅
- Lead rendered does NOT contain `Metodo (detalle)`: ✅
- Non-lead rendered contains `Metodo (detalle)`: ✅

## Rendered Prompt Size Post-Task

| Metric                         | Pre-87-02 (end of 87-01) | Post-87-02       | Δ                |
| ------------------------------ | ------------------------ | ---------------- | ---------------- |
| PB1.E1A lead                   | 18,626 chars             | **18,858 chars** | +232 chars       |
| PB1.E1A non-lead (full)        | 23,718 chars             | **25,279 chars** | +1,561 chars     |
| KGATE-05 threshold (lead)      | 18,916                   | 18,916           | unchanged        |
| KGATE-05 headroom (lead)       | 290 chars                | **58 chars**     | -232 chars       |
| Knowledge block for lead       | —                        | 8,757 chars      | —                |
| Knowledge block full           | —                        | 15,178 chars     | —                |
| `full * 0.65` floor            | —                        | 9,866 chars      | —                |
| Knowledge-block-for-lead head. | —                        | **1,109 chars**  | well above floor |

**Budget math:** Adding the elevator (~117 chars rendered incl header + separator) + deflection rule (~232 chars) + newlines + method (detalle) on non-lead side explains the lead +232 and non-lead +1,561 deltas. The 58-char residual headroom is the operating margin for future KGATE-05 drift.

## Checkpoint Outcome (Task 3)

Initial measurement post Task 1 + Task 2 first-pass would have exceeded KGATE-05 threshold, so executor HALTED at CHECKPOINT. User selected combined remediation:

- **(a)** Compress ELEVATOR_TEXT from 131 → 95 chars (new body locked via commit `8ded0ca1`).
- **(b)** Drop `(ver *Reglas Zero*)` pointer suffix at all 6 BP sites in discovery-tagged sections (TRIAL_FLOW, SALES_TECHNIQUES, OBJECTIONS_SALES) — commit `6a353270`.

Remediation (c) (move discovery section to full-only) and (d) (rebaseline KGATE-05) were NOT needed. METHOD_DETAIL untouched throughout.

Re-measurement after remediation: rendered PB1.E1A lead = 18,858 ≤ 18,916. `pnpm vitest run test/ai/prompt-size.test.ts` exits 0. PASS.

## Decisions Made

1. **Elevator final body = 95 chars, not the draft 131.** The combined deflection-rule + elevator budget could not fit without compression. User-approved replacement text preserves all three hooks and tuteo. 95 chars is well inside the 200-char plan budget.
2. **All 6 discovery-tagged BP pointers dropped (not just the 2-3 heaviest).** Cleaner than selective removal: keeps BP name at every site (semantics preserved) and removes all redundant rendering cost for leads. Canonical BP definition in Reglas Zero unchanged. No pointers remain anywhere in the file (all 6 previous pointers were in discovery-tagged sections).
3. **Deflection rule placed in `*Reglas de conversacion*` bullet list rather than as a new heading.** Matches the style of adjacent rules ("Si alguien dice…", "Si alguien menciona Alfa…"), reads as conversational guidance, and avoids structural refactor of the framing.
4. **Exception clause kept explicit in the rule text.** "Excepción: 'qué es el método' responde con Metodo (elevator)." prevents the deflection from swallowing legitimate method-existence questions — the elevator IS the correct answer for that prompt.

## Deviations from Plan

### Auto-fixed / Checkpoint-driven

**1. [Checkpoint remediation] Elevator compressed to 95 chars**

- **Found during:** Task 3 checkpoint (pre-remediation rendered size exceeded 18,916)
- **Issue:** First-pass elevator (131 chars) + deflection rule (232 chars) combined pushed rendered PB1.E1A lead above KGATE-05 threshold
- **Fix:** User-selected remediation (a) — new 95-char elevator body
- **Files modified:** `el-templo-bot/src/ai/knowledge.ts`
- **Commit:** `8ded0ca1`

**2. [Checkpoint remediation] Dropped BP pointer suffixes in 6 discovery-tagged sites**

- **Found during:** Task 3 checkpoint (same root cause as above)
- **Issue:** Discovery-tagged BP pointers rendered for leads were consuming headroom the deflection rule needed
- **Fix:** User-selected remediation (b) — suffix removal at 6 sites in TRIAL_FLOW / SALES_TECHNIQUES / OBJECTIONS_SALES. BP name and canonical definition both untouched.
- **Files modified:** `el-templo-bot/src/ai/knowledge.ts`
- **Commit:** `6a353270`

## Issues Encountered

- **KGATE-05 tight headroom after initial Task-1 pass.** Resolved via the two remediations above, each landed as its own refactor commit (clean git history, easy to revert if 87-03 needs more budget). Final headroom is 58 chars — tight but functional. Any future addition to discovery-tagged content or to universal framing will require similar care.
- **No other issues.** Deflection rule insertion was a clean one-line addition; method sections were untouched after Task 1 locked them.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Method content and deflection rule both landed; knowledge.ts ordering is final (16 sections)
- Ready for 87-03 (regression tests for method sections + deflection rule) and 88-regression-tests (full milestone lock-in)
- KGATE-05 headroom for 87-03: **58 chars**. 87-03 is test-only per v5.3.1 plan (zero source changes), so no further budget pressure expected.

## Self-Check: PASSED

- `el-templo-bot/src/ai/knowledge.ts` — exists; contains `Metodo (elevator)` (2 hits: title + body header), `Metodo (detalle)` (2 hits), ELEVATOR_TEXT = 95 chars, METHOD_DETAIL verbatim, zero `(ver *Reglas Zero*)` occurrences
- `el-templo-bot/src/ai/system-prompt.ts` — exists; contains `lo sentís cuando llegás` exactly once (line 194)
- Commit `d4efc229` (Task 1) — present in git log
- Commit `8ded0ca1` (elevator compression) — present in git log
- Commit `6a353270` (BP pointer removal) — present in git log
- Commit `55e394c5` (deflection rule) — present in git log
- Full bot test suite 514/514 passing
- TypeScript typecheck clean (`pnpm tsc --noEmit` exit 0)
- Rendered PB1.E1A lead = 18,858 ≤ 18,916 (KGATE-05 regression lock holds)

---

_Phase: 87-boarding-pass-method-description_
_Completed: 2026-04-14_
