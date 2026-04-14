---
phase: 87-boarding-pass-method-description
plan: 03
subsystem: testing
tags:
  [
    tests,
    regression-lock,
    knowledge-gating,
    boarding-pass,
    method,
    deflection,
    whatsapp-bot,
  ]

# Dependency graph
requires:
  - phase: 87-01
    provides: "Canonical Boarding Pass definition + consolidated reference sites"
  - phase: 87-02
    provides: "Metodo (elevator) + Metodo (detalle) sections; deflection rule in system-prompt.ts"
  - phase: 86-knowledge-gating
    provides: "Per-ClientState knowledge gating with discovery tag"
provides:
  - "Regression locks for BP consolidation (BPASS-01/02/03)"
  - "Regression locks for method sections (METHOD-01/02/04) — headers, gating, verbatim fragments"
  - "Regression locks for method-internals deflection rule (METHOD-03) — universal reach, no duplication"
affects: [88-regression-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bound-by-section exclusion-zone pattern for proximity assertions — using section-heading landmarks (not just opener fragments) avoids matching the header itself"
    - "Zero-residue lock for removed patterns — future partial reintroduction of a dropped pattern (e.g. pointer suffix) fails the lock cleanly"

key-files:
  created: []
  modified:
    - el-templo-bot/test/knowledge-gating.test.ts

key-decisions:
  - "Block A assertion #2 adapted to actual Wave-2 state: 87-02 remediation dropped ALL (ver *Reglas Zero*) pointers, so the spec's >=6 pointer-count assertion is infeasible. Replaced with a name-preservation lock (>=7 Boarding Pass occurrences) — same intent (consolidation did not silently strip references), measured against current truth"
  - "Block A assertion #4 exclusion-zone bounded by the Reglas Zero section heading, not by the canonical opener fragment alone — otherwise the canonical `*Boarding Pass (primer mes en El Templo):*` title itself registers as a non-canonical BP mention followed by its own explanation"
  - "Added a 5th Block A assertion (zero-residue pointer-form lock) to preserve the intent of the spec's pointer assertion after the adaptation — catches partial reintroduction of the dropped pattern"
  - 'Non-lead parametrized assertions use `it.each` over `Exclude<ClientState, "lead">[]`, matching the type pattern established in 86-03'

requirements-completed:
  [BPASS-01, BPASS-02, BPASS-03, METHOD-01, METHOD-02, METHOD-03, METHOD-04]

# Metrics
duration: 7 min
completed: 2026-04-14
---

# Phase 87 Plan 03: Regression Tests for BP Consolidation + Method + Deflection Summary

**Added three `describe` blocks to `knowledge-gating.test.ts` locking Phase-87 behavior: Boarding Pass canonical uniqueness and name preservation, method-section presence and per-state gating, and method-internals deflection-rule reach across all client states.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-14T05:02:00Z
- **Completed:** 2026-04-14T05:09:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Appended three new `describe` blocks to `knowledge-gating.test.ts` — zero edits to existing KGATE-02/03/04 assertions
- Block A (BP consolidation): 5 its — canonical uniqueness, BP name preservation (>=7), lead-visible canonical, no re-explanation outside canonical paragraph, zero pointer-form residue
- Block B (Method sections): 4 its + 1 `it.each` over 4 non-lead states + 1 verbatim-fragment lock — total 9 tests
- Block C (Deflection rule): 1 lead test + 1 `it.each` over 4 non-lead states + 1 duplication lock — total 6 tests
- Net test delta: **+20 tests** (514 → 534). Spec called for "14 assertions" — the +6 over spec is the `it.each` parametrised expansion across 4 non-lead states in Blocks B and C; that matches the spec's intent (one assertion definition, 4 state-specific executions)
- `pnpm tsc --noEmit` clean
- `pnpm vitest run` green: 534/534
- `prompt-size.test.ts` untouched; KGATE-05 lock remains green

## Task Commits

1. **Task 1: Add Phase-87 regression-lock assertions** — `0b051147` (test)

## Files Modified

- `el-templo-bot/test/knowledge-gating.test.ts` — +196 insertions (import of `getSystemPrompt`; 3 new describe blocks). No existing assertion altered.

## Test Coverage Added

| Block | Name                             | Tests | Requirements                    |
| ----- | -------------------------------- | ----- | ------------------------------- |
| A     | BP consolidation                 | 5     | BPASS-01, BPASS-02, BPASS-03    |
| B     | Method sections                  | 9     | METHOD-01, METHOD-02, METHOD-04 |
| C     | Method-internals deflection rule | 6     | METHOD-03                       |

All 7 Phase-87 requirements now have behavioral regression locks in the test suite, complementing the existing KGATE-05 prompt-size lock.

## Rendered Prompt Size At End of Phase 87

| Metric                                                                | Value  | Threshold | Headroom |
| --------------------------------------------------------------------- | ------ | --------- | -------- |
| PB1.E1A lead                                                          | 18,858 | ≤ 18,916  | 58       |
| Test-only plan — no source changes, size unchanged from end of 87-02. |

**Reference for Phase 88:** KGATE-05 headroom is tight (58 chars). Phase 88 is test-only per v5.3.1 milestone plan, so this headroom should not be consumed.

## Decisions Made

1. **Block A assertion #2 adapted from pointer-count to BP-name count.** The spec expected `>=6` pointer-form (`Boarding Pass (ver *Reglas Zero*)`) occurrences. After 87-02 remediation (b) dropped all 6 pointers in discovery-tagged sections, the pointer count is 0 across the entire file. The underlying intent — lock that consolidation preserved BP references (didn't silently strip them) — was preserved by asserting on bare `"Boarding Pass"` occurrences (>=7). The `prior_wave_context` block in the executor prompt flagged this ("verify actual post-Wave-2 placement") confirming adaptation was expected.

2. **Block A assertion #4 exclusion zone bounded by section heading.** The spec suggested bounding by `full.indexOf("*Precios Zero (Descuentos)*")` to `full.indexOf("\n\n", full.indexOf("Numero Cardio: 432 2555"))`. The actual implementation uses the Reglas Zero heading as the start landmark and the first double-newline after the canonical opener as the end — this covers the `*Boarding Pass (primer mes en El Templo):*` title line and its sentence, which are inside the canonical paragraph and must be excluded from the re-explanation scan.

3. **Block A zero-residue assertion added as 5th test.** To preserve the intent of the pointer-form lock after assertion #2 was adapted, a fifth assertion explicitly locks "zero pointer-form occurrences." This catches partial reintroduction — if a future edit adds back one or two pointers, the test fails cleanly rather than silently passing because bare-name counts still hold.

4. **Block B verbatim fragments chosen for paraphrase-resistance.** Three fragments from `METHOD_DETAIL`: `"método internacional"`, `"cuatro niveles activos simultáneamente"`, `"No todos los días son iguales"`. Each is distinctive enough that any paraphrase pass would alter it. Verified each appears in `knowledge.ts` before finalizing the assertions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Block A assertions #2 and #4 adapted to actual Wave-2 state**

- **Found during:** Task 1 initial plan read-through and pre-test grep verification
- **Issue:** The plan's spec called for `>=6` occurrences of `"Boarding Pass (ver *Reglas Zero*)"` pointer form. Post-87-02 remediation dropped ALL pointers — current count is 0. The literal assertion would fail. Similarly, the exclusion-zone logic in #4 (canonical paragraph detection) needed to bound on the Reglas Zero section heading to avoid matching the canonical `*Boarding Pass (primer mes en El Templo):*` title.
- **Fix:** Assertion #2 replaced with BP-name preservation lock (>=7 occurrences). Assertion #4 exclusion-zone bounded by the Reglas Zero section heading. Added 5th assertion (zero-residue pointer lock) to preserve the deleted-pattern intent.
- **Files modified:** `el-templo-bot/test/knowledge-gating.test.ts`
- **Commit:** `0b051147`

### Not deviations but noted

- `+20` tests vs spec's "+14" — explained by `it.each` parametrised expansions in Blocks B and C over 4 non-lead states (2 × 4 = 8 instances, vs 2 single-assertion definitions in the spec). Matches spec intent.

## Issues Encountered

- Block A assertion #4 initial run failed because the first BP match (the canonical `*Boarding Pass (primer mes en El Templo):*` title at index 5120) was flagged as a non-canonical mention followed by a re-explanation fragment. Root cause: the exclusion zone was bounded by `full.indexOf("primer mes en El Templo")` as its start, which sits inside the title, excluding the title itself from the canonical zone. Fixed by bounding on the Reglas Zero section heading (`*Precios Zero (Descuentos)*`). Single iteration — commit came after the fix.

## User Setup Required

None.

## Next Phase Readiness

- Phase 87 complete (all 3 plans, 7 requirements, behavior locked).
- Phase 88 (regression tests for combined 86+87 output) can proceed with confidence that every requirement-level behavior in Phase 87 has a targeted lock.
- Suggested Phase 88 focus: cross-plan integration tests (e.g., PB1.E1A lead rendered prompt contains BOTH BP canonical AND Metodo (elevator) AND deflection rule in one assertion), plus any additional KGATE-05-style threshold assertions milestone-level metrics demand.

## Self-Check: PASSED

- `el-templo-bot/test/knowledge-gating.test.ts` — exists; contains `"BP consolidation (BPASS-01/02/03)"`, `"Method sections (METHOD-01/02/04)"`, `"Method-internals deflection rule (METHOD-03)"` describe headers
- Commit `0b051147` — present in git log (`test(87-03): lock BP consolidation, method sections, and deflection rule`)
- `pnpm vitest run` — 534/534 passing (24 test files)
- `pnpm tsc --noEmit` — exit 0
- Rendered PB1.E1A lead = 18,858 chars (≤ 18,916 KGATE-05 threshold; unchanged from 87-02 as expected)

---

_Phase: 87-boarding-pass-method-description_
_Completed: 2026-04-14_
