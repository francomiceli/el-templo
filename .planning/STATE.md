---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Landing Page
status: completed
stopped_at: Completed 57-02-PLAN.md
last_updated: "2026-03-12T14:28:41.642Z"
last_activity: "2026-03-12 — Completed 57-02: App registration form with required DNI/phone fields and Park branch param"
progress:
  total_phases: 42
  completed_phases: 34
  total_plans: 159
  completed_plans: 157
  percent: 98
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-08)

**Core value:** The operational backbone works — coaches manage from one admin, members check in and reserve spots, architecture ready for AURA/lifestyle/social.
**Current focus:** v4.0 Ecosystem Foundation — Phase 46 executing

## Current Position

Phase: 57 (Registration Types and Member Creation Flow Fixes)
Plan: 2 of 3 in current phase
Status: Plan 57-02 complete — App registration form with DNI+phone and branch param
Last activity: 2026-03-12 — Completed 57-02: App registration form with required DNI/phone fields and Park branch param

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
| Phase 52 P01 | 16min | 2 tasks | 7 files |
| Phase 52 P02 | 5min | 2 tasks | 7 files |
| Phase 53 P01 | 5min | 2 tasks | 6 files |
| Phase 53 P02 | 11min | 2 tasks | 5 files |
| Phase 53 P03 | 4min | 2 tasks | 2 files |
| Phase 54 P03 | 4min | 2 tasks | 4 files |
| Phase 54 P02 | 8min | 2 tasks | 26 files |
| Phase 55 P01 | 5min | 2 tasks | 9 files |
| Phase 55 P02 | 3min | 2 tasks | 13 files |
| Phase 55 P03 | 7min | 2 tasks | 8 files |
| Phase 56 P01 | 4min | 1 tasks | 4 files |
| Phase 56 P02 | 4min | 1 tasks | 5 files |
| Phase 56 P04 | 6min | 2 tasks | 8 files |
| Phase 56 P05 | 26min | 1 tasks | 2 files |
| Phase 56 P03 | 10min | 2 tasks | 6 files |
| Phase 57 P01 | 15min | 2 tasks | 15 files |
| Phase 57 P02 | 1min | 1 tasks | 2 files |

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
- [Phase 52-01]: Analytics module: read-only service with parallel Promise.all aggregation queries, no new DB tables
- [Phase 52-01]: Morosos KPI trend uses flat direction -- snapshot metric with no historical baseline for prior-period comparison
- [Phase 52-01]: Retention rate: members with ending subscriptions who have another active/paused sub
- [Phase 52-01]: Heatmap MySQL DAYOFWEEK converted to ISO (1=Mon..7=Sun) for frontend consistency
- [Phase 52-01]: Default date range: current calendar month when no dateFrom/dateTo provided
- [Phase 52]: vue-chartjs with chart.js for dashboard charts; HTML table for heatmap instead of chart library
- [Phase 52]: Morosos KPI trend inverted: up=red (bad), down=green (good)
- [Phase 52]: Lazy tab loading: fetch data only for active tab, refetch on switch
- [Phase 53-01]: Argentina fixed UTC-3 offset in buildClassDateTime — no DST since 2009, safe to hardcode
- [Phase 53-01]: Noon-UTC pattern for all date string arithmetic to avoid day-boundary drift
- [Phase 53-01]: Separate vitest.config.unit.ts for pure unit tests without DB global setup
- [Phase 53-01]: Shared date-utils module: pure functions with explicit timezone parameter for testability
- [Phase 53-02]: N+1 fix: batch GROUP BY + Map<compositeKey, count> lookup replaces per-row COUNT in getWeeklyGrid
- [Phase 53-02]: Hand-written migration for indexes when drizzle-kit generate has interactive schema drift
- [Phase 53-02]: subscription_status enum name used in CREATE INDEX SQL (MySQL enum column name, not Drizzle property name)
- [Phase 53-03]: Relative date helpers (today(), daysAgo(n)) for time-independent streak tests
- [Phase 53-03]: Past slot uses 00:01 time for deterministic past-class testing without time mocking
- [Phase 53-03]: Cancel window edge case (20-min cutoff) covered by date-utils unit tests, not integration tests
- [Phase 54]: Move response interceptor inside boot() callback for router access (Quasar pattern)
- [Phase 54]: DOMPurify v3.3.3 ships own types -- @types/dompurify deprecated stub not needed
- [Phase 54]: extractError unified to check both .error and .message response fields across 13 composables
- [Phase 54]: formatDate shared utility uses es-AR locale with month:short -- non-standard variants (month:long, includes time, Date input) left untouched
- [Phase 55]: extractError in app mirrors admin version exactly -- same API, same fallback chain (error then message field)
- [Phase 55]: useWakeLock.initialize() registers visibilitychange listener -- moved from removed onMounted
- [Phase 55]: Drizzle typed partials: Partial<typeof table.$inferInsert> for all .set() calls instead of Record<string, unknown>
- [Phase 55]: getMorososCount uses WHERE with correlated subquery (not HAVING) for correct per-row COUNT filtering
- [Phase 56]: Each dialog creates own useSchedulingApi/useMembersApi instances -- composables are lightweight fetch wrappers, not singletons
- [Phase 56]: v-model:show pattern with explicit emit for dialog extraction -- replaced v-close-popup directive
- [Phase 56]: Each tab registers only its needed Chart.js components -- simpler than shared registration
- [Phase 56]: shallowRef + watch replaces computed for composable instantiation -- prevents reactive instance leaks
- [Phase 56]: Constructor DI for AttendanceService/SubscriptionService -- dependencies injected via constructor, instantiated in route plugins
- [Phase 56]: AuraService instantiated without log param to avoid FastifyBaseLogger vs pino.Logger type mismatch (log is optional)
- [Phase 56]: Drizzle correlated subquery bug: ${schema.table.column} inside sql`` subqueries generates parameter placeholders instead of column refs -- use raw SQL column names
- [Phase 56]: SchedulingService decomposed into 4 domain services (ActivityService, BookingService, HolidayService, SchedulingService 630 LOC)
- [Phase 56]: BookingService receives PaymentService+SubscriptionService via constructor DI -- route plugins handle service wiring
- [Phase 57]: Resend over nodemailer for EmailService -- project already uses Resend in 4 services, consistency over plan spec
- [Phase 57]: Plan-first admin member creation: planId required, auto-password via crypto.randomBytes, auto-subscription via SubscriptionService
- [Phase 57]: Auth register defaults to ONLINE branch (not PARK), requires DNI+phone+firstName+lastName, checks DNI uniqueness
- [Phase 57]: Test createMember helpers use registerUser() auth endpoint instead of POST /admin/members to avoid auto-subscription side effects
- [Phase 57]: Header text 'Registrarse' by default, 'Registrarse en Park' when branchId present (per user decision)

### v2.0 Deferrals

- Phase 21: APK signing / Play Store
- Phase 22-24: Branch Attendance (now rebuilt properly as Phases 50-51)

### Reference Codebases

- El-Templo-Net: members, subscriptions, payments, scheduling, analytics (16 tables)
- Arete Web (canonical): Next.js PWA — 39 habits + 12 seasonal, 70 journal questions, 60 challenges, 160 factos, 149 wisdom quotes, 25 achievements, 20 levels, axis XP, AURA economy with per-habit scaling, redemption store, Tummo breathing, 5 leagues, 12 badges. Greek-only philosophy. Replaces the older arete-app (React Native, deprecated).
- Both reference only — features rebuilt on Vue/Fastify/MySQL stack

### Pending Todos

None yet.

### Roadmap Evolution

- Phase 53 added: Codebase health — timezone fixes, god object decomposition, performance optimization, test coverage

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-03-12T14:28:41.639Z
Stopped at: Completed 57-02-PLAN.md
Resume file: None
