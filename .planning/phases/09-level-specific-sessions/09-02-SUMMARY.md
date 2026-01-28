---
phase: 09-level-specific-sessions
plan: 02
subsystem: api
tags: [typescript, exercise-selection, fallback, format-selection, high-intensity]

# Dependency graph
requires:
  - phase: 09-01
    provides: ExerciseLevel type, memberLevel in BlockContext and ExerciseRequirements
provides:
  - Level-specific Tier 0 exercise matching using member's exact level
  - High-intensity level shift (90%+) advancing exercises one level up
  - Format selection using memberLevel instead of levelGroup
  - Trace events for HIGH_INTENSITY_LEVEL_SHIFT decisions
affects: [09-03-service-integration, session-generation, exercise-fallback]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - High-intensity level advancement pattern (90%+ intensity -> next level)
    - Tier 0 exact level matching before widening to level group

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/sessions/fallback/exercise-fallback.ts
    - el-templo-api/src/modules/sessions/pipeline/stage-6-exercises.ts
    - el-templo-api/src/modules/sessions/pipeline/stage-5-format.ts

key-decisions:
  - "Tier 0 uses [memberLevel] only for exact match, Tier 1 relaxes difficulty with same level, Tier 2+ widens to level group"
  - "High-intensity blocks (>=90%) pull exercises from one level above with difficulty=1"
  - "Spartan level maps to omega for format compatibility (no spartan in format_compatibility table)"
  - "Format selection uses memberLevel directly instead of levelGroupToLevel() helper"

patterns-established:
  - "LEVEL_PROGRESSION array defines advancement path: alfa -> delta -> sigma -> omega -> spartan"
  - "getExpandedLevels uses tier - 2 indexing since Tier 0-1 use exact level"
  - "HIGH_INTENSITY_LEVEL_SHIFT trace events record all level advancement decisions"

# Metrics
duration: 2min
completed: 2026-01-28
---

# Phase 09 Plan 02: Exercise Selection by Member Level Summary

**Exercise fallback refactored to match member's exact level at Tier 0, advance one level at 90%+ intensity, and use memberLevel for format selection instead of levelGroup representative**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-28T03:03:33Z
- **Completed:** 2026-01-28T03:05:35Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Tier 0 fallback now uses member's exact level (e.g., alfa member gets alfa exercises, delta gets delta)
- High-intensity blocks (>=90%) pull exercises from one level above with difficulty=1
- Format selection uses memberLevel directly (spartan maps to omega for compatibility)
- Fixed getExpandedLevels indexing to use tier - 2 (Tier 0-1 use exact level, Tier 2+ widens)
- Trace events record all level shift decisions with HIGH_INTENSITY_LEVEL_SHIFT

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor exercise fallback for level-specific Tier 0 and high-intensity shift** - `dd5eb13` (feat)
2. **Task 2: Update stage-6-exercises to pass memberLevel and apply high-intensity shift** - `bf89e17` (feat)
3. **Task 3: Fix format selection to use memberLevel directly** - `cf00a7a` (feat)

## Files Created/Modified
- `el-templo-api/src/modules/sessions/fallback/exercise-fallback.ts` - Extract memberLevel from requirements, Tier 0 uses [memberLevel] only, fixed getExpandedLevels indexing
- `el-templo-api/src/modules/sessions/pipeline/stage-6-exercises.ts` - Added LEVEL_PROGRESSION, high-intensity detection, targetLevel shift logic, passes memberLevel to fallback
- `el-templo-api/src/modules/sessions/pipeline/stage-5-format.ts` - Uses ctx.memberLevel instead of levelGroupToLevel(), maps spartan to omega

## Decisions Made

**1. Tier 0 uses exact member level**
- Changed from `currentLevels = allowedLevels` to `currentLevels = [memberLevel]`
- Rationale: Core behavioral change - Alfa and Delta members now get different exercises for same block

**2. High-intensity level shift at 90%+**
- Intensity >= 90% advances exercises one level up (alfa -> delta, omega -> spartan)
- Uses difficulty=1 from upper level (easiest exercises from harder level)
- Rationale: Progressive overload for high-intensity blocks

**3. Spartan maps to omega for format compatibility**
- Format lookup converts spartan -> omega
- Rationale: format_compatibility table has alfa/delta/sigma/omega but no spartan row

**4. getExpandedLevels indexing correction**
- Changed from `tier - 1` to `tier - 2`
- Rationale: Tier 0-1 now use exact member level, Tier 2 is first widening tier

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. TypeScript compilation shows expected errors in:
- `routes.ts` (missing memberLevel in GenerateSessionInput calls)

These errors are intentional and will be fixed in Plan 09-03 (Service Integration) as documented in the plan verification section.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Plan 09-03 (Service Integration)**
- Exercise selection now filters by memberLevel at Tier 0
- Format selection uses memberLevel for compatibility lookup
- High-intensity shift logic implemented and traced
- routes.ts needs to pass memberLevel to service layer

**Blockers:**
None. Core pipeline logic complete, ready for service layer integration.

**Concerns:**
None. TypeScript errors in routes.ts are expected and scoped to Plan 09-03.

---
*Phase: 09-level-specific-sessions*
*Completed: 2026-01-28*
