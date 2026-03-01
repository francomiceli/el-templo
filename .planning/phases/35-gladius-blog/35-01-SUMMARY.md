---
phase: 35-gladius-blog
plan: 01
subsystem: api
tags: [fastify, drizzle-orm, mysql, r2, presigned-url, resend, blog, gladius]

# Dependency graph
requires:
  - phase: 34-franquicias
    provides: "franchise module pattern (routes, service, schema, email notification)"
  - phase: 28-video-management
    provides: "R2 plugin and presigned URL pattern"
provides:
  - "gladius_products, gladius_inquiries, blog_posts DB tables"
  - "Gladius public API (products listing, inquiry form)"
  - "Gladius admin API (product CRUD)"
  - "Blog public API (paginated posts, slug lookup)"
  - "Blog admin API (post CRUD, draft/publish workflow)"
  - "Blog image upload via R2 presigned URLs"
affects: [35-02, 35-03, 35-04, 37-franchise-admin]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Blog draft/publish workflow with publishedAt preservation on re-publish"
    - "Auto-computed readingTime from Markdown body word count"
    - "Blog image upload via R2 presigned PUT URL with sanitized filename"

key-files:
  created:
    - el-templo-api/src/db/schema/gladius-products.ts
    - el-templo-api/src/db/schema/gladius-inquiries.ts
    - el-templo-api/src/db/schema/blog-posts.ts
    - el-templo-api/src/db/migrations/0019_gladius_blog_tables.sql
    - el-templo-api/src/modules/gladius/service.ts
    - el-templo-api/src/modules/gladius/routes.ts
    - el-templo-api/src/modules/blog/service.ts
    - el-templo-api/src/modules/blog/image-service.ts
    - el-templo-api/src/modules/blog/routes.ts
    - el-templo-api/test/gladius/gladius.test.ts
    - el-templo-api/test/blog/blog.test.ts
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/app.ts
    - el-templo-api/.env.example

key-decisions:
  - "Gladius admin routes restricted to admin/superadmin only (not coach), consistent with plan context"
  - "Blog readingTime computed on read, not stored in DB (avoids staleness on body edits)"
  - "publishedAt preserved when re-publishing (draft->publish->draft->publish keeps original date)"
  - "Blog image R2 key prefixed with blog/images/ and timestamped to avoid collisions"
  - "Upload-image test handles both R2-configured and R2-unconfigured environments"

patterns-established:
  - "Gladius module pattern: GladiusService + gladiusRoutes with public/admin route split"
  - "Blog draft/publish workflow: status field + publishedAt set-once semantics"
  - "Shared slugify utility duplicated in both services (acceptable for independence)"

requirements-completed: [GLAD-03, GLAD-05, BLOG-01]

# Metrics
duration: 9min
completed: 2026-03-01
---

# Phase 35 Plan 01: Gladius + Blog API Backend Summary

**3 DB tables, Gladius product catalog + inquiry API, Blog CRUD with draft/publish workflow, R2 image upload, 32 integration tests passing**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-01T19:51:44Z
- **Completed:** 2026-03-01T20:00:47Z
- **Tasks:** 3
- **Files modified:** 14

## Accomplishments

- Three new database tables (gladius_products, gladius_inquiries, blog_posts) with Drizzle schemas and SQL migration
- Gladius API: public product listing + slug lookup, inquiry form with WhatsApp URL + email notification, admin CRUD (admin/superadmin only)
- Blog API: paginated published posts with auto-computed readingTime, slug-based full post retrieval, admin CRUD with draft/publish workflow, R2-backed image upload
- 32 integration tests (17 Gladius + 15 Blog) all passing alongside existing 73 tests (105 total)

## Task Commits

Each task was committed atomically:

1. **Task 1: Database schemas and migration** - `dbc3630` (feat)
2. **Task 2: Gladius API routes, service, and integration tests** - `fc321bd` (feat)
3. **Task 3: Blog API routes, service, image upload, and integration tests** - `93e8ddf` (feat)

## Files Created/Modified

- `el-templo-api/src/db/schema/gladius-products.ts` - Gladius products table schema
- `el-templo-api/src/db/schema/gladius-inquiries.ts` - Gladius inquiries table schema
- `el-templo-api/src/db/schema/blog-posts.ts` - Blog posts table schema with draft/published status
- `el-templo-api/src/db/schema/index.ts` - Re-exports all three new schemas
- `el-templo-api/src/db/migrations/0019_gladius_blog_tables.sql` - SQL migration for all 3 tables
- `el-templo-api/src/modules/gladius/service.ts` - GladiusService with CRUD + inquiry + email notification
- `el-templo-api/src/modules/gladius/routes.ts` - Public and admin Gladius routes
- `el-templo-api/src/modules/blog/service.ts` - BlogService with paginated listing, CRUD, draft/publish workflow
- `el-templo-api/src/modules/blog/image-service.ts` - BlogImageService for R2 presigned upload URLs
- `el-templo-api/src/modules/blog/routes.ts` - Public and admin Blog routes
- `el-templo-api/src/app.ts` - Registers gladiusRoutes and blogRoutes
- `el-templo-api/.env.example` - Documents GLADIUS_NOTIFICATION_EMAIL
- `el-templo-api/test/gladius/gladius.test.ts` - 17 integration tests
- `el-templo-api/test/blog/blog.test.ts` - 15 integration tests

## Decisions Made

- Gladius admin routes restricted to admin/superadmin only (not coach) per context decisions
- Blog readingTime computed on read from body word count (~200 words/min), not stored in DB
- publishedAt preserved when re-publishing (set once on first publish, never overwritten)
- Blog image R2 key uses `blog/images/{timestamp}-{sanitized-filename}` pattern
- slugify function duplicated in both services for module independence (not extracted to shared util)
- Upload-image test written to handle both R2-configured and R2-unconfigured test environments

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed blog image upload test assertion**

- **Found during:** Task 3 (Blog integration tests)
- **Issue:** Test expected 503 for R2 not configured, but R2 was configured in the test environment via .env credentials
- **Fix:** Updated test to handle both scenarios (503 when R2 missing, 200 with upload/public URLs when R2 configured)
- **Files modified:** el-templo-api/test/blog/blog.test.ts
- **Verification:** Test passes in both R2-configured and unconfigured environments
- **Committed in:** 93e8ddf (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor test assertion fix. No scope creep.

## Issues Encountered

None

## User Setup Required

- Run migration `0019_gladius_blog_tables.sql` on production and staging databases before deploying
- Set `GLADIUS_NOTIFICATION_EMAIL` env var in production for Gladius inquiry email notifications

## Next Phase Readiness

- All API endpoints ready for frontend consumption (35-02: Gladius page, 35-03: Blog pages)
- Admin API endpoints ready for admin panel integration (35-04: Admin CRUD panels)
- TypeScript compiles cleanly, all 105 tests pass

---

_Phase: 35-gladius-blog_
_Completed: 2026-03-01_
