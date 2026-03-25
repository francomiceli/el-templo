---
phase: 46-lifestyle-content-extraction
plan: 02
subsystem: api
tags: [seed-data, stoic-content, philosophical-tools, content-curation]

# Dependency graph
requires:
  - phase: 45-architecture-foundation
    provides: module barrel export convention, lifestyle module directory
provides:
  - 42 curated stoic/warrior factos as typed seed data
  - 5 philosophical tool definitions with framework structures
  - Complete deferred content inventory for v5.0 planning
  - Lifestyle module barrel export re-exporting all seed types
affects: [lifestyle-features, aura-economy, v5-content-expansion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      as-const-satisfies for readonly typed seed arrays,
      framework-as-data pattern for tool definitions,
    ]

key-files:
  created:
    - el-templo-api/src/modules/lifestyle/seed/factos.seed.ts
    - el-templo-api/src/modules/lifestyle/seed/tools.seed.ts
    - el-templo-api/src/modules/lifestyle/seed/DEFERRED-CONTENT.md
    - el-templo-api/src/modules/lifestyle/index.ts

key-decisions:
  - "Curated 42 factos (not all 55 from plan enumeration) to meet ~40 target -- trimmed larger groups while preserving brand-critical selections"
  - "Framework-as-data pattern: tool definitions capture questions/dimensions/output as structured objects, not UI code"

patterns-established:
  - "Seed curation pattern: select from reference codebase by brand fit, document exclusions"
  - "Deferred content catalog: structured inventory with counts, shapes, brand distribution, and adaptation notes"

requirements-completed: [RSTRC-05]

# Metrics
duration: 8min
completed: 2026-03-08
---

# Phase 46 Plan 02: Factos, Tools, and Deferred Content Summary

**42 curated stoic/warrior factos, 5 philosophical tool frameworks, and complete deferred content inventory for v5.0**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-08T19:17:00Z
- **Completed:** 2026-03-08T19:25:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Curated 42 factos from Arete's 60 universal catalog, prioritizing stoic warriors and classical philosophy figures (Marco Aurelio, Seneca, Epicteto, Socrates, Leonidas/Esparta, Diogenes, Zenon)
- Extracted 5 philosophical tool definitions (Las 4 Pruebas, Mapa de Friccion, Tabla de Poder, Tabla del Estratega, Test de Virtud) with framework structures capturing questions, dimensions, and output logic
- Created comprehensive deferred content inventory cataloging all 6 categories of Arete content not in the starter set (habits L3+, journal L3+, challenges, revelations, gamification, skipped content)
- Created lifestyle module barrel export following the aura module pattern from Phase 45

## Task Commits

Each task was committed atomically:

1. **Task 1: Curate ~40 factos and extract 5 philosophical tool definitions** - `53bdb89` (feat)
2. **Task 2: Create deferred content catalog and lifestyle module barrel export** - `c4b60d3` (feat)

## Files Created/Modified

- `el-templo-api/src/modules/lifestyle/seed/factos.seed.ts` - 42 curated factos with FactoSeed type, as const satisfies pattern
- `el-templo-api/src/modules/lifestyle/seed/tools.seed.ts` - 5 philosophical tool definitions with PhilosophicalToolSeed type and ToolFramework structure
- `el-templo-api/src/modules/lifestyle/seed/DEFERRED-CONTENT.md` - Complete inventory of all deferred Arete content with counts, shapes, brand distribution, and adaptation notes
- `el-templo-api/src/modules/lifestyle/index.ts` - Module barrel export re-exporting all seed types (full compilation requires Plan 01 files)

## Decisions Made

- Curated 42 factos instead of including all 55 enumerated in the plan. The plan's per-figure "INCLUDE ALL" instructions would yield 55 factos, exceeding the "not more than 45" verification criteria. Trimmed redundant entries from larger groups (Marco Aurelio 10->6, Seneca 8->5, Epicteto 6->4, Socrates 5->4, Esparta 4->3, Diogenes 3->2, Zenon 3->2) while preserving all brand-critical selections.
- Used framework-as-data pattern for tool definitions: each tool's questions, dimensions, and output logic are captured as typed structured objects rather than copying UI component code. This decouples the intellectual model from the React Native UI.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan enumeration count mismatch**

- **Found during:** Task 1
- **Issue:** Plan's per-figure INCLUDE instructions enumerate 55 factos total but state "This gives ~40-42 factos" and verification requires "not more than 45, not fewer than 35"
- **Fix:** Used Claude discretion clause ("aim for ~40") to curate 42 factos by trimming larger groups while keeping strongest selections
- **Files modified:** el-templo-api/src/modules/lifestyle/seed/factos.seed.ts
- **Verification:** Final count is 42, within 35-45 range

---

**Total deviations:** 1 auto-fixed (1 bug -- plan count mismatch)
**Impact on plan:** Corrected to meet the plan's own verification criteria. All brand-critical factos preserved.

## Issues Encountered

- Barrel export (`index.ts`) will not fully compile until Plan 01 runs (habits.seed.ts and journal-questions.seed.ts do not exist yet). This is documented in the plan and expected for parallel execution.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All lifestyle seed data complete (pending Plan 01 for habits and journal questions)
- Deferred content catalog ready for v5.0 planning reference
- Module barrel export wired up, will compile fully after Plan 01

## Self-Check: PASSED

All 4 created files verified on disk. Both task commits (53bdb89, c4b60d3) verified in git log.

---

_Phase: 46-lifestyle-content-extraction_
_Completed: 2026-03-08_
