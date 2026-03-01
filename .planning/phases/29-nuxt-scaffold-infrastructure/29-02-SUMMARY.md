---
phase: 29-nuxt-scaffold-infrastructure
plan: 02
subsystem: infra
tags: [github-actions, ci-cd, nginx, ssg, nuxt, deploy, rsync]

# Dependency graph
requires:
  - phase: 29-nuxt-scaffold-infrastructure/01
    provides: Nuxt 3 project scaffold with build tooling
provides:
  - CI pipeline web-check job (typecheck, lint, SSG build)
  - Production deploy pipeline for el-templo-web (build, backup, rsync, smoke test, rollback)
  - Staging deploy pipeline for el-templo-web (same with STAGING_ secrets)
  - Nginx SSG configs for eltemplo.org and web-staging.eltemplo.org
  - www.eltemplo.org 301-redirect to eltemplo.org
affects: [29-nuxt-scaffold-infrastructure/03, deploy, nginx, ci-cd]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      SSG deploy via rsync (no PM2),
      SSG Nginx try_files with pre-rendered HTML fallback,
    ]

key-files:
  created:
    - deploy/nginx/eltemplo.org
    - deploy/nginx/web-staging.eltemplo.org
    - deploy/nginx/www-redirect.eltemplo.org
  modified:
    - .github/workflows/ci.yml
    - .github/workflows/deploy.yml
    - .github/workflows/deploy-staging.yml

key-decisions:
  - "Reuse VITE_API_URL and VITE_SENTRY_DSN secrets as NUXT_PUBLIC_ env vars (no new secrets for shared values)"
  - "SSG try_files: $uri $uri/index.html $uri.html /index.html =404 (handles pre-rendered routes + fallback)"
  - "Web smoke test curls root URL for HTTP 200 (not /health endpoint since no Node server)"

patterns-established:
  - "SSG deploy pattern: nuxt generate -> artifact upload -> rsync static files -> no PM2 restart"
  - "SSG Nginx pattern: try_files with index.html fallback per directory, cache headers with webp/avif"

requirements-completed: [INFRA-03, INFRA-04, INFRA-05]

# Metrics
duration: 3min
completed: 2026-03-01
---

# Phase 29 Plan 02: CI/CD + Nginx Summary

**CI/CD pipelines extended with SSG build/deploy for el-templo-web, Nginx configs for root domain serving with www redirect**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-01T02:40:23Z
- **Completed:** 2026-03-01T02:43:55Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- CI pipeline validates el-templo-web on every push (typecheck, lint, nuxt generate)
- Production and staging deploy pipelines handle web build, backup, rsync, smoke test, and auto-rollback
- Nginx configs serve SSG static files with proper cache and security headers
- www.eltemplo.org 301-redirects to eltemplo.org

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend CI/CD workflows with el-templo-web jobs** - `da02b68` (feat)
2. **Task 2: Create Nginx configs for SSG serving** - `0b886c6` (feat)

## Files Created/Modified

- `.github/workflows/ci.yml` - Added web-check job (lint, audit, typecheck, nuxt generate)
- `.github/workflows/deploy.yml` - Added build-web, web artifact download/backup/deploy/smoke/rollback
- `.github/workflows/deploy-staging.yml` - Same web jobs with STAGING\_ prefixed secrets
- `deploy/nginx/eltemplo.org` - Production SSG Nginx config with cache + security headers
- `deploy/nginx/web-staging.eltemplo.org` - Staging SSG Nginx config
- `deploy/nginx/www-redirect.eltemplo.org` - www to root domain 301 redirect

## Decisions Made

- Reused existing VITE*API_URL and VITE_SENTRY_DSN secrets as NUXT_PUBLIC* env vars during build (avoids creating duplicate secrets for identical values)
- Web smoke test curls root URL for HTTP 200 instead of /health endpoint (SSG has no Node server)
- SSG try_files uses `$uri $uri/index.html $uri.html /index.html =404` to serve pre-rendered HTML per route with graceful fallback

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - GitHub secrets (WEB_DEPLOY_PATH, STAGING_WEB_DEPLOY_PATH) are documented in Plan 03 checkpoint.

## Next Phase Readiness

- CI/CD and Nginx configs ready for Plan 03 (server setup, DNS, SSL, secret configuration)
- GitHub secrets WEB_DEPLOY_PATH and STAGING_WEB_DEPLOY_PATH must be added before first deploy
- Nginx configs need to be symlinked and certbot-enabled on the EC2 server

---

_Phase: 29-nuxt-scaffold-infrastructure_
_Completed: 2026-03-01_
