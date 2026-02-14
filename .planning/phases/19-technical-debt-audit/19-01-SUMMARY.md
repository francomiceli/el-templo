---
phase: 19-technical-debt-audit
plan: 01
subsystem: infra
tags: [security, cve, env, gitignore, pnpm, axios, fastify, lint-staged]

# Dependency graph
requires:
  - phase: 18-technical-debt-audit-domain-subdomain-deployment
    provides: "Deploy pipeline and production infrastructure"
provides:
  - "Zero high/critical CVEs across all 3 projects"
  - ".env.example templates for all 3 projects"
  - "Comprehensive .env* gitignore patterns"
  - "Working pre-commit hook with lint-staged v15"
affects: [19-02, 19-03, 19-04, 19-05]

# Tech tracking
tech-stack:
  added: [lint-staged@15.5.2]
  patterns: [pnpm-overrides-for-transitive-cves, env-star-gitignore-pattern]

key-files:
  created: []
  modified:
    - el-templo-app/package.json
    - el-templo-admin/package.json
    - el-templo-api/package.json
    - el-templo-admin/.gitignore
    - el-templo-app/.gitignore
    - el-templo-api/.gitignore
    - el-templo-admin/.env.example
    - el-templo-app/.env.example
    - el-templo-api/.env.example
    - .husky/pre-commit
    - package.json

key-decisions:
  - "pnpm overrides for transitive @isaacs/brace-expansion CVE"
  - ".env* + !.env.example pattern for all .gitignore files"
  - "lint-staged downgraded to v15 for Node 20 CJS compatibility"
  - "Sentry DSN placeholders added to all .env.example templates"

patterns-established:
  - "pnpm overrides: use package.json pnpm.overrides for transitive dependency CVE fixes"
  - ".env pattern: .env* exclusion with !.env.example exception across all projects"

# Metrics
duration: 15min
completed: 2026-02-14
---

# Phase 19 Plan 01: Security & Env Cleanup Summary

**Resolved all high/critical CVEs (axios, fastify, qs, brace-expansion) and standardized .env handling with templates and gitignore patterns across the 3-app monorepo**

## Performance

- **Duration:** 15 min
- **Started:** 2026-02-14T22:54:52Z
- **Completed:** 2026-02-14T23:09:57Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- Zero high/critical CVEs across all 3 projects (el-templo-app, el-templo-admin, el-templo-api)
- All .env files removed from git tracking, comprehensive .env* gitignore patterns in place
- .env.example templates created for all 3 projects with documented variables and Sentry DSN placeholders
- Pre-commit hook fixed for ESM lint-staged compatibility with Node 20

## Task Commits

Each task was committed atomically:

1. **Task 1: Upgrade all CVE-affected packages** - `e515891` + `6141474` (fix) - CVE fixes already committed by prior plan execution
2. **Task 2: Clean up .env handling and create .env.example templates** - `da902f7` (chore) - .env cleanup committed by lint-staged auto-staging
3. **Pre-commit hook fix** - `eabf9e8` (fix) - Direct bin path for ESM compatibility

**Plan metadata:** (pending)

## Files Created/Modified
- `el-templo-app/package.json` - axios ^1.13.5, @capacitor/cli ^8.1.0, @quasar/app-vite ^2.4.1, pnpm overrides for brace-expansion
- `el-templo-admin/package.json` - axios ^1.13.5, @quasar/app-vite ^2.4.1
- `el-templo-api/package.json` - fastify ^5.7.4, drizzle-kit ^0.31.9
- `el-templo-admin/.gitignore` - .env* + !.env.example pattern
- `el-templo-app/.gitignore` - .env* + !.env.example pattern
- `el-templo-api/.gitignore` - .env* + !.env.example pattern
- `el-templo-admin/.env.example` - API URL + Sentry DSN template
- `el-templo-app/.env.example` - API URL + app name + Sentry DSN template
- `el-templo-api/.env.example` - DB, JWT, CORS, Sentry, server config template
- `.husky/pre-commit` - Fixed ESM lint-staged invocation
- `package.json` - lint-staged v15 (downgraded from v16 for Node 20)

## Decisions Made
- **pnpm overrides for brace-expansion:** @isaacs/brace-expansion >=5.0.1 override in el-templo-app to fix transitive CVE via @capacitor/cli > rimraf > glob > minimatch
- **.env* gitignore pattern:** All 3 projects use `.env*` + `!.env.example` instead of listing individual .env variants
- **lint-staged v15 over v16:** v16 requires Node >= 22, v15 works with Node 20 (current production version)
- **Sentry DSN in .env.example:** Commented-out placeholder for Phase 19 Sentry integration
- **deploy/.env.production.template kept tracked:** Template file with placeholder values, not real secrets

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-commit hook ESM/CJS incompatibility**
- **Found during:** Task 2 (commit attempt)
- **Issue:** lint-staged v15+ is ESM-only. pnpm wrapper script uses `exec node <path>` which invokes CJS loader, failing with MODULE_NOT_FOUND on ESM modules. Node 20's CJS loader resolves module type from the root package.json context (CJS) rather than lint-staged's own package.json (ESM).
- **Fix:** Use absolute path to lint-staged.js bin (executed via shebang #!/usr/bin/env node, which resolves type from the file's own package.json context). Downgraded lint-staged from v16 to v15 for better Node 20 compatibility.
- **Files modified:** .husky/pre-commit, package.json
- **Verification:** Direct execution of lint-staged.js returns version 15.5.2 and runs correctly
- **Committed in:** eabf9e8

**2. [Rule 1 - Bug] Added pnpm override for transitive brace-expansion CVE**
- **Found during:** Task 1 (audit verification)
- **Issue:** @capacitor/cli > rimraf > glob > minimatch > @isaacs/brace-expansion 5.0.0 has GHSA-7h2j-956f-4vf2 (Uncontrolled Resource Consumption). pnpm update of @capacitor/cli didn't resolve the transitive dependency.
- **Fix:** Added pnpm.overrides in el-templo-app/package.json: `"@isaacs/brace-expansion": ">=5.0.1"`
- **Files modified:** el-templo-app/package.json
- **Verification:** pnpm audit --audit-level=high returns 0 high/critical
- **Committed in:** 6141474

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
- **Prior plan executions already committed CVE fixes:** Commits from plans 19-02 and 19-06 had already applied the package updates and .env changes. This plan verified and confirmed the work rather than duplicating it.
- **lint-staged auto-staging during commit:** The lint-staged process auto-staged and committed .env cleanup changes as part of a different commit (da902f7). Changes are correct but attributed to a different commit message.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All CVEs resolved, builds verified, .env handling standardized
- Ready for plans 02+ (Sentry monitoring, test infrastructure, CI gates)
- Pre-commit hook functional for future development

## Self-Check: PASSED

- All 11 key files verified present on disk
- All 4 referenced commit hashes verified in git log
- SUMMARY.md exists at expected path

---
*Phase: 19-technical-debt-audit*
*Completed: 2026-02-14*
