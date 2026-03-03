# Requirements: El Templo Landing Page (v3.0)

**Defined:** 2026-02-28
**Core Value:** A visitor lands on eltemplo.org and within 10 seconds understands that El Templo is not a gym — it's a school of movement. They can book a trial session, explore franchise opportunities, or discover the ecosystem.

**Spec Source:** 38 documents in `.docs/brand-landing/` (spec1–spec10, spec-franquicias, spec-gladius)
**Design Decisions:** See memory file `landing-design-decisions.md` for resolved conflicts and canonical :root

---

## Infrastructure (INFRA)

- [x] **INFRA-01**: Nuxt 3 app scaffolded in `el-templo-web/` with SSR/SSG rendering
- [x] **INFRA-02**: Monorepo integration (pnpm workspace, root scripts, shared tooling)
- [x] **INFRA-03**: CI pipeline: type check, lint, build for el-templo-web (extend existing ci.yml)
- [x] **INFRA-04**: Staging deploy pipeline: build → rsync to EC2 → Nginx config at staging.eltemplo.org
- [x] **INFRA-05**: Production deploy pipeline: build → backup → rsync → Nginx at eltemplo.org → smoke test → auto-rollback
- [x] **INFRA-06**: Sentry error monitoring (@sentry/nuxt or @sentry/vue, guarded by env var)
- [x] **INFRA-07**: Environment config (.env.example, VITE\_ prefix for client vars, runtime config for server)

## Design System (DS)

- [x] **DS-01**: CSS custom properties (:root) matching canonical token registry (colors, fonts, spacing, radius, shadows, transitions)
- [x] **DS-02**: Google Fonts loaded: Montserrat (300,600,700,800), Cormorant Garamond (400,500,600+italic), Geologica (400,500,600)
- [x] **DS-03**: BEM component classes (custom, NOT Quasar UI components)
- [x] **DS-04**: No pure black (#000000) or pure white (#FFFFFF) anywhere in CSS
- [x] **DS-05**: 3 responsive breakpoints: desktop (1200px+), tablet (768px–1199px), mobile (<768px)
- [x] **DS-06**: Shared layout components: page container (max-width, padding), section wrapper (vertical spacing)
- [x] **DS-07**: Reusable button components: Primary (Terracotta), Ghost (bordered), Secondary (Azul Noche, Aged Gold variants)
- [x] **DS-08**: Placeholder/skeleton system for pending assets (images, videos, icons) that renders gracefully

## Navigation (NAV)

- [x] **NAV-01**: Fixed nav bar (64px desktop, 56px mobile) with Marble Cream background
- [x] **NAV-02**: Desktop horizontal nav links with Terracotta hover (Gladius link uses Aged Gold hover)
- [x] **NAV-03**: Mobile hamburger menu with slide-in overlay
- [x] **NAV-04**: Smooth scroll to anchor sections (#metodo, #niveles, #enfoques, #sedes, #sesion-prueba)
- [x] **NAV-05**: Active section highlighting on scroll (optional IntersectionObserver)
- [x] **NAV-06**: Nav links include: El Método, Niveles, Sedes, Franquicias (/franquicias), Gladius (/gladius), Reservar Sesión

## Home Page — Hero (HERO)

- [x] **HERO-01**: Full viewport (100vh) video loop background with warm Deep Charcoal overlay gradient
- [x] **HERO-02**: Video fallback to poster image on load/error, lazy-load with immediate poster display
- [x] **HERO-03**: H1 title + subtitle in brand typography (Montserrat ExtraBold + Cormorant Garamond italic)
- [x] **HERO-04**: Primary CTA "COMENZÁ TU CAMINO" (Terracotta) scrolls to #sesion-prueba (Descubrí Tu Nivel section)
- [x] **HERO-05**: Secondary CTA "ABRÍ TU TEMPLO" (Gold bordered) navigates to /franquicias
- [x] **HERO-06**: Responsive: H1 48px→32px→26px, subtitle 22px→18px→16px across breakpoints
- [x] **HERO-07**: Optional parallax on video (50% scroll speed, disabled on mobile) and scroll indicator arrow

## Home Page — Qué es El Templo (IDEN)

- [x] **IDEN-01**: Split layout (55% text / 45% image) on desktop, stacked on mobile (image first via order: -1)
- [x] **IDEN-02**: Lazy-loaded image with responsive cropping (4:5 desktop, 16:9 mobile, max-height 280px mobile)
- [x] **IDEN-03**: Ghost CTA "CONOCÉ NUESTRA FILOSOFÍA" with hover state (Clay color, underline, arrow +4px)
- [x] **IDEN-04**: Optional scroll-reveal animation (fade-in + translateY(20px), 600ms, IntersectionObserver)
- [x] **IDEN-05**: Parametrized data: sedes count (8), student count (1000+)

## Home Page — Nuestro Método (MET)

- [x] **MET-01**: 4-subsection layout with alternating Warm Stone / Marble Cream backgrounds
- [x] **MET-02**: 4-block session structure cards (Initium, Nucleus, Deuteros, Athlos) — grid 4→2x2→stack
- [x] **MET-03**: 2 special session cards (ROM, SKILLS) with hover elevation
- [x] **MET-04**: Author section (Ignacio Bordón) with optional circular photo (gold border, 120px)
- [x] **MET-05**: CTA "PROBÁ EL MÉTODO" (Terracotta) scrolling to #sesion-prueba

## Home Page — Sistema de Niveles (NIV)

- [x] **NIV-01**: Interactive 6-tab system (Alfa, Delta, Sigma, Omega, Spartan, Olympic) with ARIA roles
- [x] **NIV-02**: Keyboard navigation: arrow keys change tabs, Enter/Space to activate
- [x] **NIV-03**: Tab content: split grid (50% text / 50% visual) on desktop, stacked on mobile (visual first)
- [x] **NIV-04**: Fade-in animation on tab change (300ms, translateY(8px))
- [x] **NIV-05**: Default active: Alfa tab on page load
- [x] **NIV-06**: Per-level CTA "¿ESTE SOS VOS? RESERVÁ TU SESIÓN" (ghost button)
- [x] **NIV-07**: Mobile: horizontal scroll tabs with snap alignment, hidden scrollbar

## Home Page — Los 5 Enfoques (ENF)

- [x] **ENF-01**: 5 cards (Kallós, Sthenos, Motus, Pyros, Dynamis) with equal heights (min-height 320px)
- [x] **ENF-02**: Responsive grid: 5-column → 3+2 centered → horizontal scroll with snap on mobile
- [x] **ENF-03**: Card hover: translateY(-3px), shadow intensifies (300ms)
- [x] **ENF-04**: Hidden scrollbar on mobile, optional gradient fade indicator
- [x] **ENF-05**: No CTAs in this section (informational only)

## Home Page — Descubrí Tu Nivel (DESC)

- [x] **DESC-01**: Dual-path conversion: 2 cards (Presencial + App) in 50/50 grid, stack on mobile (Presencial first)
- [x] **DESC-02**: Distinct button colors: Terracotta (Presencial) + Azul Noche (App) — only Azul Noche button usage on site
- [x] **DESC-03**: Presencial CTA links to #sesion-prueba or WhatsApp; App CTA links to /app or app stores
- [x] **DESC-04**: Section anchor `#descubri-nivel` — target of Hero CTA scroll
- [x] **DESC-05**: Card hover: translateY(-2px), shadow elevation (300ms)

## Home Page — Sedes (SED)

- [x] **SED-01**: 8 location cards grouped by city (7 Mar del Plata, 1 Barcelona) with real photos
- [x] **SED-02**: Per-card micro-CTAs: "Cómo llegar" (Google Maps, new tab) + "Reservar sesión" (WhatsApp)
- [x] **SED-03**: Special badges: "AL AIRE LIBRE" (Park), "INTERNACIONAL" (Barcelona)
- [x] **SED-04**: Desktop: 4-column grid (row 2 has 3 centered); Tablet: 3-col; Mobile: horizontal scroll with snap
- [x] **SED-05**: Fallback CTA for international/remote users: "Probá la app"

## Home Page — Comunidad + Aura Club (COM)

- [x] **COM-01**: Zone A — Photo gallery: 6-12 real photos in mosaic grid (mixed aspect ratios), horizontal scroll on mobile
- [x] **COM-02**: Zone A — 3 testimonial cards (quote + name + level + time), horizontal scroll on mobile
- [x] **COM-03**: Zone A — 4 community stats counters (1000+ alumnos, 8 sedes, 10000+ formados, 10+ años) with optional count-up animation
- [x] **COM-04**: Zone B — AURA CLUB section with event photo + ghost CTA "DESCUBRÍ AURA CLUB" (Aged Gold)
- [x] **COM-05**: Optional gallery lightbox on click

## Home Page — Ecosistema (ECO)

- [x] **ECO-01**: 4 pathway cards in 2x2 grid: Entrená (App), Formate (Academy), Invertí (Franquicias), Equipáte (Gladius)
- [x] **ECO-02**: Each card has colored left border accent (3px): Azul Noche, Terracotta, Aged Gold, Aged Gold
- [x] **ECO-03**: Cards link to respective landing pages (/app, /academy, /franquicias, /gladius)
- [x] **ECO-04**: Responsive: 2x2 → 2x2 → 1 column

## Home Page — FAQ (FAQ)

- [x] **FAQ-01**: Accordion with 9 Q&A pairs, first open by default, only 1 open at a time
- [x] **FAQ-02**: Smooth expand/collapse animation (max-height 400ms, opacity 300ms)
- [x] **FAQ-03**: Icon rotation (+ to −) on toggle, 300ms
- [x] **FAQ-04**: ARIA attributes: aria-expanded on trigger, role="region" on answer
- [x] **FAQ-05**: Centered layout (800px max-width)

## Home Page — Footer (FOOT)

- [x] **FOOT-01**: Pre-footer CTA zone: "TU CUERPO ES TU TEMPLO." + "COMENZÁ TU CAMINO" button on Deep Charcoal bg
- [x] **FOOT-02**: 4-column nav: Entrená, Ecosistema, Empresa, Legal (2x2 on tablet, 2-col on mobile)
- [x] **FOOT-03**: Contact zone: logo (Marble Cream SVG) + email + phone + social icons (Instagram, YouTube, TikTok)
- [x] **FOOT-04**: Legal zone: copyright © 2026, terms/privacy/cookies links
- [x] **FOOT-05**: Link hover states: Sandy Beige → Marble Cream (200ms)

## Standalone — /franquicias (FRAN)

- [x] **FRAN-01**: Full-viewport hero with image bg, "ABRÍ TU TEMPLO." H1, investment figure, "QUIERO APLICAR" CTA
- [x] **FRAN-02**: "¿Por Qué El Templo?" — 4 value prop cards (2x2): Método Propio, Marca Premium, Ecosistema Completo, Acompañamiento Real
- [x] **FRAN-03**: "Dos Caminos" — Franquicia Activa vs Pasiva comparison cards
- [x] **FRAN-04**: "Qué Incluye" — 6-item grid (3x2 → 2x3 → 1-col): método, formación, Gladius, marca, apertura, digital
- [x] **FRAN-05**: "De Mar del Plata al Mundo" — animated counters + styled expansion map with pins + sede list
- [x] **FRAN-06**: Founder section — Ignacio Bordón bio + timeline (horizontal desktop, vertical mobile): 2020→2026→próximo
- [x] **FRAN-07**: Application form: nombre, email, teléfono, ciudad/país, modelo (select), experiencia (select), capital (select), origen (select), mensaje
- [x] **FRAN-08**: Form submission → email notification + CRM/Mailchimp + GA4 event + Meta Pixel Lead
- [x] **FRAN-09**: Post-submit confirmation + WhatsApp link for immediate contact
- [x] **FRAN-10**: Floating WhatsApp button (always visible)
- [x] **FRAN-11**: Shares header/footer with main domain

## Standalone — /gladius (GLAD)

- [x] **GLAD-01**: Hero with product imagery on warm dark background, Gladius logo, "FORJADO PARA LOS QUE ENTRENAN EN SERIO." H1
- [x] **GLAD-02**: Product philosophy section — why Gladius exists, connection to El Templo, quality/durability
- [x] **GLAD-03**: Product catalog — cards with photo + name + description + price, category filter if multiple lines
- [x] **GLAD-04**: "En Acción" — real-use photos from sedes, social proof
- [x] **GLAD-05**: Contact/purchase section — WhatsApp CTA + simple form (nombre, email, producto de interés)
- [x] **GLAD-06**: Shares header/footer with main domain

## Blog (BLOG)

- [x] **BLOG-01**: Blog post data model in el-templo-api (DB table, CRUD API routes)
- [x] **BLOG-02**: Blog editor in el-templo-admin (create, edit, publish posts)
- [x] **BLOG-03**: Blog index page in el-templo-web with post cards (title, excerpt, date, reading time), fetched from API at build time
- [x] **BLOG-04**: Individual post page with brand typography and design system styling, pre-rendered at build time
- [x] **BLOG-05**: SEO: per-post meta tags, Open Graph, structured data (Article schema)
- [x] **BLOG-06**: Pagination or infinite scroll on blog index

## SEO & Performance (SEO)

- [x] **SEO-01**: SSR/SSG rendering for all pages (search engine indexable HTML)
- [x] **SEO-02**: Per-page meta tags (title, description, Open Graph, Twitter Card)
- [x] **SEO-03**: Structured data: Organization, LocalBusiness (per sede), Article (blog), FAQPage (home FAQ)
- [x] **SEO-04**: Auto-generated sitemap.xml
- [x] **SEO-05**: robots.txt with appropriate rules
- [x] **SEO-06**: Image optimization: lazy loading, WebP/AVIF format, srcset for responsive images
- [x] **SEO-07**: Core Web Vitals targets: LCP < 2.5s, FID < 100ms, CLS < 0.1
- [x] **SEO-08**: Target keywords: calistenia, entrenamiento peso corporal, gimnasio funcional [ciudad], wellness

## Analytics & Tracking (TRACK)

- [x] **TRACK-01**: GA4 integration with page view tracking
- [x] **TRACK-02**: GA4 custom events: CTA clicks, form submissions, scroll depth
- [x] **TRACK-03**: Meta Pixel integration with Lead event on franchise form submission
- [x] **TRACK-04**: Analytics guarded by cookie consent (GDPR-aware)

---

## Out of Scope

| Feature                                       | Reason                                                           |
| --------------------------------------------- | ---------------------------------------------------------------- |
| CMS / admin panel for landing content         | Content managed via code/config for now, CMS later if needed     |
| E-commerce checkout for Gladius               | v3.0 builds product showcase, not a full store                   |
| Member login on landing site                  | Public-only site, login redirects to app.eltemplo.org            |
| /filosofia, /academy, /app, /aura-club pages  | Specs not yet written, added as future phases when docs arrive   |
| Real asset production (photos, videos)        | Dev uses placeholders; user provides real assets separately      |
| Server-side form processing (CRM integration) | Depends on CRM choice; v3.0 can use email-only or mock endpoints |

## Traceability

| Requirement | Phase    | Status   |
| ----------- | -------- | -------- |
| INFRA-01    | Phase 29 | Complete |
| INFRA-02    | Phase 29 | Complete |
| INFRA-03    | Phase 29 | Complete |
| INFRA-04    | Phase 29 | Complete |
| INFRA-05    | Phase 29 | Complete |
| INFRA-06    | Phase 29 | Complete |
| INFRA-07    | Phase 29 | Complete |
| DS-01       | Phase 30 | Complete |
| DS-02       | Phase 30 | Complete |
| DS-03       | Phase 30 | Complete |
| DS-04       | Phase 30 | Complete |
| DS-05       | Phase 30 | Complete |
| DS-06       | Phase 30 | Complete |
| DS-07       | Phase 30 | Complete |
| DS-08       | Phase 30 | Complete |
| NAV-01      | Phase 30 | Complete |
| NAV-02      | Phase 30 | Complete |
| NAV-03      | Phase 30 | Complete |
| NAV-04      | Phase 30 | Complete |
| NAV-05      | Phase 30 | Complete |
| NAV-06      | Phase 30 | Complete |
| HERO-01     | Phase 31 | Complete |
| HERO-02     | Phase 31 | Complete |
| HERO-03     | Phase 31 | Complete |
| HERO-04     | Phase 31 | Complete |
| HERO-05     | Phase 31 | Complete |
| HERO-06     | Phase 31 | Complete |
| HERO-07     | Phase 31 | Complete |
| IDEN-01     | Phase 31 | Complete |
| IDEN-02     | Phase 31 | Complete |
| IDEN-03     | Phase 31 | Complete |
| IDEN-04     | Phase 31 | Complete |
| IDEN-05     | Phase 31 | Complete |
| MET-01      | Phase 31 | Complete |
| MET-02      | Phase 31 | Complete |
| MET-03      | Phase 31 | Complete |
| MET-04      | Phase 31 | Complete |
| MET-05      | Phase 31 | Complete |
| NIV-01      | Phase 32 | Complete |
| NIV-02      | Phase 32 | Complete |
| NIV-03      | Phase 32 | Complete |
| NIV-04      | Phase 32 | Complete |
| NIV-05      | Phase 32 | Complete |
| NIV-06      | Phase 32 | Complete |
| NIV-07      | Phase 32 | Complete |
| ENF-01      | Phase 32 | Complete |
| ENF-02      | Phase 32 | Complete |
| ENF-03      | Phase 32 | Complete |
| ENF-04      | Phase 32 | Complete |
| ENF-05      | Phase 32 | Complete |
| DESC-01     | Phase 32 | Complete |
| DESC-02     | Phase 32 | Complete |
| DESC-03     | Phase 32 | Complete |
| DESC-04     | Phase 32 | Complete |
| DESC-05     | Phase 32 | Complete |
| SED-01      | Phase 33 | Complete |
| SED-02      | Phase 33 | Complete |
| SED-03      | Phase 33 | Complete |
| SED-04      | Phase 33 | Complete |
| SED-05      | Phase 33 | Complete |
| COM-01      | Phase 33 | Complete |
| COM-02      | Phase 33 | Complete |
| COM-03      | Phase 33 | Complete |
| COM-04      | Phase 33 | Complete |
| COM-05      | Phase 33 | Complete |
| ECO-01      | Phase 33 | Complete |
| ECO-02      | Phase 33 | Complete |
| ECO-03      | Phase 33 | Complete |
| ECO-04      | Phase 33 | Complete |
| FAQ-01      | Phase 33 | Complete |
| FAQ-02      | Phase 33 | Complete |
| FAQ-03      | Phase 33 | Complete |
| FAQ-04      | Phase 33 | Complete |
| FAQ-05      | Phase 33 | Complete |
| FOOT-01     | Phase 30 | Complete |
| FOOT-02     | Phase 30 | Complete |
| FOOT-03     | Phase 30 | Complete |
| FOOT-04     | Phase 30 | Complete |
| FOOT-05     | Phase 30 | Complete |
| FRAN-01     | Phase 34 | Complete |
| FRAN-02     | Phase 34 | Complete |
| FRAN-03     | Phase 34 | Complete |
| FRAN-04     | Phase 34 | Complete |
| FRAN-05     | Phase 34 | Complete |
| FRAN-06     | Phase 34 | Complete |
| FRAN-07     | Phase 34 | Complete |
| FRAN-08     | Phase 34 | Complete |
| FRAN-09     | Phase 34 | Complete |
| FRAN-10     | Phase 34 | Complete |
| FRAN-11     | Phase 34 | Complete |
| GLAD-01     | Phase 35 | Complete |
| GLAD-02     | Phase 35 | Complete |
| GLAD-03     | Phase 35 | Complete |
| GLAD-04     | Phase 35 | Complete |
| GLAD-05     | Phase 35 | Complete |
| GLAD-06     | Phase 35 | Complete |
| BLOG-01     | Phase 35 | Complete |
| BLOG-02     | Phase 35 | Complete |
| BLOG-03     | Phase 35 | Complete |
| BLOG-04     | Phase 35 | Complete |
| BLOG-05     | Phase 35 | Complete |
| BLOG-06     | Phase 35 | Complete |
| SEO-01      | Phase 36 | Complete |
| SEO-02      | Phase 36 | Complete |
| SEO-03      | Phase 36 | Complete |
| SEO-04      | Phase 36 | Complete |
| SEO-05      | Phase 36 | Complete |
| SEO-06      | Phase 36 | Complete |
| SEO-07      | Phase 36 | Complete |
| SEO-08      | Phase 36 | Complete |
| TRACK-01    | Phase 36 | Complete |
| TRACK-02    | Phase 36 | Complete |
| TRACK-03    | Phase 36 | Complete |
| TRACK-04    | Phase 36 | Complete |

## Academy Landing Page (ACAD)

- [ ] **ACAD-01**: academy_inquiries DB table with 10 data fields + id/created_at/status
- [ ] **ACAD-02**: POST /api/academy/inquire endpoint with validation
- [ ] **ACAD-03**: Email notification via Resend on form submission
- [ ] **ACAD-04**: Basic admin list view for academy inquiries (read-only)
- [ ] **ACAD-05**: ACADEMY_NOTIFICATION_EMAIL env var with default
- [ ] **ACAD-06**: /academy page exists and renders with default layout
- [ ] **ACAD-07**: Hero section with H1, subtitle, CTA "QUIERO FORMARME", format data
- [ ] **ACAD-08**: QueEs section with 3 value proposition cards
- [ ] **ACAD-09**: Programa section with 7-module accordion (single-open)
- [ ] **ACAD-10**: Niveles section with 3 certification cards (Nivel 1 active, 2-3 proximamente)
- [ ] **ACAD-11**: SEO meta tags (title, description, OG, canonical)
- [ ] **ACAD-12**: 301 redirect /curso-entrenadores to /academy
- [ ] **ACAD-13**: /academy removed from prerender ignore list
- [ ] **ACAD-14**: Flywheel circular diagram with 4 nodes, arrows, center icon
- [ ] **ACAD-15**: FlywheelDiagram is a reusable props-driven component
- [ ] **ACAD-16**: Flywheel scroll-triggered reveal animation with 0.2s stagger
- [ ] **ACAD-17**: Modalidades section with Presencial/Online dual cards
- [ ] **ACAD-18**: QuienEnsena section with Ignacio bio, photo, animated stats
- [ ] **ACAD-19**: Inversion placeholder section with CTA + franchise note
- [ ] **ACAD-20**: Academy FAQ accordion with 8 questions (separate from home FAQ)
- [ ] **ACAD-21**: Enrollment form with 10 fields, API submission, confirmation + WhatsApp
- [ ] **ACAD-22**: Sticky side menu (desktop only, 240px, active section tracking)
- [ ] **ACAD-23**: Floating WhatsApp button
- [ ] **ACAD-24**: Academy link added to AppNav (7th link after Blog)
- [ ] **ACAD-25**: Academy link enabled in AppFooter Ecosistema column
- [ ] **ACAD-26**: FranIncludes trainer formation note with link to /academy
- [ ] **ACAD-27**: GA4 form_submit_academy event + Meta Pixel trackLead on form submit
- [ ] **ACAD-28**: Course structured data (JSON-LD)
- [ ] **ACAD-29**: /academy in sitemap.xml

## App Landing Page (APP)

- [x] **APP-01**: app_waitlist DB table (nombre, email, modulo_interes, ciudad_pais, status, created_at)
- [x] **APP-02**: labs_inquiries DB table (nombre, email, telefono, nombre_gimnasio, ciudad_pais, cantidad_socios, sistema_actual, mensaje, status, created_at)
- [x] **APP-03**: POST /api/app/waitlist endpoint with validation
- [x] **APP-04**: POST /api/app/labs-inquiry endpoint with validation
- [x] **APP-05**: Email notifications via Resend for both forms
- [x] **APP-06**: APP_NOTIFICATION_EMAIL env var with default
- [x] **APP-07**: Admin list view for app waitlist entries (read-only with export)
- [x] **APP-08**: Admin list view for Labs inquiries with status tracking (new/contacted/closed)
- [x] **APP-09**: Integration tests for both API endpoints
- [x] **APP-10**: /app page exists and renders with default layout
- [x] **APP-11**: Hero section with H1 "EL TEMPLO EN TU BOLSILLO.", subtitle, store badges, dual CTAs
- [x] **APP-12**: Ecosystem overview section with 4-module preview cards and progressive unlock flow
- [x] **APP-13**: Arete module detail section (freemium, active, Terracotta accent)
- [x] **APP-14**: El Templo module detail section (premium, active, Terracotta accent) with DESCARGA LA APP CTA
- [x] **APP-15**: Olympic Academy module detail section (proximamente, Aged Gold accent, opacity 0.6)
- [x] **APP-16**: Labs module detail section (proximamente, Azul Noche accent, dual CTA for franchisees/external gyms)
- [x] **APP-17**: Flywheel Digital vertical flow (Arete -> El Templo -> Academy -> Labs) on Deep Charcoal background
- [x] **APP-18**: Download section with store badges + phone mockup placeholder
- [ ] **APP-19**: Form A — module notification waitlist (4 fields: nombre, email, modulo multi-select, ciudad/pais)
- [ ] **APP-20**: Form B — Labs external gyms (8 fields: nombre, email, telefono, nombre gimnasio, ciudad/pais, cantidad socios, sistema actual, mensaje)
- [ ] **APP-21**: Floating WhatsApp button (AppWhatsApp.vue)
- [ ] **APP-22**: SectionConversion app CTA updated from app.eltemplo.org to /app
- [ ] **APP-23**: AppNav updated with App/Templo Online link
- [ ] **APP-24**: AppFooter Templo Online link enabled (disabled: false)
- [x] **APP-25**: /app removed from prerender ignore list in nuxt.config.ts
- [ ] **APP-26**: SEO meta tags (title, description, OG, canonical)
- [ ] **APP-27**: GA4 events: click_cta_app_download, form_submit_app_waitlist, form_submit_labs_inquiry + Meta Pixel trackLead on form B
- [x] **APP-28**: Module state flags data-driven (active/proximamente togglable without redesign)

## Traceability (continued)

| Requirement | Phase    | Status  |
| ----------- | -------- | ------- |
| ACAD-01     | Phase 43 | Planned |
| ACAD-02     | Phase 43 | Planned |
| ACAD-03     | Phase 43 | Planned |
| ACAD-04     | Phase 43 | Planned |
| ACAD-05     | Phase 43 | Planned |
| ACAD-06     | Phase 43 | Planned |
| ACAD-07     | Phase 43 | Planned |
| ACAD-08     | Phase 43 | Planned |
| ACAD-09     | Phase 43 | Planned |
| ACAD-10     | Phase 43 | Planned |
| ACAD-11     | Phase 43 | Planned |
| ACAD-12     | Phase 43 | Planned |
| ACAD-13     | Phase 43 | Planned |
| ACAD-14     | Phase 43 | Planned |
| ACAD-15     | Phase 43 | Planned |
| ACAD-16     | Phase 43 | Planned |
| ACAD-17     | Phase 43 | Planned |
| ACAD-18     | Phase 43 | Planned |
| ACAD-19     | Phase 43 | Planned |
| ACAD-20     | Phase 43 | Planned |
| ACAD-21     | Phase 43 | Planned |
| ACAD-22     | Phase 43 | Planned |
| ACAD-23     | Phase 43 | Planned |
| ACAD-24     | Phase 43 | Planned |
| ACAD-25     | Phase 43 | Planned |
| ACAD-26     | Phase 43 | Planned |
| ACAD-27     | Phase 43 | Planned |
| ACAD-28     | Phase 43 | Planned |
| ACAD-29     | Phase 43 | Planned |

| APP-01 | Phase 44 | Planned |
| APP-02 | Phase 44 | Planned |
| APP-03 | Phase 44 | Planned |
| APP-04 | Phase 44 | Planned |
| APP-05 | Phase 44 | Planned |
| APP-06 | Phase 44 | Planned |
| APP-07 | Phase 44 | Planned |
| APP-08 | Phase 44 | Planned |
| APP-09 | Phase 44 | Planned |
| APP-10 | Phase 44 | Planned |
| APP-11 | Phase 44 | Planned |
| APP-12 | Phase 44 | Planned |
| APP-13 | Phase 44 | Planned |
| APP-14 | Phase 44 | Planned |
| APP-15 | Phase 44 | Planned |
| APP-16 | Phase 44 | Planned |
| APP-17 | Phase 44 | Planned |
| APP-18 | Phase 44 | Planned |
| APP-19 | Phase 44 | Planned |
| APP-20 | Phase 44 | Planned |
| APP-21 | Phase 44 | Planned |
| APP-22 | Phase 44 | Planned |
| APP-23 | Phase 44 | Planned |
| APP-24 | Phase 44 | Planned |
| APP-25 | Phase 44 | Planned |
| APP-26 | Phase 44 | Planned |
| APP-27 | Phase 44 | Planned |
| APP-28 | Phase 44 | Planned |

**Coverage:**

- v3.0 requirements: 171 total across 21 categories (114 original + 29 ACAD + 28 APP)
- Mapped to phases: 171/171
- Unmapped: 0

---

_Requirements defined: 2026-02-28_
_Last updated: 2026-03-03 — APP requirements added for Phase 44 (28 requirements)_
