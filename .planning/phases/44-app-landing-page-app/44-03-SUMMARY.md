---
phase: 44-app-landing-page-app
plan: 3
subsystem: ui
tags: [vue, nuxt, landing-page, modules, flywheel, download, scroll-animation]

# Dependency graph
requires:
  - phase: 44-02
    provides: "Data files (app-landing.ts), module base components (Arete, El Templo), PlaceholderBox, useScrollReveal"
provides:
  - "AppLandingModuleAcademy.vue — Olympic Academy module section with proximamente treatment"
  - "AppLandingModuleLabs.vue — Labs module section with dual CTA (franchisee + external gym)"
  - "AppLandingFlywheel.vue — Vertical flywheel digital flow visualization"
  - "AppLandingDownload.vue — Download section with store badges and phone mockup"
affects: [44-04-page-assembly]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Proximamente content wrapper with opacity 0.6 dimming + full-opacity badge/CTA zones"
    - "Dual CTA card pattern for multi-audience sections"
    - "Vertical flywheel flow with staggered scroll-triggered stage reveal"

key-files:
  created:
    - el-templo-web/components/AppLandingModuleAcademy.vue
    - el-templo-web/components/AppLandingModuleLabs.vue
    - el-templo-web/components/AppLandingFlywheel.vue
    - el-templo-web/components/AppLandingDownload.vue
  modified: []

key-decisions:
  - "Academy prop-label width widened to 120px to accommodate longer label names"
  - "Labs positioning statement placed inside dimmed wrapper per spec, dual CTA zone outside"
  - "Flywheel circle border + icon color driven by stageAccents array mapped from modules data"
  - "Download phone mockup uses 9/19 aspect ratio (portrait phone) with 24px border-radius"
  - "Store badge placeholders use PlaceholderBox at 135x44px (minimum touch target)"

patterns-established:
  - "Proximamente wrapper: content-wrapper div at 0.6 opacity with badge/CTA zones at full opacity"
  - "Dual CTA card: side-by-side cards for different audience paths (franchisee vs external)"
  - "Vertical flow: centered column layout with SVG arrows and staggered transition-delay"

requirements-completed: [APP-15, APP-16, APP-17, APP-18]

# Metrics
duration: 5min
completed: 2026-03-03
---

# Phase 44 Plan 03: Academy + Labs Modules + Flywheel Digital + Download Section Summary

**4 remaining /app page sections: Academy/Labs with proximamente treatment + dual CTA, vertical flywheel flow, and download conversion with store badges**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-03T13:35:27Z
- **Completed:** 2026-03-03T13:41:18Z
- **Tasks:** 2
- **Files created:** 4

## Accomplishments

- Academy module section with Aged Gold proximamente badge, opacity 0.6 content, and full-opacity /academy link
- Labs module section with Azul Noche proximamente badge and dual CTA zone (franchisee to /franquicias, external gym to #formulario-labs)
- Vertical flywheel digital flow showing progressive module unlock: Arete -> El Templo -> Academy -> Labs with staggered scroll animation
- Download section with store badge placeholders, phone mockup, and 3rd DESCARGA LA APP CTA with analytics tracking

## Task Commits

Each task was committed atomically:

1. **Task 1: Build Academy + Labs module detail sections** - `fb2ca9a` (feat)
2. **Task 2: Build Flywheel Digital + Download section** - `1fa9889` (feat)

## Files Created/Modified

- `el-templo-web/components/AppLandingModuleAcademy.vue` - Olympic Academy module detail section with Aged Gold accent and proximamente treatment
- `el-templo-web/components/AppLandingModuleLabs.vue` - Labs module detail section with Azul Noche accent, dual CTA cards, and positioning statement
- `el-templo-web/components/AppLandingFlywheel.vue` - Vertical flywheel digital flow with 4 stages, accent circles, connecting arrows, and staggered reveal
- `el-templo-web/components/AppLandingDownload.vue` - Download section with store badges, phone mockup placeholder, and primary CTA

## Decisions Made

- Academy prop-label width widened to 120px (vs Arete's 100px) to accommodate longer label like "Relacion /academy"
- Labs positioning statement placed inside the dimmed content wrapper (per spec), while dual CTA zone renders outside at full opacity
- Flywheel uses accent colors mapped from modules data array to keep stage colors consistent with their module sections
- Download phone mockup uses 9/19 aspect ratio for realistic portrait phone proportions with rounded 24px border-radius
- Store badge placeholders are 135x44px PlaceholderBox components (to be replaced with official Apple/Google SVG assets later)
- Labs Azul Noche CTA button uses inline styles rather than the global btn--secondary-azul class to stay self-contained and smaller

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 4 components ready to be wired into app.vue by Plan 44-04
- 8 total section components built across Plans 02-03 (Hero, Ecosystem, Arete, El Templo, Academy, Labs, Flywheel, Download)
- Plan 44-04 will assemble page, add forms, SEO meta, and cross-site integration

---

_Phase: 44-app-landing-page-app_
_Completed: 2026-03-03_
