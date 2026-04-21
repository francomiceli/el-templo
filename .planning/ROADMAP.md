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

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 99
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 100 to break down)

---

_v4.7 phases added: 2026-04-08 — 2 phases (96-97), origin: coach requests for no-equipment home programs and Saturday mobility classes_

</details>
