# Phase 32: Levels + Approaches + Conversion Sections - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Build three home page sections: interactive 6-level tab system (Alfa through Olympic), 5 training approach cards (Kallós, Sthenos, Motus, Pyros, Dynamis), and a dual-path conversion section (presencial vs app). Replace the existing anchor stubs in index.vue with real Section components. All copy comes from approved specs (spec4, spec5, spec6). Requirements: NIV-01 through NIV-07, ENF-01 through ENF-05, DESC-01 through DESC-05.

</domain>

<decisions>
## Implementation Decisions

### Level Tab Visuals

- Long-term visuals: real training photos of athletes at each level (user provides)
- For development: use PlaceholderBox component (consistent with SectionMethod and SectionIdentity pattern)
- Mobile visual: compact, max-height 250px (spec value), prioritize text content visibility
- Tab underline animation: sliding Terracotta underline that moves smoothly between tabs (not instant swap)
- Tab panel animation: fade-in 300ms + translateY(8px) as spec defines

### Section Iconography

- Approach cards: inline SVG icons (hand-crafted, like SectionMethod's ROM/SKILLS pattern)
  - Kallós: core/stability icon
  - Sthenos: fist/strength icon
  - Motus: wave/flow icon
  - Pyros: flame icon
  - Dynamis: target/precision icon
- Conversion cards: SVG icons — phone icon (Azul Noche) for app, temple/people icon (Terracotta) for presencial
- Mobile horizontal scroll (approach cards): gradient fade indicator on right edge (Marble Cream) to signal scrollable content

### Conversion CTA Destinations

- "RESERVÁ TU SESIÓN" (Terracotta, presencial): WhatsApp link to +54 9 2235 82-0521 (single central number)
- "DESCARGÁ LA APP" (Azul Noche, app): direct link to app.eltemplo.org (web app, available now)
  - Below the CTA: note that native apps are coming soon (Google Play + App Store) — NOT a modal, just a text note with greyed-out or subtle store references
  - Users must know: the web app works now, native apps are in development
- Level section closing CTA ("COMENZÁ TU CAMINO"): scrolls to #descubri-nivel (conversion section)
- Per-level ghost CTA ("¿ESTE SOS VOS? RESERVÁ TU SESIÓN"): Claude's discretion on destination (WhatsApp or conversion section)

### Content & Copy

- Use spec copy exactly as written — approved by Hefesto, no modifications
- Parametrized values confirmed: 8 sedes (current), app.eltemplo.org (correct web app URL)
- WhatsApp number: +54 9 2235 82-0521

### Claude's Discretion

- Anchor wiring strategy (#sesion-prueba vs #descubri-nivel consolidation)
- Per-level ghost CTA destination (WhatsApp or scroll to conversion)
- App CTA "coming soon" note exact design (subtle store badges, text note, etc.)
- Exact SVG icon designs for approach and conversion cards
- Approach card equal-height enforcement (min-height 320px per spec vs auto-size)

</decisions>

<specifics>
## Specific Ideas

- Approach card closing sentences use `margin-top: auto` inside flex column to align at card bottom (spec requirement)
- Mobile approach cards: horizontal scroll with snap, show ~1.3 cards to hint at scrollability
- Level tabs on mobile: horizontal scroll with snap, hidden scrollbar (same interaction pattern as approach cards for consistency)
- Conversion section on mobile: presencial card goes FIRST (above app card) via CSS order — higher conversion priority
- Tab panel content: 50/50 split on desktop (text left, visual right), stacked on mobile (visual first via order: -1)

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `PlaceholderBox` component: labeled placeholder for pending images/videos — use for all 6 level visuals
- `useScrollReveal` composable: IntersectionObserver-based scroll-triggered entrance animations — use for approach cards grid and conversion cards
- `useActiveSection` composable: scroll-based active section tracking (used by nav)
- `.btn`, `.btn--primary`, `.btn--ghost` CSS classes: reusable button components with Terracotta and bordered variants
- `.section`, `.section__container`, `.section__tag`, `.section__title` utility classes in layout.css

### Established Patterns

- BEM naming convention (e.g., `method__block`, `identity__cta`)
- CSS token variables only — never hardcoded colors (tokens.css)
- Scoped `<style>` per component with responsive breakpoints at 768px and 480px
- Data arrays defined in `<script setup>` (see `sessionBlocks` and `specialSessions` in SectionMethod)
- `prefers-reduced-motion` respected: immediate reveal, no animation
- Staggered entrance animations with `transitionDelay` based on item index

### Integration Points

- `index.vue`: replace 3 anchor stubs (#niveles, #enfoques, #descubri-nivel) with SectionLevels, SectionApproaches, SectionConversion components
- Nav links already wired to #niveles and #enfoques anchors (AppNav.vue)
- Alternating background pattern: Warm Stone / Marble Cream (levels=Warm Stone, approaches=Marble Cream, conversion=Warm Stone per specs)
- `--color-azul-noche` token exists but hasn't been used as a button color yet — conversion section introduces the `btn--azul-noche` variant

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 32-levels-approaches-conversion-sections_
_Context gathered: 2026-03-01_
