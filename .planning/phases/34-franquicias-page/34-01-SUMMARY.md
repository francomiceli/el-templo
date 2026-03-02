---
phase: 34-franquicias-page
plan: 01
subsystem: api
tags: [fastify, drizzle, resend, email, franchise, mysql]

# Dependency graph
requires: []
provides:
  - POST /api/franchise/apply endpoint with validation
  - franchise_applications DB table (11 columns)
  - FranchiseService with DB persistence + Resend email notification
  - CORS for eltemplo.org and localhost:9200
affects: [37-franchise-management, 34-franquicias-page]

# Tech tracking
tech-stack:
  added: [resend]
  patterns:
    [public API route (no auth), Resend email notification with graceful skip]

key-files:
  created:
    - el-templo-api/src/db/schema/franchise-applications.ts
    - el-templo-api/src/modules/franchise/service.ts
    - el-templo-api/src/modules/franchise/routes.ts
    - el-templo-api/src/db/migrations/0018_franchise_applications.sql
    - el-templo-api/test/franchise/franchise-application.test.ts
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/app.ts
    - el-templo-api/.env.example
    - el-templo-api/package.json

key-decisions:
  - "Manual SQL migration (0018) instead of drizzle-kit generate due to interactive prompt conflicts"
  - "Email failure does not fail application submission -- graceful error logging only"
  - "CORS updated for both production (eltemplo.org) and dev (localhost:9200)"

patterns-established:
  - "Public API route pattern: no auth required, JSON Schema validation, Fastify plugin"
  - "Resend email integration: skip gracefully if RESEND_API_KEY not configured"

requirements-completed: [FRAN-07, FRAN-08, FRAN-09]

# Metrics
duration: 6min
completed: 2026-03-01
---

# Phase 34 Plan 01: Franchise Application API Summary

**POST /api/franchise/apply with Drizzle schema, JSON Schema validation, Resend email notification, and 12 integration tests**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-01T16:58:20Z
- **Completed:** 2026-03-01T17:04:39Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- franchise_applications table with 11 columns (nombre, email, telefono, ciudadPais, modelo, experiencia, capital, origen, mensaje, createdAt, status)
- POST /api/franchise/apply returns 201 + confirmation + WhatsApp link, validates all fields via JSON Schema enum constraints
- FranchiseService sends email notification via Resend (graceful skip if no API key)
- 12 integration tests covering happy path, DB persistence, validation errors, and duplicate submissions
- CORS updated for eltemplo.org (production) and localhost:9200 (dev)

## Task Commits

Each task was committed atomically:

1. **Task 1: Database schema + Resend dependency + franchise service + API route** - `6006a61` (feat)
2. **Task 2: Integration tests for franchise application endpoint** - `05b9ae0` (test)

## Files Created/Modified

- `el-templo-api/src/db/schema/franchise-applications.ts` - franchise_applications table schema (11 columns)
- `el-templo-api/src/modules/franchise/service.ts` - FranchiseService class with DB insert + Resend email
- `el-templo-api/src/modules/franchise/routes.ts` - POST /apply route with JSON Schema validation
- `el-templo-api/src/db/migrations/0018_franchise_applications.sql` - Migration SQL for franchise_applications table
- `el-templo-api/test/franchise/franchise-application.test.ts` - 12 integration tests
- `el-templo-api/src/db/schema/index.ts` - Added franchise-applications export
- `el-templo-api/src/app.ts` - Registered franchise routes + updated CORS origins
- `el-templo-api/.env.example` - Added RESEND_API_KEY and FRANCHISE_NOTIFICATION_EMAIL
- `el-templo-api/package.json` - Added resend dependency
- `el-templo-api/pnpm-lock.yaml` - Updated lockfile

## Decisions Made

- Used manual SQL migration file (0018_franchise_applications.sql) instead of drizzle-kit generate, because drizzle-kit had interactive prompts about unrelated schema columns that blocked non-interactive execution
- Email notification failure is logged but does not fail the application submission -- this ensures form submissions always succeed even if Resend is misconfigured
- CORS origins updated for both production (https://eltemplo.org) and development (http://localhost:9200) to allow the web landing page to call the franchise API

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- drizzle-kit generate prompted interactively about unrelated schema changes (journey_type column), making non-interactive migration generation impossible. Resolved by writing the SQL migration file manually, which is equivalent to what drizzle-kit would have generated for the franchise_applications table.

## User Setup Required

The following environment variables must be configured for email notifications to work:

| Variable                       | Source                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `RESEND_API_KEY`               | Resend Dashboard -> API Keys -> Create API Key                                     |
| `FRANCHISE_NOTIFICATION_EMAIL` | Email address for franchise application notifications (e.g., ignacio@eltemplo.org) |

Note: The API works without these variables -- applications are still persisted to the database, but email notifications are silently skipped.

## Next Phase Readiness

- API backend is complete and tested, ready for frontend form integration (Plan 34-02/03)
- Phase 38 (Franchise Application Management) can build on the franchise_applications table and status column

---

_Phase: 34-franquicias-page_
_Completed: 2026-03-01_
