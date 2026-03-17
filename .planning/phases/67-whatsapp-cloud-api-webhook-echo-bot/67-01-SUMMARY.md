---
phase: 67-whatsapp-cloud-api-webhook-echo-bot
plan: 01
subsystem: api, database, infra
tags: [fastify, drizzle, whatsapp, meta-cloud-api, pino, mysql, webhook]

# Dependency graph
requires: []
provides:
  - Fastify bot server on port 3001 with health check
  - Drizzle ORM connection to shared MySQL via el-templo-api schema
  - WhatsApp Cloud API client (sendTextMessage, verifyWebhook, parseWebhookPayload)
  - Full Meta webhook payload TypeScript types
  - DB schema with unique wamid constraint and raw_payload column
  - Migration 0040 for whatsapp_messages dedup support
affects: [67-02-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cross-project schema import via relative path with rootDir adjustment"
    - "Module-level Pino logger per file (not Fastify request logger)"
    - "Native fetch for WhatsApp Graph API calls (Node 22+)"

key-files:
  created:
    - el-templo-api/src/db/migrations/0040_whatsapp_message_unique_raw.sql
  modified:
    - el-templo-api/src/db/schema/whatsapp.ts
    - el-templo-bot/src/index.ts
    - el-templo-bot/src/db.ts
    - el-templo-bot/src/whatsapp/types.ts
    - el-templo-bot/src/whatsapp/client.ts
    - el-templo-bot/.env.example
    - el-templo-bot/tsconfig.json

key-decisions:
  - "Adjusted tsconfig rootDir to '..' to allow cross-project schema imports without project references"
  - "Used native fetch instead of axios for WhatsApp API calls (Node 22 built-in)"
  - "Exported MySQL pool from db.ts for graceful shutdown in index.ts"

patterns-established:
  - "Bot files use module-level Pino logger instances, not Fastify request logger"
  - "Cross-project schema import: import * as schema from '../../el-templo-api/src/db/schema/index.js'"

requirements-completed: [HOOK-02, HOOK-03, HOOK-04]

# Metrics
duration: 4min
completed: 2026-03-17
---

# Phase 67 Plan 01: Bot Infrastructure Summary

**Fastify bot server on port 3001 with Drizzle DB connection, WhatsApp Cloud API client, and Meta webhook types**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-17T17:00:59Z
- **Completed:** 2026-03-17T17:05:09Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- WhatsApp messages schema updated with unique wamid constraint and raw_payload JSON column
- Migration 0040 created for additive ALTER TABLE changes
- Fastify server starts on port 3001 with Pino logging, DB decoration, and graceful shutdown
- Complete Meta webhook payload types (MetaWebhookPayload, ParsedInboundMessage, etc.)
- WhatsApp client exports verifyWebhook, sendTextMessage, parseWebhookPayload

## Task Commits

Each task was committed atomically:

1. **Task 1: DB schema update + migration for dedup and raw payload** - `386d4782` (feat)
2. **Task 2: Bot Fastify server, DB connection, WhatsApp client + types** - `3110318c` (feat)

## Files Created/Modified

- `el-templo-api/src/db/schema/whatsapp.ts` - Added .unique() on whatsappMessageId, added rawPayload column
- `el-templo-api/src/db/migrations/0040_whatsapp_message_unique_raw.sql` - Migration for unique constraint and raw_payload
- `el-templo-bot/src/index.ts` - Fastify server with DB decoration, health check, graceful shutdown
- `el-templo-bot/src/db.ts` - Drizzle ORM connection using shared el-templo-api schema
- `el-templo-bot/src/whatsapp/types.ts` - Full Meta webhook payload types and ParsedInboundMessage
- `el-templo-bot/src/whatsapp/client.ts` - verifyWebhook, sendTextMessage, parseWebhookPayload
- `el-templo-bot/.env.example` - Added WHATSAPP_BUSINESS_ACCOUNT_ID
- `el-templo-bot/tsconfig.json` - Adjusted rootDir for cross-project imports

## Decisions Made

- Adjusted bot tsconfig rootDir from `./src` to `..` to resolve cross-project imports of el-templo-api schema without needing TypeScript project references. Simpler approach that works well for this monorepo layout.
- Used Node.js native fetch for WhatsApp API calls instead of adding axios dependency (Node 22 has stable fetch).
- Exported the MySQL connection pool from db.ts so index.ts can close it during graceful shutdown.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed tsconfig rootDir for cross-project schema imports**

- **Found during:** Task 2 (Bot server implementation)
- **Issue:** Bot's tsconfig had rootDir=`./src` but imports schema from `../../el-templo-api/`, causing TS6059 errors
- **Fix:** Changed rootDir to `..` and added `../el-templo-api/src/db/schema/**/*` to include
- **Files modified:** el-templo-bot/tsconfig.json
- **Verification:** `tsc --noEmit` passes for both el-templo-bot and el-templo-api
- **Committed in:** 3110318c (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary fix for TypeScript compilation. No scope creep.

## Issues Encountered

None beyond the tsconfig adjustment documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Bot infrastructure is complete and ready for Plan 02 (webhook routes + echo logic)
- Fastify server running with DB access and WhatsApp client module
- Schema migration ready to apply to production database

## Self-Check: PASSED

All 9 files verified present. Both task commits (386d4782, 3110318c) confirmed in git log.

---

_Phase: 67-whatsapp-cloud-api-webhook-echo-bot_
_Completed: 2026-03-17_
