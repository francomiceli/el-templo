# Phase 36: SEO + Analytics - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Optimize the entire el-templo-web site for search engines and instrument conversion tracking. Structured data tells Google what every page is, meta tags drive social sharing, performance meets Core Web Vitals targets, and analytics capture every meaningful user action. All content pages (phases 29-35) are built — this phase adds the SEO and tracking layer on top.

</domain>

<decisions>
## Implementation Decisions

### Cookie Consent

- No banner for Argentina visitors (legally not required)
- Minimal informational banner for EU visitors only (detected via browser timezone heuristic — Europe/\* timezones)
- Banner: bottom toast bar, fixed position, dismiss (X) button only
- Standalone message: "Este sitio usa cookies de análisis" — no link to privacy page
- Permanent dismissal via localStorage — once dismissed, never shows again
- Analytics load immediately regardless of banner state (informational only, not blocking)

### Analytics Events (GA4)

- GA4 Measurement ID stored as env var (`NUXT_PUBLIC_GA4_ID`) — actual ID configured in Phase 38
- Track: page views (automatic), form submissions, WhatsApp CTA clicks, conversion CTA clicks, section-based scroll depth
- Section-based scroll tracking on ALL pages with sections (home, franquicias, gladius) — fires events like `viewed_method`, `viewed_locations` when sections enter viewport
- CTA click tracking: conversion CTAs only — "Probá una clase gratis", "Aplicá ahora", WhatsApp buttons, form submits, "Consultá disponibilidad"
- Event names only — no extra parameters (GA4 captures page URL automatically)

### Meta Pixel

- Meta Pixel ID stored as env var (`NUXT_PUBLIC_META_PIXEL_ID`) — actual ID configured in Phase 38
- Fire Lead event on franchise form submission (FranForm.vue)
- Basic page view tracking on all pages
- Critical for existing Meta ad campaigns — site needs full integration

### Structured Data (JSON-LD)

- Use `nuxt-schema-org` module (type-safe, composable-based)
- Organization schema: name, url, logo, description, sameAs social links (social URLs deferred to Phase 38 as placeholders)
- LocalBusiness schema per sede: full detail (name, address, geo coords, hours, phone, photos, services) — use whatever location data exists in codebase now, Phase 38 fills gaps
- Article schema for blog posts: full — headline, datePublished, author (name, url), publisher (El Templo org), image
- FAQPage schema: Claude's discretion on which pages get it (wherever FAQ content naturally exists)

### Sitemap & Robots

- Auto-generated sitemap.xml including static pages AND dynamic blog post URLs (fetched from API at build time)
- robots.txt: allow all crawlers, point to sitemap. No blocking.

### Image Optimization

- Use `@nuxt/image` module for automatic optimization: resize, format negotiation (WebP/AVIF), responsive srcset
- Static PNG/JPG assets converted to WebP at build time with fallback via `<picture>` element
- Hero image gets `<link rel="preload">` hint (LCP element — critical for Core Web Vitals)
- All `<img>` tags: lazy loading + meaningful alt text

### Font Optimization

- Self-host all fonts (Montserrat, Cormorant Garamond, Geologica) — eliminate Google Fonts CDN dependency
- Removes 2 DNS lookups and external font download latency
- Improves LCP and CLS scores

### Additional SEO

- Semantic HTML audit: proper heading hierarchy (one H1 per page, H2s for sections), semantic tags (article, nav, main, aside)
- Canonical URLs on every page
- Target keyword placement: calistenia, entrenamiento peso corporal, gimnasio funcional [ciudad] — naturally in H1s, H2s, meta descriptions, first paragraphs
- Internal linking: cross-links between pages (home ↔ franquicias, blog ↔ related pages)
- Custom branded 404 page

### Claude's Discretion

- Exact cookie banner styling within design system
- GA4 enhanced measurement configuration
- Which pages get FAQPage schema beyond the home page
- Exact internal linking strategy
- Image compression quality levels
- Font subsetting (which character sets to include)

</decisions>

<specifics>
## Specific Ideas

- Meta ads are already running — the landing page needs full integration with the existing ad infrastructure
- Section-based scroll tracking preferred over percentage-based — more actionable for a landing page ("viewed_locations" vs "scrolled 75%")
- User explicitly wanted to understand what each SEO concept does before deciding — educational approach valued

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `useHead()` already used on most pages (index, blog, franquicias, gladius) with title + description + OG tags
- `useSeoMeta()` used on blog/[slug].vue with per-post OG and article meta
- `loading="lazy"` already on BlogPostCard and GladCatalog images
- Sentry plugin exists (plugins/sentry.client.ts) — pattern for client-side plugin integration
- `useScrollReveal` composable exists — similar pattern can be adapted for section viewport tracking
- Design system CSS tokens in assets/css/tokens.css

### Established Patterns

- SSG mode (`nitro.preset: "static"`) — all pages pre-rendered at build time
- Runtime config via `runtimeConfig.public` — pattern for GA4/Pixel env vars
- Component-per-section architecture (SectionHero, SectionMethod, etc.) — each section component is a natural tracking boundary
- Composables expose `cleanup()` method per project convention

### Integration Points

- `nuxt.config.ts` — add modules (nuxt-schema-org, @nuxt/image, @nuxt/sitemap), head config, runtime config
- `app.vue` — global layout where Organization schema goes
- Each page file — per-page structured data and meta tags
- `FranForm.vue` — Meta Pixel Lead event fires on form submission
- All WhatsApp/CTA components — GA4 click events
- `public/` — robots.txt, self-hosted font files
- Build pipeline — image conversion, font downloading

</code_context>

<deferred>
## Deferred Ideas

**Phase 38: Content & Media Handoff** (already added to roadmap):

- Replace placeholder media with real assets from team
- Configure production Meta Pixel ID from ads team
- Configure production GA4 Measurement ID
- Populate full LocalBusiness structured data per sede (hours, phone, photos, services)
- Add real social media URLs to Organization schema sameAs
- Final content review pass across all pages

</deferred>

---

_Phase: 36-seo-analytics_
_Context gathered: 2026-03-01_
