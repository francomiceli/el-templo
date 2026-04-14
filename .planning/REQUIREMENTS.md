# Requirements: El Templo — v5.3.2 Post-v5.3.1 Live Test Fixes

**Defined:** 2026-04-14
**Core Value:** Prospective leads get instant, accurate answers about El Templo via WhatsApp — profiled through real discovery, with prices, method, and objections handled per the team's playbook (not improvised).

## Source Evidence

All requirements derived from the first post-v5.3.1 live test conversation (Mar del Plata, 2026-04-14, ~10 turns). Four problems were observed that v5.3.1's 537-test suite did not catch. See `.planning/phases/89-*/89-CONTEXT.md` (once created) and the milestone brief for the full conversation log.

## v1 Requirements (v5.3.2 scope)

### Knowledge Fixes

<!-- Phase 89 — move prices out of the lead prompt; improve elevator reach; restore Boarding Pass dual-benefit visibility -->

- [ ] **KFIX-01**: The "Planes y Precios" section no longer appears in the rendered PB1 lead prompt (remove `discovery` tag), eliminating price injection that contradicts the E2A "no prices during discovery" rule
- [ ] **KFIX-02**: The rendered PB1.E1A lead prompt contains zero membership plan price numbers (Flex, Foundation, Foundation+, Performance monthly prices). Nominal trial class pricing ($20,000) remains allowed as a pedagogical anchor for the Boarding Pass benefit framing.
- [ ] **KFIX-03**: When a lead asks "¿qué es el templo?" or "¿qué método usan?", Mica's response uses at least two of the three team hooks ("método internacional", "cuatro niveles simultáneos" or variants, "no salirse del grupo"); achieved via elevator repositioning, content restoration, and/or a framing rule
- [ ] **KFIX-04**: The canonical Boarding Pass definition (in "Reglas Zero") surfaces both benefits clearly in the PB1 lead prompt — free first trial class AND discounted first membership (precios Zero) — so Mica does not answer with only one benefit

### Stage Heuristic Tightening

<!-- Phase 90 — align completion triggers with promptSection's "2-3 questions ideal" intent -->

- [ ] **STAGE-01**: `hasStageSpecificContent` for PB1.E1A returns `true` only when more than a single keyword match is present (combination of signals, not one-keyword trigger); does NOT replace the heuristic with a model-driven detector (that's v5.4)
- [ ] **STAGE-02**: PB1.E1A `completionCriteria` aligns with its promptSection's "idealmente 2-3 preguntas" intent — advancement to E2A requires more than a single-word answer like "primera vez"; may require a minimum user-turn count or multi-signal gate

### PB1 Objection Handling

<!-- Phase 91 — close the behavioral gap when a lead rejects during discovery (pre-trial) -->

- [ ] **OBJN-01**: When a lead signals rejection or disinterest during PB1 discovery (e.g., "no me interesa", "no creo", "no voy a hacerlo"), Mica asks WHY before closing the conversation — she does not default to "tomá tu tiempo, saludos"
- [ ] **OBJN-02**: PB1 contains explicit instruction for the "lead rejects during discovery" case — implemented as a new stage (e.g., PB1.E_objection), a conditional branch on an existing stage, or a universal framing rule in `system-prompt.ts`; choice made during discuss/plan

### Regression Lock + Live Test Validation

<!-- Phase 92 — lock each fix with a test assertion; run a guided live conversation to validate behavior -->

- [ ] **RLOK-01**: New targeted assertions exist for each of KFIX-01, KFIX-02, KFIX-03, KFIX-04, STAGE-01, STAGE-02, OBJN-01 — added to the existing bot test suite, all passing
- [ ] **RLOK-02**: Full bot test suite passes with zero regressions in QT11-18 fixes and v5.3.1 state-gating/prompt-size behavior. The PB1.E1A lead snapshot fixture is intentionally regenerated after KFIX-01 with an explicit commit per the v5.3.1 update discipline — this regeneration is expected, not a regression.
- [ ] **RLOK-03**: A guided live-test conversation (5-10 turns, covering the four failure paths — price-during-discovery, method question, discovery rejection, Boarding Pass explanation) confirms the four success criteria from the milestone brief are met in practice, not just in assertions

## Out of Scope

| Feature                                                                    | Reason                                                                                                                                                                                                      |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model-driven stage detector replacing `hasStageSpecificContent`            | v5.4 territory — this milestone tightens the existing heuristic, does not replace it                                                                                                                        |
| Rewriting base prompt, playbook structure, or state-machine fundamentals   | QT11-18 fixes are battle-tested; must not regress them                                                                                                                                                      |
| New playbooks (PB6 onboarding, others)                                     | v5.3.2 only touches PB1                                                                                                                                                                                     |
| Revisiting KGATE-05 dual-threshold (20% rendered / 35% knowledge)          | Locked in v5.3.1 after explicit rationale; do not re-open                                                                                                                                                   |
| Kero CRM integration (KERO-01..08)                                         | v5.4 milestone — separate scope                                                                                                                                                                             |
| Any feature that would consume the 58-char KGATE-05 headroom without audit | Budget discipline — headroom audit required before any additive change; moving "Planes y Precios" out of discovery (KFIX-01) frees budget, so v5.3.2 is net-positive on headroom if fixes are done in order |

## Traceability

| Requirement | Phase | Status  |
| ----------- | ----- | ------- |
| KFIX-01     | 89    | Pending |
| KFIX-02     | 89    | Pending |
| KFIX-03     | 89    | Pending |
| KFIX-04     | 89    | Pending |
| STAGE-01    | 90    | Pending |
| STAGE-02    | 90    | Pending |
| OBJN-01     | 91    | Pending |
| OBJN-02     | 91    | Pending |
| RLOK-01     | 92    | Pending |
| RLOK-02     | 92    | Pending |
| RLOK-03     | 92    | Pending |

**Coverage:**

- v5.3.2 requirements: 11 total
- Mapped to phases: 11/11
- Unmapped: 0 ✓

---

_Requirements defined: 2026-04-14_
_Last updated: 2026-04-14 after v5.3.2 scoping_
