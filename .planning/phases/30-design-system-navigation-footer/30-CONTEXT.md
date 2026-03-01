# Phase 30: Design System + Navigation + Footer - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

The complete visual foundation for el-templo-web: CSS custom property tokens, Google Fonts loading, responsive breakpoints, reusable layout/button components, fixed navigation bar with mobile drawer, and footer with pre-footer CTA. Every subsequent section phase composes content within this framework. No section content is built here — only the shell and design system.

</domain>

<decisions>
## Implementation Decisions

### Mobile navigation drawer

- Right-side drawer panel (slides in from the right)
- Cool, eye-catching animation — Claude has creative freedom here
- Semi-transparent Deep Charcoal backdrop overlay dims the page behind the drawer
- Drawer panel background: Deep Charcoal solid (dark, premium feel)
- Nav links in Marble Cream / Sandy Beige on the dark panel
- "Reservar Sesion" renders as a styled Primary Terracotta button at the bottom of the link list (not a plain link) — drives conversion from mobile nav
- Close behavior: X button (hamburger morphs to X) + tap outside the drawer closes it
- Contains same 6 links as desktop nav: El Metodo, Niveles, Sedes, Franquicias, Gladius, Reservar Sesion

### Placeholder/skeleton system

- Brand-warm static boxes: Deep Charcoal background with subtle Warm Stone border
- Text hint only — centered label like "Video pendiente" in Olive Stone. No icons.
- Hero section exception: renders with solid Deep Charcoal background + full overlay gradient + all text/CTAs. Looks intentional, not broken. No placeholder box treatment.
- Logo placeholder: styled text "El Templo" in Montserrat Bold (Deep Charcoal in nav, Marble Cream in footer). Functional and recognizable without the SVG.

### Nav-hero boundary

- Subtle warm bottom shadow on nav bar using Deep Charcoal rgba
- Shadow only appears after user starts scrolling (no shadow at page top, fades in on scroll)
- Clean initial look, nav feels "floating" once user scrolls

### Non-existent page links

- Anchor links (#metodo, #niveles, #sedes, #sesion-prueba) work as smooth scroll to home sections
- External pages that don't exist yet (/filosofia, /contacto, /academy, /aura-club, /terminos, /privacidad, /cookies): rendered as dimmed text in Olive Stone, no hover effect, no pointer cursor. Visually present but clearly inactive.
- Social media icons (Instagram, YouTube, TikTok): all disabled for now, same dimmed treatment as coming-soon links
- Email and phone in footer: also placeholder values per spec (info@eltemplo.com, +54 223 XXX XXXX)

### Claude's Discretion

- Drawer animation specifics (timing, easing, stagger effects) — make it eye-catching
- CSS architecture (global vs scoped, file organization for Nuxt 3)
- Component granularity (how to split nav, footer, buttons into Vue components)
- Active section highlighting implementation (NAV-05, IntersectionObserver approach)
- Exact placeholder box dimensions and border styling
- Font loading strategy (Google Fonts link vs self-hosted)

</decisions>

<specifics>
## Specific Ideas

- The specs (.docs/brand-landing/) are extremely detailed with exact CSS values, BEM class names, HTML structure, responsive breakpoints, and hover states. Follow them closely — they are the canonical design source.
- The canonical token registry is defined across the specs: colors (Marble Cream, Terracotta, Clay, Aged Gold, Deep Charcoal, Warm Stone, Sandy Beige, Olive Stone, Charcoal Mist, Azul Noche), fonts (--font-authority: Montserrat, --font-elegance: Cormorant Garamond, --font-clarity: Geologica), spacing, radius, transitions.
- BEM naming convention throughout (e.g., .hero**title, .footer**col-title, .btn--primary)
- NEVER use pure black (#000000) or pure white (#FFFFFF) — this is a hard brand rule across all CSS
- All shadows use Deep Charcoal rgba(61,55,50,x), never black rgba(0,0,0,x)
- "Sesion" always, never "clase" in any text content

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- None — el-templo-web is a bare Nuxt 3 scaffold (app.vue, one layout, one placeholder page)
- This phase creates all foundational assets from scratch

### Established Patterns

- Nuxt 3 with SSG preset (nitro static), TypeScript strict mode
- @nuxt/content and @nuxt/eslint already configured
- Sentry and structured logger set up in Phase 29 (plugins/utils)

### Integration Points

- `layouts/default.vue` — currently empty, will contain nav + footer wrapping `<slot />`
- `pages/index.vue` — currently placeholder, subsequent phases will replace with real sections
- `nuxt.config.ts` — may need Google Fonts config or global CSS imports
- No `assets/` or `components/` directories exist yet — need to be created

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 30-design-system-navigation-footer_
_Context gathered: 2026-03-01_
