---
phase: 34-franquicias-page
plan: 03
subsystem: ui
tags: [vue, nuxt, svg, animation, scroll-reveal, count-up, timeline, responsive]

# Dependency graph
requires:
  - phase: 34-franquicias-page-02
    provides: "data/franquicias.ts (expansion data, timeline, config), composables/useCountUp.ts"
  - phase: 33-locations-community-ecosystem-faq
    provides: "useScrollReveal composable, PlaceholderBox component, BEM/token patterns"
provides:
  - "FranExpansion.vue — expansion map, animated counters, sede list section"
  - "FranFounder.vue — founder bio with responsive timeline section"
  - "FranVideo.vue — conditional video/PDF section (hidden by default)"
affects: [34-franquicias-page-04, 34-franquicias-page-02]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline SVG map with brand-colored pins and pulse animation"
    - "Progressive timeline line draw synced with milestone reveals"
    - "Conditional section rendering via v-if on config null check"

key-files:
  created:
    - el-templo-web/components/FranExpansion.vue
    - el-templo-web/components/FranFounder.vue
    - el-templo-web/components/FranVideo.vue
  modified: []

key-decisions:
  - "SVG map uses simplified country outlines with dashed connecting arc between Argentina and Spain"
  - "Pin pulse animation uses CSS keyframe on stroke circle for active sede markers"
  - "Timeline connecting line uses transform scaleX/scaleY with origin for progressive draw effect"
  - "FranVideo uses computed hasContent check so section is completely absent from DOM when no content configured"

patterns-established:
  - "Inline SVG map pattern: simplified country outlines with brand-colored pins, reusable for future expansion pages"
  - "Conditional section rendering: v-if on computed config check, section not rendered rather than hidden"

requirements-completed: [FRAN-05, FRAN-06]

# Metrics
duration: 4min
completed: 2026-03-01
---

# Phase 34 Plan 03: Bottom Sections Summary

**Expansion SVG map with animated counters, founder bio with responsive horizontal/vertical timeline, and conditional video/PDF section**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-01T16:59:01Z
- **Completed:** 2026-03-01T17:03:56Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- FranExpansion renders Deep Charcoal section with 4 animated counters (via useCountUp), custom SVG map with Argentina+Spain outlines and Terracotta/Aged Gold pins, sede list, and closing phrase
- FranFounder renders split 55/45 bio layout with horizontal desktop timeline and vertical mobile timeline, sequential milestone reveal with 0.15s stagger
- FranVideo conditionally renders only when videoUrl or pdfUrl is non-null (both null by default, section hidden)

## Task Commits

Each task was committed atomically:

1. **Task 1: FranExpansion -- expansion map, animated counters, sede list** - `ad82a3d` (feat)
2. **Task 2: FranFounder -- bio section + responsive timeline + FranVideo conditional** - `f8d3b29` (feat)

## Files Created/Modified

- `el-templo-web/components/FranExpansion.vue` - Expansion section with counters, SVG map, sede list, closing phrase
- `el-templo-web/components/FranFounder.vue` - Founder bio split layout with responsive timeline
- `el-templo-web/components/FranVideo.vue` - Conditional video/PDF section (hidden by default)

## Decisions Made

- SVG map uses simplified country outlines (not geographically accurate, stylized for brand) with dashed arc connecting Argentina to Spain
- Pin pulse animation via CSS @keyframes on a separate stroke circle element for visual emphasis on active sedes
- Timeline line draws progressively using CSS transform scaleX (desktop) / scaleY (mobile) with transform-origin
- FranVideo uses a computed property wrapping the null check rather than inline v-if to keep template clean

## Deviations from Plan

None - plan executed exactly as written. Data file (franquicias.ts) and useCountUp composable already existed from prior Plan 02 execution.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 3 bottom-section components ready for /franquicias page assembly
- Plan 04 (application form + page composition) can wire all sections together
- FranVideo will activate once videoUrl or pdfUrl are configured in data/franquicias.ts

## Self-Check: PASSED

All 3 created files verified on disk. Both task commits (ad82a3d, f8d3b29) verified in git log.

---

_Phase: 34-franquicias-page_
_Completed: 2026-03-01_
