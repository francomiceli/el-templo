---
phase: 46-lifestyle-content-extraction
plan: 02
subsystem: api
tags:
  [
    seed-data,
    factos,
    journal-questions,
    philosophical-tools,
    barrel-export,
    typescript,
  ]

# Dependency graph
requires:
  - phase: 46-lifestyle-content-extraction
    provides: habits.seed.ts and areas.seed.ts from plan 01
provides:
  - 46 curated factos across all 7 categories from arete-web canonical source
  - 35 simple-tier journal questions from eligible brands (both + arete)
  - 5 philosophical tool frameworks verified and translated to Spanish
  - Complete lifestyle barrel export re-exporting all 5 seed files
affects: [lifestyle-module, v5-lifestyle-features]

# Tech tracking
tech-stack:
  added: []
  patterns: [as-const-satisfies-readonly, brand-field-dropped-at-extraction]

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/lifestyle/seed/factos.seed.ts
    - el-templo-api/src/modules/lifestyle/seed/journal-questions.seed.ts
    - el-templo-api/src/modules/lifestyle/seed/tools.seed.ts
    - el-templo-api/src/modules/lifestyle/index.ts

key-decisions:
  - "Curated 46 factos from 172 eligible with diverse category spread: filosofia(14), ciencia(9), bienestar(7), guerra(6), politica(5), arte(4), deporte(1)"
  - "Translated all tool framework inputs/outputs from English to Spanish for brand consistency"
  - "Added AREAS_ORDERED and HabitArea/HabitMoment types to barrel export for downstream consumption"

patterns-established:
  - "Brand field dropped at extraction time: seed types don't carry brand, all content is El Templo"
  - "Journal question category type uses union for forward compatibility: 'simple' | 'deep' | 'philosophical'"

requirements-completed: [RSTRC-05]

# Metrics
duration: 5min
completed: 2026-03-09
---

# Phase 46 Plan 02: Factos, Journal Questions, Tools, and Barrel Export Summary

**46 curated factos across 7 categories, 35 simple-tier journal questions, 5 philosophical tools translated to Spanish, and complete lifestyle barrel export**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-09T15:24:58Z
- **Completed:** 2026-03-09T15:30:57Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Curated 46 factos from arete-web's 160-facto catalog with diverse category coverage across all 7 categories
- Extracted all 35 simple-tier journal questions from eligible brands (24 universal + 11 arete-adapted)
- Verified and translated all 5 philosophical tool frameworks from English to Spanish
- Updated lifestyle barrel export to re-export all 5 seed files with complete type coverage

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace factos.seed.ts + journal-questions.seed.ts** - `82d07ee` (feat)
2. **Task 2: Verify tools.seed.ts + update barrel export** - `7fd9308` (feat)

## Files Created/Modified

- `el-templo-api/src/modules/lifestyle/seed/factos.seed.ts` - 46 curated factos with FactoSeed type, bienestar category added
- `el-templo-api/src/modules/lifestyle/seed/journal-questions.seed.ts` - 35 simple-tier questions with minLevel field preserved
- `el-templo-api/src/modules/lifestyle/seed/tools.seed.ts` - Header updated, all framework strings translated to Spanish
- `el-templo-api/src/modules/lifestyle/index.ts` - Barrel export re-exporting all 5 seed files (types + constants)

## Decisions Made

- Curated 46 factos (within 40-50 target) prioritizing Greek/classical figures with modern science variety
- Added `bienestar` to FactoSeed category union type (old file only had 6 categories, arete-web has 7)
- Kept `minLevel` field in JournalQuestionSeed for forward compatibility even though all starter questions are level 1
- Translated tool framework inputs/outputs to Spanish (plan noted "brand adaptation needed" -- English strings were inconsistent with rioplatense content)
- Added AREAS_ORDERED constant to barrel export (useful downstream for ordered area rendering)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Translated tool framework strings from English to Spanish**

- **Found during:** Task 2 (tools.seed.ts verification)
- **Issue:** Framework input/output strings were in English while all prompts and user-facing content is in rioplatense Spanish
- **Fix:** Translated all input, output, and Tabla del Estratega prompt strings to Spanish
- **Files modified:** el-templo-api/src/modules/lifestyle/seed/tools.seed.ts
- **Verification:** TypeScript compiles, content verified coherent
- **Committed in:** 7fd9308 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 - consistency)
**Impact on plan:** Essential for brand consistency. No scope creep.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 5 seed files complete: habits, areas, factos, journal-questions, tools
- Barrel export wires everything together
- Ready for v5.0 lifestyle module implementation (DB tables, seeding, API routes)
- Deferred content documented in DEFERRED-CONTENT.md for future phases

---

_Phase: 46-lifestyle-content-extraction_
_Completed: 2026-03-09_
