---
phase: 86-qr-promo-free-month-campaign
plan: 03
subsystem: ui
tags: [vue, quasar, member-app, upsell, online-users, reservas]

# Dependency graph
requires:
  - phase: 86-01
    provides: QR promo registration with virtual branch assignment
provides:
  - Reservas tab visible for all users (online + physical)
  - Online user empty state on Reservas page
  - RestDayCard gating for online users without subscription
  - UpsellBadge component for online/promo user conversion
affects: [86-04, 86-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "branchIsVirtual + hasActiveSubscription combined gating for online user UX"
    - "Empty state pattern for online users with 'Activa Tu Plan' messaging"

key-files:
  created:
    - el-templo-app/src/modules/progression/components/UpsellBadge.vue
  modified:
    - el-templo-app/src/layouts/MainLayout.vue
    - el-templo-app/src/pages/ReservasPage.vue
    - el-templo-app/src/modules/progression/pages/MiTemplo.vue

key-decisions:
  - "Reservas tab always visible in bottom nav and desktop drawer for all users including virtual branch"
  - "Online users see 'Activa Tu Plan' empty state instead of booking grid on Reservas page"
  - "RestDayCard hidden only for virtual branch users WITHOUT active subscription (with subscription shows normally)"
  - "UpsellBadge shown for ALL virtual branch users regardless of subscription status"

patterns-established:
  - "isOnlineUser pattern: computed(() => userStore.profile?.branchIsVirtual ?? false)"

requirements-completed: [QR-08, QR-09, QR-10]

# Metrics
duration: 2min
completed: 2026-03-27
---

# Phase 86 Plan 03: Member App Online User UX Summary

**Reservas tab visible for all users with online empty state, RestDayCard gating for virtual branch users, and UpsellBadge conversion component on Mi Templo**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-27T17:22:12Z
- **Completed:** 2026-03-27T17:24:30Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Reservas tab now visible for all users in bottom nav and desktop drawer (removed branchIsVirtual guard)
- Online users see "Activa Tu Plan" empty state on Reservas page instead of booking interface
- RestDayCard hidden for online users without active subscription to avoid misleading content
- UpsellBadge component with "Llevalo al siguiente nivel" messaging encourages branch visits

## Task Commits

Each task was committed atomically:

1. **Task 1: Make Reservas tab visible for all users with empty state** - `72a0679c` (feat)
2. **Task 2: Hide RestDayCard for online users + add UpsellBadge** - `f552dae4` (feat)

## Files Created/Modified
- `el-templo-app/src/layouts/MainLayout.vue` - Removed branchIsVirtual guard from mobileTabs and desktop drawer Reservas items
- `el-templo-app/src/pages/ReservasPage.vue` - Added isOnlineUser computed and empty state for virtual branch users
- `el-templo-app/src/modules/progression/components/UpsellBadge.vue` - New upsell badge component for online/promo users
- `el-templo-app/src/modules/progression/pages/MiTemplo.vue` - Added showRestDay/showUpsellBadge computed, UpsellBadge integration

## Decisions Made
None - followed plan as specified

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Online user UX adjustments complete, ready for admin promo management features (86-04)
- UpsellBadge positioned for future enhancement with deep links to branch info

## Self-Check: PASSED

All 4 created/modified files verified on disk. Both commit hashes (72a0679c, f552dae4) verified in git log.

---
*Phase: 86-qr-promo-free-month-campaign*
*Completed: 2026-03-27*
