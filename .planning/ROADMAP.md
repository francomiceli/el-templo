# Roadmap: El Templo Admin App (v2.0)

## Overview

This roadmap delivers the Admin App module for El Templo. v2.0 Phase 13 focuses on reviewing and improving the session generation algorithm based on 19 weeks of coach-built examples. The algorithm must produce SPOM-compliant sessions that match coach expectations before building the admin UI for session management.

## Phases

**Phase Numbering:**
- Continues from v1.0 (ended at Phase 12)
- Phase 13+ is v2.0 Admin App work

- [ ] **Phase 13: Session Generation Review & Improvement** - Analyze examples, fix difficulty system, document block specs, validate algorithm

## Phase Details

### Phase 13: Session Generation Review & Improvement
**Goal**: Algorithm produces accurate, SPOM-compliant sessions matching coach-built examples
**Depends on**: v1.0 complete (Phase 12)
**Requirements**: DIFF-01 through DIFF-05, BLOCK-01 through BLOCK-06, EXER-01 through EXER-04, ALGO-01 through ALGO-05, INIT-01 through INIT-03, FORM-01 through FORM-02
**Success Criteria** (what must be TRUE):
  1. Dificultad Lineal column added to Ejercicios.csv with correct mappings
  2. Database exercises table updated with linear difficulty values
  3. Each block (Initium, Nucleus, Deuteros 1/2, Athlos/Epikos) has documented specifications
  4. Exercise count capped at 3 for all blocks except Initium
  5. Algorithm uses linear difficulty scale with "nivel superior" mapping to next level
  6. Block difficulty average validated within +/-0.5 of target
  7. Contraction distribution matches Contraccion rules exactly
  8. Algorithm generates valid sessions that follow patterns observed in 19 example weeks
**Plans**: 7 plans in 4 waves

Plans:
- [x] 13-01-PLAN.md — Difficulty System Foundation (linear difficulty 1-12, DB migration, pipeline update)
- [x] 13-02-PLAN.md — Block Specifications Documentation (document all blocks, exercise count cap)
- [x] 13-03-PLAN.md — Validation Suite (parse coach examples, comparison logic, initial validation)
- [x] 13-04-PLAN.md — Initium Contextual Enhancement (relate warmup to day's Nucleus)
- [ ] 13-05-PLAN.md — Algorithm Integration & Final Validation (fix discrepancies, human verification)
- [ ] 13-06-PLAN.md — HIGH Priority Format Prescribers (Buy-in/Cash-out, AMRAP, EMOM, Complex, Chipper)
- [ ] 13-07-PLAN.md — MEDIUM Priority Format Prescribers (For Time, Tabata, Interval, Cluster, Ladder, etc.)

## Progress

**Execution Order:**
Phase 13 is the first phase of v2.0 Admin App.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 13. Session Generation Review | 0/5 | Planned | — |

---
*Roadmap created: 2026-02-04*
*Last updated: 2026-02-04 — Phase 13 planned (5 plans in 3 waves)*
