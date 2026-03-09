---
phase: 46-lifestyle-content-extraction
plan: 01
subsystem: api
tags: [seed-data, lifestyle, habits, areas, typescript]

requires:
  - phase: 45-architecture-foundation
    provides: module boundaries, barrel export pattern, seed data conventions
provides:
  - 17 L1-2 habit seed records with full arete-web field set
  - 6 area definitions with Greek philosophical names
  - HabitSeed, AreaSeed, VerificationType, DataType, AuraScalingThreshold types
affects: [46-lifestyle-content-extraction, lifestyle-module, aura-economy]

tech-stack:
  added: []
  patterns:
    [auraScaling union type (threshold array for timer | flat number for honor)]

key-files:
  created:
    - el-templo-api/src/modules/lifestyle/seed/areas.seed.ts
  modified:
    - el-templo-api/src/modules/lifestyle/seed/habits.seed.ts
    - el-templo-api/src/modules/lifestyle/index.ts

key-decisions:
  - "Full replace of habits.seed.ts from arete-web canonical source (not incremental update from arete-app)"
  - "CUE-04 is Respiracion Tummo at L1 with dataType count (replaces old Respiracion controlada at L2)"
  - "Greek-only philosophy references preserved; all Roman stoic references removed"
  - "Gender-neutral rioplatense tone: vos misma -> vos"
  - "auraScaling stored as-is from source: threshold arrays for timer habits, flat number for honor habits"

patterns-established:
  - "AreaSeed record + AREAS_ORDERED display array pattern for area definitions"
  - "HabitSeed with full verification metadata (verificationType, dataType, auraScaling) for v5.0 implementation"

requirements-completed: [RSTRC-05]

duration: 8min
completed: 2026-03-09
---

# Phase 46 Plan 01: Habits & Areas Seed Data Summary

**17 L1-2 habits with full arete-web field set (verificationType, dataType, auraScaling, facto, imageAsset) and 6 Greek-named area definitions as typed seed data**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-09T15:24:31Z
- **Completed:** 2026-03-09T15:32:40Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Fully replaced habits.seed.ts from arete-web canonical source with all new fields (verificationType, dataType, auraScaling, linkedQuoteArea, facto, imageAsset) plus inline details (howTo, whyItMatters, tips)
- Created areas.seed.ts with 6 area definitions (Nous, Soma, Sophrosyne, Praxis, Philia, Theoria) including philosophy text and metadata
- Updated barrel exports with new type exports (VerificationType, DataType, AuraScalingThreshold)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create areas.seed.ts with 6 area definitions** - `660b6fc` (feat)
2. **Task 2: Replace habits.seed.ts with full arete-web field set** - `170dcb9` (feat)

## Files Created/Modified

- `el-templo-api/src/modules/lifestyle/seed/areas.seed.ts` - 6 area definitions with Greek names, philosophy text, colors, icons, habit prefixes
- `el-templo-api/src/modules/lifestyle/seed/habits.seed.ts` - 17 L1-2 habits with full arete-web field set and inline details
- `el-templo-api/src/modules/lifestyle/index.ts` - Updated barrel with new type exports

## Decisions Made

- Full replace from arete-web (not incremental update): old file had incomplete fields from deprecated arete-app
- CUE-04 is "Respiracion Tummo" at minLevel 1 with dataType 'count' (arete-web canonical, replaces old "Respiracion controlada" at L2)
- Gender-neutral rioplatense: "vos misma" in area philosophyText adapted to "vos"
- Greek-only philosophy references preserved throughout (aligns with El Templo's temple identity)
- auraScaling stored as union type: AuraScalingThreshold[] for timer habits, flat number for honor habits

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Habit and area seed data ready for 46-02 (factos, tools, journal questions)
- All new arete-web fields captured for v5.0 lifestyle module implementation
- Barrel exports updated, full project type check passes

## Self-Check: PASSED

- All created files verified on disk
- All commit hashes verified in git log

---

_Phase: 46-lifestyle-content-extraction_
_Completed: 2026-03-09_
