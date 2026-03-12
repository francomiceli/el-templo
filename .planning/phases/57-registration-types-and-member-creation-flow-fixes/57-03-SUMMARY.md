---
phase: 57-registration-types-and-member-creation-flow-fixes
plan: 03
subsystem: ui
tags: [admin, vue, quasar, qstepper, members, plans, subscriptions]

# Dependency graph
requires:
  - phase: 57-registration-types-and-member-creation-flow-fixes
    provides: Plan-first admin member creation API (planId required, auto-password, auto-subscription, planName in list)
  - phase: 48-subscriptions
    provides: Subscription plans API endpoint (GET /admin/subscriptions/plans)
provides:
  - Plan-first QStepper member creation dialog (Plan -> Sede -> Datos Personales)
  - AlumnosPage with Plan column and Plan filter dropdown
  - "Gestionar Plan" label replacing "Asignar Plan" across admin UI
affects: [admin-member-workflow, subscription-management-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      plan-first-qstepper-creation-dialog,
      plan-filter-with-sin-plan-option,
    ]

key-files:
  created: []
  modified:
    - el-templo-admin/src/types/member.ts
    - el-templo-admin/src/composables/useMembersApi.ts
    - el-templo-admin/src/components/MemberFormDialog.vue
    - el-templo-admin/src/pages/AlumnosPage.vue
    - el-templo-admin/src/components/MemberSubscriptionTab.vue
    - el-templo-admin/src/components/AssignPlanDialog.vue

key-decisions:
  - "Reused useMembersApi for getPlans() instead of importing useSubscriptionsApi into the dialog -- keeps MemberFormDialog's imports focused"
  - "Flat dropdown for plan selection in create dialog (not tier-grouped list from AssignPlanDialog) -- simpler for creation flow"
  - "planId filter value 0 maps to 'Sin plan' -- matches API convention from Plan 01"

patterns-established:
  - "Plan-first creation: QStepper with plan -> branch -> personal data step order"
  - "Plan filter with null=all, 0=no-plan convention for API planId param"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-03-12
---

# Phase 57 Plan 03: Admin UI Plan-First Creation, Plan Column/Filter, and Label Rename Summary

**Plan-first QStepper member creation dialog, AlumnosPage plan column and filter, "Asignar Plan" renamed to "Gestionar Plan"**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-12T14:26:30Z
- **Completed:** 2026-03-12T14:30:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- MemberFormDialog rewritten with 3-step QStepper for create mode (Plan -> Sede -> Datos Personales), flat form preserved for edit mode
- Password field removed from creation dialog -- API auto-generates passwords and sends set-password email
- AlumnosPage gains Plan column (showing active subscription plan name or "Sin plan") and Plan filter dropdown
- "Asignar Plan" renamed to "Gestionar Plan" in MemberSubscriptionTab and AssignPlanDialog

## Task Commits

Each task was committed atomically:

1. **Task 1: Types + composable + MemberFormDialog plan-first rewrite** - `2b4eff54` (feat)
2. **Task 2: AlumnosPage plan column/filter + "Gestionar Plan" rename** - `d446a41d` (feat)

## Files Created/Modified

- `el-templo-admin/src/types/member.ts` - CreateMemberInput: password removed, planId added; MemberListItem: planName added; MemberListParams: planId added
- `el-templo-admin/src/composables/useMembersApi.ts` - Added getPlans() method fetching active plans for creation dialog
- `el-templo-admin/src/components/MemberFormDialog.vue` - Complete rewrite: QStepper for create (plan dropdown -> branch -> personal data), flat form for edit, no password field
- `el-templo-admin/src/pages/AlumnosPage.vue` - Plan column between Email and Sucursal, Plan filter dropdown with Todos/Sin plan/active plans, planId in loadMembers params
- `el-templo-admin/src/components/MemberSubscriptionTab.vue` - "Asignar Plan" -> "Gestionar Plan" button label
- `el-templo-admin/src/components/AssignPlanDialog.vue` - "Asignar Plan" -> "Gestionar Plan" dialog title

## Decisions Made

- **getPlans() in useMembersApi:** Added a lightweight plan-fetching method to useMembersApi instead of importing useSubscriptionsApi into MemberFormDialog. Keeps the dialog's dependency graph simpler -- it already imports useMembersApi for createMember/checkDni.
- **Flat plan dropdown:** Used a simple q-select dropdown with plan name and price in the label, not the tier-grouped list from AssignPlanDialog. The creation flow benefits from simplicity.
- **Plan filter options:** "Todos" (value null, no filter) and "Sin plan" (value 0, maps to planId=0 API convention) are hardcoded. Active plans are loaded dynamically from the API on mount.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All admin UI changes for plan-first member creation complete
- Phase 57 Plan 02 (app registration UI) can proceed independently
- Type check passes (only pre-existing unrelated error in session-pdf-builder.ts)

---

_Phase: 57-registration-types-and-member-creation-flow-fixes_
_Completed: 2026-03-12_
