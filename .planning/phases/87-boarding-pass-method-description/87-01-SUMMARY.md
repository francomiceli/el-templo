---
phase: 87-boarding-pass-method-description
plan: 01
subsystem: prompt-architecture
tags: [knowledge, boarding-pass, consolidation, whatsapp-bot, prompt-size]

# Dependency graph
requires:
  - phase: 86-knowledge-gating
    provides: "tagged SECTIONS array with discovery filtering; KGATE-05 regression lock at ≥20% rendered / ≥35% knowledge block"
provides:
  - "Single canonical Boarding Pass definition (Reglas Zero, unchanged)"
  - "6 pointer-form references: `Boarding Pass (ver *Reglas Zero*)`"
  - "Zero contradictory BP framings across knowledge.ts"
affects: [87-02, 88-regression-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Canonical-definition + pointer-reference pattern for recurring concepts in knowledge.ts (reduces drift and prompt-token cost without new sections)"

key-files:
  created: []
  modified:
    - el-templo-bot/src/ai/knowledge.ts

key-decisions:
  - "Default decision on line 243 applied: bullet removed (not preserved with pointer) — it was pure BP re-explanation adjacent to the pointer added on line 242 in the same TRIAL_FLOW section"
  - "Line 371 instruction prefix gets the pointer; Mica's quoted dialogue inside the same line stays verbatim (it is conversational script, not prompt-voice definition)"
  - "Line 357 parenthetical '(primera vez)' dropped as partial re-explanation — Reglas Zero already canonicalises 'beneficio unico (una sola vez)'"

patterns-established:
  - "Pointer form for cross-section concept references: name + `(ver *SectionName*)` with WhatsApp asterisks, never inline recap"

requirements-completed: [BPASS-01, BPASS-02, BPASS-03]

# Metrics
duration: 2 min
completed: 2026-04-14
---

# Phase 87 Plan 01: Boarding Pass Consolidation Summary

**Single canonical Boarding Pass definition (Reglas Zero) with 6 pointer-form references replacing scattered BP re-explanations across TRIAL_FLOW, SALES_TECHNIQUES, and OBJECTIONS_SALES.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-14T04:37:51Z
- **Completed:** 2026-04-14T04:40:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Canonical BP definition in `ZERO_RULES` (line 156) preserved byte-identical
- 6 non-canonical sites converted to `Boarding Pass (ver *Reglas Zero*)` pointer form
- 1 pure-reexplanation bullet removed (line 243, TRIAL_FLOW) — redundant with pointer added on line 242 in the same section
- All 514 bot tests still passing (24 test files)
- `tsc --noEmit` clean
- KGATE-05 regression lock holds: PB1.E1A lead rendered = 18,626 chars (21.23% reduction vs 23,646 baseline, above ≥20% threshold)

## Task Commits

1. **Task 1: Convert 7 BP mention sites (6 to pointer, 1 removed)** — `ee811a3f` (refactor)

## Files Created/Modified

- `el-templo-bot/src/ai/knowledge.ts` — BP consolidation (6 pointer-form edits + 1 removal; canonical untouched)

## Site-by-Site Diff Summary

| Site                                     | Before                                                                 | After                                                                                      | Notes                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| L156 (`ZERO_RULES`)                      | Canonical definition                                                   | **Unchanged**                                                                              | Canonical — the ONE place BP is explained                                      |
| L242 (`TRIAL_FLOW`)                      | `…bonificada con el Boarding Pass.`                                    | `…bonificada con el Boarding Pass (ver *Reglas Zero*).`                                    | Pointer added                                                                  |
| L243 (`TRIAL_FLOW`)                      | `El Boarding Pass ademas habilita descuentos exclusivos…`              | **REMOVED**                                                                                | Pure re-explanation; redundant with line 242 pointer in same section           |
| L250 → L249 (`TRIAL_FLOW`, step 4)       | `Administracion envia el Boarding Pass con los detalles…`              | `Administracion envia el Boarding Pass (ver *Reglas Zero*) con los detalles…`              | Pointer added (line reflowed to 249 after L243 removal)                        |
| L341 → L340 (`SALES_TECHNIQUES`)         | `…"Beneficio unico del Boarding Pass" (solo una vez).`                 | `…"Beneficio unico del Boarding Pass (ver *Reglas Zero*)" (solo una vez).`                 | Pointer added inside quoted tactic label                                       |
| L342 → L341 (`SALES_TECHNIQUES`)         | `…precio Zero/Boarding Pass (ej: ~$80,000~ -> *$65,000*).`             | `…precio Zero/Boarding Pass (ver *Reglas Zero*) (ej: ~$80,000~ -> *$65,000*).`             | Pointer added                                                                  |
| L357 → L356 (`OBJECTIONS_SALES`, item 1) | `Menciona el descuento del Boarding Pass (primera vez).`               | `Menciona el descuento del Boarding Pass (ver *Reglas Zero*).`                             | Pointer added; parenthetical `(primera vez)` dropped (partial re-explanation)  |
| L372 → L371 (`OBJECTIONS_SALES`, item 4) | `Mencionar el Boarding Pass como opcion suave: "…BP es de uso unico…"` | `Mencionar el Boarding Pass (ver *Reglas Zero*) como opcion suave: "…BP es de uso unico…"` | Pointer on prompt-voice instruction only; Mica's quoted dialogue kept verbatim |

**Final `Boarding Pass` hits:** 7 lines in knowledge.ts (1 canonical @ L156 with 2 occurrences in body + 6 pointer-form lines; one of those lines also contains verbatim `Boarding Pass` inside Mica's quote). Total = 9 occurrences, 7 lines — matches plan's post-consolidation audit.

**Pointer-form `Boarding Pass (ver *Reglas Zero*)`:** 6 hits. Verified byte-exact with escaped grep.

**Contradictory framings outside canonical/pointer:** 0 (grep -v for `Reglas Zero|primer mes en El Templo` returns empty).

## Rendered Prompt Size Post-Task

| Metric                  | Pre-87-01 (Phase 86 baseline) | Post-87-01       | Δ                               |
| ----------------------- | ----------------------------- | ---------------- | ------------------------------- |
| PB1.E1A lead            | 18,617 chars                  | **18,626 chars** | +9 chars                        |
| PB1.E1A non-lead (full) | ~23,646                       | **23,718 chars** | +72 chars                       |
| KGATE-05 lead reduction | 21.26%                        | **21.23%**       | -0.03 pp (still ≥20% threshold) |

**Budget math for 87-02:** KGATE-05 headroom at end of 87-01 is **18,823 − 18,626 = 197 chars** (where 18,823 = 23,646 × 0.796, the 20%-reduction floor). The ≤200-char elevator budget from 87-CONTEXT.md now has ≈197 chars real headroom (tight — 87-02 must verify rendered lead size immediately after adding `Metodo (elevator)`).

## Decisions Made

1. **Line 243 removed, not preserved with pointer.** Rationale: the bullet was pure BP re-explanation ("habilita descuentos exclusivos… precios Zero"), redundant with the pointer added on line 242 in the same TRIAL_FLOW section. Keeping both would have created adjacent references with partial/contradictory framing. Plan default was removal; default applied.
2. **Line 357 parenthetical `(primera vez)` dropped.** Rationale: it is a partial re-explanation of BP semantics already canonicalised in Reglas Zero ("beneficio unico (una sola vez)"). Leaving the parenthetical would keep exactly the drift this plan exists to remove.
3. **Line 371 Mica-dialogue quote kept verbatim.** Rationale: the quoted text is a conversational script that Mica _says_ to users — it is not a prompt-voice definition. Replacing the inner `Boarding Pass` with a pointer would break the natural sentence Mica speaks.

## Deviations from Plan

None — plan executed exactly as written with the default decision path (L243 removed).

## Issues Encountered

- Minor: rendered PB1.E1A lead grew by +9 chars (from 18,617 to 18,626) — not a regression, within all locked thresholds. Root cause: the 6 added `(ver *Reglas Zero*)` pointers in discovery-tagged sections outweigh the L243 removal (TRIAL_FLOW's removed bullet was ~91 chars, but 4 of the 6 pointers land in discovery-tagged sections = 4 × ~19 = ~76 chars added to lead rendering, net +10 in lead, which matches observed +9). Documented for 87-02 budget planning.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- BP consolidation complete; knowledge.ts now has single source of truth for Boarding Pass semantics
- Ready for 87-02 (Method elevator + detalle sections + deflection rule in system-prompt.ts)
- **Tight headroom advisory for 87-02:** only ~197 chars remain before KGATE-05 20% floor trips. The ≤200-char elevator budget is achievable but must be measured, not assumed.

## Self-Check: PASSED

- `el-templo-bot/src/ai/knowledge.ts` — exists and contains `Boarding Pass (ver *Reglas Zero*)` 6 times (verified via escaped grep)
- Commit `ee811a3f` — present in `git log` (`refactor(87-01): consolidate Boarding Pass to canonical definition + 7 pointers`)
- Full bot test suite 514/514 passing
- TypeScript typecheck clean (`pnpm tsc --noEmit` exit 0)

---

_Phase: 87-boarding-pass-method-description_
_Completed: 2026-04-14_
