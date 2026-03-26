---
phase: 74-business-data-integration
plan: 02
subsystem: ai
tags: [whatsapp-bot, google-maps, branch-addresses, business-data, testing]

requires:
  - phase: 74-business-data-integration
    provides: knowledge.ts with structured business data and system prompt injection
provides:
  - Correct Mar del Plata addresses for all 5 branches in get_location tool
  - Real Google Maps short links (goo.gl) for all 5 branches
  - Exported BRANCH_ADDRESSES and BRANCH_MAPS_LINKS for direct import
  - Knowledge accuracy test suite (19 tests covering pricing, branches, ROM, trial, app help)
affects: [future address updates, bot response accuracy]

tech-stack:
  added: []
  patterns:
    - "Exported address/maps constants from tools.ts for testability"
    - "normalizeBranchCode helper for robust DB code matching"
    - "Name-based fallback matching when branch code doesn't match"

key-files:
  created:
    - el-templo-bot/test/knowledge.test.ts
  modified:
    - el-templo-bot/src/ai/tools.ts

key-decisions:
  - "Exported BRANCH_ADDRESSES and BRANCH_MAPS_LINKS for direct test import rather than testing via DB queries"
  - "normalizeBranchCode alias map for mario_bravo/mariobravo variations"
  - "Name-based fallback lookup when normalized code not found in address maps"
  - "Fallback to generated Maps search URL only when no real goo.gl link exists"

patterns-established:
  - "Knowledge accuracy tests: import constants directly and assert against source-of-truth values"

requirements-completed: [BIZ-02]

duration: 2min
completed: 2026-03-26
---

# Phase 74 Plan 02: Location Data & Knowledge Tests Summary

**Fixed get_location tool with correct Mar del Plata addresses and real Google Maps links for all 5 branches, plus 19 automated tests verifying business data accuracy**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-26T16:26:17Z
- **Completed:** 2026-03-26T16:28:23Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Replaced wrong San Miguel de Tucuman addresses with correct Mar del Plata addresses for all 5 branches
- Added Moreno and Mario Bravo branches that were previously missing from get_location
- Replaced generated Google Maps search URLs with real goo.gl short links
- Added 19 tests verifying pricing, branch data, ROM, trial flow, app help, and system prompt integration

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix get_location tool with real addresses and Maps links** - `c4a2320a` (feat)
2. **Task 2: Add knowledge data accuracy tests** - `f5ab87d0` (test)

## Files Created/Modified

- `el-templo-bot/src/ai/tools.ts` - Updated BRANCH_ADDRESSES with 5 correct addresses, added BRANCH_MAPS_LINKS with goo.gl links, added normalizeBranchCode helper, updated formatBranchLocations to use real Maps links
- `el-templo-bot/test/knowledge.test.ts` - 19 tests across 3 describe blocks verifying knowledge data accuracy, branch address data, and system prompt integration

## Decisions Made

- Exported BRANCH_ADDRESSES and BRANCH_MAPS_LINKS for direct test import (cleaner than testing through DB-dependent getLocation function)
- Added normalizeBranchCode with alias map to handle mario_bravo/mariobravo/mario-bravo variations from DB
- Name-based fallback matching (checks if row.name contains any canonical key) as second resolution strategy
- Kept generated Maps search URL as fallback for any future branches not yet in BRANCH_MAPS_LINKS

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All business data (knowledge + addresses + Maps links) is now correct and tested
- Phase 74 plans are complete; bot has accurate business data for all user-facing queries

## Self-Check: PASSED

- All files exist (tools.ts, knowledge.test.ts, 74-02-SUMMARY.md)
- Both commits verified (c4a2320a, f5ab87d0)
- Must-haves confirmed: Mario Bravo present, exports present, test file 163 lines (>40)

---

_Phase: 74-business-data-integration_
_Completed: 2026-03-26_
