---
phase: 43-academy-landing-page-academy
plan: 01
subsystem: api
tags:
  [academy, inquiries, drizzle, migration, fastify, integration-tests, admin]

# Dependency graph
requires: []
provides:
  - "academy_inquiries database table"
  - "POST /api/academy/inquire endpoint with 10-field validation"
  - "GET /api/academy/admin/inquiries admin list endpoint"
  - "Email notification via Resend on new inquiry"
  - "AcademyInquiriesPage admin view"
affects: [43-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [academy-inquiries-schema, academy-service-facade, admin-list-page]

key-files:
  created:
    - el-templo-api/src/db/schema/academy-inquiries.ts
    - el-templo-api/src/db/migrations/0025_academy_inquiries.sql
    - el-templo-api/src/modules/academy/service.ts
    - el-templo-api/src/modules/academy/routes.ts
    - el-templo-api/test/academy/academy.test.ts
    - el-templo-admin/src/pages/AcademyInquiriesPage.vue
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/db/migrations/meta/_journal.json
    - el-templo-api/src/app.ts
    - el-templo-api/.env.example
    - el-templo-admin/src/layouts/AdminLayout.vue
    - el-templo-admin/src/router/routes.ts

key-decisions:
  - "Schema follows gladius-inquiries pattern (same column structure with domain-specific fields)"
  - "AcademyService cloned from GladiusService: submitInquiry, listInquiries, sendNotificationEmail"
  - "ACADEMY_NOTIFICATION_EMAIL env var defaults to ignaciobordon@eltemplo.org"
  - "Enum constraints on nivelInteres, modalidad, experiencia, alumnoElTemplo, origen"
  - "Admin restricted to admin/superadmin roles"

patterns-established:
  - "Academy inquiry pattern reusable for future program-specific forms"

# Metrics
duration: 20min
completed: 2026-03-03
---

# Phase 43 Plan 01: API Backend + DB Schema + Admin List View

**Built the complete API backend for academy inquiries: database schema, migration, service with email notification, validated routes, integration tests, and admin list page**

## Performance

- **Commit:** `76e4ae6`
- **Tasks:** 4
- **Files created:** 6
- **Files modified:** 6

## Accomplishments

- Drizzle schema for academy_inquiries with 13 columns (id, nombre, email, telefono, ciudadPais, nivelInteres, modalidad, experiencia, alumnoElTemplo, origen, mensaje, createdAt, status)
- SQL migration (0025) creating the table
- AcademyService with submitInquiry (DB insert + email), listInquiries (desc by date)
- POST /inquire with JSON schema validation and enum constraints
- GET /admin/inquiries with role-based access control
- 11 integration tests covering validation, persistence, admin access
- AcademyInquiriesPage admin view with QTable, formatted dates, label mapping

## API Endpoints Added

### Public

- `POST /api/academy/inquire` -- Submit enrollment inquiry (10 fields)

### Admin

- `GET /api/academy/admin/inquiries` -- List all inquiries (admin/superadmin only)

## Deviations from Plan

None.

---

_Phase: 43-academy-landing-page-academy_
_Completed: 2026-03-03_
