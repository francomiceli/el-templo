---
phase: 32-levels-approaches-conversion-sections
plan: 02
subsystem: ui
tags: [vue, nuxt, css-grid, scroll-reveal, svg, responsive, calisthenics]

# Dependency graph
requires:
  - phase: 31-hero-identity-method-sections
    provides: useScrollReveal composable, tokens.css, BEM component patterns
provides:
  - SectionApproaches.vue component with 5 approach cards (Kallos, Sthenos, Motus, Pyros, Dynamis)
  - Responsive card grid (5-col desktop, 3+2 tablet, horizontal scroll mobile)
  - Inline SVG icons for each training approach
affects: [32-03 page integration, future approach detail pages]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [mobile horizontal scroll with snap + gradient fade, inline SVG icon cards]

key-files:
  created:
    - el-templo-web/components/SectionApproaches.vue
  modified: []

key-decisions:
  - "SVG icons hand-crafted inline following ROM/SKILLS pattern (stroke-based, 40x40, Terracotta via currentColor)"
  - "Tablet 3+2 layout uses natural grid flow (cards 4-5 occupy cols 1-2 of row 2) — acceptable per spec"
  - "Mobile gradient fade uses sticky pseudo-element inside flex container for scroll hint"

patterns-established:
  - "Mobile horizontal scroll: flex + overflow-x auto + scroll-snap + hidden scrollbar + gradient fade pseudo-element"

requirements-completed: [ENF-01, ENF-02, ENF-03, ENF-04, ENF-05]

# Metrics
duration: 2min
completed: 2026-03-01
---

# Phase 32 Plan 02: Approaches Section Summary

**5 training approach cards (Kallos, Sthenos, Motus, Pyros, Dynamis) with inline SVG icons, responsive grid, and mobile horizontal scroll**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-01T15:03:05Z
- **Completed:** 2026-03-01T15:05:20Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Built SectionApproaches.vue with all 5 approach cards displaying exact spec copy
- Hand-crafted inline SVG icons for each approach (core/stability, strength, flow, flame, handstand)
- Responsive layout: 5-col desktop grid, 3+2 tablet grid, horizontal scroll with snap on mobile
- Card hover elevation (translateY -3px + shadow intensify) and staggered scroll-reveal entrance
- Mobile gradient fade indicator for scroll hint with hidden scrollbar

## Task Commits

Each task was committed atomically:

1. **Task 1: Build SectionApproaches.vue with 5 approach cards and responsive grid** - `622d008` (feat)

**Plan metadata:** `6c1bd4d` (docs: complete plan)

## Files Created/Modified

- `el-templo-web/components/SectionApproaches.vue` - 5 training approach cards with responsive grid, inline SVG icons, hover states, scroll-reveal animation

## Decisions Made

- SVG icons hand-crafted inline (stroke-based, 40x40 viewBox, Terracotta via currentColor) following the established ROM/SKILLS pattern from SectionMethod
- Tablet 3+2 layout uses natural CSS grid flow -- cards 4 and 5 occupy columns 1 and 2 of row 2 (left-aligned), which is acceptable per spec's "3+2 centered" aspirational note
- Mobile gradient fade uses a sticky pseudo-element (::after) inside the flex scroll container to signal scrollable content

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SectionApproaches.vue ready for integration into index.vue in Plan 03
- Component uses id="enfoques" for nav anchor wiring (already referenced in AppNav.vue)
- Follows established BEM + scoped style + scroll-reveal patterns

## Self-Check: PASSED

- FOUND: el-templo-web/components/SectionApproaches.vue
- FOUND: commit 622d008
- FOUND: 32-02-SUMMARY.md

---

_Phase: 32-levels-approaches-conversion-sections_
_Completed: 2026-03-01_
