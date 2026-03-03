---
phase: 43-academy-landing-page-academy
plan: 02
subsystem: web
tags: [academy, nuxt, vue, data, hero, que-es, programa, niveles, seo]

# Dependency graph
requires: []
provides:
  - "academy.ts data file with all interfaces and content"
  - "academy.vue page shell with SEO + structured data"
  - "AcademyHero, AcademyQueEs, AcademyPrograma, AcademyNiveles components"
affects: [43-03, 43-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      academy-data-centralization,
      page-shell-with-schema-org,
      accordion-single-open,
    ]

key-files:
  created:
    - el-templo-web/data/academy.ts
    - el-templo-web/pages/academy.vue
    - el-templo-web/components/AcademyHero.vue
    - el-templo-web/components/AcademyQueEs.vue
    - el-templo-web/components/AcademyPrograma.vue
    - el-templo-web/components/AcademyNiveles.vue
  modified:
    - el-templo-web/nuxt.config.ts

key-decisions:
  - "Single academy.ts data file for all 10 sections (consistent with franquicias.ts pattern)"
  - "Page shell composes all 12 components with margin-left: 240px on desktop for side menu"
  - "useSchemaOrg with Course structured data for SEO"
  - "/curso-entrenadores 301 redirect to /academy in nuxt.config routeRules"
  - "Certification levels use active/proximamente states with colored badges"
  - "Hero uses margin-top: -64px escape pattern (same as home hero)"

patterns-established:
  - "Academy page data centralization pattern"
  - "Certification level card with active/upcoming state toggle"

# Metrics
duration: 30min
completed: 2026-03-03
---

# Phase 43 Plan 02: Data Files + Page Shell + Hero + QueEs + Programa + Niveles

**Built the academy data file, page shell with SEO/structured data, and first 4 section components**

## Performance

- **Commit:** `c304701`
- **Tasks:** 4
- **Files created:** 6
- **Files modified:** 1

## Accomplishments

- academy.ts with 10 interfaces and all data exports (sideMenuItems, valueCards, programModules, certificationLevels, flywheelNodes, flywheelTools, modalidades, ignacioStats, ignacioCredentials, academyFaqItems, formSelects)
- academy.vue page shell with useSectionTracking (10 sections), useHead (SEO meta/OG/canonical), useSchemaOrg (WebPage + Course)
- AcademyHero: full-viewport hero with parallax, staggered entrance, H1 "FORMA ENTRENADORES. FORJA LIDERES.", CTA, format data line, scroll indicator
- AcademyQueEs: 3 value cards with staggered scroll reveal
- AcademyPrograma: 7-module accordion with single-open, chevron rotation, ARIA attributes
- AcademyNiveles: 3 certification cards (Nivel 1 active, 2-3 proximamente with colored badges)
- nuxt.config updated: removed /academy from ignore, added 301 redirect

## Deviations from Plan

None.

---

_Phase: 43-academy-landing-page-academy_
_Completed: 2026-03-03_
