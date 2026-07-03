# Roadmap: El Templo

## Milestones

- **v2.0 Admin App** - Phases 13-28 (in progress, phases 13-19 + 26-27 complete)
- **v3.0 Landing Page** - Phases 29-36 (planned)
- **v4.0 Ecosystem Foundation** - Phases 45-52 (planned)
- **v4.1 Admin Consolidation & Data Migration** - Phases 58-66 (planned)
- **v4.2 Clases Personalizadas Launch** - Phases 67-73 (complete)
- **v4.3 Android Play Store Launch** - Phases 74-77 (planned)
- **v4.4 App Engagement & Intelligent Companion** - Phases 78-88 (planned)
- **v4.5 Planes Online — Digital Monetization** - Phases 89-91 (planned)
- **v4.6 iOS App Store Launch** - Phases 93-95 (planned)
- **v4.7 Full Body & ROM — Coach Session Requests** - Phases 96-97 (planned)
- **v4.8 Modelo Financiero** - Phases 105-109 (complete)
- **v4.85 Enrollment Service + Admin Add-ons** - Phases 112-114 (complete/in progress)
- **v5.0 Métricas de Gestión** - Phases 120-123 (planned)
- **v5.1 Nuevo Sistema de Entrenamiento** - Phases 124-131 (planned)
- **v5.2 UI de Métricas + Calidad del Árbol + Segmentación (admin)** - Phases 132-136 (complete)
- **v5.2 Módulo Contable / Libro de Caja** - Phases 137-142 (planned)
- **Profesor por clase + Puntuación post clase** - Phase 143 (planned, standalone app/admin)
- **Notificaciones y bloqueo de vencimiento** - Phase 144 (planned, standalone app/api)
- **v5.3 Mejoras Caja / Módulo Contable (feedback v5.2)** - Phases 145-147 (planned)
- **Phase 148 PoS profe: alta de alumno + plan en el cobro** - Phase 148 (planned, standalone)
- **v5.4 Reforma del Admin — Correcciones white-label (pre-tenants)** - Phases 149-156 (planned)

---

<details>
<summary>v2.0 Admin App (Phases 13-28)</summary>

## v2.0 Overview

This roadmap delivers the Admin App module for El Templo. The milestone covers:

1. **Session Generation** (Phase 13) - Algorithm review and improvement based on coach examples
2. **Session Management** (Phases 14-16) - Admin UI for reviewing, editing, creating sessions + PDF generation
3. **Mobility Exercises** (Phase 17) - Per-block mobility exercise integration across full stack
4. **Domain Deployment** (Phase 18) - eltemplo.org subdomains, SSL, Nginx, deploy pipeline
5. **Technical Debt** (Phase 19) - Audit and repair accumulated tech debt
6. **Personalized Sessions** (Phase 20) - Per-member journey selection based on body zones
7. **APK Handling** (Phase 21) - Android keystore, signing, Play Store submission
8. **Branch Attendance** (Phases 22-24) - Member plans, booking system, and capacity management

## v2.0 Phases

**Phase Numbering:**

- Continues from v1.0 (ended at Phase 12)
- Phase 13+ is v2.0 Admin App work

- [x] **Phase 13: Session Generation Review & Improvement** - Analyze examples, fix difficulty system, validate algorithm
- [x] **Phase 14: Admin Session Review UI** - List pending sessions, approve/reject workflow, session details view
- [x] **Phase 15: Admin Session Editing** - Modify exercises, reps, formats in pending sessions
- [x] **Phase 16: PDF Generation, Format Config & App Exercise Tracking** - PDF session sheets, format parameter config, per-exercise completion
- [x] **Phase 17: Per-Block Mobility Exercises** - Route-based mobility exercise across pipeline, DB, admin, member app, PDF
- [x] **Phase 18: Domain/Subdomain Deployment** - eltemplo.org subdomains, SSL, Nginx, CORS, deploy pipeline for admin app
- [x] **Phase 19: Technical Debt Audit** - Audit and repair accumulated tech debt across codebase
- [ ] **Phase 20: Per-Member Personalized Sessions** - Journey selection based on body zones, personalized session generation
- [ ] **Phase 21: APK Handling** - Android keystore creation, signed release build, Play Store submission
- [ ] **Phase 22: Branch Attendance Data Model** - Spots, schedules, member plans (awaiting docs)
- [ ] **Phase 23: Admin Member Attendance Management** - Manage bookings, capacity, member plans
- [ ] **Phase 24: Member Booking UI** - Members view availability and reserve training spots

## v2.0 Phase Details

### Phase 13: Session Generation Review & Improvement

**Goal**: Algorithm produces accurate, SPOM-compliant sessions matching coach-built examples
**Depends on**: v1.0 complete (Phase 12)
**Status**: Complete
**Success Criteria** (what must be TRUE):

1. Dificultad Lineal column added to Ejercicios.csv with correct mappings
2. Database exercises table updated with linear difficulty values
3. Each block (Initium, Nucleus, Deuteros 1/2, Athlos/Epikos) has documented specifications
4. Exercise count capped at 3 for all blocks except Initium
5. Algorithm uses linear difficulty scale with "nivel superior" mapping to next level
6. Block difficulty average validated within +/-0.5 of target
7. Contraction distribution matches Contraccion rules exactly
8. Algorithm generates valid sessions that follow patterns observed in 19 example weeks

Plans:

- [x] 13-01-PLAN.md — Difficulty System Foundation
- [x] 13-02-PLAN.md — Block Specifications Documentation
- [x] 13-03-PLAN.md — Validation Suite
- [x] 13-04-PLAN.md — Initium Contextual Enhancement
- [x] 13-05-PLAN.md — Algorithm Integration & Final Validation
- [x] 13-06-PLAN.md — HIGH Priority Format Prescribers
- [x] 13-07-PLAN.md — MEDIUM Priority Format Prescribers
- [x] 13-08-SUMMARY.md — Cross-Route Exercise Selection via SPOM pattern_2

---

### Phase 14: Admin Session Review UI

**Goal**: Coaches can view algorithm-generated sessions and approve them for member visibility
**Depends on**: Phase 13 (algorithm produces valid sessions)
**Status**: Complete
**Plans:** 8 plans
**Success Criteria** (what must be TRUE):

1. Admin dashboard shows list of pending sessions (by week/day)
2. Sessions have status: pending_review → approved (approve/revert workflow)
3. Coach can view full session details (blocks, exercises, formats, prescriptions)
4. Coach can approve session (moves to approved, visible to members)
5. Coach can swap blocks from approved session pool (deduplicated by fingerprint)
6. Members only see approved sessions in their Weekly View
7. Pending count badge and low-sessions alert in admin UI

Plans:

- [x] 14-01-PLAN.md — Database schema extension (status, approval columns, timezone)
- [x] 14-02-PLAN.md — Admin Quasar app scaffold with authentication
- [x] 14-03-PLAN.md — Admin API endpoints (list, approve, revert, bulk)
- [x] 14-04-PLAN.md — Sessions list page with filters and day tabs
- [x] 14-05-PLAN.md — Session detail page with block cards
- [x] 14-06-PLAN.md — Generation page and regeneration with permanent deletion
- [x] 14-07-PLAN.md — Member visibility filter and pending badge
- [x] 14-08-PLAN.md — Human verification of complete workflow

---

### Phase 15: Admin Session Editing

**Goal**: Coaches can modify pending and approved sessions - swap exercises, adjust prescriptions, change formats, add/remove exercises
**Depends on**: Phase 14 (review UI exists)
**Status**: Complete
**Plans:** 9 plans
**Success Criteria** (what must be TRUE):

1. Coach can swap exercises within a block (from exercise database)
2. Coach can modify prescription (reps, sets, rest times)
3. Coach can change block format
4. Coach can add/remove exercises from a block
5. Edit history tracked (who changed what, when)
6. Validation prevents invalid sessions (e.g., wrong contraction mix)
7. Preview shows how session will appear to members

Plans:

- [x] 15-01-PLAN.md — Database schema: edit logs, snapshots, format params
- [x] 15-02-PLAN.md — PrescribeService and AdminEditService business logic
- [x] 15-03-PLAN.md — Editing API routes and schemas
- [x] 15-04-PLAN.md — Frontend types and useEditApi composable
- [x] 15-05-PLAN.md — Session edit page with editable block cards and exercise rows
- [x] 15-06-PLAN.md — Exercise swap dialog with filtering
- [x] 15-07-PLAN.md — Budget bar, validation badges, format dropdown, wiring
- [x] 15-08-PLAN.md — Member preview dialog
- [x] 15-09-PLAN.md — Human verification of complete editing workflow

---

### Phase 16: PDF Generation, Format Config & App Exercise Tracking

**Goal**: Generate PDF session sheets for approved sessions matching a provided design template; configure format-specific parameters (rounds, minutes, etc.) for high/medium importance formats during session generation/editing; improve exercise swap UX; implement per-exercise completion tracking in the member app
**Depends on**: Phase 15 (editing infrastructure exists)
**Plans:** 10 plans
**Success Criteria** (what must be TRUE):

1. Button on approved sessions generates a PDF file matching the provided example design
2. Pipeline: example PDF → page images → HTML/CSS skeleton → dynamic session data → final PDF
3. Generated PDF respects the original design while containing session-specific data
4. High and medium importance formats have configurable parameters discussed and set (e.g., rounds for Complex, minutes for AMRAP, intervals for EMOM, etc.)
5. Format parameters are settable during session generation and editing
6. Exercise swap dialog uses category instead of pattern for fewer, cleaner pill selections
7. Member app tracks completion per exercise (not per block)
8. All exercises completed in a block = block complete, auto-advance to next block
9. Exercise completion state reflected consistently across all app views (DayPlayer, Weekly View, etc.)
10. Coach can save an approved session block with a custom name for reuse via "intercambiar bloque" (full block data shown alongside custom name)
11. Inline prescription edits (reps, rest, notes) update without page reload or scroll reset — feedback via green success toast only

Plans:

- [x] 16-01-PLAN.md — FormatParams type system and generation pipeline integration
- [x] 16-02-PLAN.md — Format params editing UI and API endpoint
- [x] 16-03-PLAN.md — Exercise swap UX: category-based filtering
- [x] 16-04-PLAN.md — Inline prescription edit fix (no reload/scroll reset)
- [x] 16-05-PLAN.md — Per-exercise completion: store and composable layer
- [x] 16-06-PLAN.md — Per-exercise completion: UI, API, and cross-view consistency
- [x] 16-07-PLAN.md — Saved blocks for coach reuse
- [x] 16-08-PLAN.md — Client-side PDF generation with pdfmake
- [x] 16-09-PLAN.md — PDF download buttons on sessions page
- [x] 16-10-PLAN.md — End-to-end human verification

---

### Phase 17: Per-Block Mobility Exercises

**Goal**: Add 1 route-based mobility exercise per non-INITIUM block across the full stack — session generation pipeline, DB schema, API response, admin editing UI, member app display, and PDF output
**Depends on**: Phase 16 (session editing and exercise tracking infrastructure)
**Success Criteria** (what must be TRUE):

1. Pipeline selects 1 mobility exercise per non-INITIUM block based on block route via ROUTE_TO_MOBILITY_ROUTES
2. Mobility exercises stored with `exercise_type = 'mobility'` discriminator in session_prescriptions
3. Mobility exercises generated with sensible defaults (reps/seconds) that coaches can edit
4. Admin block cards show mobility exercise in separate "Descanso Activo" section at block end
5. Admin exercise swap dialog shows relevant mobility exercises filtered by block route
6. Coaches can swap mobility exercises (exactly 1 per non-INITIUM block, not removable)
7. Member app DayPlayer shows mobility as separate section at end of block with distinct styling
8. Mobility exercise completion is optional — does not block auto-advance or block completion
9. PDF output populates existing `mobility` field and renders it separately from main exercises
10. All 4 non-INITIUM blocks (NUCLEUS, DEUTEROS_1, DEUTEROS_2, ATHLOS/EPIKOS) get mobility exercises

Plans:

- [x] 17-01-PLAN.md — DB migration + mobility selection pipeline + types
- [x] 17-02-PLAN.md — API response separation + admin mobility endpoints
- [x] 17-03-PLAN.md — Admin UI: Descanso Activo section + swap dialog mobility mode
- [x] 17-04-PLAN.md — Member app display + PDF data population

---

### Phase 18: Domain/Subdomain Deployment

**Goal**: Configure eltemplo.org subdomains (app/admin/api) on EC2 with SSL, fix domain mismatch in codebase, extend deploy pipeline for admin app, update CORS and environment config
**Depends on**: Phase 17 (mobility exercises complete)
**Plans:** 3 plans

Plans:

- [x] 18-01-PLAN.md — Domain mismatch fix (.com->.org), CORS/env config, secrets docs
- [x] 18-02-PLAN.md — Nginx subdomain configs, deploy pipeline admin app build
- [x] 18-03-PLAN.md — Deployment guide update, manual DNS/SSL/secrets setup checkpoint

---

### Phase 19: Technical Debt Audit

**Goal**: Production-robust 3-app ecosystem with zero CVEs, error monitoring, test coverage, CI quality gates, deploy rollback, refactored god objects, structured logging, and automated database backups
**Depends on**: Phase 18 (deployment complete)
**Status**: Complete
**Plans:** 9 plans

Plans:

- [x] 19-01-PLAN.md — Security fixes (CVEs) + .env cleanup + .env.example templates
- [x] 19-02-PLAN.md — Sentry API error monitoring + frontend logger wrappers
- [x] 19-03-PLAN.md — Test infrastructure (Vitest + MySQL) + API integration tests
- [x] 19-04-PLAN.md — CI quality gates (lint/test/audit) + deploy safety (backup/rollback)
- [x] 19-05-PLAN.md — Pre-commit hooks (Husky + lint-staged) + root README
- [x] 19-06-PLAN.md — Refactor DayPlayer.vue god object (900 -> <350 LOC)
- [x] 19-07-PLAN.md — Refactor edit-service.ts god object (1232 -> <350 LOC) + eliminate any types
- [x] 19-08-PLAN.md — Replace console.log with structured logger across all apps
- [x] 19-09-PLAN.md — Database backups + production runbook + external service setup

---

### Phase 20: Per-Member Personalized Sessions

**Goal**: Members can select "journeys" based on body zones they want to work, and the session generation algorithm personalizes their sessions accordingly
**Depends on**: Phase 19 (tech debt complete, stable platform)
**Status**: Not Started
**Plans:** 7/8 plans executed

Plans:

- [ ] 20-01-PLAN.md — DB schema (member_journeys table, session/completion columns) + journey types and constants
- [ ] 20-02-PLAN.md — Journey pipeline (modified SPOM for zone-biased sessions) + JourneyService
- [ ] 20-03-PLAN.md — Journey API routes (member + admin endpoints) + integration tests
- [ ] 20-04-PLAN.md — Member app journey module (selection screen, overview, duration picker)
- [ ] 20-05-PLAN.md — Member app journey session player (duration filtering, completion)
- [ ] 20-06-PLAN.md — Member app navigation + Mi Camino journey integration
- [ ] 20-07-PLAN.md — Admin generation tab + Personalizadas sessions tab
- [ ] 20-08-PLAN.md — Admin Alumnos page + end-to-end verification

---

### Phase 21: APK Handling

**Goal**: Create Android signing keystore, build signed release APK/AAB with production HTTPS URLs, submit to Google Play Store
**Depends on**: Phase 18 (production HTTPS URLs required for APK)

Plans:

- [ ] TBD (run /gsd:plan-phase 21 to break down)

---

### Phase 22: Branch Attendance Data Model

**Goal**: Data structures for managing branch capacity, schedules, and member plans
**Depends on**: Documentation (awaiting from user)
**Success Criteria** (what must be TRUE):

1. Branch has capacity (max members per time slot)
2. Schedule defines available time slots per branch per day
3. Member plans define attendance allowance (days/week, specific days, etc.)
4. Booking records member reservations for specific slots
5. Database schema supports multi-branch with different capacities/schedules

---

### Phase 23: Admin Member Attendance Management

**Goal**: Admins/coaches can manage member plans and view attendance
**Depends on**: Phase 22 (data model exists)
**Success Criteria** (what must be TRUE):

1. Admin can view branch schedule with current bookings
2. Admin can see capacity utilization per slot
3. Admin can assign/modify member plans
4. Admin can manually add/remove bookings for members
5. Admin can view member attendance history
6. Waitlist management if slot is full

---

### Phase 24: Member Booking UI

**Goal**: Members can view availability and reserve training spots
**Depends on**: Phase 23 (admin management exists)
**Success Criteria** (what must be TRUE):

1. Member sees weekly schedule with available slots
2. Member can book available slot within their plan allowance
3. Member can cancel booking (with cancellation policy)
4. Member sees their upcoming bookings
5. Member sees their plan details (remaining days, restrictions)
6. Push notification for booking confirmation/reminder

---

### Phase 27: Member App Staging Environment

**Goal:** Full staging environment for all 3 apps on EC2 with separate database, CI/CD pipeline, staging subdomains, and mobile build workflows (Android APK + iOS TestFlight)
**Depends on:** Phase 26
**Status**: Complete
**Plans:** 5 plans

Plans:

- [x] 27-01-PLAN.md — Staging seed script, Nginx configs, weekly reset script
- [x] 27-02-PLAN.md — Staging deploy workflow (deploy-staging.yml) + CI branch triggers
- [x] 27-03-PLAN.md — Android staging APK build workflow + Capacitor/Gradle staging config
- [x] 27-04-PLAN.md — iOS staging TestFlight build workflow
- [x] 27-05-PLAN.md — Server/DNS setup checkpoint + end-to-end verification

---

### Phase 28: R2 Video Upload Infrastructure

**Goal:** Cloudflare R2 bucket setup, upload mechanism, CDN URL pattern, and exercise video_url population so the existing frontend video player (Phase 26) has actual videos to display
**Depends on:** Phase 26 (App Video Integration — frontend player and API wiring already complete)
**Status**: Not Started
**Plans:** 2/3 plans executed
**Success Criteria** (what must be TRUE):

1. Cloudflare R2 bucket created and configured for public read access
2. Upload mechanism exists (API endpoint or admin UI) for uploading exercise videos to R2
3. CDN/public URL pattern defined and documented for serving videos
4. exercises.video_url populated for uploaded exercises
5. Videos play correctly in the member app DayPlayer via existing VideoPlaceholder component
6. Admin app shows which exercises have videos (existing green badge already wired)

Plans:

- [ ] 28-01-PLAN.md — R2 plugin + video/exercise services + API routes + assembleVideoUrl
- [ ] 28-02-PLAN.md — Admin Exercises page + single upload + search/filters
- [ ] 28-03-PLAN.md — Bulk upload dialog + end-to-end verification

---

</details>

---

## v3.0 Landing Page (el-templo-web)

**Milestone Goal:** Build a premium, SEO-optimized public website at eltemplo.org that communicates brand identity, drives trial session conversions, supports franchise acquisition, and establishes web presence for sub-brands (Gladius, Academy, Aura Club).

**App:** `el-templo-web/` — Nuxt 3 SSR/SSG, custom BEM CSS, deployed to EC2 with Nginx reverse proxy.

**Scope:** 113 requirements across 19 categories (INFRA, DS, NAV, HERO, IDEN, MET, NIV, ENF, DESC, SED, COM, ECO, FAQ, FOOT, FRAN, GLAD, BLOG, SEO, TRACK).

## v3.0 Phases

- [x] **Phase 29: Nuxt Scaffold + Infrastructure** - Nuxt 3 app, monorepo integration, CI/CD, staging/production deploy, Sentry (completed 2026-03-01)
- [x] **Phase 30: Design System + Navigation + Footer** - CSS tokens, typography, responsive framework, nav bar, footer, shared layout (completed 2026-03-01)
- [x] **Phase 31: Hero + Identity + Method Sections** - Above-the-fold hero, brand story, method explanation with session structure (completed 2026-03-01)
- [x] **Phase 32: Levels + Approaches + Conversion Sections** - Interactive level tabs, 5 training approaches, dual-path conversion (completed 2026-03-01)
- [x] **Phase 33: Locations + Community + Ecosystem + FAQ** - Sede cards, community gallery, ecosystem pathways, FAQ accordion (completed 2026-03-01)
- [x] **Phase 34: Franquicias Page** - Full franchise landing with hero, value props, comparison, form, WhatsApp integration (completed 2026-03-01)
- [x] **Phase 35: Gladius + Blog** - Equipment showcase page, Nuxt Content blog with markdown posts (completed 2026-03-01)
- [x] **Phase 36: SEO + Analytics** - Structured data, sitemap, meta tags, Core Web Vitals, GA4, Meta Pixel, cookie consent (completed 2026-03-01)
- [x] **Phase 37: SEO Audit Fixes** - Fix issues from seoptimer audit: SSR rendering, title tag, favicon, HTTP/2, social links, email privacy, compression (completed 2026-03-02)
- [x] **Phase 38: Franchise Application Management** - Admin panel for managing franchise applications with AI-powered conversion strategies (completed 2026-03-02)
- [x] **Phase 39: App & PDF Brand Alignment** - Unify el-templo-app and admin PDF with el-templo-web design system: shared tokens, Montserrat/Geologica/Cormorant typography, terracotta/gold/cream palette, component restyling
- [x] **Phase 40: Day Player Redesign** - Instagram Stories-style exercise progression, between-block screens with philosophical quotes, brand-aligned player UI (completed 2026-03-02)
- [ ] **Phase 41: Content & Media Handoff** - Replace placeholder media with real assets, configure Meta Pixel ID from ads team, final content review

## v3.0 Phase Details

### Phase 29: Nuxt Scaffold + Infrastructure

**Goal**: A deployable Nuxt 3 app exists in the monorepo with full CI/CD parity — staging and production pipelines, Sentry monitoring, environment config — so that all subsequent phases build on a stable, deployable foundation
**Depends on**: Nothing (v3.0 start)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07
**Success Criteria** (what must be TRUE):

1. `el-templo-web/` exists as a Nuxt 3 app in the monorepo with pnpm workspace integration
2. Running `pnpm dev` in el-templo-web starts a local dev server that renders a placeholder page
3. CI pipeline runs type check, lint, and build for el-templo-web on every push
4. Pushing to staging branch deploys el-templo-web to staging.eltemplo.org via rsync + Nginx
5. Production deploy pipeline builds, backs up current, deploys to eltemplo.org, runs smoke test, and auto-rolls back on failure
6. Sentry captures and reports runtime errors from the Nuxt app (guarded by env var)
7. `.env.example` documents all required environment variables for el-templo-web

Plans:

- [x] 29-01-PLAN.md -- Nuxt 3 scaffold, monorepo integration, Sentry, logger
- [x] 29-02-PLAN.md -- CI/CD pipelines, Nginx configs for SSG serving
- [x] 29-03-PLAN.md -- DNS, SSL, server setup, GitHub secrets (human-action checkpoint)

---

### Phase 30: Design System + Navigation + Footer

**Goal**: The complete visual foundation is in place — CSS tokens, typography, responsive breakpoints, reusable components, fixed navigation, and footer — so that every subsequent section phase just composes content within this framework
**Depends on**: Phase 29 (deployable Nuxt app)
**Requirements**: DS-01, DS-02, DS-03, DS-04, DS-05, DS-06, DS-07, DS-08, NAV-01, NAV-02, NAV-03, NAV-04, NAV-05, NAV-06, FOOT-01, FOOT-02, FOOT-03, FOOT-04, FOOT-05
**Success Criteria** (what must be TRUE):

1. All CSS custom properties from the canonical token registry are defined in :root and used consistently (no hardcoded colors, no pure black/white anywhere)
2. Montserrat, Cormorant Garamond, and Geologica load correctly at specified weights across all pages
3. The site renders correctly at desktop (1200px+), tablet (757-1199px), and mobile (<768px) breakpoints
4. A fixed nav bar stays visible on scroll with working section links, smooth scroll to anchors, and a functional mobile hamburger menu
5. The footer displays navigation columns, contact info, social links, legal links, and a pre-footer CTA zone on every page
6. Placeholder/skeleton components render gracefully where real images/videos are pending
7. Primary, Ghost, and Secondary button variants exist as reusable BEM components with correct hover states

Plans:

- [x] 30-01-PLAN.md -- Design system foundation (CSS tokens, fonts, buttons, layout utilities, PlaceholderBox)
- [x] 30-02-PLAN.md -- Navigation bar (desktop links, mobile drawer, scroll shadow, active section)
- [x] 30-03-PLAN.md -- Footer (AppPrefooter CTA, AppFooter with nav/contact/social/legal)
- [x] 30-04-PLAN.md -- Layout integration (wire components into default layout, anchor stubs, visual verification)

---

### Phase 31: Hero + Identity + Method Sections

**Goal**: A visitor landing on eltemplo.org sees a cinematic full-viewport hero, immediately understands El Templo's identity, and can explore the training methodology — the "above the fold" experience that hooks attention
**Depends on**: Phase 30 (design system and layout ready)
**Requirements**: HERO-01, HERO-02, HERO-03, HERO-04, HERO-05, HERO-06, HERO-07, IDEN-01, IDEN-02, IDEN-03, IDEN-04, IDEN-05, MET-01, MET-02, MET-03, MET-04, MET-05
**Success Criteria** (what must be TRUE):

1. The hero fills the viewport with a video loop (or poster fallback), Deep Charcoal overlay, H1 title in Montserrat ExtraBold, and subtitle in Cormorant Garamond italic
2. "COMENZA TU CAMINO" CTA scrolls smoothly to the Descubri Tu Nivel section; "ABRI TU TEMPLO" navigates to /franquicias
3. The identity section displays a split text/image layout on desktop and stacks mobile-first with a ghost CTA
4. The method section shows 4 session structure cards (Initium, Nucleus, Deuteros, Athlos), 2 special session cards (ROM, SKILLS), and an author section
5. All text scales correctly across the 3 breakpoints (H1 48px to 26px, subtitle 22px to 16px)
   **Plans:** 2 plans

Plans:

- [ ] 31-01-PLAN.md -- SectionHero (video + overlay + CTAs) + SectionIdentity (split layout)
- [ ] 31-02-PLAN.md -- SectionMethod (session cards + special sessions + author)

---

### Phase 32: Levels + Approaches + Conversion Sections

**Goal**: Visitors can explore all 6 training levels through interactive tabs, understand the 5 training approaches, and reach the conversion section with clear paths to book a trial session or download the app
**Depends on**: Phase 30 (design system and layout ready)
**Requirements**: NIV-01, NIV-02, NIV-03, NIV-04, NIV-05, NIV-06, NIV-07, ENF-01, ENF-02, ENF-03, ENF-04, ENF-05, DESC-01, DESC-02, DESC-03, DESC-04, DESC-05
**Success Criteria** (what must be TRUE):

1. 6 level tabs (Alfa through Olympic) are keyboard-navigable with ARIA roles, Alfa active by default, and content fades in on tab change
2. On mobile, level tabs scroll horizontally with snap alignment and hidden scrollbar
3. Each level tab shows split content (text + visual) with a per-level ghost CTA to book a trial session
4. 5 approach cards (Kallos, Sthenos, Motus, Pyros, Dynamis) display in a responsive grid (5-col to 3+2 to horizontal scroll) with hover elevation
5. The conversion section presents two distinct cards (Presencial with Terracotta CTA, App with Azul Noche CTA) that link to the trial booking and app download respectively
   **Plans:** 2 plans

Plans:

- [ ] 32-01-PLAN.md -- SectionLevels (6 tabs) + SectionApproaches (5 cards)
- [ ] 32-02-PLAN.md -- SectionConversion (2 CTA cards)

---

### Phase 33: Locations + Community + Ecosystem + FAQ

**Goal**: Visitors can find their nearest sede, see the community in action through photos and testimonials, discover the broader El Templo ecosystem, and get answers to common questions — completing the full home page
**Depends on**: Phase 30 (design system and layout ready)
**Requirements**: SED-01, SED-02, SED-03, SED-04, SED-05, COM-01, COM-02, COM-03, COM-04, COM-05, ECO-01, ECO-02, ECO-03, ECO-04, FAQ-01, FAQ-02, FAQ-03, FAQ-04, FAQ-05
**Success Criteria** (what must be TRUE):

1. 8 sede cards display with real location data, Google Maps "Como llegar" links, WhatsApp "Reservar sesion" links, and special badges for park/international locations
2. A community gallery shows photos in a mosaic grid, 3 testimonial cards with member info, and 4 stats counters (1000+ alumnos, 8 sedes, etc.)
3. The Aura Club sub-section displays with event photo and an Aged Gold ghost CTA
4. 4 ecosystem pathway cards (Entrena, Formate, Inverti, Equipate) link to their respective pages with colored left-border accents
5. The FAQ accordion opens/closes smoothly with only 1 answer visible at a time, first open by default, with ARIA attributes and icon rotation
   **Plans:** 3/3 plans complete

Plans:

- [ ] 33-01-PLAN.md — SectionLocations (8 sede cards) + SectionEcosystem (4 pathway cards)
- [ ] 33-02-PLAN.md — SectionCommunity (gallery, testimonials, stats, AURA CLUB, lightbox)
- [ ] 33-03-PLAN.md — SectionFaq (accordion) + page integration + visual verification

---

### Phase 34: Franquicias Page

**Goal**: A prospective franchise investor can land on /franquicias, understand the investment opportunity, compare franchise models, see the expansion trajectory, and submit an application — the primary franchise acquisition funnel
**Depends on**: Phase 30 (design system and layout ready)
**Requirements**: FRAN-01, FRAN-02, FRAN-03, FRAN-04, FRAN-05, FRAN-06, FRAN-07, FRAN-08, FRAN-09, FRAN-10, FRAN-11
**Success Criteria** (what must be TRUE):

1. /franquicias renders a full-viewport hero with investment figure and "QUIERO APLICAR" CTA
2. The page presents 4 value proposition cards, a Franquicia Activa vs Pasiva comparison, and a 6-item "Que Incluye" grid
3. An expansion map with animated counters shows El Templo's geographic reach
4. The founder section displays Ignacio Bordon's bio with a horizontal timeline (desktop) / vertical timeline (mobile)
5. The application form collects all required fields (nombre, email, telefono, ciudad/pais, modelo, experiencia, capital, origen, mensaje) and submits successfully
6. After form submission, the user sees a confirmation message with a WhatsApp link for immediate contact
7. A floating WhatsApp button is always visible on the page
8. Form submission fires a GA4 event and Meta Pixel Lead event (wired in Phase 36)
9. The page shares the same header and footer as the home page

**Plans:** 4/4 plans complete

Plans:

- [ ] 34-01-PLAN.md — API backend: DB schema, franchise application endpoint, Resend email, integration tests
- [ ] 34-02-PLAN.md — Data file, useCountUp composable, hero, value props, models comparison, includes grid
- [ ] 34-03-PLAN.md — Expansion map with counters, founder bio with timeline, conditional video/PDF section
- [ ] 34-04-PLAN.md — Application form, floating WhatsApp button, page composition, visual verification

---

### Phase 35: Gladius + Blog

**Goal**: The Gladius equipment brand has a showcase page that drives WhatsApp inquiries, and the blog is API-backed with an editor in el-templo-admin, API routes in el-templo-api, and pre-rendered pages in el-templo-web
**Depends on**: Phase 30 (design system and layout ready)
**Requirements**: GLAD-01, GLAD-02, GLAD-03, GLAD-04, GLAD-05, GLAD-06, BLOG-01, BLOG-02, BLOG-03, BLOG-04, BLOG-05, BLOG-06
**Success Criteria** (what must be TRUE):

1. /gladius renders a hero with Gladius branding, product philosophy section, and real-use photo gallery
2. A product catalog displays cards with photo, name, description, and price for each product
3. A contact/purchase section provides WhatsApp CTA and a simple inquiry form (nombre, email, producto de interes)
4. /gladius shares the same header and footer as the home page
5. Blog posts are stored in the database with CRUD API routes in el-templo-api
6. el-templo-admin has a blog editor for creating, editing, and publishing posts
7. /blog renders an index page with post cards (title, excerpt, date, reading time) fetched from API at build time
8. Individual blog posts render with brand typography, design system styling, and per-post SEO meta tags
9. Blog index supports pagination or infinite scroll for browsing posts

**Plans:** 4/4 plans complete

Plans:

- [ ] 35-01-PLAN.md — API backend: DB schemas (products, inquiries, blog_posts), Gladius + Blog routes/services, image upload, integration tests
- [ ] 35-02-PLAN.md — Gladius /gladius page: Hero, Philosophy, Catalog, En Accion, Contact form, WhatsApp
- [ ] 35-03-PLAN.md — Admin panel: Blog editor with Markdown toolbar + preview, Gladius product CRUD, role restriction
- [ ] 35-04-PLAN.md — Blog frontend: /blog index with pagination, /blog/[slug] post page with sidebar + SEO

---

### Phase 36: SEO + Analytics

**Goal**: The entire site is optimized for search engines and instrumented for conversion tracking — structured data tells Google what every page is, meta tags drive social sharing, performance meets Core Web Vitals targets, and analytics capture every meaningful user action
**Depends on**: Phases 31-35 (all content pages built)
**Requirements**: SEO-01, SEO-02, SEO-03, SEO-04, SEO-05, SEO-06, SEO-07, SEO-08, TRACK-01, TRACK-02, TRACK-03, TRACK-04
**Success Criteria** (what must be TRUE):

1. Every page renders as server-side HTML (SSR/SSG) that is fully indexable by search engine crawlers
2. Each page has unique title, description, Open Graph, and Twitter Card meta tags
3. Structured data exists for Organization, LocalBusiness (per sede), Article (blog posts), and FAQPage (home FAQ section)
4. sitemap.xml is auto-generated and robots.txt is configured with appropriate rules
5. Images use lazy loading, WebP/AVIF formats where supported, and srcset for responsive sizing
6. Lighthouse scores meet Core Web Vitals targets: LCP < 2.5s, FID < 100ms, CLS < 0.1
7. GA4 tracks page views, CTA clicks, form submissions, and scroll depth
8. Meta Pixel fires Lead event on franchise form submission
9. All analytics are guarded by cookie consent (GDPR-aware)
10. Target keywords (calistenia, entrenamiento peso corporal, gimnasio funcional [ciudad]) are present in semantic HTML, headings, and meta descriptions

**Plans:** 4/4 plans complete

Plans:

- [ ] 36-01-PLAN.md — Nuxt modules, self-hosted fonts, robots.txt, cookie consent, analytics env vars
- [ ] 36-02-PLAN.md — Structured data (Organization, LocalBusiness, FAQPage, Article), enhanced meta tags, sitemap, canonical URLs, 404 page
- [ ] 36-03-PLAN.md — GA4 + Meta Pixel plugins, section scroll tracking, CTA click events, image optimization
- [ ] 36-04-PLAN.md — Semantic HTML audit, heading hierarchy, keyword placement, internal cross-linking

---

## Progress

### v2.0 Progress

**Execution Order:**
Phases 14-16 (Session Management) → Phase 17 (Mobility) → Phase 18 (Deployment) → Phase 19 (Tech Debt) → Phase 20 (Personalized Sessions) → Phase 21 (APK) → Phases 22-24 (Branch Attendance)

| Phase                                              | Plans Complete | Status         | Completed  |
| -------------------------------------------------- | -------------- | -------------- | ---------- |
| 13. Session Generation Review                      | 8/8            | Complete       | 2026-02-05 |
| 14. Admin Session Review UI                        | 8/8            | Complete       | 2026-02-06 |
| 15. Admin Session Editing                          | 9/9            | Complete       | 2026-02-10 |
| 16. PDF Gen, Format Config & App Exercise Tracking | 10/10          | Complete       | 2026-02-12 |
| 17. Per-Block Mobility Exercises                   | 4/4            | Complete       | 2026-02-12 |
| 18. Domain/Subdomain Deployment                    | 3/3            | Complete       | 2026-02-13 |
| 19. Technical Debt Audit                           | 9/9            | Complete       | 2026-02-14 |
| 26. App Video Integration                          | 2/2            | Complete       | 2026-02-15 |
| 27. Member App Staging Environment                 | 5/5            | Complete       | 2026-02-16 |
| 20. Per-Member Personalized Sessions               | 7/8            | In Progress    |            |
| 21. APK Handling                                   | 0/?            | Not Started    | —          |
| 22. Branch Attendance Data Model                   | 0/?            | Blocked (docs) | —          |
| 23. Admin Member Attendance                        | 0/?            | Not Started    | —          |
| 24. Member Booking UI                              | 0/?            | Not Started    | —          |

### v3.0 Progress

**Execution Order:**
Phase 29 (Infrastructure) → Phase 30 (Design System) → Phases 31-35 (Content, parallel-capable) → Phase 36 (SEO/Analytics) → Phase 37 (SEO Audit Fixes) → Phase 38 (Franchise Admin) → Phase 39 (App Brand Alignment) → Phase 40 (Day Player Redesign) → Phase 41 (Content Handoff)

| Phase                                       | Plans Complete | Status      | Completed  |
| ------------------------------------------- | -------------- | ----------- | ---------- |
| 29. Nuxt Scaffold + Infrastructure          | 3/3            | Complete    | 2026-03-01 |
| 30. Design System + Navigation + Footer     | 4/4            | Complete    | 2026-03-01 |
| 31. Hero + Identity + Method Sections       | 4/4            | Complete    | 2026-03-01 |
| 32. Levels + Approaches + Conversion        | 3/3            | Complete    | 2026-03-01 |
| 33. Locations + Community + Ecosystem + FAQ | 3/3            | Complete    | 2026-03-01 |
| 34. Franquicias Page                        | 4/4            | Complete    | 2026-03-01 |
| 35. Gladius + Blog                          | 4/4            | Complete    | 2026-03-01 |
| 36. SEO + Analytics                         | 4/4            | Complete    | 2026-03-01 |
| 37. SEO Audit Fixes                         | 4/4            | Complete    | 2026-03-02 |
| 38. Franchise Application Management        | 3/3            | Complete    | 2026-03-02 |
| 39. App & PDF Brand Alignment               | 5/5            | Complete    | 2026-03-02 |
| 40. Day Player Redesign                     | 5/5            | Complete    | 2026-03-02 |
| 41. Content & Media Handoff                 | 0/?            | Not Started | —          |
| 42. Blog Internal Linking System            | 4/4            | Complete    | 2026-03-02 |
| 43. Academy Landing Page (/academy)         | 4/4            | Complete    | staging    |
| 44. App Landing Page (/app)                 | 3/4            | Complete    | 2026-03-03 |

### Phase 37: SEO Audit Fixes

**Goal:** Address issues identified by seoptimer audit (score C+) — fix SSR dynamic rendering (43%), optimize title tag length, add favicon, enable HTTP/2, add social media profile links, hide plain-text emails, improve compression, and add visible business contact info
**Requirements**: Based on seoptimer audit of eltemplo.org (2026-03-02). See `.docs/brand-landing/landing-seo-analysis.txt`
**Depends on:** Phase 36 (SEO infrastructure must be in place)
**Plans:** 4/4 plans complete

Plans:

- [x] 37-01-PLAN.md — Favicon, Nginx HTTP/2 + gzip, SSG rendering investigation + visible SEO intro text
- [x] 37-02-PLAN.md — Title tag optimization (50-60 chars), OG meta tags, H2 keyword audit across home sections
- [x] 37-03-PLAN.md — Social media profile links (Instagram/YouTube/Facebook), email obfuscation, real phone/address, inline style reduction
- [x] 37-04-PLAN.md — Franchise and Gladius heading keyword optimization (H1/H2 keyword clusters)

---

### Phase 38: Franchise Application Management

**Goal:** Admin panel in el-templo-admin for managing franchise applications — view/filter/sort applications, track status (new/contacted/negotiating/closed), and AI agent integration for designing tailored conversion strategies based on application data (investor profile, capital, experience, model preference)
**Requirements**: TBD
**Depends on:** Phase 34 (franchise form must exist first)
**Plans:** 3/3 plans complete

Plans:

- [x] TBD (run /gsd:plan-phase 38 to break down) (completed 2026-03-02)

---

### Phase 39: App & PDF Brand Alignment

**Goal:** Unify el-templo-app and el-templo-admin PDF visual identity with el-templo-web's design system — migrate typography from Cinzel to Montserrat (headings) + Geologica (body) + Cormorant Garamond (narrative), align color palette (terracotta primary, aged gold accent, marble cream background, azul noche secondary), create shared design tokens, and restyle all app pages/components and the PDF builder to follow the canonical brand system established in Phase 30
**Requirements**: TBD
**Depends on:** Phase 38 (all prior work complete)
**Plans:** 5 plans

Plans:

- [x] 39-01-PLAN.md — App design foundation: font packages, Quasar variables, app.scss, blockColors.ts
- [x] 39-02-PLAN.md — PDF builder rebrand: base64 fonts, color tokens, cover page
- [x] 39-03-PLAN.md — App component restyling: layout, training, player components (15 files)
- [x] 39-04-PLAN.md — App component restyling: progression, journey modules (11 files)
- [x] 39-05-PLAN.md — Admin light brand touch + build verification + visual inspection

---

### Phase 40: Day Player Redesign

**Goal:** Redesign the DayPlayer workout experience in el-templo-app with an Instagram Stories-style exercise progression (tap right/left to navigate), exercise info displayed below, ability to view all exercises in the block, new between-block transition screens with philosophical/motivational quotes, and full brand alignment using the design system from Phase 39
**Requirements**: TBD
**Depends on:** Phase 39 (brand-aligned design tokens and typography must be in place)
**Plans:** 5 plans

Plans:

- [x] 40-01-PLAN.md — Quotes data module, story navigation composable, segmented progress bar
- [x] 40-02-PLAN.md — Story exercise card, compact exercise list, Dosis→Cantidad rename
- [x] 40-03-PLAN.md — Overlay screens: splash, between-block transition, celebration redesign
- [x] 40-04-PLAN.md — BlockProgressionView rewrite + DayPlayer wiring
- [x] 40-05-PLAN.md — Build verification + visual inspection checkpoint

---

### Phase 41: Content & Media Handoff

**Goal:** Replace all placeholder images and media with real assets from the team, configure production Meta Pixel ID and GA4 Measurement ID, populate full LocalBusiness structured data per sede (hours, phone, photos, services), and do a final content review pass across all pages
**Requirements**: TBD
**Depends on:** Phase 40 (all app redesign work complete)
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd:plan-phase 41 to break down)

### Phase 42: Blog internal linking system (tags, related posts, cross-page CTAs)

**Goal:** Add a tag taxonomy, related posts, tag browsing pages, and cross-page CTAs to the blog to improve internal linking for SEO (link equity distribution, topical clustering, crawl depth) and increase reader engagement/time-on-site
**Requirements**: TBD
**Depends on:** Phase 41
**Status**: Complete
**Plans:** 4/4 plans complete

Plans:

- [x] 42-01-PLAN.md — DB schema (blog_tags, blog_post_tags), seed migration, BlogService tag methods, API routes, integration tests
- [x] 42-02-PLAN.md — Admin tag CRUD page, blog editor tag assignment + CTA type selector
- [x] 42-03-PLAN.md — Frontend tag pills, tag bar on index, tag browse page /blog/tag/[slug] with SEO
- [x] 42-04-PLAN.md — Related posts section, cross-page CTA banners, tag sitemap entries

### Phase 43: Academy Landing Page (/academy)

**Goal:** Build the /academy standalone landing page for Olympic Academy (trainer certification program). 10 sections: Hero, ¿Qué es?, Programa (accordion), Niveles (3-tier with próximamente states), Flywheel (reusable circular diagram), Modalidades, Quién Enseña, Inversión (placeholder), FAQ, Formulario (10-field form + API). Includes sticky side menu (desktop), cross-site integration (nav, ecosystem, footer, franquicias links), SEO + analytics, and /curso-entrenadores 301 redirect. Specs: .docs/brand-landing/spec11-pt1.md through spec11-pt4.md.
**Requirements**: ACAD-01 through ACAD-29
**Depends on:** Phase 42
**Plans:** 4/4 plans (complete)

**Success Criteria** (what must be TRUE):

1. /academy renders a full-viewport hero with H1, subtitle, CTA "QUIERO FORMARME", and format data
2. 3 value proposition cards, 7-module accordion, and 3 certification level cards (Nivel 1 active, 2-3 proximamente with badges) display correctly
3. Flywheel diagram (circular desktop, vertical mobile) shows the 4-stage ecosystem path with scroll animation
4. Presencial/Online modalidad cards, Ignacio bio with animated stats, and investment placeholder section render
5. Academy-specific FAQ accordion (8 questions) and 10-field enrollment form work end-to-end (form -> API -> DB -> email notification -> confirmation)
6. Sticky side menu (desktop only) tracks active section via IntersectionObserver with Terracotta highlight
7. AppNav shows Academy link, AppFooter Academy link enabled, FranIncludes has trainer formation note linking to /academy
8. POST /api/academy/inquire validates and stores inquiries; admin list view at /academy in el-templo-admin
9. /curso-entrenadores 301 redirects to /academy; /academy in sitemap; Course structured data present
10. GA4 form_submit_academy event and Meta Pixel trackLead fire on form submission

Plans:

- [x] 43-01-PLAN.md — API backend: DB schema (academy_inquiries), service, routes, integration tests, admin list view
- [x] 43-02-PLAN.md — Data files, page shell, Hero, QueEs, Programa accordion, Niveles certification cards
- [x] 43-03-PLAN.md — FlywheelDiagram (reusable), Modalidades, QuienEnsena (Ignacio stats), Inversion placeholder
- [x] 43-04-PLAN.md — FAQ, Form (10 fields + API), SideMenu (sticky active tracking), WhatsApp, nav integration, SEO

### Phase 44: App Landing Page (/app)

**Goal:** Build the /app standalone landing page for El Templo Online (digital ecosystem). 10 sections: Hero (app download CTAs + store badges), Ecosystem overview (4 modules with progressive unlock flow), Aretē module detail (freemium, active), El Templo module detail (premium, active), Olympic Academy module detail (próximamente), Labs module detail (próximamente + dual CTA for franchisees/external gyms), Flywheel Digital (reusable component from /academy), App Download (store badges + phone mockup), Form A (module notification waitlist for Academy/Labs), Form B (Labs for external gyms — 8 fields including gym size, current system). Includes responsive design (3 breakpoints), module state flags (active/próximamente togglable without redesign), platform-aware store links, GA4 + Meta Pixel event tracking, WhatsApp floating button, SEO meta tags. Specs: .docs/brand-landing/spec12-pt1.md and spec12-pt2.md.
**Requirements**: APP-01 through APP-28
**Depends on:** Phase 43
**Plans:** 4/4 plans complete

**Success Criteria** (what must be TRUE):

1. /app renders a full-viewport hero with H1, store badges, and dual CTAs (download + scroll to modules)
2. Ecosystem overview shows 4 module cards with progressive unlock flow visualization
3. Arete and El Templo sections show active module details (Terracotta ACTIVO badge, features, properties, download CTA)
4. Academy and Labs sections show proximamente treatment (opacity 0.6 + colored badge, no download CTA)
5. Labs has dual CTA: franchisee link to /franquicias + external gym scroll to form B
6. Flywheel Digital shows vertical Arete -> El Templo -> Academy -> Labs flow on Deep Charcoal
7. Download section has store badges, phone mockup placeholder, and 3rd DESCARGA LA APP CTA
8. Form A (waitlist) submits to POST /api/app/waitlist with 4 fields and shows confirmation
9. Form B (Labs) submits to POST /api/app/labs-inquiry with 8 fields and shows confirmation
10. Module states are data-driven flags (isActive boolean) togglable without redesign
11. SectionConversion app CTA links to /app, AppNav has App link, AppFooter enables Templo Online
12. Admin pages exist for both waitlist (read-only) and Labs inquiries (with status tracking)
13. GA4 + Meta Pixel events fire on download CTA, Form A, and Form B submissions

Plans:

- [x] 44-01-PLAN.md — API backend: DB schemas (app_waitlist, labs_inquiries), service, routes, integration tests, admin pages
- [x] 44-02-PLAN.md — Data files, page shell, Hero, Ecosystem overview, Arete + El Templo module sections
- [x] 44-03-PLAN.md — Academy + Labs module sections, Flywheel Digital vertical flow, Download section
- [x] 44-04-PLAN.md — Forms (A+B), WhatsApp, cross-site integration (SectionConversion, AppNav, AppFooter), SEO, analytics

---

_Roadmap created: 2026-02-04_
_v2.0 phases: 2026-02-04 through 2026-02-19_
_v3.0 phases added: 2026-02-28 — 8 phases (29-36), 113 requirements mapped_
_Phase 37 (SEO Audit Fixes) inserted, phases 37-38 renumbered to 38-39: 2026-03-02_
_Phases 39-40 (App Brand Alignment, Day Player Redesign) inserted, Content Handoff moved to 41: 2026-03-02_
_Phase 44 (App Landing Page) planned: 2026-03-03 — 4 plans, 28 requirements (APP-01 through APP-28)_

---

### v4.0 Ecosystem Foundation (Phases 45-52)

**Milestone Goal:** Lay the architectural foundation for the unified ecosystem (virtual branch, AURA tracking, modular DB), consolidate admin operations (merge El-Templo-Net features into el-templo-admin), and build the attendance + class scheduling system.

## v4.0 Phases

- [x] **Phase 45: Architecture Foundation** - Virtual branch, AURA ledger/balances, module boundaries (completed 2026-03-08)
- [x] **Phase 46: Lifestyle Content Extraction** - Extract and adapt Arete content to El Templo brand (completed 2026-03-08) (completed 2026-03-09)
- [x] **Phase 47: Members Management** - Admin member CRUD with search, filters, profiles, notes (completed 2026-03-09)
- [x] **Phase 48: Subscriptions** - Plan management, member assignments, AURA discounts, status tracking (completed 2026-03-09)
- [x] **Phase 49: Payments** - Payment recording, history, overdue flags, financial summary (completed 2026-03-09)
- [x] **Phase 50: Attendance** - QR check-in, AURA awards, admin fallback, attendance records (completed 2026-03-10)
- [x] **Phase 51: Scheduling** - Activities, recurring slots, member reservations, capacity enforcement (completed 2026-03-10)
- [x] **Phase 52: Analytics Dashboard** - Member, attendance, and financial analytics with branch/date filters (completed 2026-03-10)
- [x] **Phase 53: Codebase Health** - Timezone fixes, N+1 query fix, database indexes, test coverage (completed 2026-03-10)
- [x] **Phase 54: Quick Fixes & DRY Utility Extraction** - Bug fixes, dead code removal, shared utilities extraction across all 3 repos (completed 2026-03-11)
- [x] **Phase 55: Pattern Fixes** - Composable instantiation, type safety, convention compliance across admin/app/API (completed 2026-03-11)
- [x] **Phase 56: God Object Decomposition** - Break up god components/services, fix architectural anti-patterns, add test coverage (completed 2026-03-11)

## v4.0 Phase Details

### Phase 45: Architecture Foundation

**Goal**: The codebase has explicit module boundaries, a virtual "Templo Online" branch exists for online members, and AURA transactions are tracked from day one
**Depends on**: Nothing (first phase of v4.0)
**Requirements**: RSTRC-01, RSTRC-02, RSTRC-03, RSTRC-04
**Success Criteria** (what must be TRUE):

1. A "Templo Online" branch exists in the branches table and can be assigned to users without breaking existing branch-dependent logic
2. AURA transactions are recorded in a ledger table with source type, amount, and timestamp for every earning/spending event
3. AURA balance per user is maintained in a dedicated table and updates atomically when a transaction is recorded
4. API source code is organized into explicit modules (training, members, subscriptions, etc.) with defined inter-module interfaces — no cross-module direct database access
   **Plans:** 3/3 plans complete

Plans:

- [ ] 45-01-PLAN.md — DB schema: virtual branch (is_virtual), AURA tables (transactions, balances, config), migration + seeds
- [ ] 45-02-PLAN.md — Module barrel exports for all 12 existing modules + app.ts barrel imports
- [ ] 45-03-PLAN.md — AuraService (award/spend/getBalance) + aura module barrel + integration tests

---

### Phase 46: Lifestyle Content Extraction (REDO — arete-web source)

**Goal**: All lifestyle content from the Arete Web codebase (canonical, replaces deprecated arete-app) is extracted, cataloged, and adapted to El Templo's brand voice — ready for the v5.0 lifestyle module
**Depends on**: Phase 45 (module boundaries must be in place)
**Requirements**: RSTRC-05
**Status**: RESET — original extraction used outdated arete-app. Redoing from arete-web which has significantly expanded content (20 levels, 60 challenges, 160 factos, Greek-only philosophy, 7 new systems).
**Success Criteria** (what must be TRUE):

1. Starter content (L1-2 habits with full field set including verificationType/dataType/auraScaling, simple-tier journal questions, curated factos from Greek-only source, area definitions, philosophical tools) is extracted into typed seed files
2. All extracted content is adapted to El Templo brand voice (rioplatense Spanish, Greek philosophical tone) and ready for database seeding
3. Complete deferred content inventory documents all arete-web systems for v5.0 planning: 20-level progression, 60 challenges, 160 factos, 25 achievements, 149 wisdom quotes, 12 seasonal habits, axis XP, AURA economy (per-habit scaling, caps, ranks), redemption store, Tummo breathing, celebrations, 5 leagues, 12 badges

**Plans:** 2/2 plans complete

Plans:

- [ ] 46-01-PLAN.md — Habits (L1-2 with new fields from arete-web) + Areas (6 definitions with Greek names)
- [ ] 46-02-PLAN.md — Factos (Greek-only curation) + Journal questions (expanded simple tier) + Tools (verify) + Barrel exports

---

### Phase 47: Members Management

**Goal**: Coaches can fully manage members from el-templo-admin — search, filter, view profiles, create/edit members, deactivate accounts, and add internal notes
**Depends on**: Phase 45 (module boundaries and virtual branch must exist)
**Requirements**: MEMB-01, MEMB-02, MEMB-03, MEMB-04, MEMB-05, MEMB-06
**Success Criteria** (what must be TRUE):

1. Admin can view a paginated member list with search by name/email and filters by branch, level, and active/inactive status
2. Admin can open a member's extended profile showing personal info, subscription status, payment history, attendance records, and internal notes
3. Admin can create a new member with profile details, branch assignment, and level assignment
4. Admin can edit any member's profile, reassign branch, change level, and deactivate or reactivate their account
5. Admin can add timestamped internal notes to a member's profile visible only to coaches/admins
   **Plans:** 3/3 plans complete

Plans:

- [ ] 47-01-PLAN.md — DB migration, members API module (CRUD + notes + DNI check), integration tests
- [ ] 47-02-PLAN.md — Enhanced member list page with filters, create/edit member dialog
- [ ] 47-03-PLAN.md — Profile hub refactor (tabbed layout), notes tab, deactivation UI

---

### Phase 48: Subscriptions

**Goal**: Coaches can create subscription plans, assign them to members, and track subscription status — members can see their own plan in the app
**Depends on**: Phase 47 (member profiles must exist to assign subscriptions)
**Requirements**: SUBS-01, SUBS-02, SUBS-03, SUBS-04, SUBS-05
**Success Criteria** (what must be TRUE):

1. Admin can create and manage subscription plans with name, price, and frequency limits (e.g., "3x/week", "unlimited")
2. Admin can assign a plan to a member with start date and billing cycle, and the system auto-calculates adjusted price when the member has active AURA discount milestones
3. Admin can view subscription status (active, expired, cancelled) for any member from their profile or from a subscriptions list view
4. Member can view their current plan name and subscription status in the app
   **Plans:** 2/2 plans complete

Plans:

- [ ] 48-01-PLAN.md — Subscriptions API (schema, migration, plans CRUD, subscription lifecycle, pricing engine, tests)
- [ ] 48-02-PLAN.md — Subscriptions UI (admin plans page, member subscription tab, assign dialog, member app card)

---

### Phase 49: Payments

**Goal**: Coaches can record payments, view payment history, identify overdue members, and see financial summaries — the financial operations backbone
**Depends on**: Phase 48 (subscriptions must exist to know what members owe)
**Requirements**: PAY-01, PAY-02, PAY-03, PAY-04
**Success Criteria** (what must be TRUE):

1. Admin can record a payment for a member specifying amount, date, and method (cash, transfer, or card)
2. Admin can view the full payment history for any member from their profile
3. The system automatically flags members with overdue payments based on subscription billing cycle and last payment date
4. Admin can view a financial summary report showing revenue by period, by branch, and by payment method
   **Plans:** 2/2 plans complete

Plans:

- [ ] 49-01-PLAN.md — Payments API: DB schema, PaymentService, admin routes, overdue detection, financial summary, integration tests
- [ ] 49-02-PLAN.md — Payments Admin UI: member Pagos tab, global PagosPage, payment dialogs, overdue badges, morosos integration

---

### Phase 50: Attendance

**Goal**: Members check in at branches by scanning a QR code, earn AURA for attending, and coaches can view/manage attendance records
**Depends on**: Phase 45 (AURA tables must exist for check-in awards)
**Requirements**: ATTN-01, ATTN-02, ATTN-03, ATTN-04, ATTN-05
**Success Criteria** (what must be TRUE):

1. Each branch displays a QR code (generated by admin or auto-generated) that members can scan
2. Member scans the branch QR code via the app and a check-in is recorded with branch, timestamp, and member ID
3. Each successful check-in automatically awards AURA to the member via the AURA transaction ledger
4. Admin can manually check in a member as a fallback when QR scanning is not possible
5. Admin can view attendance records filtered by member or by date, seeing who checked in, when, and at which branch
   **Plans:** 3/3 plans complete

Plans:

- [ ] 50-01-PLAN.md — Attendance API: DB schema, migration, AttendanceService with QR tokens, check-in enforcement, batch confirm with AURA, integration tests
- [ ] 50-02-PLAN.md — Admin Attendance UI: AsistenciaHoyPage batch confirm, QR generation/download, MemberAttendanceTab, sidebar integration
- [ ] 50-03-PLAN.md — Member App QR Scanner: html5-qrcode scanner, CheckInPage, home FAB, check-in flow

---

### Phase 51: Scheduling

**Goal**: Coaches manage class schedules with capacity limits, and members can browse available slots and reserve/cancel spots from the app
**Depends on**: Phase 47 (member management must exist for reservation identity)
**Requirements**: SCHD-01, SCHD-02, SCHD-03, SCHD-04, SCHD-05, SCHD-06
**Success Criteria** (what must be TRUE):

1. Admin can create activities (e.g., "Sesion Grupal", "Open Gym") with name and description
2. Admin can create weekly recurring time slots for activities with day, time, branch, and capacity limit
3. Member can view available class slots for their branch in the app, showing activity name, time, and remaining capacity
4. Member can reserve a spot in an available slot and cancel a reservation, with the system enforcing capacity limits (full slots cannot be booked)
   **Plans:** 3/3 plans complete

Plans:

- [ ] 51-01-PLAN.md — Scheduling API: DB schema (activities, schedules, bookings, holidays), migration, SchedulingService with booking lifecycle, admin + member routes, integration tests
- [ ] 51-02-PLAN.md — Admin Scheduling UI: HorariosPage weekly grid, slot detail, activity management, holiday management, sidebar integration
- [ ] 51-03-PLAN.md — Member App Reservas: ReservasPage weekly calendar, booking flow, cancel, upcoming reservations, 4th bottom tab

### Phase 57: Registration types and member creation flow fixes

**Goal:** Fix inconsistent registration and member creation flows. App self-registration defaults to Online branch (Park via QR param). Admin "Crear Alumno" becomes plan-first with auto-subscription and auto-generated password. Add DNI + phone collection at app registration. AlumnosPage gains plan filter and plan column. Email service for transactional emails. Reconcile both creation paths for consistent required data.
**Requirements**: None (codebase health — no new features)
**Depends on:** Phase 56
**Plans:** 3/3 plans complete

Plans:

- [ ] 57-01-PLAN.md — API: auth/register (Online default, DNI+phone required, branch param), admin member creation (planId, auto-password, auto-subscription), members list (plan filter + plan name), email service module, integration tests
- [ ] 57-02-PLAN.md — App RegisterPage: DNI + phone fields, firstName/lastName required, branch param from URL for Park QR registration
- [ ] 57-03-PLAN.md — Admin: MemberFormDialog plan-first QStepper rewrite, AlumnosPage plan column/filter, "Gestionar Plan" rename

---

**Plans:** 2/2 plans complete

Plans:

- [ ] 52-01-PLAN.md -- Analytics API module (KPIs, member, attendance, financial endpoints + tests)
- [ ] 52-02-PLAN.md -- Analytics dashboard UI (AnaliticasPage with charts, heatmap, filters, sidebar)

### Phase 53: Codebase health: timezone fixes, god object decomposition, performance optimization, test coverage

**Goal:** Fix critical timezone bugs in booking/cancel windows, eliminate N+1 query in scheduling, add missing database indexes, extract shared date utilities (DRY), and close test coverage gaps in progression and scheduling modules.
**Requirements**: None (codebase health — no new features)
**Depends on:** Phase 52
**Plans:** 3/3 plans complete

Plans:

- [ ] 53-01-PLAN.md -- Shared date-utils module (TDD) + timezone fixes in scheduling/analytics
- [ ] 53-02-PLAN.md -- N+1 query fix in getWeeklyGrid + missing database indexes
- [ ] 53-03-PLAN.md -- Test coverage for progression module + scheduling window integration tests

### Phase 54: Quick Fixes & DRY Utility Extraction

**Goal:** Fix critical bugs (Axios boot Capacitor navigation), remove dead code, sanitize blog editor HTML, and extract shared utilities to eliminate DRY violations across all three repos — extractError (13 duplicates), formatDate (17+ duplicates), error classes (4 API modules), untyped catch blocks
**Requirements**: None (codebase health — no new features)
**Depends on:** Phase 53
**Plans:** 3/3 plans complete

Plans:

- [ ] 54-01-PLAN.md -- API shared error classes + handleServiceError + untyped catch fixes
- [ ] 54-02-PLAN.md -- Frontend extractError + formatDate DRY extraction (admin + app)
- [ ] 54-03-PLAN.md -- Axios Capacitor nav fix, blog XSS sanitization, dead test removal

### Phase 55: Pattern Fixes: Composable Instantiation, Type Safety, Convention Compliance

**Goal:** Fix ~38 admin composable re-instantiations inside function bodies (move to setup-level), replace 12 unsafe Axios `as` casts with proper type narrowing in app, fix useWakeLock composable convention violation (onUnmounted inside composable), replace 5 `Record<string, unknown>` with Drizzle typed partials in API, fix loose `ctaType` string type in blog API, fix getMorososCount full-fetch-to-count pattern
**Requirements**: None (codebase health — no new features)
**Depends on:** Phase 54
**Plans:** 3/3 plans complete

Plans:

- [ ] 55-01-PLAN.md -- Admin composable re-instantiation: move ~37 in-function calls to setup level across 9 files
- [ ] 55-02-PLAN.md -- App unsafe Axios casts + useWakeLock convention: extractError utility + lifecycle fix
- [ ] 55-03-PLAN.md -- API type safety: Drizzle typed partials, ctaType union, getMorososCount COUNT query

### Phase 56: God Object Decomposition & Architectural Fixes

**Goal:** Break up HorariosPage.vue (1385 LOC, 6 responsibilities) into focused components, break up AnaliticasPage.vue (1260 LOC) into tab components, decompose SchedulingService (1563 LOC) into domain services, fix composable-inside-computed anti-pattern in DayPlayer/JourneySession player pages, introduce service dependency injection in API (replace `new` inside constructors), add meaningful analytics test coverage (retention rate, financial assertions)
**Requirements**: None (codebase health — no new features)
**Depends on:** Phase 55
**Plans:** 5/5 plans complete

Plans:

- [ ] 56-01-PLAN.md -- HorariosPage decomposition: extract 3 dialog components (slot detail, activities, holidays)
- [ ] 56-02-PLAN.md -- AnaliticasPage decomposition: extract 3 tab components (miembros, asistencia, finanzas)
- [ ] 56-03-PLAN.md -- SchedulingService decomposition: split into ActivityService, BookingService, HolidayService + slimmed ScheduleService
- [ ] 56-04-PLAN.md -- Fix composable-inside-computed in player pages + constructor DI in AttendanceService/SubscriptionService
- [ ] 56-05-PLAN.md -- Analytics test coverage: retention rate, morosos, financial deterministic assertions

---

### v4.1 Admin Consolidation & Data Migration (Phases 58-66)

**Milestone Goal:** Make the admin + member app ecosystem operational for physical branches by importing real member data, enhancing the admin with features from the legacy system, and deploying everything to production.

## v4.1 Phases

- [x] **Phase 58: Production Deployment** - Push all v4.0 staging work to production so all environments match
- [x] **Phase 59: Schema Extensions & Data Import** - Add documentType/address fields, import 5 branch CSV datasets, enable editing of new fields (completed 2026-03-16)
- [x] **Phase 60: Plan Configuration** - Turnos-per-week limits, class-based plans, multi-branch flag, trial flag, grace period, class tracking (completed 2026-03-17)
- [ ] **Phase 61: QR Access Control** - Kiosk welcome screen with soft verification, real-time access log, manual check-in
- [x] **Phase 62: Payment Enhancements** - SKIPPED: Deportnet patterns, not applicable to El Templo's model
- [x] **Phase 63: Cash Box** - Daily cash movement tracking by payment method, cash box summary view (completed 2026-03-18)
- [x] **Phase 64: Member Management Enhancements** - Photo upload/capture, subscription change workflow, Excel export (completed 2026-03-18)
- [x] **Phase 65: Reports Dashboard** - Access log, charge history, debt list, expiring memberships, inactive members with filters and Excel export (completed 2026-03-18)
- [x] **Phase 66: Roles & Permissions** - Predefined roles (admin, coach, recepcionista, owner) with permission-based UI visibility (completed 2026-03-18)

## v4.1 Phase Details

### Phase 58: Production Deployment

**Goal**: All environments (local, staging, production) are running identical code so feature work builds on a stable, verified foundation
**Depends on**: Phase 57 (last v4.0 phase)
**Requirements**: DEPLOY-01
**Success Criteria** (what must be TRUE):

1. Production API, admin app, and member app serve the same version as staging
2. All database migrations (including v4.0 schema changes) have run successfully on production
3. Smoke tests pass on production URLs (API health, admin login, app login)
   **Plans**: 2 plans

Plans:

- [x] 58-01-PLAN.md — Commit v4.0 WIP, create production seed script, push to staging
- [x] 58-02-PLAN.md — Merge to master, deploy production, seed production database

---

### Phase 59: Schema Extensions & Data Import

**Goal**: Real member data from 5 physical branches is in the system, with new fields (document type, address) available for viewing and editing
**Depends on**: Phase 58 (production must be current before importing data)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, MEMBER-04
**Success Criteria** (what must be TRUE):

1. Users table includes documentType (DNI, Pasaporte, etc.) and home address fields with a completed migration
2. Import script successfully processes all 5 branch CSV files (alem, constitucion, jujuy, mogotes, moreno) with correct field mapping
3. Duplicate members (by DNI or email) are detected and handled according to configurable strategy (skip, update, or error)
4. Imported members with subscription data have corresponding subscription records created from plan name lookups
5. Admin can view and edit a member's document type and home address from the member profile
   **Plans**: 4 plans

Plans:

- [ ] 59-01-PLAN.md — Schema migration (documentType, address, isArchived) + API CRUD updates
- [ ] 59-02-PLAN.md — Admin UI for documentType and address (form dialog + profile tab)
- [ ] 59-03-PLAN.md — CSV member import script (5 branches, duplicate resolution, plan mapping)
- [ ] 59-04-PLAN.md — Legacy plan admin UI (archived badges, bulk migration action)

---

### Phase 60: Plan Configuration

**Goal**: Subscription plans support real-world variations (turnos limits, class-based spending, multi-branch access, trial plans, grace periods) and the system tracks class usage
**Depends on**: Phase 59 (imported members need plans to configure)
**Requirements**: PLANS-01, PLANS-02, PLANS-03, PLANS-04, PLANS-05, PLANS-06
**Success Criteria** (what must be TRUE):

1. Admin can create/edit plans with turnos-per-week limits and class-based plan (X classes to spend) configuration
2. Admin can toggle multi-branch access and trial flags on any plan
3. Admin can set a grace period per branch that extends membership validity for renewal windows
4. Class-based plan members see their remaining classes, and each confirmed check-in decrements the count
   **Plans**: 3 plans

Plans:

- [ ] 60-01-PLAN.md — Schema migration + class tracking + grace period settings API
- [ ] 60-02-PLAN.md — Attendance and booking enforcement (weekly limit, budget, grace period, force check-in)
- [ ] 60-03-PLAN.md — Admin UI (grace period card, fixed-day selector, class usage display)

---

### Phase 61: QR Access Control

**Goal**: QR check-in auto-confirms with AURA award, fixed plans use specific schedule slot reservations with bulk booking generation, and coaches manage attendance per schedule slot from Horarios
**Depends on**: Phase 60 (access verification needs plan configuration and class tracking)
**Requirements**: ACCESS-01, ACCESS-02, ACCESS-03, ACCESS-04, ACCESS-05
**Success Criteria** (what must be TRUE):

1. QR scan immediately creates confirmed attendance and awards AURA (no two-step model)
2. Fixed-plan subscriptions store specific schedule slot references with auto-generated bookings for the subscription period
3. Coaches can view attendance per schedule slot and manually check in or remove check-ins from Horarios
4. Expired subscription = immediate hard block (grace period removed)
5. Each attendance record stores member details, subscription info, and schedule reference
   **Plans**: 3 plans

Plans:

- [ ] 61-01-PLAN.md — Schema migration + service cleanup (grace period removal, auto-confirm, attendance enum)
- [ ] 61-02-PLAN.md — Fixed schedule slots + bulk booking generation + slot attendance API
- [ ] 61-03-PLAN.md — Admin UI rework (slot picker, attendance in Horarios, grace period removal)

---

### Phase 62: Payment Enhancements — SKIPPED

**Status**: Skipped — requirements were Deportnet patterns that don't match El Templo's business model.

- PAY-01 (payment-time discounts): Discounts already handled at subscription assignment (Zero pricing engine + future AURA). No payment-time discounts needed.
- PAY-02 (cancel charge → free bookings): Phase 61 already cancels future bookings on subscription cancellation. Void payment exists independently for recording mistakes.
- PAY-03/PAY-04 (cuenta corriente / debt tracking): El Templo has no partial payment model — members pay full amount at plan assignment, expired = inactive.

**Original Requirements**: PAY-01, PAY-02, PAY-03, PAY-04 — marked as not applicable

---

### Phase 63: Cash Box

**Goal**: CajaPage with per-method revenue summary, integrated payment recording on plan assign/renew, and morosos cleanup
**Depends on**: Phase 61 (needs subscription/payment infrastructure in place)
**Requirements**: CASH-02, CASH-03
**Plans:** 3/3 plans complete
**Success Criteria** (what must be TRUE):

1. All cash movements (income and expenses) are organized and visible by payment method (cash, transfer, card)
2. Recepcionista can view a cash box summary showing collected vs spent amounts per payment method

Plans:

- [ ] 63-01-PLAN.md — API: schema migration, morosos removal, subscription-only filtering, renewal endpoint, auto-payment on assign
- [ ] 63-02-PLAN.md — Frontend: CajaPage with per-method cards + month picker, cleanup dead components, update routes/sidebar
- [ ] 63-03-PLAN.md — Frontend: AssignPlanDialog paymentMethod field, MemberSubscriptionTab renewal dialog

---

### Phase 64: Member Management Enhancements

**Goal**: Admin has complete member management tools — photo upload, plan changes with price calculations, and bulk export
**Depends on**: Phase 59 (needs imported member data to manage)
**Requirements**: MEMBER-01, MEMBER-02, MEMBER-03
**Success Criteria** (what must be TRUE):

1. Admin can upload a member photo via file upload or capture via webcam from the member profile
2. Admin can change a member's active subscription to a different plan, seeing the price difference calculation before confirming
3. Admin can export the current filtered member list as an Excel file
   **Plans:** 3/3 plans complete

Plans:

- [ ] 64-01-PLAN.md — Member photo upload (R2 migration, presigned URL endpoint, webcam/file upload component)
- [ ] 64-02-PLAN.md — Plan change with proration (upgrade/downgrade validation, price comparison preview)
- [ ] 64-03-PLAN.md — Member Excel export (exceljs backend, download button on AlumnosPage)

---

### Phase 65: Reports Dashboard

**Goal**: Admin has a dedicated reports section with four operational reports (access log, charge history, expiring memberships, inactive members), all filterable by branch and report-specific criteria, with Excel export per report
**Depends on**: Phase 61 (access log data)
**Requirements**: REPORT-01, REPORT-02, REPORT-03, REPORT-04, REPORT-05
**Success Criteria** (what must be TRUE):

1. Access log report shows check-in history with filters (period, member, source) and exports to Excel
2. Charge history report shows payment records with filters (period, payment method, member) and exports to Excel — voided payments visually distinct
3. REPORT-03 (debt report) N/A — debt/morosos concept removed in Phase 63
4. Expiring memberships report shows members with expired or soon-to-expire subscriptions within a configurable window, with WhatsApp contact
5. Inactive member report shows members with active subscriptions but no check-ins within a configurable days threshold, with WhatsApp contact
   **Plans:** 2/2 plans complete

Plans:

- [ ] 65-01-PLAN.md — API reports module: types, service, routes, schemas, Excel export, integration tests
- [ ] 65-02-PLAN.md — Frontend ReportesPage: 4 tabs with filters, pagination, export, WhatsApp buttons

---

### Phase 66: Roles & Permissions

**Goal**: Branch staff see only the features their role allows — admin sees everything, recepcionista sees member/payment/cash tools, coach sees training/attendance
**Depends on**: All feature phases (Phase 58-65) — permissions layer applies to existing features
**Requirements**: ROLES-01, ROLES-02, ROLES-03, ROLES-04
**Success Criteria** (what must be TRUE):

1. System supports four predefined roles: admin, coach, recepcionista, owner
2. Each role has a predefined permission set that controls which pages, features, and actions are accessible
3. Admin can assign a role to any system user from the user management interface
4. Admin UI dynamically shows/hides sidebar items, page sections, and action buttons based on the logged-in user's role
   **Plans:** 2/2 plans complete

Plans:

- [ ] 66-01-PLAN.md — Backend: DB migration (superadmin->owner, add recepcionista), centralized permission registry, API module role updates, user management CRUD + tests
- [ ] 66-02-PLAN.md — Frontend: types/auth/sidebar/route updates for owner role, UsuariosPage for staff management

---

## v4.1 Progress

**Execution Order:**
Phase 58 (Deploy) → Phase 59 (Data Import) → Phase 60 (Plans) → Phase 61 (Access) → Phase 62 (Payments) → Phase 63 (Cash Box) → Phase 64 (Members) → Phase 65 (Reports) → Phase 66 (Roles)

| Phase                               | Plans Complete | Status      | Completed  |
| ----------------------------------- | -------------- | ----------- | ---------- |
| 58. Production Deployment           | 2/2            | Complete    | 2026-03-14 |
| 59. Schema Extensions & Data Import | 4/4            | Complete    | 2026-03-16 |
| 60. Plan Configuration              | 3/3            | Complete    | 2026-03-17 |
| 61. QR Access Control               | 2/3            | In Progress |            |
| 62. Payment Enhancements            | —              | Skipped     | 2026-03-17 |
| 63. Cash Box                        | 3/3            | Complete    | 2026-03-18 |
| 64. Member Management Enhancements  | 3/3            | Complete    | 2026-03-18 |
| 65. Reports Dashboard               | 2/2            | Complete    | 2026-03-18 |
| 66. Roles & Permissions             | 2/2            | Complete    | 2026-03-18 |

---

_v4.1 phases added: 2026-03-14 — 9 phases (58-66), 37 requirements mapped_

</details>

<details>
<summary>v4.2 Clases Personalizadas Launch (Phases 67-69)</summary>

## v4.2 Overview

Ship the existing "Journeys" feature to production as "Clases Personalizadas". The feature is architecturally complete but disabled. This milestone renames everything, adds subscription gating, wires AURA rewards, and enables the member app module.

**Source spec:** .docs/journey-wrap-up.md

## v4.2 Phases

### Phase 67: Personalizadas Backend Rename

**Goal**: All backend references to "journey/journeys" are renamed to "personalizada/personalizadas" — database tables, columns, API module, routes, types, constants, pipeline, and tests
**Depends on**: None (can start immediately)
**Requirements**: PERS-01, PERS-02, PERS-03, PERS-04, PERS-05, PERS-06, PERS-07
**Plans:** 2/2 plans complete

Plans:

- [ ] 67-01-PLAN.md — DB migration + schema rename + module folder rename
- [ ] 67-02-PLAN.md — Cross-references, pipeline rename, app.ts wiring, tests

**Success Criteria** (what must be TRUE):

1. DB migration renames `member_journeys` → `member_personalizadas` and `journey_type` → `personalizada_type` in all 3 tables
2. Existing `J-` dayId prefixes updated to `P-` in session records
3. API module lives at `src/modules/personalizadas/` with all types, constants, and services renamed
4. Route paths are `/personalizadas/*` and `/admin/personalizadas/*`
5. Pipeline file is `personalizada-pipeline.ts` with updated cross-references
6. All tests pass from `test/personalizadas/` with updated endpoints and types
7. `pnpm test` passes with zero failures

---

### Phase 68: Personalizadas Frontend Rename

**Goal**: All frontend references to "journey/journeys" are renamed to "personalizada/personalizadas" across admin and member app — types, composables, stores, pages, components, routes, and UI text
**Depends on**: Phase 67 (frontend calls renamed API endpoints)
**Requirements**: PERS-08, PERS-09, PERS-10, PERS-11, PERS-12
**Success Criteria** (what must be TRUE):

1. Admin types, composables, and pages use personalizada naming and hit `/personalizadas/*` endpoints
2. Member app module folder is `src/modules/personalizada/` with all internal files renamed
3. All UI text shows "Clase Personalizada" / "Personalizadas" (Spanish)
4. Member app routes are `/personalizada/*`
5. `vue-tsc --noEmit` passes on both admin and member app
6. Zero remaining "journey" or "Journey" references in any `src/` directory

**Plans:** 2/2 plans complete

Plans:

- [ ] 68-01-PLAN.md -- Admin app rename (types, composable, pages)
- [ ] 68-02-PLAN.md -- Member app rename (module folder, progression refs, boot)

---

### Phase 69: Subscription Gate, AURA Rewards & Module Enable

**Goal**: Personalizadas is gated behind a subscription flag, awards AURA on completion, and the member app module is activated
**Depends on**: Phase 68 (needs renamed module to enable)
**Requirements**: PERS-13, PERS-14, PERS-15, PERS-16, PERS-17
**Success Criteria** (what must be TRUE):

1. `subscription_plans` table has `isPersonalizada` boolean column
2. Admin can toggle "Personalizada" flag when creating/editing a plan
3. PersonalizadasService returns 403 for members without an active Personalizadas subscription on getSession, select, and complete
4. Metadata endpoint stays public (browsing available programs)
5. Completing a personalizada session awards 10 AURA points
6. Member app personalizada module is enabled (uncommented in `boot/modules.ts`)
7. Integration tests cover subscription enforcement and AURA award

**Plans:** 2/2 plans complete

Plans:

- [ ] 69-01-PLAN.md — Backend: isPersonalizada schema, subscription enforcement, AURA award
- [ ] 69-02-PLAN.md — Frontend: admin plan toggle, member app module enable

---

## v4.2 Progress

**Execution Order:**
Phase 67 (Backend Rename) → Phase 68 (Frontend Rename) → Phase 69 (Subscription + AURA + Enable) → Phase 70 (Cycle Config) → Phase 71 (Plan-Driven Assignment) → Phase 72 (Unified Training UX) → Phase 73 (Mi Plan Catalog)

| Phase                                        | Plans Complete | Status   | Completed  |
| -------------------------------------------- | -------------- | -------- | ---------- |
| 67. Personalizadas Backend Rename            | 2/2            | Complete | 2026-03-18 |
| 68. Personalizadas Frontend Rename           | 2/2            | Complete | 2026-03-18 |
| 69. Subscription Gate, AURA Rewards & Enable | 2/2            | Complete | 2026-03-19 |
| 70. Personalizadas Cycle Config              | 2/2            | Complete | 2026-03-19 |
| 71. Plan-Driven Personalizada Assignment     | 2/2            | Complete | 2026-03-19 |
| 72. Unified Training Experience              | 3/3            | Complete | 2026-03-19 |
| 73. Planes — Plan Catalog for Members        | 2/2            | Complete | 2026-03-19 |

---

### Phase 70: Personalizadas Cycle Config

**Goal**: Cycle length derives from existing plan durationDays (no new DB column), member app shows week-based progress bars with session counts and duration breakdown, and completed cycles get a wrap-up card with completion stats and next-step CTAs
**Depends on**: Phase 69 (needs personalizada subscription and plan infrastructure)
**Requirements**: CYCLE-01, CYCLE-02, CYCLE-03, CYCLE-04
**Success Criteria** (what must be TRUE):

1. `GET /personalizadas/stats` endpoint returns cycleWeeks (derived from ceil(plan.durationDays / 7)), currentWeek, cycleEndDate, totalCompletions, durationBreakdown, cycleComplete
2. No new DB column needed — cycle length derives from existing `subscription_plans.durationDays`
3. Member app Mi Camino Personalizadas tab shows progress bar ("Semana X de Y") with session count and duration breakdown
4. When cycle completes, member sees wrap-up card with completion stats, duration breakdown, and CTAs

**Plans:** 2/2 plans complete

Plans:

- [ ] 70-01-PLAN.md — API: CycleStats type, getCycleStats service method, stats endpoint, integration tests
- [ ] 70-02-PLAN.md — Frontend: types, composables, progress bar + duration breakdown + wrap-up card, default tab

---

### Phase 71: Plan-Driven Personalizada Assignment

**Goal**: The subscription plan defines which personalizada type a member trains — no member-side selection. Admin assigns personalizada type via the plan, subscription activation auto-populates member_personalizadas, and the member app selection flow (grid, overview, confirm) is removed along with the Personalizada nav item.
**Depends on**: Phase 70 (cycle config in place, personalizada subscription infrastructure)
**Requirements**: PDRV-01, PDRV-02, PDRV-03, PDRV-04, PDRV-05
**Success Criteria** (what must be TRUE):

1. `subscription_plans` table has a `personalizadaType` column linking plan to a specific personalizada
2. On subscription activation, `member_personalizadas` is created/updated from the plan's personalizada type automatically
3. Member app no longer shows personalizada selection grid, overview, or confirmation flow
4. Personalizada nav item is removed from member app bottom navigation
5. Existing members with active personalizadas continue working (migration handles current data)

**Plans:** 2/2 plans complete

Plans:

- [ ] 71-01-PLAN.md — Backend: schema migration, types, service hooks, route removal, integration tests
- [ ] 71-02-PLAN.md — Frontend: admin personalizadaType dropdown, member app selection flow removal

---

### Phase 72: Unified Training Experience

**Goal**: The Entrenar tab becomes context-aware — members with an active personalizada see the duration picker directly instead of the weekly view, and Mi Camino shows a unified progress view (no tabs) when personalizada is active. Post-session flow navigates to Mi Camino to close the feedback loop.
**Depends on**: Phase 71 (plan-driven assignment, selection flow removed)
**Requirements**: UTE-01, UTE-02, UTE-03, UTE-04, UTE-05, UTE-06, UTE-07
**Success Criteria** (what must be TRUE):

1. Entrenar tab shows duration picker when member has active personalizada, weekly view otherwise
2. After personalizada session completion, member navigates to Mi Camino (not duration picker)
3. Mi Camino shows single unified view when personalizada is active (no Entrenamiento/Personalizadas tabs)
4. General training stats still accessible (secondary/collapsible) for personalizada members
5. Members without personalizada subscription see zero changes to their experience

**Plans:** 3/3 plans complete

Plans:

- [ ] 72-01-PLAN.md — API subscription response + frontend type extension (isPersonalizada, personalizadaType)
- [ ] 72-02-PLAN.md — Context-aware TrainingIndex + post-session navigation to Mi Camino
- [ ] 72-03-PLAN.md — Mi Camino unified view for personalizada members (no tabs, stats collapsible)

---

### Phase 73: Planes -- Plan Catalog for Members

**Goal**: Members can browse all available plans (gym and personalizada) in a "Planes" section of the member app. Each plan shows details and a WhatsApp CTA to contact about changing plans. No prices shown. Current plan highlighted. Read-only catalog.
**Depends on**: Phase 71 (plan-driven assignment in place, selection flow removed)
**Requirements**: PLANES-01, PLANES-02, PLANES-03, PLANES-04, PLANES-05, PLANES-06
**Plans:** 2/2 plans complete

**Success Criteria** (what must be TRUE):

1. Member app has a "Planes" bottom tab (5th tab) accessible to all members
2. All active, non-archived, non-trial plans are displayed in two sections: Planes de Gimnasio and Clases Personalizadas
3. Gym plan cards show tier badge, name, description (no prices)
4. Personalizada cards show zone/focus info but no tier badge (no principiante/intermedio/avanzado)
5. Member's current plan shows "Tu plan actual" badge and "Activo -- vence [fecha]" instead of CTA
6. Other plan cards show WhatsApp CTA with hardcoded ventas number (5492235820521)
7. CTA text contextual: "Contacta para cambiar de plan" vs "Contacta para elegir tu plan"

Plans:

- [ ] 73-01-PLAN.md -- API: member-facing plan listing endpoint with zone metadata
- [ ] 73-02-PLAN.md -- Frontend: plan module, PlanesPage, navigation wiring

---

_v4.2 phases added: 2026-03-18 -- 7 phases (67-73), 17+ requirements mapped_
_Phase 73 (Planes Catalog) planned: 2026-03-19 -- 2 plans, 6 requirements (PLANES-01 through PLANES-06)_

</details>

<details>
<summary>v4.3 Android Play Store Launch (Phases 74-77)</summary>

## v4.3 Overview

Get the member app (el-templo-app) published on Google Play Store. The app already runs as a Capacitor hybrid app with staging debug APK builds via GitHub Actions. This milestone adds release signing, production build workflows, Play Store listing assets, and launches through Google's testing tracks to production.

**Source:** Existing Android infrastructure in `build-android-staging.yml`, `src-capacitor/android/`

## v4.3 Phases

### Phase 74: Pre-Release Prep

**Goal**: Align Capacitor versions, establish version management strategy, and audit the app for production readiness before signing and submission
**Depends on**: None (can start immediately)
**Requirements**: PLAY-01, PLAY-02, PLAY-03, PLAY-04
**Success Criteria** (what must be TRUE):

1. Capacitor CLI and native plugins are on the same major version (all v8 or all v7) — `npx cap doctor` reports no version mismatches
2. `build.gradle` has `versionCode` and `versionName` strategy documented and implemented (versionCode auto-increments, versionName = semver)
3. App name, package ID, icon, and splash screen verified as production-ready
4. AndroidManifest.xml declares only necessary permissions
5. Existing staging debug workflow still builds successfully after version alignment

**Plans:** 2/2 plans complete

Plans:

- [ ] 74-01-PLAN.md — Capacitor v8 migration (upgrade native deps, Gradle toolchain, SDK targets)
- [ ] 74-02-PLAN.md — Production hardening + version management (permissions, ProGuard, manifest overlays, CI version wiring)

---

### Phase 75: Android Signing & Release Build

**Goal**: Generate an upload keystore, configure Gradle signing for release builds, and create a GitHub Actions workflow that produces a signed AAB (Android App Bundle) ready for Play Store upload
**Depends on**: Phase 74 (version alignment and app audit complete)
**Requirements**: PLAY-05, PLAY-06, PLAY-07, PLAY-08, PLAY-09
**Plans:** 2/2 plans complete

Plans:

- [ ] 75-01-PLAN.md — Gradle signing config, gitignore safety, and SECRETS.md documentation
- [ ] 75-02-PLAN.md — Production build workflow (AAB + APK) with keystore verification

**Success Criteria** (what must be TRUE):

1. Upload keystore exists (NOT committed to repo) with backup strategy documented
2. `build.gradle` has `signingConfigs.release` block reading credentials from environment variables
3. GitHub Actions workflow `build-android-production.yml` runs on `workflow_dispatch`, builds production-flavor signed AAB
4. Signed AAB is uploaded as GitHub Actions artifact (downloadable for Play Console upload)
5. Existing `build-android-staging.yml` workflow still works without regression
6. Keystore credentials stored as GitHub Secrets with documentation in `.github/SECRETS.md`

---

### Phase 76: Play Store Setup & Listing

**Goal**: Set up Google Play Developer account, create the app listing with all required assets (screenshots, descriptions, privacy policy), and complete all compliance forms (data safety, content rating, audience)
**Depends on**: Phase 75 (need signed AAB to upload) and Google Play Developer account registration (manual, $25)
**Requirements**: PLAY-10, PLAY-11, PLAY-12, PLAY-13, PLAY-14, PLAY-15, PLAY-16, PLAY-17
**Success Criteria** (what must be TRUE):

1. Google Play Developer account active and verified
2. App created in Play Console with package name `com.eltemplo.app`
3. Store listing has: app name, short description (80 chars), full description, feature graphic (1024x500), at least 4 phone screenshots
4. Privacy policy URL is live and linked in Play Console
5. Data safety form completed and submitted
6. Content rating (IARC) questionnaire completed — rating assigned
7. App category, contact email, and target audience configured

---

### Phase 77: Internal Testing & Launch

**Goal**: Upload signed AAB to internal testing track, validate on real devices, review pre-launch report, and promote to production — app is live on Google Play Store
**Depends on**: Phase 75 (signed AAB), Phase 76 (listing complete)
**Requirements**: PLAY-18, PLAY-19, PLAY-20, PLAY-21, PLAY-22
**Success Criteria** (what must be TRUE):

1. Signed AAB uploaded to internal testing track in Play Console
2. App installed from Play Store (internal track) on at least 2 real Android devices
3. Core flows verified on real devices: login, view training, complete a session, view Mi Camino
4. Pre-launch report in Play Console reviewed — no critical crashes or accessibility blockers
5. App promoted to production track
6. App searchable and installable from Google Play Store

---

## v4.3 Progress

**Execution Order:**
Phase 74 (Pre-Release Prep) → Phase 75 (Signing & Release Build) → Phase 76 (Play Store Setup) → Phase 77 (Testing & Launch)

| Phase                               | Plans Complete | Status   | Completed  |
| ----------------------------------- | -------------- | -------- | ---------- |
| 74. Pre-Release Prep                | 2/2            | Complete | 2026-03-21 |
| 75. Android Signing & Release Build | 2/2            | Complete | 2026-03-21 |
| 76. Play Store Setup & Listing      | manual         | Complete | 2026-04-02 |
| 77. Internal Testing & Launch       | —              | Active   | —          |

---

_v4.3 phases added: 2026-03-21 — 4 phases (74-77), 22 requirements mapped (PLAY-01 through PLAY-22)_

<details>
<summary>v4.4 App Engagement & Intelligent Companion (Phases 78-84)</summary>

## v4.4 Overview

Transform the member app from a passive content library ("here are things you can do") into an intelligent companion ("here's what YOU should do today"). The app learns who you are through onboarding and behavior, gives daily guidance, tracks streaks and progress, and offers tailored paid micro-programs at high-intent moments.

**Source:** Competitive research (BetterMe, Freeletics, Strava, MyFitnessPal) + team discussion. Full research in `.planning/research/app-engagement-upselling-research.md`

**Key constraints:**

- App remains free for gym members — upsells are optional add-ons, never hard paywalls
- Rule-based personalization, not ML — sufficient for our scale
- Short onboarding (3 questions, <2 min) — users are already paying gym members, not cold leads
- Each phase needs GSD discuss before planning — not all ideas confirmed

## v4.4 Phases

### Phase 78: Onboarding & User Profiling

**Goal**: Mandatory 4-question onboarding quiz (goal, experience, focus, motivation) with atmospheric full-screen card UI, member_profiles table, 50 AURA reward, Tu Camino summary card on Mi Camino, and admin profile visibility
**Depends on**: v4.3 complete (app live on Play Store)
**Requirements**: ENG-01, ENG-02, ENG-03
**Plans:** 3 plans

**Success Criteria** (what must be TRUE):

1. First-time app users see a mandatory 4-question onboarding quiz before reaching the home screen
2. member_profiles table stores goalType, experienceLevel, trainingFocus, motivationStyle with onboardingCompletedAt timestamp
3. "Tu Camino" card at top of Mi Camino page shows member's stated goal
4. Onboarding is mandatory — no skip, router guard redirects unonboarded members
5. 50 AURA awarded on quiz completion
6. Admin member detail shows read-only onboarding profile section
7. Analytics tracking: quiz start, per-question duration, completion rate, drop-off point

Plans:

- [x] 78-01-PLAN.md — Backend: member_profiles schema, onboarding service, API routes, AURA integration, /auth/me extension, integration tests
- [x] 78-02-PLAN.md — Member app: 6-screen quiz flow (welcome + 4 questions + result) with atmospheric design, router guard, store extension
- [x] ~~78-03-PLAN.md — Tu Camino card on Mi Camino, admin onboarding profile section, visual verification~~ (dropped — not incorporating into current Mi Templo)

---

### Phase 79: Behavioral Segmentation

**Goal**: Auto-calculate behavioral segments (Nuevo Guerrero, Espartano, Intermitente, En Riesgo, Digital Warrior, Ghost) from existing attendance and app usage data, with admin visibility
**Depends on**: Phase 78 (profile schema exists)
**Requirements**: ENG-05, ENG-06, ENG-07
**Success Criteria** (what must be TRUE):

1. Segment assignment logic calculates member segments from attendance frequency and app usage patterns
2. Segments update periodically (on login or scheduled job) and persist on member records
3. Admin member detail page shows current segment
4. Admin member list is filterable by segment
5. Segment thresholds are configurable (not hardcoded magic numbers)
   **Plans:** 2 plans

Plans:

- [ ] 79-01-PLAN.md — Backend: schema, migration, SegmentationService, login tracking, /auth/me integration, settings API, member list segment filter, integration tests
- [ ] 79-02-PLAN.md — Admin frontend: segment chips in member list/detail, segment filter dropdown, ConfiguracionPage with threshold config card

---

### Phase 80: "Tu Día" Daily Game Plan

**Goal**: Replace or enhance the Mi Camino home screen with a daily game plan that tells members what to do TODAY — today's session, class reminder, progress milestone approaching, active challenge status
**Depends on**: Phase 78 (needs profile for personalization), Phase 79 (needs segments for targeting)
**Requirements**: ENG-08, ENG-09, ENG-10
**Success Criteria** (what must be TRUE):

1. Home screen shows "Tu Día" with today's actionable items based on user profile and context
2. Post-session flow enhanced — RPE rating feeds into a personalized next-step recommendation
3. Weekly summary aggregates sessions, streak, and progress — visible in-app
4. Each user input (RPE, goal, attendance) produces a visible change in recommendations
5. Members without onboarding profile see a simplified version (not broken/empty)
   **Plans:** 3 plans

Plans:

- [x] 80-01-PLAN.md — Backend weekly summary endpoint + frontend types/store extensions (segment, WeeklySummary)
- [x] ~~80-02-PLAN.md — Tu Dia card components (6 cards) + MiCamino.vue reorganization + GeneralContent refactor + TuCaminoCard removal~~ (dropped — not incorporating into current Mi Templo)
- [x] 80-03-PLAN.md — Post-session RPE contextual message on SessionSummary

---

### Phase 81: Streaks & Engagement Mechanics

**Goal**: Add attendance streak tracking with prominent display, post-session celebration animations, and milestone celebrations — the highest-retention-ROI features for lowest effort
**Depends on**: None (can run in parallel with 79-80 if needed)
**Requirements**: ENG-11, ENG-12, ENG-13, ENG-14
**Success Criteria** (what must be TRUE):

1. Current attendance streak and longest streak stored per member and displayed prominently on Mi Camino / Tu Día
2. Post-session or post-check-in celebration animation plays on completion
3. Milestone achievements (streak thresholds, session count milestones, level progression) trigger full-screen celebration
4. AURA awarded for streak milestones and challenge completions (extends existing AURA economy)
5. Streak recovery logic handles reasonable gaps (e.g., rest days don't break streaks)

   **Plans:** 2 plans

Plans:

- [x] 81-01-PLAN.md — Backend: schema migration, StreakService, session/attendance integration, AURA milestones, integration tests
- [x] ~~81-02-PLAN.md — Frontend: StreakRow component on MiCamino, progression types update~~ (dropped — not incorporating into current Mi Templo)

---

### Phase 82: Progressive Profiling & Check-ins

**Goal**: Add 3 daily check-in questions (energy, soreness, sleep) as a swipeable card row on Tu Día with progressive unlock, daily rotation, and visible feedback loop in session CTA messaging (goal reassessment deferred per D-18)
**Depends on**: Phase 78 (profile schema), Phase 80 (Tu Día displays check-in prompts)
**Requirements**: ENG-04, ENG-15, ENG-16, ENG-17
**Plans:** 3 plans
**Success Criteria** (what must be TRUE):

1. Additional profiling questions surface contextually (after 1st session, 3rd session, 1 week) — not forced
2. Monthly goal reassessment — DEFERRED per D-18 (no goal-driven content yet)
3. Check-in answers stored in check_in_responses table and feed into Tu Día recommendations
4. User inputs produce visible changes (tired → "Sesión liviana sugerida", sore → "Considerá movilidad hoy")
5. Cards persist until answered — no skip, no dismiss (per D-15)

Plans:

- [x] 82-01-PLAN.md — Backend: check_in_responses schema, CheckInService, progressive unlock logic, API endpoints, integration tests
- [x] 82-02-PLAN.md — Frontend: CheckInCard component, store/composable, swipeable row on MiCamino with daily rotation
- [x] ~~82-03-PLAN.md — Feedback loop: SessionCtaCard messaging adapts based on today's check-in answers~~ (dropped — not incorporating into current Mi Templo)

---

### Phase 83: Micro-Program Upsells ("Experiencias a Medida")

**Goal**: Create admin-configurable purchasable micro-programs with structured weekly content, session-gated progression, WhatsApp-mediated purchase flow, segment-aware CTA on Tu Dia, and enrollment management
**Depends on**: Phase 78-80 (needs profile + segments + Tu Dia for targeting), Phase 81 (milestone triggers for CTAs)
**Requirements**: ENG-18, ENG-19, ENG-20, ENG-21
**Plans:** 5 plans

Plans:

- [x] 83-01-PLAN.md — Schema, types, migration (micro_programs, content_blocks, enrollments, AURA source types)
- [x] 83-02-PLAN.md — API service + routes (program CRUD, enrollment lifecycle, member endpoints)
- [x] 83-03-PLAN.md — Admin UI (program wizard, enrollment management, analytics)
- [x] 83-04-PLAN.md — Member app (CTA card, progress card, catalog page, WhatsApp deep links)
- [ ] 83-05-PLAN.md — Session counting, AURA integration, Personalizadas gating, integration tests

**Success Criteria** (what must be TRUE):

1. Micro-program data model supports purchasable programs with duration, goal, content, and pricing
2. Program catalog browsable in-app with clear descriptions and value propositions
3. Segment-aware CTA card visible on Tu Dia for non-enrolled members with WhatsApp purchase flow
4. Enrolled members see expandable progress card with weekly content blocks
5. Purchase flow functional (WhatsApp-mediated with deep link params)
6. Admin can create, edit, and deactivate micro-programs via wizard
7. Admin can enroll members, cancel enrollments, and advance weeks
8. Session completion drives program progression with AURA bonuses

---

### Phase 84: Push Notifications Foundation

**Goal**: Set up push notification infrastructure (Capacitor plugin + backend scheduler) with segment-driven notification strategies and user opt-in/out preferences
**Depends on**: Phase 79 (segments drive notification strategy)
**Requirements**: ENG-22, ENG-23, ENG-24
**Plans:** 7 plans

Plans:

- [x] 84-01-PLAN.md — Database schema + NotificationService core
- [x] 84-02-PLAN.md — Capacitor push plugin + FCM token lifecycle
- [x] 84-03-PLAN.md — Notification API routes + Fastify wiring
- [x] 84-04-PLAN.md — Cron jobs + event-driven notification triggers
- [x] 84-05-PLAN.md — Member notification preferences UI + permission banner
- [x] 84-06-PLAN.md — Admin Notificaciones page + sidebar
- [ ] 84-07-PLAN.md — Integration tests + CI/CD workflow updates
      **Success Criteria** (what must be TRUE):

1. Push notifications delivered to Android (and iOS when applicable) via Capacitor push plugin
2. Backend notification scheduler can send notifications to individual members or segments
3. Different notification templates per segment (re-engagement for at-risk, progression for regulars, etc.)
4. User notification preferences accessible in profile settings (opt-in/out per category)
5. Notification delivery tracked (sent, received, opened — for future optimization)
6. Check-in questions via push: post-training soreness question, morning energy question (from Phase 82 deferred ideas)

---

### Phase 85: Guía — Exercise & Mobility Library

**Goal**: Rename "Conceptos" to "Guía" and transform it into a categorized exercise/mobility library with videos, filterable by type (fuerza, movilidad, técnica), effort (CON/EXC/ISO), and body area. Integrates with check-in soreness: selecting pain in a body area links directly to relevant mobility exercises.
**Depends on**: Phase 82 (soreness check-in data feeds into recommendations)
**Requirements**: TBD
**Success Criteria** (what must be TRUE):

1. "Conceptos" renamed to "Guía" throughout the app
2. Exercises categorized by type (fuerza, movilidad, técnica), effort, and body area
3. Each exercise has a video (reuses existing video infrastructure)
4. Soreness check-in with body area → deep link to Guía → filtered mobility exercises for that area
5. Content browsable independently (not only triggered by check-in)

---

### Phase 86: QR Promo — Free Month Campaign

**Goal**: Build a QR-based promo code system for time-limited free month campaigns. Two initial codes for BCN inauguration and Aura Club first event auto-assign an online-only free subscription on registration.
**Depends on**: Phase 84 (push notifications for promo follow-up)
**Requirements**: QR-01, QR-02, QR-03, QR-04, QR-05, QR-06, QR-07, QR-08, QR-09, QR-10, QR-11
**Plans:** 6 plans

Plans:

- [x] 86-01-PLAN.md — Promo schema + migration + seed + registration promo flow
- [x] 86-02-PLAN.md — QR redirects in Nuxt + QR PNG generation
- [x] 86-03-PLAN.md — Member app UI adjustments (tabs, RestDayCard, upsell badge)
- [x] 86-04-PLAN.md — Registration page promo support (badge, title, existing user handling)
- [x] 86-05-PLAN.md — Admin promo CRUD API + Promos tab in PlanesPage
- [ ] 86-06-PLAN.md — Integration tests for promo registration + admin promo CRUD

**Success Criteria** (what must be TRUE):

1. QR code generated pointing to stable redirect URLs (eltemplo.org/qr/bcn, eltemplo.org/qr/aura-club)
2. Redirects resolve to member app registration with promo code in URL
3. New users registering with promo code receive free 30-day online subscription automatically
4. Existing users scanning QR see "Ya tenes cuenta" with login link
5. Admin can view, create, and disable promo plans with redemption counts
6. Online users see Reservas tab with empty state and upsell badge on Mi Templo

---

### Phase 87: Localization — Spain vs Argentina Copywriting

**Goal**: Introduce a localization layer so UI text adapts to the user's region (voseo/tuteo, vocabulary differences). Argentina users see voseo ("mirá", "asegurá", "elegí"), Spain users see tuteo ("mira", "asegura", "elige"). Covers all user-facing strings in the member app.
**Depends on**: None (can run in parallel with other phases)
**Requirements**: L10N-01, L10N-02, L10N-03, L10N-04
**Plans:** TBD

**Success Criteria** (what must be TRUE):

1. A locale/region setting exists per user (defaulting to Argentina for existing users)
2. All user-facing strings in el-templo-app go through a localization layer (vue-i18n or lightweight equivalent)
3. Argentina locale uses voseo conjugation and rioplatense vocabulary throughout
4. Spain locale uses tuteo conjugation and peninsular vocabulary throughout
5. Admin app is unaffected (internal tool, single locale)
6. New strings added by future features automatically require both locale variants

---

### Phase 88: Reservation Rules — Per-Plan Booking Configuration

**Goal**: Make reservation timing rules configurable per plan instead of hardcoded. Currently: 5-min booking cutoff, 20-min cancel cutoff, and current-week-only window are the same for all plans. This phase adds per-plan config for advance booking days, booking cutoff, and cancel cutoff — so premium plans can book further ahead and cheaper plans stay restricted.
**Depends on**: None
**Requirements**: RES-01, RES-02, RES-03, RES-04
**Plans:** TBD

**Current behavior (all hardcoded in `booking-service.ts`):**

- Booking window: current week only (Mon-Sat) — no cross-week advance booking
- Booking cutoff: 5 minutes before class start
- Cancel cutoff: 20 minutes before class start
- `bookingMode` (fixed/flexible) only controls slot assignment, not timing rules

**Open questions for discuss:**

- What advance booking window per plan tier? (e.g., flex=current week, foundation=next week, performance=2 weeks?)
- Should booking/cancel cutoff times vary per plan or stay global?
- Should online plans have any reservation rules or remain exempt?
- Any special rules for ROM/SKILLS sessions vs regular?

**Success Criteria** (what must be TRUE):

1. Subscription plans have configurable advance booking days (how far ahead a member can reserve)
2. Subscription plans have configurable booking cutoff (minutes before class)
3. Subscription plans have configurable cancel cutoff (minutes before class)
4. Booking service reads these values from the plan instead of hardcoded constants
5. Admin can edit these values per plan in the Plans management page
6. Member app respects the per-plan rules in the reservations flow
7. Existing plans migrate with current defaults (7 days advance, 5-min book, 20-min cancel)

---

## v4.4 Progress

**Execution Order:**
Phase 78 (Onboarding) → Phase 79 (Segmentation) + Phase 81 (Streaks, parallel) → Phase 80 (Tu Día) → Phase 82 (Check-ins) → Phase 83 (Upsells) → Phase 84 (Push Notifications)

| Phase                                   | Plans Complete  | Status   | Completed  |
| --------------------------------------- | --------------- | -------- | ---------- |
| 78. Onboarding & User Profiling         | 2/3 (3 dropped) | Complete | 2026-04-07 |
| 79. Behavioral Segmentation             | —               | Planned  | —          |
| 80. "Tu Día" Daily Game Plan            | 2/3 (3 dropped) | Complete | 2026-04-07 |
| 81. Streaks & Engagement Mechanics      | 1/2 (2 dropped) | Complete | 2026-04-07 |
| 82. Progressive Profiling & Check-ins   | 2/3 (3 dropped) | Complete | 2026-04-07 |
| 83. Micro-Program Upsells               | 4/5             | Complete | 2026-03-25 |
| 84. Push Notifications Foundation       | 6/7             | Complete | 2026-03-26 |
| 85. Guía — Exercise & Mobility Library  | —               | Planned  | —          |
| 86. QR Promo — Free Month Campaign      | 6/6             | Complete | 2026-03-28 |
| 87. Localization — ES-AR vs ES-ES       | —               | Planned  | —          |
| 88. Reservation Rules — Per-Plan Config | 3/4             | Complete | 2026-04-03 |

_v4.4 phases added: 2026-03-23 — 7 phases (78-84), 24 requirements mapped (ENG-01 through ENG-24). Research: `.planning/research/app-engagement-upselling-research.md`_

</details>

<details>
<summary>v4.5 Planes Online — Digital Monetization (Phases 89-91)</summary>

## v4.5 Overview

Monetize the app ecosystem by selling training plans online. Strategy doc: `.docs/planes-online-strategy.md`

## v4.5 Phases

### Phase 89: Backend & Admin — "Planes Online" Infrastructure

**Goal:** Full code+DB rename personalizada→goalPlan, replace boolean flags with planCategory enum, restructure admin Planes page (Presenciales/Online/Promos tabs), add weekly price calculation, refine session pipeline using approved production data, verify online user session access.

**Depends on:** Phase 83, Phase 84

**Requirements:**

- MON-01: Admin tab renamed to Planes Online with sub-categories
- MON-02: User-facing rename personalizadas→Por Objetivos, Personalizado reserved for coach-assisted
- MON-03: Plan creation with all needed fields (name, description, duration, sessions/week, monthly price, category, audience tags)
- MON-04: Weekly price auto-calculated and displayed
- MON-05: WhatsApp CTA with pre-filled plan name and weekly price
- MON-06: Pipeline difficulty calibration using approved session baselines
- MON-07: Pipeline prescription calibration using approved reps/sets patterns
- MON-08: Goal plan pipeline generates correctly for front_lever and tren_inferior for online users
- MON-09: Regular plans link to regular weekly sessions (same as physical branches)
- MON-10: Discount via manual price override at assignment (existing infra)

Plans:

- [x] 89-01-PLAN.md — Database migration: full rename + plan_category enum
- [x] 89-02-PLAN.md — API codebase rename: modules, types, routes, services
- [x] 89-03-PLAN.md — Admin UI restructure: Planes page tabs, Programas page
- [x] 89-04-PLAN.md — Plan creation flow: form fields, linked programs, weekly price
- [x] 89-05-PLAN.md — Session pipeline calibration: difficulty/prescription from production data
- [x] 89-06-PLAN.md — Session access gates: online user verification, auto-enrollment on assign
- [x] 89-07-PLAN.md — Pipeline calibration: Ladder/Pyramid format reps from production patterns
- [x] Admin dual subscription support: planCategory in SubscriptionDetail, GET /subscriptions (plural) endpoint, Agregar Programa button in admin alumnos subscription tab, SubscriptionCard component, AssignPlanDialog categoryFilter prop

---

### Phase 90: Onboarding Quiz Redesign & Avatar Profiling

**Goal:** Redesign the 4-question onboarding quiz into a 5-question avatar profiling system that segments users into 11 avatars (A-K), routes them to the correct program (Step 0/1/2), and captures pain points for upsell intelligence. Gender comes from registration — quiz asks age range, training background, goal (gender-conditional options), blocker/pain point, and training frequency.

**Depends on:** Phase 89

**Requirements:**

- AVA-01: Replace current 4 quiz questions with new 5-question flow (age range, training background, goal, blocker, frequency)
- AVA-02: Q3 (goal) shows gender-conditional options — women see piernas_gluteos/cuerpo_firme, men see cero_atleta/skill, 41+ sees longevidad
- AVA-03: DB migration: add ageRange, trainingBackground, painPoint, trainingFrequency, avatarType columns to member_profiles
- AVA-04: Avatar resolution service: compute avatarType (A-K) from gender + quiz answers using mapping rules
- AVA-05: Backward compat: existing users keep old profile data, new fields nullable, no re-onboarding (D-12/D-13)
- AVA-06: Post-quiz screen: "Tu programa sugerido" recommendation based on avatar → Step mapping
- AVA-07: Admin visibility: avatar type shown in member detail, filterable in member list
- AVA-08: Update onboarding analytics events for new question types

**Plans:** 3 plans

Plans:

- [x] 90-01-PLAN.md — API: Schema migration (5 new columns + nullable old columns), avatar resolution service, updated onboarding endpoints, gender in /me, integration tests
- [ ] 90-02-PLAN.md — Member App: 5-question quiz types/composable, OnboardingPage 7-step state machine, gender-filtered Q3, OnboardingRecommendation screen
- [x] 90-03-PLAN.md — Admin: avatarType in member list/detail API, avatar badge on detail page, avatar filter on members list

---

### Phase 91: App UX — Plan Catalog & Purchase Flow

**Goal:** Redesign member app plans page with weekly pricing, pre-filled WhatsApp CTAs, post-assignment experience for online buyers. Leverage avatar data from Phase 90 for personalized plan recommendations.

**Depends on:** Phase 90

Plans:

- [ ] 91-01-PLAN.md — TBD
- [ ] 91-02-PLAN.md — TBD

---

### Phase 92: Marketing Deliverables — Launch Collateral

**Goal:** Non-code marketing assets: ad copy mapped to avatar pain points, promo video script, content calendar, WhatsApp templates, Mercado Pago guide.

**Depends on:** Phase 91

Plans:

- [ ] 92-01-PLAN.md — TBD

---

## v4.5 Progress

| Phase                                           | Plans Complete       | Status      | Completed  |
| ----------------------------------------------- | -------------------- | ----------- | ---------- |
| 89. Backend & Admin — Planes Online Infra       | 7/7 + admin dual sub | Complete    | 2026-04-05 |
| 90. Onboarding Quiz Redesign & Avatar Profiling | 2/3                  | In Progress |            |
| 91. App UX — Plan Catalog & Purchase Flow       | —                    | Planned     | —          |
| 92. Marketing Deliverables — Launch Collateral  | —                    | Planned     | —          |

_v4.5 phases added: 2026-04-03 — 4 phases (89-92). Strategy: `.docs/planes-online-strategy.md`_

</details>

<details>
<summary>v4.6 iOS App Store Launch (Phases 93-95)</summary>

## v4.6 Overview

Get the member app published on the Apple App Store. The app already runs as a Capacitor hybrid app with an iOS project scaffolded (`src-capacitor/ios/`). No Mac available locally — all builds go through GitHub Actions with macOS runners. Reuses Play Store assets (descriptions, privacy policy, screenshots) where possible.

**Source:** Existing Capacitor iOS project in `src-capacitor/ios/`, Android build workflows in `.github/workflows/`

## v4.6 Phases

### Phase 93: iOS Build Pipeline (GitHub Actions)

**Goal**: Set up a GitHub Actions workflow on a macOS runner that builds the Capacitor iOS project, signs it with Apple certificates/provisioning profiles stored as GitHub Secrets, and uploads the signed IPA to App Store Connect
**Depends on**: v4.3 Phase 74 (Capacitor aligned), Phase 75 (GitHub Actions patterns established)
**Requirements**: IOS-01, IOS-02, IOS-03, IOS-04, IOS-05
**Success Criteria** (what must be TRUE):

1. Apple Distribution certificate and App Store provisioning profile created and stored as GitHub Secrets
2. GitHub Actions workflow `build-ios-production.yml` runs on `workflow_dispatch` with macOS runner
3. Workflow builds Quasar → syncs to Capacitor iOS → archives via xcodebuild → produces signed IPA
4. Signed IPA/archive uploaded to App Store Connect automatically (Fastlane deliver or altool)
5. Build version/number management strategy documented and implemented (mirrors Android approach)

**Plans:** 2 plans

Plans:

- [ ] 93-01-PLAN.md — Xcode project signing config + version management + SECRETS.md iOS docs
- [ ] 93-02-PLAN.md — Production iOS build workflow + end-to-end verification

---

### Phase 94: App Store Connect Setup & Listing

**Goal**: Create the app in App Store Connect, fill all required metadata (descriptions, screenshots, privacy policy, age rating), and complete all compliance requirements
**Depends on**: Phase 93 (need a build uploaded to proceed with review)
**Requirements**: IOS-06, IOS-07, IOS-08, IOS-09, IOS-10, IOS-11
**Success Criteria** (what must be TRUE):

1. Bundle ID `com.eltemplo.app` registered in Apple Developer portal with Push Notifications capability enabled
2. App created in App Store Connect with correct name, primary language (Spanish), SKU
3. Store listing has: app name, subtitle, description, keywords, screenshots (6.7" + 6.5" iPhone minimum), app icon
4. Privacy policy URL linked (reuse existing from Play Store)
5. Age rating questionnaire completed
6. App Review contact info and demo account credentials configured

---

### Phase 95: TestFlight & App Store Submission

**Goal**: Distribute build via TestFlight for internal testing, validate on real iOS devices, then submit for App Store review — app is live on the App Store
**Depends on**: Phase 93 (signed build), Phase 94 (listing complete)
**Requirements**: IOS-12, IOS-13, IOS-14, IOS-15
**Success Criteria** (what must be TRUE):

1. Build available on TestFlight for internal testers
2. App installed from TestFlight on at least 2 real iOS devices
3. Core flows verified on real devices: login, view training, complete a session, view Mi Templo
4. Push notifications working on iOS (APNs key uploaded to Firebase, FCM→APNs bridge verified)
5. No critical crashes in TestFlight feedback or Sentry
6. App submitted for App Store review with all metadata complete
7. App approved and live on the App Store
8. **Before April 28, 2026**: Update GitHub Actions iOS workflow to use Xcode 26 / iOS 26 SDK (ITMS-90725 warning — current build uses iOS 18.5 SDK, which will be rejected after that date)

---

## v4.6 Progress

**Execution Order:**
Phase 93 (iOS Build Pipeline) → Phase 94 (App Store Listing) → Phase 95 (TestFlight & Launch)

| Phase                                 | Plans Complete | Status  | Completed |
| ------------------------------------- | -------------- | ------- | --------- |
| 93. iOS Build Pipeline                | —              | Planned | —         |
| 94. App Store Connect Setup & Listing | —              | Planned | —         |
| 95. TestFlight & App Store Submission | —              | Planned | —         |

---

_v4.6 phases added: 2026-04-07 — 3 phases (93-95), 15 requirements mapped (IOS-01 through IOS-15)_

</details>

<details>
<summary>v4.7 Full Body & ROM — Coach Session Requests (Phases 96-97)</summary>

## v4.7 Overview

Two coach-driven session system enhancements:

1. **Full Body** goal plan type under "Por Objetivos" for home calisthenics with no equipment. Introduce equipment tagging on exercises, with a coach-driven auto-tagging workflow during goal plan session editing — Nach's curation process becomes the data enrichment mechanism.
2. **ROM Mode** — Saturday mobility sessions replacing regular SPOM training. Three body-zone blocks (Lower/Core/Upper), two tiers (Básico=alfa / Avanzado=delta), pure mobility exercises. Coach builds sessions via existing edit interface.

**Origin:** Coach requests (Nach, 2026-04-08) — Full Body for no-equipment home programs; ROM Mode for Saturday mobility classes.

## v4.7 Phases

### Phase 96: Full Body Goal Plan Type & Exercise Equipment Tagging

**Goal**: Add `full_body` as a new goal plan type using all available routes, add an `equipment` enum column to exercises, expose it in admin, and build an auto-tagging splash during full_body session editing so coaches organically enrich exercise equipment data as they curate sessions
**Depends on**: Phase 89 (Online Plans infra)
**Success Criteria** (what must be TRUE):

1. `full_body` exists as a goalPlanType with all 24 routes, tier `principiante`, and proper metadata (name, description, zones, idealFor)
2. Exercises table has `equipment` column — enum: `barras`, `anillas`, `paralelas`, `cajon`, `ninguno` — nullable (NULL = untagged)
3. Migration SQL generated and committed
4. Admin exercises page shows `equipment` as an inline-editable dropdown (consistent with existing effort dropdown pattern)
5. Admin goal plan session editing: when goalPlanType is `full_body`, on session save/approve a confirmation splash lists all exercises in the session and offers to tag them as `ninguno` (no equipment)
6. Confirming the splash bulk-updates the exercises' `equipment` field in the database
7. Program and subscription plan can be created in admin with `goalPlanType = 'full_body'`

**Plans:** 2 plans

Plans:

- [ ] 096-01-PLAN.md — API: full_body goal plan type (types, constants, schema validation) + exercises equipment column + migration + bulk-update endpoint
- [ ] 096-02-PLAN.md — Admin: full_body in admin types, ExercisesPage equipment dropdown, SessionEditPage auto-tagging splash

---

### Phase 97: ROM Mode — Saturday Mobility Sessions

**Goal**: Modify the session pipeline and admin editing flow so Saturdays produce ROM-mode sessions: two tiers (alfa=Básico, delta=Avanzado), three NUCLEUS-type blocks (ROM_LOWER, ROM_CORE, ROM_UPPER) with mobility exercises, simple round-based format. Coach refines via existing edit interface.
**Depends on**: None (uses existing session infrastructure)
**Success Criteria** (what must be TRUE):

1. `sessions` table has `session_mode` column — `'regular'` (default) or `'rom'`
2. Migration SQL generated and committed
3. Session generation for `day = 'sabado'` produces ROM sessions: only `alfa_delta` level group, blocks INITIUM + ROM_LOWER + ROM_CORE + ROM_UPPER
4. ROM generator selects mobility exercises using `mobility_related` mapping: `LS (LUNGES)` → ROM_LOWER, `FL + TTB/HF + MN` → ROM_CORE, `PL` → ROM_UPPER
5. ROM blocks use a simple round-based format (For Quality X3 or similar)
6. Admin SessionsPage displays ROM sessions correctly for Saturday (2 levels instead of 4, ROM block labels)
7. Admin SessionEditPage: exercise swap for ROM blocks shows full mobility pool (no route filtering), coach can swap freely
8. PDF generation detects `session_mode = 'rom'` and renders 2-tier layout (Básico/Avanzado) with LOWER/CORE/UPPER block headers
9. Member app detects `session_mode = 'rom'` and shows ROM layout: 3 blocks (no Deuteros selector), 2 tiers
10. No ATHLOS/EPIKOS blocks generated for ROM sessions
11. Existing regular sessions (Mon-Fri) unaffected

**Plans:** 3 plans

Plans:

- [x] 97-01-PLAN.md — API foundation: schema (session_mode + day_modes), ROM generator, generateWeek integration, day-modes endpoint, member level mapping, exercise swap body-zone filtering
- [x] 97-02-PLAN.md — Admin UI: SessionsPage ROM display + day mode toggles, block editing (ROM headers, hidden mobility), exercise swap zone filtering, PDF 2-row stacked layout
- [x] 97-03-PLAN.md — Member app: frontend types + block colors, DayCard ROM badge + Movilidad subtitle, useSessionPlayer ROM flow (no Deuteros selector)

---

## v4.7 Progress

| Phase                                                     | Plans Complete | Status   | Completed  |
| --------------------------------------------------------- | -------------- | -------- | ---------- |
| 96. Full Body Goal Plan Type & Exercise Equipment Tagging | —              | Planned  | —          |
| 97. ROM Mode — Saturday Mobility Sessions                 | 3/3            | Complete | 2026-04-09 |

### Phase 98: Multi-currency and country-scoped plans

**Goal:** El Templo supports independent Argentina (ARS) and Spain (EUR) subscription plans with country- and currency-aware behavior across schema, server validation, admin UI, member app, and reports — owners can manage both countries, non-owner staff see only their country data, no cross-country or cross-currency assignment is possible.
**Requirements**: REQ-98-01, REQ-98-02, REQ-98-03, REQ-98-04, REQ-98-05, REQ-98-06, REQ-98-07, REQ-98-08, REQ-98-09, REQ-98-10, REQ-98-11
**Depends on:** Phase 97
**Plans:** 12 plans

Plans:

- [ ] 98-01-PLAN.md — Drizzle schema edits + manual migration 0091 SQL (ALTERs + AR/ARS backfill + 12 ES plan seeds)
- [ ] 98-02-PLAN.md — [BLOCKING] Apply migration 0091; create shared attachCountryScope preHandler + formatPrice utility (admin + member app)
- [ ] 98-03-PLAN.md — Register attachCountryScope on members, subscriptions (admin + member), payments, promo-plans, gladius plugins
- [ ] 98-04-PLAN.md — Cross-country guards in assignPlan/changePlan + cross-currency guard + currency inheritance in recordPayment
- [ ] 98-05-PLAN.md — Country-aware list endpoints (admin plans, member catalog, members list, promos, gladius) with additive response shape
- [ ] 98-06-PLAN.md — Reports + analytics service country filter + Moneda column in Excel exports
- [ ] 98-07-PLAN.md — PlanesPage owner country selector + PlanFormDialog country field + useSubscriptionsApi getPlans refactor
- [ ] 98-08-PLAN.md — MemberFormDialog, AssignPlanDialog, MemberSubscriptionTab, SubscriptionCard — branch-scoped plan pickers + formatPrice + D-17 error UX
- [ ] 98-09-PLAN.md — CajaPage, ReportesPage, AnaliticasPage, FinanzasTab — owner country selector + formatPrice + currency-aware totals
- [ ] 98-10-PLAN.md — Member app PlanesPage formatPrice migration with `?? ARS` fallback + audit of other price surfaces
- [ ] 98-11-PLAN.md — Integration tests: RBAC matrix, cross-country 400 guards, AR regression, REQ-98-11 additive shape
- [ ] 98-12-PLAN.md — [Manual UAT] Deployed iOS + Android forward-compat verification against staging + admin UI acceptance checks

---

### Phase 99: Member-Selectable Training Level

**Goal:** Let members train at any level (alfa → spartan) from a header dropdown. Data plumbing (level_at_completion column + ?level= query param) is already delivered (commit c8d0726b). This phase covers the member-facing UX, mid-session switch semantics, and downstream effects on progression / ROM-day mapping / admin visibility. Coach remains the sole path for changing `users.level` itself.
**Requirements:** R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11 (see 99-SPEC.md)
**Depends on:** Phase 97
**Plans:** 3 plans

Plans:

- [ ] 99-01-PLAN.md — Column rename migration 0091 (level_at_completion → session_level) + Drizzle/routes rename + admin GET /admin/members/:userId/session-levels endpoint + R9/R10/R11 integration tests
- [ ] 99-02-PLAN.md — Member app foundation: level-display module + dual-path useLevelSelectionStorage + useUserStore selection API (selectedLevel/activeLevel/setLevel/clearLevel/hydrateSelection/registerMidSessionGuard) + boot hydration + logout cleanup
- [ ] 99-03-PLAN.md — Member app UI: HeaderLevelDropdown component (replaces both badge instances in MainLayout) + ?level= injection in useWeekData & useGoalPlanApi + DayPlayer mid-session guard + admin AlumnoDetailPage chip row + human-verify checkpoint

### Phase 100: Games format, exercise route overhaul, and session editor route UX

**Goal:** Coaches can author sessions that include games-style warmup blocks with custom titles and games-route exercises, while the existing exercise route codes become easier to read across all surfaces via friendly Spanish display labels.
**Requirements**: SPEC-1 (games format), SPEC-2 (INITIUM custom_title), SPEC-3 (games route), SPEC-4 (Spanish route labels on PDF + member app + admin editor tooltip), SPEC-5 (session editor route picker with games + Spanish tooltip)
**Depends on:** Phase 99
**Plans:** 5 plans

Plans:

- [ ] 100-01-PLAN.md — Backend schema + migrations (0092 session_blocks.custom_title varchar(100) nullable, 0093 data-only insert games format row)
- [ ] 100-02-PLAN.md — Member app Spanish route-labels dictionary (31 entries) + routeNames.ts re-export
- [ ] 100-03-PLAN.md — Admin API wiring: EditService.updateCustomTitle + PATCH endpoint + JSON schema + integration tests (games format, route=games, custom_title round-trip)
- [ ] 100-04-PLAN.md — Admin session editor: route-labels.ts (admin copy) + games in createRouteOptions + games in FormatParamsEditor defaultsMap + INITIUM custom_title input wired via PATCH + route tooltips in EditableBlockCard/EditableExerciseRow
- [ ] 100-05-PLAN.md — Admin PDF: PdfBlockPage.customTitle + session-data-transformer propagation + conditional INITIUM subtitle + Spanish route labels on grid pages (byte-identical null-customTitle fallback)

### Phase 101: Debt tracking — flag members with outstanding debt

**Goal:** Admins can flag members as debtors with an amount, currency, and free-form note; filter the alumnos list by debtors only; and see total debt grouped by currency. New `debts` table (userId, amount, currency, note, isCancelled, cancelledAt, timestamps) with one active debt per user enforced at service layer. Admin AlumnosPage filter bar is split into two rows (row 1: wider search + export/new buttons; row 2: existing selects + "Solo deudores" toggle). When toggle on: "Deuda total: ARS $X · USD $Y" banner + "Deuda" column per alumno. MemberFormDialog gets Deudor toggle + amount input + currency select + note textarea with placeholder "Aclarar de qué suscripción es la deuda (ej: debe $20000 de la mensualidad de abril)". GET /members extended with `debtorOnly` filter + `totalDebtByCurrency` response field respecting applied filters. Foundation for future accounting/payments integration — intentionally NOT integrated with payments table in this phase.
**Requirements**: CONTEXT.md D-01..D-17 (no mapped REQ-IDs; CONTEXT is authoritative)
**Depends on:** Phase 100
**Plans:** 3 plans

Plans:

- [ ] 101-01-PLAN.md — Drizzle schema debts.ts + migration 0094_debts_table.sql + apply via pnpm db:migrate (BLOCKING foundation)
- [ ] 101-02-PLAN.md — DebtService + extend GET /admin/members (debtorOnly + totalDebtByCurrency + per-row debt) + extend PUT /admin/members/:userId (upsert/cancel debt with ADMIN_ROLES RBAC) + integration tests
- [ ] 101-03-PLAN.md — Admin frontend: types/composable extension, MemberFormDialog Deuda section, AlumnosPage row-split filter bar + Solo deudores toggle + banner + column + UAT checkpoint

### Phase 102: Trial Classes (Sesiones de Prueba)

**Goal:** Allow admins to register potential members for a single free trial class with minimal friction, replacing the current WhatsApp-plus-Excel flow. A "lead" is a user record created via this flow (minimal data, no subscription, fixed password `eltemplo2026`) with exactly one booking marked `is_trial=true`. Trials do NOT consume class capacity (5/12 stays 5/12 when a trial is added). Conversion to a paying member happens via existing flows (edit dialog + Gestionar Plan) — no separate convert endpoint. One trial per phone enforced at create time.
**Requirements:** R1, R2, R3, R4, R5, R6, R7, R8, R9, R10 (see 102-SPEC.md)
**Depends on:** Phase 101
**Plans:** 5 plans

Scope:

- Backend: `bookings.is_trial BOOLEAN` column + migration; capacity/roster queries exclude trial bookings from counts
- Backend: `POST /api/admin/trials` — creates user (status implicit: minimal fields, no sub) + trial booking; one-trial-per-phone guard with clear error including previous trial date
- Admin UI: "Nueva Sesión de Prueba" button in SlotDetailDialog with minimal form (nombre + apellido + teléfono)
- Admin UI: SlotDetailDialog roster shows trials as a visually separated section with a "PRUEBA" badge, not counted in capacity
- Admin UI: "Clases de prueba" counter (0/1 or 1/1 usada) on alumno detail header, always visible
- Admin UI: Alumnos list "Leads" filter (inferred from `is_trial` booking + no active sub; lapsed members excluded)
- Coach marks attendance via existing check-in/force-check-in flow — no new endpoint
- Member app: no changes — leads inherit existing sub-less member UX
- Architectural choice: Option B (no `users.status` column); lead is inferred, not a first-class entity
- Out of scope: WhatsApp bot integration, lead expiry, conversion analytics dashboard, coach-specific admin view

Plans:

- [ ] 102-01-PLAN.md — Schema foundation: add bookings.is_trial column + migration 0097 (R1)
- [ ] 102-02-PLAN.md — Capacity excludes trials + POST /api/admin/scheduling/trials endpoint + integration tests (R2, R3, R4)
- [ ] 102-03-PLAN.md — Members API: hasUsedTrial field + status=leads filter + integration tests (R7, R8)
- [x] 102-04-PLAN.md — Admin UI: SlotDetailDialog trial button + NewTrialDialog form + roster split with PRUEBA badge (R5, R6, R9, R10)
- [ ] 102-05-PLAN.md — Admin UI: Clases de prueba counter on alumno detail + Leads filter on AlumnosPage (R7, R8)

### Phase 103: User Status Enum (freemium/prueba/activo/inactivo)

**Goal:** Materialize the user lifecycle as a `users.status` enum (`freemium` | `prueba` | `activo` | `inactivo`), maintained automatically by subscription create/cancel transitions and by the trial-creation endpoint; in the same change, split the operational staff-disable flag into its own `users.staff_disabled` column and remove the legacy `users.is_active` column. Reverses Phase 102's Option B decision now that the trial flow is shipped and the friction of a derived "lead" concept is visible in the UI and call sites; adds the `freemium` state in anticipation of fase 89-91 (Planes Online).
**Requirements:** R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12 (see 103-SPEC.md)
**Depends on:** Phase 102
**Plans:** 7 plans

Scope:

- Schema: add `users.status` enum (4 values) + `users.staff_disabled`, drop `users.is_active`, drop `idx_users_is_active`, add `idx_users_status` (single migration)
- Data migration: 3 sequential idempotent UPDATEs (activo if active sub → prueba if trial booking → freemium if branch=ONLINE else inactivo; legacy is_active=FALSE overrides to inactivo); staff_disabled = NOT is_active for non-members
- Subscription service: new helper `recomputeUserStatus(userId, tx)` (replaces `markConvertedIfLead`), called from every sub-mutating method inside the same DB transaction; sets both `status` and `converted_at`
- Member creation: DB default `status='freemium'`; `/api/admin/trials` overrides to `prueba`; subscription creation auto-flips to `activo`
- Members API: `status` filter renamed to 4-value enum; response includes `status` field; legacy `isActive` field removed
- Admin UI (AlumnosPage): single "Estado" dropdown (5 options including Todos) replaces `leadsOnly` and `isActive` toggles; row badge renders 4-state from `status`
- Admin UI (AlumnoDetailPage): header badge renders 4-state from `status`
- Admin UI (UsuariosPage + useUsersApi): staff toggle writes `staff_disabled`; payload field renamed to `disabled`
- Auth routes: replace `is_active` reads/writes with `deleted_at` (soft-delete) and `staff_disabled` (staff gate); auth payload no longer includes `isActive`
- Integration tests for every endpoint contract change and every auto-transition (incl. freemium→activo, activo→inactivo, never freemium→inactivo→freemium)
- Architectural choice: Option A (materialized status column), reverses Phase 102's Option B; rationale documented in 103-SPEC.md Background
- Out of scope: member-app UI changes (none needed), manual admin status override, reports refactor beyond R8/R10, status values beyond the 4-state enum, dual-write/shim during rollout, online-plans UX (deferred to fase 89-91)

Plans:

- [x] 103-01-PLAN.md — Schema migration + 6-stage backfill (R1, R2, R3, R4) — see 103-01-SUMMARY.md
- [x] 103-02-PLAN.md — recomputeUserStatus helper + transaction wrapping for 8 sub-mutating methods (R5, R6) — see 103-02-SUMMARY.md
- [x] 103-03-PLAN.md — Member-creation entry-point status defaults (freemium/prueba/null) (R7) — see 103-03-SUMMARY.md
- [x] 103-04-PLAN.md — Members API contract migration + analytics + SlotAttendancePanel (R8, R10) — see 103-04-SUMMARY.md
- [ ] 103-05-PLAN.md — AlumnosPage 5-option dropdown + AlumnoDetailPage badge + shared composable (R9, R10)
- [x] 103-06-PLAN.md — UsuariosPage staff toggle migration to staff_disabled (R11) — see 103-06-SUMMARY.md
- [x] 103-07-PLAN.md — Auth routes cleanup + new staff_disabled login gate (R12) — see 103-07-SUMMARY.md

### Phase 104: Planes vs Programas + Bundle "Todos los Programas"

**Goal:** Separar conceptualmente planes (presencial) de programas (virtuales) en el modelo de acceso. Introducir el bundle "Todos los Programas" como un `subscription_plan` con nueva columna `grantsAllPrograms` (boolean) y duración propia. Agregar `users.currentProgramEnrollmentId` (FK nullable) para resolver "qué programa está viendo hoy" cuando un usuario tiene múltiples enrollments activos (caso bundle). Gatear `/sessions/*` por tipo de dayId (presencial requiere plan `planCategory='presencial'`; programa requiere enrollment activo). En member app, agregar selector de programa en weekly view (con opción "Templo" si tiene plan presencial), permitir entrada al ícono Entrenar en usuarios online-only (no más bloqueo "Activá Tu Plan"), y reemplazar gating frágil de ReservasPage por `hasPresencialPlan`. Seed migration del nuevo plan bundle (online_regular, 30 días, $20.000 ARS, `grantsAllPrograms=true`).
**Requirements**: TBD (será refinado en SPEC)
**Depends on:** Phase 103
**Plans:** TBD

Out of scope:

- Aceleración de programas (descartado: era error de transcripción de "acceder")
- Progreso/badges/% completado (diferido al milestone AURA economy)
- Cambiar `bookingMode` a nullable (cambio de schema más grande, fuera de alcance)

Plans:

- [ ] TBD (run /gsd-plan-phase 104 to break down)

---

_v4.7 phases added: 2026-04-08 — 2 phases (96-97), origin: coach requests for no-equipment home programs and Saturday mobility classes_

_Phase 103 added: 2026-04-25 — origin: surfaced friction from Phase 102's derived-lead model once the trial flow shipped; reverts Option B and cleans the related `users.is_active` legacy in one atomic refactor_

_Phase 104 added: 2026-04-27 — origin: WhatsApp transcripts (.docs/WhatsApp Ptt 2026-04-27 13.30/13.33/13.43.\*) clarifying separation of planes presenciales vs programas virtuales, bundle "Todos los Programas" as upsell, and anti-piracy access control for online-only users_

</details>

<details>
<summary>v4.8 Modelo Financiero — Transactional Payments + Caja Refactor (Phases 105-109)</summary>

## v4.8 Overview

Reemplaza el modelo financiero actual (`payments` + `debts`) con un modelo transaccional unificado (`financial_transactions` + `transaction_links`) que cubre cobros parciales, saldos pendientes con trazabilidad, anulaciones consistentes, ajustes auditables, y reembolsos/señales en el modelo (UX dedicada de esos dos queda para v4.9+). La página de Caja se rehace sobre el modelo nuevo y refleja la realidad financiera real.

**Empezamos de cero**: las tablas `payments` y `debts` se descartan en Phase 105 sin backfill ni dual-write. No hay deudas activas que preservar.

**Out of scope este milestone:** Mercado Pago / Stripe (v6.x ecosistema), reembolsos como UX dedicada, señales/pagos anticipados como UX dedicada, cierre Z, conciliación bancaria, transferencias inter-miembros como concepto primario.

**Origin:** Pedido de operaciones (Maman, 2026-04-27) por incluir deuda al cargar membresía. Análisis profundo reveló que el requerimiento real es modelado transaccional, no UX puntual. Doc completo en `.planning/research/v48-financial-model-analysis.md`.

## v4.8 Phases

### Phase 105: Modelo de Datos + Drop del Viejo

**Goal:** Crear las tablas `financial_transactions` y `transaction_links` con su schema completo; eliminar las tablas `payments` y `debts` junto con todo el código asociado (módulos, services, types, tests, endpoints, sección "Deudor" del MemberFormDialog); enforced invariantes a nivel service layer (inmutabilidad post-creación, suma de allocated_amount = amount, integridad referencial de links).
**Depends on:** None (greenfield — empezamos de cero)
**Requirements:** TXN-01, TXN-02, TXN-03, TXN-04, TXN-05, TXN-06, TXN-07
**Success Criteria** (what must be TRUE):

1. Tabla `financial_transactions` existe con todos los campos y enums del schema definidos en REQUIREMENTS.md TXN-01
2. Tabla `transaction_links` (pivot) existe con UNIQUE(transaction_id, target_kind, target_id) e índice secundario por target
3. Migration SQL generada (manual, no `drizzle-kit generate` para evitar prompts) y committeada
4. Tablas `payments` y `debts` dropeadas en la misma migration
5. Código eliminado: módulo `payments/`, `debts-service.ts` y archivos relacionados, sección "Deuda" del `MemberFormDialog`, schema de payments y debts, endpoints viejos
6. Service layer (`TransactionService` o equivalente) enforced las 3 invariantes con tests unitarios pasando
7. `pnpm typecheck`, `pnpm lint`, y `pnpm test` pasan limpio (cero referencias colgadas a tablas viejas)
8. CI pasa end-to-end

**Plans:** 8 plans

Plans:

- [x] 105-01-PLAN.md — Schema files (financial_transactions, transaction_links, balances) + manual migration 0106 + [BLOCKING] db:migrate apply
- [x] 105-02-PLAN.md — Finance module (TransactionService + BalanceService) + integration tests for invariants/cache/UNIQUE
- [x] 105-03-PLAN.md — Swap PaymentService→TransactionService in subscriptions/service.ts (4 callsites) + auth/routes + subscriptions/routes + auto-resume-pauses job
- [x] 105-04-PLAN.md — Rewrite analytics/service.ts revenue queries + reports/service.ts queries against financial_transactions
- [x] 105-05-PLAN.md — Rewrite members/service.ts Solo-deudores filter against balances + clean members/routes/types/schemas of DebtService
- [x] 105-06-PLAN.md — Delete payments module + debts-service.ts + schema files + dead tests + dead composable; remove paymentRoutes from app.ts
- [x] 105-07-PLAN.md — Delete Deuda section from MemberFormDialog.vue + clean types/member.ts + verify AlumnosPage data flow
- [x] 105-08-PLAN.md — Final verification sweep (12 SPEC AC checks + typecheck/lint/test green + human smoke)

---

### Phase 106: Endpoints Transaccionales

**Goal:** Exponer endpoints REST para crear, anular, listar y leer transacciones financieras con RBAC adecuado. El service layer queda completamente usable desde el frontend.
**Depends on:** Phase 105
**Requirements:** API-01, API-02, API-03, API-04, API-05, API-06, API-07
**Success Criteria** (what must be TRUE):

1. `POST /transactions` crea transacción + N links atómicamente en una transacción DB
2. `POST /transactions/:id/void` requiere `reason` no vacío, marca campos de auditoría, revierte el efecto de los links sobre saldos derivados
3. `GET /members/:id/financial-history` retorna timeline cronológico ordenado por `transaction_date` desc
4. `GET /transactions` retorna lista paginada (`PaginatedResult<T>`) con filtros por branch, kind, fechas, member, payment_method, búsqueda por nombre
5. RBAC enforced: ajustes owner-only, void owner|admin, reads per `PAYMENT_READ_ROLES` con scope por sucursal
6. Tests de integración cubren happy path + casos de error (RBAC, validación, atomicidad)

**Plans:** 6 plans

Plans:

- [x] 106-01-PLAN.md — RBAC constants + service layer extensions (list/getFinancialHistory/getRowsForTransaction) + relocate PaginatedResult
- [x] 106-02-PLAN.md — POST /transactions + POST /transactions/:id/void (writes) + register financeRoutes in app.ts + integration tests (RBAC matrix, country guards)
- [x] 106-03-PLAN.md — GET /transactions (paginated list) + GET /transactions/summary (CajaPage legacy summary) + integration tests
- [x] 106-04-PLAN.md — GET /members/:id/financial-history mounted in members/routes.ts (D-04 coach privacy override) + integration tests
- [x] 106-05-PLAN.md — Frontend admin migration: useTransactionsApi + transaction.ts types + CajaPage.vue swap; delete legacy usePaymentsApi + payment.ts (closes prod 404s — D-14)
- [x] 106-06-PLAN.md — End-of-phase verification + VERIFICATION.md + human-verify checkpoint

---

### Phase 107: Cobro al Asignar Plan

**Goal:** Reemplazar el flujo manual de carga de deuda por un formulario de cobro integrado al asignar/renovar plan. `AssignPlanDialog` gana sección "Cobro" y asignar plan con cobro parcial genera la transacción + link atómicamente. Cumple el pedido original de operaciones. (La sección "Deuda" del `MemberFormDialog` ya fue eliminada en Phase 105 — TXN-04.)
**Depends on:** Phase 106
**Requirements:** CHARGE-01, CHARGE-02, CHARGE-03
**Success Criteria** (what must be TRUE):

1. `AssignPlanDialog` muestra sección "Cobro" con monto, método de pago, fecha
2. Cuando monto recibido < `pricePaid`, el dialog muestra preview en vivo del saldo pendiente (ej.: "Saldo pendiente: $10.000 ARS")
3. Asignar plan + crear `financial_transaction` + crear `transaction_link` ocurre atómicamente; fallo en cualquier paso revierte todos
4. UAT operativo: admin carga membresía con cobro parcial, perfil del miembro refleja el saldo correctamente, CajaPage registra el cobro real

**Plans:** 6 plans

Plans:

- [x] 107-01-PLAN.md — TransactionService.create + BalanceService aceptan tx? opcional (Wave 1)
- [x] 107-02-PLAN.md — Subscriptions backend: types/schemas + helper recordAssignmentCharge + 4 callsites atómicos + log estructurado (Wave 2)
- [x] 107-03-PLAN.md — Integration tests charge-on-assign (happy/sad matrix + atomicity D-11) (Wave 3)
- [x] 107-04-PLAN.md — Frontend admin types: AssignPlanInput + RenewSubscriptionInput.amountReceived (Wave 1)
- [x] 107-05-PLAN.md — AssignPlanDialog UI: bloque Cobro en step Confirmar + banner + disabled + payload (Wave 2, has checkpoint)
- [x] 107-06-PLAN.md — VERIFICATION.md scaffold listo (smoke staging D-20 + sign-off prod D-21 pendientes de acción humana)

---

### Phase 108: Pago de Saldo + Historial Financiero

**Goal:** Permitir a admins registrar pagos contra saldos pendientes con split allocation, y proveer un tab de historial financiero en el perfil del miembro.
**Depends on:** Phase 106
**Requirements:** PAYMENT-01, PAYMENT-02, PAYMENT-03
**Success Criteria** (what must be TRUE):

1. Botón "Registrar pago" visible en `AlumnoDetailPage`
2. Dialog "Registrar pago" lista conceptos con saldo + antigüedad y permite split allocation con validación `Σ allocated = monto total`
3. Tab "Historial financiero" en perfil muestra timeline cronológico de transacciones con info de void cuando aplica
4. UAT: admin recibe pago de saldo, lo distribuye entre dos conceptos, ambos saldos reflejan el cambio correctamente; el cobro aparece en CajaPage del día

**Plans:** 6 plans

Plans:

- [x] 108-01-PLAN.md — Backend: GET /members/:id/outstanding-concepts endpoint + service + types + JSON Schema
- [x] 108-02-PLAN.md — Backend: integration tests (happy, debt_balance fallback, no-saldos, RBAC, cross-country)
- [x] 108-03-PLAN.md — Frontend: composable extension + types (OutstandingConcept, RegisterPaymentInput, FinancialHistoryItem)
- [x] 108-04-PLAN.md — Frontend: RegisterPaymentDialog (auto-FIFO + Σ validation) + AlumnoDetailPage button
- [x] 108-05-PLAN.md — Frontend: FinancialHistoryTab + VoidTransactionDialog + 6to tab Finanzas
- [x] 108-06-PLAN.md — VERIFICATION.md scaffold listo (smoke staging pendiente de acción humana)

---

### Phase 109: Caja v2 + Reportes

**Goal:** Actualizar `CajaPage` para reflejar el modelo transaccional con segmentación por `kind`, agregar reporte de aging de deudas pendientes, y actualizar exports Excel.
**Depends on:** Phase 107, Phase 108 (necesita data fluyendo end-to-end)
**Requirements:** CAJA-01, CAJA-02, CAJA-03, CAJA-04
**Success Criteria** (what must be TRUE):

1. `CajaPage` summary segmentado por `kind` (cobros de plan, saldos de deuda, ajustes, reembolsos) además del corte por método y sucursal
2. Tabla de `CajaPage` muestra columna `kind` + filtro por tipo de transacción
3. Reporte aging de deudas pendientes accesible desde `ReportesPage`, agrupable por sucursal, plan, antigüedad (0-30, 31-60, 61-90, 90+ días), miembro
4. Excel export del CajaPage y del aging report actualizado al modelo nuevo (kind, allocated amounts, target del link)
5. Sanity check end-to-end: ingreso del mes en summary = suma manual de inflows no anulados del mes en `financial_transactions`

**Plans:** 5 plans

Plans:

- [x] 109-01-PLAN.md — Backend: extender summary endpoint con revenueByKind (CAJA-01 backend)
- [x] 109-02-PLAN.md — Backend: nuevo endpoint outstanding-balances + aging buckets (CAJA-03 backend)
- [x] 109-03-PLAN.md — Admin: CajaPage segmentación por kind + filtro + columna + Excel (CAJA-01/02/04 frontend)
- [x] 109-04-PLAN.md — Admin: Reporte Deudas en ReportesPage (CAJA-03/04 frontend)
- [x] 109-05-PLAN.md — Sanity test cross-aggregation + VERIFICATION.md scaffold + smoke handoff

---

## v4.8 Progress

**Execution Order:**
Phase 105 (Data Model) → Phase 106 (API) → Phase 107 (Charge UX) ‖ Phase 108 (Payment UX) → Phase 109 (Caja v2)

| Phase                                     | Plans Complete | Status   | Completed  |
| ----------------------------------------- | -------------- | -------- | ---------- |
| 105. Modelo de Datos + Drop del Viejo     | 8/8            | Complete | 2026-04-28 |
| 106. Endpoints Transaccionales            | 6/6            | Complete | 2026-04-28 |
| 107. Cobro al Asignar Plan                | 6/6            | Complete | 2026-04-28 |
| 108. Pago de Saldo + Historial Financiero | 6/6            | Complete | 2026-04-28 |
| 109. Caja v2 + Reportes                   | 5/5            | Complete | 2026-04-29 |

### Phase 110: Admin users por país + multi-sede staff

**Goal:** Refactorizar el modelo de permisos del staff. admin/gestion/owner pasan a tener alcance por país (nueva columna `users.country` varchar(2)). coach/recepción pasan a multi-sede (nueva tabla `user_branches`). `users.branch_id` se mantiene NOT NULL para todos como sede personal de entrenamiento (la app de miembros sigue funcionando para staff). Staff hereda multisucursal por rol al usar la app de miembros (`canBookInBranch` permite cualquier sede si `role !== 'member'`). Templo Online (`branches.isVirtual=true`) accesible globalmente. Owner: bypass por rol. El hook `country-scope.ts` existente se extiende para leer `users.country` directamente (sin JOIN a branches) y agregar `branchIds` para coach/recepción.
**Requirements**: REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12 (locked in 110-SPEC.md)
**Depends on:** Phase 109
**Plans:** 9 plans

Plans:

- [x] 110-01-PLAN.md — Drizzle schema (users.country + user_branches) + migration 0107 SQL with atomic backfill
- [x] 110-02-PLAN.md — [BLOCKING] pnpm db:migrate run + test helpers cleanup
- [x] 110-03-PLAN.md — Extend country-scope.ts hook + create shared/branch-access.ts (canAccessBranch + requireBranchAccess + BRANCH_OUT_OF_SCOPE)
- [x] 110-04-PLAN.md — booking-service.ts staff multibranch bypass (REQ-8)
- [x] 110-05-PLAN.md — users service cardinality validation + atomic user_branches writes + types/schemas/routes extension
- [x] 110-06-PLAN.md — Apply requireBranchAccess to admin/finance/reports/scheduling/analytics/attendance routes + GET /admin/members/branches scope filter
- [x] 110-07-PLAN.md — Integration tests (test/branch-access.test.ts) — 15+ cases covering REQ-5..REQ-12
- [x] 110-08-PLAN.md — Admin UI: UsuariosPage form per role + useUsersApi types + single-seam audit
- [x] 110-09-PLAN.md — VERIFICATION.md scaffold + smoke + UAT prompts + decision matrix

---

### Phase 111: Salvaguardas operativas — validación plan↔branch, integridad financiera y detección de duplicados

**Goal:** Cerrar los agujeros operativos detectados en el caso Soledad Mailland (cuenta duplicada por autorregistro online → manual presencial; $65.000 cash linkeado a sub cancelada de usuario eliminado; 3 balances huérfanos). Tres salvaguardas a nivel sistema: (1) bloquear asignación de plan presencial sobre sede virtual con UX de conversión guiada en `AssignPlanDialog`, (2) bloquear cancelación de subscriptions con transactions activas para forzar void manual primero, (3) lookup de duplicados por DNI/teléfono normalizado al crear miembro/autorregistro que redirige al alumno existente sin modal. Cuarta tarea: discontinuar el botón de soft-delete del admin UI (los miembros inactivos quedan en `status='inactivo'`, sin borrar). Quinta tarea: tabla `audit_log` mínima para trazar cancel sub / void tx / plan assigned. Sexta: migración SQL idempotente que reconcilia los datos de Soledad (transaction_link 34 → sub 6382, cierre de balances huérfanos 14/16/20, cierre de program_enrollment 1125).
**Depends on:** Phase 110
**Plans:** 6 plans

Plans:

- [x] 111-01-PLAN.md — REQ-9 normalizePhone helper (backend + admin frontend mirror) + trim de firstName/lastName en members service (createMember + updateMember)
- [x] 111-02-PLAN.md — REQ-7 audit_log foundation: Drizzle schema + migration 0108 aplicada vía pnpm db:migrate + helper auditLog.write(tx, params) con test de atomicidad
- [x] 111-03-PLAN.md — REQ-1 + REQ-3 + REQ-7 backend wiring: assignPlan rechaza presencial+virtual; cancelSubscription bloquea con tx activas (estructurado 400); audit calls en cancelSubscription, TransactionService.void, assignPlan
- [x] 111-04-PLAN.md — REQ-4 + REQ-5 backend: endpoint GET /admin/members/check-duplicates + bloqueo de phone duplicado en /auth/register (409) + trim en autorregistro
- [x] 111-05-PLAN.md — REQ-2 + REQ-4 frontend + REQ-6 + D-27 admin UX: filtro presencial + banner CTA en AssignPlanDialog; lookup on-blur con submit disabled en MemberFormDialog; quitar botón Eliminar y reordenar badges en AlumnoDetailPage
- [x] 111-06-PLAN.md — REQ-8 reconcile migration 0109 (idempotente) + integration test + staging-first run + 111-VERIFICATION.md cubriendo REQ-1..REQ-9 y D-01..D-28

**Status:** Complete (2026-05-01) — reconcile de Soledad ejecutado en prod, datos verificados via SSH. Bonus out-of-scope: nginx retry config aplicada a api/api-staging para reducir 502s en futuras ventanas de pm2 restart.

---

_v4.8 added: 2026-04-27 — 5 phases (105-109), 24 requirements (TXN, API, CHARGE, PAYMENT, CAJA). Origin: requerimiento de operaciones por integrar deuda al cargar membresía; análisis reveló necesidad de modelo transaccional. Doc: `.planning/research/v48-financial-model-analysis.md`_

_Phase 105 SPEC (2026-04-27): absorbed CHARGE-04 (UI cleanup of MemberFormDialog "Deuda") into TXN-04 — atomic with table drop. Phase 107 reqs reduced from 4 to 3._

_Phase 111 added: 2026-05-01 — origen: investigación caso Soledad Mailland (autorregistro online → conversión presencial fallida → cuenta duplicada con cash huérfano). 3 causas raíz identificadas, consolidadas en 1 fase única reducida._

</details>

## v4.85 Overview

**Milestone:** v4.85 — Enrollment Service + Admin Add-ons
**Started:** 2026-05-04
**Phases:** 1 (112)
**Granularity:** coarse — single phase, structure surfaces during `/gsd-plan-phase 112`
**Coverage:** 24/24 requirements mapped (100%)
**Inserted between:** v4.8 (closed at 109; ad-hoc 110/111 included) and v4.9 (Refactor Splits, queued)

**Why this milestone first.** v4.9 plans to split `subscriptions/service.ts` (~3995 LOC). That split is materially harder while six `programEnrollments` inserts + `tearDownBundleEnrollments` (added in fase 111) remain dispersed across the file. v4.85 extracts `EnrollmentService` first, generalizes teardown, and lands the admin add-on feature on top of the clean abstraction — making v4.9 a mechanical move instead of a semantic refactor.

**Single-phase rationale.** The refactor (`EnrollmentService` extraction) and the feature (admin add-ons) are mutually justifying: the refactor alone has no user-facing payoff, the feature alone deepens the existing spaghetti. They ship together as one phase. Internal structure (schema → service → API → lifecycle hooks → UI) emerges as plans inside Phase 112 during `/gsd-plan-phase 112`.

**Decisiones arquitectónicas (recap).**

- **A** — Add-ons se transfieren automáticamente al cambiar de plan (sin recobrar).
- **C** — Add-ons se cancelan cuando muere la sub principal (sin refund automático).
- **A** — `pricePaid` se cobra como `financial_transaction` independiente al asignar (puede ser 0 = regalo).
- Bloqueo (no alerta) ante programa duplicado activo — admin debe cancelar el viejo primero.

## v4.85 Phases

- [ ] **Phase 112: Enrollment Service + Admin Add-ons** — Extract `EnrollmentService` centralizing the lifecycle of `program_enrollments` (replacing 6 dispersed inserts in `subscriptions/service.ts` + the fase-111 `tearDownBundleEnrollments`), add the four new columns + backfill, ship the admin add-on assignment endpoint with finance integration and lifecycle hooks (transfer on changePlan, teardown on cancel/expire), and add the admin UI section to manage add-ons in the member detail page. Internal structure surfaces as plans during `/gsd-plan-phase 112`.
- [x] **Phase 113: CRUD admin de Schedules y Activities** — Backend hardening (overlap validation branch+day, activity name uniqueness, cascade-block on deactivation con `affectedSchedules` payload) + frontend admin UI (tabs Horarios/Actividades en HorariosPage, CreateSlotDialog modal). Endpoints CRUD ya existían — esta fase los endurece y agrega UX. Slots inmutables: para cambiar horario = desactivar viejo + crear nuevo. Out of scope: branches CRUD, bloqueos puntuales, fix subs huérfanas. ✓ 14/14 must-haves verified.
- [x] **Phase 114: Reporte tabular de sesiones de prueba** — Reporte fila-por-fila (una fila por lead, post-revisión D-03) de sesiones de prueba en Reportes (admin), reemplazo del CSV manual. Columnas: Lead, Fecha, Hora, Sucursal, Asistió (auto desde attendance), Estado del Lead (enum manual: en_seguimiento/cerrado/perdido), Gestiona (admin que creó el trial — owner-only filter), Comentarios (texto libre con prefijo auto del plan al cerrar), Turno/Periodo/Semana (derivados). Filtros: sede, fecha, estado, asistió, turno, gestiona (owner-only), días sin convertir. Nuevos campos: `users.lead_status` enum nullable, `users.lead_notes` TEXT nullable, `users.created_by` FK users.id nullable (no bookings.created_by — revisado D-10/D-17). Hooks: lead_status='cerrado' + lead_notes prefijo en `recomputeUserStatus`; users.created_by seteado en `createTrialMember`. ✓ 7/7 must-haves verified (31/31 tests passing).

## v4.85 Phase Details

### Phase 112: Enrollment Service + Admin Add-ons

**Goal:** Centralize program enrollment lifecycle in a new `EnrollmentService` and ship admin-driven program add-ons with optional pricing. Refactor + feature ship together because each justifies the other: the refactor alone has no user-facing payoff, the feature alone deepens existing duplication. End state: a single service owns all `program_enrollments` writes/teardowns, admins can assign extra programs to members with optional cost via finance integration, and add-ons follow the parent subscription's lifecycle (transfer on plan change, cancel on sub cancel/expire) without code duplication.

**Depends on:** Nothing (fase 111 is closed; v4.8 finance module is in production)

**Requirements** (24/24, all v4.85 requirements):

- ENROLL-01..05 — `EnrollmentService` extraction and DI integration
- ADDON-SCHEMA-01..05 — `program_enrollments` columns + migration backfill
- ADDON-API-01..06 — `POST /api/admin/users/:userId/program-addons` + finance + cancel
- ADDON-LIFE-01..04 — changePlan transfer + cancel/expire teardown for add-ons
- ADDON-ADMIN-UI-01..05 — "Programas" section in member detail page
- ADDON-MEMBER-UI-01..02 — verify member-app dropdown lists all enrollments

**Success Criteria** (what must be TRUE at phase completion):

1. **Schema in place.** `program_enrollments` has new columns `source` (NOT NULL enum `plan_linked` | `plan_bundle` | `admin_addon`), `price_paid` (nullable int), `assigned_by` (nullable FK `users.id`), `subscription_id` (nullable FK `subscriptions.id`); legacy rows backfilled deterministically (plan→source rule), migration idempotent and applied via `_migrations` runner.
2. **Single service owns enrollment lifecycle.** `grep -nE "(insert|update).*programEnrollments"` in `subscriptions/service.ts` returns zero hits — all 6 legacy inline mutations + fase-111 `tearDownBundleEnrollments` route through `EnrollmentService` (`enrollFromPlan`, `enrollAddon`, `tearDownForSubscription`, `transferAddons`). Service accepts optional `tx?` for atomicity, lives in `src/modules/programs/`, injected into `SubscriptionService` by constructor (DI pattern from fase 56). All fase 111 integration tests pass unmodified.
3. **Admin add-on endpoint works end-to-end.** `POST /api/admin/users/:userId/program-addons` creates an active `admin_addon` enrollment linked to the member's active subscription. `pricePaid > 0` writes a `financial_transaction` (v4.8 finance) + `transaction_links` row atomically with the enrollment; `pricePaid = 0`/null skips finance. HTTP 400 if no active sub, HTTP 409 if program duplicate active. Admin/owner can cancel an add-on individually with audit log entry.
4. **Lifecycle hooks honor decisions A and C.** `changePlanNow` and `changePlanAfterCurrent` (on scheduled successor activation) transfer active add-ons' `subscription_id` to the new sub atomically — no re-charge (A). Cancel/expire of any subscription cancels its linked add-ons via `tearDownForSubscription` — no auto-refund (C). Plan change with zero active add-ons is a clean no-op.
5. **Admin UI ships the management surface.** Member detail page in `el-templo-admin` shows "Programas" section listing all active enrollments with `incluido en plan` / `add-on` badges. Add-on rows display `pricePaid`, assigned date, assigning admin. "Asignar programa adicional" modal: program dropdown (excluding already-enrolled), optional price (default 0), notes; submits to the new endpoint, list updates without manual refresh. Per-row cancel with confirmation. Backend errors render with actionable Spanish copy ("Asignar plan primero", "Cancelar la inscripción existente primero").
6. **Member-app dropdown verified.** Member home program dropdown lists all active enrollments (linked + add-on) with no visual distinction; selection drives the weekly view. Verification via integration test + manual staging check; ship code adjustments only if a gap is found (expected: zero code changes, the bundle pattern from fase 104 should cover it).

**Plans:** 6 plans

- [x] 112-01-PLAN.md — Schema migration: 4 columns + paused enum + backfill (ADDON-SCHEMA-01..05)
- [x] 112-02-PLAN.md — EnrollmentService extraction (refactor only, no behavior change) (ENROLL-01..05)
- [x] 112-03-PLAN.md — Lifecycle hooks: pause/resume/transferAddons + integration tests (ADDON-LIFE-01..04)
- [x] 112-04-PLAN.md — Admin add-on API + finance integration + audit log (ADDON-API-01..06)
- [ ] 112-05-PLAN.md — Admin frontend "Programas" tab + assign modal (ADDON-ADMIN-UI-01..05)
- [ ] 112-06-PLAN.md — Member-app dropdown verification + integration test (ADDON-MEMBER-UI-01..02)
      **UI hint:** yes (admin frontend changes; member frontend verification only)

## v4.85 Progress

| Phase                                      | Plans Complete | Status      | Completed  |
| ------------------------------------------ | -------------- | ----------- | ---------- |
| 112. Enrollment Service + Admin Add-ons    | 1/6            | In progress | -          |
| 114. Reporte tabular de sesiones de prueba | 7/7            | Complete    | 2026-05-12 |

_Plan counts populated by `/gsd-plan-phase 112`._

### Phase 113: CRUD admin de Schedules y Activities

**Goal:** Habilitar al admin a gestionar el catálogo de horarios y actividades sin intervención manual de DB. Crear nuevos slots desde admin (con validación de overlap), CRUD completo de Activities (crear/editar/desactivar con cascade-block). Slots inmutables una vez creados (D-07): para cambiar horario, desactivar viejo + crear nuevo.

**Depends on:** Nothing (independiente de fase 112)

**Disparador:** El slot 10:00-11:00 de Constitución (Lun-Vie) quedó activo en DB después de cerrarse hace meses por baja demanda. Se desactivó vía migración 0118 (commit f2792abd, branch `fix/deactivate-constitucion-10am`). Esta fase elimina la necesidad futura de migraciones one-off para cambios operativos.

**Out of scope:**

- Branches CRUD (no requerido v1)
- Bloqueos puntuales por slot+fecha (cubierto por toggle existente: desactivar/reactivar slot completo)
- Editar `start_time`/`end_time`/`day_of_week` de slots existentes (D-07: slots inmutables; flujo = desactivar + crear nuevo)
- Fix de subs "huérfanas" en slots inactivos: verificado empíricamente que el modelo es coherente — subs fijas tienen `classes_remaining=NULL` y no pierden créditos en no-show; subs flex pierden crédito al reservar+no ir, lo cual es intencional

**Requirements**: D-01..D-20 (locked en 113-CONTEXT.md)

**Plans:** 2 plans

Plans:

- [x] 113-01-PLAN.md — Backend: overlap validation en createSchedule + activity name uniqueness + cascade-block on deactivation + integration tests (D-10/11/12/13/14/16)
- [x] 113-02-PLAN.md — Frontend admin: CreateSlotDialog + tabs Horarios/Actividades en HorariosPage + cascade-error UX (D-17/18/19/20)

### Phase 114: Reporte tabular de sesiones de prueba

**Goal:** Reemplazar el CSV manual `.docs/Sesiones de Prueba - SP - Base de datos.csv` por un reporte tabular en el módulo Reportes del admin, alimentado automáticamente con la data que ya capturamos al crear trials y al asignar planes. Permite al equipo de gestión filtrar/auditar leads sin mantener una planilla a mano.

**Depends on:** Nothing (independiente de fase 112; usa schema existente de bookings/users + módulo reports actual)

**Disparador:** Hoy una persona mantiene a mano la planilla de Google Sheets con todas las sesiones de prueba (3500+ filas históricas). Toda la data ya vive en la DB (bookings is_trial=1, attendance, subscriptions, branches), salvo el estado del lead (Cerrado/Perdido/En seguimiento), los comentarios y el campo "Gestiona". Esta fase cierra ese gap con tres columnas nuevas + UI.

**Columnas finales del reporte (11):** Lead, Fecha, Hora, Sucursal, Asistió, Estado del Lead, Gestiona, Comentarios, Turno, Periodo, Semana.

**Columnas descartadas del CSV original:** Rep., Asistió post rep., Asistencia Final (vacías en la práctica), Profe 1, Profe 2 (no trackeamos coach por clase).

**Decisiones de diseño (recap discusión 2026-05-12):**

- **Estado del Lead:** enum manual con select en UI (`en_seguimiento` / `cerrado` / `perdido`). Default `en_seguimiento` al crear trial. Auto → `cerrado` al asignarle plan (en el hook de subscription creation). Override editable desde la ficha del lead.
- **Asistió:** auto-derivado del attendance/booking status (qr_escaneado/confirmado → Sí; no_show o fecha pasada sin check-in → No; futura → vacío).
- **Gestiona:** nuevo campo `bookings.created_by` seteado con el `request.user.id` del admin logueado al usar `POST /api/admin/trials`. Trials históricas → "—".
- **Comentarios:** nuevo campo `users.lead_notes` (TEXT nullable). Al pasar a `cerrado`, prefijo automático con el nombre del plan vendido si está vacío. Editable.
- **Filtros del reporte:** sede, fecha desde/hasta, estado del lead (multi-select), asistió, turno, gestiona, **días sin convertir ≥ N**.
- **Histórico Gestiona:** no se hace backfill (mostrar "—" para trials anteriores al cambio).
- **Asistencia Final, Rep., Asistió post rep.:** explícitamente fuera de alcance.

**Out of scope:**

- Tracking de coach por horario (Profe 1/Profe 2 del CSV original) — pertenece a una fase de scheduling separada.
- Backfill de `bookings.created_by` para trials históricas.
- Reportes admin nuevos no relacionados con trials (cobros, asistencia general, etc.).

**Cambios DB previstos:**

- `users.lead_status` ENUM('en_seguimiento','cerrado','perdido') NULL — default `en_seguimiento` para `status='prueba'`, NULL para el resto.
- `users.lead_notes` TEXT NULL.
- `bookings.created_by` INT NULL, FK → `users.id`.

**Cambios backend previstos:**

- Endpoint `GET /api/admin/reports/trial-sessions` (paginado + filtros + export CSV).
- Endpoint `PATCH /api/admin/leads/:userId` (editar `lead_status` + `lead_notes`).
- Hook en `SubscriptionService.create*` para usuarios con trial: setear `lead_status='cerrado'` y prefijar `lead_notes` con nombre del plan si está vacío.
- Hook en `POST /api/admin/trials`: setear `bookings.created_by` con el admin logueado.

**Cambios frontend previstos:**

- Nueva sección/tab en Reportes del admin con tabla + filtros + export CSV.
- En la ficha del lead: select de Estado del Lead + textarea de Comentarios (editables).

**Requirements**: TRIAL-RPT-SCHEMA-01..05 (Plan 01), TRIAL-RPT-HOOKS-01..04 (Plans 02+03), TRIAL-RPT-EDIT-01..03 (Plan 04), TRIAL-RPT-API-01..05 (Plan 05), TRIAL-RPT-UI-01..05 (Plans 06+07). Derivados de los 43 D-XX lockeados en 114-CONTEXT.md.

**Plans:** 7 plans

Plans:

- [ ] 114-01-PLAN.md — Schema migration: users.lead_status / lead_notes / created_by + 2 indexes + migration test (D-15..D-20)
- [ ] 114-02-PLAN.md — Members service + trial hook: setear createdBy + lead_status='en_seguimiento' al crear trial (D-31)
- [ ] 114-03-PLAN.md — Subscription conversion hook: extender recomputeUserStatus para auto-cerrar lead + prefijar plan en lead_notes (D-32, D-33, D-34)
- [ ] 114-04-PLAN.md — PATCH /api/admin/leads/:userId: edit endpoint con scope + validación + tests (D-27..D-30)
- [ ] 114-05-PLAN.md — GET /api/admin/reports/trial-sessions (paginado) + /export (CSV) (D-21..D-26, D-40..D-43)
- [ ] 114-06-PLAN.md — Admin UI: tab Sesiones de Prueba en ReportesPage con filtros + tabla inline-edit + export CSV (D-35..D-37, D-39)
- [ ] 114-07-PLAN.md — Admin UI: bloque Datos de Lead en AlumnoDetailPage para users con status='prueba' (D-38, D-39)

---

_v4.85 added: 2026-05-04 — 1 phase (112), 24 requirements (ENROLL, ADDON-SCHEMA, ADDON-API, ADDON-LIFE, ADDON-ADMIN-UI, ADDON-MEMBER-UI). Origin: análisis de spaghetti `subscriptions/programas` (6 inserts duplicados + `tearDownBundleEnrollments` de fase 111) + necesidad operativa de asignar programas adicionales por admin con precio opcional. Inserción intencional entre v4.8 y v4.9 para desbloquear el split de v4.9. Deliberadamente una sola fase: refactor + feature se justifican mutuamente y la estructura interna emerge en `/gsd-plan-phase 112`._

---

## Ad-hoc Phases (fuera de milestone)

### Phase 115: Evento Desafío de la Barra

**Goal:** Habilitar un desafío single-attempt de aguantar 1:30 colgado de una barra para el evento del domingo 24/05, accesible desde el carrusel de "Mi Plan Personalizado" como primer ítem, visible sólo durante el rango de fechas del evento. Usuarios escanean QR físico → se registran como Templo Online → entran al desafío → el staff opera timer + foto + resultado → si completaron, comparten foto con marco de marca en redes para reclamar descuento físico.

**Depends on:** Nothing (feature aislada, one-shot)

**Disparador:** Evento de marketing presencial el domingo 24/05/2026 — el QR físico promociona la app y el desafío engancha leads que después conviertan a miembros presenciales o Templo Online.

**Status:** Planning

**Plans:** 10 plans

Plans:
**Wave 1**

- [ ] 115-01-PLAN.md — Backend: schema migration 0124 (3 columnas users) + GET /me extension
- [ ] 115-02-PLAN.md — Frontend scaffolding: módulo bar-challenge, router routes, store skeleton, window composable, UserProfile extension
- [ ] 115-03-PLAN.md — useImageComposer composable + marco-placeholder.png 1080x1920

**Wave 2** _(blocked on Wave 1 completion)_

- [ ] 115-04-PLAN.md — Backend: POST /api/bar-challenge/result + service + 6 integration tests (200×2, 409, 401, 400×2)
- [ ] 115-05-PLAN.md — Store full implementation (timer math, 3-retry submit, sessionStorage queue) + BarChallengeCard.vue (premium-dark, 3 estados)

**Wave 3** _(blocked on Wave 2 completion)_

- [ ] 115-06-PLAN.md — Pages Explicacion + Timer (fullscreen dark, KeepAwake, cámara) + Resultado (compose + share + fallback + retry banner)

**Wave 4** _(blocked on Wave 3 completion)_

- [ ] 115-07-PLAN.md — MiTemplo.vue integration: showPremiumCarousel computed + BarChallengeCard como primer slide condicional
- [ ] 115-08-PLAN.md — [BLOCKING] Aprobación + install @capacitor/camera + @capacitor/share + cap sync + Info.plist + version bump 1.4.3→1.5.0

**Wave 5** _(blocked on Wave 4 completion)_

- [ ] 115-09-PLAN.md — [autonomous:false] Android AAB build + Play Console internal testing + smoke + promote to production
- [ ] 115-10-PLAN.md — [autonomous:false] iOS Archive + TestFlight + smoke + Submit for App Review + contingency Plan B

---

### Phase 116: Refresh Tokens Auth

**Goal:** Eliminar el logout cada 7 días reemplazando el JWT único por un esquema access + refresh token con rotación y reuse detection, backwards-compatible para no romper apps viejas en Play Store.

**Depends on:** —

**Requirements**: 14 (ver 116-SPEC.md)

**Status:** Spec'd (ambiguity 0.136) — pendiente discuss + plan

**Plans:** 5/5 plans complete

Plans:

- [ ] TBD

### Phase 117: Analytics: correcciones de exactitud + métrica de miembros únicos

**Goal:** Hacer que los números del módulo de analytics sean correctos (corrige 6 bugs validados contra prod: KPI de activos sobre `users.status` obsoleto, no-show con enum inexistente, revenue que suma ARS+EUR, trend de activos circular, plan distribution sin filtrar archivados ni separar por país, `DATE()` que anula índices) y agregar las métricas/listas operativas que recepción usa día a día (miembros únicos 7/14/30, engagement reutilizando segmentos, ratio de adopción de check-in por sede con warning <50%, panel de Vencimientos/Renovaciones completo). Centraliza el predicado canónico de "activo" en un helper SQL compartido + extrae `applyScope` + crea domain services nuevos (sin tocar el monolito existente, que es v4.9). Crea la tabla `user_status_history` como fundación para la Fase 118.
**Requirements**: D-01..D-18 (decisiones de 117-CONTEXT.md)
**Depends on:** Phase 116
**Plans:** 6/6 plans complete

Plans:

**Wave 1**

- [x] 117-01-PLAN.md — Fundaciones de correctitud: helper canónico "activo" + `applyScope` + 6 bug fixes in-place (no-show, multi-moneda, trend, plan distribution, perf) + tests
- [x] 117-02-PLAN.md — Tabla `user_status_history` (migración 0128) + backfill aproximado (0129) + hook forward-only en `recomputeUserStatus`

**Wave 2** _(blocked on Wave 1 completion)_

- [x] 117-03-PLAN.md — AttendanceMetricsService: miembros únicos 7/14/30 + ratio de adopción de check-in por sede + endpoints

**Wave 3** _(blocked on Wave 2 completion)_

- [x] 117-04-PLAN.md — EngagementService: conteo de activos por segmento (reutiliza segmentación) + listas nominales en_riesgo/ghost con WhatsApp + endpoint

**Wave 4** _(blocked on Wave 3 completion)_

- [x] 117-05-PLAN.md — Panel de Vencimientos/Renovaciones: attentionList con buckets overdue + `daysOverdue` real + tasa de renovación 7/14/30 + flag ya pagó + cruce de segmento

**Wave 5** _(blocked on Wave 4 completion)_

- [x] 117-06-PLAN.md — Frontend admin: KPI únicos, segmentos+listas, warning de ratio, panel de vencimientos, revenue por moneda

### Phase 118: Analytics estratégico: funnel de conversión + retención por ciclos de plan + caja vs devengado

**Goal:** Tableros estratégicos/financieros del módulo de analytics (segunda mitad del split de la Fase 117). 3 propuestas de `PROPUESTAS_ANALYTICS.md`: (1) funnel de conversión freemium→prueba→activo con tiempos por etapa — consume la tabla `user_status_history` creada en 117; (2) retención por cohortes de ciclos de plan (cohorte = mes de primera sub activa, eje X = ciclo N, gap consecutivo ≤30 días configurable, filtrable por plan_category + distribución de ciclos completados); (3) caja vs devengado + ARPU (devengado prorrateado price_paid/duration_days × días dentro del mes, ambas series superpuestas, separadas por moneda). Reutiliza el helper canónico de "activo" y `applyScope` de la 117.
**Requirements**: TBD
**Depends on:** Phase 117 (helper "activo", applyScope, tabla user_status_history)
**Plans:** 5/6 plans executed

Plans:

- [x] 118-01-PLAN.md — Hooks de user_status_history (prueba en members/service, inactivo+admin en members/routes) + test (PRIMERA tarea, habilita el funnel)
- [x] 118-02-PLAN.md — RetentionService: cohortes por ciclos de plan (gap 30d, corte de racha, distribución) + endpoint admin-only + test
- [x] 118-03-PLAN.md — AdvancedFinanceService: caja vs devengado prorrateado (ventana efectiva con cancelled_at) + ARPU por moneda + endpoint + test
- [x] 118-04-PLAN.md — FunnelService: cohortes por created_at, % a prueba/activo, medianas por etapa + endpoint + test (depende de 01 hooks)
- [x] 118-05-PLAN.md — Frontend D-09: borrar las 2 cards de engagement por segmento de AsistenciaTab + getEngagement del Promise.all de ReportesPage
- [ ] 118-06-PLAN.md — Frontend: 3 tabs nuevas (Funnel/Retención/Finanzas avanzadas) + composable + tipos + verificación visual

### Phase 119: Campaña de sesión de prueba freemium (reserva self-service + sistema de email reutilizable)

**Goal:** Activar la conversión de usuarios freemium (`users.status='freemium'`, sin suscripción ni trial previo) mediante una campaña de email que les ofrece una sesión de prueba gratis presencial en la sede que elijan. Una sola fase grande que cruza 4 capas: (1) **API** — endpoint nuevo para que un freemium reserve su propia sesión de prueba (bypasea la validación de suscripción, reusa `trials-service.ts` + guard de una-por-vida, no consume capacidad); la trial no se puede cancelar ni re-reservar desde la app. (2) **App** — reutilizar la vista de Reservas existente (`ReservasPage.vue`) para que el freemium elija UNA clase como sesión de prueba, con selección de sede física (vive en "Templo Online", la oferta es presencial); entrada por deep link desde el email. (3) **Email** — sistema de campañas REUTILIZABLE sobre Resend (ya integrado, sin deps nuevas): tabla de campaña/envíos, unsubscribe propio, token de reserva personalizado por usuario, template HTML responsive, tracking de funnel (enviado→abierto→click→reservó→asistió→convirtió, apoyado en `user_status_history`). Doble CTA: reservar en la app + WhatsApp (cae al flujo tradicional admin). (4) **Campaña** — query de freemium elegibles + disparo. Bump minor del member app (feature).
**Requirements**: D-01..D-27 (ver 119-CONTEXT.md — las decisiones D-NN son los requisitos de la fase)
**Depends on:** Phase 102 (trials-service), Phase 117 (user_status_history)
**Plans:** 6/7 plans executed

Plans:

- [x] 119-01-PLAN.md — Schema foundation: branches.address + bookings.source + 4 tablas de campaña + 3 migraciones + scaffolds de tests Wave 0
- [x] 119-02-PLAN.md — Email infra: MJML + EmailService.sendCampaignBatch + template responsive + dir de imágenes self-hosted
- [x] 119-03-PLAN.md — Backend reserva: reserve-trial (promote-and-book atómico) + trial-eligibility + ventana 30d + guard de cancel
- [x] 119-04-PLAN.md — Módulo campañas: token HMAC + tracking (pixel/click/unsubscribe) + audiencia + send batch + funnel + rutas admin
- [x] 119-05-PLAN.md — Member app: 3er estado de ReservasPage + deep links (App Links/Universal Links + .well-known)
- [x] 119-06-PLAN.md — Admin: sección Campañas (lista + funnel 6 etapas + confirmación de envío)
- [~] 119-07-PLAN.md — Infra prod: Task 1 (env doc Resend, commit 2a9dcbc4) HECHO; Tasks 2-4 GATES HUMANOS pendientes (verificar dominio Resend/DNS + RESEND_API_KEY prod + copy/imágenes + .well-known reachable + crear y ENVIAR la campaña irreversible). .well-known en app.eltemplo.org devuelve SPA HTML, no JSON → follow-up de deploy. Checklist A-E en 119-07-SUMMARY.md

---

_Phase 119 added: 2026-06-01 — campaña de reactivación/conversión de freemium con sesión de prueba self-service y sistema de email de campañas reutilizable. Decidido como una sola fase grande (4 capas). Email sobre Resend con infra propia liviana para tracking de funnel integrado._

_Phase 116 added: 2026-05-25 — bug recurrente de logout en app de miembros (JWT de 7d sin refresh). Cualquier 401 borra el token y manda a /login. Objetivo: access token corto (30m) + refresh token largo (30d sliding) hasheado en DB con rotación obligatoria, endpoint /auth/refresh y /auth/logout reales, interceptor de axios con lock compartido, API backwards-compatible para evitar version skew con la app en Play Store. SPEC originalmente creado como Phase 115 (commit huérfano 8be596bf); renumerado a 116 porque 115 quedó asignado a "Evento Desafío de la Barra" en el master real._

---

## v5.0 Overview

**Milestone:** v5.0 — Métricas de Gestión
**Started:** 2026-06-03
**Phases:** 4 (120-123)
**Granularity:** fine
**Coverage:** 35/35 requirements mapped (100%)
**Continues from:** Phase 119 (ad-hoc freemium campaign). First phase of this milestone is **Phase 120** — numbering is NOT reset.

**Scope.** Backend-first reemplazo y ampliación de las métricas del panel de gestión con 6 bloques nuevos/mejorados (churn person-based, renovación, funnel de sesiones de prueba, frecuencia de asistencia, LTV con Kaplan-Meier, ticket promedio), más una fundación transversal de helpers comunes. Servicios + endpoints + tests + migraciones. La UI del admin para consumir estos bloques queda fuera de alcance (fase de frontend posterior).

**Dependency axis (drives phase order).** `duration_tier` + helpers (nominal+%+n, motor de breakdowns, semanal/mensual, aislamiento de moneda) → **churn** (Bloque 1) → **LTV** (Bloque 5). Renovación (Bloque 2) comparte el motor de cohorte por `end_date` con churn. Funnel de prueba (Bloque 3) y Frecuencia (Bloque 4) son independientes del eje de vencimiento. NO se mete todo en una sola fase: mezclar migración + algoritmo estadístico (Kaplan-Meier) + refactor de cron de segmentación en un commit atómico es frágil de testear/revisar/shippear.

**Reglas transversales (aplican a todos los bloques).** Nominal + % + n siempre juntos; breakdowns comparables lado a lado por sucursal/país/duración de plan/nombre de plan; aislamiento de moneda ARS/EUR; vistas semanal/mensual respetando el rango del panel; `duration_tier` por flag (`monthly | long_term`), no hardcodeando nombres de plan.

**Decisiones abiertas (se resuelven en el `discuss-phase` de cada fase, NO en el roadmap).**

- `duration_tier`: columna explícita en `subscription_plans` (migración) vs derivado de `durationDays`. Validar contra planes reales. (Fase 120)
- Alcance del refactor de segmentación batch nocturna (FREQ-06): ¿entra o se difiere exponiendo solo la métrica de frecuencia? (Fase 123)
- `renewalRate` 7/14/30 actual: ¿se retira o convive con el Bloque 2? (Fase 121)
- ARPU (Finanzas Avanzadas): ¿se jubila o convive con el LTV del Bloque 5? (Fase 122)
- Edge case B1: persona con varios vencimientos en el rango → churn sobre su último vencimiento. (Fase 121)
- Edge case B5: reactivación (se fue y volvió) → una vida con gap vs dos vidas. (Fase 122)

**Reemplaza vs. agrega.** Bloque 1 elimina `churnedMembers` (basado en `updated_at`, frágil); Bloque 2 reescribe `retentionRate`; Bloque 4 mantiene y mejora los segmentos de engagement existentes. Resto de las métricas (KPIs, asistencia, finanzas, reportes) intacto.

**Reference:** `ESPECIFICACION-METRICAS-GESTION.md` (spec de negocio, fuente de verdad) + `BRIEF-METRICAS-GESTION.md` (inventario actual) + `METRICAS_GESTION_HANDOFF_2026-06-02.md` (estructura de fases y hallazgos de código verificados).

## v5.0 Phases

- [x] **Phase 120: Fundación transversal + Ticket promedio** — `duration_tier` por flag + helpers comunes (nominal+%+n, motor de breakdowns comparables, vista semanal/mensual respetando el rango, aislamiento de moneda, cohortes por rango `[from,to)`) + Bloque 6 (ticket promedio ponderado por `price_paid`, descuento vs `priceRegular`, mediana ante outliers, por moneda). Ticket es chico y estrena los helpers de la fundación. (completed 2026-06-04)
- [x] **Phase 121: Vencimiento — Churn de no renovación + Tasa de renovación** — Bloque 1 (churn person-based, cohorte por `end_date ∈ [from,to)`, churn maduro ≥N días, N libre/multi-N, serie histórica con marca de provisorios) + Bloque 2 (renovación = renovados÷vencidos sobre la misma cohorte, corte renovación/reactivación 15d configurable, número "vivo"). Comparten el motor de cohorte por `end_date`; reemplazan las métricas viejas juntas. (completed 2026-06-04)
- [x] **Phase 122: LTV / vida del cliente** — Bloque 5: lifetime headline `1÷churn mensual` (usa el churn de la fase 121) + robusto Kaplan-Meier (mediana de supervivencia con censura para activos) + LTV monetario desde pagos reales (proyectado y observado, nunca ARPU), separado por moneda, abierto por sucursal/país/plan. Depende del churn de la fase 121; Kaplan-Meier merece fase propia con tests. (completed 2026-06-04)
- [x] **Phase 123: Asistencia + Funnel — Frecuencia de asistencia + Funnel de sesiones de prueba** — Bloque 4 (frecuencia visitas/sem por miembro sobre 4 semanas rodantes, bandas Inactivo/Bajo/Medio/Alto, lista "enfriándose", adopción de check-in al lado, recálculo batch de segmentación) + Bloque 3 (cascada reserva→asistencia→compra, `tasa_cierre`=compraron÷asistieron, ventana de atribución ~21d, solo leads nuevos, cohorte por fecha de sesión agendada). Independientes del eje de vencimiento; Bloque 4 es el de mayor riesgo por el cron de segmentación. (completed 2026-06-04)

## v5.0 Phase Details

### Phase 120: Fundación transversal + Ticket promedio

**Goal:** Construir la fundación transversal que consumen los 6 bloques (mecanismo de `duration_tier` por flag, helpers de presentación nominal+%+n, motor de breakdowns comparables, aislamiento de moneda, cohortes por rango de fechas con vista semanal/mensual) y validarla entregando el Bloque 6 (ticket promedio) como primer consumidor real. End state: cualquier métrica puede expresarse como nominal+%+n, abrirse por sucursal/país/duración/plan lado a lado, devolverse aislada por moneda, y el gestor obtiene el ticket promedio ponderado real por plan/global con descuento y mediana.

**Depends on:** Nothing (primera fase del milestone; v4.8 finance + analytics 117/118 en producción)

**Requirements** (9/35):

- FUND-01..05 — `duration_tier` por flag + helper nominal+%+n + motor de breakdowns + aislamiento de moneda + cohortes por rango con vista semanal/mensual
- TICKET-01..04 — ticket por plan (promedio de `price_paid`) + ticket global ponderado + descuento promedio vs `priceRegular` (con mediana) + aislamiento de moneda y breakdowns

**Success Criteria** (what must be TRUE at phase completion):

1. Existe un mecanismo `duration_tier` (`monthly | long_term`) resuelto por flag (no por nombre de plan) consumible por todas las métricas; el breakdown corto/largo plazo se computa desde él y un rename de plan no rompe el reporte.
2. Un helper común devuelve toda métrica como una estructura uniforme con nominal + porcentaje + tamaño de muestra (n), reutilizable por los 6 bloques; un motor de breakdowns abre cualquier métrica por sucursal, país, duración y nombre de plan devolviendo los segmentos comparables lado a lado (no solo como filtro).
3. Toda métrica financiera se devuelve aislada por moneda (ARS y EUR nunca se suman en un total); las cohortes respetan el rango `[from,to)` del panel y exponen vista semanal/mensual donde aplique.
4. El endpoint de ticket devuelve el ticket por plan como promedio de `price_paid` realmente cobrado (captura descuentos automáticamente) y el ticket global como suma total cobrada ÷ cantidad de cobros (promedio ponderado por volumen, por fecha de cobro), por moneda.
5. El endpoint expone el descuento promedio aplicado (`price_paid` vs `priceRegular`) por plan y por sede, con la mediana junto al promedio para amortiguar outliers, y abre el ticket por corto/largo plazo, sucursal y país.

**Risks / notas:** Decisión abierta — `duration_tier` columna explícita en `subscription_plans` (migración) vs derivado de `durationDays`; resolver en `discuss-phase` validando contra planes reales (el enum actual `planTier` solo tiene `flex`, no existe "Flex+" como tier). Fuente de descuento ya disponible: `subscription_plans.priceRegular`.

**Plans:** 4/4 plans complete
**UI hint:** no (backend-first; sin UI de admin en alcance)

Plans:

**Wave 1**

- [x] 120-01-PLAN.md — Foundation utilities: duration-tier (FUND-01) + metric-shape nominal+%+n & median (FUND-02)
- [x] 120-02-PLAN.md — Forward price snapshot: subscriptions.price_regular_snapshot column + 0136 migration + capture at 4 SubscriptionService insert sites (TICKET-03 base)

**Wave 2** _(blocked on Wave 1 completion)_

- [x] 120-03-PLAN.md — Breakdowns engine (FUND-03) + cohorts half-open [from,to) weekly/monthly (FUND-05) + currency isolation (FUND-04)

**Wave 3** _(blocked on Wave 2 completion)_

- [x] 120-04-PLAN.md — Block 6 Ticket service + GET /ticket + schema/types + integration tests (TICKET-01/02/03/04)

### Phase 121: Vencimiento — Churn de no renovación + Tasa de renovación

**Goal:** Reemplazar las métricas frágiles de churn/retención por un par person-based correcto, construido sobre un único motor de cohorte por `end_date ∈ [from,to)`. End state: el gestor obtiene el churn como personas distintas (con churn maduro y multi-N comparativo) y la tasa de renovación como número vivo sobre la misma cohorte, ambos abiertos por los breakdowns estándar, con la métrica vieja basada en `updated_at` eliminada.

**Depends on:** Phase 120 (helpers nominal+%+n, motor de breakdowns, cohortes por rango, `duration_tier`)

**Requirements** (10/35):

- CHURN-01..06 — churn como personas distintas vencidas en `[from,to)` sin sub nueva en N días + N libre/multi-N + churn maduro (≥N días) + renovación anticipada/cambio de duración cuentan como retención + serie histórica con marca de provisorios + breakdowns
- RENOV-01..04 — renovados÷vencidos sobre la misma cohorte + corte renovación/reactivación 15d configurable + número vivo (no fuerza renovación%+churn%=100) + comparación por segmento

**Success Criteria** (what must be TRUE at phase completion):

1. El endpoint de churn devuelve **personas distintas** (no suscripciones) cuya sub venció en `[from,to)` y no registraron sub nueva dentro de N días; la métrica vieja basada en `updated_at` (`churnedMembers`) queda eliminada.
2. El parámetro N es libre y el endpoint acepta múltiples N en simultáneo para la vista comparativa (churn@5 / @10 / @15 lado a lado); solo entran personas cuyo vencimiento ocurrió hace ≥N días (churn maduro), excluyendo del numerador y denominador a las que siguen en gracia.
3. Renovación anticipada (paga antes de vencer) y cambio de duración (mensual↔largo) cuentan como retención (no churn); una sub en pausa no cuenta como vencida; el endpoint expone una serie histórica de churn por cohorte de vencimiento mes a mes con marca de períodos provisorios (cohorte inmadura).
4. El endpoint de renovación devuelve la tasa = renovados ÷ vencidos en `[from,to)` sobre la misma cohorte que el churn, con corte renovación/reactivación configurable arrancando en 15 días; la tasa es un número vivo que no se fuerza a sumar 100 con el churn (solo coinciden cuando `en_gracia = 0`).
5. Tanto churn como renovación se abren por los breakdowns estándar (duración, nombre de plan, sucursal, país) con nominal + % + n, y la renovación se ordena/compara por segmento para descubrir buenos y malos performers.

**Risks / notas:** Decisiones abiertas — ¿se retira `renewalRate` 7/14/30 o convive con el Bloque 2? Edge case: persona con varios vencimientos en el rango → evaluar churn sobre su último vencimiento del rango (confirmar con dato real). Resolver en `discuss-phase`.

**Plans:** 3/3 plans complete

Plans:

- [x] 121-01-PLAN.md — Shared expiry-cohort engine (cohorte por end_date, predicados retención/madurez) + wire types ChurnAnalytics/RenewalAnalytics + test primitivo
- [x] 121-02-PLAN.md — ChurnService person-based (multi-N, churn maduro, serie provisoria, breakdowns) + GET /churn + churnSchema + deprecación métricas viejas (D-09) + test
- [x] 121-03-PLAN.md — RenewalService (renovados÷vencidos misma cohorte, número vivo enGracia, breakdowns) + GET /renewal + renewalSchema + deprecación getRenewalRate (D-09) + test

**Nota de desvío (D-09):** El Success Criterion #1 ("la métrica vieja `churnedMembers` queda eliminada") se satisface a nivel milestone: en la Fase 121 las métricas viejas quedan **deprecadas-pero-presentes** (anotadas, apuntando a los endpoints nuevos como canónicos) para no romper el dashboard admin; la eliminación física ocurre en la fase de UI del admin cuando las tarjetas se reconecten.

**UI hint:** no (backend-first; sin UI de admin en alcance)

### Phase 122: LTV / vida del cliente

**Goal:** Entregar la vida del cliente encadenada al churn de la fase anterior: un headline simple y un estimador robusto que maneja censura, más el valor monetario derivado de pagos reales. End state: el gestor obtiene cuánto dura un cliente (headline `1÷churn` + mediana de supervivencia Kaplan-Meier) y cuánto vale (proyectado y observado desde pagos reales), separado por moneda y abierto por sucursal/país/plan.

**Depends on:** Phase 121 (lógica de churn maduro define el fin de vida) y Phase 120 (helpers/breakdowns, aislamiento de moneda)

**Requirements** (5/35):

- LTV-01..05 — headline `1÷churn mensual` + Kaplan-Meier (mediana de supervivencia con censura) + fin de vida por churn maduro del Bloque 1 + LTV monetario desde pagos reales (proyectado y observado, no ARPU) + separado por moneda y abierto por sucursal/país/plan

**Success Criteria** (what must be TRUE at phase completion):

1. El endpoint devuelve el lifetime headline = 1 ÷ churn mensual (reutilizando el churn de la fase 121), abierto por los breakdowns estándar.
2. El endpoint devuelve el lifetime robusto vía Kaplan-Meier (mediana de supervivencia), tratando a los clientes activos como datos censurados sin descartarlos, y el fin de vida de un cliente se define con la lógica de churn maduro de la fase 121 (los bloques se encadenan).
3. El LTV monetario se calcula desde pagos reales: proyectado (lifetime × ingreso mensual real por cliente) y observado (suma real pagada en la vida del cliente cerrado), nunca vía ARPU snapshot.
4. El LTV se devuelve separado por moneda (ARS y EUR nunca se suman) y se abre por sucursal, país y plan, mostrando qué membresía retiene vidas más largas y deja más plata.

**Risks / notas:** Decisiones abiertas — ¿se jubila el ARPU de Finanzas Avanzadas o convive con el LTV? Edge case: reactivación (se fue y volvió) → una vida con gap vs dos vidas, se resuelve con el corte de 15 días de la fase 121. Kaplan-Meier es algoritmo estadístico nuevo: aislado en fase propia con tests dedicados. Resolver en `discuss-phase`.

**Plans:** 3/3 plans complete

Plans:

- [x] 122-01-PLAN.md — Kaplan-Meier survival-median pure helper + edge-case tests + LtvAnalytics wire contract (LTV-02)
- [x] 122-02-PLAN.md — LtvService (headline 1÷churn, KM median, monetary projected/observed from real payments, per-currency, breakdowns) + GET /ltv + ltvSchema + ARPU @deprecated (LTV-01..05)
- [x] 122-03-PLAN.md — Real-MySQL integration test for LTV-01..05 + ADMIN auth gate
      **UI hint:** no (backend-first; sin UI de admin en alcance)

### Phase 123: Asistencia + Funnel — Frecuencia de asistencia + Funnel de sesiones de prueba

**Goal:** Entregar las dos métricas independientes del eje de vencimiento: la frecuencia de asistencia como alarma proactiva de churn (con su refactor de segmentación) y el funnel diagnóstico de sesiones de prueba reserva→asistencia→compra. End state: el gestor ve la distribución de frecuencia por bandas con la lista "enfriándose" y la adopción de check-in como condición de validez, y obtiene la cascada del funnel con las tasas de cada escalón ancladas por fecha de sesión agendada.

**Depends on:** Phase 120 (helpers/breakdowns, vista semanal/mensual). Independiente de las fases 121/122.

**Requirements** (11/35):

- FREQ-01..06 — frecuencia visitas/sem por miembro sobre 4 semanas rodantes (normalizada para <4 sem) + bandas Inactivo/Bajo/Medio/Alto con distribución (incl. activos con 0 visitas) + lista "enfriándose" (bajó ≥1 banda) con % de variación + adopción de check-in al lado + alimenta y corrige los segmentos existentes + recálculo batch de segmentación
- FUNNEL-01..05 — cascada reserva→asistencia→compra con `tasa_show`/`tasa_cierre`/`punta_a_punta` + ventana de atribución configurable ~21d + solo leads nuevos sin sub paga previa + cohorte por fecha de sesión de prueba agendada + breakdowns por sucursal/país/turno/plan

**Success Criteria** (what must be TRUE at phase completion):

1. El endpoint de frecuencia devuelve el promedio de visitas/semana por miembro sobre las últimas 4 semanas rodantes (normalizado para <4 semanas de antigüedad) y la distribución por bandas (Inactivo 0 / Bajo ~1 / Medio ~2 / Alto 3+), incluyendo activos con 0 visitas.
2. El endpoint devuelve la lista de "enfriándose" (miembros que bajaron ≥1 banda entre las 4 semanas actuales y las 4 previas) con el % de variación, y expone al lado el % de adopción de check-in de la sede como condición de validez del dato.
3. La frecuencia alimenta y corrige los segmentos existentes (espartano/intermitente/en_riesgo/ghost…) y el recálculo de segmentación corre en un proceso batch (ej. nightly) usando la frecuencia como insumo, en vez de solo al login con cooldown.
4. El endpoint de funnel devuelve la cascada reserva→asistencia→compra con los tres números y las tasas `tasa_show = asistieron÷reservaron`, `tasa_cierre = compraron÷asistieron` (sobre asistentes) y `punta_a_punta = compraron÷reservaron`, usando una ventana de atribución configurable (~21d) que madura sola.
5. El funnel cuenta solo leads nuevos sin suscripción paga previa, ancla la cohorte por la fecha de la sesión de prueba agendada (con cortes semanal/mensual), y se abre por sucursal, país, turno/horario y plan que terminan comprando, con nominal y %.

**Risks / notas:** Decisión abierta — alcance exacto del refactor de segmentación batch (FREQ-06): ¿entra completo o se difiere exponiendo solo la métrica de frecuencia? El mapeo fino banda↔segmento se define con quien maneja el módulo de segmentación (umbrales no documentados en el brief). Es la fase de mayor riesgo por el cron. Resolver en `discuss-phase`.

**Plans:** 3/3 plans complete

Plans:

- [x] 123-01-PLAN.md — FrequencyService (FREQ-01..04): visits/week rolling 4w + bands + cooling-down + check-in adoption reuse + GET /frequency
- [x] 123-02-PLAN.md — TrialFunnelService (FUNNEL-01..05): reserva→asistencia→compra cascade + rates + new-lead + ~21d window + turno/plan-bought breakdowns + GET /trial-funnel
- [x] 123-03-PLAN.md — Segmentation golden-case (FREQ-05/06): active-0-visits→en_riesgo override + tuneable threshold + existing nightly batch fed (no new cron)

**UI hint:** no (backend-first; sin UI de admin en alcance)

## v5.0 Progress

| Phase                                          | Plans Complete | Status   | Completed  |
| ---------------------------------------------- | -------------- | -------- | ---------- |
| 120. Fundación transversal + Ticket            | 4/4            | Complete | 2026-06-04 |
| 121. Vencimiento (Churn + Renovación)          | 3/3            | Complete | 2026-06-04 |
| 122. LTV / vida del cliente                    | 3/3            | Complete | 2026-06-04 |
| 123. Asistencia + Funnel (Frecuencia + Prueba) | 3/3            | Complete | 2026-06-04 |

_Plan counts populated by `/gsd-plan-phase`._

---

_v5.0 added: 2026-06-03 — 4 phases (120-123), 35 requirements (FUND, CHURN, RENOV, FUNNEL, FREQ, LTV, TICKET). Backend-first reemplazo/ampliación de métricas del panel de gestión (6 bloques + fundación transversal). Eje de dependencia: `duration_tier`/helpers → churn → LTV; funnel y frecuencia independientes. Continúa numeración desde fase 119 (campaña freemium ad-hoc). UI de admin fuera de alcance (fase de frontend posterior). Decisiones abiertas (`duration_tier` columna vs derivado, alcance batch FREQ-06, `renewalRate` 7/14/30, ARPU) diferidas a cada `discuss-phase`._

---

## v5.1 Overview

**Milestone:** v5.1 — Nuevo Sistema de Entrenamiento
**Started:** 2026-06-04
**Phases:** 8 (124-131)
**Granularity:** fine
**Coverage:** 18/18 requirements mapped (100%)
**Continues from:** Phase 123 (v5.0 Métricas de Gestión). First phase of this milestone is **Phase 124** — numbering is NOT reset.

**Scope.** Reestructurar el sistema de entrenamiento alrededor de un **árbol de habilidades** (DAG) construido sobre 3 ejes ortogonales (gesto/sub-familia, palanca/posición, contracción). El árbol es el **cimiento** y va primero; sobre él se levantan el **nivel Kairos** (escalón previo a Alfa, híbrido que hereda de Alfa con formato lineal forzado) y el **ajuste de dificultad in-session** (botones más fácil/más difícil que sirven el vecino correcto y dejan un registro de "dominado"). Backend-first, brownfield: los niveles son un enum hardcodeado en `exercises.ts`/`users.ts`/`completed-sessions.ts`/`level-mapping.ts` y admin `constants/levels.ts` — agregar Kairos toca todos esos lugares.

**Dependency axis (drives phase order).** TREE es el cimiento. Dentro de TREE: la estructuración de datos (TREE-01/05, fase 124) es la bedrock, luego el bootstrap+revisión que puebla las dimensiones (TREE-02/03, fase 125), luego el grafo derivado (TREE-04, fase 126); recién sobre el grafo se exponen el % de avance al miembro (TREE-06, fase 127) y el editor de árbol al admin (TREE-07, fase 128). Kairos (Eje 1) depende del catálogo saneado (fase 124) pero NO del grafo. El ajuste in-session (Eje 3, fase 131) depende del grafo (fase 126, que provee la primitiva "vecino arriba/abajo") y del % del árbol (fase 127); incluye su propio registro de "dominado" como modelo de datos. NO se mezcla migración de esquema + bootstrap heurístico + construcción de grafo + enum de nivel en un commit atómico: cada eje y cada capa es frágil de testear/revisar por separado.

**Decisiones ya tomadas (no se re-litigan en el roadmap ni en discuss-phase).** Modelado por estructuración de las 3 dimensiones (no cablear aristas); bootstrap heurístico (sin API) + revisión humana; árbol auto-construye desde el orden del SPOM/`dificultadLineal` y los profes ajustan después en el editor del admin (`BRIEF-PROFES` NO bloquea); Kairos híbrido (nivel real que hereda de Alfa, ejercicios `difficulty=1`, formato solo lineal + 2 ej/bloque, alcance de código SOLO estructural — la conversión de la sesión de prueba NO es requisito de código, no se ata al funnel 123 de v5.0); alumnos nuevos arrancan en Kairos por defecto; Eje 3 disparo manual, criterio binario contra la prescripción del SPOM, un escalón por toque, se recuerda lo dominado pero NO cambia nivel ni SPOM automáticamente.

**Decisiones abiertas (se resuelven en el `discuss-phase` de cada fase, NO en el roadmap).**

- Agrupación visible del árbol: `category` (fina, ~22) vs `pattern` (gruesa, ~9) — feedback de profes apunta a `category`. (Fases 124/127)
- Eje transversal "estático/dinámico" como atributo/filtro, no categoría paralela — confirmar con profes. (Fase 127)
- INITIUM en sesiones Kairos: ¿se baja a 2 ejercicios o queda excluido del "2 por bloque"? (Fase 129)
- Umbral exacto de sesiones para graduar Kairos → Alfa. (Fase 130)
- Cómo se _captura_ "dominar" (el criterio binario ya está decidido; la mecánica de captura no). (Fase 131)
- Dosis lineales exactas de Kairos (4×12, 5×8…) — de los profes. (Fases 129/131)

**Out of scope (confirmado).** Cambio automático de nivel o de la planificación del SPOM a partir del ajuste in-session (sigue siendo criterio del coach); contenido propio de Kairos cargado por Fran (mientras tanto hereda de Alfa); upsell por estancamiento; ejes adicionales (tempo, rango, banda); trabajo "de pie" del audio del Trainer; atar Kairos al funnel de conversión de la sesión de prueba.

**Reference:** `.planning/research/new-training-system-design.md` (doc de diseño, fuente de verdad) + `.docs/new-training-system/BRIEF-PROFES.md` (decisiones de dominio) + audios en `.docs/new-training-system/`.

## v5.1 Phases

- [x] **Phase 124: Estructura de datos de las 3 dimensiones + saneo** — Esquema gesto/palanca/contracción separado del `position` sucio + saneo del catálogo (~103 sin ruta, duplicados, `position` que mezcla 3 conceptos). Bedrock del milestone. (completed 2026-06-05)
- [x] **Phase 125: Bootstrap heurístico + revisión de profes de la descomposición** — Proceso heurístico (sin API) que propone sub-familia/palanca/ruta-pendiente por nombre+ruta, con salida revisable (tabla `exercise_dimension_proposals`) que los profes aceptan/corrigen/rechazan en una tabla filtrable del admin antes de fijarla como verdad. (completed 2026-06-05)
- [x] **Phase 126: Auto-construcción del grafo (DAG) de progresiones** — Grafo ramificado derivado del orden del SPOM/`dificultadLineal` + las 3 dimensiones; provee la primitiva "vecino un escalón arriba/abajo" que necesita el Eje 3. (completed 2026-06-05)
- [x] **Phase 127: % de avance del árbol para el miembro** — El miembro ve su progreso por familia/nodo del árbol agrupado por categoría temática (Tracción/Empuje/Piernas/Core/Movilidad). (completed 2026-06-05)
- [x] **Phase 128: Editor de árbol en el admin** — Sección nueva donde los profes reordenan ejercicios, agrupan/separan sub-familias y ajustan precedencias sobre el grafo ya construido. (3/3 plans executed, ready_for_verification — UAT visual diferida) (completed 2026-06-05)
- [x] **Phase 129: Nivel Kairos — enum, herencia de Alfa y formato lineal** — 5→6 niveles en API/app/admin + generación que hereda de Alfa (`difficulty=1`) con capa que fuerza formato solo lineal + 2 ej/bloque. (completed 2026-06-05)
- [x] **Phase 130: Asignación, graduación y selector de Kairos** — Default de alumno nuevo = Kairos + graduación automática por umbral + salto manual del coach + 6º recuadrito en el selector de nivel. (4/4 plans executed, ready_for_verification — UAT visual diferida) (completed 2026-06-05)
- [x] **Phase 131: Ajuste de dificultad in-session + registro de "dominado / bajado"** — Persistencia nueva de dominado/bajado por miembro (distinta del "completado" local + RPE, referenciada a nodos del árbol) + botones más fácil/más difícil en el player que sirven el vecino correcto del árbol conservando ruta/contracción/formato/dosis, alimentan el % y los ve el coach. (completed 2026-06-05)

## v5.1 Phase Details

### Phase 124: Estructura de datos de las 3 dimensiones + saneo

**Goal:** Las 3 dimensiones de dificultad (gesto/sub-familia, palanca/posición, contracción) existen como datos estructurados y limpios en el esquema, separadas del campo `position` actual (que hoy mezcla palanca + implemento + orientación), con el catálogo de ejercicios saneado para que el resto del milestone construya sobre datos confiables. End state: cualquier ejercicio puede leerse por sus 3 dimensiones como columnas/relaciones propias, ningún ejercicio queda sin ruta, los duplicados están resueltos y `position` queda descompuesto sin pérdida de información.

**Depends on:** Nothing (cimiento / fase 0 del milestone; v5.0 en `verifying`)

**Requirements** (2/18):

- TREE-01 — gesto/sub-familia, palanca/posición y contracción como datos estructurados, separados del `position` actual
- TREE-05 — saneo: ~103 ejercicios sin ruta reciben ruta, duplicados resueltos, `position` separado en sus conceptos

**Success Criteria** (what must be TRUE at phase completion):

1. Cada ejercicio tiene gesto/sub-familia (tabla catálogo + FK), palanca (`leverage` nullable) y contracción (`effort` existente) accesibles como campos estructurados propios, distintos del campo `position` heredado.
2. Los ejercicios sin ruta significativa (vacía/placeholder) quedan detectados y marcados como "pendiente de ruta" (D-08); la asignación real de ruta se difiere a 125/128 (LLM propone + profes confirman). Ninguno se borra ni inventa ruta acá.
3. Los duplicados EXACTOS (mismo nombre + `dificultadLineal` + ruta + `effort`, D-06) quedan resueltos por soft-merge vía `canonical_exercise_id` (self-FK, sin deletes); el mismo ejercicio en distintos niveles/dl se preserva como escalón distinto.
4. La migración es aditiva: `position` queda intacto como legacy (D-11); el eje palanca vive en la nueva columna `leverage` y el implemento ya está separado en `equipment`. Sin reescritura ni pérdida del dato original.

**Risks / notas:** Brownfield — el enum de niveles está hardcodeado en `exercises.ts`/`users.ts`/`completed-sessions.ts`/`level-mapping.ts`/admin `constants/levels.ts` (no se toca acá, pero el catálogo de ~1.493 ejercicios sí). `effort` (contracción) ya está 70% poblado y limpio; `position` (palanca) 53% poblado y sucio. Decisión abierta diferida: agrupación visible `category` vs `pattern` (puede informar el esquema, no lo bloquea). Migración + saneo de datos productivos: validar contra datos reales, idempotencia.

**Plans:** 2/2 plans complete

Plans:

- [x] 124-01-PLAN.md — Schema Drizzle de las 3 dimensiones (tabla exercise_subfamilies + columnas subfamily_id/leverage/canonical_exercise_id/route_pending) + migración aditiva 0137 (TREE-01)
- [x] 124-02-PLAN.md — Saneo: script idempotente de soft-merge de dupes exactos (puntero canónico, sin deletes) + marcado de ruta-pendiente + integration test (TREE-05)

**UI hint:** no (backend-first; esquema + saneo de datos)

### Phase 125: Bootstrap heurístico + revisión de profes de la descomposición

**Goal:** Las 3 dimensiones de cada ejercicio (sub-familia/gesto, leverage/palanca, y ruta para los `route_pending`) quedan pobladas mediante una propuesta automática **heurística** (reglas sobre códigos de ruta + keywords, sin API) que los profes revisan y fijan, sin carga manual desde cero. End state: existe una propuesta por ejercicio en una tabla separada (`exercise_dimension_proposals`) en estado revisable, y un profe puede aceptarla, corregirla o rechazarla (en una tabla filtrable del admin, aceptar-grupo + override) antes de que se escriba en las columnas de verdad de la fase 124.

**Depends on:** Phase 124 (los campos estructurados + catálogo de sub-familias deben existir para poblarlos)

**Requirements** (2/18):

- TREE-02 — bootstrap heurístico (reglas sobre ruta + keywords de palanca, sin API) que propone la descomposición por nombre, con salida revisable antes de aplicarse
- TREE-03 — los profes revisan y corrigen la descomposición propuesta antes de fijarla como verdad

**Success Criteria** (what must be TRUE at phase completion):

1. Un proceso heurístico genera, a partir del nombre + ruta del ejercicio, una propuesta de sub-familia/gesto + palanca + ruta-pendiente para cada ejercicio (no toca `effort`).
2. La propuesta queda en un estado revisable y NO se aplica como verdad automáticamente.
3. Un profe puede aceptar, corregir o rechazar la descomposición propuesta antes de fijarla.
4. Una vez fijada, la descomposición queda persistida como dato de verdad sobre los campos estructurados de la fase 124.

**Risks / notas:** Motor = **heurístico, sin API** (decisión discuss-125: la `ANTHROPIC_API_KEY` es placeholder/nunca desplegada — la feature de IA de franchise de la Phase 38 es código durmiente). El bootstrap es un script one-off re-ejecutable e idempotente (analog `saneo-exercises.ts`), no un servicio en caliente; revisión humana como gate obligatorio (TREE-03), nunca auto-aplicar. Propuestas en tabla separada (`exercise_dimension_proposals`), no en `exercises`. A esta altura el árbol NO existe (126) → revisión sobre lista plana, distinta del editor de árbol (128). `BRIEF-PROFES` NO bloquea esta fase.

**Plans:** 3/3 plans complete

Plans:

- [x] 125-01-PLAN.md — backend: exercise_dimension_proposals schema + migration 0138 + heuristic bootstrap script + CI tests (TREE-02)
- [x] 125-02-PLAN.md — backend: review API (list/accept/reject/bulk-accept) in admin module + transactional truth-write + CI tests (TREE-03)
- [x] 125-03-PLAN.md — frontend: ProposalReviewPage + useProposalsApi composable + router/nav entry (TREE-03)
      **UI hint:** yes

### Phase 126: Auto-construcción del grafo (DAG) de progresiones

**Goal:** El sistema construye automáticamente el grafo ramificado (DAG) de progresiones de ejercicios a partir del orden del SPOM/`dificultadLineal` y las 3 dimensiones ya estructuradas, sin que nadie cablee aristas a mano. End state: existe un grafo navegable donde cada ruta contiene sus sub-familias paralelas ordenadas por palanca y contracción, regenerable de forma determinística, y para cualquier ejercicio se puede resolver su vecino un escalón arriba/abajo en su cadena (ruta × contracción) — la primitiva que consumirá el Eje 3.

**Depends on:** Phase 125 (necesita las dimensiones pobladas y fijadas)

**Requirements** (1/18):

- TREE-04 — auto-construir el grafo ramificado (DAG) desde el orden del SPOM/`dificultadLineal` + las 3 dimensiones (sub-familias paralelas dentro de cada ruta, ordenadas por palanca y contracción)

**Success Criteria** (what must be TRUE at phase completion):

1. Existe un grafo (DAG) de progresiones donde cada ruta contiene sus sub-familias paralelas.
2. Dentro de cada sub-familia, los nodos están ordenados por palanca y contracción de forma consistente con el orden del SPOM.
3. El grafo se regenera de forma determinística a partir de los datos (orden del SPOM + dimensiones), no de una lista cableada a mano.
4. Para cualquier ejercicio del grafo se puede resolver su vecino un escalón arriba/abajo dentro de su cadena (ruta × contracción) — primitiva para el Eje 3.

**Risks / notas:** El algoritmo `exercise-fallback.ts` ya elige "ejercicio equivalente" por `(route, effort, difficulty, level)` — reutilizable como base para la resolución de vecinos. `dificultadLineal` (1-12) es el aplastamiento de los 3 ejes con empates (ej: dl=2 en planche tiene 7 hermanos): la construcción debe desambiguar empates usando las dimensiones estructuradas. Decisión ya tomada: el orden sale del SPOM, los profes ajustan después (fase 128).

**Plans:** 3/3 plans complete

Plans:

**Wave 1**

- [x] 126-01-PLAN.md — exercise_progressions table + migration 0139 (schema foundation)

**Wave 2** _(blocked on Wave 1 completion)_

- [x] 126-02-PLAN.md — runRebuildProgressionGraph constructor (linear backbone, auto edges) + test
- [x] 126-03-PLAN.md — getNeighbor primitive (dl-adjacent same-effort neighbor) + test

**UI hint:** no (backend-first; motor de construcción del grafo)

### Phase 127: % de avance del árbol para el miembro

**Goal:** El miembro ve su progreso a través del árbol de habilidades, agrupado por las categorías temáticas existentes. End state: el miembro abre su árbol y ve un % de avance por familia/nodo, agrupado por Tracción/Empuje/Piernas/Core/Movilidad, reflejando el grafo real construido en la fase 126.

**Depends on:** Phase 126 (el grafo es la estructura que se muestra)

**Requirements** (1/18):

- TREE-06 — el miembro ve su % de avance por familia/nodo del árbol, agrupado por categoría temática existente

**Success Criteria** (what must be TRUE at phase completion):

1. El miembro ve un % de avance por familia/nodo del árbol.
2. El avance se agrupa visualmente por categoría temática (Tracción / Empuje / Piernas / Core / Movilidad).
3. La vista refleja el grafo construido en la fase 126 (las familias/nodos mostrados corresponden al DAG real).

**Risks / notas:** Decisiones abiertas diferidas a `discuss-phase` — agrupación visible `category` (fina, ~22) vs `pattern` (gruesa, ~9); eje transversal estático/dinámico como atributo/filtro (no categoría paralela). En esta fase el % se calcula sobre el avance ya conocido (nivel + sesiones); el registro de "dominado" y el ajuste in-session de la fase 131 lo enriquecen y cierran el lazo después. Mapeo ruta→categoría es casi 1:1 con `pattern`.

**Plans:** 2/2 plans complete

Plans:

**Wave 1**

- [x] 127-01-PLAN.md — Backend: pattern→category map + tree-progress service (reads 126 DAG, computes server-side %) + member-scoped GET /api/tree-progress/me + integration test

**Wave 2** _(blocked on Wave 1 completion)_

- [x] 127-02-PLAN.md — Member app: types + composable + store + Mi Árbol view (5 thematic category sections with per-family %), render-only

**UI hint:** yes

### Phase 128: Editor de árbol en el admin

**Goal:** Los profes pueden ajustar el árbol auto-construido (reordenar ejercicios, agrupar/separar sub-familias, cambiar precedencias) desde una sección nueva del admin, sin tocar la base de datos a mano. End state: existe un editor de árbol en el admin donde un cambio de orden/agrupación/precedencia del profe persiste y prevalece sobre el orden auto-construido del SPOM.

**Depends on:** Phase 126 (se edita el grafo ya construido)

**Requirements** (1/18):

- TREE-07 — los profes editan el árbol desde una sección nueva del admin: reordenan, agrupan/separan sub-familias y ajustan precedencias sobre el grafo construido

**Success Criteria** (what must be TRUE at phase completion):

1. Existe una sección nueva en el admin dedicada a editar el árbol de habilidades.
2. Un profe puede reordenar ejercicios dentro de una sub-familia y ver el cambio reflejado.
3. Un profe puede agrupar o separar sub-familias y ajustar precedencias sobre el grafo ya construido.
4. Los ajustes del profe persisten y prevalecen sobre el orden auto-construido del SPOM.

**Risks / notas:** Esta es la pieza que "desbloquea el milestone sin esperar curaduría manual previa": el árbol arranca auto-construido y los profes lo refinan acá. El editor debe distinguir el orden derivado del SPOM (default) de los overrides del profe para que una re-construcción del grafo no pise los ajustes manuales.

**Plans:** 3/3 plans complete

Plans:

**Wave 1**

- [x] 128-01-PLAN.md — Rebuild locked-partition guard (D-02): a (subfamily×effort) partition with a manual edge is not regenerated; dedicated integration test
- [x] 128-02-PLAN.md — tree-editor backend: admin/coach endpoints for read/reorder/precedence/regroup persisting source='manual' (D-01/D-03/D-04/D-05) + integration tests

**Wave 2** _(blocked on Wave 1 completion)_

- [x] 128-03-PLAN.md — Admin 'Editor de árbol' UI: expandable tree, up/down reorder, auto/manual badges, precedence + regroup dialogs (human-verify checkpoint DEFERRED)
      **UI hint:** yes

### Phase 129: Nivel Kairos — enum, herencia de Alfa y formato lineal

**Goal:** El nivel Kairos existe en todo el sistema y genera sesiones que heredan de Alfa pero forzadas a un formato ultra-simple (solo lineal + 2 ej/bloque), sin contenido propio todavía. End state: un alumno en Kairos recibe una sesión con el esqueleto de bloques normal, tomando ejercicios Alfa de `difficulty=1`, cada bloque en sets×reps con 2 ejercicios, sin EMOM/AMRAP/circuitos/complejos.

**Depends on:** Phase 124 (catálogo saneado y confiable). NO depende del grafo (fase 126).

**Requirements** (3/18):

- KAIROS-01 — el nivel `kairos` existe en el enum en API, app y admin (kairos → alfa → delta → sigma → omega → spartan), incluido el mapeo a level-group
- KAIROS-02 — la generación Kairos hereda de Alfa, tomando los ejercicios Alfa de `difficulty = 1` mientras no haya contenido propio
- KAIROS-03 — las sesiones Kairos fuerzan formato solo lineal (sets×reps) con exactamente 2 ejercicios por bloque

**Success Criteria** (what must be TRUE at phase completion):

1. `kairos` existe como nivel en API, app y admin (orden kairos → alfa → delta → sigma → omega → spartan) con su mapeo a level-group.
2. Una sesión de un alumno Kairos se genera tomando los ejercicios Alfa de `difficulty = 1`.
3. Cada bloque de una sesión Kairos sale en formato solo lineal (sets×reps), sin EMOM/AMRAP/circuitos/complejos.
4. Cada bloque de una sesión Kairos tiene exactamente 2 ejercicios (según la resolución de discuss-phase para el INITIUM).

**Risks / notas:** Brownfield crítico — el enum toca `exercises.ts`, `users.ts`, `completed-sessions.ts`, `level-mapping.ts` y admin `constants/levels.ts`. El nivel ya funciona como override de lectura (`dayId = W{semana}-{día}-{nivel}`, Alfa ya es caso especial en `routes.ts`); los formatos Singlet/For Quality/lineal ya existen en la tabla `formats`. Decisiones abiertas diferidas: cómo aplica el "2 por bloque" al INITIUM (hoy fijo en 4) — ¿se baja a 2 o queda excluido?; mapeo kairos→levelGroup (probablemente alfa_delta); dosis lineales exactas (de los profes).

**Plans:** 2/2 plans complete

Plans:

**Wave 1**

- [x] 129-01-PLAN.md — KAIROS-01: add `kairos` to the API levelEnum (migration 0140, additive, DEFAULT stays alfa) + every typed level union/Record across API/app/admin + map kairos→levelGroup alfa_delta

**Wave 2** _(blocked on Wave 1 completion)_

- [x] 129-02-PLAN.md — KAIROS-02/03: kairos generation inherits Alfa (effectiveLevel alfa, dificultadLineal=1), forces linear format only + exactly 2 ex/block incl INITIUM, gated on memberLevel==='kairos' + regression/kairos integration tests
      **UI hint:** no (backend-first; enum + capa de generación; la UI del recuadrito va en la fase 130)

### Phase 130: Asignación, graduación y selector de Kairos

**Goal:** Todo alumno nuevo arranca en Kairos y avanza a Alfa de forma automática (umbral configurable) o por decisión del coach, con el nivel visible en los selectores de app y admin sin romper el layout. End state: un alumno recién creado queda en Kairos, gradúa solo al cumplir el umbral o por salto manual del coach, y el 6º recuadrito se ve en ambos selectores.

**Depends on:** Phase 129 (el nivel debe existir y generar sesiones antes de asignarlo y mostrarlo)

**Requirements** (4/18):

- KAIROS-04 — los alumnos nuevos arrancan en Kairos por defecto (cambia el default de `users.level` de `alfa` a `kairos`)
- KAIROS-05 — graduación automática de Kairos a Alfa al cumplir un umbral configurable de sesiones completadas
- KAIROS-06 — el coach puede saltar manualmente a un alumno de nivel, anulando la graduación automática
- KAIROS-07 — el selector de nivel muestra el 6º recuadrito (Kairos) en app y admin sin romper el layout

**Success Criteria** (what must be TRUE at phase completion):

1. Un alumno recién creado queda en nivel Kairos por defecto (default de `users.level` = `kairos`).
2. Un alumno gradúa automáticamente de Kairos a Alfa al alcanzar un umbral configurable de sesiones completadas.
3. El coach puede saltar manualmente a un alumno de nivel, anulando la graduación automática.
4. El selector de nivel muestra el 6º recuadrito (Kairos) en app y admin sin romper el layout (scroll/paginado donde haga falta).

**Risks / notas:** Cambiar el default de `users.level` afecta todo registro nuevo — coordinar con los flujos de registro/onboarding y trial existentes. Lógica nueva de graduación + override manual que la anula (no debe volver a "degradar" tras un salto manual del coach). Decisión abierta diferida: umbral exacto de sesiones para graduar (configurable, número a definir con producto/profes).

**Plans:** 4/4 plans complete

Plans:

**Wave 1**

- [x] 130-01-PLAN.md — Default kairos (migration 0141 + schema) + new-member level=kairos everywhere + coach level_override flag + regression tests (KAIROS-04, KAIROS-06)

**Wave 2** _(blocked on Wave 1 completion)_

- [x] 130-02-PLAN.md — Auto-graduation kairos→alfa (KAIROS_GRADUATION_THRESHOLD=12 + GraduationService one-way, skips level_override, wired into 3 completion paths, no cron) + 5 tests (KAIROS-05)
- [x] 130-03-PLAN.md — Admin selector: Kairos box in MemberFormDialog + AlumnosPage/AlumnoDetailPage glyph/name/color/filter (KAIROS-07 admin half; app half = 130-04)
- [x] 130-04-PLAN.md — App selector: Kairos FIRST box in onboarding self-pick (decision=include-kairos) + header dropdown verified (KAIROS-07 app half complete; human-verify visual UAT deferred)
      **UI hint:** yes

### Phase 131: Ajuste de dificultad in-session + registro de "dominado / bajado"

**Goal:** Durante la sesión, el miembro puede subir o bajar la dificultad de un ejercicio puntual desde el player y el árbol le sirve el vecino correcto (conservando ruta/contracción/formato/dosis del bloque), persistiendo el cambio en un registro nuevo de "dominado / bajado" (distinto del "completado" local + RPE) que alimenta el % del árbol y ve el coach. End state: existe un registro persistente de dominado/bajado por miembro referenciado a nodos del grafo; los botones "↓ más fácil / más difícil ↑" funcionan por ejercicio; el reemplazo es el vecino un escalón en la cadena; el registro se actualiza y el % del árbol + la vista del coach lo reflejan, sin tocar nivel ni SPOM.

**Depends on:** Phase 126 (primitiva vecino arriba/abajo + nodos del árbol como referencia), Phase 127 (% del árbol a alimentar)

**Requirements** (4/18):

- ADJUST-03 — persistir un registro de "ejercicio dominado / bajado" por miembro (nuevo, distinto del "completado" local + RPE de la sesión entera)
- ADJUST-01 — el miembro puede pedir "↓ más fácil" o "más difícil ↑" por ejercicio desde el player durante la sesión
- ADJUST-02 — el árbol sirve el ejercicio vecino un escalón arriba/abajo conservando ruta, contracción, formato y dosis del bloque
- ADJUST-04 — el registro de dominado alimenta el % de avance del árbol (TREE-06) y es visible para el coach

**Success Criteria** (what must be TRUE at phase completion):

1. Existe un registro persistente de "ejercicio dominado / bajado" por miembro, distinto del "completado" local + RPE de la sesión entera, que referencia un nodo/ejercicio concreto del árbol (fase 126).
2. El miembro puede pedir "↓ más fácil" o "más difícil ↑" por ejercicio desde el player durante la sesión.
3. Al pedir el ajuste, el ejercicio se reemplaza por su vecino un escalón arriba/abajo conservando ruta, contracción, formato y dosis del bloque (solo cambia el ejercicio), y queda reflejado en el registro sin cambiar automáticamente el nivel ni el SPOM.
4. El % de avance del árbol (fase 127) y la vista del coach reflejan lo que el miembro dominó/bajó.

**Risks / notas:** Hoy solo existe "completado" local + RPE de la sesión entera; el registro de dominado/bajado es nuevo y es el modelo de datos sobre el que se apoya el ajuste in-session (por eso se construyen juntos en esta fase). El player (`DayPlayer.vue`, `BlockProgressionView.vue`) hoy NO tiene botones más fácil/difícil. Anti-salto natural: manual + un escalón por toque. Decisión abierta diferida: cómo se _captura_ "dominar" exactamente (el criterio binario contra la prescripción del bloque del día ya está decidido; la mecánica de captura — qué evento la persiste — no). Out of scope confirmado: el ajuste NO cambia el nivel ni la planificación del SPOM (sigue siendo criterio del coach). Decisión abierta compartida con Kairos: dosis lineales exactas. Habilita upsell futuro (estancamiento) — fuera de alcance este milestone. Plan probable: split interno (modelo de datos del registro primero, botones + resolución de vecino + vista del coach después).

**Plans:** 3/3 plans complete

Plans:
**Wave 1**

- [x] 131-01-PLAN.md — exercise_adjustments table + migración 0142 + servicio (getNeighbor + persistir) + endpoint miembro + tests (wave 1) ✅ 2026-06-05

**Wave 2** _(blocked on Wave 1 completion)_

- [x] 131-02-PLAN.md — enriquecer % del árbol (127) con dominado + vista del coach (endpoint + admin) (wave 2)
- [x] 131-03-PLAN.md — botones más fácil/difícil en el player + swap del vecino (member app) (wave 2)

**UI hint:** yes

## v5.1 Progress

| Phase                                          | Plans Complete | Status   | Completed  |
| ---------------------------------------------- | -------------- | -------- | ---------- |
| 124. Estructura 3 dimensiones + saneo          | 2/2            | Complete | 2026-06-05 |
| 125. Bootstrap heurístico + revisión de profes | 3/3            | Complete | 2026-06-05 |
| 126. Auto-construcción del grafo (DAG)         | 3/3            | Complete | 2026-06-05 |
| 127. % de avance del árbol (miembro)           | 2/2            | Complete | 2026-06-05 |
| 128. Editor de árbol (admin)                   | 3/3            | Complete | 2026-06-05 |
| 129. Kairos — enum, herencia, formato lineal   | 2/2            | Complete | 2026-06-05 |
| 130. Kairos — asignación, graduación, selector | 4/4            | Complete | 2026-06-05 |
| 131. Ajuste in-session + registro de dominado  | 3/3            | Complete | 2026-06-05 |

_Plan counts populated by `/gsd-plan-phase`._

---

_v5.1 added: 2026-06-04 — 8 phases (124-131), 18 requirements (TREE, KAIROS, ADJUST) en 3 ejes. El árbol de habilidades (TREE) es el cimiento y va primero: estructura de datos (124) → bootstrap heurístico + revisión (125) → grafo DAG (126) → % miembro (127) / editor admin (128). Sobre el cimiento: nivel Kairos (129 enum+generación, 130 asignación+graduación+selector) y ajuste in-session (131 registro de dominado + botones + vecino del árbol, fusionado desde las ex-fases 131/132). Backend-first, brownfield (enum de niveles hardcodeado en 5 lugares). Continúa numeración desde fase 123 (v5.0). Decisiones de dominio (agrupación category/pattern, INITIUM en Kairos, umbral de graduación, captura de "dominar", dosis lineales) diferidas a cada `discuss-phase`. Fuente de verdad: `.planning/research/new-training-system-design.md`._

---

## v5.2 Overview

**Milestone:** v5.2 — UI de Métricas de Gestión (admin)
**Started:** 2026-06-04
**Phases:** 1 (132)
**Continues from:** Phase 131 (v5.1). Numbering is NOT reset.

**Scope.** Exponer en el panel de Analíticas del admin las **6 métricas de gestión de v5.0** que hoy existen solo en el backend (endpoints implementados, sin UI): ticket promedio, churn de no-renovación, tasa de renovación, LTV, frecuencia de asistencia y funnel de sesiones de prueba. Cierra el milestone v5.0 del lado de presentación. Incluye la **eliminación física** de las métricas viejas/ARPU deprecadas que ocupaban ese lugar (no solo ocultarlas).

**Pre-condición.** Backend de las 6 métricas ya en prod/staging (fases 120-123). Endpoints: `GET /admin/analytics/ticket`, `/churn`, `/renewal`, `/ltv`, `/frequency`, `/trial-funnel` (todos en `el-templo-api/src/modules/analytics/routes.ts`, guardados por roles admin, con scope país/sucursal). El frontend no consume ninguno todavía.

**Decisiones abiertas (se resuelven en `discuss-phase`).** Cómo se agrupan las 6 métricas en tabs/cards del `AnaliticasPage.vue`; qué visualización usa cada una (curva/serie/embudo/distribución); exactamente qué métricas deprecadas se borran (ARPU de `FinanzasAvanzadasTab`, `renewalRate` legacy 7/14/30 de `MiembrosTab`, etc.) y si algo se conserva por compatibilidad.

## v5.2 Phases

- [x] **Phase 132: Exponer las 6 métricas de gestión v5.0 en el admin + limpiar deprecadas** — Cablear los 6 endpoints en el frontend (`useAnalyticsApi.ts` + tipos en `types/analytics.ts`), renderizar las 6 métricas en `AnaliticasPage.vue` (tabs/componentes nuevos), y eliminar físicamente las métricas viejas/ARPU deprecadas. (completed 2026-06-05)

## v5.2 Phase Details

### Phase 132: Exponer las 6 métricas de gestión v5.0 en el admin + limpiar deprecadas

**Goal:** Las 6 métricas de gestión de v5.0 (ticket promedio, churn de no-renovación, tasa de renovación, LTV, frecuencia de asistencia, funnel de sesiones) quedan visibles y consultables en el panel de Analíticas del admin, consumiendo los endpoints backend ya existentes, con scope de país/sucursal funcionando; y las métricas viejas/ARPU deprecadas que ocupaban ese lugar quedan eliminadas físicamente del frontend (no solo ocultas). End state: un usuario admin abre Analíticas y ve las 6 métricas nuevas con sus filtros, sin restos de las métricas reemplazadas.

**Depends on:** Phases 120-123 (backend de las 6 métricas, ya desplegado/CI-verde)

**Success Criteria** (what must be TRUE at phase completion):

1. `useAnalyticsApi.ts` tiene métodos para los 6 endpoints (`getTicket`, `getChurn`, `getRenewal`, `getLtv`, `getFrequency`, `getTrialFunnel`) con sus interfaces TS en `types/analytics.ts`.
2. Las 6 métricas se renderizan en `AnaliticasPage.vue` (tabs/componentes nuevos), respetando el scope país/sucursal y los roles admin existentes.
3. Las métricas viejas/ARPU deprecadas (ej. ARPU de `FinanzasAvanzadasTab`, `renewalRate` legacy 7/14/30 de `MiembrosTab`) están eliminadas físicamente del frontend, no ocultas.
4. No quedan llamadas muertas ni componentes huérfanos de las métricas reemplazadas.

**Risks / notas:** Mayormente frontend, **+ 3 extensiones acotadas de backend** (decididas en `132-CONTEXT.md`, SIN migraciones): filtro por plan como entrada en las 6 métricas + filtro por turno en funnel/frecuencia (D-10); el cruce turno×sucursal del funnel sale vía filtro+breakdown, sin agregación 2D (D-11); enriquecer `frequency-service` con nombre/teléfono para la lista accionable (D-12). Borrado físico de deprecadas mapeado (D-15→D-21): fuera cards Renovación 7/14/30 + Tasa de retención simple (`MiembrosTab`), ARPU mensual (`FinanzasAvanzadasTab`, conservando Caja vs Devengado), `FunnelTab` viejo, y archivo huérfano `AsistenciaTab`; se conserva `RetencionTab` (curvas por ciclo, no duplicado). Visualización pre-cerrada por Nacho en `DECISIONES-VISUALIZACION.md`. Cálculos pesados ya resueltos en backend (Kaplan-Meier LTV, cohortes churn).

**Plans:** 6/6 plans complete

Plans:

**Wave 1**

- [x] 132-01-PLAN.md — Backend D-10/D-11: filtro plan (5 servicios) + turno (trial-funnel) como entrada + routes/schemas + tests

**Wave 2** _(blocked on Wave 1 completion)_

- [x] 132-02-PLAN.md — Backend D-12/D-10: enriquecer frequency coolingDown con nombre/teléfono + filtro plan/turno + tests

**Wave 3** _(blocked on Wave 2 completion)_

- [x] 132-03-PLAN.md — Frontend SC-1: 6 métodos en useAnalyticsApi + 6 interfaces TS (output shapes) + filtros turno/window

**Wave 4** _(blocked on Wave 3 completion)_

- [x] 132-04-PLAN.md — Tabs ConversionTab (funnel D-06) + IngresosTab (ticket D-01 + LTV D-05, por moneda)
- [x] 132-05-PLAN.md — Tabs RetencionGestionTab (churn+renovación D-02/D-03) + FrecuenciaTab (bandas + lista enfriándose + CSV D-04/D-13/D-14)

**Wave 5** _(blocked on Wave 4 completion)_

- [x] 132-06-PLAN.md — AnaliticasPage: montar 4 tabs (D-07/D-08) + filtros plan/turno (D-09) + borrado físico D-15/D-16/D-17/D-18 (sin tocar AsistenciaTab/getMemberAnalytics)

**UI hint:** yes

## v5.2 Progress

| Phase                                           | Plans Complete | Status   | Completed  |
| ----------------------------------------------- | -------------- | -------- | ---------- |
| 132. Exponer 6 métricas v5.0 en admin + limpiar | 6/6            | Complete | 2026-06-05 |

_Plan counts populated by `/gsd-plan-phase`._

### Phase 133: Calidad del árbol — hitos canónicos, variantes, bandas de dificultad y sub-grupos (backend + admin)

**Goal:** Convertir las escaleras largas con empates (TTB CON = 102 ejercicios / 11 niveles) en escaleras de 8-13 hitos canónicos con variantes colgando, y hacer la dificultad visible en el mapa. R1: migración `milestone_exercise_id` + heurística que propone hito por (movimiento × escalón) + revisión hito/variante en el drawer de /tree-map + backbone/getNeighbor/rebuild filtran variantes. R2: bandas de dificultad por nodo usando niveles existentes CON kairos (dl 1-2 kairos, 3 alfa, 4-6 delta, 7-8 sigma, 9-10 omega, 11-12 spartan; color + dl numérico). R3: sub-grupos por `category` fina (Pull Vertical/Horizontal, etc.) dentro de las 5 categorías. R4: prerequisitos cross-ruta en gris para rutas de élite (FLR, PLPU). Señalizar split TTB (TTB/Windshield/ATW) para decisión de profes. Research + decisiones cerradas: `.planning/research/tree-quality-research.md` §3-4.
**Requirements**: R1-MIG, R1-HEUR, R1-REV, R1-FILTER, R2-BANDS, R3-SUBGRP, R4-XRUTA, TTB-SIG (derivados del goal — sin IDs mapeados en REQUIREMENTS.md)
**Depends on:** Phase 132
**Plans:** 7/7 plans complete

Plans:

**Wave 1**

- [x] 133-01-PLAN.md — Migración 0145: columna milestone_exercise_id + tabla exercise_milestone_proposals (wave 1)
- [x] 133-02-PLAN.md — R2 admin: DL_BANDS + levelColor extraído + stripe/badge dl + leyenda (wave 1)

**Wave 2** _(blocked on Wave 1 completion)_

- [x] 133-03-PLAN.md — Heurística de hitos (movimiento × escalón) + CLIs idempotentes bootstrap-milestones / bootstrap-elite-prereqs (wave 2)
- [x] 133-04-PLAN.md — Predicado backbone compartido + filtro de variantes en 4 caminos + subGroup en EditableTree (wave 2)

**Wave 3** _(blocked on Wave 2 completion)_

- [x] 133-05-PLAN.md — Endpoints de revisión hito/variante: accept/reject transaccional + poda + promote + variants (wave 3)

**Wave 4** _(blocked on Wave 3 completion)_

- [x] 133-06-PLAN.md — Drawer hito/variante + señal split TTB + panel lateral con variantes/promoción (wave 4)

**Wave 5** _(blocked on Wave 4 completion)_

- [x] 133-07-PLAN.md — Sub-grupos R3 (labels + filtro) + aristas R4 gris punteado + badge prereq (wave 5)

### Phase 134: Árbol del miembro — estados de nodo y criterio de avance objetivo (member app)

**Goal:** Llevar la calidad del árbol a la experiencia del miembro. R6: estados de nodo tipo videojuego en Mi Árbol (Bloqueado/Disponible/En progreso/Dominado derivados de prerequisitos + el `reached` existente de tree-progress) + bandas de dificultad visibles (mismo mapeo kairos→spartan de la fase 133). R5: criterio de avance objetivo por hito (3×8 reps dinámico / 3×30s isométrico, patrón RR) mostrado en el player como definición falsable de "dominado" — complementa el tap manual de fase 131, no lo reemplaza. Research: `.planning/research/tree-quality-research.md` §3.
**Requirements**: R5, R6 (ver 134-CONTEXT.md, decisiones D-01..D-08)
**Depends on:** Phase 133
**Plans:** 3/3 plans complete

Plans:

- [x] 134-01-PLAN.md — R6 backend: `state` (4 estados D-01..D-04) + `band` por nodo en buildMemberTree + carga de aristas para gating D-06; extiende schema y test de integración
- [x] 134-02-PLAN.md — R6 member-app: refresh de Mi Árbol (ícono/color por estado + dl + banda, anillo re-etiquetado "a tu alcance") sobre el contrato de 134-01
- [x] 134-03-PLAN.md — R5 player: criterio de avance objetivo (3×30s ISO / 3×8 CON·EXC) junto al ajuste de fase 131, derivado de la contracción en runtime

### Phase 135: Árbol del admin — jerarquía visual de hitos y variantes en /tree-map

**Goal:** Hacer que el árbol del admin (`/tree-map`, `EditableTree`) muestre rutas largas como una jerarquía de hitos canónicos con sus variantes colgando/colapsables, en vez de ~70 ejercicios planos ordenados por `dificultadLineal` (caso testigo: Front Lever). Dos bloques: **(A) Poblar datos** — auto-aplicar la heurística movimiento×escalón de fase 133 a `exercises.milestone_exercise_id` (hoy `bootstrap-milestones.ts` solo _propone_ en `exercise_milestone_proposals`, nunca escribe la columna de verdad); el drawer de revisión de 133 queda como herramienta de corrección, no de carga inicial. **(B) Render jerárquico** — el endpoint `GET /admin/tree-editor/tree` hoy excluye variantes (`milestone_exercise_id IS NULL` vía `backboneNodeConditions()`); devolver variantes agrupadas bajo su hito + nodo hito **colapsable** en `EditableTree`/`ExerciseFlowNode`, reusando bandas (color/dl) y sub-grupo `category`. Diagnóstico raíz: la infra de 133 existe pero los hitos nunca se poblaron (columna NULL en todos) y el canvas nunca dibujó la jerarquía (variantes solo en el panel lateral C5).
**Requirements**: A-POBLADO (auto-aplicar heurística + idempotencia/rollback), A-CORRECCION (drawer existente ajusta), B-ENDPOINT (payload jerárquico hito→variantes), B-RENDER (nodo hito colapsable + bandas + sub-grupo), B-NOREGRESION (no romper el filtro backbone que consumen member-tree/getNeighbor/rebuild). Derivados del goal — sin IDs en REQUIREMENTS.md.
**Depends on:** Phase 133 (infra hito/variante + heurística + drawer), Phase 134.
**Decisiones abiertas (resolver en discuss-phase):** (1) poblado auto vs manual y su idempotencia/rollback; (2) correr el poblado en local primero vs migración de datos a prod (toca datos reales → migración, no seed); (3) alcance del canvas-rework: colapsables anidados sobre el layout actual vs layout de grafo tipo skill-tree con Vue Flow (el "diferido" de 133/134); (4) ¿la heurística clasifica bien Front Lever o necesita ajuste antes de auto-aplicar? Validar con dry-run local.
**Plans:** 3/4 plans executed

Plans:

- [x] 135-01-PLAN.md — Block A: dry-run plan printer + transactional --apply (bulk accept pending milestone proposals) + idempotency test
- [ ] 135-02-PLAN.md — Block A→prod: catalog-parity check (D-07) + 0146 DATA migration populating milestone_exercise_id + rollback doc
- [x] 135-03-PLAN.md — Block B backend: variants[] embedded in GET /tree via separate batched query (backbone predicate untouched) + no-regression test
- [x] 135-04-PLAN.md — Block B frontend: collapsible hito node (chevron + "+N variantes", collapsed default) with banded variants on the /tree-map canvas

### Phase 136: Rediseño del sistema de segmentación — etiqueta de Asistencia (Óptima/Regular/Alerta/Ausente) que reemplaza el segmento actual + nueva dimensión de Antigüedad

**Goal:** Reemplazar el "segmento" de asistencia actual (`nuevo`/`espartano`/`intermitente`/`en_riesgo`/`digital_warrior`/`ghost`) por una etiqueta de **Asistencia** basada 100% en el % de uso de la membresía sobre la ventana móvil de 28 días que ya usa el motor: **Óptima** (≥75%), **Regular** (50–74%), **Alerta** (1–49%, requiere observación), **Ausente** (0%, detona seguimiento). La etiqueta de Asistencia reemplaza el segmento en TODO el admin (Alumnos, Analytics, Notificaciones, Horarios). Además se agrega una dimensión NUEVA de **Antigüedad** derivada de `users.createdAt` (**Nuevo** 0–1m / **1–3m** / **3–6m** / **+6m**) que NO reemplaza nada. Ambas etiquetas se muestran como chips por alumno en la lista de asistencia de Horarios (`SlotDetailDialog`). Pertenece al dominio del milestone de Métricas de Gestión (v5.0).

**Alcance / impacto (10 áreas):** enum DB `member_segment` + migración con mapeo de datos existentes; motor `segmentation/service.ts` + `types.ts` (desaparecen nuevo/ghost/digital_warrior/golden-case); analytics (engagement worklist/counts/breakdowns/schemas); notificaciones (templates de transición + cron nocturno 3AM `notification-cron.ts`); `members/service.ts` (filtro + subquery); frontend admin (`types/member.ts` labels/colors/descriptions, `types/analytics.ts`, AlumnosPage filtro, AlumnoDetailPage, NotificacionesPage, `MemberTags.vue`); `el-templo-app` useUserStore; tests (segmentation/golden-case/engagement/notifications); seeds.

**Decisiones de producto abiertas (resolver en discuss-phase):** (1) notis automáticas de transición + cron nocturno atados a en_riesgo/ghost/recovery/ghost_monthly_reattempt — ¿rediseñar con los nuevos estados o desactivar?; (2) Antigüedad — ¿solo Horarios o también Alumnos/detalle/analytics? ¿persistir o calcular al vuelo?; (3) miembro sin plan activo (sin `classesPerWeek`) — ¿Ausente o sin etiqueta?; (4) cortes 75/50/1 — ¿configurables vía `system_settings` (como hoy `espartano_pct`) o fijos en código?

**Requirements**: D-01..D-12 (decisiones bloqueadas del CONTEXT, sin IDs formales en REQUIREMENTS.md)
**Depends on:** Phase 135
**Plans:** 7/7 plans executed — verificada (12/12 must-haves PASS, status human_needed: 8 ítems de UAT visual)

Plans:

- [x] 136-01-PLAN.md — Motor de segmentación a 4 bandas de % (Óptima/Regular/Alerta/Ausente) + enum DB + migración con recálculo en limpio (FUNDACIONAL)
- [x] 136-02-PLAN.md — Notificaciones: reconectar disparadores a los nuevos estados (copy/template_key preservados) + cron 3AM
- [x] 136-03-PLAN.md — Analytics: counts + worklist de seguimiento (alerta/ausente) + schemas + priorityRank remap
- [x] 136-04-PLAN.md — members/service filtro+subquery + members/schemas enum + member app (useUserStore + SegmentGreeting)
- [x] 136-05-PLAN.md — Frontend admin: tipos display/analytics + AlumnosPage/AlumnoDetailPage/NotificacionesPage + MiembrosTab
- [x] 136-06-PLAN.md — Antigüedad al vuelo en Horarios + MemberTags (Antigüedad+Asistencia, sin avatar) + quitar badge QR/Manual
- [x] 136-07-PLAN.md — Eliminar el subsistema de settings de thresholds (módulo API + página/composable admin + ruta + nav)

---

_v5.2 added: 2026-06-04 — 1 phase (132). Cierra v5.0 del lado de UI: expone en el admin las 6 métricas de gestión que quedaron backend-only (fases 120-123) y elimina físicamente las métricas viejas/ARPU deprecadas. Frontend-only, sin migraciones. Continúa numeración desde fase 131 (v5.1). Milestone separada para no mezclar la UI de métricas con el Nuevo Sistema de Entrenamiento (v5.1). Agrupación/visualización de tabs y alcance exacto de borrado diferidos a `discuss-phase`._

---

## v5.2 (Módulo Contable) Overview

**Milestone:** v5.2 — Módulo Contable / Libro de Caja
**Started:** 2026-06-23
**Phases:** 6 (137-142)
**Continues from:** Phase 136 (v5.2 UI Métricas/Árbol/Segmentación). Numbering is NOT reset.
**Granularity:** fine (config.json)

**Scope.** Convertir al Administrador en el **libro de caja único** (fuente de verdad): el profe carga un pago **una sola vez** y esa carga activa la membresía al instante + impacta la caja, eliminando el triple tipeo (Forms + Contabilium + Admin). Se monta **ENCIMA** del modelo financiero transaccional v4.8 (`financial_transactions`, `transaction_links`, `balances`, `subscriptions`, `recordAssignmentCharge`) — ~60% ya existe, **cero dependencias nuevas**. Agrega: (1) máquina de estados de validación (PENDIENTE/OBSERVADO/CORREGIDO/VALIDADO) ortogonal al soft-void existente (ANULADO); (2) entidad caja (efectivo×sucursal + central + banco×moneda) con saldo firme derivado; (3) movimientos inter-caja (una fila) + egresos (destino NULL); (4) carga única que propaga + cobro suelto + rol profe; (5) reportes para la admin (pendientes, saldos, historial); (6) perillas de config + regla de transición Contabilium.

**Pre-condición.** Modelo financiero v4.8 en prod (`financial_transactions` con `paymentMethod`, `branchId`, soft-void; `transaction_links` M:N; `balances` con `applyDelta` atómico; aislamiento de moneda cableado). Métricas de gestión v5.0 (fases 120-123) consumen el filtro canónico de ingresos `direction='inflow' AND voided_at IS NULL`.

**Riesgo central (alto blast radius).** Introducir `validation_status` redefine "dinero firme" → el filtro canónico pasa a `voided_at IS NULL AND validation_status='validado'`, que consumen ~6 lugares **incluidas las 6 métricas de gestión de v5.0**. Mitigación: migración `DEFAULT 'validado'` + backfill + auditar todos los call sites + tests de regresión. Por eso **VAL va primero** (fase 137) y bloquea todo lo demás.

**Decisiones de arquitectura ya cerradas (no se re-litigan; ver `.planning/research/modulo-contable/`):**

- **ANULADO ortogonal al `validation_status`** (dos ejes, NO un enum único). No se reescribe `void()`. "Dinero firme" = `validation_status='validado' AND voided_at IS NULL`.
- **Movimiento inter-caja = una sola fila** (origen+destino, neto 0); **egreso = misma fila con destino NULL**. Reusan `financial_transactions` extendiendo `kind` (`cash_transfer`, `expense`).
- **Banco por moneda** (banco ARS + banco EUR); cada caja tiene `currency` fija; ninguna caja mezcla monedas.
- **Saldo de caja derivado** (suma) en v1; materializar solo con evidencia de performance.
- **"Corregir" un OBSERVADO = anular+recrear**, no UPDATE (preserva inmutabilidad del ledger).
- **Activar membresía ≠ validar pago.** Membresía instantánea; pago entra PENDIENTE (profe) o VALIDADO (admin).
- **Carga única** = extender `recordAssignmentCharge`, NO endpoint paralelo.

**Decisiones abiertas (se resuelven en el `discuss-phase` de cada fase, NO ahora):** idempotencia de la carga única; `validation_status` como columna vs. tabla satélite; `memberId` para egresos (member-sentinel vs. nullable); casa de las perillas tras el borrado del subsistema de settings (fase 136-07); umbral de antigüedad del pendiente + destinatario de la alerta; corte limpio vs. convivencia con Contabilium + asientos de apertura; rol profe existente vs. nuevo; unidad de `amount` (centavos vs. entero).

## v5.2 (Módulo Contable) Phases

- [x] **Phase 137: Máquina de estados de validación (cimiento)** — `validation_status` ortogonal al soft-void + filtro canónico de "dinero firme" reescrito sin romper las 6 métricas v5.0 + transiciones validar/observar/corregir/anular con rastro de auditoría. (completed 2026-06-24)
- [x] **Phase 138: Entidad caja + saldos** — tabla `cash_registers` (efectivo×sucursal + central + banco×moneda, `currency` fija) + `cash_register_id` en el ledger + saldo firme derivado (solo VALIDADOS) con pendientes mostrados aparte + aislamiento de moneda.
- [x] **Phase 139: Movimientos inter-caja y egresos** — movimiento (asiento de 2 filas linkeadas, neto 0) con reconciliación esperado-vs-contado + egreso (1 fila outflow, nota libre) + void ortogonal del par, sin contaminar `balances`. (completed 2026-06-24)
- [x] **Phase 140: Carga única que propaga + cobro suelto + rol profe** — UI dead-simple que registra el pago una vez y propaga atómico (membresía + caja) de forma idempotente + cobro suelto + rol profe acotado (carga PENDIENTE, no valida/anula). (completed 2026-06-24)
- [x] **Phase 141: Reportes para la admin** — bandeja de pendientes por antigüedad (+ observados, + alerta configurable) + saldo firme/pendiente por caja + historial de movimientos/egresos, reusando el export Excel/PDF existente. (completed 2026-06-24)
- [x] **Phase 142: Config + transición Contabilium** — perillas de configuración (política de validación; activación instantánea/diferida) con casa definida y funcional + regla documentada de "qué dato manda" durante la convivencia con Contabilium por etapa. (completed 2026-06-25)

## v5.2 (Módulo Contable) Phase Details

### Phase 137: Máquina de estados de validación (cimiento)

**Goal:** Una transacción de cobro tiene un estado de validación (PENDIENTE/OBSERVADO/CORREGIDO/VALIDADO) **ortogonal** al soft-void existente (ANULADO), y el filtro canónico de "dinero firme" pasa a contar solo VALIDADOS — **sin alterar los números de las 6 métricas de gestión de v5.0** (todos los call sites auditados, migración con backfill `validado`, CI verde). End state: un pago cargado por profe nace PENDIENTE y NO suma al saldo firme hasta que el admin lo valida; el admin puede observar/corregir (anular+recrear) y anular (con rastro), y la membresía se activa al instante independiente del estado del pago.
**Depends on:** Nothing nuevo del milestone (se monta sobre v4.8 + v5.0 ya en prod). **Bloquea 138-142.**
**Requirements:** VAL-01, VAL-02, VAL-03, VAL-04, VAL-05, VAL-06, VAL-07
**Success Criteria** (what must be TRUE at phase completion):

1. `financial_transactions` tiene `validation_status` (pendiente/observado/corregido/validado), coexistiendo con el soft-void (`voided_at`) sin reescribir `void()`; un pago puede estar VALIDADO y luego anularse (ANULADO = `voided_at IS NOT NULL`, eje separado). (VAL-01)
2. Un pago cargado por profe nace PENDIENTE y uno cargado por admin nace VALIDADO; el rol se resuelve server-side, no se confía en el cliente. (VAL-02)
3. El admin puede validar un PENDIENTE (pasa a dinero firme), observarlo, y corregirlo mediante anular+recrear (no UPDATE), dejando rastro en la tabla de eventos de validación. (VAL-03, VAL-04)
4. El filtro canónico de ingresos/saldo firme cuenta solo `validation_status='validado' AND voided_at IS NULL`, centralizado en un helper reutilizable; un test de regresión confirma que cargar un PENDIENTE NO mueve el summary/saldo y que las 6 métricas v5.0 dan los mismos números que antes (backfill `validado`). (VAL-05)
5. Solo el admin puede anular (motivo + autor + fecha); al anular un pago con membresía asociada, un popup decide 1-a-1 si la membresía sigue activa (default: activa). (VAL-06)
6. La membresía se activa al instante al cargar el pago, independiente del `validation_status` del cobro (un PENDIENTE ya salda la deuda del socio en `balances`, pero NO suma a caja firme). (VAL-07)

**Plans:** 3/3 plans complete

- [x] 137-01-PLAN.md — Schema validation_status + migración 0153 + audit action types + helper canónico firm-money.ts + test scaffolds (VAL-01, VAL-05)
- [x] 137-02-PLAN.md — Máquina de estados: validate/observe/correct + void extendido (\_void atómico) + derivación rol→status server-side + keepMembershipActive (VAL-02, VAL-03, VAL-04, VAL-06, VAL-07)
- [x] 137-03-PLAN.md — Refactor 13 call sites al filtro firme + excepción documentada (subscriptions:2127) + test de regresión R1-R4 de las 6 métricas v5.0 (VAL-05, VAL-07)

### Phase 138: Entidad caja + saldos

**Goal:** Existe la caja como entidad de primera clase (efectivo por sucursal + efectivo central + banco por moneda), cada pago se asocia a una caja distinta de su `branchId`, y el saldo firme de cada caja (suma de VALIDADOS, derivado) es consultable con los pendientes mostrados aparte. End state: el admin puede ver cuánto "debería haber" en cada caja, con monedas nunca mezcladas.
**Depends on:** Phase 137 (el saldo firme ya filtra por `validado`).
**Requirements:** CAJA-01, CAJA-02, CAJA-03, CAJA-04
**Success Criteria** (what must be TRUE at phase completion):

1. Existe `cash_registers` con tipos efectivo/banco, `branch_id` (NULL para central y banco global) y `currency` NOT NULL fija; hay seed de cajas efectivo×sucursal, efectivo central, banco ARS y banco EUR. (CAJA-01)
2. `financial_transactions` tiene `cash_register_id` (la plata) conceptualmente desacoplado de `branchId` (dónde se cobró); una transferencia cobrada en una sucursal puede caer en la caja banco. (CAJA-02)
3. `CashRegisterService.getBalance` devuelve el saldo firme derivado (Σ VALIDADOS de esa caja) y los PENDIENTES por separado, sin que estos sumen al firme. (CAJA-03)
4. El sistema rechaza asociar a una caja un monto de moneda distinta a la suya (espejo del guard de `applyDelta`); ningún saldo ni reporte suma monedas distintas. (CAJA-04)

**Plans:** 3/3 plans executed

- [x] 138-01-PLAN.md — Schema cash_registers + cash_register_id en el ledger + migración 0154 (tabla/columna/seed 8 cajas/backfill) + scaffold de tests (CAJA-01, CAJA-02)
- [x] 138-02-PLAN.md — CashRegisterService.resolveCashRegister + guard de moneda, cableado en el único insert de create() + DI en 6 sitios (CAJA-02, CAJA-04)
- [x] 138-03-PLAN.md — CashRegisterService.getBalance (saldo firme derivado + pendientes aparte, gateado por cutoff) + suite de integration tests (CAJA-01..04)
      **UI hint:** yes

### Phase 139: Movimientos inter-caja y egresos

**Goal:** El admin puede mover plata entre cajas (una sola operación origen+destino, neto sistema 0) registrando esperado-vs-contado, y registrar egresos (salida real, destino NULL, nota libre) que restan del saldo; ambos se pueden anular con rastro y ninguno contamina los `balances` del socio. End state: el saldo de cada caja refleja movimientos y egresos, y un retiro mal cargado se anula sin descuadrar.
**Depends on:** Phase 138 (necesita cajas con saldo).
**Requirements:** MOV-01, MOV-02, MOV-03, MOV-04
**Success Criteria** (what must be TRUE at phase completion):

1. Un movimiento inter-caja se registra como un **asiento de doble entrada — 2 filas `kind='cash_transfer'` linkeadas** (outflow en origen + inflow en destino, vía `transaction_links`) en una sola `db.transaction` (D-02: el ROADMAP decía "una sola fila" — resuelto a 2 filas linkeadas, misma operación atómica neto 0); la suma de saldos de todas las cajas de la misma moneda no cambia tras el movimiento (invariante testeada). Movimiento solo entre cajas de igual moneda. (MOV-01)
2. El movimiento captura `expected_amount` (saldo derivado al momento) vs. `counted_amount` (físico) y persiste la diferencia con rastro, sin "ajustar" silenciosamente el saldo. (MOV-02)
3. Un egreso (`kind='expense'`, destino NULL) resta del saldo de su caja con monto + nota libre (sin categoría en v1); `cash_transfer`/`expense` están en `KINDS_ALLOWED_WITHOUT_LINKS` y NO tocan `balances` (verificado por test). (MOV-03)
4. Movimientos y egresos se anulan con el mismo soft-void ortogonal que los pagos (motivo + autor + fecha), nunca con delete. (MOV-04)

**Plans:** 3/3 plans complete
Plans:

- [x] 139-01-PLAN.md — Cimiento: migración 0155 (enum +cash_transfer/+expense, member_id NULL) + tipos + MUST-FIX A (getSummary) + MUST-FIX B (applyDelta) + voidPair
- [x] 139-02-PLAN.md — getBalance resta outflows validados desde el corte (// TODO 139) + invariante neto-0 + refund-outflow
- [x] 139-03-PLAN.md — MovementService (movimiento 2 filas + reconciliación + guard igual-moneda + egreso + void-the-pair) + rutas admin-only + tests MOV-01..04
      **UI hint:** yes

### Phase 140: Carga única que propaga + cobro suelto + rol profe

**Goal:** El corazón del milestone: el profe registra un pago desde una UI dead-simple en pocos toques y ese único registro propaga atómicamente (activa/renueva membresía + impacta el saldo de la caja correcta) de forma idempotente, soportando también cobros sueltos no atados a membresía; el rol profe existe con permisos acotados (carga PENDIENTE, no valida ni anula). End state: el profe carga un pago una sola vez y la admin deja de re-tipear.
**Depends on:** Phase 137 (validation_status por rol), Phase 138 (resolución de caja por defecto), Phase 139 (modelo de caja completo).
**Requirements:** CARGA-01, CARGA-02, CARGA-03, CARGA-04
**Success Criteria** (what must be TRUE at phase completion):

1. El profe registra un pago desde una pantalla dead-simple del admin en pocos toques (socio, monto, medio de pago, caja con default resuelto por `paymentMethod`+`branchId`), sin re-tipear en otro sistema. (CARGA-01)
2. Un solo registro propaga atómicamente en una `db.transaction` idempotente (clave de deduplicación): activa/renueva la membresía + impacta el saldo de la caja correspondiente; un doble click/retry no duplica. (CARGA-02)
3. La misma UI soporta cobros sueltos (pago sin membresía asociada) reusando el modelo existente sin schema nuevo. (CARGA-03)
4. El rol profe existe en el admin con permisos acotados: puede cargar pagos (entran PENDIENTE), NO puede validar, observar, anular ni ver saldos de caja; un test de autorización confirma el bloqueo. (CARGA-04)

**Plans:** 3/3 plans complete
Plans:

- [x] 140-01-PLAN.md — Backend foundation: migration 0156 idempotency_key, FINANCE_LOAD_ROLES, recorderRole+idempotencyKey threading through renewSubscription, cobro-suelto plumbing
- [x] 140-02-PLAN.md — coach-load-routes.ts plugin (renew / cobro-suelto / autocompletar / mis-cargas) + endpoint idempotency dedup + auth/idempotency integration tests
- [x] 140-03-PLAN.md — CargarPagoPage.vue PoS screen + useFinanceLoadApi composable + route/nav per UI-SPEC (human-verify checkpoint)
      **UI hint:** yes

### Phase 141: Reportes para la admin

**Goal:** La admin tiene la vista de control completa: bandeja de pendientes ordenada por antigüedad (con observados y alerta configurable por umbral), saldo firme y pendiente por caja, e historial de movimientos/egresos por caja/período, todo exportable reusando el export Excel/PDF existente. End state: la validación reemplaza al cierre de caja diario como control cotidiano.
**Depends on:** Phase 137 (estados), Phase 138 (saldos por caja), Phase 139 (movimientos/egresos).
**Requirements:** REP-01, REP-02, REP-03, REP-04
**Success Criteria** (what must be TRUE at phase completion):

1. La admin ve una bandeja de pendientes ordenada por antigüedad junto a los observados, con alerta configurable cuando un pendiente supera el umbral definido. (REP-01)
2. La admin ve el saldo firme y pendiente por caja (efectivo×sucursal, central, banco×moneda), con la moneda siempre al lado y sin totales cross-currency. (REP-02)
3. La admin ve el historial de movimientos inter-caja y egresos filtrable por caja/período. (REP-03)
4. Los reportes nuevos se exportan reusando el export Excel/PDF existente (exceljs / pdfmake), sin un mecanismo de export paralelo. (REP-04)

**Plans:** 4/4 plans complete

- [x] 141-01-PLAN.md — Backend: GET /pending-tray (bandeja, oldest-first + aging + overdue) + GET /cash-registers/balances (saldos por caja over getBalance) + sibling Excel exports + tests
- [x] 141-02-PLAN.md — Backend: GET /movements-history (listMovEgresos own LEFT-JOIN query, NULL-member rows, caja/período) + Excel export + LEFT-JOIN test
- [x] 141-03-PLAN.md — Frontend: useTransactionsApi extension (reads + validate/observe/correct + keepMembershipActive + exports) + CajaPage q-tabs hub shell + Movimientos (verbatim) + Saldos tabs
- [x] 141-04-PLAN.md — Frontend: Bandeja tab (Validar one-tap, ⋮ actions, overdue alert, membership popup) + Mov-Egresos tab + human-verify checkpoint
      **UI hint:** yes

### Phase 142: Config + transición Contabilium

**Goal:** Las perillas de configuración del módulo tienen una casa definida y funcional tras el borrado del subsistema de settings (fase 136-07), y está documentada la regla de "qué dato manda" durante la convivencia con Contabilium por etapa de reemplazo. End state: el equipo sabe dónde se configura la política de validación / activación, y hay una regla escrita de transición que evita recrear el doble tipeo.
**Depends on:** Phase 137 (las perillas gobiernan validación/activación; pueden plegarse aquí o en 137 según discuss-phase).
**Requirements:** MIG-01, MIG-02
**Success Criteria** (what must be TRUE at phase completion):

1. Las perillas de configuración (política de validación: todos vs. dudosos; activación de membresía instantánea vs. diferida) tienen una casa de configuración definida (tabla `finance_settings` o equivalente, scoped) y funcional desde el admin, NO cableadas en código. (MIG-01)
2. Está documentada la regla de "qué dato manda" durante la convivencia con Contabilium por etapa (registro de ingresos/caja vive solo en el Administrador desde el corte; facturación AFIP queda en Contabilium, fuera de scope), incluyendo el criterio de corte limpio + asientos de apertura por caja. (MIG-02)

**Plans:** 3/3 plans complete

Plans:

- [x] 142-01-PLAN.md — backend: migración 0157 seed + FinanceConfigService (read-with-fallback) + GET/PUT config (owner/admin) + wire los 2 seam sites de listPendingTray + tests (wave 1)
- [x] 142-02-PLAN.md — MIG-02: doc de transición Contabilium + template de migración de saldos de apertura (fuera de src/db/migrations/) (wave 1)
- [x] 142-03-PLAN.md — frontend: mini pantalla "Configuración de Caja" (un campo) + composable + ruta/nav owner/admin (wave 2)

## v5.2 (Módulo Contable) Progress

| Phase                                       | Plans Complete | Status      | Completed  |
| ------------------------------------------- | -------------- | ----------- | ---------- |
| 137. Máquina de estados de validación       | 3/3            | Complete    | 2026-06-24 |
| 138. Entidad caja + saldos                  | 2/3            | In Progress |            |
| 139. Movimientos inter-caja y egresos       | 3/3            | Complete    | 2026-06-24 |
| 140. Carga única + cobro suelto + rol profe | 3/3            | Complete    | 2026-06-24 |
| 141. Reportes para la admin                 | 4/4            | Complete    | 2026-06-24 |
| 142. Config + transición Contabilium        | 3/3            | Complete    | 2026-06-25 |

_Plan counts populated by `/gsd-plan-phase`._

### Phase 143: Profesor por clase + Puntuación post clase presencial

**Goal:** Construir la cadena profesor↔clase que hoy NO existe en el sistema y permitir que un miembro puntúe al profesor estilo Uber después de asistir a una clase presencial. End state: los owners asignan profesores a sucursales desde Horarios (admin); el profe se marca como quien dictó una instancia de clase escaneando el QR con su app (validado contra su sucursal asignada); la app del miembro muestra el profe de cada clase y abre un pop-up de puntuación al volver a la app tras una clase presencial completada; las puntuaciones quedan persistidas por profe/instancia.

**Depends on:** none (feature standalone de app/admin; independiente del Módulo Contable v5.2). Reutiliza el role `coach` y `user_branches` existentes.
**Requirements:** PROF-DATA, PROF-ROSTER, PROF-RATING, PROF-OWNERVIEW, PROF-SELFSCAN (derivados en plan-phase del GOAL + decisiones de CONTEXT)

> **Nota (plan-phase):** la línea del Goal "la app del miembro muestra el profe de cada clase" fue **revertida** por la decisión D-A3 del discuss: el miembro **nunca** ve al profe. El pop-up se arma alrededor de la **clase** (actividad/día). Las plans honran D-A3, no la redacción original del Goal.

**Decisiones ya tomadas (no se re-litigan):**

- Alcance: **solo clases presenciales**. Lo medido es la **puntuación del profesor** (NO el RPE; NO rating de la clase en general). NO reutiliza el RPE online de `completed_sessions`.
- Profe identificado **por instancia (fecha real)**, no por horario recurrente fijo: el rating va al profe que realmente dictó esa clase ese día.
- El **propio profe escanea el QR de la clase con su app** (como un alumno) para marcarse como quien la dictó, **validado contra la sucursal asignada** al profe.
- **Asignación profe↔sucursal = feature nueva para owners en Horarios** (admin).
- La app del miembro **muestra el profe** de cada clase (dato hoy fuera del sistema).
- Disparo del feedback: **pop-up estilo Uber** al abrir la app por primera vez tras completar una clase presencial.

**Decisiones abiertas (se resuelven en discuss-phase):** escala de puntuación; pop-up salteable vs. bloqueante y reintentos; comentario opcional; un profe o varios por clase (co-dictado); fallback si nadie escaneó el QR; reporte de puntuaciones agregadas por profe para owners.

**Fuente de verdad del diseño:** `BRIEF-PUNTUACION-PROFES.md` (raíz del repo).

**Estado del código (verificado):** `schedules` sin `coachId`; `attendance` sin profe; `WeeklySlotView`/`ReservasPage` no traen ni muestran profe; role `coach` SÍ existe (sin `bio`); `user_branches` mapea coach↔sucursales pero no a horarios.

**Plans:** 5/5 plans complete

Plans:

- [x] 143-01-PLAN.md — Schema del roster (class_coach_assignments) + coach_ratings + migración 0152 [BLOCKING]
- [x] 143-02-PLAN.md — Módulo API ratings: roster CRUD + pending/submit con atribución + vista owner + tests
- [x] 143-03-PLAN.md — QR self-scan del profe validado contra user_branches + tests
- [x] 143-04-PLAN.md — Admin: grilla de roster en Horarios (Surface 1) + PuntuacionesPage owner-only (Surface 3)
- [x] 143-05-PLAN.md — App miembro: RatingPromptDialog class-framed (Surface 2) + useRatingsApi + montaje

### Phase 144: Notificaciones y bloqueo de vencimiento de membresía/plan

**Goal:** Avisar al miembro que su membresía/plan está por vencer y empujarlo a renovar por WhatsApp, e impedir que reserve clases cuya fecha cae después del vencimiento. End state: (1) un cron diario encola push de vencimiento a 7 días, 3 días y el día del vencimiento (réplica del patrón ya existente para programas, pero sobre la fecha cubierta de la cadena de `subscriptions`); (2) al abrir la app, si faltan ≤3 días, el miembro ve un pop-up salteable (1 vez por día) con un botón que abre WhatsApp para renovar; (3) al intentar reservar una clase presencial cuya fecha es posterior a la cobertura de su suscripción, el backend la rechaza con un error distinguible y la app muestra un pop-up "Necesitás renovar tu membresía para reservar esta clase" con botón a WhatsApp. Si ya hay una renovación agendada (`scheduled` encadenada) que cubre la fecha, se suprimen los avisos y el bloqueo.

**Depends on:** none (feature standalone de app/api/admin; independiente del Módulo Contable v5.2 y de la fase 143). Reutiliza el sistema de notificaciones existente (`pending_notifications` + FCM + `notification-cron`) y el helper `buildWhatsAppUrl`.
**Requirements:** PLAN-NOTIF, PLAN-POPUP, BOOK-BLOCK (se derivan en plan-phase del GOAL + decisiones de CONTEXT)

**Tres entregables:**

1. **Notificación push de vencimiento de plan.** Replicar el bloque "Program Renewal Warning" de `el-templo-api/src/jobs/notification-cron.ts:346-398`, pero sobre la fecha cubierta de la cadena de `subscriptions`, encolando 3 disparos (7d / 3d / día del vencimiento). Categoría nueva `planes` ("Planes", toggle propio) + templates en `el-templo-api/src/modules/notifications/types.ts`. Idempotencia por umbral; suprimir si ya hay cobertura (renovación agendada).
2. **Pop-up in-app de aviso de vencimiento (≤3 días).** Al abrir la app, si faltan ≤3 días de la fecha cubierta, mostrar un pop-up salteable (1 vez por día hasta renovar) con botón que abre WhatsApp (`el-templo-app/src/utils/whatsapp.ts` → `buildWhatsAppUrl(country, text)`).
3. **Bloqueo de reserva post-vencimiento (solo presencial).** Backend: validar en `el-templo-api/src/modules/scheduling/booking-service.ts` `reserve()` que `booking_date <=` fecha cubierta de la cadena active+scheduled (hoy ese check NO existe — bug latente). Devolver un error/código distinguible. `end_date` NULL = no bloquear. Frontend (`ReservasPage.vue`): capturar ese error y mostrar un pop-up con botón a WhatsApp.

**Decisiones tomadas (ver `144-CONTEXT.md`):** categoría nueva `planes`; 3 disparos de push (7d/3d/vencido) silenciables por categoría; pop-up solo a ≤3d, salteable, 1 vez/día; bloqueo solo presencial, NULL no bloquea; concepto transversal "fecha cubierta" = `end_date` más lejano de la cadena active+scheduled, que gobierna supresión de avisos y bloqueo.

**Notas de contexto (verificado):** WhatsApp centralizado en `el-templo-app/src/utils/whatsapp.ts` (AR `5492235820521`, ES `34680774331`). Categorías de notificación existentes: `entrenamiento | programas | motivacion | anuncios` (`notifications/types.ts:3-18`). Notificaciones persisten en `pending_notifications` y se envían por FCM vía `notification-cron` + `NotificationService`. Incluye cambios de schema (template seed), migración SQL y tests de API para la nueva validación de booking.

**Plans:** 4/4 plans complete

Plans:

- [x] 144-01-PLAN.md — Foundation: `planes` category + 3 renewal templates + covered-until helper + migration (wave 1, autonomous:false)
- [x] 144-02-PLAN.md — PLAN-NOTIF: daily cron enqueues 7d/3d/expiry push with chain suppression + opt-out (wave 2)
- [x] 144-03-PLAN.md — PLAN-POPUP: GET /subscriptions/coverage + PlanExpiryDialog.vue (≤3d, once/day, WhatsApp) + mount (wave 2)
- [x] 144-04-PLAN.md — BOOK-BLOCK: reserve() coverage check + COVERAGE_EXPIRED code + ReservasPage renewal dialog (wave 2)

---

_v5.2 (Módulo Contable) added: 2026-06-23 — 6 phases (137-142), 25 requirements (VAL, CAJA, MOV, CARGA, REP, MIG). Backend-heavy sobre v4.8 (~60% existe, cero deps nuevas). **VAL (137) es el cimiento y va primero** por su blast radius sobre las 6 métricas v5.0 (redefine "dinero firme"). Orden de construcción del research: VAL → CAJA → MOV → CARGA → REP → MIG. Continúa numeración desde fase 136 (NO se resetea). Decisiones de arquitectura cerradas (ANULADO ortogonal, movimiento=una fila, banco×moneda, saldo derivado, corregir=anular+recrear); decisiones de dominio (idempotencia, casa de perillas, member sentinel, corte Contabilium, umbral de pendiente) diferidas a cada `discuss-phase`. Fuente de verdad: `BRIEF-MODULO-CONTABLE-FRANCO.md` + `.planning/research/modulo-contable/` (ARCHITECTURE/FEATURES/PITFALLS)._

---

## v5.3 (Mejoras Caja) Overview

**Milestone:** v5.3 — Mejoras Caja / Módulo Contable (feedback v5.2)
**Started:** 2026-06-26
**Phases:** 3 (145-147)
**Continues from:** Phase 144 (Notificaciones y bloqueo de vencimiento). Numbering is NOT reset.
**Granularity:** coarse — fixes acotados sobre un módulo existente (v5.2), agrupación de 3 fases aprobada explícitamente por el usuario. NO se decompone más.

**Scope.** Resolver el feedback operativo de v5.2 sobre la caja y la PoS del profe, montándose **ENCIMA** del Módulo Contable ya construido (fases 137-142) y del modelo financiero v4.8. Cinco áreas (A–E) consolidadas en `BRIEF-FEEDBACK-V52-CAJA.md`, agrupadas en 3 fases targeted: **(145)** aviso de deuda en la PoS + señalización del cobro "sin plan" (motivo + chip); **(146)** la fase fundacional de caja — imputación/confirmación de caja en la **validación** (no en el cobro), múltiples cuentas banco, imputación del anticipo al asignar plan, y "Movimientos de caja" como arqueo por caja; **(147)** centros de costo obligatorios para egresos.

**Pre-condición.** Módulo Contable v5.2 en staging/master: PoS del profe (`CargarPagoPage.vue` + `coach-load-routes.ts`, fase 140), bandeja de pendientes + "Movimientos de caja" (`MovEgresosTab.vue` → `/movements-history` → `listMovEgresos`, fase 141), entidad caja (`cash_registers` + `resolveCashRegister`, fase 138), validación inmutable (schema vacío, fase 137). `autocompletar` ya devuelve `outstanding` + `intent`. Última migración aplicada: **0158** → las nuevas son **0159+**.

**Decisión de dependencia central.** **B (fase 146) es fundacional para C y D:** la caja sugerida no-definitiva en Pendientes es lo que habilita el arqueo por caja y la imputación del anticipo. Por eso 146 absorbe puntos 4, 5/6 y 9 del feedback en una sola fase de caja. **145 (A) y 147 (E) son independientes** y pueden ir en cualquier orden, pero 146 consume el campo Motivo y el chip de 145.

**Descartados / sin trabajo (del feedback v5.2):** punto 2 (cambiar plan en el cobro = trabajo de gestión), punto 3 (sugerir precio = ya existe en `AssignPlanDialog`), punto 7 (cargar turnos fijos = ya existe), punto 8 (dinero pendiente en caja = ya resuelto, aparece como "pendiente").

**Diferido (fuera de este milestone):** reporte de egresos por centro de costo (EGR-F1), ABM de centros de costo desde UI (EGR-F2), ABM de cuentas banco desde UI (CAJA-F1) — staging usa seeds. Facturación electrónica AFIP/ARCA (sigue fuera, como en v5.2).

**Constraint operativo:** staging-first **estricto**. Migraciones con SQL commiteado (0159+); tests de integración para rutas nuevas/modificadas (validación con `cash_registerId`, imputación de anticipo en `assignPlan`, arqueo por `cash_register_id`, egreso con `cost_center_id`).

## v5.3 (Mejoras Caja) Phases

- [x] **Phase 145: PoS del profe** — aviso destacado de deuda al seleccionar al socio en "Cargar pago" (ambos modos, reusa `autocompletar.outstanding`) + dropdown Motivo ("Sin plan activo"/"Otro", como campo) en el cobro suelto + chip "Sin plan — asignar" en Pendientes que navega a la ficha del alumno.
- [x] **Phase 146: Caja, validación e imputación (fundacional)** — caja sugerida no-definitiva al cobrar (sede del profe / banco por moneda) + confirmar/cambiar caja al validar (abrir el endpoint inmutable) + múltiples cajas banco (seed staging Galicia + Mercado Pago) + quitar selector de la PoS + imputación del anticipo al asignar plan (anular+recrear `plan_charge` atómico en `assignPlan`, excedente no aplicado) + bloqueo del "Validar" manual de los "sin plan" + "Movimientos de caja" como arqueo por caja (todos los tipos por `cash_register_id`, pendientes/validados marcados, Cobros en el filtro Tipo, "Transacciones" se mantiene). (completed 2026-06-26)
- [x] **Phase 147: Centros de costo de egresos** — tabla `cost_centers` (por país) + seed AR (Alquiler Constitución / Librería / Viáticos profes / Varios) + columna `cost_center_id` obligatoria en el egreso + selector en el dialog de egreso + columna "Centro de costo" en la lista de movimientos de caja. (completed 2026-06-26)

## v5.3 (Mejoras Caja) Phase Details

### Phase 145: PoS del profe

**Goal:** El profe ve la deuda del socio al elegirlo en "Cargar pago" y puede señalizar un cobro sin plan activo para que gestión lo asigne después. End state: al seleccionar un socio aparece un aviso destacado de deuda en ambos modos de carga; el cobro suelto registra un Motivo estructurado; y los cobros "sin plan activo" quedan visibles en la bandeja de Pendientes con un chip que lleva directo a la ficha del alumno para asignar el plan.
**Depends on:** none (independiente; reusa `autocompletar.outstanding` ya existente y la PoS de la fase 140). Su salida (campo Motivo + chip) la consume la fase 146.
**Requirements:** POS-01, COBRO-01, COBRO-02
**Success Criteria** (what must be TRUE at phase completion):

1. Al seleccionar un socio en "Cargar pago", si tiene deuda se muestra un aviso destacado (monto + plan) en **ambos modos** (Pago de plan / Cobro suelto), usando `autocompletar.outstanding` ya disponible, sin recargar el buscador. (POS-01)
2. El "Cobro suelto" incluye un dropdown **Motivo** con opciones "Sin plan activo" / "Otro", persistido como **campo** estructurado (no texto libre) en la transacción. (COBRO-01)
3. En la bandeja de Pendientes, un cobro con motivo "Sin plan activo" muestra un chip **"Sin plan — asignar"** que navega a la ficha del alumno. (COBRO-02)

**Plans:** 1/2 plans executed
Plans:

- [x] 145-01-PLAN.md — Motivo del cobro suelto (columna misc_reason + endpoint) + aviso de deuda en la PoS (POS-01, COBRO-01)
- [x] 145-02-PLAN.md — Chip "Sin plan — asignar" en la bandeja de Pendientes (COBRO-02)
      **UI hint:** yes

### Phase 146: Caja, validación e imputación (fundacional)

**Goal:** La caja se imputa y se confirma en la **validación** (gestión), no en el cobro (profe), con soporte de múltiples cuentas banco; gestión puede usar un cobro suelto pendiente para saldar un alta de plan de forma atómica; y "Movimientos de caja" se vuelve el arqueo por caja (todo lo imputado a una caja, pendientes y validados marcados). End state: el profe cobra sin elegir caja; el cobro nace con una caja sugerida no-definitiva; gestión confirma o cambia la caja (incluida la cuenta banco) al validar; al asignar plan, el anticipo del socio se imputa anulando+recreando el `plan_charge`; los "sin plan" no se pueden validar a mano; y el arqueo por caja cuadra con "Saldos por caja".
**Depends on:** Phase 145 (consume el campo Motivo y el chip "Sin plan — asignar" del flujo de imputación) + fases v5.2 completas (140 carga del profe, 141 reportes/bandeja, 138 entidad caja, 137 validación). Es la **fase fundacional de caja** del milestone: habilita el arqueo y la imputación del anticipo.
**Requirements:** CAJA-01, CAJA-02, CAJA-03, CAJA-04, COBRO-03, COBRO-04, COBRO-05, ARQUEO-01, ARQUEO-02, ARQUEO-03, ARQUEO-04
**Success Criteria** (what must be TRUE at phase completion):

1. El cobro del profe nace con una **caja sugerida no-definitiva** (efectivo de la sede del profe vía `recordedBy` / banco por moneda) y la PoS **no** ofrece selector de caja/sede — el profe nunca elige caja. (CAJA-01, CAJA-04)
2. Al validar un pendiente, gestión **confirma o cambia** la caja imputada (`cash_register_id`) — el endpoint de validación, hoy inmutable, se abre para recibirla — y elige entre **múltiples cuentas banco** al validar una transferencia (staging seedea Galicia + Mercado Pago). (CAJA-02, CAJA-03)
3. Al asignar un plan, gestión usa la plata de un **cobro suelto pendiente** del socio: anula el cobro y **recrea un `plan_charge`** vinculado a la sub (misma caja/monto/método) de forma **atómica** dentro de `assignPlan`, viendo todos los cobros sueltos pendientes del socio; si el cobro **excede** el precio del plan, el excedente **no se aplica**. (COBRO-03, COBRO-04)
4. El botón **"Validar" manual queda bloqueado** en la bandeja para los cobros marcados "Sin plan activo" (se redirigen a asignar plan, para que no queden como plata suelta validada). (COBRO-05)
5. "Movimientos de caja" se vuelve el **arqueo por caja**: muestra todo lo imputado a una caja por `cash_register_id` (cobros de socio + egresos + traspasos + ajustes), con pendientes y validados **marcados** por su estado, **Cobros** agregado al filtro Tipo, y la pestaña "Transacciones" (vista comercial por socio) **se mantiene** sin cambios de criterio. (ARQUEO-01, ARQUEO-02, ARQUEO-03, ARQUEO-04)

**Plans:** 6/6 plans complete

Plans:

- [x] 146-01-PLAN.md — CAJA-01/04: el cobro del profe nace con caja sugerida (sede del profe); la PoS no expone caja/sede
- [x] 146-02-PLAN.md — CAJA-02/03 + COBRO-05 (backend): abrir validate para confirmar/cambiar caja + multi-banco (seed Galicia/Mercado Pago) + bloqueo validar sin_plan + primitivos para imputación
- [x] 146-03-PLAN.md — COBRO-03/04: imputación atómica del anticipo al asignar plan (anular+recrear plan_charge; excedente rechazado) + AssignPlanDialog
- [x] 146-04-PLAN.md — CAJA-02/03 + COBRO-05 (frontend): selector de caja al validar en la bandeja + bloqueo del Validar de los sin_plan
- [x] 146-05-PLAN.md — ARQUEO-01/02/04 (backend): listMovEgresos por caja, todos los kinds, con validationStatus; list() intacto
- [x] 146-06-PLAN.md — ARQUEO-02/03 (frontend): filtro Cobros + estado marcado en Movimientos de caja
      **UI hint:** yes

### Phase 147: Centros de costo de egresos

**Goal:** Cada egreso se clasifica obligatoriamente en un centro de costo, para poder reportar gasto por rubro más adelante. End state: existe un catálogo `cost_centers` por país (seedeado en AR); registrar un egreso exige elegir un centro de costo; y la lista de "Movimientos de caja" muestra el centro de costo de cada egreso.
**Depends on:** none (independiente; toca el dialog de egreso de la fase 139 y la lista de movimientos de la fase 141, pero no depende de 145/146). El reporte agrupado por centro de costo y el ABM desde UI quedan **diferidos**.
**Requirements:** EGR-01, EGR-02, EGR-03
**Success Criteria** (what must be TRUE at phase completion):

1. Existe un catálogo `cost_centers` (por país), seedeado en AR con **Alquiler Constitución / Librería / Viáticos profes / Varios**. (EGR-01)
2. Registrar un egreso **exige** elegir un centro de costo (obligatorio, con "Varios" como escape), vía columna `cost_center_id` en `financial_transactions` y selector en el dialog de egreso; aplica **solo** a egresos (kind `expense`). (EGR-02)
3. La lista de "Movimientos de caja" muestra una columna **"Centro de costo"** con el centro de cada egreso. (EGR-03)

**Plans:** 2 plans

- [x] 147-01-PLAN.md — Backend: tabla cost_centers + migración 0161 + columna cost_center_id + endpoint GET /cost-centers + egreso exige centro + costCenterName en el arqueo + tests
- [x] 147-02-PLAN.md — Frontend: tipos/composable getCostCenters + selector obligatorio en el dialog de egreso + columna "Centro de costo" en la lista
      **UI hint:** yes

## v5.3 (Mejoras Caja) Progress

| Phase                              | Plans Complete | Status   | Completed  |
| ---------------------------------- | -------------- | -------- | ---------- |
| 145. PoS del profe                 | 2/2            | Complete | 2026-06-26 |
| 146. Caja, validación e imputación | 6/6            | Complete | 2026-06-26 |
| 147. Centros de costo de egresos   | 2/2            | Complete | 2026-06-26 |

_Plan counts populated by `/gsd-plan-phase`._

### Phase 148: PoS profe: alta de alumno + plan en el cobro

**Goal:** El profe carga el plan directamente en el cobro (extiende `CargarPagoPage.vue` / Fase 140), creando al alumno si es nuevo, reemplazando el flujo Google Form→Excel→admin. Modelo **crear-en-vivo + validar-después**: alumno + membresía + turnos se crean al instante (entrena ya); el pago nace `validation_status='pendiente'` y va a la bandeja de gestión (Fase 137/141). Refuerzos: **dedup por DNI** (`check-duplicates`) antes de crear; **cascade en void** (anular carga de alumno-nuevo desactiva la membresía y deja al alumno inactivo, NO lo borra). Sucursal default = sede del profe, editable. Precio según medio de pago (tarjeta→`priceCreditCard`, resto→`priceRegular`/`priceZero` con toggle Zero; parcial deja deuda). **Selector de turnos estructurado** solo para planes `fixed` (reusa `FixedSchedulePicker.vue`). Backend: endpoint nuevo en `coach-load-routes.ts`, atómico e idempotente (resolver/crear alumno + `assignPlan(scheduleIds)` + transacción financiera `pendiente`). Fuente de verdad: `BRIEF-POS-PROFE-ALTA-ALUMNO.md` (raíz).
**Requirements**: ALTA-01 (crear alumno mínimo + dedup DNI), ALTA-02 (sucursal default editable), ALTA-03 (plan + Zero + precio x medio + parcial), ALTA-04 (turnos estructurados fixed), ALTA-05 (endpoint atómico idempotente), ALTA-06 (cascade en void), ALTA-07 (pago pendiente → bandeja), ALTA-08 (tests integración)
**Depends on:** Fases v5.2 (137 validación, 140 PoS del profe, 141 bandeja Pendientes) + v5.3 (146 caja sugerida). Sobre `staging`, viaja en el tren v5.2/v5.3 → master.
**Plans:** 6/6 plans complete

Plans:

- [x] 148-01-PLAN.md — Fundación backend: columna createdMemberId (mig 0162) + AssignPlanInput recorder fields + createMinimalMember [wave 1]
- [x] 148-02-PLAN.md — Endpoint POST /alta atómico e idempotente (resolver/crear alumno + assignPlan + cobro pendiente, branch-gated) [wave 2]
- [x] 148-03-PLAN.md — Cascade en void (alumno-nuevo → membresía cancelada + alumno inactivo) + surface createdMember [wave 2]
- [x] 148-04-PLAN.md — Tests de integración (crear-nuevo, dedup, parcial→deuda, fixed, void→cascade, idempotencia) [wave 3]
- [x] 148-05-PLAN.md — Frontend PoS: modo "Alta + plan" (sucursal, alumno+dedup, plan grid+Zero+precio, turnos fixed, Confirmar) [wave 3]
- [x] 148-06-PLAN.md — Bandeja Pendientes: copy condicional de cascade en el dialog Anular [wave 3]

---

_v5.3 (Mejoras Caja) added: 2026-06-26 — 3 phases (145-147), 17 requirements (POS, CAJA, COBRO, ARQUEO, EGR). Fixes targeted sobre el Módulo Contable v5.2 (137-142) y el modelo v4.8 — NO es un build from-scratch. Agrupación de 3 fases **aprobada explícitamente por el usuario, no se decompone más**. **Phase 146 (caja en validación) es fundacional** para la imputación del anticipo (C) y el arqueo por caja (D): la caja sugerida no-definitiva en Pendientes habilita ambos. 145 (aviso de deuda + Motivo + chip) y 147 (centros de costo) son independientes. Continúa numeración desde fase 144 (NO se resetea). Migraciones nuevas 0159+ (última aplicada 0158). Descartados del feedback: puntos 2/3/7/8. Diferido: reporte por centro de costo, ABM de centros, ABM de cuentas banco. Fuente de verdad: `BRIEF-FEEDBACK-V52-CAJA.md` (raíz)._

## v5.4 (Reforma del Admin) Overview

**Milestone:** v5.4 — Reforma del Admin — Correcciones white-label (pre-tenants)
**Started:** 2026-07-02
**Phases:** 8 (149-156)
**Continues from:** Phase 148 (PoS profe: alta de alumno + plan en el cobro). Numbering is NOT reset.
**Granularity:** fine — una fase por superficie/categoría del admin (Nav+RBAC, Cuentas bancarias, Cobros, Caja, Deudas, Alumnos, Horarios, Planes). Boundaries naturales del documento de correcciones; no se paddea ni se comprime.

**Scope.** Reorganizar el admin según `.docs/saas-multitenancy/Correcciones El Templo.md` para dejarlo listo como MVP white-label — nav por categorías, RBAC dueño-vs-empleado, pantallas simplificadas y de-Templo-ficación de la superficie MVP (Finanzas, Alumnos, Horarios, Planes) — **SIN introducir tenants todavía**. Primera etapa del camino SaaS (decisión de Nacho: reforma PRIMERO, tenancy DESPUÉS, secuencial). 8 fases, 33 requirements (NAV, COBRO, CTA, CAJA, DEUDA, ALUM, HOR, PLAN).

**Principio rector (Nacho, 2026-07-01):** El Templo se asienta sobre el terreno común general lo más posible; lo propio del Templo se "dibuja" después, encima. Traducción: estandarizar primero (núcleo genérico white-label), y tratar lo específico del Templo como capa posterior. Donde el documento dice "sacar", casi siempre significa **estandarizar/hacer configurable o gatear**, no borrar.

**Constraint transversal (regla dura):** todo cambio de API adopta los patrones del diseño SaaS validado (`.docs/saas-multitenancy/`): motor vs plantilla, regla de dirección de imports módulo→core (doc 04), sin nuevos Templo-ismos en core. Staging-first estricto. Migraciones con SQL commiteado; tests de integración para rutas nuevas/modificadas.

**Solapamiento con v5.3 (verificar en plan-phase):** este milestone levanta los diferidos de v5.3 — **CAJA-05** levanta EGR-F2 (ABM de centros de costo desde UI, sobre la tabla `cost_centers` de la fase 147) y **CTA-01/02** levantan CAJA-F1 (ABM de cuentas banco desde UI, hoy seeds Galicia/Mercado Pago). Las mejoras de **DEUDA-02** cruzan con el campo "Motivo" que v5.3 ya agregó (`misc_reason`, fase 145) — **verificar antes de duplicar**.

**Secuencia (dependencias).** **149 (Nav+RBAC) es foundational:** define las categorías donde aterrizan todas las pantallas visuales y el gating por rol. **150 (Cuentas bancarias) precede a 151 (Cobros)** porque COBRO-04 obliga a asociar una cuenta bancaria existente. **152 (Caja)** se monta sobre `cost_centers` de v5.3 (fase 147, brownfield). **153 (Deudas)** cruza con el "Motivo" de v5.3. **154/155/156 (Alumnos/Horarios/Planes)** son mayormente independientes entre sí; PLAN-04 es trabajo de verificación + test.

**Out of scope (este milestone):** tabla `tenants`, `tenant_id`, mecanismo de módulos (fase de tenancy posterior, diseño ya validado en `.docs/saas-multitenancy/04-mecanismo-modulos.md`); app de miembros multi-tenant; correcciones finas de Analíticas (ANLT-F1 — solo se mueven Analíticas/Reportes dentro de Finanzas en el nav); asistencia por QR desde la app del alumno (HOR-F1); borrar features Templo (Campañas, Puntuaciones, landing, SPOM) — se gatean, no se borran.

**Reference:** `.docs/saas-multitenancy/Correcciones El Templo.md` (doc crudo de Nacho) + `01-analisis-correcciones-admin.md` (análisis bajo lente SaaS, mapa imagen→código) + `README.md` §0 (decisión de secuencia).

## v5.4 (Reforma del Admin) Phases

- [x] **Phase 149: Nav por categorías + RBAC** — agrupar el nav plano del admin en Finanzas / Alumnos / Horarios / Planes (Pagos, Caja, Analíticas, Reportes, Deudas dentro de Finanzas), con visibilidad por rol (dueño ve todo; profe/administrativo ve solo Pagos + Planes read-only; Alumnos y Horarios libres) y gateo de Campañas/Profes/Puntuaciones/landing fuera del MVP (no se borran). (completed 2026-07-02)
- [x] **Phase 150: Cuentas bancarias flexibles** — crear/cerrar cuentas bancarias (Banco, N°, Titular, CUIT, CBU/CVU, Alias; solo 3 obligatorios) con baja lógica que conserva historial + registrar retiros del dueño (egreso tipo "Retiro"). Levanta CAJA-F1 de v5.3 (ABM desde UI).
- [ ] **Phase 151: Registrar cobro (Pagos → Cobros)** — renombrar "Pagos"→"Cobros" + rediseño en pantallas/pasos separados (una cosa por paso, desktop+mobile) + fecha/hora en el listado y botón "Continuar" arriba + transferencia/tarjeta obligadas a asociar una cuenta bancaria (crear rápida inline si no hay).
- [ ] **Phase 152: Reorganización de Caja + egresos configurables** — reordenar los tabs (Movimientos portada / Pendientes 2° / "Cobros" 3°) + etiqueta validada/pendiente por fila + detalle con validador + filtro por día + categorías de egreso configurables desde UI (ABM de centros de costo, levanta EGR-F2 de v5.3, defaults "Pago a proveedores"/"Retiros") + nota explicativa en Saldos.
- [ ] **Phase 153: Mejoras de Deudas** — fecha de registro + motivo (reusar `misc_reason` de v5.3, no duplicar) + pago/plan asociado (plan + período) por deuda + incluir a los socios con plan vencido sin renovar (no-renovaciones) en la misma pantalla.
- [ ] **Phase 154: Alumnos (de-Templo-ficación + accesos)** — "Crear alumno" prominente + "Registrar cobro" como acción directa en la fila + reglas de precio por medio de pago configurables (default sin recargo) + "Avatar"→"segmento"/categoría de socio (mismo mecanismo) + niveles griegos gateados como superficie Templo.
- [ ] **Phase 155: Horarios** — clases simultáneas en la misma sucursal + crear clase/actividad desde el slot (generaliza el "test de profe") + capacidad por actividad (cupo propio, no solo el de la sucursal).
- [ ] **Phase 156: Planes de pago vs Rutinas de entrenamiento** — separar "Planes de pago" (categoría Planes) de "Rutinas de entrenamiento" (subcategoría gateada Templo) + precio "Zero" a config + selección múltiple de programas por plan + actualizar precio por inflación sin crear plan nuevo ni alterar históricos (garantizado con test).

## v5.4 (Reforma del Admin) Phase Details

### Phase 149: Nav por categorías + RBAC

**Goal:** El admin se navega por categorías Finanzas / Alumnos / Horarios / Planes con visibilidad por rol (dueño del gimnasio vs empleado/profe), dejando las features Templo/marketing fuera del nav MVP sin borrarlas. End state: la nav plana actual (`router/routes.ts` + `AdminLayout.vue`) queda agrupada en 4 categorías; el dueño ve todo, el profe/administrativo ve solo "Pagos" dentro de Finanzas y Planes en modo lectura; Alumnos y Horarios quedan libres; Campañas/Profes/Puntuaciones/landing quedan gateadas.
**Depends on:** none (foundational — define dónde aterrizan las pantallas de las fases 150-156 y el gating por rol).
**Requirements:** NAV-01, NAV-02, NAV-03, NAV-04
**Success Criteria** (what must be TRUE at phase completion):

1. El nav del admin se agrupa en **Finanzas / Alumnos / Horarios / Planes**; Pagos, Caja, Analíticas, Reportes y Deudas viven dentro de Finanzas. (NAV-01)
2. **Finanzas** (completa) y la **edición de Planes** solo son visibles para admin/owner; el profe/administrativo no las ve. (NAV-02)
3. El profe/administrativo ve dentro de Finanzas **solo "Pagos"** (registrar cobro) y **Planes en modo lectura** (qué incluye + precios, sin editar). (NAV-03)
4. Campañas, Profes/Puntuaciones y las páginas de landing/marketing quedan **fuera del nav MVP**, gateadas por rol/flag y **no borradas** (siguen accesibles para El Templo). (NAV-04)

**Plans:** 6/6 plans complete

- [x] 149-01-PLAN.md — API: sets RBAC core+overrides Templo + guards de escritura dueño-only en plans/promo-plans (D-11)
- [x] 149-02-PLAN.md — API: eliminar la perilla de Configuración de Caja (endpoints/servicio/schemas) + umbral hardcodeado OVERDUE_DAYS (D-13)
- [x] 149-03-PLAN.md — Admin: nav-model declarativo (templo-config.ts) + drawer por categorías Finanzas/Alumnos/Horarios/Planes + Configuración + Templo
- [x] 149-04-PLAN.md — Admin: landing por rol + Planes read-only para empleado + borrar página/ruta de config-caja (D-14/D-09/D-13)
- [x] 149-05-PLAN.md — Gap NAV-03 (CR-01): separar lectura/escritura en programs (PROGRAMAS_LIST_ROLES = staff administrativo, sin coach per D-10) + loadPrograms gateado por rol y sin spam a Sentry
- [x] 149-06-PLAN.md — Gap D-14 (CR-02): landing por rol wired al login real (LoginPage → '/') + evaluado en beforeEach post-checkAuth (WR-01)
-       **UI hint:** yes

### Phase 150: Cuentas bancarias flexibles

**Goal:** El admin gestiona cuentas bancarias flexibles (crear/cerrar) y registra retiros del dueño, para que los cobros bancarios puedan asociarse a una cuenta y los saldos reflejen la realidad. End state: existe ABM de cuentas bancarias desde la UI (levanta el diferido CAJA-F1 de v5.3, hoy seeds) con campos flexibles y baja lógica; y se pueden registrar retiros del dueño como egreso.
**Depends on:** Phase 149 (la superficie aterriza en Finanzas, admin-only). Precede a Phase 151 (COBRO-04 asocia una cuenta bancaria existente).
**Requirements:** CTA-01, CTA-02, CTA-03
**Success Criteria** (what must be TRUE at phase completion):

1. El admin puede **crear una cuenta bancaria** con Banco, N° de cuenta, Titular, CUIT, CBU/CVU, Alias, exigiendo **solo 3 campos obligatorios** (flexible para monotributos/empresas/varias cuentas). (CTA-01)
2. El admin puede **cerrar/desactivar** una cuenta bancaria (baja lógica) **conservando** su historial de movimientos. (CTA-02)
3. El admin puede registrar un **retiro del dueño** desde una cuenta bancaria o caja (egreso tipo "Retiro"), impactando el saldo para que refleje la realidad. (CTA-03)

**Plans:** 6/6 plans complete

Plans:

**Wave 1**

- [x] 150-01-PLAN.md — Backend: schema cash_registers + tipos + migración 0163 (columnas bancarias + seed 'Retiros')

**Wave 2** _(blocked on Wave 1 completion)_

- [x] 150-02-PLAN.md — Backend: JSON Schemas + service CRUD (nombre derivado, uno-de-dos, ciclo de vida)

**Wave 3** _(blocked on Wave 2 completion)_

- [x] 150-03-PLAN.md — Backend: 5 endpoints ABM (guard admin/owner) + tests de integración

**Wave 4** _(blocked on Wave 3 completion)_

- [x] 150-04-PLAN.md — Frontend: tipos + API + CuentaBancariaFormDialog reutilizable

**Wave 5** _(blocked on Wave 4 completion)_

- [x] 150-05-PLAN.md — Frontend: tab 'Cuentas' en Caja + prefill de retiro + checkpoint UAT
      **UI hint:** yes

**Wave 6** _(gap closure — cierra los 3 Critical de 150-VERIFICATION.md)_

- [x] 150-06-PLAN.md — Fixes CR-01 (editar cuenta legacy no crashea) + CR-02 (guard ADMIN_ROLES en GET + tests RBAC) + CR-03 (botón retiro owner-only + notify)

### Phase 151: Registrar cobro (Pagos → Cobros)

**Goal:** El registro de cobro se renombra a "Cobros" y se rediseña en pasos separados (una cosa por paso), con fecha/hora en el listado y asociación obligatoria de cuenta bancaria para transferencia/tarjeta. End state: "Pagos" es "Cobros" en toda la superficie; el flujo de carga ya no es una sucesión de expansiones anidadas sino pantallas/pasos separados que funcionan bien en desktop y mobile; el listado muestra fecha+hora con "Continuar" arriba; y un cobro bancario no se puede finalizar sin una cuenta asociada.
**Depends on:** Phase 149 (nav "Pagos"→"Cobros") + Phase 150 (cuentas bancarias existentes para COBRO-04).
**Requirements:** COBRO-01, COBRO-02, COBRO-03, COBRO-04
**Success Criteria** (what must be TRUE at phase completion):

1. "Pagos" se renombra **"Cobros"** en nav, página y textos ("Mis cargas de hoy" → "Cobros"). (COBRO-01)
2. El registro del cobro se organiza como **pantallas/pasos separados** (una sola cosa por paso), funcionando bien en desktop y mobile, en vez de la sucesión de expansiones anidadas. (COBRO-02)
3. El listado de cargas del profe muestra **fecha + hora** de cada registro, y el botón **"Continuar"** queda arriba del listado. (COBRO-03)
4. Un cobro por **transferencia o tarjeta** exige seleccionar una **cuenta bancaria existente**; si no hay cuentas cargadas ofrece **crear cuenta rápida inline** y **no permite finalizar** sin asociarla. (COBRO-04)

**Plans:** 4 plans

- [ ] 151-01-PLAN.md — API COBRO-04: bankAccountId contract + validation + GET /coach-load/bank-accounts + tests
- [ ] 151-02-PLAN.md — Composable field/list method + shared CobroResumen.vue summary component
- [ ] 151-03-PLAN.md — Rename Pagos→Cobros (route/redirect/nav) + 4-step wizard + day-grouped listado
- [ ] 151-04-PLAN.md — Bank-account selector in step 3 + admin/owner inline quick-create
      **UI hint:** yes

### Phase 152: Reorganización de Caja + egresos configurables

**Goal:** La vista de Caja se reordena y clarifica (Movimientos portada, Pendientes 2°, "Cobros" 3°), con etiquetas de estado por fila, filtro por día, detalle con validador, categorías de egreso configurables desde la UI y una nota de saldos. End state: los tabs quedan en el orden nuevo; cada cobro muestra su estado validada/pendiente y el detalle incluye validador+fecha; los filtros de fecha permiten bajar a días; los centros de costo se administran desde la UI con defaults genéricos; y Saldos advierte sobre registrar egresos/retiros.
**Depends on:** Phase 149 (Caja dentro de Finanzas). Se monta sobre `cost_centers` de v5.3 (fase 147, brownfield) para el ABM — **verificar el schema existente antes de extender**.
**Requirements:** CAJA-01, CAJA-02, CAJA-03, CAJA-04, CAJA-05, CAJA-06
**Success Criteria** (what must be TRUE at phase completion):

1. En Caja, **"Movimientos de caja" es la portada** (primer tab), **"Pendientes"** pasa a segundo y **"Transacciones" (renombrada "Cobros")** a tercero. (CAJA-01)
2. El listado de cobros muestra **etiqueta validada/pendiente** en cada fila, y el **detalle** de un cobro incluye **fecha de validación + usuario validador** (como ya muestra Movimientos). (CAJA-02, CAJA-04)
3. Los filtros de fecha (Cobros y Movimientos) vienen por mes pero permiten **elegir por días** para revisar dudas puntuales. (CAJA-03)
4. Las **categorías de egreso son configurables desde la UI** (ABM de centros de costo, levanta EGR-F2 de v5.3), con defaults genéricos que incluyen **"Pago a proveedores"** y **"Retiros"** en vez de los Templo-céntricos como única opción. (CAJA-05)
5. La vista **Saldos** muestra una **nota explicativa**: "si no se registran egresos y retiros, los saldos no reflejarán la realidad". (CAJA-06)

**Plans:** TBD
**UI hint:** yes

### Phase 153: Mejoras de Deudas

**Goal:** Cada deuda muestra fecha de registro, motivo y pago/plan asociado, y la vista de Deudas incluye también a los socios con plan vencido sin renovar, para gestionar el negocio desde una sola pantalla. End state: la lista de Deudas gana fecha de registro, motivo (reutilizando el campo de v5.3), y la asociación a plan+período; y suma la cohorte de no-renovaciones.
**Depends on:** Phase 149 (Deudas dentro de Finanzas). **Cruza con el campo "Motivo" (`misc_reason`) que v5.3 ya agregó (fase 145) — verificar y reutilizar, no duplicar.**
**Requirements:** DEUDA-01, DEUDA-02, DEUDA-03, DEUDA-04
**Success Criteria** (what must be TRUE at phase completion):

1. Cada deuda muestra la **fecha desde que se registró**. (DEUDA-01)
2. Cada deuda muestra su **motivo**, reutilizando el campo "Motivo" agregado en v5.3 (verificado, sin duplicar). (DEUDA-02)
3. Cada deuda muestra **a qué pago/plan está asociada** (plan y período). (DEUDA-03)
4. La vista de Deudas incluye también a los socios con **plan vencido sin renovar** (no-renovaciones), para ocuparse del negocio desde una sola pantalla. (DEUDA-04)

**Plans:** TBD
**UI hint:** yes

### Phase 154: Alumnos (de-Templo-ficación + accesos)

**Goal:** La página de Alumnos prioriza crear alumno y cobrar desde la fila, con precios por medio de pago configurables, "avatar" renombrado a un concepto neutro y niveles griegos gateados como superficie Templo. End state: "Crear alumno" es la acción prominente; "Registrar cobro" es una acción directa en la fila; el recargo por medio de pago deja de estar hardcodeado y pasa a config; "Avatar" se llama "segmento" en toda la UI conservando el mecanismo; y los niveles griegos quedan gateados como Templo, consistente con el gating de Entrenamiento.
**Depends on:** Phase 149 (categoría Alumnos, libre para profe).
**Requirements:** ALUM-01, ALUM-02, ALUM-03, ALUM-04, ALUM-05
**Success Criteria** (what must be TRUE at phase completion):

1. **"Crear nuevo alumno"** es la **acción prominente** de la página de Alumnos. (ALUM-01)
2. **"Registrar cobro"** es una **acción directa en la fila** del alumno (junto al lápiz), no anidada dentro de la ficha. (ALUM-02)
3. Las **reglas de precio por medio de pago** (recargo tarjeta, etc.) dejan de estar hardcodeadas y pasan a **configuración** (default estándar sin recargo; El Templo activa la suya). (ALUM-03)
4. **"Avatar"** se renombra a un concepto neutro (**"segmento" / categoría de socio**) en toda la UI del admin, conservando el mecanismo subyacente. (ALUM-04)
5. Los **niveles griegos** (kairos→spartan) quedan **gateados como superficie Templo** (fuera del default white-label), consistente con el gating de Entrenamiento existente. (ALUM-05)

**Plans:** TBD
**UI hint:** yes

### Phase 155: Horarios

**Goal:** El sistema de horarios soporta clases simultáneas en la misma sucursal, crear una clase/actividad directamente desde el slot y capacidad por actividad. End state: musculación puede convivir con otras actividades en la misma sucursal a la misma hora; el "test de profe" Templo-específico se generaliza a "crear clase/actividad" desde el slot; y cada actividad define su propio cupo en vez de heredar solo el de la sucursal.
**Depends on:** Phase 149 (categoría Horarios, libre para profe).
**Requirements:** HOR-01, HOR-02, HOR-03
**Success Criteria** (what must be TRUE at phase completion):

1. El sistema permite **dos clases simultáneas en la misma sucursal** (musculación conviviendo con actividades). (HOR-01)
2. Se puede **crear una clase/actividad directamente desde el slot** del horario (generaliza el "test de profe" Templo-específico). (HOR-02)
3. Cada **actividad define su capacidad** (cupo), en lugar de heredar únicamente la capacidad de la sucursal. (HOR-03)

**Plans:** TBD
**UI hint:** yes

### Phase 156: Planes de pago vs Rutinas de entrenamiento

**Goal:** Se separan "Planes de pago" de "Rutinas de entrenamiento", el precio "Zero" pasa a configuración, un plan puede dar acceso a varios programas seleccionados, y actualizar el precio por inflación no crea un plan nuevo ni altera históricos. End state: los dos conceptos quedan con nombres claros y la subcategoría de rutinas gateada como Templo; "Zero" sale del default y queda como config; un plan puede seleccionar múltiples programas (además del "todos los programas"); y una suba de precio queda garantizada por test como no-destructiva de los montos históricos.
**Depends on:** Phase 149 (categoría Planes, edición admin-only). Independiente de 154/155.
**Requirements:** PLAN-01, PLAN-02, PLAN-03, PLAN-04
**Success Criteria** (what must be TRUE at phase completion):

1. "Planes" y "Programas" se separan con nombres claros: **"Planes de pago"** (categoría Planes) y **"Rutinas de entrenamiento"** (subcategoría, gateada como Templo/entrenamiento). (PLAN-01)
2. El **precio "Zero"** deja de ser parte del default: pasa a **configuración** (El Templo lo conserva activo). (PLAN-02)
3. Un plan puede dar acceso a **varios programas seleccionados** (además del "todos los programas" existente). (PLAN-03)
4. **Actualizar el precio** de un plan (inflación) **no requiere crear un plan nuevo ni altera los montos históricos** ya cobrados, comportamiento **garantizado con test**. (PLAN-04)

**Plans:** TBD
**UI hint:** yes

## v5.4 (Reforma del Admin) Progress

| Phase                                           | Plans Complete | Status      | Completed  |
| ----------------------------------------------- | -------------- | ----------- | ---------- |
| 149. Nav por categorías + RBAC                  | 6/6            | Complete    | 2026-07-02 |
| 150. Cuentas bancarias flexibles                | 6/6            | Complete    | 2026-07-03 |
| 151. Registrar cobro (Pagos → Cobros)           | 0/4            | Planned     | -          |
| 152. Reorganización de Caja + egresos config.   | 0/TBD          | Not started | -          |
| 153. Mejoras de Deudas                          | 0/TBD          | Not started | -          |
| 154. Alumnos (de-Templo-ficación + accesos)     | 0/TBD          | Not started | -          |
| 155. Horarios                                   | 0/TBD          | Not started | -          |
| 156. Planes de pago vs Rutinas de entrenamiento | 0/TBD          | Not started | -          |

_Plan counts populated by `/gsd-plan-phase`._

---

_v5.4 (Reforma del Admin) added: 2026-07-02 — 8 phases (149-156), 33 requirements (NAV, COBRO, CTA, CAJA, DEUDA, ALUM, HOR, PLAN). Primera etapa del camino SaaS: reforma PRIMERO, tenancy DESPUÉS (decisión de Nacho, secuencial). Deriva de `.docs/saas-multitenancy/Correcciones El Templo.md` + `01-analisis-correcciones-admin.md` (mapa imagen→código). Continúa numeración desde fase 148 (NO se resetea). **149 (Nav+RBAC) es foundational** (define categorías + gating). **150 (Cuentas bancarias) precede a 151 (Cobros)** por COBRO-04. **152 (Caja)** levanta EGR-F2 de v5.3 sobre `cost_centers` (fase 147); **150** levanta CAJA-F1 (ABM cuentas banco). **153 (Deudas)** reutiliza el "Motivo" (`misc_reason`) de v5.3 (fase 145) — verificar, no duplicar. Constraint dura: todo cambio de API adopta los patrones del diseño SaaS validado (motor vs plantilla, imports módulo→core, sin nuevos Templo-ismos en core). SIN tenants este milestone. Out of scope: tabla tenants/tenant_id/mecanismo de módulos, analíticas finas (ANLT-F1), QR desde app del alumno (HOR-F1), borrar features Templo (se gatean). Fuente de verdad: `.docs/saas-multitenancy/`._

---

## v5.5 (Sistema de Referidos) Overview

**Milestone:** v5.5 — Sistema de Referidos — descuento recurrente double-sided AURA-native

**Status:** PRÓXIMO (no activo). El milestone activo sigue siendo v5.4; v5.5 se ejecuta **DESPUÉS** de v5.4 (decisión de Franco, 2026-07-02: reforma del admin primero, referidos se monta sobre el alta de alumno y los cobros ya reformados). Los REQ-IDs viven **inline en las Phase Details** de abajo; `REQUIREMENTS.md` se formaliza cuando v5.5 pase a activo (tras `complete-milestone` de v5.4).

**Continues from:** Phase 156 (v5.4). Numbering is NOT reset.

**Goal:** Sistema de referidos double-sided AURA-native: cada vínculo de referido, una vez que el referido paga su primer plan (`qualified`), otorga a **ambas** partes (referidor y referido) un % de descuento en su cuota **mientras las dos sigan activas**, evaluado en cada cobro, acumulable por múltiples vínculos hasta un tope. El descuento es **no-discrecional** (se auto-aplica, el socio no administra AURA); AURA queda como anotación de registro interno.

**Solapamiento con v5.4 (verificar en plan-phase):**

- **Fase 157 (atribución en alta)** cruza con **v5.4 fase 154 (Alumnos — reforma del alta)**: el campo "¿Quién lo trajo?" debe montarse sobre el flujo de alta ya reformado, no reconstruirlo.
- **Fase 157 (descuento en `assignPlan`)** cruza con **v5.4 fase 151 (Cobros/`assignPlan`)**: verificar integración del cómputo del descuento con el registro de cobro reformado.
- Reusa el canal asistido de **fase 148 (PoS profe: alta de alumno + plan en el cobro)**.

**Secuencia (dependencias):** **157 (núcleo) es foundational** — schema, atribución doble canal, cualificación y cómputo del descuento. **158 (visibilidad) depende de 157** — solo lee y comunica lo que 157 produce.

**Fuente de verdad:** `BRIEF-SISTEMA-REFERIDOS.md` (raíz), con las 8 decisiones de diseño cerradas por Franco. Infra AURA ya reserva `sourceType:"referral"` sin cablear (`aura-transactions.ts:17`, `aura-config.ts:16`).

## v5.5 (Sistema de Referidos) Phases

- [ ] **Phase 157: Núcleo transaccional de referidos** — schema+migración (`users.referralCode`/`referredBy`, tabla `referrals`, seed `aura_config` para `referral`), atribución doble canal (self-service `?ref=CODE` en registro + asistido "¿Quién lo trajo?" en el alta admin), cualificación en `assignPlan` al primer pago del referido, cómputo del descuento simétrico recurrente y condicional a ambos-activos con acumulación topeada, y registro AURA interno sin inflar saldo gastable.
- [ ] **Phase 158: Visibilidad y comunicación** — pantalla "Mis referidos" en la app (estado por vínculo + descuento vigente), notificaciones (vínculo activado / descuento por caerse) y panel de referidos en el admin (opcional).

## v5.5 (Sistema de Referidos) Phase Details

### Phase 157: Núcleo transaccional de referidos

**Goal:** El sistema de referidos funciona end-to-end del lado de la plata: se atribuye quién trajo a quién (por ambos canales), el primer pago del referido activa el vínculo, y el descuento simétrico condicional se aplica solo en cada cobro. End state: un socio con vínculos qualified y contraparte activa paga menos su cuota automáticamente, con anotación interna en AURA y sin poder administrar ese crédito.

**Depends on:** Fase 148 (canal asistido de alta) + (si v5.4 va primero) Fase 154 (alta de alumno reformado) y Fase 151 (registro de cobro reformado sobre `assignPlan`). Toca `el-templo-api` (schema/migración, `auth/routes.ts` registro, `subscriptions/service.ts` `assignPlan`), `el-templo-app` (RegisterPage `?ref`) y `el-templo-admin` (campo en alta).

**Requirements (inline — se formalizan en REQUIREMENTS.md al activar v5.5):**

- **REF-01**: Cada socio tiene un **código de referido único** y puede compartir un link `?ref=CODE`.
- **REF-02**: Un miembro que se registra **self-service** con `?ref=CODE` queda **atribuido** a su referidor.
- **REF-03**: Recepción/gestión/profe puede **atribuir el referidor al dar de alta** un alumno (campo "¿Quién lo trajo?"), enganchando con el flujo de alta (fases 148/154).
- **REF-04**: El sistema impide **auto-referido** y garantiza que **cada nuevo miembro tenga a lo sumo un referidor** (no puede ser reclamado por dos personas), respetando el **dedup por DNI**. Un referidor **sí puede traer múltiples referidos** (la acumulación del descuento se rige por DESC-04).
- **DESC-01**: Cuando el referido **paga su primera suscripción**, el vínculo pasa a `qualified` y habilita el descuento.
- **DESC-02**: Un vínculo `qualified` otorga un **% de descuento a ambas partes** (referidor y referido) en su cuota, **simétrico**, mientras ambos sigan activos.
- **DESC-03**: El descuento se **evalúa en cada cobro** (`assignPlan`); si una parte está inactiva se **suspende** ese ciclo y se **reactiva** si vuelve (no se revoca salvo fraude/manual).
- **DESC-04**: Múltiples vínculos activos **acumulan** descuento hasta un **tope configurable** (% por vínculo + máximo).
- **DESC-05**: El descuento es **no-discrecional**: se auto-aplica en el cobro, el socio no lo administra.
- **AURA-01**: Cada descuento aplicado se registra como anotación `sourceType:"referral"` para **trazabilidad interna**, **sin inflar** el saldo AURA gastable.
- **AURA-02**: La **magnitud** del descuento se parametriza en `aura_config` (fila `referral`).

**Success criteria:**

1. Un socio nuevo con `?ref=CODE` queda vinculado a su referidor; y recepción puede atribuir el referidor al dar el alta (ambos canales escriben `users.referredBy`).
2. El sistema rechaza auto-referido y doble-referidor, y respeta el dedup por DNI.
3. El primer pago del referido marca el vínculo `qualified`.
4. Al cobrar la cuota de cualquiera de las dos partes, el descuento simétrico se calcula y aplica automáticamente solo si ambos están activos, acumulando por vínculo hasta el tope.
5. Cada descuento aplicado deja una anotación `sourceType:"referral"` sin alterar el saldo AURA gastable del socio.

**Plans:** TBD
**UI hint:** yes (RegisterPage `?ref` + campo "¿Quién lo trajo?" en alta admin)

### Phase 158: Visibilidad y comunicación

**Goal:** El socio entiende y siente el beneficio: ve el estado de sus referidos y el descuento vigente, y es avisado cuando un vínculo se activa. End state: pantalla "Mis referidos" operativa en la app, notificación al activarse un vínculo, y (opcional) listado de referidos para gestión.

**Depends on:** Phase 157 (lee y comunica el modelo que 157 produce; no altera la mecánica).

**Requirements (inline):**

- **VIS-01**: El socio ve una pantalla **"Mis referidos"** con el estado de cada vínculo (pendiente/activo/caído) y el **descuento vigente**.
- **VIS-02**: El socio recibe **notificación** cuando su vínculo se **activa** (referido pagó), y opcionalmente cuando el descuento **está por caerse**.
- **VIS-03** _(opcional)_: Gestión ve un **panel/listado de referidos** en el admin.

**Success criteria:**

1. "Mis referidos" muestra cada vínculo con su estado y el descuento vigente del socio.
2. Al activarse un vínculo (referido paga), el referidor recibe una notificación.
3. (Opcional) Gestión puede ver el listado de referidos y sus estados en el admin.

**Plans:** TBD
**UI hint:** yes (pantalla app "Mis referidos" + notificaciones + panel admin opcional)

## v5.5 (Sistema de Referidos) Progress

| Phase                                  | Plans Complete | Status      | Completed |
| -------------------------------------- | -------------- | ----------- | --------- |
| 157. Núcleo transaccional de referidos | 0/TBD          | Not started | -         |
| 158. Visibilidad y comunicación        | 0/TBD          | Not started | -         |

_Plan counts populated by `/gsd-plan-phase`._

---

_v5.5 (Sistema de Referidos) added: 2026-07-02 — 2 phases (157-158), 12 requirements (REF, DESC, AURA, VIS). **PRÓXIMO milestone, NO activo** — se ejecuta DESPUÉS de v5.4 (decisión de Franco: reforma admin primero). Continúa numeración desde fase 156 (NO se resetea). **157 (núcleo) es foundational**; 158 (visibilidad) depende de 157. Feature AURA-native: la infra ya reserva `sourceType:"referral"` sin cablear. Descuento recurrente SIMÉTRICO condicionado a ambos-activos, no-discrecional, acumulable con tope; AURA = anotación interna. Solapa con v5.4: fase 157 cruza fase 154 (alta de alumno) y fase 151 (`assignPlan`) — montar sobre lo reformado, verificar en plan-phase. REQ-IDs inline en Phase Details; `REQUIREMENTS.md` se formaliza al activar v5.5. Preguntas abiertas §7 (ventana registro→pago, calibración de %, backfill de códigos, suspende-vs-revoca) → discuss-phase. Fuente de verdad: `BRIEF-SISTEMA-REFERIDOS.md` (raíz)._
