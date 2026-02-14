---
phase: 19-technical-debt-audit
plan: 04
subsystem: ci-cd
tags: [github-actions, ci-pipeline, deploy-pipeline, rollback, smoke-test, mysql-service-container]

# Dependency graph
requires:
  - phase: 19-03
    provides: API integration tests (33 tests via vitest run)
provides:
  - CI pipeline with lint gate (errors block), test gate (MySQL service container), and security audit
  - Deploy pipeline with pre-deploy backup, post-deploy smoke test, and auto-rollback
affects: [all-future-deploys, all-ci-runs]

# Tech tracking
tech-stack:
  added: []
  patterns: [mysql-service-container, pre-deploy-backup, auto-rollback-on-health-failure]

key-files:
  created: []
  modified:
    - .github/workflows/ci.yml
    - .github/workflows/deploy.yml

key-decisions:
  - "Security audit uses || true to not block on known unfixed CVEs -- advisory gate, not hard gate"
  - "Admin-check job added to CI for lint and build verification"
  - "API tests run in both CI (api-test job) and deploy (build-api job) for defense in depth"
  - "Node.js standardized to 22 across all CI jobs via env.NODE_VERSION"
  - "Backup uses cp -r (not symlinks) for complete independent copy before rsync --delete"
  - "Rollback restores all 3 apps atomically (API, App, Admin) plus pnpm install and PM2 restart"

patterns-established:
  - "MySQL 8.0 service container pattern for CI integration tests"
  - "Pre-deploy backup to .previous directory for instant rollback"
  - "Health check with HTTP code verification and automatic rollback on non-200"

# Metrics
duration: 3min
completed: 2026-02-14
---

# Phase 19 Plan 04: CI/CD Pipeline Hardening Summary

**CI lint/test/audit gates with MySQL service container, deploy backup/rollback with post-deploy smoke test**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-14T23:23:38Z
- **Completed:** 2026-02-14T23:26:50Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- CI pipeline now blocks on ESLint errors (removed continue-on-error), runs API integration tests against MySQL 8.0 service container, includes security audit checks, and verifies all 3 projects (API, App, Admin)
- Deploy pipeline backs up all 3 apps to .previous directories before rsync, runs API tests before creating deploy artifact, performs post-deploy health check, and auto-rolls back all apps on failure
- Node.js version standardized to 22 across all CI/deploy jobs
- Existing codebase passes all gates (0 lint errors, type checks clean)

## Task Commits

Each task was committed atomically:

1. **Task 1: Harden CI pipeline with test gate, lint gate, and audit check** - `bec8cb3` (feat)
2. **Task 2: Add deploy backup, smoke test, and auto-rollback** - `d1cb43b` (feat)
3. **Task 3: Fix any existing ESLint errors that would block CI** - No commit needed (0 existing errors)

## Files Created/Modified
- `.github/workflows/ci.yml` - Removed continue-on-error, added api-test job with MySQL service, added admin-check job, added security audit steps, standardized Node 22
- `.github/workflows/deploy.yml` - Added MySQL service + test step to build-api, added backup step before deploy, replaced soft health check with hard smoke test + auto-rollback

## Decisions Made
- **Security audit as advisory gate**: `pnpm audit --audit-level=high || true` logs CVEs without blocking. This prevents known transitive dependency CVEs from blocking all deploys while still providing visibility.
- **Defense in depth for tests**: API tests run in both CI (separate api-test job) and deploy (build-api job). CI catches issues on PRs; deploy ensures tests pass before artifact creation.
- **Atomic rollback**: All 3 apps (API, App, Admin) roll back together. A partial rollback could leave frontend/backend version mismatches.
- **Node 22 standardization**: CI was using Node 20 while deploy used Node 22. Standardized to 22 via env var to match the production server.
- **No ESLint fixes needed**: Both frontend apps have only warnings (no-unused-vars), which are intentionally allowed through per user decision. API has no ESLint config (uses tsc --noEmit type checking only).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CI gates are active and will enforce quality on next push to master/develop
- Deploy rollback capability means bad deploys are recoverable
- The ci.yml and deploy.yml can be extended with additional jobs (e.g., E2E tests) in future phases

## Self-Check: PASSED

- FOUND: .github/workflows/ci.yml (4469 bytes)
- FOUND: .github/workflows/deploy.yml (9891 bytes)
- FOUND: 19-04-SUMMARY.md (4687 bytes)
- FOUND: bec8cb3 (Task 1 commit)
- FOUND: d1cb43b (Task 2 commit)
- Task 3: No commit needed (verified 0 ESLint errors across all projects)

---
*Phase: 19-technical-debt-audit*
*Completed: 2026-02-14*
