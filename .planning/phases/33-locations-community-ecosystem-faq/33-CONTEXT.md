# Phase 33: Locations + Community + Ecosystem + FAQ - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete the home page with the final 4 sections: sede location cards, community social proof (gallery/testimonials/stats), ecosystem pathway cards, and FAQ accordion. All copy, layout, CSS, and responsive behavior are fully specced in spec7–spec10. This phase implements the specs as Vue components integrated into the existing index.vue page.

</domain>

<decisions>
## Implementation Decisions

### Sede data & photos

- Sede data (names, addresses, Maps links, WhatsApp number) lives in a **TypeScript config file** (`data/sedes.ts`) with typed interfaces — consistent with how SectionMethod/SectionConversion handle data
- **Placeholder boxes** (using existing PlaceholderBox component with sede name overlay) for images until real photos arrive — zero code change needed when real images drop in
- **Single shared WhatsApp link** for all "Reservar sesión" CTAs — can be split per-sede later in the config when individual numbers are available
- Chapadmalal badge text: **"RETIRO"** (Aged Gold background per spec)
- Park badge: "AL AIRE LIBRE" (Olive Stone background per spec)
- Barcelona badge: "INTERNACIONAL" (Azul Noche background per spec)

### Community gallery & testimonials

- Photo mosaic uses **CSS Grid with named areas** — fixed template layout for predictable placement of mixed aspect ratios (1:1, 3:2, 4:3). Mobile switches to horizontal scroll per spec
- **Basic lightbox included** — fullscreen overlay on gallery photo click (COM-05)
- **Count-up animation on scroll** for stats counters (1000+ alumnos, 8 sedes, etc.) — triggered via useScrollReveal (composable already exists)
- Testimonials use **spec placeholder text as-is** with `[Nombre]` markers — the 3 placeholder quotes cover transformation, age accessibility, and community angles. Swap for real testimonials later

### FAQ accordion

- Animation: **CSS max-height + opacity** matching spec exactly (max-height 400ms ease, opacity 300ms ease). No JS animation library
- FAQ data (9 Q&A pairs) in a **separate TypeScript data file** (`data/faq.ts`) — consistent with sede data approach
- **All 9 questions from day one** — copy is finalized and approved, covers distinct objections in deliberate order
- Icon toggle: **CSS-only with ::before pseudo-element** — renders + / − via content property with 300ms rotation transform on toggle. No extra markup
- First question open by default, only 1 open at a time, ARIA attributes (aria-expanded, role="region")

### Section integration

- Component names: **SectionLocations, SectionCommunity, SectionEcosystem, SectionFaq** — follows existing Section[Name] English convention
- **Replace existing sedes stub** in index.vue + add 3 more sections after it, in spec order: Locations → Community → Ecosystem → FAQ → (existing footer)
- **All 4 sections with staggered scroll reveals** — sections fade in on scroll, child elements (cards, testimonials, stats) stagger in sequence. Matches SectionMethod/SectionIdentity pattern
- Data files in centralized **`data/` directory** at project root: `el-templo-web/data/sedes.ts`, `faq.ts`, `ecosystem.ts`, `community.ts`

### Claude's Discretion

- Exact mosaic grid-template-areas layout for the gallery (based on photo count and spec diagram)
- Count-up animation duration and easing
- Lightbox component implementation details
- Scroll reveal threshold and stagger timing per section
- Ecosystem card internal layout details (spec provides the structure but exact padding/spacing is flexible)

</decisions>

<specifics>
## Specific Ideas

- Specs 7–10 in `.docs/brand-landing/` contain fully approved copy, HTML structure, CSS specs, and layout diagrams — use them as the primary reference
- The section background alternation pattern matters: Locations (Marble Cream) → Community Zone A (Warm Stone) → Community Zone B / Aura Club (Marble Cream) → Ecosystem (Warm Stone) → FAQ (Marble Cream)
- Ecosystem cards have colored left-border accents (3px): Azul Noche (App), Terracotta (Academy), Aged Gold (Franquicias), Aged Gold (Gladius)
- Aura Club sub-section within Community uses Aged Gold as its identity color — ghost CTA with Aged Gold border
- FAQ answers should never say "clase" — always "sesión"

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `useScrollReveal` composable: IntersectionObserver-based fade-in/slide-up with prefers-reduced-motion support. Used by SectionIdentity and SectionMethod
- `PlaceholderBox` component: Used for sede image placeholders
- Design tokens in `assets/css/tokens.css`: All colors, fonts, spacing, shadows, transitions defined
- Button styles in `assets/css/buttons.css`: Existing btn patterns for CTAs
- `useActiveSection` composable: For nav highlighting if needed

### Established Patterns

- Section components are self-contained `.vue` files in `components/` with BEM-style scoped CSS
- Data is defined as typed arrays directly in `<script setup>` (SectionMethod, SectionConversion) — Phase 33 moves this to separate data files
- Scroll reveal: multiple `useScrollReveal()` instances per component, one per stagger group
- Section structure: tag → h2 title → subtitle → content, using `.section__tag`, `.section__title`, `.section__subtitle` base classes

### Integration Points

- `pages/index.vue`: Replace sedes stub (lines 17-28), add SectionCommunity, SectionEcosystem, SectionFaq after SectionLocations
- `layouts/default.vue`: AppNav + AppFooter already wrap pages
- `assets/css/layout.css`: Global layout utilities (`.section`, `.section__container`)
- Ecosystem card CTAs link to `/franquicias` and `/gladius` (pages already exist as stubs)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 33-locations-community-ecosystem-faq_
_Context gathered: 2026-03-01_
