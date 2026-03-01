---
phase: 33-locations-community-ecosystem-faq
plan: 01
subsystem: ui
tags: [vue, nuxt, typescript, bem, css-grid, scroll-reveal, responsive]

# Dependency graph
requires:
  - phase: 32-levels-approaches-conversion
    provides: SectionConversion.vue pattern, useScrollReveal composable, PlaceholderBox component, tokens.css, buttons.css
provides:
  - data/sedes.ts — typed sede location data with 8 entries grouped by city
  - SectionLocations.vue — sede card grid with badges, CTAs, responsive layout
  - data/ecosystem.ts — typed ecosystem pathway data with 4 entries
  - SectionEcosystem.vue — pathway card grid with colored left-border accents
affects: [33-03-PLAN integration into index.vue]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Separate TypeScript data files in data/ directory for section content"
    - "sedesByCity pre-grouped export for render-ready city grouping"

key-files:
  created:
    - el-templo-web/data/sedes.ts
    - el-templo-web/components/SectionLocations.vue
    - el-templo-web/data/ecosystem.ts
    - el-templo-web/components/SectionEcosystem.vue
  modified: []

key-decisions:
  - "Separate data files in data/ directory instead of inline data in components — establishes pattern for Phase 33"
  - "NuxtLink for ecosystem CTAs (internal routes) vs raw <a> for locations CTAs (external Maps/WhatsApp)"

patterns-established:
  - "Data-driven sections with typed data files in el-templo-web/data/"
  - "Badge variant system: outdoor (Olive Stone), special (Aged Gold), intl (Azul Noche)"

requirements-completed:
  [SED-01, SED-02, SED-03, SED-04, SED-05, ECO-01, ECO-02, ECO-03, ECO-04]

# Metrics
duration: 4min
completed: 2026-03-01
---

# Phase 33 Plan 01: Locations & Ecosystem Summary

**8 sede cards with typed data, city grouping, badges, and Maps/WhatsApp CTAs + 4 ecosystem pathway cards with colored left-border accents and ghost CTAs**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-01T15:50:34Z
- **Completed:** 2026-03-01T15:54:32Z
- **Tasks:** 2
- **Files created:** 4

## Accomplishments

- Created typed sede data file with all 8 locations, Maps URLs, shared WhatsApp link, and badge metadata
- Built SectionLocations with responsive grid (4-col/3-col/horizontal scroll), PlaceholderBox images, badge overlays, and international fallback CTA
- Created typed ecosystem pathway data with 4 growth paths and variant colors
- Built SectionEcosystem with 2x2 grid, colored 3px left-border accents, ghost CTAs with arrow animation, and hover border intensification

## Task Commits

Each task was committed atomically:

1. **Task 1: Sede data file + SectionLocations component** - `b094529` (feat)
2. **Task 2: Ecosystem data file + SectionEcosystem component** - `4798daf` (feat)

## Files Created/Modified

- `el-templo-web/data/sedes.ts` — Typed Sede interface and 8 sede entries with sedesByCity grouping helper
- `el-templo-web/components/SectionLocations.vue` — 8 sede cards grouped by city with badges, PlaceholderBox images, Maps/WhatsApp CTAs, international fallback
- `el-templo-web/data/ecosystem.ts` — Typed EcosystemPathway interface and 4 pathway entries
- `el-templo-web/components/SectionEcosystem.vue` — 4 pathway cards in 2x2 grid with colored left-border accents and ghost CTAs

## Decisions Made

- **Separate data files**: Moved from inline data (SectionConversion pattern) to separate TypeScript data files in `data/` directory. Establishes the pattern for this phase's remaining sections (community, FAQ)
- **NuxtLink for ecosystem CTAs**: Used NuxtLink for internal route navigation (/app, /academy, /franquicias, /gladius) instead of raw anchor tags, since these are internal routes. Locations CTAs use raw `<a>` tags because they link to external services (Google Maps, WhatsApp)
- **Removed unused Sede type import**: ESLint caught unused type import in SectionLocations.vue; only sedesByCity is needed since Vue infers types from the data

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused Sede type import**

- **Found during:** Task 1 (SectionLocations component)
- **Issue:** `import type { Sede }` was imported but never used in the component template or script
- **Fix:** Removed the unused import, keeping only `sedesByCity`
- **Files modified:** el-templo-web/components/SectionLocations.vue
- **Verification:** ESLint passed, typecheck passed
- **Committed in:** b094529

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial fix for lint compliance. No scope creep.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SectionLocations and SectionEcosystem are ready for page integration in Plan 03
- Both components use data files from `data/` directory, consistent with the pattern Plan 02 (community/FAQ) will follow
- PlaceholderBox images will be swapped for real photos when available (no code changes needed)

## Self-Check: PASSED

- All 4 created files verified on disk
- Commit b094529 verified in git log (Task 1)
- Commit 4798daf verified in git log (Task 2)
- TypeScript typecheck passes with no errors

---

_Phase: 33-locations-community-ecosystem-faq_
_Plan: 01_
_Completed: 2026-03-01_
