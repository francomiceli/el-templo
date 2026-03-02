---
phase: 36-seo-analytics
plan: 02
subsystem: seo
tags:
  [
    schema-org,
    json-ld,
    sitemap,
    open-graph,
    canonical-url,
    structured-data,
    nuxt-seo,
  ]

# Dependency graph
requires:
  - phase: 35-gladius-blog
    provides: "Blog pages, Gladius pages, sedes/faq data files"
  - phase: 33-home-sections-2
    provides: "Sede data, FAQ data, section components"
provides:
  - "Organization JSON-LD on all pages via app.vue"
  - "LocalBusiness schema for 8 sedes with geo coordinates"
  - "FAQPage + Question schemas from FAQ data"
  - "Article schema on blog post pages"
  - "Canonical URLs on every page"
  - "Complete OG tags + Twitter Card meta on every page"
  - "Dynamic sitemap with blog post URLs"
  - "Branded error page (404 + generic)"
affects: [38-post-launch-polish]

# Tech tracking
tech-stack:
  added: [nuxt-schema-org, "@nuxtjs/sitemap"]
  patterns:
    [
      useSchemaOrg for JSON-LD,
      defineLocalBusiness per sede,
      defineArticle per blog post,
      defineSitemapEventHandler for dynamic URLs,
    ]

key-files:
  created:
    - el-templo-web/server/api/__sitemap__/blog.ts
    - el-templo-web/error.vue
  modified:
    - el-templo-web/app.vue
    - el-templo-web/pages/index.vue
    - el-templo-web/pages/franquicias.vue
    - el-templo-web/pages/gladius.vue
    - el-templo-web/pages/blog/index.vue
    - el-templo-web/pages/blog/[slug].vue
    - el-templo-web/data/sedes.ts
    - el-templo-web/nuxt.config.ts

key-decisions:
  - "Used defineWebPage + defineQuestion pattern for FAQPage (no defineFAQPage in nuxt-schema-org v5)"
  - "Geo coordinates added as optional lat/lng fields on Sede interface for LocalBusiness schema"
  - "Sitemap uses defineSitemapEventHandler server route for dynamic blog URLs"
  - "Error page uses clearError({ redirect: '/' }) for navigation back to home"

patterns-established:
  - "Schema-org pattern: useSchemaOrg composable with define* helpers for JSON-LD"
  - "Sitemap dynamic source: server/api/__sitemap__/ convention for dynamic URL sources"
  - "Error page pattern: error.vue at app root with useError() composable"

requirements-completed: [SEO-01, SEO-02, SEO-03, SEO-04, SEO-08]

# Metrics
duration: 8min
completed: 2026-03-01
---

# Phase 36 Plan 02: Structured Data & Meta Tags Summary

**Organization, LocalBusiness, FAQPage, and Article JSON-LD schemas with complete OG tags, canonical URLs, dynamic sitemap, and branded 404 page**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-01T21:23:41Z
- **Completed:** 2026-03-01T21:31:53Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Every page has unique title, description, OG tags (including og:site_name), and canonical URL
- Organization schema (JSON-LD) rendered globally via app.vue with contact info
- LocalBusiness schema for all 8 sedes with addresses, geo coordinates, and SportsActivityLocation type
- FAQPage + Question schemas generated from FAQ data on home page
- Article schema on blog post pages with headline, dates, author, publisher
- Dynamic sitemap includes static pages + blog post URLs via server route
- Branded error page with 404 and generic error handling matching design system
- Target keywords (calistenia, entrenamiento con peso corporal, sedes, Mar del Plata, Barcelona) naturally in meta descriptions

## Task Commits

Each task was committed atomically:

1. **Task 1: Organization schema, canonical URLs, home page meta + structured data, sitemap config** - `4373927` (feat)
2. **Task 2: Per-page meta enhancement, Article schema, canonical URLs, keyword audit, 404 page** - `9aded99` (feat)

## Files Created/Modified

- `el-templo-web/app.vue` - Organization schema, global lang="es", Twitter Card meta
- `el-templo-web/pages/index.vue` - Comprehensive meta tags, LocalBusiness per sede, FAQPage + Question schemas
- `el-templo-web/data/sedes.ts` - Added lat/lng optional fields with approximate coordinates
- `el-templo-web/nuxt.config.ts` - Added nuxt-schema-org and @nuxtjs/sitemap modules, site/schemaOrg/sitemap config
- `el-templo-web/server/api/__sitemap__/blog.ts` - Dynamic sitemap source fetching blog posts from API
- `el-templo-web/pages/franquicias.vue` - Canonical URL, og:site_name, og:image placeholder
- `el-templo-web/pages/gladius.vue` - Canonical URL, og:site_name, og:image placeholder
- `el-templo-web/pages/blog/index.vue` - Canonical URL, og:site_name, og:image placeholder
- `el-templo-web/pages/blog/[slug].vue` - Canonical URL, og:site_name, Article JSON-LD schema
- `el-templo-web/error.vue` - Branded 404 page with design system styling

## Decisions Made

- Used `defineWebPage({ "@type": "FAQPage" })` + individual `defineQuestion` calls instead of `defineFAQPage` which does not exist in nuxt-schema-org v5 (uses @unhead/schema-org under the hood)
- Geo coordinates added as optional `lat`/`lng` fields on Sede interface (approximate values, exact values in Phase 39)
- OG image placeholders set for franquicias, gladius, and blog (actual images in Phase 39)
- Error page created as `error.vue` at app root (Nuxt convention) instead of `pages/404.vue`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed nuxt-schema-org and @nuxtjs/sitemap dependencies**

- **Found during:** Task 1 (Organization schema setup)
- **Issue:** Plan assumed schema-org and sitemap modules were available, but they were not installed
- **Fix:** `pnpm add nuxt-schema-org @nuxtjs/sitemap` and registered in nuxt.config.ts modules
- **Files modified:** package.json, pnpm-lock.yaml, nuxt.config.ts
- **Verification:** pnpm typecheck passes
- **Committed in:** 4373927 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed FAQPage schema API to use defineWebPage + defineQuestion**

- **Found during:** Task 1 (FAQPage structured data)
- **Issue:** Plan used `defineFAQPage` which does not exist in nuxt-schema-org v5
- **Fix:** Used `defineWebPage({ "@type": "FAQPage" })` combined with individual `defineQuestion` calls per FAQ item
- **Files modified:** el-templo-web/pages/index.vue
- **Verification:** pnpm typecheck passes
- **Committed in:** 4373927 (Task 1 commit)

**3. [Rule 3 - Blocking] Removed explicit import of defineSitemapEventHandler**

- **Found during:** Task 1 (Sitemap server route)
- **Issue:** `defineSitemapEventHandler` is auto-imported by Nitro, explicit `import { defineSitemapEventHandler } from '#imports'` caused type error
- **Fix:** Removed import statement, relying on Nitro auto-imports
- **Files modified:** el-templo-web/server/api/**sitemap**/blog.ts
- **Verification:** pnpm typecheck passes
- **Committed in:** 4373927 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All auto-fixes necessary for functionality. No scope creep.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All pages have complete SEO meta tags and structured data
- Sitemap auto-generates with static + dynamic blog URLs
- Ready for Phase 36 Plan 03 (performance optimization) and Plan 04 (analytics)
- OG image placeholders ready for real images in Phase 39

## Self-Check: PASSED

- All 10 files verified present on disk
- Commit 4373927 (Task 1) verified in git log
- Commit 9aded99 (Task 2) verified in git log
- pnpm typecheck passes cleanly

---

_Phase: 36-seo-analytics_
_Completed: 2026-03-01_
