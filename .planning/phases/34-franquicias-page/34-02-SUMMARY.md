---
phase: 34-franquicias-page
plan: 02
subsystem: ui
tags: [vue, nuxt, franchise, hero, cards, grid, composable, animation, bem]

# Dependency graph
requires:
  - phase: 29-web-foundation
    provides: Nuxt 3 project structure, tokens, buttons, PlaceholderBox, default layout
  - phase: 31-hero-identity-method
    provides: SectionHero pattern (staggered entrance, parallax, scroll indicator), useScrollReveal composable
  - phase: 33-locations-community-faq
    provides: Data file pattern (sedes.ts), count-up animation pattern (SectionCommunity)
provides:
  - Centralized franchise data file (franquicias.ts) for entire /franquicias page
  - Reusable useCountUp composable extracted from SectionCommunity pattern
  - FranHero full-viewport hero section with franchise-specific content
  - FranValueProps 4-card value proposition grid
  - FranModels Activa/Pasiva comparison with accent borders
  - FranIncludes 6-item "what's included" responsive grid
affects: [34-03, 34-04, 37-franchise-admin]

# Tech tracking
tech-stack:
  added: []
  patterns: [franchise-data-file, useCountUp-composable, fran-component-prefix]

key-files:
  created:
    - el-templo-web/data/franquicias.ts
    - el-templo-web/composables/useCountUp.ts
    - el-templo-web/components/FranHero.vue
    - el-templo-web/components/FranValueProps.vue
    - el-templo-web/components/FranModels.vue
    - el-templo-web/components/FranIncludes.vue
  modified: []

key-decisions:
  - "franquicias.ts centralizes ALL franchise page data (value props, models, includes, expansion, timeline, form selects, config) in a single file"
  - "useCountUp composable extracted as reusable utility with trigger/cleanup pattern"
  - "FranHero uses 36px H1 (not 48px) as franchise is sub-page per spec sizing"
  - "Franchise overlay gradient uses 0.20/0.65 opacity per spec (darker than home 0.15/0.55)"

patterns-established:
  - "fran- BEM prefix for all franchise section components"
  - "useCountUp composable: idempotent trigger, rAF cleanup, reduced-motion guard"
  - "Franchise data file pattern: typed interfaces + const exports, serves multiple plans"

requirements-completed: [FRAN-01, FRAN-02, FRAN-03, FRAN-04]

# Metrics
duration: 4min
completed: 2026-03-01
---

# Phase 34 Plan 02: Franchise Top-Half Sections Summary

**Franchise data file, useCountUp composable, and 4 section components (Hero, ValueProps, Models, Includes) with BEM/token patterns and staggered animations**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-01T16:58:24Z
- **Completed:** 2026-03-01T17:03:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Centralized franchise data file with typed interfaces for all page sections (value props, models, includes, expansion, timeline, form selects)
- Reusable useCountUp composable extracted from SectionCommunity pattern (rAF + easeOutCubic, reduced-motion guard, cleanup)
- FranHero: full-viewport hero with Deep Charcoal overlay, staggered entrance, investment figure, CTA to application form
- FranValueProps: 4 value proposition cards in 2x2 grid with PlaceholderBox icons and scroll-triggered entrance
- FranModels: Activa/Pasiva comparison cards with distinct Terracotta/Aged Gold 3px left borders, hover elevation, shared note, repeated CTA
- FranIncludes: 6-item grid (3x2 desktop, 2x3 tablet, 1-col mobile) with staggered entrance

## Task Commits

Each task was committed atomically:

1. **Task 1: Data file + useCountUp composable** - `d6f6a89` (feat)
2. **Task 2: FranHero + FranValueProps + FranModels + FranIncludes components** - `0551f78` (feat)

## Files Created/Modified

- `el-templo-web/data/franquicias.ts` - All franchise page static data with typed interfaces
- `el-templo-web/composables/useCountUp.ts` - Reusable count-up animation composable
- `el-templo-web/components/FranHero.vue` - Full-viewport franchise hero section
- `el-templo-web/components/FranValueProps.vue` - 4 value proposition cards section
- `el-templo-web/components/FranModels.vue` - Activa vs Pasiva comparison section
- `el-templo-web/components/FranIncludes.vue` - 6-item grid of what franchise includes

## Decisions Made

- franquicias.ts centralizes ALL franchise page data in a single file, serving Plans 02, 03, and 04
- useCountUp composable extracted as reusable utility with idempotent trigger(), rAF cleanup(), and SSR/reduced-motion guards
- FranHero uses 36px H1 (not 48px like home hero) since franchise is a sub-page per spec sizing hierarchy
- Franchise overlay gradient uses 0.20/0.65 opacity per spec (darker than home 0.15/0.55 for stronger text contrast)
- FranModels card padding includes 3px offset for accent border to maintain consistent inner spacing

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 4 top-half section components ready for /franquicias page assembly
- franquicias.ts data file ready for Plan 03 (expansion, timeline, founder) and Plan 04 (form)
- useCountUp composable ready for expansion stats section in Plan 03

## Self-Check: PASSED

All 7 files verified present. Both task commits (d6f6a89, 0551f78) verified in git log.

---

_Phase: 34-franquicias-page_
_Completed: 2026-03-01_
