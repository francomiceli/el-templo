# Phase 35: Gladius + Blog - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Two sub-features: (1) A Gladius equipment showcase page at `/gladius` that drives WhatsApp inquiries with DB-backed product catalog and inquiry form, and (2) a full blog system at `/blog` with API-backed CRUD, Markdown admin editor with toolbar, and pre-rendered pages in el-templo-web. Both include admin panels in el-templo-admin restricted to admin role (not coaches).

</domain>

<decisions>
## Implementation Decisions

### Blog content model

- Body stored as **Markdown** — clean, versionable, no rendering surprises
- Admin editor has a **visual toolbar** that inserts Markdown syntax (bold, italic, headings, links, images, lists) so authors don't need to know Markdown
- **Minimal metadata fields:** title, slug, excerpt, cover image URL, body (markdown), status (draft/published), created_at, updated_at, published_at
- Reading time auto-calculated from body word count (not stored, computed on render)
- **Draft + Publish workflow:** posts start as draft, explicit publish action makes them live, can unpublish to revert to draft

### Blog admin editor

- **Single pane + preview toggle** layout (full-width editor, "Preview" button/tab to switch views)
- **Direct image upload** in the editor — drag-and-drop or button uploads to R2, inserts Markdown image syntax with the R2 URL (reuse Phase 28 R2 infrastructure)
- Cover image uses the **same upload flow** as body images (same R2 upload mechanism)
- Blog post list in admin: **table with search + sort** — columns: title, status, date. Sortable, searchable, filterable by status (All / Drafts / Published)

### Blog index & reading

- Route: **/blog** (SEO standard — maximum discoverability, page content/heading can still be on-brand)
- Index layout: **vertical list (full width)** — posts stacked vertically, cover image + title/excerpt/date
- Browsing: **pagination with page numbers** — SEO-friendly, SSG-compatible (each page pre-rendered with unique URL)
- Individual post page: **sidebar layout** — article content (~70%) + sidebar (~30%)
- Sidebar contains: **recent posts (3-5)** + brand CTA (reservar sesion) + **social share buttons** (WhatsApp, Twitter/X, copy link)
- Post page hero: full-width cover image, then centered article content with brand typography

### Gladius product catalog

- Product data: **DB-backed with admin CRUD** in el-templo-admin
- **Basic product fields for now:** name, description, photo (single), slug — no specs, no multiple photos, no categories yet (can expand when real product data arrives)
- **No visible price** — "Consultar" button instead. Matches brand voice: never "compra ahora", "oferta", "descuento"
- Inquiry approach: **Form + WhatsApp** (same pattern as franquicias) — simple form (nombre, email, producto de interes) saved to DB via API, plus WhatsApp CTA as alternative

### Admin access control

- Blog admin panel and Gladius admin panel are **restricted to admin role only** (owner/superadmin)
- Coaches cannot see or access blog or Gladius management sections in el-templo-admin

### Claude's Discretion

- Markdown editor library choice (e.g., CodeMirror, Monaco, textarea with custom toolbar)
- Gladius page section transitions and animations (follow existing patterns from Phase 31-34)
- Blog pagination page size (likely 10 posts per page)
- R2 upload path/prefix for blog images vs video uploads
- Gladius inquiry DB table structure (similar to franchise_applications pattern)
- Individual product page vs catalog-only display

</decisions>

<specifics>
## Specific Ideas

- Gladius page follows the 5-section structure from spec-gladius-pt1/pt2: Hero, Philosophy, Catalog, "En Accion" (real-use photos), Contact/Purchase
- Hero copy: "FORJADO PARA LOS QUE ENTRENAN EN SERIO." with subfrase from spec
- Brand voice for Gladius: registro narrativo (60%) + funcional (30%) + ceremonial in hero (10%). More direct than home, but never e-commerce generic
- Gladius vocabulary: "Consultar", "Adquirir", "Ver producto", "Solicitar" — never "compra ahora"
- Gladius visual specs: Warm Stone/Marble Cream alternating backgrounds, Deep Charcoal hero, product cards on Warm Linen, golden hour photography, never pure white backgrounds
- Franchise inquiry form pattern (FranForm.vue + API route) is the template for Gladius inquiry form
- Nav already has Gladius link with Aged Gold hover differentiation (implemented in Phase 30)

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `FranHero.vue` — Full-viewport hero pattern with parallax, overlay, staggered entrance (template for GladHero)
- `FranForm.vue` + franchise API route — Form submission pattern with DB save + email notification (template for Gladius inquiry)
- `FranWhatsApp.vue` — Floating WhatsApp button component (reusable for Gladius)
- `useScrollReveal` composable — Scroll-triggered entrance animations used across all sections
- `useCountUp` composable — Animated counter (if Gladius needs stats)
- `PlaceholderBox.vue` — Image placeholder for sections awaiting real photography
- `data/*.ts` pattern — TypeScript data files for section content (sedes.ts, ecosystem.ts, faq.ts, franquicias.ts)
- R2 upload infrastructure from Phase 28 — Reusable for blog image uploads

### Established Patterns

- BEM naming: component-specific prefix (fran-, section-, ecosystem-) — Gladius will use `glad-` prefix, Blog will use `blog-` prefix
- Page composition: page.vue imports and composes section components (see franquicias.vue)
- Data files in `data/` directory for static section content
- Form submission: `$fetch` for event handler API calls, not `useFetch`
- Admin app uses Quasar + Vue 3 + Pinia composition API
- API routes in Fastify with Drizzle ORM + MySQL

### Integration Points

- `pages/gladius.vue` — Already exists as stub ("Proximamente"), needs to be replaced with full page
- `AppNav.vue` — Gladius link already in nav with Aged Gold hover (line 19-24)
- `data/ecosystem.ts` — Gladius pathway card points to `/gladius` (already live)
- el-templo-api routes — New routes needed for blog CRUD and Gladius product CRUD + inquiry form
- el-templo-admin pages — New pages needed for blog editor and Gladius product management
- el-templo-api DB schema — New tables: blog_posts, gladius_products, gladius_inquiries

</code_context>

<deferred>
## Deferred Ideas

- Multiple product photos / gallery per Gladius product — expand when real product data arrives
- Product categories and filtering — expand when catalog grows beyond basic items
- Product specs (dimensions, weight, material) — add when detailed product info is available
- Blog scheduling (publish at future date) — add if content workflow demands it
- Blog tags/categories — can add later for content strategy refinement

</deferred>

---

_Phase: 35-gladius-blog_
_Context gathered: 2026-03-01_
