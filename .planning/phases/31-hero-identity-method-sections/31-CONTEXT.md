# Phase 31: Hero + Identity + Method Sections - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Three homepage content sections replacing placeholder stubs: a cinematic full-viewport hero, an identity section explaining what El Templo is, and a method section showing session structure and authority. This is the "above the fold" experience that hooks attention. No new pages, no conversion forms, no level/approach content (those are Phase 32+).

</domain>

<decisions>
## Implementation Decisions

### Media assets strategy

- All media assets use placeholders for now — no hero video, no session photos, no author photo available yet
- Hero: solid Deep Charcoal background + overlay gradient (matching current stub pattern), with video-ready HTML structure (`<video>` tag with `autoplay muted loop playsinline` attributes, poster attribute) so real assets can be swapped in later
- Video behavior: autoplay everywhere (desktop + mobile), muted loop. Falls back to poster image if browser blocks autoplay
- Identity section photo: PlaceholderBox with spec aspect ratios (4:5 desktop, 16:9 mobile)
- Author photo: circular PlaceholderBox (1:1) with Aged Gold border

### CTA behavior

- Identity section CTA ("Conocé nuestra filosofía"): dimmed ghost link to `/filosofia` — Olive Stone color, no hover, no pointer cursor. Same Phase 30 pattern for non-existent pages
- Method section CTA ("Probá el método"): active smooth scroll link to `#descubri-nivel` (existing placeholder stub from Phase 30). Will scroll to real conversion section when Phase 32 is built
- Hero CTAs: "Comenzá tu camino" scrolls to `#sesion-prueba` (or `#descubri-nivel` if sesion-prueba doesn't exist yet), "Abrí tu Templo" links to `/franquicias`

### Scroll & entrance animations

- Subtle scroll-triggered animations using IntersectionObserver — elements fade-in + slight upward slide as they enter viewport
- Hero: staggered fade-in on page load (H1 first, then subtitle, then primary CTA, then secondary CTA — each with slight delay). No scroll trigger, fires on mount
- Hero background: subtle parallax effect (background scrolls at ~60% speed of content, CSS transform for performance)
- Identity section: text slides in from left, image/placeholder slides in from right
- Method session cards (Initium, Nucleus, Deuteros, Athlos): staggered entrance with ~100ms delay between each card
- Method subsection backgrounds: clean hard cuts between alternating Warm Stone / Marble Cream — no gradient blending
- Respect `prefers-reduced-motion` — skip all entrance/scroll animations when enabled, content appears instantly

### Author block layout

- Split 40/60 layout — circular photo placeholder (left, 40%) + bio text (right, 60%)
- Photo placeholder: circular with 2px Aged Gold (#B89B5E) border
- Mobile: stacks as photo centered above, name + bio below
- Bio content: "Diseñado por Ignacio Bordón" in Cormorant Garamond Semibold, then factual credentials (ex gymnast, 10+ years, 10k+ students, CEO)

### Method card interactions

- All cards (session + special) have subtle elevation hover: translateY(-4px) + increased shadow on hover
- Watermark number opacity shifts from 0.15 to 0.25 on hover
- All 4 session cards use Terracotta separator line (40px, 2px) — no unique colors per card
- ROM and SKILLS special cards include simple placeholder SVG icons (stretch/mobility symbol for ROM, target/skill symbol for SKILLS)
- No icons on the 4 session structure cards

### Claude's Discretion

- Exact animation timing curves and delays (beyond the ~100ms stagger guideline)
- Parallax implementation details (CSS-only vs JS-driven)
- SVG icon designs for ROM and SKILLS cards
- Component granularity (how to split hero, identity, method into Vue components)
- IntersectionObserver threshold and rootMargin values
- Exact hover shadow values for card elevation effect

</decisions>

<specifics>
## Specific Ideas

- The specs (`.docs/brand-landing/spec1-*`, `spec2-*`, `spec3-*`) are the canonical design source — follow them closely for exact CSS values, BEM class names, HTML structure, and responsive breakpoints
- Hero placeholder should look intentional, not broken — the current stub in `pages/index.vue` already has the right feel (Deep Charcoal + text content), just needs proper component structure
- The staggered hero entrance should feel cinematic — matching the brand's "this is not a gym" premium positioning
- Method section is about generating "confianza técnica" — the structured cards with Latin names should feel methodical and serious
- Session card watermark numbers (01, 02, 03, 04) are decorative, not data — they're like a subtle brand mark
- Never pure black or pure white in any CSS — all established in Phase 30 design tokens

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `PlaceholderBox.vue`: Deep Charcoal bg + Warm Stone border + label. Use for identity photo and author photo placeholders
- `useActiveSection.ts`: IntersectionObserver composable for nav section tracking — may inform scroll animation approach
- Design tokens: all CSS custom properties (`--color-*`, `--font-*`, `--space-*`, `--transition-*`, `--radius-*`) established in Phase 30
- Section pattern: `.section`, `.section--warm-stone`, `.section--deep-charcoal`, `.section__container`, `.section__tag`, `.section__title` classes
- Button classes: `.btn`, `.btn--primary`, `.btn--secondary-gold` already defined

### Established Patterns

- BEM naming convention for all CSS classes
- Scoped styles in Vue SFCs
- `<script setup lang="ts">` for all components
- `import.meta.client` guard for client-only code (not `process.client`)
- Nuxt 3 conventions: `NuxtLink` for routing, `useHead` for meta

### Integration Points

- `pages/index.vue` — replace placeholder stubs for `#hero` and `#metodo` sections, add identity section between them
- `layouts/default.vue` — 64px padding-top for fixed nav (hero needs to account for this or go full-bleed)
- Nav links already reference `/#metodo` — anchor must remain `id="metodo"` for nav active tracking
- No identity section anchor in nav currently — section gets `id="que-es"` per spec but doesn't need nav link

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 31-hero-identity-method-sections_
_Context gathered: 2026-03-01_
