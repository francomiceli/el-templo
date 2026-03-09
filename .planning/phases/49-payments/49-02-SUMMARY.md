---
phase: 49-payments
plan: 02
subsystem: ui
tags: [payments, quasar, vue3, admin-ui, overdue, morosos, financial-summary]

# Dependency graph
requires:
  - phase: 49-payments
    provides: payments API routes, PaymentService, balance/overdue endpoints, morosos count
  - phase: 48-subscriptions
    provides: subscription types, useSubscriptionsApi pattern, MemberSubscriptionTab pattern
  - phase: 47-members
    provides: members list, AlumnoDetailPage tabs, useMembersApi, AdminLayout sidebar
provides:
  - Payment admin types matching API shapes
  - usePaymentsApi composable with all payment endpoints
  - RegisterPaymentDialog for recording payments (member-scoped and global)
  - MemberPaymentTab with balance card, overdue badge, payment history, void action
  - PagosPage with financial summary cards and filtered/paginated payment table
  - Overdue "Deuda" badge on AlumnosPage members
  - Morosos toggle filter in AlumnosPage
  - Morosos count badge on Alumnos sidebar item
  - Pagos sidebar item and /pagos route
affects: [50-attendance, 52-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      morosos count polling with 60s setInterval in layout,
      QToggle filter for boolean API parameter,
      financial summary cards with skeleton loading,
    ]

key-files:
  created:
    - el-templo-admin/src/types/payment.ts
    - el-templo-admin/src/composables/usePaymentsApi.ts
    - el-templo-admin/src/components/MemberPaymentTab.vue
    - el-templo-admin/src/components/RegisterPaymentDialog.vue
    - el-templo-admin/src/pages/PagosPage.vue
  modified:
    - el-templo-admin/src/pages/AlumnoDetailPage.vue
    - el-templo-admin/src/pages/AlumnosPage.vue
    - el-templo-admin/src/types/member.ts
    - el-templo-admin/src/layouts/AdminLayout.vue
    - el-templo-admin/src/router/routes.ts

key-decisions:
  - "recorderName field name matches API (not recordedByName from plan interfaces)"
  - "MemberPaymentTab shows register button even without active subscription for one-off payments"
  - "Morosos count refreshed every 60s via setInterval in AdminLayout, cleaned up on unmount"
  - "QToggle for Morosos filter instead of extra QSelect option -- more visually distinct"

patterns-established:
  - "Financial summary cards with q-skeleton loading placeholders"
  - "QToggle for boolean API filter parameters in list pages"
  - "Layout-level periodic polling for count badges (setInterval + onUnmounted cleanup)"

requirements-completed: [PAY-01, PAY-02, PAY-03, PAY-04]

# Metrics
duration: 5min
completed: 2026-03-09
---

# Phase 49 Plan 02: Payments Admin UI Summary

**Payment management UI with member balance cards, global financial dashboard, register/void dialogs, overdue badges, and morosos sidebar integration**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-09T22:52:22Z
- **Completed:** 2026-03-09T22:57:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Payment types, label/color maps, and API composable with all 7 payment endpoints
- MemberPaymentTab with balance card (DEUDA/AL DIA/PENDIENTE badge), payment history table, void action, and register dialog integration
- RegisterPaymentDialog working from both member tab (userId pre-filled, amount pre-filled with remaining) and global PagosPage (member search)
- Global PagosPage with 3 summary cards (monthly revenue, outstanding debts, collection rate), filter bar (branch, method, date range, search), and server-side paginated table
- AlumnosPage shows red "Deuda" badge on overdue members and has Morosos toggle filter
- Sidebar has "Pagos" item and morosos count badge on "Alumnos" item with 60s auto-refresh

## Task Commits

Each task was committed atomically:

1. **Task 1: Payment types, API composable, MemberPaymentTab, RegisterPaymentDialog** - `dc42910` (feat)
2. **Task 2: PagosPage, morosos badge in sidebar, overdue badge + filter in AlumnosPage** - `7d6a529` (feat)

## Files Created/Modified

- `el-templo-admin/src/types/payment.ts` - Payment interfaces, method labels/colors/options
- `el-templo-admin/src/composables/usePaymentsApi.ts` - API composable for all payment endpoints
- `el-templo-admin/src/components/RegisterPaymentDialog.vue` - One-step payment registration dialog with member search
- `el-templo-admin/src/components/MemberPaymentTab.vue` - Balance card + payment history for member detail page
- `el-templo-admin/src/pages/PagosPage.vue` - Global payments page with summary cards and filtered table
- `el-templo-admin/src/pages/AlumnoDetailPage.vue` - Added "Pagos" tab with MemberPaymentTab
- `el-templo-admin/src/pages/AlumnosPage.vue` - Added "Deuda" badge and Morosos toggle filter
- `el-templo-admin/src/types/member.ts` - Added isOverdue to MemberListItem, overdue to MemberListParams
- `el-templo-admin/src/layouts/AdminLayout.vue` - Added Pagos sidebar item and morosos count badge
- `el-templo-admin/src/router/routes.ts` - Added /pagos route

## Decisions Made

- Used `recorderName` field name to match actual API response (plan interfaces had `recordedByName`)
- MemberPaymentTab shows register button even without active subscription to support one-off payments
- Morosos count refreshed via 60s setInterval in AdminLayout with proper cleanup on unmount
- Used QToggle for Morosos filter instead of adding to status QSelect -- more visually distinct and doesn't conflict with active/inactive filter

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Payment management UI fully operational, ready for production use
- Overdue detection visible to coaches for Phase 50 attendance enforcement
- Financial summary ready for Phase 52 analytics dashboard expansion
- All existing code compiles cleanly (only pre-existing PDF builder type error unrelated to payments)

## Self-Check: PASSED

All 5 created files verified present. Both task commits (dc42910, 7d6a529) confirmed in git log.

---

_Phase: 49-payments_
_Completed: 2026-03-09_
