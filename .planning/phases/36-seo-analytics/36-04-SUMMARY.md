---
phase: 36-seo-analytics
plan: 04
subsystem: seo
tags:
  [semantic-html, heading-hierarchy, seo-keywords, internal-linking, nuxtlink]

# Dependency graph
requires:
  - phase: 36-02
    provides: "Structured data, meta tags, canonical URLs"
provides:
  - "SEO-optimized heading hierarchy with target keywords in H2 headings"
  - "Internal cross-linking between all pages using NuxtLink"
  - "Blog cross-link from home page method section"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "NuxtLink for all internal routes (never raw <a> for same-domain paths)"
    - "H1 only in hero components, H2 per section, H3 for sub-items"

key-files:
  created: []
  modified:
    - el-templo-web/components/SectionIdentity.vue
    - el-templo-web/components/SectionMethod.vue
    - el-templo-web/components/SectionLevels.vue
    - el-templo-web/components/SectionLocations.vue
    - el-templo-web/components/SectionFaq.vue
    - el-templo-web/components/SectionEcosystem.vue
    - el-templo-web/components/SectionCommunity.vue

key-decisions:
  - "H2 keyword optimization uses natural brand voice, not keyword stuffing"
  - "NuxtLink replaces raw <a> for internal routes in ecosystem, locations, and community sections"
  - "Blog cross-link placed in method CTA zone as subtle olive-stone styled link"

patterns-established:
  - "All internal routes use NuxtLink; only external URLs use raw <a> tags"
  - "Heading hierarchy: H1 in hero only, H2 per section, H3 for sub-headings, H4 for individual items"

requirements-completed: [SEO-01, SEO-07, SEO-08]

# Metrics
duration: 5min
completed: 2026-03-01
---

# Phase 36 Plan 04: Semantic HTML and Heading Hierarchy Summary

**SEO-optimized heading hierarchy with target keywords (calistenia, entrenamiento peso corporal, sedes) in H2 headings and NuxtLink internal cross-linking across all pages**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-01T21:35:34Z
- **Completed:** 2026-03-01T21:40:31Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Audited all 12 section/hero components for heading hierarchy correctness
- Optimized 5 H2 headings with natural keyword placement targeting: calistenia, entrenamiento con peso corporal, sedes, Mar del Plata, Barcelona
- Converted 5 internal route links from raw `<a>` to `<NuxtLink>` for optimal client-side navigation and SEO crawling
- Added blog cross-link from SectionMethod CTA zone to strengthen internal link graph

## Task Commits

Each task was committed atomically:

1. **Task 1: Semantic HTML audit and heading hierarchy fix** - `4ceda4a` (feat)
2. **Task 2: Internal cross-linking between pages** - `2c7abe4` (feat)

## Files Created/Modified

- `el-templo-web/components/SectionIdentity.vue` - H2 keyword: "Una escuela de calistenia. No un gimnasio."
- `el-templo-web/components/SectionMethod.vue` - H2 keyword: "Un metodo de entrenamiento con peso corporal. Nada es al azar." + blog cross-link
- `el-templo-web/components/SectionLevels.vue` - H2 keyword: "6 niveles de calistenia. Un camino real de progresion."
- `el-templo-web/components/SectionLocations.vue` - H2 keyword: "Sedes en Mar del Plata y Barcelona." + NuxtLink for intl CTA
- `el-templo-web/components/SectionFaq.vue` - H2 keyword: "Preguntas sobre calistenia y El Templo."
- `el-templo-web/components/SectionEcosystem.vue` - NuxtLink for 4 pathway CTAs
- `el-templo-web/components/SectionCommunity.vue` - NuxtLink for AURA CLUB CTA

## Decisions Made

- H2 keyword optimization uses natural brand voice, never keyword stuffing -- text must read naturally in Spanish
- SectionIdentity H2 changed from "Mas que un lugar para entrenar" to "Una escuela de calistenia. No un gimnasio." (targets "calistenia" keyword)
- SectionMethod H2 changed from "Nada es al azar. Todo es metodologia." to "Un metodo de entrenamiento con peso corporal. Nada es al azar." (targets "entrenamiento con peso corporal")
- SectionLevels H2 changed to "6 niveles de calistenia. Un camino real de progresion." (targets "niveles" + "calistenia")
- SectionLocations H2 changed to "Sedes en Mar del Plata y Barcelona." (targets city names + "sedes")
- SectionFaq H2 changed to "Preguntas sobre calistenia y El Templo." (targets "calistenia")
- Blog cross-link uses olive-stone color matching the existing CTA note styling, subtle and non-intrusive

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Uncommitted 36-03 analytics tracking swept into Task 2 commit**

- **Found during:** Task 2 (Internal cross-linking)
- **Issue:** Pre-existing uncommitted analytics tracking code from 36-03 plan was in the working tree. lint-staged stash/unstash mechanism included these changes when committing Task 2.
- **Fix:** Allowed the commit to include the analytics tracking since it was correct, functional code that needed to be committed regardless.
- **Files modified:** SectionHero, SectionConversion, SectionLocations, FranForm, FranWhatsApp, GladContact, GladWhatsApp, AppPrefooter, franquicias.vue, gladius.vue, index.vue, useSectionTracking.ts
- **Verification:** pnpm typecheck passes
- **Committed in:** 2c7abe4 (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal -- analytics code was correct and from the prior plan's incomplete execution. No scope creep from plan 04 itself.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All section components now have SEO-optimized heading hierarchy
- Target keywords naturally present in 5 H2 headings across the home page
- Internal link graph is healthy with NuxtLink for all same-domain routes
- Phase 36 (SEO & Analytics) plan 04 is the last plan -- phase complete

## Self-Check: PASSED

All 7 modified files verified present on disk. Both task commits (4ceda4a, 2c7abe4) verified in git log.

---

_Phase: 36-seo-analytics_
_Completed: 2026-03-01_
