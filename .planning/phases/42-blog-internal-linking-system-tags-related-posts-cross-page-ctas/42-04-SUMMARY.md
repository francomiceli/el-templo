---
phase: 42-blog-internal-linking-system-tags-related-posts-cross-page-ctas
plan: 04
subsystem: web
tags: [blog, related-posts, cta, sitemap, internal-linking]

# Dependency graph
requires:
  - phase: 42-blog-internal-linking-system-tags-related-posts-cross-page-ctas
    plan: 01
    provides: "Related posts API endpoint and ctaType field"
  - phase: 42-blog-internal-linking-system-tags-related-posts-cross-page-ctas
    plan: 03
    provides: "Tag browse pages for sitemap entries"
provides:
  - "BlogPostCta component with 3 CTA variants"
  - "BlogRelatedPosts component with responsive grid"
  - "Tag page URLs in sitemap"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [cta-variant-props, related-content-grid, sitemap-extension]

key-files:
  created:
    - el-templo-web/components/BlogPostCta.vue
    - el-templo-web/components/BlogRelatedPosts.vue
  modified:
    - el-templo-web/pages/blog/[slug].vue
    - el-templo-web/server/api/__sitemap__/blog.ts

key-decisions:
  - "CTA uses computed config object for variant switching (heading, subtext, link, modifier)"
  - "Trial CTA links to WhatsApp (external), franchise to /franquicias, app to /gladius"
  - "Related post tags shown as plain text spans (not pills) to avoid nested links"
  - "CTA and related posts placed inside article column for proper grid layout"
  - "Sitemap uses typed changefreq literal union for TypeScript compatibility"
  - "Franchise CTA uses aged gold button; trial and app use terracotta"

# Metrics
duration: 15min
completed: 2026-03-02
---

# Phase 42 Plan 04: Related Posts, CTAs, and Tag Sitemap

**Added related posts section, cross-page CTA banners with 3 variants, and extended sitemap with tag page URLs**

## Performance

- **Commit:** `f8ba7bf`
- **Tasks:** 2
- **Files created:** 2
- **Files modified:** 2

## Accomplishments

- BlogPostCta.vue: 3 CTA variants (trial/franchise/app) with computed config pattern
- BlogRelatedPosts.vue: responsive 3-column grid with thumbnail, title, and tag names
- blog/[slug].vue: fetches related posts, renders CTA banner and related posts in article column
- Sitemap extended to include /blog/tag/{slug} entries with weekly changefreq

## Deviations from Plan

### Auto-fixed Issues

**1. TypeScript changefreq type mismatch**

- **Found during:** Type check
- **Issue:** `changefreq: "weekly"` inferred as `string`, not compatible with `Changefreq` union type
- **Fix:** Used explicit union type for changefreq in entries array type annotation
- **Verification:** Type check passes clean

---

_Phase: 42-blog-internal-linking-system-tags-related-posts-cross-page-ctas_
_Completed: 2026-03-02_
