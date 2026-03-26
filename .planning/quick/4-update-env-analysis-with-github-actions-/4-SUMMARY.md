---
phase: quick-4
plan: 01
subsystem: documentation
tags: [env-vars, github-actions, deployment, whatsapp-bot]
dependency-graph:
  requires: [quick-3]
  provides: [corrected-env-analysis]
  affects: [deploy.yml, deploy-staging.yml]
key-files:
  modified:
    - .planning/quick/3-analyze-env-setup-across-monorepo-and-do/ENV-ANALYSIS.md
decisions:
  - Production uses GitHub Actions + Secrets, not manual .env files on server
  - deploy/.env.production.template is obsolete
metrics:
  duration: 3 min
  completed: 2026-03-26
---

# Quick Task 4: Update ENV-ANALYSIS.md with GitHub Actions Details

Corrected production deployment documentation from manual .env files to GitHub Actions + Secrets mechanism, with full bot deployment requirements.

## What Changed

### ENV-ANALYSIS.md Corrections

1. **New Section 2 (Production Deployment: GitHub Actions + Secrets):** Added comprehensive explanation of how the deploy workflow generates .env.production files from GitHub Secrets, rsyncs them to the server, and manages the full deploy lifecycle.

2. **Section 3 (was Section 2):** Reframed "Separate .env per Package" as a local development strategy only, removing implications that it applies to production.

3. **Section 6 (WhatsApp Token - Where to Store):** Replaced server file path references with "Add as GitHub Secret WHATSAPP_TOKEN" instruction.

4. **Section 7 (Production Deployment: Bot Requirements):** Complete rewrite listing 13 new GitHub Secrets needed and 8 workflow changes (detect-changes filter, build-bot job, .env.production creation, rsync, deps install, restart, backup, rollback).

5. **Section 9 (Server Setup):** Clarified setup-ec2.sh is one-time provisioning only, not per-deploy.

6. **Action Items:** Rewritten to reflect GitHub Actions workflow. Removed obsolete items (manual .env creation, template updates). Added items for missing API secrets and bot workflow changes.

### Key Finding: Missing API Secrets

Discovered that the current deploy.yml "Create .env.production for API" step is missing 9 secrets the API needs (WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, REDIS_URL, BOT_API_KEY, RESEND_API_KEY, 4 notification emails, ANTHROPIC_API_KEY). Documented as HIGH priority action item.

## Commits

| Task | Name                   | Commit   | Files Modified  |
| ---- | ---------------------- | -------- | --------------- |
| 1    | Update ENV-ANALYSIS.md | 6621e263 | ENV-ANALYSIS.md |

## Deviations from Plan

None -- plan executed exactly as written.
