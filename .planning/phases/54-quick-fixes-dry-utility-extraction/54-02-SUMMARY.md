---
phase: 54-quick-fixes-dry-utility-extraction
plan: 02
subsystem: ui
tags: [dry, refactor, utils, admin, app, error-handling, date-formatting]

# Dependency graph
requires:
  - phase: 54-quick-fixes-dry-utility-extraction
    provides: shared error module pattern established in plan 01
provides:
  - "Shared extractError utility for all admin API composables"
  - "Shared formatDate utility for admin pages/components"
  - "Shared formatDate utility for app pages/components"
affects: [el-templo-admin, el-templo-app]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared utility imports for cross-cutting concerns (error extraction, date formatting)"

key-files:
  created:
    - el-templo-admin/src/utils/extract-error.ts
    - el-templo-admin/src/utils/format-date.ts
    - el-templo-app/src/utils/format-date.ts
  modified:
    - el-templo-admin/src/composables/*.ts (13 files)
    - el-templo-admin/src/pages/AlumnoDetailPage.vue
    - el-templo-admin/src/pages/BlogListPage.vue
    - el-templo-admin/src/pages/FranchiseDetailPage.vue
    - el-templo-admin/src/pages/FranchiseListPage.vue
    - el-templo-admin/src/pages/PagosPage.vue
    - el-templo-admin/src/components/AssignPlanDialog.vue
    - el-templo-admin/src/components/MemberPaymentTab.vue
    - el-templo-admin/src/components/MemberSubscriptionTab.vue
    - el-templo-app/src/pages/ProfilePage.vue
    - el-templo-app/src/modules/progression/components/JourneySection.vue

key-decisions:
  - "Unified extractError to check both .error and .message response fields (most complete variant)"
  - "Left non-standard formatDate variants untouched (month:long, includes time, Date input, DD/MM format)"
  - "DayCard.vue formatDate delegates to formatShortDate composable -- not a duplicate, left as-is"
  - "JourneySection.vue locale standardized from es-ES to es-AR for consistency"

patterns-established:
  - "extractError import: all admin composables import from src/utils/extract-error"
  - "formatDate import: admin/app pages import from src/utils/format-date for standard date display"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-03-11
---

# Phase 54 Plan 02: DRY Utility Extraction Summary

**Extracted 30+ duplicate extractError and formatDate definitions into 3 shared utility files across admin and app repos**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-11T20:43:21Z
- **Completed:** 2026-03-11T20:51:00Z
- **Tasks:** 2
- **Files modified:** 26

## Accomplishments

- Eliminated 13 duplicate extractError definitions in admin composables with single shared utility
- Eliminated 10 duplicate formatDate definitions across admin pages/components with shared utility
- Eliminated 2 duplicate formatDate definitions in app pages/components with shared utility
- Standardized error extraction to check both `.error` and `.message` response data fields

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shared extractError utility and update all 13 admin composables** - `5715a3f` (refactor)
2. **Task 2: Create shared formatDate utilities and update all admin/app consumers** - `1120898` (refactor)

## Files Created/Modified

- `el-templo-admin/src/utils/extract-error.ts` - Shared Axios error extraction for all composables
- `el-templo-admin/src/utils/format-date.ts` - Shared es-AR date formatting for admin pages
- `el-templo-app/src/utils/format-date.ts` - Shared es-AR date formatting for app pages
- 13 admin composables - Replaced local extractError with shared import
- 7 admin pages + 3 admin components - Replaced local formatDate with shared import
- 1 app page + 1 app component - Replaced local formatDate with shared import

## Decisions Made

- Unified extractError to use the most complete variant (checks `.error` then `.message` on response data)
- Kept axios import in usePaymentsApi and useSubscriptionsApi (used for 404 status checks beyond extractError)
- Left 6 non-standard formatDate variants untouched: MemberProfileTab (month:'long'), MemberAttendanceTab (includes time), SessionDetailPage (nullable + time), AnaliticasPage (Date input), AlumnosPage (DD/MM/YYYY), HorariosPage (formatDateISO)
- DayCard.vue not updated -- its formatDate delegates to formatShortDate composable, not a duplicate

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Task 1 was already committed by a previous agent**

- **Found during:** Task 1 (extractError extraction)
- **Issue:** Commit `5715a3f` already contained all extractError changes from a prior session
- **Fix:** Verified the commit contained correct changes for all 13 composables, used existing commit
- **Impact:** No rework needed, task 1 already complete

---

**Total deviations:** 1 (pre-existing commit detected)
**Impact on plan:** No scope creep. Task 1 was already done; Task 2 executed as planned.

## Issues Encountered

- Pre-existing type errors in admin (pdf builder) and app (Vite env types, missing .vue declarations) unrelated to changes -- ignored per scope boundary rule.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Admin and app utils directories now have established patterns for shared utilities
- Phase 54 Plan 03 can proceed (if not already complete)

## Self-Check: PASSED

- All 3 utility files exist on disk
- Both task commits found in git history (5715a3f, 1120898)
- Verification greps confirm zero unintended local definitions remain

---

_Phase: 54-quick-fixes-dry-utility-extraction_
_Completed: 2026-03-11_
