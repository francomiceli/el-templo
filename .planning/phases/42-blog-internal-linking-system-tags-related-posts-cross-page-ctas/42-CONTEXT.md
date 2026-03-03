# Phase 42: Blog Internal Linking System — Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a tag taxonomy, related posts, tag browsing pages, and cross-page CTAs to the Gladius blog. Goal: improve internal linking for SEO (link equity distribution, topical clustering, crawl depth) and increase reader engagement/time-on-site. Does NOT include new content creation, comments, or search functionality.

</domain>

<decisions>
## Implementation Decisions

### Tag System

- Flat tags only (no categories hierarchy) — simpler to manage, flexible, good SEO via tag pages
- Predefined tag pool managed in admin — no free-form tag entry to prevent tag sprawl/duplicates
- Each post gets 2–5 tags assigned in admin when creating/editing
- DB schema: `blog_tags` table (id, name, slug) + `blog_post_tags` junction table (post_id, tag_id)
- Tags display as small clickable pills on BlogPostCard (index) and on blog post pages (below title/meta)
- Tag pills link to their tag browse page (/blog/tag/[slug])
- Initial seed tags populated via DB migration (not just admin UI). Seed list aligned with SEO targets:
  - **Training:** calistenia, peso-corporal, fuerza, resistencia, skills, rutinas, entrenamiento-funcional
  - **Level:** principiantes, intermedio, avanzado
  - **Body/Health:** movilidad, flexibilidad, nutricion, recuperacion
  - **Method/Brand:** metodo-el-templo, progresiones, disciplina
- Seed migration ensures the blog launches with a ready-to-use tag pool — admins assign tags, not create from scratch

### Related Posts

- Automatic tag-based algorithm: rank other published posts by number of shared tags with current post
- Show 3 related posts in a "Posts Relacionados" section at the bottom of the article, before the sidebar stacks on mobile
- Card format: small horizontal card (thumbnail + title + tag pills) — reuse BlogPostCard patterns
- Fallback: if fewer than 3 tag-matched posts, fill remaining slots with most recent posts (excluding current)
- API endpoint: GET /blog/posts/:slug/related?limit=3 — computed server-side for SSR/SEO benefit

### Cross-Page CTAs

- Bottom-of-post CTA banner: full-width styled block between article end and related posts
- 3 CTA types with admin selection per post (default: trial session):
  1. **Trial session** (default) — "Reservá tu Sesión de Prueba" → WhatsApp link (same as current sidebar)
  2. **Franchise inquiry** — "Abrí tu Templo" → /franquicias
  3. **App/Gladius** — "Entrená con la App" → /gladius
- Sidebar CTA remains as-is (always shows trial session)
- In-article contextual internal links are a content concern, not a code feature — admin writes them in Markdown body naturally

### Tag Browsing & Filtering

- Tag browse pages at /blog/tag/[slug] — paginated list of posts with that tag
- Reuse blog index layout (BlogPostCard list + pagination) with tag-specific header
- Per-tag SEO meta: title "Artículos sobre {Tag} | El Templo", description, canonical /blog/tag/[slug]
- Popular tags bar on blog index page: horizontal scrollable row of tag pills above the post list
- Tags bar shows all tags that have at least 1 published post, ordered by post count descending
- Tag pages included in sitemap (dynamic sitemap source like existing blog.ts)
- JSON-LD BreadcrumbList on tag pages: Home > Blog > {Tag}

### Claude's Discretion

- Exact tag pill styling (colors, size, hover states) — follow existing design tokens
- Related posts ranking tiebreaker (recency vs alphabetical)
- Tag bar scroll behavior details (arrows, snap, fade edges)
- Admin UI for tag management (CRUD) and post tag assignment — follow existing admin patterns
- Migration strategy for existing posts (they'll start with 0 tags)

</decisions>

<specifics>
## Specific Ideas

- SEO targets from brand spec: calistenia, entrenamiento peso corporal, gimnasio funcional [ciudad], wellness — tags should cluster around these
- Competitor SomosCore.fit has terrible SEO — proper internal linking gives El Templo a strong advantage
- Tag pages create topical clusters (key Google ranking signal) — each tag page becomes a hub for its topic
- Related posts reduce bounce rate and increase pages/session — both positive SEO signals
- Cross-page CTAs drive traffic from informational content (blog) to conversion pages (franquicias, gladius, trial)

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `BlogPostCard` component: vertical card with image, meta, title, excerpt, CTA — can be extended to show tag pills
- `BlogSidebar`: sticky sidebar with recent posts, brand CTA, social share — related posts section goes in article area, not sidebar
- `BlogPagination`: pagination component — reuse on tag pages
- `PlaceholderBox`: image placeholder — already used in blog cards
- Design token system: --color-terracotta, --font-authority, --radius-card, etc.

### Established Patterns

- BEM naming convention for all components (blog-card**, blog-post**, blog-sidebar\_\_)
- Scoped styles with CSS custom properties (design tokens)
- `useFetch` for data loading with computed reactivity
- Blog API at /api/blog with public + admin route separation
- Drizzle ORM schema definitions in el-templo-api/src/db/schema/

### Integration Points

- `blog_posts` table needs foreign key relationship via junction table
- Blog routes.ts needs new endpoints: tag CRUD, post-tag assignment, related posts, tag listing
- Blog service.ts needs tag query methods
- Blog index page needs tag bar component
- Blog post page needs tag pills + related posts + bottom CTA
- Sitemap source (server/api/**sitemap**/blog.ts) needs tag page entries
- Admin app needs tag management UI + post tag assignment in post editor

</code_context>

<deferred>
## Deferred Ideas

- Full-text search across blog posts — separate phase
- Author system (multiple authors with profiles) — separate phase
- Blog post series/collections (ordered multi-part articles) — future consideration
- Newsletter/email subscription CTA — separate phase
- Reading progress indicator — minor enhancement, not internal linking

</deferred>

---

_Phase: 42-blog-internal-linking-system-tags-related-posts-cross-page-ctas_
_Context gathered: 2026-03-02_
