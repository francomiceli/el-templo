---
phase: 42-blog-internal-linking-system-tags-related-posts-cross-page-ctas
plan: 01
subsystem: api
tags: [blog, tags, related-posts, cta, drizzle, migration, integration-tests]

# Dependency graph
requires: []
provides:
  - "blog_tags and blog_post_tags database tables with seed data"
  - "Tag CRUD, assignment, and querying API endpoints"
  - "Related posts algorithm ranked by shared tag count"
  - "ctaType field on blog_posts for cross-page CTA selection"
affects: [42-02, 42-03, 42-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [junction-table-for-many-to-many, batch-tag-loading, shared-tag-ranking]

key-files:
  created:
    - el-templo-api/src/db/schema/blog-tags.ts
    - el-templo-api/src/db/migrations/0024_blog_tags.sql
    - el-templo-api/test/blog/blog-tags.test.ts
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/db/schema/blog-posts.ts
    - el-templo-api/src/modules/blog/service.ts
    - el-templo-api/src/modules/blog/routes.ts

key-decisions:
  - "Flat tag taxonomy with junction table (blog_tags + blog_post_tags)"
  - "17 seed tags aligned with SEO targets seeded via migration"
  - "Related posts ranked by shared tag count with recent posts fallback"
  - "Batch tag loading via getTagsForPostIds to avoid N+1 queries"
  - "ctaType column added to blog_posts in same migration (0024)"

patterns-established:
  - "Junction table pattern for many-to-many blog relationships"
  - "Shared tag count ranking for content recommendations"

# Metrics
duration: 25min
completed: 2026-03-02
---

# Phase 42 Plan 01: Blog Tag System API Backend

**Built the complete API backend for blog tags: database schema, seed migration, tag CRUD endpoints, post-tag assignment, related posts algorithm, and comprehensive integration tests**

## Performance

- **Commit:** `7addea6`
- **Tasks:** 3
- **Files created:** 3
- **Files modified:** 4

## Accomplishments

- Drizzle schema for blog_tags and blog_post_tags with unique indexes and FK indexes
- SQL migration (0024) creating tables, adding cta_type column, seeding 17 tags
- BlogService extended with tag CRUD, assignment, batch loading, and related posts
- 8 new API routes (3 public + 5 admin) with JSON schemas
- 28 integration tests covering tag CRUD, assignment, public listing, related posts, and CTA type
- All 157 tests passing across 9 test files

## API Endpoints Added

### Public

- `GET /blog/posts/:slug/related?limit=3` -- Related posts ranked by shared tags
- `GET /blog/tags` -- All tags with post counts
- `GET /blog/tags/:slug/posts?page=1&limit=10` -- Posts filtered by tag

### Admin

- `GET /blog/admin/tags` -- List all tags
- `POST /blog/admin/tags` -- Create tag
- `PUT /blog/admin/tags/:id` -- Update tag
- `DELETE /blog/admin/tags/:id` -- Delete tag (cascades junction records)
- `PUT /blog/admin/posts/:id/tags` -- Assign tags to post

## Deviations from Plan

None.

---

_Phase: 42-blog-internal-linking-system-tags-related-posts-cross-page-ctas_
_Completed: 2026-03-02_
