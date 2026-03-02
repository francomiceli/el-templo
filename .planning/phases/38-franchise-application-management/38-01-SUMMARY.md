---
phase: 38-franchise-application-management
plan: 01
subsystem: api
tags:
  [fastify, drizzle, anthropic, claude-api, franchise, admin, ai-agent, mysql]

# Dependency graph
requires:
  - phase: 34-franquicias-page
    provides: franchise_applications table, FranchiseService, POST /apply route
provides:
  - franchise admin CRUD endpoints (list, detail, update)
  - AI agent service for franchise conversion strategies
  - DB columns for notes and AI-generated content
affects: [38-02, 38-03, el-templo-admin]

# Tech tracking
tech-stack:
  added: ["@anthropic-ai/sdk"]
  patterns:
    ["AI agent service with brand-aware prompts", "superadmin-only route guard"]

key-files:
  created:
    - el-templo-api/src/db/migrations/0022_franchise_admin_columns.sql
    - el-templo-api/src/modules/franchise/ai-agent-service.ts
    - el-templo-api/test/franchise/franchise-admin.test.ts
  modified:
    - el-templo-api/src/db/schema/franchise-applications.ts
    - el-templo-api/src/modules/franchise/service.ts
    - el-templo-api/src/modules/franchise/routes.ts
    - el-templo-api/.env.example
    - el-templo-api/package.json

key-decisions:
  - "Label maps duplicated in ai-agent-service for module independence (consistent with blog/gladius slugify pattern)"
  - "SORTABLE_COLUMNS map for dynamic sort column resolution in listApplications"
  - "Combined status+search where clause with SQL template literal for AND composition"

patterns-established:
  - "Superadmin-only route guard: SUPERADMIN_ROLES array check on request.user.role"
  - "AI agent service: brand-aware system prompt + agent-specific extensions + applicant data user prompt"

requirements-completed: []

# Metrics
duration: 6min
completed: 2026-03-02
---

# Phase 38 Plan 01: API Backend Summary

**Franchise admin API with paginated list, detail, update, and Claude-powered AI agent service for 4 conversion strategy types**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-02T15:46:01Z
- **Completed:** 2026-03-02T15:52:43Z
- **Tasks:** 6
- **Files modified:** 9

## Accomplishments

- DB migration adding notes and 4 AI output columns to franchise_applications
- FranchiseService extended with listApplications (pagination, filters, search, sort), getApplication, updateApplication, saveAiOutput
- FranchiseAiAgentService calling Claude API with brand-aware prompts for strategy, outreach, followup, negotiation agents
- 4 admin routes (GET list, GET detail, PATCH update, POST generate) all superadmin-only
- Full integration test suite: 20 tests covering CRUD, auth/role guards, AI endpoint behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Add notes and AI output columns** - `799bf0f` (feat)
2. **Task 2: Extend FranchiseService with admin query methods** - `bc682ea` (feat)
3. **Task 3: Create AI Agent Service** - `36b95bb` (feat)
4. **Task 4: Add admin routes** - `cf3968a` (feat)
5. **Task 5: Update .env.example** - `eaf7ae3` (chore)
6. **Task 6: Write integration tests** - `17eaeff` (test)

## Files Created/Modified

- `el-templo-api/src/db/migrations/0022_franchise_admin_columns.sql` - Adds notes, ai_strategy, ai_outreach, ai_followup, ai_negotiation columns
- `el-templo-api/src/db/schema/franchise-applications.ts` - Drizzle schema updated with new columns
- `el-templo-api/src/modules/franchise/service.ts` - listApplications, getApplication, updateApplication, saveAiOutput methods
- `el-templo-api/src/modules/franchise/ai-agent-service.ts` - Claude API integration with 4 agent types and brand prompts
- `el-templo-api/src/modules/franchise/routes.ts` - 4 admin endpoints with superadmin guard
- `el-templo-api/.env.example` - ANTHROPIC_API_KEY documented
- `el-templo-api/package.json` - @anthropic-ai/sdk dependency added
- `el-templo-api/pnpm-lock.yaml` - Lock file updated
- `el-templo-api/test/franchise/franchise-admin.test.ts` - 20 integration tests

## Decisions Made

- Label maps (modelo, experiencia, capital, origen) duplicated in ai-agent-service for module independence, consistent with the blog/gladius slugify duplication pattern
- SORTABLE_COLUMNS map used for dynamic sort column resolution rather than string-to-column switch/case
- Where clause composition uses SQL template literal for AND when both status filter and search are active
- Anthropic SDK reads ANTHROPIC_API_KEY from env automatically (no explicit config needed)
- Test cleanup uses both Drizzle ORM delete and raw SQL LIKE for thorough cleanup of test data

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

- Set `ANTHROPIC_API_KEY` environment variable on server for AI generation to work
- Run migration `0022_franchise_admin_columns.sql` on production database

## Next Phase Readiness

- API backend complete for 38-02 (admin UI in el-templo-admin)
- All endpoints tested and documented
- 38-03 (deployment) will need ANTHROPIC_API_KEY added to server env

## Self-Check: PASSED

All 8 files verified present. All 6 task commits verified in git log.

---

_Phase: 38-franchise-application-management_
_Completed: 2026-03-02_
