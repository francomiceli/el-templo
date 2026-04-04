---
phase: 89-planes-online-infra
plan: 04
subsystem: ui
tags: [quasar, vue3, admin, planCategory, goalPlan, programs]

requires:
  - phase: 89-02
    provides: "API planCategory enum, linkedProgramId FK, GoalPlanService, isOnlinePlan/isGoalPlan helpers"
provides:
  - "PlanesPage restructured with Presenciales/Online sections and category badges"
  - "ProgramasPage for program catalog management"
  - "PlanFormDialog with planCategory selector, weekly price, linked program"
  - "AssignPlanDialog skip schedule step for online plans"
  - "ProgramWizardDialog with goalPlanType field"
  - "All personalizada naming renamed to goalPlan in admin app"
affects: [89-05-member-app, admin-ui]

tech-stack:
  added: []
  patterns:
    - "PlanCategory-based section filtering (presencialPlans/onlinePlans computed)"
    - "presetCategory prop pattern for context-aware dialog opening"
    - "goalPlanType on programs (not plans) per D-07 REVISED"

key-files:
  created:
    - el-templo-admin/src/types/goal-plan.ts
    - el-templo-admin/src/composables/useGoalPlanAdminApi.ts
    - el-templo-admin/src/pages/ProgramasPage.vue
  modified:
    - el-templo-admin/src/types/subscription.ts
    - el-templo-admin/src/composables/useSessionsApi.ts
    - el-templo-admin/src/pages/PlanesPage.vue
    - el-templo-admin/src/pages/GeneratePage.vue
    - el-templo-admin/src/pages/SessionEditPage.vue
    - el-templo-admin/src/pages/SessionsPage.vue
    - el-templo-admin/src/pages/AlumnoDetailPage.vue
    - el-templo-admin/src/layouts/AdminLayout.vue
    - el-templo-admin/src/router/routes.ts
    - el-templo-admin/src/components/PlanFormDialog.vue
    - el-templo-admin/src/components/AssignPlanDialog.vue
    - el-templo-admin/src/components/ProgramWizardDialog.vue

key-decisions:
  - "API session filter param stays as personalizadaType (matches API contract), only internal variable names renamed to goalPlan"
  - "goalPlanType lives on ProgramWizardDialog (program-level), NOT on PlanFormDialog (plan-level) per D-07 REVISED"
  - "ProgramEnrollmentSection removed from AlumnoDetailPage per D-36 (enrollment only through plan assignment)"
  - "Weekly price formula: Math.round(priceRegular / 4.33) -- priceRegular is always monthly price"

patterns-established:
  - "presetCategory prop: PlanesPage passes 'presencial' or 'online_regular' to PlanFormDialog based on which New button was clicked"
  - "isOnlinePlan computed in AssignPlanDialog gates schedule step visibility"

requirements-completed: [MON-01, MON-02, MON-03, MON-04, MON-05]

duration: 18min
completed: 2026-04-04
---

# Phase 89 Plan 04: Admin Restructure Summary

**Admin PlanesPage split into Presenciales/Online sections with planCategory badges, ProgramasPage for program catalog, PlanFormDialog with category selector and weekly price, and full personalizada->goalPlan rename**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-04T19:11:26Z
- **Completed:** 2026-04-04T19:29:26Z
- **Tasks:** 2
- **Files modified:** 16 (3 created, 3 deleted, 10 modified)

## Accomplishments
- PlanesPage restructured: 2 tabs (Planes/Promos) with Presenciales and Online sections, category badges, weekly price column
- New ProgramasPage with goalPlanType badge column, sidebar entry, and route
- PlanFormDialog fully rewritten with planCategory QSelect, conditional fields, linked program dropdown, weekly price display
- AssignPlanDialog skips schedule step for online plans via isOnlinePlan computed
- ProgramWizardDialog gains goalPlanType field for program-level goal route definition
- Complete personalizada -> goalPlan rename across all admin pages and composables
- ProgramEnrollmentSection component removed (D-36: enrollment only through plan assignment)

## Task Commits

Each task was committed atomically:

1. **Task 1: Types, composables, PlanesPage, ProgramasPage, sidebar, router, page renames** - `d4203f60` (feat)
2. **Task 2: PlanFormDialog, AssignPlanDialog, ProgramWizardDialog updates** - `cf9d02ca` (feat)

## Files Created/Modified
- `el-templo-admin/src/types/subscription.ts` - Added PlanCategory type, labels, colors, options; updated PlanListItem/CreatePlanInput/UpdatePlanInput
- `el-templo-admin/src/types/goal-plan.ts` - New file replacing personalizada.ts with full GoalPlanType rename and centralized options/colors
- `el-templo-admin/src/composables/useGoalPlanAdminApi.ts` - New file replacing usePersonalizadasAdminApi.ts with /admin/goal-plans/ paths
- `el-templo-admin/src/composables/useSessionsApi.ts` - Renamed personalizadaType param to goalPlanType (API query param kept as personalizadaType)
- `el-templo-admin/src/pages/PlanesPage.vue` - Major restructure: 2 tabs, Presenciales/Online sections, category badges, program name column
- `el-templo-admin/src/pages/ProgramasPage.vue` - New program catalog page with goalPlanType badge column
- `el-templo-admin/src/pages/GeneratePage.vue` - Full personalizada -> goalPlan rename
- `el-templo-admin/src/pages/SessionEditPage.vue` - personalizada -> goalPlan rename
- `el-templo-admin/src/pages/SessionsPage.vue` - Full personalizada -> goalPlan rename
- `el-templo-admin/src/pages/AlumnoDetailPage.vue` - personalizada -> goalPlan rename, removed Programas tab
- `el-templo-admin/src/layouts/AdminLayout.vue` - Added Programas sidebar item with school icon
- `el-templo-admin/src/router/routes.ts` - Added /programas route
- `el-templo-admin/src/components/PlanFormDialog.vue` - Replaced toggles with planCategory QSelect, added linkedProgramId, weekly price
- `el-templo-admin/src/components/AssignPlanDialog.vue` - Added isOnlinePlan computed, skip schedule for online
- `el-templo-admin/src/components/ProgramWizardDialog.vue` - Added goalPlanType QSelect field

## Files Deleted
- `el-templo-admin/src/types/personalizada.ts` - Replaced by goal-plan.ts
- `el-templo-admin/src/composables/usePersonalizadasAdminApi.ts` - Replaced by useGoalPlanAdminApi.ts
- `el-templo-admin/src/components/ProgramEnrollmentSection.vue` - Removed per D-36

## Decisions Made
- API session filter parameter stays as `personalizadaType` in query params (matches API contract) while internal variable names use `goalPlanType`
- goalPlanType set on programs via ProgramWizardDialog, NOT on plans via PlanFormDialog (per D-07 REVISED)
- ProgramEnrollmentSection removed entirely (per D-36: enrollment only through plan assignment)
- Weekly price: `Math.round(priceRegular / 4.33)` -- priceRegular is always the monthly price regardless of durationDays

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all data sources are wired to existing API endpoints.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Admin app fully restructured for plan categorization model
- Ready for 89-05 member app restructure (if planned)
- API endpoints already serve planCategory and linkedProgramId from 89-01/89-02

---
*Phase: 89-planes-online-infra*
*Completed: 2026-04-04*
