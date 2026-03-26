---
phase: 84-push-notifications
plan: 01
subsystem: api, database
tags: [push-notifications, fcm, firebase, drizzle, mysql, notifications, cron]

# Dependency graph
requires:
  - phase: 79-behavioral-segmentation
    provides: memberSegmentEnum, segment column on member_profiles, SegmentationService
  - phase: 82-progressive-profiling-check-ins
    provides: check_in_responses table, Tu Dia check-in flow
  - phase: 83-micro-program-upsells
    provides: program enrollment and lifecycle events
provides:
  - 4 notification tables (device_tokens, notification_templates, notification_preferences, pending_notifications)
  - NotificationService with queue/send/preference/tracking/seeding methods
  - Notification types and 11 template seeds in Spanish
  - Ghost reattempt tracking columns on member_profiles
  - Migration SQL 0062_push_notifications.sql
affects: [84-02 (notification routes), 84-03 (cron jobs), 84-04 (admin UI), 84-05 (member app), 84-06 (Capacitor push), 84-07 (integration tests)]

# Tech tracking
tech-stack:
  added: [firebase-admin (pending user install)]
  patterns: [FcmMessaging interface for compile-time safety without dependency, dynamic import for firebase-admin, DRY_RUN env mode]

key-files:
  created:
    - el-templo-api/src/db/schema/notifications.ts
    - el-templo-api/src/modules/notifications/service.ts
    - el-templo-api/src/modules/notifications/types.ts
    - el-templo-api/src/modules/notifications/index.ts
    - el-templo-api/src/db/migrations/0062_push_notifications.sql
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/db/schema/member-profiles.ts
    - el-templo-api/.env.example

key-decisions:
  - "FcmMessaging interface for compile-time safety — service compiles without firebase-admin installed, uses dynamic import at runtime"
  - "Manual migration SQL instead of drizzle-kit generate — drizzle-kit had interactive prompts from other pending schema changes"
  - "Raw SQL for upsert operations (registerToken, updatePreference, seedTemplates) — drizzle lacks ON DUPLICATE KEY UPDATE builder"

patterns-established:
  - "Dynamic import pattern: firebase-admin loaded via await import() for optional dependency safety"
  - "DRY_RUN mode: env-controlled no-op mode for development and CI testing without FCM"
  - "Queue-based notification delivery: all notifications flow through pending_notifications table"

requirements-completed: [ENG-22]

# Metrics
duration: 5min
completed: 2026-03-26
---

# Phase 84 Plan 01: Notification Schema & Service Summary

**Push notification foundation with 4 DB tables, NotificationService queue/FCM delivery, DRY_RUN mode, and 11 Spanish notification templates**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-26T18:42:38Z
- **Completed:** 2026-03-26T18:48:12Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- 4 notification tables with proper enums, indexes, foreign keys, and relations
- NotificationService with full queue lifecycle: queue -> process -> send -> track -> purge
- 11 notification template seeds covering segment transitions, check-in reminders, programs, and weekly summary
- Ghost reattempt tracking columns on member_profiles for D-04 monthly re-engagement
- DRY_RUN mode for development/CI without firebase-admin dependency

## Task Commits

Each task was committed atomically:

1. **Task 1: Create notification database schema and types** - `f182fb02` (feat)
2. **Task 2: Create NotificationService with FCM integration** - `43c3231c` (feat)

## Files Created/Modified
- `el-templo-api/src/db/schema/notifications.ts` - 4 table definitions (device_tokens, notification_templates, notification_preferences, pending_notifications) with enums and relations
- `el-templo-api/src/modules/notifications/service.ts` - NotificationService class with 12 methods: initFirebase, registerToken, removeToken, getUserPreferences, updatePreference, queueNotification, queueAdHocNotification, processQueue, sendToDevice, recordOpened, purgeOldNotifications, seedTemplates
- `el-templo-api/src/modules/notifications/types.ts` - TypeScript types, SEGMENT_TRANSITION_TEMPLATES map, and TEMPLATE_SEEDS array with 11 Spanish notification templates
- `el-templo-api/src/modules/notifications/index.ts` - Barrel export for module
- `el-templo-api/src/db/migrations/0062_push_notifications.sql` - DDL for all 4 tables + ALTER for ghost reattempt columns
- `el-templo-api/src/db/schema/index.ts` - Added notifications barrel export
- `el-templo-api/src/db/schema/member-profiles.ts` - Added ghostReattemptCount and lastGhostReattemptAt columns
- `el-templo-api/.env.example` - Added FIREBASE_SERVICE_ACCOUNT_BASE64 and DRY_RUN vars

## Decisions Made
- Used FcmMessaging interface + dynamic import so service compiles without firebase-admin installed (user must approve dependency install separately per memory rule)
- Wrote migration SQL manually because drizzle-kit generate had interactive prompts from other pending schema changes in the worktree
- Used raw SQL for upsert operations (ON DUPLICATE KEY UPDATE) since drizzle ORM lacks a builder for this MySQL feature

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Manual migration SQL instead of drizzle-kit generate**
- **Found during:** Task 1 (schema creation)
- **Issue:** drizzle-kit generate launched interactive prompts for unrelated schema changes (personalizada_type column disambiguation), blocking non-interactive execution
- **Fix:** Wrote migration SQL manually matching the schema definitions exactly
- **Files modified:** el-templo-api/src/db/migrations/0062_push_notifications.sql
- **Verification:** SQL syntax validated, matches all 4 table schemas and ALTER statements
- **Committed in:** f182fb02 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Migration SQL is correct and equivalent to what drizzle-kit would generate. No scope creep.

## Issues Encountered
None beyond the drizzle-kit interactive prompt issue documented above.

## User Setup Required

Firebase setup is required before real push notifications can be sent. The service operates in DRY_RUN mode without it. Per plan user_setup section:
- Create Firebase project at console.firebase.google.com
- Register Android apps (com.eltemplo.app and com.eltemplo.app.staging)
- Download google-services.json for each app
- Generate Firebase service account key and base64 encode
- Set FIREBASE_SERVICE_ACCOUNT_BASE64 env var
- Install firebase-admin dependency: `pnpm add firebase-admin` (requires user approval)

## Next Phase Readiness
- Schema and service ready for Plan 02 (notification API routes)
- Plan 03 (cron jobs) can use NotificationService.processQueue() and seedTemplates()
- firebase-admin dependency must be installed before real FCM sends work

## Self-Check: PASSED

All 6 created files verified on disk. Both task commits (f182fb02, 43c3231c) verified in git log.

---
*Phase: 84-push-notifications*
*Completed: 2026-03-26*
