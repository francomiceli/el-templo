---
phase: 86-knowledge-gating
plan: 01
subsystem: testing
tags: [prompt-architecture, fixture, baseline, regression-test, whatsapp-bot]

# Dependency graph
requires: []
provides:
  - Frozen pre-refactor PB1.E1A rendered system prompt (23,646 chars)
  - BASELINE_CHARS TypeScript constant for KGATE-05 regression assertion
affects:
  [
    86-02-knowledge-gating-refactor,
    86-03-prompt-size-test,
    88-prompt-architecture-validation,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Baseline fixture pattern: capture pre-refactor output byte-exact + export length constant for regression assertions"

key-files:
  created:
    - el-templo-bot/test/fixtures/pb1-e1a-baseline.txt
    - el-templo-bot/test/fixtures/pb1-e1a-baseline.ts
  modified: []

key-decisions:
  - "Baseline captured against current source (commit 862d6862 — last pre-refactor commit) to lock KGATE-05 reference point"
  - "Stored BASELINE_CHARS as literal (23646) rather than computing at test time — avoids file I/O in pure unit tests and makes drift visible in diffs"

patterns-established:
  - "One-shot capture scripts: write script in bot root, run via tsx, delete after fixture is committed. Script itself never committed."
  - "Determinism check: re-run capture and diff to verify no Date/Math.random leakage in prompt path"

requirements-completed: [KGATE-05]

# Metrics
duration: 8min
completed: 2026-04-14
---

# Phase 86 Plan 01: Baseline Fixture Capture Summary

**Froze pre-refactor PB1.E1A system prompt at 23,646 chars as regression anchor for KGATE-05 ≥35% reduction assertion**

## Performance

- **Duration:** ~8 min
- **Completed:** 2026-04-14
- **Tasks:** 1
- **Files created:** 2

## Accomplishments

- Captured rendered PB1.E1A system prompt (clientState=lead, activePlaybook=PB1, currentStage=E1A, no avatar, no profileContext) byte-exact into `test/fixtures/pb1-e1a-baseline.txt`
- Exported `BASELINE_CHARS = 23646` from `test/fixtures/pb1-e1a-baseline.ts` for import by the plan 03 regression test
- Verified determinism: two successive captures against identical source produced byte-identical fixtures
- Verified fixture contains all 12 knowledge sections (including `Estrategias de Retencion` and `Ayuda con la App (DeportNet)` — the sections that plan 02 will gate out for PB1 leads)

## Task Commits

1. **Task 1: Capture pre-refactor PB1.E1A baseline fixture** — `02dacd2b` (test)

## Files Created

- `el-templo-bot/test/fixtures/pb1-e1a-baseline.txt` — 23,646 chars, 395 lines, full rendered PB1.E1A lead system prompt
- `el-templo-bot/test/fixtures/pb1-e1a-baseline.ts` — exports `BASELINE_CHARS = 23646`

## Baseline Details

**BASELINE_CHARS:** `23646`

Confirmed within the 15k-25k range predicted by the QT17 audit. This validates the audit's "knowledge section is ~57% of total prompt" finding: at 23.6k total, a ~35% reduction (to ≤15,369 chars) is achievable by gating retention + app-help + sales-technique sections out of the PB1 lead prompt.

### Sections Observed in Fixture

All 12 business knowledge sections are present, confirming no gating is active yet in pre-refactor code:

1. Que es El Templo
2. ROM (Calisthenics Range of Motion)
3. Planes y Membresias (Flex / Foundation / Performance / Tarjeta de Credito)
4. Precios Zero (Descuentos)
5. Horarios por Sede
6. Clase de Prueba
7. Ayuda con la App (DeportNet)
8. Politicas del Centro
9. Tecnicas de Venta
10. Manejo de Objeciones
11. Estrategias de Retencion
12. Reglas de Oro (12 Reglas de Oro de Mica)

Plus the framing layers rendered around the knowledge block: persona/tone, tools, presentation rules, limits, conversation rules, identity handling, off-topic handling, `Playbook activo: PB1 (PB1.E1A)` stage section, and the `Detección de perfil` directive.

## Decisions Made

- **Captured against commit `862d6862`** (last pre-refactor state). `knowledge.ts` and `system-prompt.ts` had no uncommitted changes at capture time, satisfying the plan's critical-ordering constraint.
- **Stored BASELINE_CHARS as a plain number literal** rather than computing it from the .txt at import time. Rationale: the regression test in plan 03 should be a pure assertion on a known constant, not a file-read side effect. Any drift in the fixture must be an intentional re-baseline, which will show up as a visible diff in the constant.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan verification command had incorrect startsWith check**

- **Found during:** Task 1 verification
- **Issue:** Plan's automated verify command checks `txt.startsWith('Soy _Mica_')` (underscore-wrapped), but the actual source in `system-prompt.ts:130` renders `Soy *Mica*` (WhatsApp single-asterisk bold). The plan-embedded verification would have false-negatived a correct fixture.
- **Fix:** Ran the equivalent check with the correct delimiter (`Soy *Mica*`). Fixture itself is correct and matches source.
- **Files modified:** None (plan text is not an artifact of this plan)
- **Verification:** `txt.startsWith('Soy *Mica*')` → true; fixture otherwise passes every other check (retention, DeportNet, Playbook activo marker, BASELINE_CHARS parity)
- **Committed in:** N/A (documentation-only deviation, flagged for future plan authors)

---

**Total deviations:** 1 noted (plan verification text bug — did not block execution)
**Impact on plan:** None. Fixture is valid and matches source exactly.

## Issues Encountered

- First attempt at the capture script used `.mts` extension inside `test/fixtures/`; tsx loader rejected the `getSystemPrompt` named import from a relative `.js` path under that setup. Resolved by placing the one-shot script at the bot package root as `.capture-baseline.ts` (where tsx/NodeNext resolution matches the rest of the test suite). Script was deleted after successful capture, as specified by the plan.

## User Setup Required

None.

## Next Phase Readiness

- `BASELINE_CHARS = 23646` is locked and importable by plan 03's prompt-size regression test.
- Plan 02 (knowledge gating refactor) can now safely modify `knowledge.ts` — the pre-refactor baseline is frozen.
- KGATE-05 ≥35% reduction target: refactored PB1.E1A prompt must come in at ≤ `23646 * 0.65` = 15,369 chars.

## Self-Check: PASSED

- `el-templo-bot/test/fixtures/pb1-e1a-baseline.txt` — FOUND (23,646 chars)
- `el-templo-bot/test/fixtures/pb1-e1a-baseline.ts` — FOUND (exports BASELINE_CHARS=23646)
- Commit `02dacd2b` — FOUND (`test(86-01): capture pre-refactor PB1.E1A baseline fixture`)

---

_Phase: 86-knowledge-gating_
_Completed: 2026-04-14_
