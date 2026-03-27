---
phase: 77-github-actions-deployment
plan: 01
subsystem: infra
tags: [github-actions, ci-cd, pm2, deploy, rsync]

requires:
  - phase: 67-whatsapp-bot-foundation
    provides: el-templo-bot project structure and tsconfig with rootDir ".."
provides:
  - Bot build, deploy, restart steps in GitHub Actions pipeline
  - Correct PM2 script path for bot process
  - Complete API .env.production with WhatsApp, Redis, notification env vars
affects: [deploy, production, bot]

tech-stack:
  added: []
  patterns: [bot follows same CI/CD pattern as api/app/admin/web]

key-files:
  created: []
  modified:
    - .github/workflows/deploy.yml
    - el-templo-api/ecosystem.config.cjs

key-decisions:
  - "Bot .env.production uses same heredoc pattern as API (matching existing convention)"
  - "Bot rsync excludes node_modules (same as API, unlike static app/admin/web)"
  - "Rollback includes pm2 restart eltemplo-bot with || true for first-deploy safety"

patterns-established:
  - "Bot deploy follows identical pattern to API: detect, build, env, rsync, deps, restart, backup, rollback"

requirements-completed: [DEPLOY-01, DEPLOY-02, DEPLOY-03]

duration: 2min
completed: 2026-03-26
---

# Phase 77 Plan 01: Bot Deploy Pipeline Summary

**Bot added to GitHub Actions deploy.yml with full pipeline (detect, build, env, rsync, deps, PM2 restart, backup, rollback) and PM2 script path fixed**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-27T01:06:00Z
- **Completed:** 2026-03-27T01:08:41Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Bot integrated into full GitHub Actions deploy pipeline following existing api/app/admin/web patterns
- API .env.production expanded with 11 missing production env vars (WhatsApp, Redis, BOT_API_KEY, Resend, notification emails, Anthropic)
- PM2 ecosystem config fixed to use correct script path (dist/el-templo-bot/src/index.js) matching rootDir tsconfig output

## Task Commits

Each task was committed atomically:

1. **Task 1: Add bot to GitHub Actions deploy workflow** - `e646e835` (feat)
2. **Task 2: Fix PM2 ecosystem config script path** - `f26dddf4` (fix)

## Files Created/Modified

- `.github/workflows/deploy.yml` - Added bot to detect-changes, build-bot job, deploy job needs/conditions, bot .env.production, rsync, deps install, PM2 restart, backup, rollback; added missing API env vars
- `el-templo-api/ecosystem.config.cjs` - Fixed eltemplo-bot script path from dist/index.js to dist/el-templo-bot/src/index.js

## Decisions Made

- Bot .env.production uses same heredoc pattern as API step (no leading whitespace fix, matching existing convention)
- Bot rsync excludes node_modules (same as API pattern, since bot needs server-side pnpm install)
- Rollback step uses `pm2 restart eltemplo-bot --update-env || true` for safety on first deploy when process may not exist

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

GitHub Secrets must be configured before first bot deploy:

- `BOT_PORT` - Bot server port (default 3001)
- `BOT_DEPLOY_PATH` - Server path for bot deployment
- `WHATSAPP_TOKEN` - Meta WhatsApp Cloud API token
- `WHATSAPP_PHONE_ID` - WhatsApp Business phone number ID
- `WHATSAPP_VERIFY_TOKEN` - Webhook verification token
- `AI_PROVIDER` - AI provider name (openai or anthropic)
- `AI_MODEL` - AI model identifier
- `OPENAI_API_KEY` - OpenAI API key (if using OpenAI)
- `ANTHROPIC_API_KEY` - Anthropic API key (if using Anthropic)
- `BOT_API_KEY` - Shared API key between bot and API
- `API_BASE_URL` - API base URL for bot-to-API calls
- `REDIS_URL` - Redis connection URL
- `RESEND_API_KEY` - Resend email API key
- `FRANCHISE_NOTIFICATION_EMAIL` - Franchise notification email
- `GLADIUS_NOTIFICATION_EMAIL` - Gladius notification email
- `ACADEMY_NOTIFICATION_EMAIL` - Academy notification email
- `APP_NOTIFICATION_EMAIL` - App notification email

## Next Phase Readiness

- Bot deploy pipeline complete, ready for production deployment
- Secrets must be configured in GitHub repository settings before first deploy

---

_Phase: 77-github-actions-deployment_
_Completed: 2026-03-26_

## Self-Check: PASSED
