---
phase: 88-gender-based-notification-personalization
plan: 01
subsystem: database, api
tags: [drizzle, mysql, notifications, gender, enum, migration]

requires:
  - phase: 84-push-notifications
    provides: notification_templates table, TEMPLATE_SEEDS, NotificationService

provides:
  - "Gender enum with 'unspecified' fourth value for explicit non-specification"
  - "notification_templates table with titleFemale/bodyFemale nullable columns"
  - "All 11 TEMPLATE_SEEDS with female copy variants"
  - "Migration SQL 0066 for gender enum + template female columns"

affects: [88-02, 88-03, 88-04, notifications, members]

tech-stack:
  added: []
  patterns:
    - "Nullable female variant columns (titleFemale/bodyFemale) with fallback to default title/body"
    - "Unspecified vs null gender distinction: null = legacy never asked, unspecified = explicitly chose not to specify"

key-files:
  created:
    - el-templo-api/src/db/migrations/0066_gender_notification_templates.sql
  modified:
    - el-templo-api/src/db/schema/users.ts
    - el-templo-api/src/db/schema/notifications.ts
    - el-templo-api/src/modules/notifications/types.ts
    - el-templo-api/src/modules/notifications/service.ts
    - el-templo-api/src/modules/members/schemas.ts

key-decisions:
  - "Nullable titleFemale/bodyFemale columns avoid renaming existing title/body (no query migration needed)"
  - "Gender-neutral templates duplicate male copy into female fields for uniform D-10 compliance"
  - "null gender = legacy never asked, 'unspecified' = explicitly chose not to specify (D-05/D-06)"

patterns-established:
  - "Female variant columns as nullable fallback pattern: null means use default title/body"

requirements-completed: [D-05, D-06, D-10, D-11, D-16, D-17]

duration: 3min
completed: 2026-04-03
---

# Phase 88 Plan 01: Schema + Template Seeds Summary

**Added 'unspecified' gender enum value, titleFemale/bodyFemale columns to notification_templates, and female copy variants for all 11 TEMPLATE_SEEDS**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-03T20:03:46Z
- **Completed:** 2026-04-03T20:07:02Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Gender enum extended with 'unspecified' as fourth value across Drizzle schema and validation schemas
- notification_templates table schema extended with nullable titleFemale/bodyFemale columns
- All 11 TEMPLATE_SEEDS updated with female copy variants (gender-neutral templates use identical copy)
- Migration SQL 0066 created for production deployment
- seedTemplates() INSERT statement updated to persist female columns

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema changes -- gender enum + notification template female columns** - `e77768be` (feat)
2. **Task 2: Update TEMPLATE_SEEDS with female variants for all 11 templates** - `422f3121` (feat)

## Files Created/Modified
- `el-templo-api/src/db/schema/users.ts` - Added 'unspecified' to genderEnum
- `el-templo-api/src/db/schema/notifications.ts` - Added titleFemale/bodyFemale columns to notificationTemplates
- `el-templo-api/src/modules/members/schemas.ts` - Updated create/update gender enums with 'unspecified'
- `el-templo-api/src/modules/notifications/types.ts` - Extended TemplateSeed interface, added female copy to all 11 seeds
- `el-templo-api/src/modules/notifications/service.ts` - Updated seedTemplates() INSERT to include female columns
- `el-templo-api/src/db/migrations/0066_gender_notification_templates.sql` - Migration for gender enum + template columns

## Decisions Made
- Nullable titleFemale/bodyFemale columns avoid renaming existing title/body columns (no downstream query changes needed)
- Gender-neutral templates duplicate male copy into female fields for uniform service logic (always read from gender-specific field)
- null gender = legacy never asked, 'unspecified' = explicitly chose not to specify (D-05/D-06)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Schema and seed data ready for 88-02 (gender inference service) to build on
- Migration SQL ready to run on staging/production
- All downstream plans (88-02, 88-03, 88-04) can now reference titleFemale/bodyFemale columns

---
*Phase: 88-gender-based-notification-personalization*
*Completed: 2026-04-03*
