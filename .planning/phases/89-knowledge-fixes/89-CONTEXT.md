# Phase 89: Knowledge Fixes - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Content changes in `el-templo-bot/src/ai/knowledge.ts` (and `system-prompt.ts` for the price-deferral rule) addressing three live-test failures: price leakage during discovery, unused method elevator, and missing Boarding Pass dual-benefit coverage. Covers KFIX-01, KFIX-02, KFIX-03, KFIX-04.

Out of scope: stage heuristic (Phase 90), objection handling (Phase 91), regression lock (Phase 92), any state-machine or playbook structural change.

</domain>

<decisions>
## Implementation Decisions

### KFIX-01: Remove "Planes y Precios" from discovery

- Remove the `'discovery'` tag from SECTIONS[4] (`Planes y Precios`). Section remains in the full set for non-lead states. Untagged.
- No content changes to the section body itself.
- Net effect: frees ~1,700 chars from the lead-rendered prompt. Section no longer injects plan pricing into every PB1 turn, resolving the structural contradiction that caused price leakage under the E2A "no prices during discovery" rule.

### KFIX-02: Zero membership plan prices in lead prompt

- Behavioral assertion (locked in Phase 92) verifies the rendered PB1.E1A lead prompt contains no `$80,000`, `$100,000`, `$250,000`, or other membership plan price numbers (Flex, Foundation, Foundation+, Performance).
- **Trial class nominal price ($20,000) remains allowed** in the lead prompt as a pedagogical anchor for the Boarding Pass framing. The $20,000 lives in TRIAL_FLOW inside the "Clase de Prueba" section (separate from Planes y Precios), so KFIX-01 does not remove it.
- Phase 89 does NOT write the assertion itself — that is Phase 92's job (RLOK-01). Phase 89 must produce the source state that the assertion will pass against.

### KFIX-03: Elevator reach (reposition + restore, framing rule in reserve)

- **Primary lever — reposition:** move `Metodo (elevator)` to SECTIONS[1], above "Que es El Templo" (which shifts to SECTIONS[2]). Rationale: during the v5.3.1 live test, the model grabbed "Que es El Templo" first on method questions because it was positionally first and semantically relevant; the elevator at position [2] never got read. Putting elevator first forces the model to encounter the team-preferred framing before the generic calisthenics description.
- **Secondary lever — restore content:** expand `ELEVATOR_TEXT` from 95 chars back toward ~131 chars, the pre-v5.3.1-remediation length. Preserve all three team hooks ("método internacional", "cuatro niveles simultáneos" or a faithful variant, "no salirse del grupo") AND restore the conversational warmth that was lost to the 95-char compression. Exact wording drafted during planning; user to review before commit (team voice).
- **Third lever held in reserve:** do NOT add a framing rule in `system-prompt.ts` that directs the model to use the elevator for method questions. Only add this if Phase 92's live test shows reposition + restore is insufficient. Saving the budget and avoiding rule accretion.
- Position impact on "Que es El Templo": still renders for leads, still a valid fallback, just no longer the first section the model encounters. Low risk.

### KFIX-04: Boarding Pass dual-benefit canonical rewrite

- Rewrite the canonical BP definition in `ZERO_RULES` (currently at `knowledge.ts:156`) to name BOTH benefits explicitly. No cross-reference patterns — the pointer form was dropped during v5.3.1 remediation and isn't available.
- Draft suggested by user (exact wording to be finalized during planning):
  > "El Boarding Pass es un pase digital único que recibís al contactarte por primera vez con El Templo. Tiene dos beneficios: (1) la clase de prueba 100% bonificada, y (2) precios Zero en la primera membresía que contrates."
- The canonical stays in Reglas Zero (not promoted to its own section). `Reglas Zero` remains `discovery`-tagged, so PB1 leads see the dual-benefit canonical in every turn.
- Trial-flow mentions of BP stay as-is (name only, no re-explanation) — BPASS-02/03 semantics from v5.3.1 preserved.

### Price-deferral framing rule (defense-in-depth)

- **Disagreement with the "rely on E2A" recommendation:** add an explicit universal framing rule in `system-prompt.ts`.
- Rationale: with prices removed from the prompt (KFIX-01), gpt-4o-mini has three behavioral options when asked "¿cuánto sale?" — (a) defer (desired), (b) hallucinate plausible gym prices from training data (catastrophic), (c) escalate to human (acceptable). Option (b) is a real, measurable risk that the E2A rule does not cover — E2A addresses "don't list ALL plans during discovery" but not "don't invent numbers you don't know."
- Rule text (draft from user, exact wording in planning):
  > "Nunca inventes precios de membresías. Si el lead pregunta por precios durante discovery, respondé con el defer pattern de la stage actual y re-anclá la prueba gratuita. Si no estás seguro de un precio, NO lo menciones — solo ofrecé la clase de prueba como próximo paso."
- Cost: ~200 chars in the rendered prompt for all states. Easily within the budget KFIX-01 frees.
- Defense-in-depth: KFIX-01 removes the temptation, this rule prevents hallucination. Both layers active.

### Freed-budget allocation policy

- KFIX-01 frees ~1,700 chars from the rendered PB1 lead prompt.
- Allocation:
  - ~36 chars to elevator restoration (95 → ~131 chars)
  - ~200 chars to price-deferral framing rule (universal framing — impacts lead AND non-lead alike)
  - The rest (~1,470 chars) banked as genuine KGATE-05 headroom for Phases 90, 91, 92 to spend on stage heuristic comments, objection instruction, or live-test-driven adjustments without hard trade-offs.
- The v5.3.1 experience (58 chars of headroom forcing compromises mid-plan) is the explicit reason for this discipline. Do not spend the banked budget unless a downstream phase needs it — measure first.

### Claude's Discretion

- Exact final wording of the restored `ELEVATOR_TEXT` (within ~131-char target, three hooks preserved, team voice restored). User reviews before commit.
- Exact final wording of the BP canonical rewrite (within the user's suggested shape, natural Spanish, tuteo preserved where applicable). User reviews before commit.
- Exact final wording of the price-deferral framing rule (within the user's suggested shape, consistent with existing `*Reglas de conversacion*` block style in system-prompt.ts). User reviews before commit.
- Precise placement of the new framing rule within `system-prompt.ts` (near the `*Reglas de conversacion*` block or adjacent to the v5.3.1 deflection rule). No other framing touched.
- Whether to commit elevator restore + reposition as one task or two.

</decisions>

<specifics>
## Specific Ideas

- Reposition-before-restore is the deliberate ordering: proving the reposition alone solves elevator reach (Phase 92 live test) would let us skip or minimize the restore. But restoring warmth is cheap (~36 chars) and the three hooks are the team's preferred framing, so doing both in Phase 89 is net-positive.
- The BP canonical rewrite is the only place in v5.3.2 where content GROWS inside a discovery-tagged section. All other changes are net-neutral or net-freeing on the lead prompt.
- The snapshot fixture `el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt` WILL intentionally regenerate as a result of Phase 89's changes. Per v5.3.1 update discipline, the regenerated fixture must be committed alongside the source changes in the same commit or atomic task — not as a separate "fix snapshot" commit. This is expected, not a regression.
- If during execution the rendered lead prompt grows unexpectedly (e.g., BP canonical expansion larger than projected), measure and report — do not silently consume the banked headroom.

</specifics>

<deferred>
## Deferred Ideas

- Elevator framing rule in `system-prompt.ts` — held in reserve pending Phase 92 live-test evidence. May move to v5.4 if reposition + restore is sufficient.
- Promoting Boarding Pass to its own SECTIONS entry (separate from Reglas Zero) — considered but rejected; keeps pricing rules and BP together as they are conceptually linked.
- Rewriting "Que es El Templo" to be more distinctive from the elevator — out of scope for v5.3.2; the two sections currently cover different ground (generic calisthenics description vs. team method pitch) and coexist fine under the new ordering.
- Adding method content for PB2-PB5 states — v5.4 or later; v5.3.2 only touches PB1 lead rendering.
- Any change to TRIAL_FLOW pricing or BP mention outside the canonical — preserves v5.3.1 BPASS-02/03 behavior.

</deferred>

---

_Phase: 89-knowledge-fixes_
_Context gathered: 2026-04-14_
