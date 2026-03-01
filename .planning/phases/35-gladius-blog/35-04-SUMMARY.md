---
phase: 35-gladius-blog
plan: 04
subsystem: ui
tags: [nuxt, vue, blog, seo, markdown, marked, pagination, ssr]

# Dependency graph
requires:
  - phase: 35-gladius-blog
    plan: 01
    provides: "Blog public API (paginated posts, slug lookup, readingTime)"
provides:
  - "Blog index page at /blog with paginated post cards"
  - "Individual blog post page at /blog/[slug] with Markdown rendering"
  - "BlogPostCard, BlogPagination, BlogSidebar reusable components"
  - "Per-post SEO meta tags (Open Graph, article type)"
affects: [35-03]

# Tech tracking
tech-stack:
  added: [marked]
  patterns:
    - "Blog card pattern: vertical card with cover image, date, reading time, excerpt, ghost CTA"
    - "Markdown-to-HTML rendering via marked with scoped brand typography styles"
    - "Per-post SEO meta via useSeoMeta with dynamic Open Graph tags"
    - "Pagination with NuxtLink for SEO-friendly page URLs"

key-files:
  created:
    - el-templo-web/pages/blog/index.vue
    - el-templo-web/pages/blog/[slug].vue
    - el-templo-web/components/BlogPostCard.vue
    - el-templo-web/components/BlogPagination.vue
    - el-templo-web/components/BlogSidebar.vue
  modified:
    - el-templo-web/package.json

key-decisions:
  - "Date formatting uses manual DD de Mes, YYYY format with capitalized month via toLocaleDateString es-AR"
  - "Markdown rendering via marked with v-html (admin-authored content is trusted, no DOMPurify needed)"
  - "Blog post body styled with :deep() scoped selectors for brand typography on Markdown-generated HTML"
  - "Social share uses inline SVGs for WhatsApp, Twitter/X, and copy-to-clipboard with feedback state"
  - "Sidebar sticky positioning with top: 80px offset for nav height, flows below article on mobile"
  - "Empty blog state shows friendly Proximamente message"
  - "Loading state uses skeleton placeholders with pulse animation"

patterns-established:
  - "Blog page composition: index with card list + pagination, [slug] with article + sidebar grid"
  - "formatDate utility for Spanish locale date formatting (DD de Mes, YYYY)"
  - "Social share pattern: WhatsApp, Twitter/X links + clipboard copy with visual feedback"

requirements-completed: [BLOG-03, BLOG-04, BLOG-05, BLOG-06]

# Metrics
duration: 11min
completed: 2026-03-01
---

# Phase 35 Plan 04: Blog Pages Summary

**Blog index with paginated post cards, individual post pages with Markdown rendering + sidebar (recent posts, CTA, social share), per-post SEO meta tags, responsive layout**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-01T20:04:26Z
- **Completed:** 2026-03-01T20:15:28Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Blog index page at /blog with paginated post cards showing title, excerpt, cover image, date, reading time, and ghost CTA
- Pagination component with SEO-friendly NuxtLink URLs (/blog?page=N), page range navigation (max 5 visible)
- Individual post page at /blog/[slug] with Markdown body rendered as styled HTML using brand typography
- Sidebar with recent posts, brand CTA, and social share buttons (WhatsApp, Twitter/X, copy link with feedback)
- Per-post SEO meta tags via useSeoMeta (title, description, og:title, og:description, og:image, og:type article)
- Empty state, loading skeleton, and 404 handling for blog pages

## Task Commits

Each task was committed atomically:

1. **Task 1: Blog index page with post cards and pagination** - `0b85d9b` (feat)
2. **Task 2: Individual blog post page with sidebar and per-post SEO** - `0d69fe2` (feat)

## Files Created/Modified

- `el-templo-web/pages/blog/index.vue` - Blog index page with post list, pagination, loading/empty states, SEO meta
- `el-templo-web/pages/blog/[slug].vue` - Individual post page with Markdown body, hero, sidebar, per-post SEO
- `el-templo-web/components/BlogPostCard.vue` - Post card for index listing with cover image, meta, excerpt, CTA
- `el-templo-web/components/BlogPagination.vue` - Page number navigation with NuxtLink for SEO
- `el-templo-web/components/BlogSidebar.vue` - Sidebar with recent posts, brand CTA, social share buttons
- `el-templo-web/package.json` - Added marked dependency for Markdown rendering

## Decisions Made

- Date formatting uses manual approach (DD de Mes, YYYY) with capitalized month name for consistent Spanish locale
- Markdown rendered via marked library with v-html; admin-authored content is trusted so no DOMPurify added
- Blog post body typography styled with :deep() scoped selectors matching brand design tokens
- Social share buttons use inline SVGs (stroke-based, 24x24) consistent with existing icon patterns
- Copy-to-clipboard shows "Copiado!" feedback for 2 seconds via ref toggle
- Empty blog state shows "Proximamente publicaremos contenido. Volve pronto."
- Loading state uses 3 skeleton placeholder cards with pulse animation
- 404 handling uses createError with fatal flag for proper Nuxt error page display

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unused variable in formatDate function**

- **Found during:** Task 1 (BlogPostCard)
- **Issue:** ESLint caught unused `formatted` variable from initial toLocaleDateString call that was replaced by manual formatting
- **Fix:** Removed the unused variable, kept only the manual date formatting logic
- **Files modified:** el-templo-web/components/BlogPostCard.vue
- **Verification:** ESLint passes, commit succeeds
- **Committed in:** 0b85d9b

**2. [Rule 1 - Bug] Fixed unused catch variable in clipboard handler**

- **Found during:** Task 2 (BlogSidebar)
- **Issue:** ESLint caught `_err` variable in catch block that was intentionally unused (empty catch for clipboard fallback)
- **Fix:** Changed to bare catch block (`catch { }`) which is valid ES2019+ syntax
- **Files modified:** el-templo-web/components/BlogSidebar.vue
- **Verification:** ESLint passes, commit succeeds
- **Committed in:** 0d69fe2

---

**Total deviations:** 2 auto-fixed (2 bugs / lint issues)
**Impact on plan:** Minor lint fixes. No scope creep.

## Issues Encountered

- Task 2 files (BlogSidebar.vue, [slug].vue) were committed as part of a concurrent plan 35-03 execution commit (0d69fe2) due to lint-staged picking up untracked files. Content is identical and correct.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 5 blog public page files complete and type-checked
- Blog pages consume API from Plan 01 via useFetch with runtimeConfig.public.apiUrl
- Build succeeds with SSG prerendering (blog pages prerender with empty state when API unavailable)
- Ready for content authoring once admin panel (Plan 03) is complete

## Self-Check: PASSED

All 5 created files verified on disk. Both commit hashes (0b85d9b, 0d69fe2) verified in git log. TypeScript typecheck passes. Nuxt build succeeds.

---

_Phase: 35-gladius-blog_
_Completed: 2026-03-01_
