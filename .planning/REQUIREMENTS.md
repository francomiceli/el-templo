# Requirements: El Templo App (Admin App Module)

**Defined:** 2026-02-04
**Core Value:** Coaches and admins can review, validate, and manage algorithm-generated sessions while the system produces accurate, SPOM-compliant sessions automatically.

## v2.0 Requirements (Phase 13)

Requirements for Session Generation Review & Improvement.

### Difficulty System (DIFF)

- [ ] **DIFF-01**: Add "Dificultad Lineal" column to Ejercicios.csv mapping: Alfa 1-3, Delta 4-6, Sigma 7-8, Omega 9-10, Spartan 11-12
- [ ] **DIFF-02**: Update exercises database table with Dificultad Lineal values
- [ ] **DIFF-03**: Algorithm uses linear difficulty scale for exercise selection
- [ ] **DIFF-04**: "Nivel Superior 1" maps to next level's first difficulty (Alfa→4, Delta→7, Sigma→9, Omega→11)
- [ ] **DIFF-05**: Block difficulty average within ±0.5 of target

### Block Specifications (BLOCK)

- [ ] **BLOCK-01**: Document Initium block specifications (no route, FLOW/Movilidad, contextual to day)
- [ ] **BLOCK-02**: Document Nucleus block specifications (main work, all levels planned together, Alpha-Delta correlation)
- [ ] **BLOCK-03**: Document Deuteros 1 block specifications (secondary work, upper/lower body choice)
- [ ] **BLOCK-04**: Document Deuteros 2 block specifications (secondary work, upper/lower body choice)
- [ ] **BLOCK-05**: Document Athlos/Epikos block specifications (Athlos=structured, Epikos=playful, alternating)
- [ ] **BLOCK-06**: Exercise count capped at 3 for all blocks except Initium

### Exercise Selection (EXER)

- [ ] **EXER-01**: Filters apply correctly: route, pattern, category, contraction, level, difficulty
- [ ] **EXER-02**: High intensity = strict filters, low intensity = loose filters
- [ ] **EXER-03**: No exercise repeated within same level's session
- [ ] **EXER-04**: Exercise selection respects contraction distribution from Contracción rules

### Algorithm Validation (ALGO)

- [ ] **ALGO-01**: Analyze 19 example weeks (Semana 3-21) to extract patterns and rules
- [ ] **ALGO-02**: Routes from Weekly Rotator match for all weeks/days/levels
- [ ] **ALGO-03**: Intensities from SPOM lookup match for all routes
- [ ] **ALGO-04**: Contraction distribution follows Contracción rules exactly
- [ ] **ALGO-05**: Algorithm generates valid sessions for future weeks

### Initium Special Logic (INIT)

- [ ] **INIT-01**: Initium bypasses SPOM pipeline (no route lookup)
- [ ] **INIT-02**: Initium uses FLOW/Movilidad pattern exercises
- [ ] **INIT-03**: Initium exercise selection is contextual to day's main stimulus

### Format Assignment (FORM)

- [ ] **FORM-01**: Format selected from Formatos compatibility table
- [ ] **FORM-02**: Format compatible with block, level, and intensity

## Future Requirements (v2.x)

Deferred to later phases within Admin App module.

### Session Editor UI

- **EDIT-01**: Coach can view algorithm-generated session
- **EDIT-02**: Coach can modify exercises within a block
- **EDIT-03**: Coach can modify reps/duration for exercises
- **EDIT-04**: Coach can modify format for a block
- **EDIT-05**: Coach validates session as "effective"

### Coach Management

- **COACH-01**: Coach can view members in their branch
- **COACH-02**: Coach can see member's training history
- **COACH-03**: Coach can promote member to next level
- **COACH-04**: Coach can approve evaluation requests

### SPOM Management

- **SPOM-01**: Admin can view and update current SPOM week
- **SPOM-02**: Admin can re-import data tables
- **SPOM-03**: Admin actions are logged with timestamp

## Out of Scope

| Feature | Reason |
|---------|--------|
| Manual session creation from scratch | Coach modifies generated sessions, doesn't build from zero |
| Per-member custom sessions | Members follow level-appropriate generated sessions |
| Real-time collaboration | Single coach edits at a time is sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DIFF-01 | Phase 13 | Pending |
| DIFF-02 | Phase 13 | Pending |
| DIFF-03 | Phase 13 | Pending |
| DIFF-04 | Phase 13 | Pending |
| DIFF-05 | Phase 13 | Pending |
| BLOCK-01 | Phase 13 | Pending |
| BLOCK-02 | Phase 13 | Pending |
| BLOCK-03 | Phase 13 | Pending |
| BLOCK-04 | Phase 13 | Pending |
| BLOCK-05 | Phase 13 | Pending |
| BLOCK-06 | Phase 13 | Pending |
| EXER-01 | Phase 13 | Pending |
| EXER-02 | Phase 13 | Pending |
| EXER-03 | Phase 13 | Pending |
| EXER-04 | Phase 13 | Pending |
| ALGO-01 | Phase 13 | Pending |
| ALGO-02 | Phase 13 | Pending |
| ALGO-03 | Phase 13 | Pending |
| ALGO-04 | Phase 13 | Pending |
| ALGO-05 | Phase 13 | Pending |
| INIT-01 | Phase 13 | Pending |
| INIT-02 | Phase 13 | Pending |
| INIT-03 | Phase 13 | Pending |
| FORM-01 | Phase 13 | Pending |
| FORM-02 | Phase 13 | Pending |

**Coverage:**
- Phase 13 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-04*
*Last updated: 2026-02-04 after v2.0 milestone start*
