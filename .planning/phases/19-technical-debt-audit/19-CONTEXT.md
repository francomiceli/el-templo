# Phase 19: Technical Debt Audit - Context

**Gathered:** 2026-02-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Audit and repair accumulated technical debt to make the 3-app ecosystem (member app, admin app, API) production-robust. Users should not see bugs or experience downtime due to bad code. Scope covers: security fixes, error monitoring, deploy safety, testing, code quality cleanup, and refactoring of the worst offenders. No new features.

Reference: `.docs/technical-debt/INVENTORY-REPORT.md` (updated 2026-02-14) — full debt inventory with 42 items.
Reference: `.docs/technical-debt/SPRINT-WORK-ITEMS.md` (updated 2026-02-14) — sprint-organized work items.
Reference: `.docs/be-staff.md` — staff engineering habits as audit lens.

</domain>

<decisions>
## Implementation Decisions

### Scope & Prioritization

- Full sprint 1-2 scope from audit: security, monitoring, CI gates, test infrastructure + API tests, pre-commit hooks, README, refactoring, console.log replacement, `any` type elimination
- Refactoring: split DayPlayer.vue (900 LOC) and edit-service.ts (1232 LOC) NOW, not deferred
- Replace all 279 console.log/warn/error statements with structured logger
- Fix all 45 `any` types in the API with proper types
- CI lint gate: block on ESLint ERRORS only (warnings allowed through)
- Pre-commit hooks: yes — Husky + lint-staged for ESLint --fix + Prettier on staged files
- Comprehensive root README.md: project overview, architecture, setup instructions, dev workflow, contribution guidelines
- Path aliases: Claude's discretion (not explicitly prioritized)

### Secrets & Environment

- Rotate all JWT secrets, database passwords, API keys in production
- Add .env\* to .gitignore, create .env.example templates
- NO git history rewrite (private repo, old secrets will be invalidated)

### Error Visibility

- Sentry for error tracking (free tier — 5,000 errors/month, sufficient for <100 users)
- Sentry + GitHub Issues integration: auto-create GitHub issues for new errors so Claude can read them via gh CLI
- Full error context: capture user ID, route, request body (minus passwords) in Sentry
- Frontend Sentry projects: Claude's discretion on whether to set up all 3 apps or API-only
- Logging: Claude's discretion on standardization approach (API uses Pino, frontend needs wrapper)
- No dedicated uptime monitoring — Sentry + PM2 sufficient at current scale

### Deploy Safety

- Automated rollback: CI keeps previous build, one command reverts to last working version
- Post-deploy smoke test: CI hits /health endpoint after deploy, auto-rollback on failure
- Deploy gates: build + tests must pass (lint warnings allowed)
- No staging environment — single server, tests + smoke test are protection enough
- Production incident runbook: document common scenarios (API down, DB connection lost, app not loading)

### Database Backups

- Automated daily backups: cron job at 3 AM Argentina time, mysqldump compressed
- Keep last 7 days on server for quick restore
- Archive older backups to AWS S3 cloud storage instead of deleting

### Testing Strategy

- Priority: API endpoint integration tests (auth, sessions, admin, member routes)
- Real test database (not mocks) — spin up test MySQL, seed data, run real queries
- Existing 12 validation scripts: keep as-is, don't convert to formal tests
- CI hard gate: tests must pass, no exceptions. Fix or delete bad tests.
- Vue store tests: Claude's discretion based on risk assessment
- E2E tests (Playwright): deferred to a later phase

### Claude's Discretion

- Path aliases (replace deep imports with @/\* aliases) — do if natural during refactoring
- Frontend Sentry setup — all 3 projects vs API-only, based on effort vs value
- Logging standardization approach — whatever makes Sentry integration most useful
- Vue store unit tests — include if time permits and risk warrants it
- Specific cloud storage provider for backup archives (decided: AWS S3)
- DayPlayer.vue split strategy (exact component boundaries)
- edit-service.ts split strategy (exact service boundaries)

</decisions>

<specifics>
## Specific Ideas

- User's primary concern: "I don't know much about handling multiple apps in production, and I want this audit to help me get a robust online ecosystem where users don't see bugs/have their app offline due to bad code"
- Sentry GitHub Issues integration specifically chosen so Claude can read error reports via `gh` CLI and help debug
- Database backups: user explicitly wants long-term archival (cloud storage) rather than deleting old backups
- User is a solo developer — solutions should be low-maintenance and automated where possible

</specifics>

<deferred>
## Deferred Ideas

- E2E tests with Playwright — separate phase when UI is more stable
- Staging environment — not needed at current scale
- API documentation with @fastify/swagger — useful but not production-critical
- Dead code elimination (ts-prune, depcheck) — backlog item
- Architecture Decision Records — backlog item
- Performance baselines and load testing — backlog item
- Visual regression testing — after UI stable
- Mutation testing — after base coverage > 80%

</deferred>

---

_Phase: 19-technical-debt-audit_
_Context gathered: 2026-02-14_
