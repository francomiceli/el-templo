---
phase: 83-micro-program-upsells
plan: 04
subsystem: ui
tags: [vue, quasar, whatsapp, programs, upsell, member-app, pinia]

requires:
  - phase: 83-02
    provides: member program API endpoints (catalog, my-progress)
  - phase: 79-behavioral-segmentation
    provides: member segments for CTA messaging
  - phase: 82-progressive-profiling-check-ins
    provides: check-in cards placement reference in MiCamino

provides:
  - programs module with types, API composable, CTA and progress cards
  - segment-aware upsell CTA card on Tu Dia for non-enrolled members
  - expandable program progress card for enrolled members
  - Experiencias a Medida catalog section on PlanesPage
  - Personalizadas gating migrated from subscription type to program enrollment

affects: [83-micro-program-upsells, personalizada, training, mi-camino]

tech-stack:
  added: []
  patterns:
    - WhatsApp deep link with member ID, segment, source encoded as ref tag
    - Program enrollment as Personalizadas access gate (replaces subscription.isPersonalizada)
    - Conditional card slot pattern (CTA vs progress) based on enrollment status
    - D-45 catalog visibility guard (hide CTA/section when no programs exist)

key-files:
  created:
    - el-templo-app/src/modules/programs/types.ts
    - el-templo-app/src/modules/programs/composables/useProgramsApi.ts
    - el-templo-app/src/modules/programs/components/ProgramCtaCard.vue
    - el-templo-app/src/modules/programs/components/ProgramProgressCard.vue
  modified:
    - el-templo-app/src/modules/progression/pages/MiCamino.vue
    - el-templo-app/src/modules/plan/pages/PlanesPage.vue
    - el-templo-app/src/stores/useUserStore.ts

key-decisions:
  - "hasActivePersonalizada migrated from subscription.isPersonalizada to hasActiveProgramEnrollment ref, called via loadSubscription"
  - "WeeklySummaryCard gated to program-enrolled members only per D-15"
  - "WhatsApp deep link uses [ref:memberId|segment|source] suffix pattern for bot context"

patterns-established:
  - "Program enrollment gate: hasActiveProgramEnrollment ref in useUserStore replaces subscription-based check"
  - "Segment CTA message map: Record<string, string> with fallback for null segment"

requirements-completed: [ENG-19, ENG-20, ENG-21]

duration: 5min
completed: 2026-03-25
---

# Phase 83 Plan 04: Member Programs UI Summary

**Segment-aware CTA card and expandable progress card on Tu Dia, Experiencias a Medida catalog on PlanesPage, WhatsApp deep links with member context, and Personalizadas gating migrated to program enrollment**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-25T17:55:23Z
- **Completed:** 2026-03-25T18:00:57Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Created programs module with types, API composable, segment-aware CTA card (6 variants), and expandable progress card with content blocks, renewal badge, and WhatsApp deep links
- Integrated program cards into MiCamino between check-ins and Tu Dia cards, gated WeeklySummaryCard to enrolled members only (per D-15)
- Added Experiencias a Medida catalog section to PlanesPage with per-program enrollment detection and Proximamente/Ya estas inscripto edge states
- Migrated Personalizadas gating in useUserStore from subscription.isPersonalizada to program enrollment check via /members/programs/my-progress

## Task Commits

Each task was committed atomically:

1. **Task 1: Create member programs module with types, API composable, and CTA/Progress cards** - `c44f40dc` (feat)
2. **Task 2: Integrate cards into MiCamino.vue, add catalog to PlanesPage.vue, and migrate Personalizadas gating** - `4a5878af` (feat)

## Files Created/Modified
- `el-templo-app/src/modules/programs/types.ts` - ContentBlockDetail, MemberProgramCatalogItem, MemberEnrollmentProgress interfaces
- `el-templo-app/src/modules/programs/composables/useProgramsApi.ts` - API composable with getCatalog and getMyProgress
- `el-templo-app/src/modules/programs/components/ProgramCtaCard.vue` - Segment-aware upsell CTA card with WhatsApp deep link
- `el-templo-app/src/modules/programs/components/ProgramProgressCard.vue` - Expandable progress card with week/session tracking, content blocks, renewal badge
- `el-templo-app/src/modules/progression/pages/MiCamino.vue` - Added program card slot, gated WeeklySummaryCard
- `el-templo-app/src/modules/plan/pages/PlanesPage.vue` - Added Experiencias a Medida catalog section
- `el-templo-app/src/stores/useUserStore.ts` - Migrated hasActivePersonalizada to program enrollment

## Decisions Made
- hasActivePersonalizada computed now checks hasActiveProgramEnrollment ref instead of subscription.isPersonalizada (per D-08), preserving all existing consumers
- fetchProgramEnrollmentStatus called within loadSubscription to ensure enrollment state is populated when any component reads hasActivePersonalizada
- WhatsApp deep link encodes member context as `[ref:memberId|segment|source]` suffix in message text for bot parsing

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Programs module UI is complete and ready for backend integration
- Admin program management (Plan 05) can proceed independently
- All existing Personalizadas consumers continue working via the preserved hasActivePersonalizada computed

---
*Phase: 83-micro-program-upsells*
*Completed: 2026-03-25*

## Self-Check: PASSED
