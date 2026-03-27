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

## v5.0 — WhatsApp AI Chatbot

**Completed:** 2026-03-26
**Phases:** 67-73 (7 phases, 15 plans)
**Requirements:** 23/23 complete
**Timeline:** 2026-03-17 → 2026-03-26 (9 days)
**Stats:** 98 files changed, ~16,000 lines added (3,600 LOC bot, 1,100 LOC admin UI, 1,100 LOC API service, 2,300 LOC tests)

### What Shipped

**WhatsApp Cloud API Integration (Phase 67)**

- el-templo-bot: separate Fastify process on port 3001 with PM2
- Meta Cloud API webhook (GET verify + POST handler)
- DB schema: whatsapp_conversations + whatsapp_messages tables with dedup

**AI-Powered Conversations (Phase 68)**

- Model-agnostic AiProvider (OpenAI GPT-4o mini / Anthropic Haiku)
- System prompt with business context (schedules, pricing, locations, FAQ)
- Function calling tools: check_schedule, check_membership, get_location, request_human
- Message splitting at 800 chars, max 5 tool loop iterations

**Memory & State Management (Phase 69)**

- Redis session context: last 20 messages, 6h TTL, graceful degradation
- Customer profiles: 90d TTL, injury notes, preferences
- Client state machine: LEAD → TRIAL → ACTIVE_MEMBER → INACTIVE_MEMBER → EXPIRED_MEMBER

**Action Tools (Phase 70)**

- book_class: reserves class spot via localhost API call with WhatsApp button confirmation
- register_trial: creates trial user with button confirmation
- Interactive button reply handling in webhook pipeline

**Proactive Schedulers (Phase 71)**

- Class reminder: WhatsApp template N hours before booked class (node-cron + Redis distributed lock)
- Trial follow-up: 24-48h after attendance, offers membership info
- Redis dedup keys prevent duplicate sends on process restart

**Admin Panel (Phases 72-73)**

- ConversacionesPage: paginated list with search, status/state filters, unread badge
- ConversacionDetailPage: chat bubble UI, message history, member link
- Human takeover: "Tomar control" pauses bot, admin sends messages, "Devolver al bot" resumes
- 5-second polling for real-time message updates

### Requirements Completed

- HOOK-01 through HOOK-04 (webhook & infrastructure)
- AI-01 through AI-08 (AI processing & tools)
- MEM-01 through MEM-04 (memory & state)
- SCHED-01, SCHED-02 (proactive schedulers)
- ADMIN-01 through ADMIN-05 (admin panel)

**Total:** 23 requirements

### Future (v5.1+)

- SCHED-03 through SCHED-06 (renewal nudge, re-engagement, review request, birthday messages)
- ADV-01 through ADV-04 (media messages, WebSocket, scheduler UI, auto-prompt generation)

---

_Last phase: 73_

## v5.1 — Production Readiness & Business Data

**Completed:** 2026-03-27
**Phases:** 74-78 (5 phases, 7 plans)
**Requirements:** 23/23 complete
**Timeline:** 2026-03-26 → 2026-03-27 (1 day)
**Stats:** 43 files changed, ~4,100 lines added

### What Shipped

**Business Data Integration (Phase 74)**

- Structured knowledge file (`knowledge.ts`, 348 lines) with 7 sections: pricing, Zero rules, schedules, ROM, trial flow, app help, upgrade paths
- System prompt wired to inject business knowledge into every AI response
- Fixed `get_location` tool with real Mar del Plata addresses and Google Maps links for all 5 branches
- 19 knowledge accuracy tests

**Database Seeding (Phase 75)**

- Schema migration: address, phone, googleMapsUrl columns on branches table
- Production seed rewrite (453 lines): 5 real MDP branches, per-branch schedules, 2 activity types (Sesion Grupal + ROM), 6 subscription plans with real pricing
- Idempotent via ON DUPLICATE KEY UPDATE + check-then-insert patterns

**Known Issues Fix (Phase 76)**

- Scheduler SQL: `booking_status`/`subscription_status` (was bare `status`)
- OpenAI provider: `tool_calls` array on assistant messages (prevents validation errors)
- Phone normalization: confirmed in all 3 send functions (already fixed in v5.0)

**GitHub Actions Deployment (Phase 77)**

- Bot added to full CI/CD pipeline: detect-changes, build-bot, .env.production (17 vars), rsync, PM2 restart, backup/rollback
- PM2 script path fixed to `dist/el-templo-bot/src/index.js`
- API .env.production expanded with 11 missing production vars
- Docs: GitHub Secrets checklist + WhatsApp permanent System User token setup guide

**WhatsApp Production Setup (Phase 78)**

- Meta template message docs: class_reminder (3 params), trial_followup (1 param) with submission instructions
- Phone number registration guide
- MySQL timezone migration for CONVERT_TZ support

### Requirements Completed

- BIZ-01 through BIZ-08 (business data)
- SEED-01 through SEED-05 (database seeding)
- FIX-01 through FIX-03 (bug fixes)
- DEPLOY-01 through DEPLOY-04 (deployment)
- WA-01 through WA-03 (WhatsApp production)

**Total:** 23 requirements

### Production Launch Checklist

1. Add GitHub Secrets per `docs/deployment/github-secrets-checklist.md`
2. Generate permanent WA token per `docs/deployment/whatsapp-token-setup.md`
3. Submit Meta templates per `docs/deployment/whatsapp-templates.md`
4. Register phone number per `docs/deployment/whatsapp-phone-registration.md`
5. Run migrations 0042 + 0043 on production DB
6. Run `pnpm seed:production` on production
7. Push to master — CI deploys bot automatically

---

_Last phase: 78_
