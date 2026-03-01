---
phase: 36-seo-analytics
plan: 01
subsystem: infra
tags: [fonts, seo, nuxt-modules, analytics, cookies, gdpr, robots-txt]

# Dependency graph
requires:
  - phase: 29-web-foundation
    provides: Nuxt 3 project structure, nuxt.config.ts, CSS tokens
provides:
  - Self-hosted woff2 font files (Montserrat, Cormorant Garamond, Geologica)
  - SEO modules installed (nuxt-schema-org, @nuxt/image, @nuxtjs/sitemap)
  - Analytics runtime config env vars (ga4Id, metaPixelId)
  - robots.txt with sitemap reference
  - EU-only cookie consent banner component
affects: [36-02, 36-03, 36-04]

# Tech tracking
tech-stack:
  added:
    [
      nuxt-schema-org,
      "@nuxt/image",
      "@nuxtjs/sitemap",
      "@fontsource/montserrat",
      "@fontsource/cormorant-garamond",
      "@fontsource/geologica",
    ]
  patterns: [self-hosted-fonts, eu-timezone-detection, localstorage-dismissal]

key-files:
  created:
    - el-templo-web/assets/css/fonts.css
    - el-templo-web/assets/fonts/ (11 woff2 files)
    - el-templo-web/public/robots.txt
    - el-templo-web/components/CookieConsent.vue
  modified:
    - el-templo-web/nuxt.config.ts
    - el-templo-web/package.json
    - el-templo-web/.env.example
    - el-templo-web/layouts/default.vue
    - el-templo-web/pages/index.vue
    - el-templo-web/server/api/__sitemap__/blog.ts

key-decisions:
  - "Self-hosted fonts via @fontsource woff2 files (latin subset only) eliminating all Google Fonts CDN requests"
  - "EU timezone detection via Intl.DateTimeFormat for cookie banner visibility"
  - "Cookie banner is informational-only -- analytics load regardless of dismissal state"

patterns-established:
  - "Self-hosted fonts: woff2 in assets/fonts/, @font-face in fonts.css, loaded before tokens.css"
  - "EU detection: Intl.DateTimeFormat().resolvedOptions().timeZone.startsWith('Europe/')"
  - "Permanent dismissal: localStorage key pattern for UI state persistence"

requirements-completed: [SEO-05, SEO-07, TRACK-01, TRACK-03, TRACK-04]

# Metrics
duration: 9min
completed: 2026-03-01
---

# Phase 36 Plan 01: SEO Infrastructure Summary

**Self-hosted fonts (3 families, 11 woff2 files), SEO Nuxt modules, analytics env vars, robots.txt, and EU-only cookie consent banner**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-01T21:23:44Z
- **Completed:** 2026-03-01T21:32:18Z
- **Tasks:** 2
- **Files modified:** 17 (including 11 font files)

## Accomplishments

- Eliminated all Google Fonts CDN requests by self-hosting woff2 files for Montserrat (4 weights), Cormorant Garamond (3 weights + italic), Geologica (3 weights)
- Installed and registered nuxt-schema-org, @nuxt/image, @nuxtjs/sitemap modules
- Configured GA4 and Meta Pixel runtime config env vars ready for Plan 03 analytics plugins
- Created robots.txt with allow-all crawler directives and sitemap reference
- Built EU-only informational cookie consent banner with timezone detection and permanent localStorage dismissal

## Task Commits

Each task was committed atomically:

1. **Task 1: Self-host fonts and install Nuxt modules** - `4373927` (feat)
2. **Task 2: robots.txt, .env.example update, and cookie consent banner** - `725f9dc` (feat)

## Files Created/Modified

- `el-templo-web/assets/css/fonts.css` - @font-face declarations for all 3 font families (11 faces)
- `el-templo-web/assets/fonts/*.woff2` - 11 self-hosted font files (latin subset)
- `el-templo-web/nuxt.config.ts` - Added modules, fonts.css, analytics runtimeConfig, removed Google Fonts CDN
- `el-templo-web/package.json` - Added SEO modules and fontsource dev dependencies
- `el-templo-web/public/robots.txt` - Crawler directives with sitemap reference
- `el-templo-web/.env.example` - Documented GA4 and Meta Pixel env vars
- `el-templo-web/components/CookieConsent.vue` - EU-only informational cookie banner
- `el-templo-web/layouts/default.vue` - Added CookieConsent to layout
- `el-templo-web/pages/index.vue` - Fixed FAQPage schema to use defineWebPage + defineQuestion
- `el-templo-web/server/api/__sitemap__/blog.ts` - Fixed defineSitemapEventHandler import

## Decisions Made

- Used @fontsource npm packages as source for woff2 files (well-maintained, clean files) -- copied latin subset only to assets/fonts/
- fonts.css loaded BEFORE tokens.css in nuxt.config css array so font-face declarations are available when tokens reference font families
- Cookie banner uses Intl.DateTimeFormat timezone detection (Europe/\* prefix) rather than IP geolocation for simplicity and no API dependency
- Added sharp to onlyBuiltDependencies in package.json for @nuxt/image native dependency

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed defineFAQPage to defineWebPage + defineQuestion**

- **Found during:** Task 1 (typecheck verification)
- **Issue:** `defineFAQPage` does not exist in nuxt-schema-org v5 -- was causing TS2304 error
- **Fix:** Replaced with `defineWebPage({ "@type": "FAQPage" })` + `defineQuestion()` per current @unhead/schema-org API
- **Files modified:** el-templo-web/pages/index.vue
- **Verification:** pnpm typecheck passes
- **Committed in:** 4373927 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed defineSitemapEventHandler import from #imports**

- **Found during:** Task 1 (typecheck verification)
- **Issue:** Explicit `import { defineSitemapEventHandler } from "#imports"` failed in server context -- auto-import works but explicit import does not include nitro auto-imports
- **Fix:** Removed explicit import, let Nitro auto-import handle it
- **Files modified:** el-templo-web/server/api/**sitemap**/blog.ts
- **Verification:** pnpm typecheck passes
- **Committed in:** 4373927 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both were pre-existing type errors exposed by module installation. Fixes necessary for typecheck to pass. No scope creep.

## Issues Encountered

- sharp native dependency required adding to `pnpm.onlyBuiltDependencies` in package.json for @nuxt/image to work correctly

## User Setup Required

None - no external service configuration required. GA4 and Meta Pixel IDs will be provided as env vars when analytics accounts are set up.

## Next Phase Readiness

- All SEO modules installed and configured -- Plan 02 can build structured data and meta tags
- Analytics env vars ready -- Plan 03 can create GA4 and Meta Pixel plugins
- Cookie consent banner in place for GDPR compliance awareness

## Self-Check: PASSED

All 5 created files verified present. All 11 woff2 font files confirmed. Both commit hashes (4373927, 725f9dc) found in git log.

---

_Phase: 36-seo-analytics_
_Completed: 2026-03-01_
