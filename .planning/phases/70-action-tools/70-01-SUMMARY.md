---
phase: 70-action-tools
plan: 01
subsystem: api, whatsapp
tags:
  [
    fastify,
    drizzle,
    whatsapp-cloud-api,
    interactive-buttons,
    service-to-service,
  ]

# Dependency graph
requires:
  - phase: 67-whatsapp-bot-scaffold
    provides: WhatsApp client (sendTextMessage, parseWebhookPayload), bot process structure
  - phase: 68-ai-conversation-engine
    provides: AI tool calling pipeline, message handler
  - phase: 69-redis-memory-layer-client-state-machine
    provides: Client state machine (member identification), Redis session context
provides:
  - Bot-internal API endpoints (POST /api/bot/scheduling/book-class, POST /api/bot/scheduling/register-trial)
  - BotSchedulingService for trial user creation and subscription setup
  - sendInteractiveMessage for WhatsApp confirmation buttons
  - Interactive reply parsing (button_reply, list_reply) with interactiveReplyId
  - InteractiveButton and InteractiveListRow types
affects: [70-02-action-tools, 71-proactive-schedulers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      bot-internal API key auth via x-bot-api-key header,
      service-to-service localhost HTTP,
    ]

key-files:
  created:
    - el-templo-api/src/modules/scheduling/bot-routes.ts
    - el-templo-api/src/modules/scheduling/bot-service.ts
  modified:
    - el-templo-api/src/app.ts
    - el-templo-api/src/modules/scheduling/index.ts
    - el-templo-bot/src/whatsapp/client.ts
    - el-templo-bot/src/whatsapp/types.ts
    - el-templo-api/.env.example
    - el-templo-bot/.env.example

key-decisions:
  - "[70-01] Placeholder email/password for bot-created trial users (DB requires notNull email+passwordHash)"
  - "[70-01] Bot routes registered before JWT-guarded routes in app.ts for independent API key auth"
  - "[70-01] Interactive replies set text to button title for seamless AI pipeline flow"
  - "[70-01] Trial subscription uses pricePaid: 0, priceTypeApplied: 'zero' for free trials"

patterns-established:
  - "Bot-internal API pattern: /api/bot/* prefix with x-bot-api-key header guard"
  - "Interactive reply normalization: button_reply.title becomes ParsedInboundMessage.text"

requirements-completed: [AI-07, AI-08]

# Metrics
duration: 3min
completed: 2026-03-19
---

# Phase 70 Plan 01: Action Tools API + Interactive Messages Summary

**Bot-internal booking/trial API endpoints with API key auth, plus WhatsApp interactive button send and reply parsing**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-19T00:48:33Z
- **Completed:** 2026-03-19T00:52:04Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Bot-internal API with POST /book-class (delegates to existing BookingService.reserve) and POST /register-trial (creates trial user + subscription)
- BotSchedulingService handles full trial registration flow: user creation with placeholder credentials, trial plan lookup, subscription creation, optional class booking
- sendInteractiveMessage sends WhatsApp button messages (max 3 buttons per Meta API limit, auto-truncates with warning)
- parseWebhookPayload now handles interactive button_reply and list_reply, normalizing them into ParsedInboundMessage with interactiveReplyId for tool routing

## Task Commits

Each task was committed atomically:

1. **Task 1: Bot-internal API endpoints for booking and trial registration** - `caf0fc41` (feat)
2. **Task 2: WhatsApp interactive button messages and reply parsing** - `f3eb5dc9` (feat)

## Files Created/Modified

- `el-templo-api/src/modules/scheduling/bot-routes.ts` - Bot-internal API routes with API key guard, book-class and register-trial endpoints
- `el-templo-api/src/modules/scheduling/bot-service.ts` - BotSchedulingService: trial user creation, subscription setup, booking delegation
- `el-templo-api/src/app.ts` - Registered bot scheduling routes at /api/bot/scheduling
- `el-templo-api/src/modules/scheduling/index.ts` - Exported new bot routes and service
- `el-templo-bot/src/whatsapp/types.ts` - Added InteractiveButton, InteractiveListRow, interactive field on MetaWebhookMessage, interactiveReplyId on ParsedInboundMessage
- `el-templo-bot/src/whatsapp/client.ts` - Added sendInteractiveMessage, updated parseWebhookPayload for interactive replies
- `el-templo-api/.env.example` - Added BOT_API_KEY
- `el-templo-bot/.env.example` - Added BOT_API_KEY

## Decisions Made

- **Placeholder credentials for bot-created users:** DB schema requires email (notNull unique) and passwordHash (notNull). Bot trial users get `bot_trial_{phone}@placeholder.eltemplo.org` email and `BOT_TRIAL_NO_LOGIN` password hash. These users authenticate via WhatsApp identity, not email/password login.
- **Bot routes before JWT routes:** Registered /api/bot/\* before admin/member routes in app.ts so bot API key auth is independent of JWT middleware.
- **Interactive reply normalization:** button_reply.title is set as `text` field so interactive replies flow through the same AI handler pipeline as regular text messages. The `interactiveReplyId` field allows tools to check exact button IDs.
- **Trial subscription pricing:** pricePaid: 0 with priceTypeApplied: 'zero' since trials are free.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added placeholder email and passwordHash for trial user creation**

- **Found during:** Task 1 (bot-service.ts)
- **Issue:** Plan specified INSERT with only firstName/phone/role/branchId/isActive, but users table requires email (notNull unique) and passwordHash (notNull)
- **Fix:** Generated placeholder email from phone number and static password hash marker
- **Files modified:** el-templo-api/src/modules/scheduling/bot-service.ts
- **Verification:** tsc --noEmit passes
- **Committed in:** caf0fc41

**2. [Rule 3 - Blocking] Added required subscription fields (branchId, pricePaid, priceTypeApplied)**

- **Found during:** Task 1 (bot-service.ts)
- **Issue:** Plan specified only userId/planId/status/startDate/endDate for subscription INSERT, but table requires branchId (notNull), pricePaid (notNull), priceTypeApplied (notNull)
- **Fix:** Added branchId from user record, pricePaid: 0, priceTypeApplied: 'zero' for free trial
- **Files modified:** el-templo-api/src/modules/scheduling/bot-service.ts
- **Verification:** tsc --noEmit passes
- **Committed in:** caf0fc41

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes required for DB schema compliance. No scope creep.

## Issues Encountered

None

## User Setup Required

None - BOT_API_KEY added to .env.example files, users must set matching values in both el-templo-api and el-templo-bot .env files.

## Next Phase Readiness

- Bot-internal API ready for plan 70-02 (book_class and register_trial AI tool definitions)
- Interactive button support ready for confirmation UX flow
- All type checking passes for both el-templo-api and el-templo-bot

---

_Phase: 70-action-tools_
_Completed: 2026-03-19_
