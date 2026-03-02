# Phase 34: Franquicias Page - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Full franchise landing page at /franquicias — hero, value props (4 cards), franchise model comparison (Activa vs Pasiva), "Qué Incluye" grid (6 items), expansion map with animated counters, founder bio with timeline, application form, WhatsApp integration. The primary franchise acquisition funnel. A prospective investor landing here must understand the opportunity, compare models, see traction, and submit an application — all without having seen the home page.

</domain>

<decisions>
## Implementation Decisions

### Form submission backend

- API route in el-templo-api with new `franchise_applications` table in MySQL
- Email notification via Resend to Ignacio (founder) on each submission
- Post-submit: show confirmation message + derive to WhatsApp with founder's number
- CRM/Mailchimp integration deferred to Phase 38 (Franchise Application Management)
- GA4 event + Meta Pixel Lead event wired in Phase 36 (SEO + Analytics)

### Expansion map

- Custom SVG map showing Argentina + Spain with brand-colored pins
- Pins: Terracotta for active sedes, Aged Gold for "próximamente"
- "¿Tu ciudad?" callout element on the map (not a fake pin — a text/visual callout reinforcing expansion narrative)
- SVG map renders on all breakpoints including mobile (scaled down, not replaced by list)
- Sede data shared with home page SectionLocations where it overlaps (data/sedes.ts), but franquicias has its own expansion-specific data (counters, map coordinates) in a separate file

### Animated counters + scroll interactions

- Extract count-up animation into shared `useCountUp` composable (reuse rAF + ease-out-cubic from SectionCommunity)
- Founder timeline: sequential reveal per milestone with stagger (0.15s), connecting line draws progressively
- Value prop cards (4) and "Qué Incluye" items (6): same fade-in + translateY stagger pattern (0.1s delay), consistent across both
- Activa vs Pasiva comparison cards: accent border differentiation — Activa gets Terracotta left border, Pasiva gets Aged Gold left border
- Comparison cards hover: elevation sutil (box-shadow + translateY -2px) per spec

### Video/PDF section

- Conditionally rendered — section does not exist on the page if no video URL and no PDF URL are configured
- Configuration via `data/franquicias.ts` with `videoUrl` and `pdfUrl` fields (null by default)
- Video format: self-hosted MP4 (not YouTube/Vimeo embed)
- PDF: downloadable investor brochure with "DESCARGAR BROCHURE" button

### Claude's Discretion

- Component architecture (how many Section\* components to create)
- Loading skeleton / spinner design for form submission
- Exact SVG map geometry and pin placement
- Form validation UX details (inline vs on-submit, error message copy)
- Scroll indicator behavior on franquicias hero
- Spacing and padding fine-tuning within spec constraints

</decisions>

<specifics>
## Specific Ideas

- The spec is extremely detailed — all copy, typography, colors, responsive rules, and interactions are defined in `.docs/brand-landing/spec-franquicias-pt1.md` and `spec-franquicias-pt2.md`
- CTA "QUIERO APLICAR" appears 3 times: post-hero, post-modelos, and as the form submit — each reinforces after adding information
- The landing must work as an autonomous piece — an investor with a direct link should understand everything without seeing the home page
- The investor should feel they're "accessing something exclusive, not buying a commodity franchise"
- Franchise application management (admin panel with AI-powered conversion strategies) was captured as Phase 38

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `useScrollReveal` composable: scroll-triggered entrance animations (used by all home page sections)
- `SectionHero.vue`: full-viewport hero pattern with video bg, overlay, staggered entrance, parallax — reference for franquicias hero
- `SectionLocations.vue`: sede card pattern with `data/sedes.ts` — shared sede data source
- `SectionCommunity.vue`: count-up animation (rAF + ease-out-cubic) — extract into `useCountUp` composable
- `SectionConversion.vue`: dual-card layout with CTAs — reference for Activa/Pasiva comparison
- `PlaceholderBox.vue`: image placeholder component (for assets marked PENDIENTE)
- `.btn` system: `.btn--primary` (Terracotta), `.btn--secondary-gold`, `.btn--ghost` — all available in `buttons.css`

### Established Patterns

- Section-per-component architecture: each section is a standalone `Section*.vue` component
- Data files in `data/` directory: `sedes.ts`, `ecosystem.ts`, `faq.ts`, `community.ts` — static data separated from components
- CSS: BEM naming, token variables only (never raw colors), scoped styles
- Staggered entrance: CSS transitions with inline `transition-delay` via `:style` binding
- `prefers-reduced-motion` guard on all animations
- HTML entities for accented characters

### Integration Points

- `pages/franquicias.vue` exists as stub — replace with full section composition
- Shares `AppNav` and `AppFooter` via default layout (already working)
- "Abrí tu Templo" CTA on home hero links to `/franquicias` (already wired)
- API endpoint: new route in el-templo-api for franchise application submission
- WhatsApp link: `https://wa.link/ci8dpl` (same as floating button)

</code_context>

<deferred>
## Deferred Ideas

- **Phase 38: Franchise Application Management** — Admin panel in el-templo-admin for managing franchise applications (view/filter/sort, track status, AI agent integration for tailored conversion strategies). Added to roadmap.
- **CRM/Mailchimp integration** — Wire form submissions to Mailchimp audience. Deferred to Phase 38.

</deferred>

---

_Phase: 34-franquicias-page_
_Context gathered: 2026-03-01_
