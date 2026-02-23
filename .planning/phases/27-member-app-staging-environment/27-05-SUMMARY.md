---
phase: 27-member-app-staging-environment
plan: 05
subsystem: infra
tags: [staging, dns, ssl, nginx, mysql, pm2, github-secrets]

requires:
  - phase: 27-01
    provides: "Nginx configs, seed script, reset script"
  - phase: 27-02
    provides: "Staging deploy workflow"
  - phase: 27-03
    provides: "Android staging APK build"
  - phase: 27-04
    provides: "iOS staging TestFlight build"
provides:
  - "Working staging environment at staging subdomains"
  - "Staging database populated with production SPOM data and fake users"
  - "SSL certificates for all 3 staging subdomains"
affects: []

tech-stack:
  added: []
  patterns: ["Production DB dump + fake user seed for staging data"]

key-files:
  created: []
  modified: []

key-decisions:
  - "SPOM data imported from production dump instead of CSV seed (CSVs not deployed to server)"
  - "SKIP_SPOM=true flag added to seed script for dump-based workflow"
  - "FK checks disabled during user/branch clearing to handle production dump references"
  - "Auto-increment reset after clearing to ensure branch IDs start at 1"
  - "Certbot run per-domain to avoid SSL cross-wiring between server blocks"

patterns-established:
  - "Staging seed workflow: mysqldump production SPOM tables → import to staging → SKIP_SPOM=true seed for fake users"

duration: 30min
completed: 2026-02-16
---

# Plan 27-05: Server/DNS Setup & E2E Verification Summary

**Staging environment live at 3 subdomains with SSL, production SPOM data, and 20 fake users**

## Performance

- **Duration:** 30 min (manual server setup + debugging)
- **Started:** 2026-02-16
- **Completed:** 2026-02-16
- **Tasks:** 2 (human action + human verification)
- **Files modified:** 0 (server-side setup only)

## Accomplishments

- DNS records configured for api-staging, app-staging, admin-staging subdomains
- MySQL staging database created with production SPOM data + fake users
- Nginx configs deployed with SSL via certbot
- PM2 running staging API as separate process on port 4001
- Both test users verified logging into member and admin apps
- Weekly cron reset configured for staging database

## Server Setup Completed

- 3 DNS A records → EC2 IP
- `/opt/el-templo-staging/{api,app,admin}` directories created
- `eltemplo_staging` MySQL database with grants
- 3 Nginx configs symlinked and SSL'd via certbot
- `eltemplo-staging-api` PM2 process running
- 16 GitHub Secrets configured with STAGING\_ prefix
- Weekly cron for staging reset installed

## Issues Encountered

- Migration 0006 referenced wrong column name (`level` → `exercise_level`) — fixed
- @faker-js/faker was devDependency, unavailable on server — moved to dependencies
- Seed script couldn't read CSVs on server — added SKIP_SPOM flag, used production dump
- FK constraints blocked user deletion — added SET FOREIGN_KEY_CHECKS = 0
- Auto-increment continued from old IDs after delete — added ALTER TABLE AUTO_INCREMENT = 1
- Nginx app root missing /spa suffix — fixed to match production pattern
- Certbot needed per-domain run to avoid SSL cross-wiring

## Deviations from Plan

- SPOM data seeded via production mysqldump instead of CSV-based seedSPOM()
- Multiple seed script fixes committed during setup (SKIP_SPOM, FK checks, auto-increment)

## Next Phase Readiness

- Staging environment fully operational
- Ready for feature testing and APK distribution

---

_Phase: 28-member-app-staging-environment_
_Completed: 2026-02-16_
