# Requirements: El Templo

**Defined:** 2026-04-13
**Current Milestone:** v5.3.1 Prompt Architecture Refactor
**Core Value (v5.x):** Prospective and current members get instant, accurate answers about El Templo via WhatsApp — and leads are profiled through natural discovery so Mica makes ONE targeted recommendation per conversation.

## v5.3.1 Requirements

Requirements for the Prompt Architecture Refactor milestone. Each maps to one phase in `.planning/ROADMAP.md`.

### Knowledge Gating

- [ ] **KGATE-01**: `getBusinessKnowledge` accepts a `clientState` parameter and returns ONLY sections relevant to that state
- [ ] **KGATE-02**: PB1 leads receive discovery-relevant sections only (classes, locations, trial info, method, Boarding Pass) — retention, upgrade paths, app help, and member policies are excluded
- [ ] **KGATE-03**: Non-lead states (trial, active, inactive, expired) receive the full knowledge set (no regression)
- [ ] **KGATE-04**: When `clientState` is null/undefined, the full knowledge set is returned (backward compat with v5.2 codepath)
- [x] **KGATE-05**: PB1.E1A rendered prompt is >=35% smaller than pre-refactor baseline (measured in characters)
- [ ] **KGATE-06**: system-prompt.ts passes `clientState` through to `getBusinessKnowledge` — minimal change, no base prompt rewrite

### Boarding Pass Consolidation

- [ ] **BPASS-01**: knowledge.ts contains exactly ONE canonical Boarding Pass definition
- [ ] **BPASS-02**: All other Boarding Pass mentions reference the canonical definition rather than re-explaining it
- [ ] **BPASS-03**: Boarding Pass is NOT explained differently in any section (zero contradictory framings)

### Method Description

- [ ] **METHOD-01**: knowledge.ts contains the team-provided method description as a new section (verbatim long-form source)
- [ ] **METHOD-02**: A 2-sentence elevator pitch version exists for conversational use
- [ ] **METHOD-03**: "Lo sentis cuando llegas" deflection rule is present for method-internals questions
- [ ] **METHOD-04**: Method section is included in the PB1 lead knowledge gate (discovery-relevant)

### Quality Regression

- [ ] **QREG-01**: All 502 existing tests pass with zero modifications to test assertions
- [ ] **QREG-02**: New tests verify per-state content presence/absence
- [ ] **QREG-03**: New test measures PB1.E1A rendered prompt size and asserts >=35% reduction vs documented baseline

## v5.4+ Requirements (Deferred — Kero CRM)

- **KERO-01..08**: DB tables, schedulers, templates, admin, scoring, anti-spam, tag_history, PB6 (tracked in `.planning/milestones/v5.3-MILESTONE-AUDIT.md`)

## Out of Scope

| Feature                         | Reason                                                     |
| ------------------------------- | ---------------------------------------------------------- |
| Base prompt rewrite             | QT11-18 rules battle-tested; gating fixes structural issue |
| definitions.ts changes          | Playbook content stable; stages NOT touched                |
| resolver/advance/engine changes | Working correctly; no modifications                        |
| New playbook stages             | Stage structure frozen for v5.3.1                          |
| Kero CRM infrastructure         | Deferred to v5.4                                           |

## Traceability

| Requirement | Phase | Status   |
| ----------- | ----- | -------- |
| KGATE-01    | 86    | Pending  |
| KGATE-02    | 86    | Pending  |
| KGATE-03    | 86    | Pending  |
| KGATE-04    | 86    | Pending  |
| KGATE-05    | 86    | Complete |
| KGATE-06    | 86    | Pending  |
| BPASS-01    | 87    | Pending  |
| BPASS-02    | 87    | Pending  |
| BPASS-03    | 87    | Pending  |
| METHOD-01   | 87    | Pending  |
| METHOD-02   | 87    | Pending  |
| METHOD-03   | 87    | Pending  |
| METHOD-04   | 87    | Pending  |
| QREG-01     | 88    | Pending  |
| QREG-02     | 88    | Pending  |
| QREG-03     | 88    | Pending  |

**Coverage:**

- v5.3.1 requirements: 16 total
- Mapped to phases: 16/16
- Unmapped: 0

---

_Requirements defined: 2026-04-13_
_Last updated: 2026-04-13 after roadmap creation_
