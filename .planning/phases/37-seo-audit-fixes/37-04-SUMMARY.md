---
phase: 37-seo-audit-fixes
plan: 04
subsystem: ui
tags: [seo, headings, keywords, franquicias, gladius]

requires:
  - phase: 34-franquicias-page
    provides: "Franchise page components"
  - phase: 35-gladius-blog
    provides: "Gladius page components and data file"
provides:
  - "All franchise H1/H2 headings contain franquicia, calistenia, or gimnasio funcional"
  - "All Gladius H1/H2 headings contain equipamiento, calistenia, or barras"
affects: [seo, 37-seo-audit-fixes]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - "el-templo-web/components/FranHero.vue"
    - "el-templo-web/components/FranValueProps.vue"
    - "el-templo-web/components/FranModels.vue"
    - "el-templo-web/components/FranIncludes.vue"
    - "el-templo-web/components/FranExpansion.vue"
    - "el-templo-web/components/FranFounder.vue"
    - "el-templo-web/components/FranForm.vue"
    - "el-templo-web/components/GladCatalog.vue"
    - "el-templo-web/data/gladius.ts"

key-decisions:
  - "Gladius headings use 'equipamiento de calistenia' as primary keyword pair"
  - "FranFounder H2 changed from poetic to keyword-first style"
  - "GladCatalog H2 updated directly in component (hardcoded, not from data file)"

patterns-established: []

requirements-completed: [SEO-08]

duration: 5min
completed: 2026-03-02
---

# Plan 37-04: Franchise & Gladius Heading Keywords Summary

**All H1/H2 headings across franchise (7 components) and Gladius (5 components + data file) contain page-specific target keywords**

## Performance

- **Duration:** 5 min
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- All 7 franchise component headings contain franquicia, calistenia, or gimnasio funcional
- All 5 Gladius component headings contain equipamiento or calistenia
- No self-cannibalization between pages (franchise targets franquicia cluster, Gladius targets equipamiento cluster)

## Task Commits

1. **Task 1: Keyword-optimize franchise page headings** - `d1bcdd1`
2. **Task 2: Keyword-optimize Gladius page headings** - `26d996f`

## Files Created/Modified

- `el-templo-web/components/FranHero.vue` - H1 with "franquicia de calistenia"
- `el-templo-web/components/FranValueProps.vue` - H2 with "franquicia de calistenia"
- `el-templo-web/components/FranModels.vue` - H2 with "franquicia"
- `el-templo-web/components/FranIncludes.vue` - H2 with "franquicia de gimnasio funcional"
- `el-templo-web/components/FranExpansion.vue` - H2 with "franquicias de calistenia"
- `el-templo-web/components/FranFounder.vue` - H2 with "franquicia de calistenia"
- `el-templo-web/components/FranForm.vue` - H2 with "franquicia"
- `el-templo-web/components/GladCatalog.vue` - H2 with "calistenia"
- `el-templo-web/data/gladius.ts` - Hero/Philosophy/InAction/Contact titles with keywords

## Decisions Made

- Gladius headings use "equipamiento de calistenia" as the primary keyword pair
- FranFounder H2 changed from poetic ("FUNDADO POR UN ATLETA.") to keyword-first ("EL FUNDADOR DE LA FRANQUICIA DE CALISTENIA.")
- GladPhilosophy title changed from "EL ARMA DEL CALISTENISTA" to "EQUIPAMIENTO DE CALISTENIA PROFESIONAL"

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All heading keywords complete across all pages
- Plan 37-03 (social links, footer) can proceed

---

_Phase: 37-seo-audit-fixes_
_Completed: 2026-03-02_
