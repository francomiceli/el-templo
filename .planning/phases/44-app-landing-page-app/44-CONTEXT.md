# Phase 44: App Landing Page (/app) - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the /app standalone landing page for El Templo Online — the digital ecosystem with 4 progressive modules. The page presents the ecosystem, details each module, drives app downloads, and captures leads via two forms (module notification waitlist + Labs SaaS inquiry). Includes API backend for both forms, admin management for submissions, and cross-site integration updates.

</domain>

<decisions>
## Implementation Decisions

### Module sections layout

- Full-width sections with alternating backgrounds per the spec color scheme (Warm Linen, Marble Cream, Warm Stone, etc.)
- Each module gets its own section: title, subtitle, feature list, properties table, badge, CTA
- Consistent with home page section pattern (SectionHero, SectionIdentity, etc.)

### Active vs próximamente treatment

- Próximamente modules (Academy, Labs) rendered at opacity 0.6 + colored badge
- Badge colors: Terracotta "ACTIVO" for Aretē/El Templo, Aged Gold "PRÓXIMAMENTE" for Academy, Azul Noche "PRÓXIMAMENTE" for Labs
- Module states togglable via flag (data-driven) without redesign — when a module goes live, change the flag

### Per-module accent colors

- Each module section uses its identity color as accent throughout (badge, feature icons, CTA)
- Terracotta for Aretē and El Templo (active modules)
- Aged Gold for Olympic Academy
- Azul Noche for Labs
- Creates distinct visual identity per module while maintaining brand cohesion

### Module icons

- Inline SVG placeholders — simple stroke-based icons per module (consistent with ROM/SKILLS icon pattern from Phase 31)
- Replace with final assets later (Phase 41 or dedicated content pass)
- Keep the page looking complete even without final art

### Forms & API backend

- Same proven pattern as franchise form (Phase 34/38): DB tables + POST routes in el-templo-api + Resend email notification + integration tests
- Form A (module waitlist): 4 fields (nombre, email, módulo interesado multi-select, ciudad/país optional)
- Form B (Labs external gyms): 8 fields (nombre, email, teléfono, nombre gimnasio, ciudad/país, cantidad socios, sistema actual, mensaje)
- Both forms: inline validation, loading state, confirmation with WhatsApp link on success

### Admin management

- Both Form A (waitlist) and Form B (Labs inquiries) get admin pages in el-templo-admin
- Labs inquiries: status tracking (new/contacted/closed) — same pattern as franchise applications
- Waitlist entries: list view with export capability for bulk notifications when modules launch

### Flywheel digital

- Vertical top-to-bottom flow layout: Aretē → El Templo → Academy → Labs with arrows between stages
- NOT the circular FlywheelDiagram from /academy — different visual presentation for /app's progressive unlock narrative
- Deep Charcoal background per spec
- Connection text: "El mismo camino que vivís en nuestras sedes — ahora tiene su versión digital."

### Store links & download CTAs

- Dual badges (App Store + Google Play) always visible side by side — no platform detection
- Placeholder URLs for now (real store links added when app is published)
- CTA "DESCARGÁ LA APP" appears 3 times: hero, post-El Templo module section, dedicated download section
- Official store badge SVGs/PNGs (standard Apple/Google assets)

### Cross-site integration

- Update home SectionConversion app path to link to /app instead of app.eltemplo.org (better funnel: home → /app → store)
- /app accessible from: home S7 ecosystem card, nav menu, /academy, /franquicias, footer
- WhatsApp floating button (reuse pattern from FranWhatsApp with same wa.link)

### Claude's Discretion

- Exact section spacing and padding between module sections
- Phone mockup placeholder treatment in download section
- Scroll animation timing for flywheel vertical reveal
- Form field ordering within each form
- Ecosystem overview section visual treatment (the compact 4-module preview before detailed sections)

</decisions>

<specifics>
## Specific Ideas

- The page must communicate ONE platform with unlockable modules, NOT 4 separate apps — this is the critical brand message
- Labs has dual audience: franchisees ("Incluido en tu franquicia" → link to /franquicias) and external gyms ("QUIERO LABS PARA MI GIMNASIO" → Form B)
- Spec register proportions: 30% Ceremonial / 40% Narrativo / 30% Funcional voice
- "Sesión" never "clase" anywhere on the page
- No prices visible for any module
- GA4 + Meta Pixel events: descarga click, form A submit, form B submit

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `FranWhatsApp.vue`: Floating WhatsApp button — clone as `AppWhatsApp.vue` with same wa.link and app-specific analytics event
- `FranForm.vue`: Complete form pattern (reactive state, inline validation, $fetch API calls, loading/submitted states, confirmation with WhatsApp) — use as template for both forms
- `PlaceholderBox.vue`: For phone mockup and pending screenshot areas
- `useScrollReveal`: Scroll-triggered entrance animations
- `useCountUp`: Animated counter (if needed for any stats)
- `useAnalytics`: GA4 + Meta Pixel event tracking (trackEvent, trackLead)
- `useSectionTracking`: Section visibility tracking for analytics

### Established Patterns

- BEM CSS with token-only colors (no pure black #000000 or white #FFFFFF)
- Data files in `data/` directory (TypeScript) for all section content
- Full-width section components with alternating backgrounds
- Responsive breakpoints: desktop 1200+, tablet 768-1199, mobile <768
- Staggered entrance animations with inline transition-delay via :style
- Native select elements for mobile form UX (no custom dropdowns)
- $fetch for form submission API calls (not useFetch)

### Integration Points

- `pages/app.vue` — new page route
- `data/ecosystem.ts` — pathway card already links to /app (ctaHref: "/app")
- `components/SectionConversion.vue` — update app CTA href from app.eltemplo.org to /app
- `components/AppNav.vue` — ensure /app link is active (may already be in nav as coming-soon)
- `components/AppFooter.vue` — ensure /app link present
- `el-templo-api/src/db/` — new migration for app_waitlist and labs_inquiries tables
- `el-templo-admin/` — new sidebar items and routes for waitlist/labs admin pages

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 44-app-landing-page-app_
_Context gathered: 2026-03-03_
