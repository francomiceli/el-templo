---
phase: 19-technical-debt-audit
plan: 09
subsystem: deploy
tags: [backup, restore, runbook, ops, sentry, s3]
dependency_graph:
  requires: [19-04]
  provides: [database-backup-automation, production-runbook, cloud-archival]
  affects: [deploy/backup.sh, deploy/restore.sh, deploy/RUNBOOK.md]
tech_stack:
  added: [aws-s3]
  patterns: [mysqldump-gzip-rotation, cron-scheduling, incident-runbook]
key_files:
  created:
    - deploy/backup.sh
    - deploy/restore.sh
    - deploy/RUNBOOK.md
  modified: []
key_decisions:
  - AWS S3 instead of Backblaze B2 for backup cloud storage (user already uses AWS)
  - Standard aws s3 cp without --endpoint-url (native S3, not S3-compatible)
  - SENTRY_DSN added to server .env.production only (SDK already installed in 19-02)
  - Cron job and secret rotation acknowledged by user, handled on server
metrics:
  duration: 4min
  completed: 2026-02-14
---

# Phase 19 Plan 09: Database Backup, Restore & Production Runbook Summary

Automated database backup with 7-day local retention and AWS S3 cloud archival, database restore script, and production incident runbook covering 10 common scenarios.

## What Was Done

### Task 1: Database backup and restore scripts (commit: 1389eda)

Created two shell scripts in `deploy/`:

**backup.sh** - Automated database backup:

- Compressed mysqldump with `--single-transaction --quick --lock-tables=false`
- 7-day local retention with automatic rotation via `find -mtime`
- Optional AWS S3 upload when aws CLI and credentials are configured
- Configurable via environment variables (DB_NAME, DB_USER, DB_PASSWORD, BACKUP_DIR, RETENTION_DAYS, BACKUP_BUCKET)
- Cron-ready: `0 6 * * *` (06:00 UTC = 03:00 Argentina time)

**restore.sh** - Database restore from backup:

- Accepts `.sql.gz` backup file path as argument
- 5-second safety countdown before destructive restore
- Decompresses and pipes directly to MySQL
- Lists available backups when called without arguments

### Task 2: Production incident runbook (commit: 721161b)

Created `deploy/RUNBOOK.md` with 10 sections:

1. Quick Reference (SSH, PM2, Nginx, MySQL, system commands)
2. API Down (502/503) - 5-step escalation
3. Database Connection Lost - 6-step diagnosis
4. App Not Loading (Frontend) - 5-step diagnosis
5. Failed Deploy - 3-step with auto-rollback reference
6. Database Corruption / Data Loss - 6-step with backup restore
7. SSL Certificate Expired - 4-step renewal
8. High Memory / CPU Usage - 5-step investigation
9. Secret Rotation Procedure (JWT, DB password, SSH key)
10. Backup Verification (monthly procedure, cron check)

Includes notes on backward-compatible migrations and Sentry error tracking.

### Task 3: External services setup (commit: 89e13f8)

Updated existing files per user decisions:

- **backup.sh**: Removed B2_ENDPOINT_URL check, now uses standard `aws s3 cp` without `--endpoint-url`
- **backup.sh**: Cloud upload check uses `AWS_ACCESS_KEY_ID` instead of `B2_ENDPOINT_URL`
- **RUNBOOK.md**: Section 6 Step 5 updated from "Backblaze B2" to "AWS S3", removed `--endpoint-url` from download commands

User actions completed externally:

- Sentry account created, DSN obtained (to be added to server .env.production)
- AWS S3 bucket `eltemplo-backups` designated for backup archival
- Cron job and secret rotation acknowledged, to be configured on server

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cloud storage provider changed from Backblaze B2 to AWS S3**

- **Found during:** Task 3 (user checkpoint response)
- **Issue:** Plan specified Backblaze B2 with S3-compatible endpoint, user prefers AWS S3 (already uses AWS for EC2)
- **Fix:** Removed `--endpoint-url` from aws s3 commands, changed condition from B2_ENDPOINT_URL to AWS_ACCESS_KEY_ID check, updated RUNBOOK.md references
- **Files modified:** deploy/backup.sh, deploy/RUNBOOK.md
- **Commit:** 89e13f8

## Verification

- [x] deploy/backup.sh exists and is executable
- [x] deploy/restore.sh exists and is executable
- [x] backup.sh contains mysqldump, RETENTION_DAYS, aws s3 cp
- [x] restore.sh contains gunzip mechanism
- [x] RUNBOOK.md contains all 10 incident sections
- [x] No Backblaze B2 / ENDPOINT_URL references remain in deploy/
- [x] .env.example files are clean (no B2 references existed)

## Self-Check: PASSED

- FOUND: deploy/backup.sh
- FOUND: deploy/restore.sh
- FOUND: deploy/RUNBOOK.md
- FOUND: .planning/phases/19-technical-debt-audit/19-09-SUMMARY.md
- FOUND: commit 1389eda (Task 1)
- FOUND: commit 721161b (Task 2)
- FOUND: commit 89e13f8 (Task 3)
