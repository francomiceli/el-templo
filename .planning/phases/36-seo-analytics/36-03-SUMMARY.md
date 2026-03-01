---
phase: 36-seo-analytics
plan: 03
subsystem: analytics
tags:
  [
    ga4,
    meta-pixel,
    gtag,
    fbq,
    intersection-observer,
    analytics,
    tracking,
    image-optimization,
  ]

# Dependency graph
requires:
  - phase: 36-01
    provides: "nuxt.config.ts with ga4Id/metaPixelId runtimeConfig vars"
provides:
  - "GA4 gtag.js client plugin with automatic page view tracking"
  - "Meta Pixel fbevents.js client plugin with PageView and Lead events"
  - "useAnalytics composable with type-safe trackEvent/trackLead/trackPixelPageView"
  - "useSectionTracking composable with IntersectionObserver-based viewport tracking"
  - "CTA click event wiring across all conversion points"
  - "Hero poster preload link for LCP optimization"
affects: [phase-38-assets]

# Tech tracking
tech-stack:
  added: [gtag.js, fbevents.js]
  patterns:
    [analytics-plugin-pattern, section-tracking-pattern, cta-event-wiring]

key-files:
  created:
    - el-templo-web/plugins/ga4.client.ts
    - el-templo-web/plugins/meta-pixel.client.ts
    - el-templo-web/composables/useAnalytics.ts
    - el-templo-web/composables/useSectionTracking.ts
  modified:
    - el-templo-web/components/FranForm.vue
    - el-templo-web/components/GladContact.vue
    - el-templo-web/components/FranWhatsApp.vue
    - el-templo-web/components/GladWhatsApp.vue
    - el-templo-web/components/SectionConversion.vue
    - el-templo-web/components/AppPrefooter.vue
    - el-templo-web/components/SectionLocations.vue
    - el-templo-web/components/SectionHero.vue
    - el-templo-web/components/GladCatalog.vue
    - el-templo-web/pages/index.vue
    - el-templo-web/pages/franquicias.vue
    - el-templo-web/pages/gladius.vue
    - el-templo-web/pages/blog/[slug].vue

key-decisions:
  - "GladCatalog Consultar button also fires click_cta_gladius_consult event for conversion tracking completeness"
  - "Blog post cover image gets loading=lazy since it is below the fold on the post page"

patterns-established:
  - "Analytics plugin pattern: .client.ts plugin guarded by runtimeConfig env var, no-op when empty"
  - "CTA tracking pattern: useAnalytics() destructured in component, trackEvent called in click handler"
  - "Section tracking pattern: useSectionTracking({ sections: { id: eventName } }) with cleanup in onUnmounted"

requirements-completed: [TRACK-01, TRACK-02, TRACK-03, SEO-06]

# Metrics
duration: 6min
completed: 2026-03-01
---

# Phase 36 Plan 03: Analytics & Tracking Summary

**GA4 and Meta Pixel analytics with section scroll tracking, CTA event wiring across all conversion points, and hero image preload optimization**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-01T21:35:25Z
- **Completed:** 2026-03-01T21:41:13Z
- **Tasks:** 2
- **Files modified:** 17

## Accomplishments

- GA4 plugin loads gtag.js conditionally and tracks page views on every SPA navigation
- Meta Pixel plugin loads fbevents.js conditionally and fires PageView on navigation, Lead on franchise form
- Section viewport tracking fires GA4 events on all 3 content pages (10 home sections, 6 franchise sections, 3 gladius sections)
- Every conversion CTA fires a GA4 event: forms, WhatsApp buttons, trial CTAs, app CTAs, consultar buttons
- Hero poster preload link hint for LCP optimization
- Blog post cover image gets lazy loading

## Task Commits

Each task was committed atomically:

1. **Task 1: GA4 + Meta Pixel plugins and useAnalytics composable** - `a348f23` (feat)
2. **Task 2: Section tracking, CTA event wiring, image optimization** - `2c7abe4` (feat)

Note: Task 2 commit was combined by lint-staged with pre-existing 36-04 changes in the working tree. All 36-03 code changes are included in `2c7abe4`.

## Files Created/Modified

- `el-templo-web/plugins/ga4.client.ts` - GA4 gtag.js loader, page view tracking on route change
- `el-templo-web/plugins/meta-pixel.client.ts` - Meta Pixel fbevents.js loader, PageView on route change
- `el-templo-web/composables/useAnalytics.ts` - Type-safe trackEvent/trackLead/trackPixelPageView wrappers
- `el-templo-web/composables/useSectionTracking.ts` - IntersectionObserver section viewport tracking
- `el-templo-web/components/FranForm.vue` - Added form_submit_franchise + Lead event on submit
- `el-templo-web/components/GladContact.vue` - Added form_submit_gladius event on submit
- `el-templo-web/components/FranWhatsApp.vue` - Added click_whatsapp_franchise on click
- `el-templo-web/components/GladWhatsApp.vue` - Added click_whatsapp_gladius on click
- `el-templo-web/components/SectionConversion.vue` - Added click_cta_trial/click_cta_app on CTA clicks
- `el-templo-web/components/AppPrefooter.vue` - Added click_cta_trial on prefooter CTA
- `el-templo-web/components/SectionLocations.vue` - Added click_whatsapp_sede on "Reservar sesion" CTAs
- `el-templo-web/components/SectionHero.vue` - Added preload link for hero poster
- `el-templo-web/components/GladCatalog.vue` - Added click_cta_gladius_consult on "Consultar" buttons
- `el-templo-web/pages/index.vue` - Section tracking for 10 home page sections
- `el-templo-web/pages/franquicias.vue` - Section tracking for 6 franchise sections
- `el-templo-web/pages/gladius.vue` - Section tracking for 3 gladius sections
- `el-templo-web/pages/blog/[slug].vue` - Added loading="lazy" to cover image

## Decisions Made

- Added click_cta_gladius_consult tracking to GladCatalog "Consultar" buttons (not in plan but consistent with tracking every conversion CTA)
- Blog post cover image gets loading="lazy" since it's below the fold on the post page

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added GladCatalog Consultar CTA tracking**

- **Found during:** Task 2 (CTA event wiring)
- **Issue:** Plan didn't include tracking for GladCatalog "Consultar" buttons, but they are conversion CTAs that scroll to the contact form
- **Fix:** Added trackEvent("click_cta_gladius_consult") in handleConsultar function
- **Files modified:** el-templo-web/components/GladCatalog.vue
- **Verification:** Typecheck passes
- **Committed in:** 2c7abe4 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for complete conversion tracking. No scope creep.

## Issues Encountered

- Lint-staged pre-commit hook combined Task 2 staged files with pre-existing unstaged changes from 36-04 plan, resulting in a combined commit. All 36-03 code is correctly included.

## User Setup Required

None - analytics plugins are no-ops when env vars are empty. When ready to enable:

- Set `NUXT_PUBLIC_GA4_ID` to your GA4 Measurement ID (G-XXXXXXXXXX)
- Set `NUXT_PUBLIC_META_PIXEL_ID` to your Meta Pixel ID

## Next Phase Readiness

- All analytics instrumentation complete and ready for production
- Image optimization in place (lazy loading + hero preload)
- Real asset optimization (WebP/AVIF via @nuxt/image) deferred to Phase 38

---

_Phase: 36-seo-analytics_
_Completed: 2026-03-01_
