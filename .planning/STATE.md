---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Landing Page
status: completed
stopped_at: Phase 52 context gathered
last_updated: "2026-03-10T16:43:03.999Z"
last_activity: "2026-03-10 — Completed 51-03: Member Scheduling UI"
progress:
  total_phases: 38
  completed_phases: 30
  total_plans: 142
  completed_plans: 141
  percent: 98
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-08)

**Core value:** The operational backbone works — coaches manage from one admin, members check in and reserve spots, architecture ready for AURA/lifestyle/social.
**Current focus:** v4.0 Ecosystem Foundation — Phase 46 executing

## Current Position

Phase: 51 of 52 (Scheduling)
Plan: 3 of 3 in current phase
Status: Plan 51-03 complete — member scheduling UI with weekly calendar grid, booking/waitlist/cancel flows, 4th bottom tab
Last activity: 2026-03-10 — Completed 51-03: Member Scheduling UI

Progress: [██████████] 98%

## Performance Metrics

**Velocity:**

- Total plans completed: 7
- Average duration: 5min
- Total execution time: 0.6 hours

**By Phase:**

| Phase                           | Plans | Total | Avg/Plan |
| ------------------------------- | ----- | ----- | -------- |
| 45-architecture-foundation      | 3     | 12min | 4min     |
| 46-lifestyle-content-extraction | 2     | 12min | 6min     |

**Recent Trend:**

- Last 5 plans: 45-02 (3min), 45-03 (5min), 46-01 (4min), 46-01-redo (5min), 46-02-redo (5min)
- Trend: Stable

_Updated after each plan completion_
| Phase 46 P01 | 8min | 2 tasks | 3 files |
| Phase 47 P01 | 13min | 2 tasks | 12 files |
| Phase 47 P03 | 5min | 1 task | 4 files |
| Phase 47 P02 | 6min | 2 tasks | 5 files |
| Phase 48 P01 | 24min | 2 tasks | 13 files |
| Phase 48 P02 | 8min | 3 tasks | 14 files |
| Phase 49 P01 | 9min | 2 tasks | 16 files |
| Phase 49 P02 | 5min | 2 tasks | 10 files |
| Phase 50 P01 | 11min | 2 tasks | 13 files |
| Phase 50 P02 | 3min | 2 tasks | 9 files |
| Phase 50 P03 | 3min | 1 tasks | 8 files |
| Phase 51 P01 | 15min | 2 tasks | 19 files |
| Phase 51 P03 | 3min | 2 tasks | 5 files |
| Phase 51 P02 | 4min | 2 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Virtual "Templo Online" branch: avoids nullable branchId everywhere
- Modular monolith: formalize src/modules/ pattern with explicit boundaries
- Barrel export convention: each module has index.ts defining public API; import from barrel not internals
- AURA tracking from day 1: foundation tables so early adopters aren't penalized
- AURA schema: separate mysqlEnum per table (source_type vs aura_config_source_type) to avoid MySQL column name collision
- AuraService uses constructor DI (db + logger) for testability, not Fastify decorator
- AuraSourceType union type for compile-time safety on AURA source types
- Merge admin apps: Net features rebuilt in Vue/Quasar within existing el-templo-admin
- Seed data pattern: typed arrays with 'as const satisfies readonly Type[]' for compile-time validation
- Lifestyle content: light brand adaptation preserving original rioplatense tone, only removing brand references
- [Phase 46 RESET]: Original extraction from arete-app is outdated — arete-web is canonical source with significantly expanded content (20 levels vs 5, 60 challenges vs 36, 160 factos vs 80, Greek-only philosophy, 7 new systems)
- [Phase 46 RESET]: Old seed files (habits, factos, journal-questions, tools) need replacement from arete-web
- [Phase 46 RESET]: DEFERRED-CONTENT.md rewritten with full arete-web inventory
- [Phase 46-02]: Curated 46 factos from 172 eligible with diverse category spread (all 7 categories covered)
- [Phase 46-02]: Tool framework strings translated English->Spanish for brand consistency
- [Phase 46-02]: Complete lifestyle barrel export wires all 5 seed files with full type coverage
- [Phase 46]: Full replace of habits.seed.ts from arete-web with complete field set (verificationType, dataType, auraScaling, imageAsset, linkedQuoteArea, facto)
- [Phase 46]: CUE-04 is Respiracion Tummo at L1 with dataType count (arete-web canonical, not old Respiracion controlada at L2)
- [Phase 47-01]: Drizzle wraps MySQL errors in err.cause — isDuplicateKeyError helper checks ER_DUP_ENTRY on cause
- [Phase 47-01]: Plugin-level onRequest hook for admin role guard on all member routes
- [Phase 47-01]: check-dni route before :userId parametric routes to avoid Fastify route conflicts
- [Phase 47-03]: Parallel data loading (profile required, journey non-blocking) for fast page render
- [Phase 47-03]: Auth store (Pinia) provides currentUser for note permission checks
- [Phase 47-03]: MemberFormDialog created as Rule 3 deviation (Plan 02 Task 2 not yet executed)
- [Phase 47]: Added GET /admin/members/branches endpoint — no dedicated branches API existed, placed in members plugin behind same auth guard
- [Phase 47]: Default status filter to active-only for practical coach workflow in members list
- [Phase 48-01]: Drizzle mysqlEnum name becomes the SQL column name — migration DDL must match enum name (subscription_status not status)
- [Phase 48-01]: One active/paused subscription per member enforced at service layer (MySQL lacks partial unique indexes)
- [Phase 48-01]: AURA discount tiers: 500=5%, 1000=10%, 2000=20%, 5000=30% — members spend AURA for price reduction
- [Phase 48-01]: Boarding pass tracked on users.boarding_pass_used — one-time use, admin-applied
- [Phase 48-01]: Expire-on-read pattern: auto-update expired subscriptions when queried (no cron)
- [Phase 48-02]: boardingPassUsed defaults to false in admin UI — pricing preview API handles eligibility check
- [Phase 48-02]: Member-facing subscription route as separate plugin at /api/members/subscription (auth-only, not admin)
- [Phase 48-02]: QStepper for multi-step assign dialog: plan selection -> pricing preview -> confirmation
- [Phase 49-01]: Overdue computed on read via correlated subquery -- no stored column, no cron
- [Phase 49-01]: PaymentService defines own NotFoundError/BadRequestError for module independence
- [Phase 49-01]: Recorder name resolved via raw SQL alias join (users as recorder) to avoid Drizzle self-join conflict
- [Phase 49-01]: Financial summary defaults to current month when no date range specified
- [Phase 49-01]: Members overdue subquery counts expired subscriptions with insufficient payment sum
- [Phase 49-02]: recorderName field matches API response (not recordedByName)
- [Phase 49-02]: MemberPaymentTab shows register button even without subscription for one-off payments
- [Phase 49-02]: Morosos count badge refreshed every 60s via setInterval in AdminLayout
- [Phase 49-02]: QToggle for Morosos filter -- visually distinct, doesn't conflict with active/inactive filter
- [Phase 50]: HMAC-SHA256 QR tokens using JWT_SECRET -- reuse existing env var, base64url(payload).base64url(signature) format
- [Phase 50]: Two-step attendance model: QR scan creates registrado, coach batch-confirm promotes to confirmado + AURA award
- [Phase 50]: Overdue check triggers on paused subs past end date; active subs auto-expire first (caught by no-active-sub check)
- [Phase 50]: [Phase 50-03]: html5-qrcode over native Capacitor plugin -- pure JS, works in WebView and web, no native bridge needed
- [Phase 50-02]: qrcode npm package for client-side QR image generation with toDataURL download
- [Phase 50-02]: Auto-select all registrado records for batch confirm workflow efficiency
- [Phase 50-02]: 30s polling for real-time QR scan visibility in AsistenciaHoyPage
- [Phase 50]: [Phase 50-03]: branchIsVirtual added to auth API login+me responses for FAB visibility without extra API call
- [Phase 51-01]: Separate ALTER statements in migration for MySQL 5.7 compat (IF NOT EXISTS not supported on ADD COLUMN)
- [Phase 51-01]: Shared handleServiceError helper in routes.ts for DRY error handling across all scheduling endpoints
- [Phase 51-01]: getFutureSlot test helper dynamically calculates bookable slots relative to current time for reliable tests
- [Phase 51-01]: Delete old cancelled/no_show bookings on re-reserve to avoid unique constraint violation
- [Phase 51-03]: mobileTabs converted to computed for conditional Reservas tab based on branchIsVirtual
- [Phase 51-03]: AbortController pattern in useSchedulingApi for request cancellation on unmount
- [Phase 51-03]: O(1) Map-based slot lookup for grid cell rendering performance
- [Phase 51]: Custom CSS grid over QTable for weekly calendar -- tables don't render well for time/day matrix layouts

### v2.0 Deferrals

- Phase 21: APK signing / Play Store
- Phase 22-24: Branch Attendance (now rebuilt properly as Phases 50-51)

### Reference Codebases

- El-Templo-Net: members, subscriptions, payments, scheduling, analytics (16 tables)
- Arete Web (canonical): Next.js PWA — 39 habits + 12 seasonal, 70 journal questions, 60 challenges, 160 factos, 149 wisdom quotes, 25 achievements, 20 levels, axis XP, AURA economy with per-habit scaling, redemption store, Tummo breathing, 5 leagues, 12 badges. Greek-only philosophy. Replaces the older arete-app (React Native, deprecated).
- Both reference only — features rebuilt on Vue/Fastify/MySQL stack

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-03-10T16:43:03.995Z
Stopped at: Phase 52 context gathered
Resume file: .planning/phases/52-analytics-dashboard/52-CONTEXT.md
