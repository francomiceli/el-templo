# Phase 43: Academy Landing Page (/academy) - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the /academy standalone landing page for Olympic Academy — El Templo's trainer certification program. 10 sections, sticky side menu (desktop), flywheel reusable component, 3-tier certification cards, enrollment form with API backend + basic admin list view, and cross-site integration. All copy, typography, colors, and section specs are locked in spec11-pt1 through spec11-pt4.

</domain>

<decisions>
## Implementation Decisions

### Side Menu + Page Navigation

- Both AppNav (global) and side menu (page-specific) visible simultaneously on desktop
- Side menu is sticky, positioned below AppNav (top: ~80px), 240px wide, content shifts right
- Side menu items are clickable anchor links with smooth scroll to sections
- Active section highlighted with Terracotta 2px left border via IntersectionObserver
- All 10 sections appear in the menu: Hero, ¿Qué es?, Programa, Niveles, Flywheel, Modalidades, Quién Enseña, Inversión, FAQ, Formulario
- Geologica Medium 14px, Olive Stone color, active item Terracotta (per spec)
- Hidden below 1200px (desktop only). No alternative nav on tablet/mobile — user scrolls naturally
- Follows Coderhouse reference pattern (approved by Chad)

### Flywheel Diagram

- Hover tooltips on desktop: nodes show title + icon at rest, hover reveals full stage description
- Mobile: vertical flow with descriptions always visible inline (no tap interaction needed)
- Digital tools (App, Academy Online, Aretē, Comunidad) displayed as subtle row below the diagram — informational, not clickable
- Props-driven reusable component with defaults: accepts node titles, descriptions, colors, center icon, tools list. Academy values are defaults, /franquicias can override any prop later
- Node colors: Entrená = Terracotta, Formate = Aged Gold, Liderá = Deep Bronze, Invertí = Deep Charcoal
- Arrows: Warm Stone 60%, stroke 2px, curved between nodes
- Center: Logo El Templo or fire icon, 60x60px
- Deep Charcoal background section
- Scroll-triggered reveal animation: progressive node appearance with 0.2s stagger

### Navigation Integration

- AppNav: Add "Academy" as 7th link (after Blog), visible on desktop bar and mobile drawer
- No modifier — uses default Terracotta hover/active color (same as most nav links)
- Footer: Change Academy link from disabled: true to disabled: false (href already set to /academy)
- SectionEcosystem: Already wired — pathway card links to /academy. No changes needed
- /franquicias: Add note in FranIncludes section — "Formación de entrenadores incluida" with link to /academy. Contextual, not a separate callout

### Certification Level Cards

- 3 cards: Trainer (Nivel 1), Olympic Trainer (Nivel 2), Spartan Trainer (Nivel 3)
- Nivel 1: fully active — Marble Cream background, 1px Terracotta border, hover with elevation
- Niveles 2-3: "próximamente" state — opacity 0.6, Warm Stone border, no hover, no click
- Nivel 2 badge: Aged Gold, Nivel 3 badge: Deep Bronze
- Levels 2-3 activable via flag/variable without redesign
- Emphasis on "horas de práctica real" requirement for Levels 2-3 (differentiator)

### Form Backend + Data

- New `academy_inquiries` DB table (follows gladius_inquiries pattern)
- API endpoint: POST /api/academy/inquire
- 10 fields: nombre, email, telefono, ciudadPais, nivelInteres, modalidad, experiencia, alumnoElTemplo, origen, mensaje
- alumnoElTemplo field is strategically important — measures flywheel conversion (alumni → trainers)
- Separate ACADEMY_NOTIFICATION_EMAIL env var (defaulting to ignaciobordon@eltemplo.org)
- Email notification via Resend (same pattern as franchise/gladius)
- CRM/Mailchimp integration: deferred — just DB storage + email notification for now
- Analytics: GA4 form_submit_academy event + Meta Pixel trackLead on submission
- Post-submit state: confirmation message + "¿Querés hablar ahora?" WhatsApp link
- Basic admin list view in el-templo-admin for viewing academy inquiries (name, email, date, level interest). Read-only, no AI analysis

### Accordion (Programa Section)

- 7 curriculum modules in accordion component
- Single-module-open behavior (opening one closes others)
- Header: Geologica Semibold 16px, Deep Charcoal, 16px vertical padding
- Chevron icon rotates 90° on open (Olive Stone color)
- Body: Geologica Regular 15px
- Separator: 1px solid Warm Stone
- Animation: max-height + opacity 0.3s ease

### Inversión (Pricing) Section

- Placeholder state — no prices displayed
- Copy: "Consultá disponibilidad y valor del programa"
- CTA: "CONSULTAR DISPONIBILIDAD" → scroll to #formulario-academy
- Prepared for future price cards activable via flag
- Franchise note below: link to /franquicias for included training

### SEO + Redirects

- title: "Olympic Academy — Formación de Entrenadores | El Templo Calistenia"
- og:url: "https://eltemplo.org/academy"
- /curso-entrenadores → 301 redirect to /academy
- Remove /academy from nuxt.config.ts prerender ignore list

### Claude's Discretion

- Flywheel SVG implementation approach (pure SVG vs CSS grid with SVG arrows)
- Structured data schema type (Course vs EducationalOrganization)
- Exact accordion animation timing and easing
- Side menu entrance animation on page load
- How to handle the CTA "QUIERO FORMARME" appearing 3 times (shared component vs inline)
- Counter animation approach for Ignacio stats (reuse useCountUp from franquicias)
- WhatsApp floating button: reuse FranWhatsApp pattern or create AcademyWhatsApp
- Admin list view placement in sidebar and routing structure

</decisions>

<specifics>
## Specific Ideas

- Coderhouse side menu reference (approved by Chad) — sticky sidebar pattern on course pages
- Cande's original PDF designs (pages 36-40) as additional visual reference
- The flywheel is "the most strategically important section" — shows the visitor they're entering a path with infinite ceiling, not buying a course
- "If the landing feels like a generic course page, it failed. If it feels like the door to a professional path with infinite ceiling inside a real ecosystem, it worked."
- The "¿Sos alumno/a de El Templo?" form field is explicitly strategic data collection — not decorative

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `useSectionTracking` composable: Maps section DOM IDs to GA4 events via IntersectionObserver. Use for all 10 academy sections.
- `useActiveSection` composable: Tracks which section is in viewport. Use for side menu active state.
- `useScrollReveal` composable: Scroll-triggered entrance animations. Use for card/section reveals.
- `useCountUp` composable: Animated number counters with rAF, SSR-safe, reduced-motion guard. Use for Ignacio's stats.
- `useAnalytics` composable: GA4 gtag() + Meta Pixel fbq() wrapper. Use for form submission.
- `FranForm.vue`: Complete form pattern — reactive state, field validation, $fetch to API, submitting/submitted/error states, WhatsApp CTA on success. Clone and adapt.
- `FranWhatsApp.vue`: Floating WhatsApp button reference.
- `SectionFaq.vue`: FAQ accordion with CSS rotation chevron, hidden attribute + max-height animation. Reference for academy accordion.

### Established Patterns

- Pages compose section components: `<FranHero /> <FranValueProps /> ...`
- BEM naming with page prefix: `fran-*`, `glad-*` → `academy-*`
- Data centralized in `data/*.ts` with TypeScript interfaces
- Form submits via `$fetch` to `config.public.apiUrl` + endpoint
- Native select elements for dropdowns
- HTML entities for accented characters
- API: Fastify route + service + Drizzle table + migration + Resend email
- Admin: sidebar items + route guards via isAdminRole/isSuperadminRole

### Integration Points

- `AppNav.vue:14-26` — navLinks array. Add Academy entry.
- `AppFooter.vue:38` — Academy link `disabled: true`. Flip to false.
- `data/ecosystem.ts:32-40` — Academy card already links to /academy. No change.
- `nuxt.config.ts` — /academy in prerender ignore list. Remove.
- API routes registration — add academy module to Fastify
- Migration — next number after current latest

</code_context>

<deferred>
## Deferred Ideas

- CRM/Mailchimp integration for academy inquiries — add when CRM is actually configured
- Inserting the flywheel component into /franquicias — do when /franquicias is next touched
- Full admin management panel for academy (AI analysis, status tracking) — if inquiry volume justifies it

</deferred>

---

_Phase: 43-academy-landing-page-academy_
_Context gathered: 2026-03-03_
