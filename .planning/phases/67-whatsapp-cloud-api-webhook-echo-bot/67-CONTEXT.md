# Phase 67: WhatsApp Cloud API Webhook + Echo Bot - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Standalone bot process that receives WhatsApp messages via Meta's Cloud API webhook, persists conversations and messages to MySQL, and echoes text messages back. AI processing, memory, admin UI, and human takeover logic are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Process architecture
- New `el-templo-bot/` app in the monorepo — separate Fastify process, own package.json
- Uses Fastify (consistent with el-templo-api) with Pino logging
- Shared DB schema and types via pnpm workspace package (single source of truth for Drizzle tables)
- Single PM2 ecosystem file at monorepo root managing both el-templo-api and el-templo-bot

### Webhook & message handling
- Text messages only in this phase — ignore all other types (media, reactions, location, stickers)
- GET /webhook for Meta verification, POST /webhook for incoming messages (same path, different methods)
- Dedup by WhatsApp message ID (wamid) — unique constraint on the messages table, skip if already seen
- Delivery status webhooks (sent, delivered, read): acknowledge with 200 but don't persist

### Database schema
- whatsapp_conversations: auto-increment PK, phone number as unique indexed column
- Nullable user_id FK to existing users table (populated when phone matches a member)
- Conversation statuses from the start: `active`, `human_takeover`, `closed`
- whatsapp_messages: stores parsed fields (body, type, wamid, timestamp, direction) plus a `raw_payload` JSON column with the full webhook payload

### Echo bot behavior
- Reply format: "Echo: {original message text}"
- No welcome message for first-time contacts — every message just echoes
- Non-text messages ignored silently (no reply, no storage)
- No rate limiting — WhatsApp handles throttling, echo bot is temporary

### Claude's Discretion
- Exact Fastify plugin structure for the bot
- Drizzle migration naming and ordering
- Error handling patterns (webhook error responses, DB failure handling)
- Shared package structure and naming
- PM2 restart/memory limit configuration

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches following existing el-templo patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 67-whatsapp-cloud-api-webhook-echo-bot*
*Context gathered: 2026-03-17*
