# Milestones

## v5.8 Sesiones de Prueba — automatización y self-service (Shipped: 2026-07-16)

**Phases completed:** 3 phases, 13 plans, 28 tasks
**Migraciones:** 0182 (lead_status_source + seed p90) + 0183 (backfill con backup `users_lead_backup_0183`)
**Estado al cierre:** código-completo y verificado (163: 9/9, 164: 12/12, 165: 10/10); en staging `e2da7a7e`; tren a prod + UAT pendientes.
Known deferred items at close: 72 vía audit-open — mayoría deuda histórica pre-v5.8; los de v5.8 son los HUMAN-UAT de 163/164/165 + flake UTC de reports-trial-sessions (see STATE.md Deferred Items)

**Key accomplishments:**

- users.lead_status_source audit column + migration 0182 (idempotent p90 seed of leads.perdido_window_days, fallback 14) + SettingsService.getPerdidoWindowDays() int reader, TDD-covered
- Nuevo `src/jobs/expire-lost-leads.ts` (runExpireLostLeads invocable + startExpireLostLeadsJob a las 04:00 AR) que lee la ventana X de settings cada corrida y vence leads no-manuales cuya última sesión de prueba no cancelada quedó fuera de la ventana, wired en index.ts, con 5 tests de integración verdes
- Los writes source-of-truth de `lead_status_source` cableados en los 3 módulos que mutan estado del lead: reset Perdido → En seguimiento (source auto) al re-agendar prueba (bookTrial + self-service), 'auto' en el hook de compra `recomputeUserStatus` y en el alta de lead, 'manual' en el PATCH `updateLead` — todo cubierto por 4 tests de integración verdes
- Migración 0183 que snapshotea las columnas de lead en `users_lead_backup_0183` y luego aplica una vez la regla del cron a los ~112 leads En seguimiento vencidos → Perdido (source auto), respetando manual/convertido/plan/borrado/activo, con un script dry-run COUNT-only para validación humana pre-deploy y 4 tests de integración verdes
- `rescheduleTrial` cablea la acción admin "Reprogramar" de una sesión de prueba como operación atómica: en UNA `db.transaction` cancela la booking vieja, resetea el lead a En seguimiento (source `auto`, reusando el snippet de 163) y crea la nueva con la rama reactivate-or-insert de `bookTrial` — expuesto en `POST /trials/:bookingId/reschedule` con guard `ALL_STAFF_ROLES` heredado, y cubierto por 5 tests de integración verdes.
- Gestión reprograma una sesión de prueba en un solo paso desde `SesionesDePruebaDialog.vue`: un botón "Reprogramar" por fila abre `RescheduleTrialDialog.vue` (picker de fecha + select de turnos del día) que POSTea al endpoint transaccional de 164-01 y refresca la lista, con el flujo "quitar" intacto.
- COUNT correlacionado de bookings de prueba canceladas por lead + `lead_status_source` en cada fila del reporte, con filtro `leadStatusSource=auto|manual` (auto incluye NULL) y columnas CSV, todo derivado sin schema nuevo.
- Columna 'Reprogramaciones' con tooltip aclaratorio, indicador discreto auto/manual junto al estado del lead, y select de filtro por origen — todo consumiendo el contrato del backend 164-03, compilando/lint limpio.
- Toda reserva o alta de sesión de prueba exige ahora el teléfono del lead: la reserva self-service lo captura y persiste atómicamente (o rechaza con `PHONE_REQUIRED`), la eligibility informa `phoneRequired` de antemano, y el alta admin (`bookTrial`) rechaza con 409 accionable si falta.
- `convertFreemiumToTrial` (promover un self-registered freemium a `status='prueba'` desde el admin) ahora rechaza con 409 accionable si el lead no tiene teléfono y ninguno viene en el body; si viene, lo normaliza y persiste en `users.phone` dentro de la misma tx. El alta directa (`TrialMemberFormDialog` + `createTrialMember`) se verificó como ya satisfecha sin tocar código.
- `users.phone` threaded a cada fila del reporte de SP (JSON + CSV columna 'Teléfono') siguiendo la forma de extensión de 164, más UI de admin con link wa.me y acción 'Ver ficha' → /alumnos/:userId — acorta el camino de recupero/conversión (SELF-04, D-06/D-07).
- Cuando la eligibility devuelve `phoneRequired`, el diálogo de confirmación de reserva de sesión de prueba en la member app muestra un input de teléfono requerido (teclado tel, validación no-vacío) que viaja en el body del reserve-trial; el registro no cambia.
- Un único test de integración recorre el funnel self-service completo — `POST /register` (freemium) → `GET trial-eligibility` (elegible, `phoneRequired` según perfil) → `POST reserve-trial` (promueve freemium→prueba, booking `is_trial` source `self_service`, lead `en_seguimiento` source `auto`) → el lead aparece con su teléfono en `GET /api/admin/reports/trial-sessions` — más los 5 negativos clave. El recorrido NO reveló bugs de producto: el funnel 119 + los writes de 163 + el teléfono de 165 conviven; el único ajuste fue de fecha del test.

---

## v1.0 — Training Module (Member App)

**Completed:** 2026-02-03
**Phases:** 1-12

### What Shipped

**Authentication & Shell**

- Member registration/login with JWT
- Branch and level assignment
- Module system with lazy loading

**SPOM Engine**

- Imported 1040 SPOM rules, 936 weekly rotator entries, 1870 exercises
- Deterministic 9-stage session generation pipeline
- Format compatibility, contraction distribution, intensity-based budgets

**Training UI**

- Weekly view with 7-day navigation
- Day Player with 5-block flow (Initium, Nucleus, Deuteros 1/2, Athlos)
- Exercise display with video placeholders
- Session completion with RPE input

**Progression**

- Mi Camino page with level display (Greek letters)
- Training stats and RPE trend chart
- Evaluation request flow

**Brand Identity**

- Navy (#2c3e5c) + Bronze (#b8956c) palette
- Serif typography, marble textures
- App icons and splash screens

### Requirements Completed

- AUTH-01 through AUTH-05 (5)
- ARCH-01 through ARCH-04 (4)
- SPOM-01 through SPOM-09 (9)
- SGEN-01 through SGEN-09 (9)
- WEEK-01 through WEEK-05 (5)
- PLAY-01 through PLAY-11 (11)
- TIME-01 through TIME-07 (7)
- COMP-01 through COMP-06 (6)
- EVNT-01 through EVNT-05 (5)
- PROG-01 through PROG-04 (4)

**Total:** 65 requirements

### Deferred to Future

- COACH-01 through COACH-05 (moved to el-templo-admin)
- Admin Panel (moved to el-templo-admin)

---

_Last phase: 12_

## v2.0 — Admin App

**Completed:** 2026-02-28 (shipped with deferrals)
**Phases:** 13-28 (20 shipped, 4 deferred)

### What Shipped

**Session Generation Review (Phase 13)**

- Linear difficulty scale (1-12), validated against 19 coach-built example weeks
- Exercise count capped at 3 per non-Initium block

**Admin Session Management (Phases 14-15)**

- Admin Quasar app scaffolded
- Session review workflow: pending_review -> approved, bulk approve, coverage alerts
- Full session editing: swap exercises, modify prescriptions, change formats, add/remove/reorder
- Edit history audit trail via session_edit_logs

**PDF, Formats & Tracking (Phase 16)**

- pdfmake-based PDF session sheets
- Format-specific parameters (EMOM interval, AMRAP time cap, Complex rounds)
- Per-exercise completion tracking in member app
- Saved blocks for coach reuse

**Mobility Exercises (Phase 17)**

- Per-block mobility exercise, route-based selection
- Admin swap dialog, member app "Descanso Activo" section, PDF support

**Domain Deployment (Phase 18)**

- eltemplo.org subdomains (app/admin/api), SSL via Nginx on EC2
- Deploy pipeline for all 3 apps, CORS config

**Technical Debt Audit (Phase 19)**

- Sentry monitoring (API + frontend), Vitest integration tests
- CI quality gates, deploy backup/rollback, Husky + lint-staged
- DayPlayer refactor (900->350 LOC), edit-service refactor (1232->350 LOC)
- Eliminated all `any` types, database backup runbook

**Per-Member Journeys (Phase 20)**

- Journey system: body-zone focused sessions with 20/40/60 min durations
- Independent week counters per duration
- Admin journey generation and member overview
- Alumnos page for member management

**Video Integration (Phase 26)**

- Frontend video player in DayPlayer, API assembleVideoUrl utility

**Staging Environment (Phase 27)**

- Full staging on EC2: separate DB, Faker seed, weekly reset
- Android staging APK, iOS TestFlight workflow, CI staging deploy

**R2 Video Upload (Phase 28)**

- Cloudflare R2 presigned upload flow
- Admin Exercises page with bulk upload, video management

### Requirements Completed

- ADMIN-01 through ADMIN-15 (session management, editing, review)
- PDF-01 through PDF-03 (generation, format params)
- MOB-01 through MOB-04 (mobility exercises)
- DEPLOY-01 through DEPLOY-05 (domain, SSL, pipeline)
- DEBT-01 through DEBT-08 (tech debt, monitoring, tests)
- JOUR-01 through JOUR-08 (journeys, personalized sessions)
- VIDEO-01 through VIDEO-04 (upload, playback)
- STAGE-01 through STAGE-04 (staging environment)

### Deferred to Post-v3.0

- **Phase 21**: APK signing / Play Store submission
- **Phase 22**: Branch Attendance Data Model
- **Phase 23**: Admin Member Attendance Management
- **Phase 24**: Member Booking UI

---

_Last phase: 28_

> **Note on retroactive entries (v3.0 → v4.7):** These milestones were documented after-the-fact on 2026-04-27. Dates reflect the last commit touching the milestone's phase artifacts (per `git log` on `*-SUMMARY.md` files). Real shipping dates may extend beyond these — significant non-phase work (hotfixes, infra tweaks, tooling, design polish) accompanied each milestone but is not enumerated here. Requirement counts come from `ROADMAP.md` per-phase headers and dedicated `REQUIREMENTS-v4.X.md` files where they exist.

## v3.0 — Landing Page (el-templo-web)

**Completed:** 2026-03-03 (last phase artifact commit; ad-hoc work extended into March)
**Phases:** 29-44

### What Shipped

- Nuxt 3 scaffold + infrastructure parity (CI/CD, staging, Sentry, deploy pipeline)
- Design system, navigation, footer (`.docs/brand-landing/`)
- Homepage sections: Hero, Identity, Method, Levels, Approaches, Conversion, Locations, Community, Ecosystem, FAQ
- Separate pages: Franquicias, Gladius, Blog, Academy, App
- SEO audit + analytics, brand alignment, content/media handoff
- Day Player redesign, blog internal linking system (tags, related posts, cross-page CTAs)
- Franchise application management page

### Requirements Completed

By category (ROADMAP.md): FRAN-01..11, SEO-01..08, DS-01..08, NIV-01..07, INFRA-01..07, HERO-01..07, NAV-01..06, GLAD-01..06, BLOG-01..06, SED-01..05, MET-01..05, IDEN-01..05, FOOT-01..05, FAQ-01..05, ENF-01..05, ECO-01..04, COM-01..05, DESC-01..05 — **~110 requirements across 18 categories**.

### Reference

`.planning/research/landing-design-decisions.md` for design system; `.docs/brand-landing/` (38 files) for full spec.

---

_Last phase: 44_

## v4.0 — Ecosystem Foundation

**Completed:** 2026-03-25
**Phases:** 45-56 (45-52 ecosystem core + 53-56 codebase health)

### What Shipped

- Architecture foundation (modular monolith, virtual "Templo Online" branch, AURA tables)
- Lifestyle content extraction from arete-web reference codebase
- Members CRUD, subscriptions, payments (initial schema), attendance, scheduling, analytics
- QR check-in, class booking, dashboard analytics
- Codebase health: god object decomposition (DayPlayer, edit-service), timezone fixes, performance, test coverage
- Pattern fixes: composable instantiation, type safety, convention compliance

### Requirements Completed

By category (ROADMAP.md): SCHD-01..06, MEMB-01..06, SUBS-01..05, RSTRC-01..05, ATTN-01..05, PAY-01..04 — **31 requirements across 6 categories**.

---

_Last phase: 56_

## v4.1 — Admin Consolidation & Data Migration

**Completed:** 2026-03-25
**Phases:** 58-66 (Phase 62 — payment enhancements — skipped)

### What Shipped

- Production deployment with EC2/Nginx/PM2 stack
- Real data import: DeportNet → MySQL migration with legacy plan archival, bulk subscription seeding
- Plan configuration with budgets, fixed days (`subscription_schedules` junction table), grace period system
- QR access control: scan → confirmado + 10 AURA award; grace period removed (Phase 61 decision)
- Cash box (CajaPage) with payment recording, voiding, financial summary by method/branch
- Member management enhancements: photos via R2, member detail timeline
- Reports dashboard with paginated tables and Excel export (exceljs)
- Roles & permissions: owner > admin > coach = recepcionista (4-role hierarchy, centralized in `shared/permissions.ts`)

### Requirements Completed

By category (ROADMAP.md): PLANS-01..06, DATA-01..06, REPORT-01..05, ACCESS-01..05, ROLES-01..04, PAY-01..04, MEMBER-01..04, CASH-02..03, DEPLOY-01 — **38 requirements across 9 categories**.

---

_Last phase: 66_

## v4.2 — Clases Personalizadas Launch

**Completed:** 2026-03-19
**Phases:** 67-73

### What Shipped

- Personalizadas backend + frontend rename (journey → personalizada, J-prefix → P-prefix)
- Subscription gate, AURA rewards, module enable
- Personalizadas cycle config (configurable cycle length per plan, no new DB column)
- Plan-driven personalizada assignment (PersonalizadasService instantiated by SubscriptionService)
- Unified training experience: context-aware `/training` routing, post-session flows unified to `/mi-camino`
- Planes — plan catalog for members (Mi Camino three-mode layout)

### Requirements Completed

`REQUIREMENTS-v4.2.md`: **PERS-01..17** (17 requirements, single category).

---

_Last phase: 73_

## v4.3 — Android Play Store Launch

**Completed:** 2026-03-21
**Phases:** 74-77

### What Shipped

- Capacitor v8 alignment (CLI ↔ native plugins), Node 22 requirement, minSdkVersion 24
- Upload keystore generation + secure storage in GitHub Secrets
- Production-only ProGuard via androidComponents API; cleartext disabled in production via flavor manifest overlays
- Production signed AAB build via `build-android-production.yml` (variant-scoped signing, master branch guard)
- Play Store listing: descriptions, screenshots, feature graphic, privacy policy
- Compliance: data safety, content rating (IARC), target audience declaration
- Internal testing → production track promotion → live on Play Store

### Requirements Completed

`REQUIREMENTS-v4.3.md`: **PLAY-01..22** (22 requirements, single category).

### Reference

`project_play_store_setup.md` in memory for full setup status.

---

_Last phase: 77_

## v4.4 — App Engagement & Intelligent Companion

**Completed:** 2026-04-03
**Phases:** 78-88

### What Shipped

- Onboarding profiling (member_profiles table, gender, training intent, segments)
- Behavioral segmentation (calculateSegment with 1-hour cooldown, batch cron)
- "Tu Día" daily game plan with segment-driven card ordering
- Streaks & engagement mechanics (StreakService, milestone-driven AURA awards)
- Progressive profiling & check-ins (advisory feedback loop with energy/soreness/sleep priority)
- Micro-program upsells "Experiencias a Medida" (program_enrollments, polymorphic content blocks, weekly session-gated unlocks)
- Push notifications foundation (FCM via firebase-admin, queue-based delivery via pending_notifications + 15-min cron)
- Guía — exercise & mobility library
- QR Promo — Free Month campaign (302 redirects, eltemplo.org QR encoding)
- Localization — Spain vs Argentina copywriting variants
- Reservation rules — per-plan booking configuration

### Requirements Completed

`REQUIREMENTS-v4.4.md`: **ENG-01..24** (24 requirements, single category).

### Reference

`project_v44_app_engagement.md` in memory.

---

_Last phase: 88_

## v4.5 — Planes Online (Digital Monetization)

**Completed:** 2026-04-06
**Phases:** 89-92

### What Shipped

- Backend & admin "Planes Online" infrastructure (Phase 89 = 7 plans + admin dual-subscription support)
- Onboarding quiz redesign with avatar profiling (`avatar_type`, V2 onboarding service alongside V1)
- App UX: plan catalog & purchase flow
- Marketing deliverables: launch collateral

### Requirements Completed

By category (ROADMAP.md): MON-01..10 (digital monetization), AVA-01..08 (avatar profiling), plus design decisions D-12, D-13 — **~20 requirements across 2 categories**.

### Reference

`.docs/planes-online-strategy.md`.

---

_Last phase: 92_

## v4.6 — iOS App Store Launch

**Completed:** 2026-04-07
**Phases:** 93-95 (Phase 93 has artifacts; 94-95 absorbed into v4.7 ad-hoc execution)

### What Shipped

- iOS build pipeline via GitHub Actions (macOS runners, Xcode 26 / iOS 26 SDK alignment per ITMS-90725 deadline 2026-04-28)
- Xcode signing config, version management mirroring Android approach
- App Store Connect setup: bundle ID, listing, privacy, age rating
- TestFlight distribution + App Store submission

### Requirements Completed

`ROADMAP.md`: **IOS-01..15** (15 requirements).

---

_Last phase: 95_

## v4.7 — Full Body, ROM, and Ad-Hoc Coach Requests

**Completed:** 2026-04-27
**Phases:** 96-104 (originally 96-97 coach work, expanded ad hoc with 98-104)

### What Shipped

**Coach session enhancements (96-97):**

- Full Body goal plan type for home calisthenics with no-equipment + coach-driven exercise equipment tagging (Phase 96)
- ROM Mode — Saturday mobility sessions (Lower/Core/Upper body zones, Básico/Avanzado tiers, Phase 97)

**Ad-hoc additions (98-104):**

- Phase 98: Multi-currency + country-scoped plans (AR/ARS, ES/EUR), owner-only country toggle, branch-scoped staff filtering
- Phase 99: Member-selectable training level
- Phase 100: Games format + exercise route overhaul + session editor route UX (Spanish route renaming)
- Phase 101: Debt tracking — `debts` table with one-active-per-user invariant **(to be replaced in v4.8 by transactional model)**
- Phase 102: Trial Classes (Sesiones de Prueba) via `bookings.is_trial`, one-trial-per-phone guard, leads filter
- Phase 103: User Status enum (freemium/prueba/activo/inactivo) replacing `users.is_active`; `staff_disabled` login gate
- Phase 104: Planes vs Programas + Bundle "Todos los Programas" (`grants_all_programs`, `current_program_enrollment_id`)

### Requirements Completed

Phase 98: **REQ-98-01..11** (11 requirements). Phases 96, 97, 99-104 specified inline in ROADMAP via SPEC sections and design decisions (D-IDs).

---

_Last phase: 104_
