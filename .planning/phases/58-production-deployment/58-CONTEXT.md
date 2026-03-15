# Phase 58: Production Deployment - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Push all v4.0 work (phases 45-57) to production so all three environments (local, staging, production) run identical code. Includes committing in-progress booking/attendance unification, seeding production with operational data, and verifying the full deploy pipeline.

</domain>

<decisions>
## Implementation Decisions

### Uncommitted Work

- Booking/attendance unification work in working tree is COMPLETE — commit all modified files
- Commit untracked code: migration 0037 (booking_attendance_unification.sql), mark-no-shows.ts, qr-token.ts, format-params.test.ts
- DO NOT commit: seed-v4.ts, digital-initiatives/, .claude/agents/, run-phases.sh, el-templo-web/dist, el-templo-web/.data/
- Deleted AsistenciaHoyPage.vue is intentional (part of unification)

### Deploy Flow

- Staging first: commit → push staging → CI auto-deploys → manual verification → merge staging→master → CI auto-deploys production
- Do NOT push directly to master
- Rely on existing CI pipeline (change detection, parallel builds, smoke tests, auto-rollback)

### Production Seed Data

- 6 subscription plans matching real membership tiers:
  - Flex (2x/week, 1 month) — $80,000 regular / $65,000 zero
  - Flex+ (up to 6x/week, 1 month) — $100,000 regular / $80,000 zero
  - Foundation (2x/week, 4 months) — $250,000 regular / $220,000 zero
  - Foundation+ (up to 6x/week, 4 months) — $350,000 regular / $315,000 zero
  - Performance (up to 6x/week, 8 months) — $600,000 regular / $560,000 zero
  - Sesión de Prueba (trial, single session)
- 6 branches: alem, constitucion, jujuy, mogotes, moreno + Templo Online (virtual)
- 1 activity: Sesión Grupal
- Schedule slots per branch:
  - Mon-Fri: 7:00, 8:00, 9:00, 10:00, 17:00, 18:00, 19:00, 20:00
  - Saturday: ROM classes (special)
  - Capacity: 22 for moreno/constitucion/mogotes, 12 for alem/jujuy
- Staging already has this data configured — production seed must match

### Claude's Discretion

- Exact commit message wording for the WIP commit
- Whether to create a production-specific seed script or adapt existing staging seed
- How to handle Saturday ROM class scheduling details (slot count, times)
- Smoke test verification steps beyond CI's automated health checks

</decisions>

<specifics>
## Specific Ideas

- Seed data prices come from `.docs/admin-docs/datos-membresias-actuales-templo.txt`
- "Precio Zero" (discounted prices) apply only for boarding pass (first month) or conversion to long-term plan
- Post SP alias: eltemplomdp.sa / Renovaciones alias: eltemplo.mdp (payment transfer aliases, informational only)

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `deploy.yml` / `deploy-staging.yml`: Fully automated CI/CD with change detection, parallel builds, smoke tests, auto-rollback
- `ecosystem.config.cjs`: PM2 process management with auto-restart, memory limits, structured logging
- `deploy/update-server.sh`: Manual deploy script for quick updates
- Existing staging seed data: branches, plans, activities, schedules already configured on staging DB

### Established Patterns

- Push to branch triggers CI → build → test → rsync → migrate → restart → smoke test
- `dorny/paths-filter@v3` detects which projects changed (only rebuilds modified)
- Migration runner: `NODE_ENV=production node dist/db/run-migrations.js` (runs on every deploy)
- Backup to `.previous` before deploy, restore on failure

### Integration Points

- GitHub Actions workflows: `.github/workflows/deploy.yml` (production), `.github/workflows/deploy-staging.yml` (staging)
- PM2 process names: `eltemplo-api` (production), `eltemplo-staging-api` (staging)
- Environment variables: `STAGING_*` prefix for staging, direct names for production
- 38 migrations (0000-0037) — all running on staging, production is behind

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 58-production-deployment_
_Context gathered: 2026-03-14_
