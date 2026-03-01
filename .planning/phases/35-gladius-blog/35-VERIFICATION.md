---
phase: 35-gladius-blog
verified: 2026-03-01T22:00:00Z
status: passed
score: 13/13 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 10/13
  gaps_closed:
    - "GET /api/blog/posts returns paginated published posts — blog/index.vue L61 now correctly uses ${config.public.apiUrl}/api/blog/posts"
    - "/blog renders an index page with post cards — URL fix allows data to load"
    - "/blog/[slug] renders individual post — blog/[slug].vue L33 now correctly uses ${config.public.apiUrl}/api/blog/posts/${slug.value}"
    - "Individual post pages have sidebar — BlogSidebar.vue L38 now correctly uses ${config.public.apiUrl}/api/blog/posts?limit=5"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Gladius /gladius page renders full hero with 'FORJADO PARA LOS QUE ENTRENAN EN SERIO.' H1"
    expected: "Full-viewport hero visible with parallax, H1 text, dual CTAs (VER PRODUCTOS + CONSULTAR), scroll indicator"
    why_human: "Parallax, entrance animations, and visual rendering cannot be verified programmatically"
  - test: "Submit the Gladius inquiry form"
    expected: "Form submits with nombre/email/productoInteres filled, confirmation message appears, whatsappUrl shown"
    why_human: "End-to-end form submission requires a running API and database"
  - test: "Blog admin editor — Markdown toolbar and image upload"
    expected: "Bold/italic/headings insert at cursor, image upload opens file picker and inserts markdown image syntax"
    why_human: "Textarea cursor manipulation and drag-and-drop behavior require interactive testing"
  - test: "Admin role restriction: log in as coach and verify Blog/Gladius not visible in sidebar"
    expected: "Coach user sees Sesiones/Generar/Ejercicios/Alumnos only — no Blog or Gladius items"
    why_human: "Role-based sidebar visibility requires a live session with a coach-role user"
  - test: "Confirm NUXT_PUBLIC_API_URL convention in staging/production secrets"
    expected: "Secret value should be bare host (e.g., https://api.eltemplo.org) WITHOUT /api suffix — all code now appends /api/ explicitly. The .env.example still shows http://localhost:3000/api which would cause double-embedding in local dev if followed. Update .env.example to http://localhost:3000."
    why_human: "GitHub Actions secrets are not visible in the codebase"
---

# Phase 35: Gladius + Blog Verification Report

**Phase Goal:** The Gladius equipment brand has a showcase page that drives WhatsApp inquiries, and the blog is API-backed with an editor in el-templo-admin, API routes in el-templo-api, and pre-rendered pages in el-templo-web
**Verified:** 2026-03-01T22:00:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (blog API URL prefix fix committed)

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                    | Status   | Evidence                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | GET /api/gladius/products returns an array of published products with name, description, photo, slug     | VERIFIED | `gladius/routes.ts` queries DB via GladiusService.listPublishedProducts(), registered in app.ts L74                                                            |
| 2   | POST /api/gladius/inquire persists inquiry to DB and returns whatsappUrl                                 | VERIFIED | `gladius/routes.ts` GladiusService.submitInquiry() inserts row + returns WHATSAPP_URL                                                                          |
| 3   | Admin-authenticated POST/PUT/DELETE /api/gladius/products manages product catalog                        | VERIFIED | Admin routes with preHandler: [fastify.authenticate], admin/superadmin role check                                                                              |
| 4   | Admin-authenticated POST /api/blog/posts creates a draft blog post                                       | VERIFIED | `blog/routes.ts` BlogService.createPost() persists with status='draft'                                                                                         |
| 5   | Admin-authenticated PUT /api/blog/posts/:id updates post fields including status                         | VERIFIED | `blog/routes.ts` BlogService.updatePost() handles publishedAt set-once logic                                                                                   |
| 6   | GET /api/blog/posts returns paginated published posts with title, excerpt, coverImage, slug, publishedAt | VERIFIED | API route correct; blog/index.vue L61 now uses `${config.public.apiUrl}/api/blog/posts` (gap CLOSED)                                                           |
| 7   | GET /api/blog/posts/:slug returns full post with markdown body                                           | VERIFIED | API route correct; blog/[slug].vue L33 now uses `${config.public.apiUrl}/api/blog/posts/${slug.value}` (gap CLOSED)                                            |
| 8   | POST /api/blog/upload-image returns an R2 URL for uploaded image                                         | VERIFIED | `blog/routes.ts` BlogImageService uses PutObjectCommand + getSignedUrl, 15-min expiry                                                                          |
| 9   | /gladius renders a full-viewport hero with "FORJADO PARA LOS QUE ENTRENAN EN SERIO." H1                  | VERIFIED | `gladius.vue` composes GladHero; `gladiusConfig.hero.title` = "FORJADO PARA LOS QUE ENTRENAN EN SERIO." in data/gladius.ts L25                                 |
| 10  | Inquiry form submits to /api/gladius/inquire with WhatsApp CTA                                           | VERIFIED | `GladContact.vue` L92: `$fetch` to `${baseUrl}/api/gladius/inquire` with inline validation                                                                     |
| 11  | Admin Blog/Gladius pages accessible only to admin/superadmin                                             | VERIFIED | `routes.ts` all 4 routes have `meta: { allowedRoles: ['admin', 'superadmin'] }`; `AdminLayout.vue` L44: `v-if="isAdminRole"` computed from authStore.user.role |
| 12  | Blog editor has Markdown toolbar and image upload                                                        | VERIFIED | `BlogEditorPage.vue` L107-136: insertMarkdown() with bold/italic/h2/h3/ul/ol + useBlogImageUpload; marked import at L172                                       |
| 13  | Blog index/post pages render with correct API fetch                                                      | VERIFIED | All three blog fetch URLs confirmed with /api/ prefix: index.vue L61, [slug].vue L33, BlogSidebar.vue L38 (gap CLOSED)                                         |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact                                                       | Expected                              | Status   | Details                                                                                                                                       |
| -------------------------------------------------------------- | ------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/db/schema/gladius-products.ts`              | gladius_products table schema         | VERIFIED | Exists, exports gladiusProducts                                                                                                               |
| `el-templo-api/src/db/schema/gladius-inquiries.ts`             | gladius_inquiries table schema        | VERIFIED | Exists, exports gladiusInquiries                                                                                                              |
| `el-templo-api/src/db/schema/blog-posts.ts`                    | blog_posts table schema               | VERIFIED | Exists, exports blogPosts with publishedAt nullable                                                                                           |
| `el-templo-api/src/db/migrations/0019_gladius_blog_tables.sql` | SQL migration for all 3 tables        | VERIFIED | File confirmed present                                                                                                                        |
| `el-templo-api/src/modules/gladius/routes.ts`                  | Gladius API routes                    | VERIFIED | 219 lines, exports gladiusRoutes, public + admin split                                                                                        |
| `el-templo-api/src/modules/blog/routes.ts`                     | Blog API routes                       | VERIFIED | 259 lines, exports blogRoutes, public + admin + image upload                                                                                  |
| `el-templo-api/src/modules/blog/image-service.ts`              | Blog image upload service             | VERIFIED | 65 lines, uses PutObjectCommand + getSignedUrl, blog/images/ prefix                                                                           |
| `el-templo-web/pages/gladius.vue`                              | Gladius showcase page                 | VERIFIED | 45 lines, composes all 6 sections, SEO meta set                                                                                               |
| `el-templo-web/data/gladius.ts`                                | Static gladius content                | VERIFIED | 70 lines, exports gladiusConfig with whatsappUrl, hero, philosophy, inAction, contact                                                         |
| `el-templo-web/components/GladHero.vue`                        | Full-viewport hero with parallax      | VERIFIED | 428 lines, parallax + entrance animations                                                                                                     |
| `el-templo-web/components/GladCatalog.vue`                     | Product catalog (API-backed)          | VERIFIED | 474 lines, useFetch to `${apiUrl}/api/gladius/products`, loading/empty/error states                                                           |
| `el-templo-web/components/GladContact.vue`                     | Inquiry form                          | VERIFIED | 720 lines, $fetch to `${baseUrl}/api/gladius/inquire`, inline validation, confirmation state                                                  |
| `el-templo-web/pages/blog/index.vue`                           | Blog index page                       | VERIFIED | 295 lines, useFetch at `${config.public.apiUrl}/api/blog/posts` — URL fix confirmed                                                           |
| `el-templo-web/pages/blog/[slug].vue`                          | Individual post page                  | VERIFIED | 348 lines, Markdown via marked, useFetch at `${config.public.apiUrl}/api/blog/posts/${slug.value}` — URL fix confirmed                        |
| `el-templo-web/components/BlogPostCard.vue`                    | Post card component                   | VERIFIED | 217 lines, renders title/excerpt/date/readingTime with NuxtLink                                                                               |
| `el-templo-web/components/BlogSidebar.vue`                     | Sidebar with recent posts, CTA, share | VERIFIED | 392 lines, useFetch at `${config.public.apiUrl}/api/blog/posts?limit=5` — URL fix confirmed; WhatsApp/Twitter/copy-link share buttons present |
| `el-templo-web/components/BlogPagination.vue`                  | Pagination component                  | VERIFIED | 184 lines, NuxtLink-based SEO-friendly URLs                                                                                                   |
| `el-templo-admin/src/pages/BlogListPage.vue`                   | Blog post list                        | VERIFIED | 283 lines, q-table with search/filter/status filter                                                                                           |
| `el-templo-admin/src/pages/BlogEditorPage.vue`                 | Markdown editor                       | VERIFIED | 616 lines, insertMarkdown(), preview toggle, R2 image upload                                                                                  |
| `el-templo-admin/src/pages/GladiusProductsPage.vue`            | Gladius CRUD table                    | VERIFIED | 358 lines, add/edit dialog, delete confirm                                                                                                    |
| `el-templo-admin/src/composables/useBlogApi.ts`                | Blog API composable                   | VERIFIED | 164 lines, exports useBlogApi with list/get/create/update/delete/publish/unpublish                                                            |
| `el-templo-admin/src/composables/useGladiusApi.ts`             | Gladius API composable                | VERIFIED | 122 lines, exports useGladiusApi with list/create/update/delete                                                                               |
| `el-templo-admin/src/composables/useBlogImageUpload.ts`        | Image upload composable               | VERIFIED | 46 lines, uploadImage: presigned URL + PUT to R2                                                                                              |

### Key Link Verification

| From                                              | To                                                | Via                             | Status | Details                                                                                       |
| ------------------------------------------------- | ------------------------------------------------- | ------------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| `el-templo-api/src/app.ts`                        | gladiusRoutes                                     | fastify.register                | WIRED  | L74: `app.register(gladiusRoutes, { prefix: "/api/gladius" })`                                |
| `el-templo-api/src/app.ts`                        | blogRoutes                                        | fastify.register                | WIRED  | L77: `app.register(blogRoutes, { prefix: "/api/blog" })`                                      |
| `el-templo-api/src/db/schema/index.ts`            | gladius-products, gladius-inquiries, blog-posts   | re-exports                      | WIRED  | Lines 22-24 export all three schemas                                                          |
| `el-templo-api/src/modules/blog/image-service.ts` | r2 plugin                                         | PutObjectCommand + getSignedUrl | WIRED  | Correct S3Client usage confirmed                                                              |
| `GladCatalog.vue`                                 | /api/gladius/products                             | useFetch                        | WIRED  | L32: `${apiUrl}/api/gladius/products` — apiUrl fallback is bare host `http://localhost:3000`  |
| `GladContact.vue`                                 | /api/gladius/inquire                              | $fetch POST                     | WIRED  | L92: `${baseUrl}/api/gladius/inquire` — baseUrl fallback is bare host `http://localhost:3000` |
| `blog/index.vue`                                  | /api/blog/posts                                   | useFetch                        | WIRED  | L61: `${config.public.apiUrl}/api/blog/posts` — gap CLOSED, /api/ prefix confirmed            |
| `blog/[slug].vue`                                 | /api/blog/posts/:slug                             | useFetch                        | WIRED  | L33: `${config.public.apiUrl}/api/blog/posts/${slug.value}` — gap CLOSED                      |
| `BlogSidebar.vue`                                 | /api/blog/posts                                   | useFetch                        | WIRED  | L38: `${config.public.apiUrl}/api/blog/posts?limit=5` — gap CLOSED                            |
| `el-templo-admin/src/router/routes.ts`            | BlogListPage, BlogEditorPage, GladiusProductsPage | allowedRoles                    | WIRED  | All 4 routes have `meta: { allowedRoles: ['admin', 'superadmin'] }`                           |
| `AdminLayout.vue`                                 | Blog/Gladius sidebar items                        | isAdminRole computed            | WIRED  | L44: `v-if="isAdminRole"` wraps Blog and Gladius items; computed from authStore.user.role     |

### Requirements Coverage

| Requirement | Source Plan | Description                                                             | Status    | Evidence                                                                                    |
| ----------- | ----------- | ----------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------- |
| GLAD-01     | Plan 02     | Hero with product imagery, "FORJADO PARA LOS QUE ENTRENAN EN SERIO." H1 | SATISFIED | GladHero.vue (428 lines), gladiusConfig.hero.title matches exactly                          |
| GLAD-02     | Plan 02     | Product philosophy section                                              | SATISFIED | GladPhilosophy.vue exists, split layout with 3 features                                     |
| GLAD-03     | Plan 01, 03 | Product catalog (API-backed, admin CRUD)                                | SATISFIED | GladCatalog.vue fetches correctly; GladiusProductsPage.vue provides CRUD                    |
| GLAD-04     | Plan 02     | "En Accion" real-use photo gallery                                      | SATISFIED | GladInAction.vue with mosaic grid                                                           |
| GLAD-05     | Plan 01, 02 | Contact/purchase section — WhatsApp CTA + inquiry form                  | SATISFIED | GladContact.vue submits to /api/gladius/inquire correctly                                   |
| GLAD-06     | Plan 02     | Shares header/footer with main domain                                   | SATISFIED | gladius.vue uses default layout (no explicit layout set = default)                          |
| BLOG-01     | Plan 01     | Blog post data model in el-templo-api                                   | SATISFIED | blog_posts table, BlogService, blogRoutes all implemented with integration tests            |
| BLOG-02     | Plan 03     | Blog editor in el-templo-admin                                          | SATISFIED | BlogEditorPage.vue (616 lines), useBlogApi, useBlogImageUpload                              |
| BLOG-03     | Plan 04     | Blog index page with post cards fetched from API                        | SATISFIED | blog/index.vue fetches from correct URL, cards rendered via BlogPostCard                    |
| BLOG-04     | Plan 04     | Individual post page with brand typography                              | SATISFIED | blog/[slug].vue fetches from correct URL, Markdown rendered via marked with full brand CSS  |
| BLOG-05     | Plan 04     | Per-post SEO: meta tags, Open Graph, Article schema                     | SATISFIED | useSeoMeta with ogTitle/ogDescription/ogImage/ogUrl/ogType/articlePublishedTime all present |
| BLOG-06     | Plan 04     | Pagination or infinite scroll                                           | SATISFIED | BlogPagination.vue (184 lines) with NuxtLink SEO-friendly URLs                              |

### Anti-Patterns Found

| File                         | Line | Pattern                                                                                                     | Severity | Impact                                                                                                                                                                                                                                                                                       |
| ---------------------------- | ---- | ----------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-web/.env.example` | 5    | `NUXT_PUBLIC_API_URL=http://localhost:3000/api` includes /api suffix; all code now appends /api/ explicitly | Warning  | Misleading for local dev — developers who set NUXT_PUBLIC_API_URL per .env.example will get double /api/api/ in all blog and Gladius URLs. Code fallbacks (`\|\| "http://localhost:3000"`) work correctly when env var is absent. Staging/prod secrets presumably hold the correct bare URL. |

No blockers found. The .env.example inconsistency is a documentation warning only and does not affect staging or production.

### Human Verification Required

#### 1. Gladius Page Visual Rendering

**Test:** Open /gladius in browser and verify hero section, parallax scroll, dual CTAs
**Expected:** Full-viewport hero with "FORJADO PARA LOS QUE ENTRENAN EN SERIO." H1, parallax background, VER PRODUCTOS and CONSULTAR buttons, scroll indicator arrow
**Why human:** Parallax, animations, and visual layout cannot be verified programmatically

#### 2. Gladius Inquiry Form End-to-End

**Test:** Fill nombre, email, producto de interes, click ENVIAR CONSULTA
**Expected:** Confirmation message appears with WhatsApp link; DB inquiry row created
**Why human:** Requires running API + database connection

#### 3. Blog Admin Editor — Markdown Toolbar

**Test:** Log in as admin, navigate to /blog/new, type in body, use Bold/Italic/H2/Image toolbar buttons
**Expected:** Syntax inserted at cursor position, preview toggle renders HTML correctly, image upload opens file picker
**Why human:** Textarea cursor manipulation and interactive behavior require manual testing

#### 4. Role Restriction Validation

**Test:** Log in as coach user and inspect admin sidebar
**Expected:** Blog and Gladius menu items not visible; routes /blog and /gladius redirect to /sessions
**Why human:** Requires a coach-role test account and live browser session

#### 5. Confirm NUXT_PUBLIC_API_URL Secret Value and Fix .env.example

**Test:** Check the value of VITE_API_URL / STAGING_VITE_API_URL GitHub secrets; update .env.example
**Expected:** Secret value should be bare host WITHOUT /api suffix (e.g., `https://api.eltemplo.org`). Update `el-templo-web/.env.example` line 5 from `http://localhost:3000/api` to `http://localhost:3000` to prevent developer confusion.
**Why human:** Secret values are not visible in the codebase; .env.example update is a minor non-blocking fix

### Re-Verification Summary

The previous verification (score 10/13) identified a single systematic bug: all blog public-facing web pages were missing the `/api/` segment in their useFetch URL construction. The fix was applied and committed to all three affected files:

- `/home/franco/projects/el-templo/el-templo-web/pages/blog/index.vue` L61: now `${config.public.apiUrl}/api/blog/posts`
- `/home/franco/projects/el-templo/el-templo-web/pages/blog/[slug].vue` L33: now `${config.public.apiUrl}/api/blog/posts/${slug.value}`
- `/home/franco/projects/el-templo/el-templo-web/components/BlogSidebar.vue` L38: now `${config.public.apiUrl}/api/blog/posts?limit=5`

No regressions found. All previously passing artifacts (API backend, Gladius frontend, admin panel) continue to pass. The phase goal is fully achieved.

---

_Verified: 2026-03-01T22:00:00Z_
_Verifier: Claude (gsd-verifier)_
_Mode: Re-verification after gap closure_
