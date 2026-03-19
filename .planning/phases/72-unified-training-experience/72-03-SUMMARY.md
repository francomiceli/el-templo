---
phase: 72-unified-training-experience
plan: 03
subsystem: ui
tags: [vue, quasar, pinia, personalizada, mi-camino, layout]

# Dependency graph
requires:
  - phase: 72-unified-training-experience
    plan: 01
    provides: "hasActivePersonalizada computed getter on useUserStore"
provides:
  - "Unified Mi Camino view for active personalizada members (no tabs)"
  - "Collapsible general training stats in unified mode"
  - "Renewal banner for expired personalizada members"
  - "PersonalizadaSection CTA navigates to /training (context-aware)"
affects: [73-mi-plan-catalog]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-mode conditional layout pattern: unified/tabs/default based on subscription state + data presence"

key-files:
  created: []
  modified:
    - el-templo-app/src/modules/progression/pages/MiCamino.vue
    - el-templo-app/src/modules/progression/components/PersonalizadaSection.vue

key-decisions:
  - "Unified view uses q-expansion-item for collapsible general stats rather than hiding them entirely"
  - "Renewal banner uses q-banner component with info icon for expired personalizada members in tab mode"

patterns-established:
  - "Three-mode layout: isUnifiedPersonalizada (MODE 1) -> showTabs (MODE 2) -> default GeneralContent (MODE 3)"

requirements-completed: [UTE-04, UTE-06, UTE-07]

# Metrics
duration: 3min
completed: 2026-03-19
---

# Phase 72 Plan 03: Unified Mi Camino View Summary

**Unified Mi Camino with three layout modes: personalizada-primary single view, archived tabs with renewal banner, and unchanged regular member view**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-19T19:41:26Z
- **Completed:** 2026-03-19T19:44:53Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Active personalizada members see a single unified view: personalizada progress as primary content, "Entrenar" CTA button, general training stats in a collapsible expansion
- Expired personalizada members see tab view with renewal banner ("Consulta en recepcion para renovar")
- Regular members see the exact same GeneralContent view as before (zero changes)
- PersonalizadaSection "Entrenar" CTA now navigates to /training (context-aware entry point)

## Task Commits

Each task was committed atomically:

1. **Task 1: Unify Mi Camino layout for personalizada members** - `3d8ed70c` (feat)
2. **Task 2: Update PersonalizadaSection CTA to point to /training** - `cc5ad605` (feat)

## Files Created/Modified

- `el-templo-app/src/modules/progression/pages/MiCamino.vue` - Reworked to three layout modes: unified (isUnifiedPersonalizada), tabs (showTabs with hasExpiredPersonalizada banner), and GeneralContent only
- `el-templo-app/src/modules/progression/components/PersonalizadaSection.vue` - Changed CTA button from /personalizada/duration to /training

## Decisions Made

- Used q-expansion-item for collapsible general stats in unified mode rather than hiding them entirely, keeping all training data accessible
- Renewal banner uses q-banner component with info icon and secondary color scheme for visual consistency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Mi Camino now provides a unified experience for all member types
- Phase 72 (Unified Training Experience) complete: subscription fields (Plan 01), context-aware training (Plan 02), unified Mi Camino (Plan 03)
- All three layout modes are driven by hasActivePersonalizada from useUserStore and personalizada data presence

---

_Phase: 72-unified-training-experience_
_Completed: 2026-03-19_
