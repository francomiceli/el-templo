# Milestones

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
