---
phase: 28-member-app-staging-environment
plan: 02
subsystem: infra
tags: [github-actions, staging, ci-cd, pm2, rsync, deployment]

# Dependency graph
requires:
  - phase: 18-technical-debt-audit-domain-subdomain-deployment
    provides: Production deploy.yml pipeline structure, Nginx, PM2 setup
provides:
  - Staging deployment workflow (deploy-staging.yml) with full safety pipeline
  - CI triggers for staging branch (push and PR)
affects: [28-03, 28-04, 28-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "STAGING_ prefix convention for all staging-specific GitHub Secrets"
    - "Separate PM2 process names for staging (eltemplo-staging-api) vs production (eltemplo-api)"
    - "No change detection for staging deploys — always build and deploy all 3 apps"

key-files:
  created:
    - .github/workflows/deploy-staging.yml
  modified:
    - .github/workflows/ci.yml

key-decisions:
  - "No change detection for staging — always deploy all 3 apps to avoid stale mismatches"
  - "Same SSH/server credentials as production, staging distinguished by deploy paths and PM2 process name"
  - "VITE_APP_NAME set to 'El Templo (Staging)' for device coexistence"

patterns-established:
  - "STAGING_ secret prefix: all staging secrets follow STAGING_{ORIGINAL_NAME} convention"
  - "Full safety pipeline for staging: backup, rollback, smoke test (mirrors production)"

# Metrics
duration: 1min
completed: 2026-02-16
---

# Phase 28 Plan 02: Staging Deployment Workflow Summary

**GitHub Actions staging deploy pipeline mirroring production safety (backup/rollback/smoke test) with STAGING\_ prefixed secrets, separate PM2 process, and CI triggers for staging branch**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-16T15:03:50Z
- **Completed:** 2026-02-16T15:05:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created staging deployment workflow with full safety pipeline (backup, deploy, migrate, smoke test, rollback)
- All staging secrets use STAGING\_ prefix convention for clear separation from production
- CI pipeline now runs on staging branch pushes and PRs, providing quality gates before deployment
- Staging always deploys all 3 apps (no change detection) to avoid stale frontend/backend mismatches

## Task Commits

Each task was committed atomically:

1. **Task 1: Create staging deployment workflow** - `15f9948` (feat)
2. **Task 2: Add staging branch to CI triggers** - `46c9e66` (feat)

## Files Created/Modified

- `.github/workflows/deploy-staging.yml` - Complete staging deployment pipeline (build, deploy, migrate, smoke test, rollback)
- `.github/workflows/ci.yml` - Added staging to push and pull_request branch triggers

## Decisions Made

- No change detection for staging deploys — always builds and deploys all 3 apps to prevent stale mismatches between frontend and backend
- Same SSH credentials and server host as production; staging distinguished by STAGING\_ deploy paths and PM2 process name (eltemplo-staging-api)
- VITE_APP_NAME set to "El Templo (Staging)" for visual distinction and device coexistence with production app

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

GitHub Secrets must be configured before the staging workflow can run successfully. The following STAGING\_ prefixed secrets need to be added to the repository:

- `STAGING_VITE_API_URL` - e.g., https://api-staging.eltemplo.org/api
- `STAGING_VITE_SENTRY_DSN` - Separate Sentry project DSN for staging
- `STAGING_API_DEPLOY_PATH` - e.g., /opt/el-templo-staging/api
- `STAGING_APP_DEPLOY_PATH` - e.g., /opt/el-templo-staging/app
- `STAGING_ADMIN_DEPLOY_PATH` - e.g., /opt/el-templo-staging/admin
- `STAGING_API_PORT` - e.g., 4001
- `STAGING_DB_HOST`, `STAGING_DB_PORT`, `STAGING_DB_USER`, `STAGING_DB_PASSWORD`
- `STAGING_DB_NAME` - e.g., eltemplo_staging
- `STAGING_JWT_SECRET` - Separate JWT secret for staging
- `STAGING_FRONTEND_URL`, `STAGING_ADMIN_URL`
- `STAGING_SENTRY_DSN` - Backend Sentry DSN for staging
- `STAGING_SEED_PASSWORD` - Seed data password for staging environment

## Next Phase Readiness

- Workflow file ready; will trigger on push to staging branch once secrets are configured
- Plan 03 (staging server setup) and Plan 04 (GitHub Secrets configuration) build on this workflow

---

_Phase: 28-member-app-staging-environment_
_Completed: 2026-02-16_
