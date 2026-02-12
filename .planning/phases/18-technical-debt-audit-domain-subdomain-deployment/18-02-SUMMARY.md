---
phase: 18-technical-debt-audit-domain-subdomain-deployment
plan: 02
subsystem: infra
tags: [nginx, github-actions, ci-cd, deployment, subdomain, spa]

# Dependency graph
requires:
  - phase: 14-admin-app-session-review
    provides: "Admin app project (el-templo-admin) that needs deployment"
provides:
  - "3 Nginx server block configs for app/admin/api subdomains"
  - "Deploy pipeline builds admin app in parallel with API and member app"
  - "ADMIN_URL in .env.production for CORS"
  - "Node 22 in CI matching server"
affects: [18-03-server-setup-ssl-dns]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-subdomain Nginx config files in deploy/nginx/"
    - "Parallel build jobs in GitHub Actions"
    - "HTTP-only Nginx configs for certbot SSL injection"

key-files:
  created:
    - deploy/nginx/app.eltemplo.org
    - deploy/nginx/admin.eltemplo.org
    - deploy/nginx/api.eltemplo.org
  modified:
    - .github/workflows/deploy.yml

key-decisions:
  - "HTTP-only Nginx configs — certbot --nginx adds SSL directives automatically"
  - "Admin artifact uses dist/spa path for flat static files (no subdirectory nesting)"
  - "Node version bumped from 20 to 22 to match EC2 server"

patterns-established:
  - "Per-subdomain Nginx files: one server block per file in deploy/nginx/"
  - "3 parallel build jobs feeding single deploy job in CI"

# Metrics
duration: 2min
completed: 2026-02-12
---

# Phase 18 Plan 02: Nginx Configs & Deploy Pipeline Summary

**3 per-subdomain Nginx server blocks (app/admin/api) and GitHub Actions pipeline extended with parallel admin app build/deploy**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-12T16:14:41Z
- **Completed:** 2026-02-12T16:17:09Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created 3 Nginx server block configs: member SPA (hash mode + try_files), admin SPA (history mode + try_files), API reverse proxy to Fastify:3000
- Extended deploy.yml with build-admin job running in parallel with build-api and build-app
- Deploy job now downloads and rsyncs admin artifact to ADMIN_DEPLOY_PATH on EC2
- Added ADMIN_URL to .env.production for CORS, updated Node version from 20 to 22

## Task Commits

Each task was committed atomically:

1. **Task 1: Create per-subdomain Nginx configuration files** - `7c2bf36` (feat)
2. **Task 2: Extend deploy pipeline with admin app build and deploy** - `c02e0d1` (feat)

## Files Created/Modified
- `deploy/nginx/app.eltemplo.org` - Member SPA server block with try_files defense-in-depth
- `deploy/nginx/admin.eltemplo.org` - Admin SPA server block with history mode try_files (required)
- `deploy/nginx/api.eltemplo.org` - API reverse proxy to Fastify on port 3000
- `.github/workflows/deploy.yml` - Added build-admin job, admin deploy step, ADMIN_URL in env, Node 22

## Decisions Made
- HTTP-only Nginx configs (no SSL directives) — certbot's --nginx plugin adds SSL and redirects automatically during server setup (Plan 03). Including SSL would create chicken-and-egg problem.
- Admin artifact path uses `el-templo-admin/dist/spa` for flat static files — avoids nested `spa/` subdirectory on the server, cleaner rsync target matching Nginx root.
- Node version updated from 20 to 22 to match the EC2 server (setup-ec2.sh installs Node 22).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

GitHub secrets need to be configured before the pipeline runs (handled in Plan 03):
- `ADMIN_DEPLOY_PATH` - e.g., `/var/www/admin-app`
- `ADMIN_URL` - e.g., `https://admin.eltemplo.org`
- Update `VITE_API_URL` to new subdomain URL
- Update `FRONTEND_URL` to new subdomain URL

## Next Phase Readiness
- Nginx configs and deploy pipeline ready for Plan 03 (server setup, DNS, SSL, GitHub secrets)
- Plan 03 will deploy these Nginx configs to the server, run certbot for SSL, configure DNS, and set GitHub secrets

## Self-Check: PASSED

All files verified present, all commit hashes found in git log.

---
*Phase: 18-technical-debt-audit-domain-subdomain-deployment*
*Completed: 2026-02-12*
