---
phase: quick-3
plan: 01
subsystem: infra
tags: [env, dotenv, pm2, whatsapp, deployment, redis]

requires: []
provides:
  - "Complete env var audit across el-templo-api and el-templo-bot"
  - "Production deployment gap analysis"
  - "WhatsApp permanent token setup guide"
  - "Prioritized action items for production readiness"
affects: [deploy, production]

tech-stack:
  added: []
  patterns: ["separate .env per package with duplicated shared vars"]

key-files:
  created:
    - ".planning/quick/3-analyze-env-setup-across-monorepo-and-do/ENV-ANALYSIS.md"
  modified: []

key-decisions:
  - "Separate .env per package is the correct strategy for 2 backend processes on single EC2"
  - "deploy/.env.production.template is severely outdated and should be split into API + bot templates"
  - "deploy/update-server.sh needs bot build/restart steps added"

requirements-completed: [ENV-ANALYSIS]

duration: 2min
completed: 2026-03-25
---

# Quick Task 3: Env Setup Analysis Summary

**Full env var audit across monorepo with shared-var analysis, WhatsApp token guide, and production deployment gap identification**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-26T00:09:59Z
- **Completed:** 2026-03-26T00:11:36Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Audited all 35+ env vars across el-templo-api and el-templo-bot, identifying 8 shared variables that must stay in sync
- Documented WhatsApp permanent System User token setup (step-by-step) for production deployment
- Identified deploy/.env.production.template as severely outdated (missing 20+ vars)
- Identified deploy/update-server.sh as missing bot build/restart steps
- Produced prioritized action items for production readiness

## Task Commits

Each task was committed atomically:

1. **Task 1: Audit current env state and write analysis document** - `ac18d26d` (docs)

## Files Created/Modified

- `.planning/quick/3-analyze-env-setup-across-monorepo-and-do/ENV-ANALYSIS.md` - Complete 269-line analysis covering all 7 sections

## Decisions Made

- Separate .env per package confirmed as correct approach (vs root .env, PM2 env_production, or secrets manager)
- Shared vars (DB x5, REDIS_URL, WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, BOT_API_KEY) acceptable as duplicated across both .env files for 2-process setup
- deploy/.env.production.template should be split into two templates (API + bot) rather than one monolithic file

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The following TODOs from the analysis should be addressed before production deployment:

1. Update deploy/.env.production.template (split into API + bot templates)
2. Update deploy/update-server.sh to handle bot build/restart
3. Set up permanent WhatsApp System User token
4. Create .env files on EC2 for both API and bot
5. Update deploy/setup-ec2.sh with Redis install and bot instructions

---

_Quick Task: 3_
_Completed: 2026-03-25_
