---
phase: 59-schema-extensions-data-import
plan: 04
subsystem: ui, api
tags: [admin, subscriptions, bulk-migration, legacy-plans, archived]

# Dependency graph
requires:
  - phase: 59-01
    provides: isArchived column on subscription_plans table
  - phase: 59-03
    provides: imported legacy plans with isArchived=true
provides:
  - isArchived field exposed in plan list API response
  - includeArchived query parameter on list plans endpoint
  - Archived plan assignment guard in subscription service
  - POST /admin/subscriptions/bulk-migrate endpoint
  - Legacy plan warning badges on AlumnosPage member list
  - Plan filter with archived plan visibility
  - Selection checkboxes and bulk migration dialog in AlumnosPage
affects: [admin-ui, subscriptions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [bulk-operation-with-per-item-error-handling, archived-entity-filtering]

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-api/src/modules/subscriptions/schemas.ts
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/routes.ts
    - el-templo-admin/src/types/subscription.ts
    - el-templo-admin/src/pages/AlumnosPage.vue
    - el-templo-admin/src/composables/useMembersApi.ts

key-decisions:
  - "Bulk migration sets pricePaid=0 for migrated subscriptions (admin adjusts later)"
  - "Plan filter uses separator label ('--- Archivados ---') to visually group archived plans"
  - "Legacy detection compares member planName against archived plan names set (no extra API field needed)"

patterns-established:
  - "Bulk operation pattern: per-item try/catch with migrated/skipped/errors result aggregation"
  - "Archived entity filtering: includeArchived=false by default, opt-in via query param"

requirements-completed: [DATA-05]

# Metrics
duration: 6min
completed: 2026-03-16
---

# Phase 59 Plan 04: Legacy Plan Admin Support Summary

**Admin UI for archived legacy plans with warning badges, plan filter with archived grouping, selection checkboxes, and bulk plan migration endpoint**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-16T17:56:47Z
- **Completed:** 2026-03-16T18:03:23Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- isArchived flows from DB through API to admin frontend for plan listings
- Members on legacy/archived plans show "Plan legacy" warning badge in AlumnosPage
- Plan filter includes archived plans with visual distinction (italic gray, separator)
- Bulk migration endpoint cancels old subscription and creates new one per member
- Selection checkboxes with select-all-on-page and bulk actions bar
- Archived plans blocked from new member assignment

## Task Commits

Each task was committed atomically:

1. **Task 1: Add isArchived to subscription types/schemas/service and bulk-migrate API endpoint** - `adcdc0e8` (feat)
2. **Task 2: Update AlumnosPage with legacy plan badges, filter toggle, and bulk migration dialog** - `618d9f82` (feat)

## Files Created/Modified

- `el-templo-api/src/modules/subscriptions/types.ts` - Added isArchived to PlanListItem, BulkMigrateInput/Result types
- `el-templo-api/src/modules/subscriptions/schemas.ts` - Added isArchived to plan schema, includeArchived query param, bulk migrate schema
- `el-templo-api/src/modules/subscriptions/service.ts` - listPlans with includeArchived filter, archived plan guard, bulkMigratePlan method
- `el-templo-api/src/modules/subscriptions/routes.ts` - includeArchived on GET /plans, POST /bulk-migrate endpoint
- `el-templo-admin/src/types/subscription.ts` - Added isArchived to PlanListItem, BulkMigrateResult type
- `el-templo-admin/src/pages/AlumnosPage.vue` - Selection checkboxes, legacy badges, plan filter with archived grouping, bulk migration dialog
- `el-templo-admin/src/composables/useMembersApi.ts` - getPlans with includeArchived param, bulkMigratePlan method

## Decisions Made

- Bulk migration sets pricePaid=0 for migrated subscriptions since these are admin-initiated migrations from legacy plans, not new purchases
- Plan filter uses a separator label to visually group archived plans below current ones
- Legacy detection uses a computed Set of archived plan names for O(1) lookups per member row

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 59 is now complete (all 4 plans executed)
- Legacy plans from CSV import are visible and manageable in admin UI
- Admin can now identify and bulk-migrate members off legacy plans to current plans

---

_Phase: 59-schema-extensions-data-import_
_Completed: 2026-03-16_
