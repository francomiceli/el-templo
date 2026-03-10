# Roadmap: El Templo

## Milestones

- **v2.0 Admin App** - Phases 13-28 (in progress, phases 13-19 + 26-27 complete)
- **v3.0 Landing Page** - Phases 29-36 (planned)
- **v4.0 Ecosystem Foundation** - Phases 45-52 (planned)

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
3. The site renders correctly at desktop (1200px+), tablet (768-1199px), and mobile (<768px) breakpoints
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

---

### Phase 52: Analytics Dashboard

**Goal**: Coaches have a unified analytics view showing member, attendance, and financial metrics — all filterable by branch and date range
**Depends on**: Phases 47-50 (all data sources must be in place)
**Requirements**: ANLT-01, ANLT-02, ANLT-03, ANLT-04
**Success Criteria** (what must be TRUE):

1. Admin can view member analytics: total active members, new members per period, churned members per period, and retention rate
2. Admin can view attendance analytics: check-ins per day/week, peak hours, and occupancy by time slot
3. Admin can view financial analytics: revenue trends, outstanding balances, and collection rate
4. All analytics dashboards can be filtered by branch and date range
   **Plans:** 2/2 plans complete

Plans:

- [ ] 52-01-PLAN.md -- Analytics API module (KPIs, member, attendance, financial endpoints + tests)
- [ ] 52-02-PLAN.md -- Analytics dashboard UI (AnaliticasPage with charts, heatmap, filters, sidebar)

### Phase 53: Codebase health: timezone fixes, god object decomposition, performance optimization, test coverage

**Goal:** Fix critical timezone bugs in booking/cancel windows, eliminate N+1 query in scheduling, add missing database indexes, extract shared date utilities (DRY), and close test coverage gaps in progression and scheduling modules.
**Requirements**: None (codebase health — no new features)
**Depends on:** Phase 52
**Plans:** 2/3 plans executed

Plans:

- [ ] 53-01-PLAN.md -- Shared date-utils module (TDD) + timezone fixes in scheduling/analytics
- [ ] 53-02-PLAN.md -- N+1 query fix in getWeeklyGrid + missing database indexes
- [ ] 53-03-PLAN.md -- Test coverage for progression module + scheduling window integration tests

---

### v4.0 Progress

**Execution Order:**
Phase 45 (Architecture) -> Phase 46 (Content) -> Phase 47 (Members) -> Phase 48 (Subscriptions) -> Phase 49 (Payments) -> Phase 50 (Attendance) -> Phase 51 (Scheduling) -> Phase 52 (Analytics)

| Phase                            | Plans Complete | Status   | Completed  |
| -------------------------------- | -------------- | -------- | ---------- |
| 45. Architecture Foundation      | 3/3            | Complete | 2026-03-08 |
| 46. Lifestyle Content Extraction | 2/2            | Complete | 2026-03-09 |
| 47. Members Management           | 3/3            | Complete | 2026-03-09 |
| 48. Subscriptions                | 2/2            | Complete | 2026-03-09 |
| 49. Payments                     | 2/2            | Complete | 2026-03-09 |
| 50. Attendance                   | 3/3            | Complete | 2026-03-10 |
| 51. Scheduling                   | 3/3            | Complete | 2026-03-10 |
| 52. Analytics Dashboard          | 2/2            | Complete | 2026-03-10 |

_v4.0 phases added: 2026-03-08 — 8 phases (45-52), 32 requirements mapped_
