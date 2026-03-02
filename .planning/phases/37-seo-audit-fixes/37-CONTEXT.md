# Phase 37: SEO Audit Fixes - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Address all actionable issues from the seoptimer audit (score C+, 2026-03-02). Covers both Nuxt codebase fixes (title tags, favicon, social links, email obfuscation, heading keywords, inline styles, content visibility) and server-side fixes (Nginx HTTP/2, Gzip compression). Does NOT include backlink strategy (marketing task) or AMP (not applicable).

Source: `.docs/brand-landing/landing-seo-analysis.txt`

</domain>

<decisions>
## Implementation Decisions

### Social Media Profiles

- Enable footer social icons for **Instagram, YouTube, Facebook** (three platforms with active profiles)
- **Remove TikTok** icon from footer entirely (no active profile)
- **Skip LinkedIn** (not relevant for consumer fitness brand)
- Instagram links to main account: `https://www.instagram.com/eltemplomdp/` (Barcelona account `eltemplo.bcn` is secondary, not in footer)
- YouTube: `youtube.com/@ElTemplomdp/`
- Facebook: `https://www.facebook.com/eltemplomdp/`
- Add a Facebook SVG icon to footer (currently only Instagram, YouTube, TikTok icons exist)
- **X/Twitter:** Keep `twitter:site` meta tag for card previews but do NOT add X icon to footer
- Populate Organization `sameAs` array in `app.vue` with all three active profile URLs

### Title Tag Optimization

- Homepage title: **"El Templo | Calistenia, Movimiento Funcional y Peso Corporal"** (59 chars) — hits all three target keywords
- Sub-page pattern: **content-first, brand suffix** — e.g. "Franquicias de Calistenia | El Templo"
- Blog post pattern: **"[Post Title] | El Templo"**
- Audit and optimize ALL title tags + OG titles + OG descriptions across all 5 page types (home, franquicias, gladius, blog index, blog posts)
- **Page-specific keyword strategy** — each page targets its own keyword cluster to avoid self-cannibalization:
  - Home: calistenia, movimiento funcional, peso corporal
  - Franquicias: franquicia gimnasio, franquicia calistenia
  - Gladius: equipamiento calistenia
  - Blog: entrenamiento, calistenia (topical)

### Heading Keyword Pass

- **Do another keyword audit** of all H1/H2/H3 tags across all pages
- **SEO density first** — prioritize getting target keywords into headings even if slightly more literal than current poetic copy
- Every heading should contain at least one target keyword from the page's keyword cluster

### Content Visibility

- **Fix SSG dynamic rendering issue** AND add a visible content summary block near page top
- Investigate why seoptimer sees 43% dynamic rendering and 0 headings despite SSG preset
- Add a visible (not hidden) intro/summary text block with key terms to increase indexable text content

### Contact Info

- **Obfuscate email** — keep visible to users but use JavaScript rendering or HTML entities to hide from scrapers
- **Email domain:** Verify which domain is correct (eltemplo.com vs eltemplo.org) — researcher should check active email configuration
- **Show real phone number** in footer: +54 9 223 582-0521 (consistent with LocalBusiness schema)
- **Add main sede address** (Mar del Plata HQ) to footer contact zone — signals business legitimacy

### Favicon

- **Reuse the favicon from el-templo-app** — copy/adapt existing favicon assets to el-templo-web `public/`
- Generate standard multi-size set (favicon.ico, apple-touch-icon, etc.) from existing asset

### Server-Side Fixes (Nginx)

- **Enable HTTP/2** in Nginx configs for eltemplo.org
- **Enable Gzip compression** for CSS and JS (currently 0% compressed; HTML already at 38%)
- No Brotli — Gzip only for simplicity
- **Skip redirect chain optimization** — 0.63s is from US test servers, not impactful for real users

### Inline Styles

- **Audit and reduce** `:style` bindings in Vue components
- Move dynamic values (animation delays, transform offsets) to CSS custom properties or classes where possible
- Accept Vue scoped style data attributes as framework standard (not actual inline style="" concerns)

### Claude's Discretion

- Exact keyword wording for each page's OG descriptions (follow page-specific strategy)
- How to implement email obfuscation (JS rendering, HTML entities, CSS direction trick, etc.)
- Which inline `:style` bindings are worth converting vs keeping (cost/benefit per component)
- Exact content for the visible summary text block
- Favicon size variants and meta tag configuration

</decisions>

<specifics>
## Specific Ideas

- Title must include all three target keywords: calistenia, movimiento funcional, peso corporal
- User explicitly chose SEO density over brand voice for heading keyword optimization
- Favicon should come from el-templo-app (existing asset, not generated)
- Two Instagram accounts exist (eltemplomdp for MDP, eltemplo.bcn for Barcelona) — only link the main one

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `el-templo-app/` favicon assets — reuse for el-templo-web
- `AppFooter.vue` — social icons section already has Instagram, YouTube, TikTok SVGs; needs Facebook SVG added, TikTok removed
- `app.vue` — Organization schema with empty `sameAs` array ready for social URLs
- `pages/index.vue` — useHead with title and meta tags
- All page components have H1/H2/H3 tags with keyword-optimized copy from Phase 36-04

### Established Patterns

- SSG with `nitro: { preset: "static" }` — content pre-rendered at build time
- BEM CSS naming convention throughout
- Inline SVG icons (stroke-based, currentColor) for social media
- `useHead()` composable for page-level meta tags
- `useSchemaOrg()` for structured data

### Integration Points

- `deploy/nginx/` — Nginx configs for HTTP/2 and compression changes
- `el-templo-web/public/` — favicon files go here
- `AppFooter.vue` — social icons, email, phone, address changes
- All page `.vue` files — title tag and OG meta updates
- `app.vue` — Organization sameAs social URLs
- `CityMap.client.vue` — only known .client.vue component (client-only rendering)

</code_context>

<deferred>
## Deferred Ideas

- Backlink strategy (link building, content partnerships) — marketing task, not code
- AMP implementation — not applicable for Nuxt/Vue SSG
- Redirect chain optimization — skipped (minor impact from US test location)
- Brotli compression — skipped in favor of Gzip simplicity; revisit if performance becomes critical

</deferred>

---

_Phase: 37-seo-audit-fixes_
_Context gathered: 2026-03-02_
