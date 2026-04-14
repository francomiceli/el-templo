---
phase: 89-knowledge-fixes
plan: 01
subsystem: el-templo-bot/ai
tags: [knowledge, prompt, discovery, pb1, kfix]
requires: []
provides:
  - PB1 lead prompt free of membership plan prices during discovery
  - Metodo (elevator) renders first on method questions
  - Canonical Boarding Pass names BOTH benefits (trial gratis + precios Zero)
  - Universal price-deferral framing rule in system prompt
affects:
  - el-templo-bot/src/ai/knowledge.ts
  - el-templo-bot/src/ai/system-prompt.ts
  - el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt
  - el-templo-bot/test/knowledge-gating.test.ts
  - el-templo-bot/test/conversation-flows.test.ts
tech-stack:
  added: []
  patterns:
    - "Discovery tag reduction (structural gating over prompt rules)"
    - "Canonical knowledge consolidation with dual-benefit enumeration"
    - "Defense-in-depth framing — universal rule + structural fix"
key-files:
  created:
    - .planning/phases/89-knowledge-fixes/89-01-DRAFT-WORDINGS.md
    - .planning/phases/89-knowledge-fixes/89-01-SUMMARY.md
  modified:
    - el-templo-bot/src/ai/knowledge.ts
    - el-templo-bot/src/ai/system-prompt.ts
    - el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt
    - el-templo-bot/test/knowledge-gating.test.ts
    - el-templo-bot/test/conversation-flows.test.ts
decisions:
  - "Option A test alignment: update 5 existing assertions in-place (not author new tests). Same pattern as v5.3.1 AVAT-03 alignment — string anchors moved as a direct consequence of KFIX-01/04, not new coverage. Phase 92 remains the authoring target for new behavioral locks (KFIX-02/03/04)."
  - "Accept 625-char KGATE-05 headroom (not trimming further). Phase 91 worst-case estimated at ~400 chars; buffer is sufficient. Previous headroom was 58 chars at end of v5.3.1; 625 is ~11x larger."
  - "Widen /congelamiento/i regex in AVAT-03 to /congela(miento|r)/i rather than trimming SALES_TECHNIQUES. The upsell narrative ('congelar precio') survives KFIX-01 untagging via SALES_TECHNIQUES (discovery-tagged); the concept still reaches PB1 leads, only the exact noun differs."
metrics:
  duration: 45min
  completed: "2026-04-14"
---

# Phase 89 Plan 01: Knowledge Fixes (v5.3.2 KFIX-01/02/03/04) Summary

Four structural knowledge fixes (tag removal, elevator reposition + restore, canonical Boarding Pass rewrite) plus a universal price-deferral framing rule, delivered as a single atomic commit per v5.3.1 update discipline. The PB1 lead render is now structurally incapable of leaking membership plan prices during discovery, with 625 chars of KGATE-05 headroom banked for downstream phases.

## Final Approved Wordings

### ELEVATOR_TEXT (Draft A — Option 1, 136 chars)

Applied at `el-templo-bot/src/ai/knowledge.ts:446`:

> Tenemos un método internacional de calistenia con cuatro niveles simultáneos en cada clase — progresás a tu ritmo sin salirte del grupo.

- Three team hooks preserved: "método internacional" / "cuatro niveles simultáneos" / "sin salirte del grupo"
- Tuteo: progresás, salirte
- Team voice opener ("Tenemos un método…") + warmth ("a tu ritmo")

### Canonical Boarding Pass (Draft B, in ZERO_RULES)

Applied at `el-templo-bot/src/ai/knowledge.ts:162` (first numbered item of ZERO_RULES):

> _Boarding Pass (primer contacto con El Templo):_ El Boarding Pass es un pase digital único que recibís al contactarte por primera vez con El Templo. Tiene dos beneficios: (1) la clase de prueba 100% bonificada, y (2) precios Zero en la primera membresía que contrates. Es un beneficio único (una sola vez).

- Both benefits named explicitly, numbered (1)-(2)
- Tuteo: recibís, contactarte, contrates
- Unique opener fragment "primer contacto con El Templo" (replaces pre-89 "primer mes en El Templo")

### Price-deferral framing rule (Draft C)

Applied at `el-templo-bot/src/ai/system-prompt.ts:188` (inside _Reglas de conversacion_, appended after the line-187 "tengo dudas reales" rule):

> - Nunca inventes precios de membresías. Si el lead pregunta por precios durante discovery, respondé con el defer pattern de la stage actual y re-anclá la prueba gratuita. Si no estás seguro de un precio, NO lo menciones — solo ofrecé la clase de prueba como próximo paso.

- Universal (applies to all ClientStates)
- Complements KFIX-01 structural fix (defense-in-depth)
- Tuteo throughout

## Measurements

| Metric                         | Before       | After        | Δ      |
| ------------------------------ | ------------ | ------------ | ------ |
| Rendered PB1.E1A lead snap.txt | 19,052 chars | 18,291 chars | −761   |
| KGATE-05 threshold             | 18,916       | 18,916       | —      |
| Headroom vs KGATE-05           | −136 (over!) | **+625**     | +761   |
| ELEVATOR_TEXT body             | 95 chars     | 136 chars    | +41    |
| Canonical BP paragraph         | prior body   | dual-benefit | +delta |
| "Nunca inventes precios" rule  | absent       | present      | +271   |

**Note on "before" baseline:** The snap.txt "before" value (19,052) is the post-approval state captured at the start of Task 3 in the _prior_ continuation agent (after source edits were applied but before the snapshot was regenerated — see CHECKPOINT context). The plan's `must_haves` baseline of 18,858 referenced the post-88-02 state pre-KFIX-01; the intermediate divergence reflects the new framing rule (+271) and the BP canonical rewrite landing before the snapshot was regenerated.

**Banked headroom for phases 90-92:** 625 chars. Phase 91 worst-case estimated at ~400 chars. Buffer is sufficient.

## Observable Truths Status

All nine truths from plan `must_haves.truths` verified:

- [x] PB1.E1A lead rendered prompt contains zero membership plan price numbers (Flex $80k / Foundation $100k / Foundation+ / Performance $250k) — grep returns 0.
- [x] Trial class nominal price $20,000 still appears in lead render (2 hits: TRIAL_FLOW + Clase de Prueba).
- [x] "Planes y Precios" section heading absent from lead render — grep returns 0.
- [x] Metodo (elevator) section appears BEFORE "Que es El Templo" in lead render (line 88 vs line 92 in snap.txt).
- [x] ELEVATOR_TEXT contains all three hooks: "método internacional" / "cuatro niveles simultáneos" / "sin salirte del grupo".
- [x] Canonical Boarding Pass names BOTH benefits (clase de prueba 100% bonificada + precios Zero en primera membresía).
- [x] system-prompt.ts _Reglas de conversacion_ contains "Nunca inventes precios" price-deferral rule.
- [x] Rendered lead < 18,916 (is 18,291, headroom 625).
- [x] Snapshot fixture regenerated and committed atomically with source change.
- [x] All 537 bot tests green after regeneration (5 test-alignment updates applied, see Deviations).

## Test Alignment (Deviation from test-freeze rule, user-approved)

The plan's test-freeze rule (guardrail in Task 3 `<action>`: "DO NOT edit test/knowledge-gating.test.ts or any other test file besides the regenerated snapshot fixture") was modified by user approval after Task 3 revealed 5 pre-existing assertions had hardcoded string anchors that KFIX-01/04 removed. The pattern mirrors v5.3.1 Phase 86-02 AVAT-03 alignment — these are maintenance updates, not new coverage. Phase 92 remains the authoring target for NEW behavioral locks (KFIX-02/03/04 byte-equal snapshot, plan-prices absence, BP dual-benefit presence).

### Five alignment updates

1. **BPASS-01/02/03** (`test/knowledge-gating.test.ts:134`) — `CANONICAL_OPENER` changed from `"primer mes en El Templo"` to `"primer contacto con El Templo"`. The KFIX-04 rewrite replaced the "primer mes en El Templo" fragment with "primer contacto con El Templo" (present both in the paragraph title and body "al contactarte por primera vez con El Templo"). Unique sentinel preserved.

2. **BPASS-02 re-explanation fragments** (`test/knowledge-gating.test.ts:187`) — `reexplanationFragments[0]` updated from `"primer mes en El Templo"` to `"primer contacto con El Templo"`. Logic unchanged: the sentinel is skipped inside the canonical paragraph and flagged anywhere else. Currently only appears inside the canonical paragraph (confirmed by grep), so the outer-loop assertion passes.

3. **KGATE-02 lead discovery anchor** (`test/knowledge-gating.test.ts:22`) — replaced `expect(lead).toContain("Planes Flex")` with `expect(lead).toContain("método internacional")`. "Planes Flex" lived in Planes y Precios (no longer discovery-tagged). Replacement anchor is the first ELEVATOR_TEXT hook — KFIX-03 put it at SECTIONS[0] so it is invariant for lead renders.

4. **AVAT-03 anchor replacement** (`test/conversation-flows.test.ts:168`) — replaced `expect(leadPrompt).toContain("Hasta 6 por semana")` with `expect(leadPrompt).toContain("método internacional")`. Same rationale as #3 — the old anchor lived in Planes y Precios.

5. **AVAT-03 congelamiento widening** (`test/conversation-flows.test.ts:178`) — widened `/congelamiento/i` to `/congela(miento|r)/i`. The exact noun "congelamiento" lived in Planes y Precios / Mejora de plan. The concept still reaches PB1 leads via SALES_TECHNIQUES ("congelar precio" at line 178 of the snap, and "congelar precio frente a aumentos" at line 190). Widening the regex to match both forms preserves the underlying price-lock assertion without adding new coverage.

All five updates carry inline `[KFIX-0X alignment, v5.3.2 Phase 89]` comments documenting the rationale and the structural cause (so future readers don't "restore" pre-89 expectations).

## Deviations from Plan

- **Test-freeze rule relaxed (user-approved, Option A).** Plan Task 3 forbade test edits; user approved updating 5 hardcoded string anchors in-place when the post-edit suite showed they had become structurally orphaned (not new behavioral assertions). Mirrors v5.3.1 AVAT-03 alignment precedent (see phase 86-02).
- **Headroom accepted at 625 chars, not 1,000+.** Plan success criterion said "≥ 1,000 chars banked". User decided 625 is sufficient given Phase 91 worst-case estimate of ~400 chars, and declined further trimming (which would risk further test realignment).
- **One extra test update beyond the originally-itemized five.** The user listed 5 failing tests; after fixing the first batch, the `/congelamiento/i` regex surfaced as a second alignment within the same AVAT-03 test case (same test name, same structural cause — KFIX-01 untagging). Counted as part of the AVAT-03 realignment and documented above.

## Phase 92 Handoff Notes

Phase 92 is the regression-lock authoring phase. The following Phase 89 source state should be locked by new assertions in Phase 92:

- **KFIX-01:** Assert `grep -cE '\$80[.,]000|\$100[.,]000|\$250[.,]000'` against the rendered PB1 lead prompt is exactly 0 (no plan prices).
- **KFIX-02:** Assert `\$20[.,]000` (trial class) is ≥ 1 in the rendered PB1 lead prompt.
- **KFIX-03:** Assert SECTIONS[0] name is "Metodo (elevator)" (module-private; lock via rendered-order assertion: `Metodo (elevator)` heading appears at a smaller byte offset than `Que es El Templo` in the rendered PB1 lead prompt). Assert ELEVATOR_TEXT length ≥ 120 chars and contains all three hooks.
- **KFIX-04:** Assert the canonical BP paragraph in ZERO_RULES names both benefits (literal match on both "100% bonificada" and "precios Zero en la primera membresía"). Assert "dos beneficios:" appears exactly once.
- **Price-deferral rule:** Assert "Nunca inventes precios" appears in the rendered prompt for every ClientState (universal framing, not state-gated).
- **Snapshot byte-equal lock:** After Phase 91 lands its objection-handling edits, regenerate `pb1-e1a-lead-rendered.snap.txt` once more and lock byte-equal as the final v5.3.2 source of truth.

## Phase 90 Handoff Notes

Banked headroom: **625 chars** for stage-heuristic inline comments, completionCriteria expansions, or any STAGE-01/02 cost. If Phase 90 exceeds this, either (a) further trim ELEVATOR_TEXT toward the ~131-char target (currently 136), or (b) trim one of the non-essential SALES_TECHNIQUES bullets.

## Commits

- `8575095c` — feat(bot): knowledge fixes for v5.3.2 live-test findings (89-01)
  - Atomic commit per v5.3.1 update discipline: all source edits + snapshot regeneration + test alignments in a single commit.

## Self-Check: PASSED

- [x] FOUND: el-templo-bot/src/ai/knowledge.ts (modified, committed)
- [x] FOUND: el-templo-bot/src/ai/system-prompt.ts (modified, committed)
- [x] FOUND: el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt (regenerated, committed)
- [x] FOUND: el-templo-bot/test/knowledge-gating.test.ts (aligned, committed)
- [x] FOUND: el-templo-bot/test/conversation-flows.test.ts (aligned, committed)
- [x] FOUND: commit 8575095c in git log
- [x] FOUND: 537/537 bot tests passing
- [x] FOUND: pnpm tsc --noEmit exit 0
