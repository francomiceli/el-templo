---
phase: 129-nivel-kairos-enum-herencia-de-alfa-y-formato-lineal
plan: 02
subsystem: session-generation
tags:
  [
    kairos,
    session-pipeline,
    generation-gate,
    linear-format,
    vitest,
    regression-test,
  ]

# Dependency graph
requires:
  - phase: 129-01
    provides: kairos as a first-class member level (enum 0140), ContentLevel type, toContentLevel(), kairos->alfa_delta level-group mapping
  - phase: 99-session-generation
    provides: the BlockContext pipeline (stage-3 budget / stage-5 format / stage-6 exercises) + INITIUM pipeline this gate hooks into
provides:
  - "Kairos generation gate: a session generated for memberLevel='kairos' inherits Alfa exercises at dificultadLineal=1, forces a linear sets-by-reps format on every block, and limits every block (INITIUM included) to exactly 2 exercises"
  - "isKairos(memberLevel) single-chokepoint predicate + KAIROS_* constants (block size, linear format name + fallback, inherited level, dificultadLineal) centralized in utils/kairos.ts"
  - "queryFormatByName() in format-fallback.ts: fetch a format directly by name (used to force the linear format, bypassing the compatibility matrix)"
  - "Unit-level gate test proving KAIROS-02/03 + the D-07 non-kairos regression invariant at all four injection points"
affects: [130 kairos default+selector, session-pipeline, new-training-system]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure additive gate branch: every kairos behavior is gated behind isKairos(ctx.memberLevel); non-kairos paths are byte-for-byte unchanged (D-07), proven by a dedicated regression test"
    - "Unit-level pipeline test (mock DB + mock fallback modules, call the real gated functions directly) — same fidelity as test/unit/rom-generator.test.ts — when full SPOM-seeded generation is not CI-runnable"

key-files:
  created:
    - el-templo-api/test/unit/kairos-gate.test.ts
  modified:
    - el-templo-api/src/modules/sessions/pipeline/utils/kairos.ts
    - el-templo-api/src/modules/sessions/pipeline/stage-3-budget.ts
    - el-templo-api/src/modules/sessions/pipeline/stage-5-format.ts
    - el-templo-api/src/modules/sessions/pipeline/stage-6-exercises.ts
    - el-templo-api/src/modules/sessions/pipeline/initium-pipeline.ts
    - el-templo-api/src/modules/sessions/fallback/format-fallback.ts

decisions:
  - "Task 2 implemented as Option B: a deterministic, CI-runnable UNIT test that mocks the DB + fallback modules and calls the real gated pipeline functions directly. Full SPOM-seeded end-to-end generation is NOT runnable in CI here (SPOM CSVs live in git-ignored .docs/ and seedSPOM() is mis-pathed), so the plan's original integration-test approach against eltemplo_test is not feasible. The gate is proven at the same fidelity the existing generation tests use (rom-generator.test.ts)."
  - "Test placed at test/unit/kairos-gate.test.ts (unit-style, mocked) rather than the plan's test/sessions/kairos-generation.test.ts path, to sit alongside its sibling rom-generator.test.ts and signal it is a unit (not integration) test."
  - "Forced linear format = 'Singlet' (fallback 'For Quality') — both seeded sets-by-reps formats. 'Straight Sets' is NOT in the seed and deliberately avoided."

metrics:
  duration: ~25m
  completed: 2026-06-05
  tasks: 2
  files-created: 1
  files-modified: 6
---

# Phase 129 Plan 02: Kairos Generation Gate Summary

Gate session generation behind `isKairos(ctx.memberLevel)` so a kairos session inherits Alfa exercises at the lowest linear rung (dificultadLineal=1), forces a linear sets-by-reps format on every block, and caps every block (INITIUM included) at exactly 2 exercises — while leaving all non-kairos generation byte-for-byte unchanged (D-07).

## What Was Built

**Task 1 (committed `5ad5603e`, pre-existing at session start):** the `isKairos` gate helper + `KAIROS_*` constants in `utils/kairos.ts`, plus the four minimal pipeline injection points:

- **stage-3-budget.ts** — non-INITIUM kairos block forced to `{min:2, max:2}` (D-05); `KAIROS_BLOCK_SIZE_FORCED` trace.
- **stage-5-format.ts** — kairos returns the linear format by name (`Singlet`, fallback `For Quality`) BEFORE the compatibility-matrix ladder; throws a seed-integrity error if neither exists (D-04); `KAIROS_FORMAT_FORCED` trace.
- **stage-6-exercises.ts** — kairos overrides `allowedLevels=['alfa']`, `min=max dificultadLineal=1`, `targetLevel='alfa'`, bypassing the Nivel-Superior / high-intensity shift (D-03); `KAIROS_INHERIT_ALFA` trace.
- **initium-pipeline.ts** — kairos forces 2 INITIUM exercises and the linear format (D-04/D-05); `KAIROS_INITIUM_SIZE_FORCED` + `KAIROS_INITIUM_FORMAT_FORCED` traces.
- **format-fallback.ts** — new `queryFormatByName()` helper.

**Task 2 (this session, committed `166fccdc`):** `test/unit/kairos-gate.test.ts` — a deterministic, CI-runnable unit test (Option B) that mocks the DB + the two fallback modules and calls the real gated functions directly. It proves:

- `isKairos` is true only for `'kairos'`, false for every other level.
- **Stage-3:** kairos non-INITIUM bounds = `{2,2}`; alfa bounds UNCHANGED (`{1,3}`).
- **Stage-5:** kairos forces `Singlet` before the ladder (and `selectFormatWithFallback` is never called); `For Quality` fallback when Singlet absent; seed-integrity throw when neither exists; alfa uses the matrix ladder unchanged (by-name lookup never runs).
- **Stage-6:** kairos forwards `allowedLevels=['alfa']`, `min=max dificultadLineal=1`, `memberLevel='alfa'` to the selector; alfa forwards `['alfa','delta']` with an unclamped difficulty range.
- **INITIUM:** kairos → 2 exercises + `Singlet`; alfa → 4 exercises + level-agnostic metcon, with each variant's traces asserted.
- **D-07 regression:** alfa AND delta take the unchanged branch at every gate point (no kairos trace, no alfa-only restriction, no 2/2 clamp, no by-name format lookup).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 2 retargeted from integration to unit (Option B)**

- **Found during:** Task 2 planning. The plan specified an integration test at `test/sessions/kairos-generation.test.ts` running real `generateDailySession()` against `eltemplo_test`.
- **Issue:** Full SPOM-seeded generation is not CI-runnable here — the SPOM CSVs live in the git-ignored `.docs/` tree and `seedSPOM()` is mis-pathed, so a real session cannot be generated deterministically in CI. This is a pre-existing infra gap, not introduced by this plan.
- **Fix:** Per the orchestrator's Option B decision, wrote a unit-level gate test that mocks the DB + fallback modules and exercises the REAL gated pipeline functions directly (mirroring `test/unit/rom-generator.test.ts`). Same fidelity as the existing generation tests. Placed at `test/unit/kairos-gate.test.ts`.
- **Files modified:** `el-templo-api/test/unit/kairos-gate.test.ts` (created).
- **Commit:** `166fccdc`

## Known Stubs

None. The gate is fully wired; no placeholder data paths introduced.

## Infra Gap (carried, not introduced)

Full end-to-end SPOM-seeded session generation is not CI-runnable in this repo (SPOM CSVs are git-ignored under `.docs/`; `seedSPOM()` is mis-pathed). The kairos gate is therefore proven at the unit level — the same fidelity the existing `rom-generator.test.ts` generation tests use. If/when the SPOM seed is fixed for CI, an end-to-end kairos generation test can be added on top of this gate without changing the gate code.

## Verification

- `cd el-templo-api && pnpm exec tsc --noEmit` → exit 0.
- `isKairos` gate present at stage-3, stage-5, stage-6, initium-pipeline (Task 1).
- `utils/kairos.ts` centralizes linear format name + block size + inherited level + dificultadLineal (Task 1).
- `test/unit/kairos-gate.test.ts` exists with the kairos gate assertions + the D-07 regression describe block.
- Full vitest run deferred to CI (project policy: tests run in CI, not local). Stay on `staging`, do NOT push — flag the user to push to `staging` so CI runs the suite.

## Self-Check: PASSED

- FOUND: el-templo-api/test/unit/kairos-gate.test.ts
- FOUND commit: 166fccdc (test 129-02)
- FOUND commit: 5ad5603e (Task 1 gate 129-02)
