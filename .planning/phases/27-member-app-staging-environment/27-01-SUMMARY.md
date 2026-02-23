---
phase: 27-member-app-staging-environment
plan: 01
subsystem: infra
tags: [nginx, staging, faker, seed, cron, mysql]

# Dependency graph
requires:
  - phase: 18-technical-debt-audit-domain-subdomain-deployment
    provides: Production Nginx configs and deploy pipeline patterns
provides:
  - Staging seed script with faker data and production safety check
  - 3 Nginx configs for staging subdomains (api/app/admin)
  - Weekly cron reset script for staging database
affects: [27-02, 27-03, 27-04, 27-05]

# Tech tracking
tech-stack:
  added: ["@faker-js/faker (devDependency)"]
  patterns:
    [
      "Production safety check pattern (refuse eltemplo DB name)",
      "Hardcoded staging DB name in reset script",
    ]

key-files:
  created:
    - el-templo-api/src/db/seed-staging.ts
    - deploy/nginx/api-staging.eltemplo.org
    - deploy/nginx/app-staging.eltemplo.org
    - deploy/nginx/admin-staging.eltemplo.org
    - deploy/staging/reset-staging.sh
  modified:
    - el-templo-api/package.json

key-decisions:
  - "Fixed faker seed (12345) for reproducible staging data across resets"
  - "Single password hash shared across all staging users for simplicity"
  - "DB_NAME hardcoded in reset script to prevent env var override accidents"

patterns-established:
  - "Production safety check: throw if DB_NAME === 'eltemplo' in staging scripts"
  - "Staging port convention: API on 4001 (prod on 3000)"
  - "Staging paths: /opt/el-templo-staging/{api,app,admin}"

# Metrics
duration: 2min
completed: 2026-02-16
---

# Phase 27 Plan 01: Staging Infrastructure Summary

**Staging seed script with faker-generated users, 3 Nginx subdomain configs, and weekly cron reset script with production safety checks**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-16T15:03:54Z
- **Completed:** 2026-02-16T15:06:23Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Staging seed script creates SPOM reference data + 5 branches + 2 known test users + 3 coaches + 15 fake members
- 3 Nginx configs ready for staging subdomains (api/app/admin-staging.eltemplo.org)
- Weekly reset script drops/recreates staging DB, runs migrations, re-seeds -- with hardcoded safety check

## Task Commits

Each task was committed atomically:

1. **Task 1: Create staging seed script and install faker** - `d9a299e` (feat)
2. **Task 2: Create Nginx staging configs and weekly reset script** - `b1db9c3` (feat)

## Files Created/Modified

- `el-templo-api/src/db/seed-staging.ts` - Staging seed script with faker data, 2 known test users, production safety check
- `el-templo-api/package.json` - Added @faker-js/faker as devDependency
- `deploy/nginx/api-staging.eltemplo.org` - Nginx reverse proxy for staging API (port 4001)
- `deploy/nginx/app-staging.eltemplo.org` - Nginx SPA config for staging member app
- `deploy/nginx/admin-staging.eltemplo.org` - Nginx SPA config for staging admin app
- `deploy/staging/reset-staging.sh` - Weekly cron script for staging database reset

## Decisions Made

- Fixed faker seed (12345) for reproducible staging data across resets
- Single password hash shared across all staging users for simplicity (hash once, insert many)
- DB_NAME hardcoded as "eltemplo_staging" in reset script to prevent env var override accidents
- Reset script passes DB_NAME to migration and seed commands via env

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required. Server-side file placement (Nginx configs, cron installation) handled in later plans.

## Next Phase Readiness

- Staging infrastructure configs ready for Plan 02 (staging deploy workflow)
- Nginx configs need certbot SSL and `chmod +x` on reset script on server
- Plans 02-05 can proceed with these configs as inputs

## Self-Check: PASSED

All 6 files verified present. Both task commits (d9a299e, b1db9c3) verified in git log.

---

_Phase: 28-member-app-staging-environment_
_Completed: 2026-02-16_
