---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Landing Page
status: phase-complete
stopped_at: Phase 75 complete — build succeeded, AAB+APK artifacts produced
last_updated: "2026-03-23"
progress:
  total_phases: 75
  completed_phases: 63
  total_plans: 261
  completed_plans: 257
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-14)

**Core value:** The admin app is fully operational for physical branches -- real member data imported, access control with soft verification, cash box tracking, enhanced payments with discounts and debt management, and role-based permissions for branch staff.
**Current focus:** Phase 76 — play-store-setup-listing

## Current Position

Phase: 75 (android-signing-release-build) — COMPLETE
Next: Phase 76 (play-store-setup-listing)

## Performance Metrics

**Velocity:**

- Total plans completed: 11 (v4.1)
- Average duration: ~11min
- Total execution time: ~122min

**By Phase:**

| Phase | Plans | Total  | Avg/Plan |
| ----- | ----- | ------ | -------- |
| 58    | 2/2   | ~30min | ~15min   |
| 59    | 4/4   | ~34min | ~9min    |
| 60    | 3/3   | ~52min | ~17min   |

**Recent Trend (from v4.0):**

- Last 5 plans: 63-02 (6min), 63-03 (4min), 63-01 (39min), 61-02 (25min), 61-01 (23min)
- Trend: Stable

_Updated after each plan completion_
| Phase 59 P02 | 4min | 2 tasks | 3 files |
| Phase 59 P03 | 15min | 2 tasks | 2 files |
| Phase 59 P04 | 6min | 2 tasks | 7 files |
| Phase 60 P01 | 25min | 2 tasks | 17 files |
| Phase 60 P02 | 22min | 2 tasks | 11 files |
| Phase 60 P03 | 5min | 2 tasks | 7 files |
| Phase 61 P01 | 23min | 2 tasks | 20 files |
| Phase 61 P02 | 25min | 2 tasks | 17 files |
| Phase 63 P01 | 39min | 2 tasks | 29 files |
| Phase 63 P02 | 6min | 2 tasks | 13 files |
| Phase 63 P03 | 4min | 2 tasks | 4 files |
| Phase 64 P01 | 26min | 2 tasks | 11 files |
| Phase 64 P03 | 47min | 2 tasks | 8 files |
| Phase 65 P01 | 7min | 2 tasks | 7 files |
| Phase 65 P02 | 3min | 2 tasks | 5 files |
| Phase 66 P01 | 11min | 2 tasks | 38 files |
| Phase 66 P02 | 4min | 2 tasks | 8 files |
| Phase 67 P01 | 6min | 2 tasks | 14 files |
| Phase 67 P02 | 9min | 2 tasks | 13 files |
| Phase 68 P01 | 6min | 2 tasks | 8 files |
| Phase 68 P02 | 9min | 2 tasks | 18 files |
| Phase 69 P01 | 13min | 2 tasks | 11 files |
| Phase 69 P02 | 2min | 2 tasks | 3 files |
| Phase 70 P01 | 6min | 2 tasks | 5 files |
| Phase 70 P02 | 4min | 2 tasks | 5 files |
| Phase 71 P02 | 5min | 2 tasks | 8 files |
| Phase 71 P01 | 15min | 2 tasks | 7 files |
| Phase 72 P01 | 4min | 2 tasks | 2 files |
| Phase 73 P01 | 3min | 2 tasks | 2 files |
| Phase 72 P03 | 3min | 2 tasks | 2 files |
| Phase 72 P02 | 5min | 2 tasks | 4 files |
| Phase 73 P02 | 4min | 2 tasks | 5 files |
| Phase 74 P01 | 2min | 2 tasks | 7 files |
| Phase 74 P02 | 2min | 2 tasks | 7 files |
| Phase 75 P01 | 4min | 2 tasks | 3 files |
| Phase 75 P02 | 2min | 2 tasks | 1 files |

## Accumulated Context

### Roadmap Evolution

- Phase 70 added: Personalizadas Cycle Config — configurable cycle length per plan, progress bars in member app

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Merge admin apps: Net features rebuilt in Vue/Quasar within existing el-templo-admin
- Modular monolith: formalize src/modules/ pattern with explicit boundaries
- Constructor DI pattern for services (established in Phase 56)
- Resend over nodemailer for EmailService (Phase 57)
- Plan-first admin member creation with auto-subscription (Phase 57)
- Production seed uses CONFIRM_PRODUCTION_SEED=yes safety gate (Phase 58)
- Nullable column extension pattern for backward-compatible schema changes (Phase 59)
- [Phase 59]: documentType required in create mode only, optional in edit mode for backward compatibility
- [Phase 59]: CSV import script uses static imports for drizzle-orm to avoid dynamic import type mismatches
- [Phase 59]: 84 unique legacy plan names found, all created as archived subscription_plans on import
- [Phase 59]: Bulk migration sets pricePaid=0 for legacy-to-current plan migrations (admin adjusts later)
- [Phase 60]: system_settings key-value table for global config (grace period, future settings)
- [Phase 60]: Budget pre-calculated at subscription creation: ceil(durationDays/7) \* classesPerWeek
- [Phase 60]: fixedDays stored as JSON array on subscription record for per-subscription flexibility
- [Phase 60]: DAY_LABELS shared constant in subscription types for UI day display
- [Phase 60]: Conditional stepper step pattern using computed confirmStep for dynamic step count
- [Phase 60]: Grace period intercept bypasses auto-expire; getSubscriptionWithGracePeriod queries raw status
- [Phase 60]: SettingsService optional on SubscriptionService for backward-compatible grace-period-aware auto-expire
- [Phase 60]: Force check-in decrements budget to maintain accuracy despite bypassing all other checks
- [Phase 61]: Grace period fully removed -- expired subscription = immediate hard block
- [Phase 61]: QR scan immediately creates "confirmado" status and awards 10 AURA (no two-step model)
- [Phase 61]: subscription_schedules junction table for fixed-plan schedule slot references (replaces fixedDays JSON)
- [Phase 61]: SettingsService kept as empty shell for future settings extensibility
- [Phase 61]: Setter DI pattern (setBookingService) for SubscriptionService<->BookingService circular dependency
- [Phase 61]: Coach check-in from slot always allows action but returns subscription warnings
- [Phase 61]: Attendance undo uses AURA spend for reversal (graceful if insufficient balance)
- [Phase 63]: Subscription renewal extends existing record (same ID) rather than creating new subscription
- [Phase 63]: Auto-payment recording on assign/change/renew via PaymentService DI in SubscriptionService
- [Phase 63]: Morosos/balance/overdue concept fully removed from payments, members, analytics, attendance, booking
- [Phase 63]: Renewal end date preview computed client-side from subscription duration; actual calculation server-side
- [Phase 63]: Payment method selector pattern: QSelect with PAYMENT_METHOD_OPTIONS, emit-value, map-options
- [Phase 63]: Recepcionista added to AdminRole type for caja route access
- [Phase 63]: Morosos/overdue UI fully removed from sidebar, AlumnosPage, AlumnoDetailPage
- [Phase 64]: Reused blog image presigned URL pattern for member photos (PutObjectCommand + getSignedUrl)
- [Phase 64]: [Phase 64]: exceljs for server-side Excel export with styled headers; drizzle-kit push replaces raw SQL migration parsing in test setup
- [Phase 64]: Proration credit uses pricePaid (actual amount paid) not priceRegular; applied via priceOverrideAmount to reuse assignPlan logic
- [Phase 64]: Preview endpoint pattern: GET /change-plan-preview returns mutation preview before POST confirmation
- [Phase 65]: Raw SQL for charge history recorder self-join (drizzle lacks multi-alias on same table)
- [Phase 65]: Export methods reuse query methods with high limit for DRY
- [Phase 65]: Paginated report pattern: PaginatedResult<T> with rows/total/page/limit
- [Phase 65]: Single-file ReportesPage with inline tabs for data table simplicity; per-tab independent date ranges
- [Phase 66]: Centralized role permission registry in shared/permissions.ts; all modules import role groups, never define local arrays
- [Phase 66]: Owner replaces superadmin throughout API; four-role hierarchy: owner > admin > coach = recepcionista (parallel)
- [Phase 66]: Cast pattern (ROLES as readonly string[]).includes() for const array TypeScript compatibility
- [Phase 66]: Permission-aware sidebar with isCoachRole/isAdminRole/isCajaRole/isOwnerRole computed props
- [Phase 66]: Role-based route redirect: recepcionista -> /alumnos, all others -> /sessions
- [Phase 67]: DayId prefix changed from J- to P- for personalizada sessions
- [Phase 67]: API response keys renamed: journey -> personalizada, journeys -> personalizadas
- [Phase 67]: Spanish error messages updated to use personalizada terminology
- [Phase 68]: BlockProgressionView props updated to match current interface in PersonalizadaSession.vue
- [Phase 69]: checkSubscription queries active/paused subscriptions joined to plans where isPersonalizada=true
- [Phase 69]: AURA award failure on personalizada completion is logged but does not fail the completion (graceful degradation)
- [Phase 69]: Used q-tooltip on toggle instead of hint prop for cleaner UI
- [Phase 70]: cycleWeeks derived from ceil(durationDays/7) -- no new DB column, all data from existing tables
- [Phase 70]: Change button hidden when wrap-up card shows (wrap-up has own CTA); fetchPersonalizadaData awaited to set default tab
- [Phase 71]: Removed selectPersonalizada from store and API composable since only deleted pages used it
- [Phase 71]: PersonalizadasService instantiated in SubscriptionService constructor (no circular dependency)
- [Phase 72]: Secondary plan query pattern in member-routes handler for plan-level fields, avoiding shared SubscriptionDetail type modification
- [Phase 73]: No new types needed -- member plan response shape derived inline with field filtering
- [Phase 72]: Three-mode Mi Camino layout: unified personalizada view (no tabs), archived tabs with renewal banner, and unchanged regular member view
- [Phase 72]: Context-aware /training page branches on hasActivePersonalizada/hasActiveSubscription; post-session flows unified to /mi-camino
- [Phase 73]: Inline MemberPlan interface in PlanesPage -- no shared type for single-use response shape
- [Phase 74]: Capacitor v8 requires Node >=22; used nvm to switch during cap sync/doctor
- [Phase 74]: minSdkVersion raised from 23 to 24 per Capacitor 8 requirements; versionName set to 1.0.0
- [Phase 74]: Production-only ProGuard via androidComponents API (staging unminified for readable stack traces)
- [Phase 74]: Cleartext traffic controlled via flavor manifest overlays (staging enables, production disables)
- [Phase 75]: Variant-scoped signing via applicationVariants.configureEach (not buildTypes.release conditional) to ensure only productionRelease gets signing
- [Phase 75]: Key alias hardcoded as 'upload' in build.gradle (not secret, not configurable) for simplicity
- [Phase 75]: Master branch guard as explicit shell check (not branch filter) so workflow_dispatch from non-master fails with clear error

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-03-21T23:14:54.791Z
Stopped at: Completed 75-02-PLAN.md
Resume file: None
