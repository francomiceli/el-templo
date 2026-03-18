---
phase: 63-cash-box
plan: 02
subsystem: ui
tags: [quasar, vue3, admin, cash-box, payments, navigation]

# Dependency graph
requires:
  - phase: 63-01
    provides: API endpoints for financial summary without morosos, payment method breakdown
provides:
  - CajaPage at /caja with per-method revenue cards, month picker, egresos placeholder
  - Cleaned sidebar with Caja item and recepcionista access
  - Removed morosos/debt UI from entire admin app
  - Removed dead components (RegisterPaymentDialog, MemberPaymentTab)
affects: [63-cash-box]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Month picker with computed dateRange for API filtering"
    - "Egresos placeholder section with Proximamente badge for future feature"

key-files:
  created:
    - el-templo-admin/src/pages/CajaPage.vue
  modified:
    - el-templo-admin/src/router/routes.ts
    - el-templo-admin/src/layouts/AdminLayout.vue
    - el-templo-admin/src/pages/AlumnoDetailPage.vue
    - el-templo-admin/src/pages/AlumnosPage.vue
    - el-templo-admin/src/composables/usePaymentsApi.ts
    - el-templo-admin/src/types/payment.ts
    - el-templo-admin/src/types/admin.ts
    - el-templo-admin/src/stores/useAuthStore.ts

key-decisions:
  - "Added recepcionista to AdminRole type and ADMIN_ROLES for login access"
  - "Removed isOverdue badge from AlumnosPage member rows (morosos concept fully removed)"

patterns-established:
  - "Month picker with computed dateRange: selectedMonth ref + computed dateFrom/dateTo for API calls"

requirements-completed: [CASH-02, CASH-03]

# Metrics
duration: 6min
completed: 2026-03-18
---

# Phase 63 Plan 02: Admin Frontend Summary

**CajaPage with per-method revenue cards (Efectivo/Transferencia/Tarjeta/Total), month picker, egresos placeholder, and full morosos/debt UI removal**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-18T03:10:03Z
- **Completed:** 2026-03-18T03:16:33Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- Replaced PagosPage with CajaPage showing 4 per-method revenue cards for monthly reconciliation
- Added month picker defaulting to current month with computed date range for API filtering
- Added egresos placeholder section for future expense tracking
- Removed all morosos/debt UI from sidebar, AlumnosPage filters, AlumnoDetailPage tabs, and member badges
- Deleted dead components (RegisterPaymentDialog, MemberPaymentTab) and cleaned up composable/types
- Added recepcionista role to AdminRole type enabling caja access for front desk staff

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename PagosPage to CajaPage with per-method summary, month picker, and egresos placeholder** - `b9b8d44a` (feat)
2. **Task 2: Route/sidebar/navigation updates and dead component cleanup** - `ce238e50` (feat)

## Files Created/Modified

- `el-templo-admin/src/pages/CajaPage.vue` - New cash box page with 4 revenue cards, month picker, transaction table, egresos placeholder
- `el-templo-admin/src/pages/PagosPage.vue` - Deleted (replaced by CajaPage)
- `el-templo-admin/src/composables/usePaymentsApi.ts` - Removed recordPayment, getMemberPayments, getMemberBalance, getMorososCount
- `el-templo-admin/src/types/payment.ts` - Removed RecordPaymentInput, MemberBalance, totalOutstanding, collectionRate from FinancialSummary
- `el-templo-admin/src/types/admin.ts` - Added recepcionista to AdminRole type
- `el-templo-admin/src/stores/useAuthStore.ts` - Added recepcionista to ADMIN_ROLES array
- `el-templo-admin/src/router/routes.ts` - Changed /pagos to /caja with recepcionista access
- `el-templo-admin/src/layouts/AdminLayout.vue` - Caja sidebar item, removed morosos badge and polling
- `el-templo-admin/src/pages/AlumnoDetailPage.vue` - Removed Pagos tab and MemberPaymentTab
- `el-templo-admin/src/pages/AlumnosPage.vue` - Removed Morosos toggle, overdue filter, isOverdue badge
- `el-templo-admin/src/components/RegisterPaymentDialog.vue` - Deleted (dead component)
- `el-templo-admin/src/components/MemberPaymentTab.vue` - Deleted (dead component)

## Decisions Made

- Added `recepcionista` to AdminRole type and ADMIN_ROLES login check -- required for recepcionista users to access the admin app and the /caja route
- Removed isOverdue badge from AlumnosPage member rows in addition to the Morosos toggle, since the morosos/debt concept is fully removed from the UI

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added recepcionista to AdminRole type**

- **Found during:** Task 2 (Route/sidebar updates)
- **Issue:** TypeScript error: `"recepcionista"` not assignable to `AdminRole` type which only included `coach | admin | superadmin`
- **Fix:** Added `recepcionista` to AdminRole union in admin.ts and to ADMIN_ROLES array in useAuthStore.ts
- **Files modified:** el-templo-admin/src/types/admin.ts, el-templo-admin/src/stores/useAuthStore.ts
- **Verification:** vue-tsc --noEmit passes (only pre-existing pdfmake error remains)
- **Committed in:** ce238e50 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential type fix for recepcionista role to work. No scope creep.

## Issues Encountered

- Quasar QInput type prop doesn't include "month" in its TypeScript union -- resolved with @vue-ignore comment since "month" is a valid HTML5 input type that works at runtime

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CajaPage frontend complete, ready for Plan 03 (void payment integration test or remaining cash box work)
- All morosos/debt UI fully removed from the admin app
- Recepcionista role can now log in to the admin app

---

_Phase: 63-cash-box_
_Completed: 2026-03-18_
