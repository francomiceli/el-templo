---
phase: 37-seo-audit-fixes
plan: 02
subsystem: ui
tags: [seo, meta-tags, og-tags, headings, keywords, nuxt]

requires:
  - phase: 36-seo-analytics
    provides: "Page-level SEO meta setup, useHead patterns"
provides:
  - "Keyword-optimized title tags (50-60 chars) across all sub-pages"
  - "Unique OG title and OG description per page"
  - "All 9 home page section H2s contain target keywords"
  - "Blog index H1 keyword-optimized"
affects: [seo, 37-seo-audit-fixes]

tech-stack:
  added: []
  patterns:
    ["Content-first, brand-suffix title pattern: '{Content} | El Templo'"]

key-files:
  created: []
  modified:
    - "el-templo-web/pages/franquicias.vue"
    - "el-templo-web/pages/gladius.vue"
    - "el-templo-web/pages/blog/index.vue"
    - "el-templo-web/pages/blog/[slug].vue"
    - "el-templo-web/components/SectionApproaches.vue"
    - "el-templo-web/components/SectionConversion.vue"
    - "el-templo-web/components/SectionLocations.vue"
    - "el-templo-web/components/SectionCommunity.vue"
    - "el-templo-web/components/SectionEcosystem.vue"

key-decisions:
  - "Blog post title changed from em-dash to pipe separator: '[Title] | El Templo'"
  - "4 sections already had keywords (Identity, Method, Levels, Faq) — kept as-is"
  - "SectionConversion H2 changed from question form to keyword-rich statement"

patterns-established:
  - "Title pattern: '{Page Content Keywords} | El Templo' (50-60 chars)"
  - "Per-page keyword clusters to avoid self-cannibalization"

requirements-completed: [SEO-02, SEO-08]

duration: 6min
completed: 2026-03-02
---

# Plan 37-02: Sub-page Titles/OG Tags + Home H2 Keywords Summary

**Keyword-optimized title tags (50-60 chars) across all sub-pages, unique OG tags per page, and all 9 home H2 headings with target keywords**

## Performance

- **Duration:** 6 min
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Franquicias title: 57 chars with franquicia + calistenia + gimnasio funcional
- Gladius title: 58 chars with equipamiento + calistenia
- Blog index title: 60 chars with calistenia + entrenamiento + peso corporal
- Blog post title follows "[Title] | El Templo" pattern
- Blog index H1 updated to "BLOG DE CALISTENIA Y ENTRENAMIENTO"
- All 9 home page H2 headings now contain at least one target keyword

## Task Commits

1. **Task 1: Optimize title tags and OG meta across sub-pages** - `681b956`
2. **Task 2: Keyword-optimize H2 headings across home page sections** - `64d4245`

## Files Created/Modified

- `el-templo-web/pages/franquicias.vue` - Title, description, OG tags
- `el-templo-web/pages/gladius.vue` - Title, OG tags, OG description
- `el-templo-web/pages/blog/index.vue` - Title, OG tags, H1 keyword
- `el-templo-web/pages/blog/[slug].vue` - Title pattern pipe separator
- `el-templo-web/components/SectionApproaches.vue` - H2 with "entrenamiento funcional con peso corporal"
- `el-templo-web/components/SectionConversion.vue` - H2 with "calistenia"
- `el-templo-web/components/SectionLocations.vue` - H2 with "calistenia"
- `el-templo-web/components/SectionCommunity.vue` - H2 with "calistenia"
- `el-templo-web/components/SectionEcosystem.vue` - H2 with "calistenia"

## Decisions Made

- Blog post title separator changed from em-dash to pipe for consistency with other pages
- SectionConversion H2 changed from question "¿En qué punto del camino estás?" to keyword statement "Describrí tu nivel de calistenia."

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All sub-page titles and OG tags optimized
- Home page H2s all contain target keywords
- No self-cannibalization between pages

---

_Phase: 37-seo-audit-fixes_
_Completed: 2026-03-02_
