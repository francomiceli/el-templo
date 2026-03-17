# Codebase Concerns

**Analysis Date:** 2026-03-17

---

## Tech Debt

### WhatsApp service and routes are stub-only scaffolding

- Issue: `el-templo-api/src/modules/whatsapp/service.ts` contains five methods that all `throw new Error("Not implemented")`. Routes are registered and authenticated in production, but every handler crashes immediately if called.
- Files: `el-templo-api/src/modules/whatsapp/service.ts`, `el-templo-api/src/modules/whatsapp/routes.ts`
- Impact: Any admin UI hit against `/api/admin/whatsapp/*` returns 500. The bot registration in `el-templo-api/src/app.ts` line 145 means these stubs are live in production.
- Fix approach: Implement each method in order of dependency (listConversations, getConversation, takeover/resumeBot, sendMessage).

### WhatsApp bot process is entirely unimplemented scaffolding

- Issue: Every file under `el-templo-bot/src/` is a stub with only type definitions or `export {}`. The bot entry point (`el-templo-bot/src/index.ts`) uses `console.log` and no startup logic. No webhook, no AI call, no Redis integration, no scheduler — nothing runs.
- Files: `el-templo-bot/src/index.ts`, `el-templo-bot/src/redis.ts`, `el-templo-bot/src/db.ts`, `el-templo-bot/src/whatsapp/client.ts`, `el-templo-bot/src/ai/openai.ts`, `el-templo-bot/src/ai/anthropic.ts`, `el-templo-bot/src/memory/session.ts`, `el-templo-bot/src/memory/profile.ts`, `el-templo-bot/src/state/machine.ts`, `el-templo-bot/src/schedulers/class-reminder.ts`, `el-templo-bot/src/schedulers/trial-followup.ts`
- Impact: The bot process does not start or function at all. All phases listed in the developer handoff are pending.
- Fix approach: Implement in phase order per `contexto/whatsapp-bot-developer-handoff.md`.

### `ADMIN_ROLES` constant duplicated across 13+ route files

- Issue: `const ADMIN_ROLES = ["coach", "admin", "superadmin"]` is redefined identically in every admin route module. Some modules use `["admin", "superadmin"]` (blog, gladius, academy, app-landing) while others use `["coach", "admin", "superadmin"]`, with no single authoritative definition.
- Files: Every file matching `el-templo-api/src/modules/*/routes.ts` — confirmed in 13 files.
- Impact: A future role change requires modifying every file individually. The inconsistency between modules (some exclude coaches, some include them) is not documented and risks incorrect access control.
- Fix approach: Extract to `el-templo-api/src/modules/shared/roles.ts`, export named constants (`COACH_ADMIN_ROLES`, `ADMIN_ONLY_ROLES`, `SUPERADMIN_ONLY_ROLES`), import in all route files.

### `booking-service.ts` reserve() has no database transaction

- Issue: The `reserve()` method in `el-templo-api/src/modules/scheduling/booking-service.ts` performs 10 sequential validation reads followed by a conditional delete + insert, all outside a transaction. Two concurrent requests for the same slot on the same day can both pass capacity checks and both insert.
- Files: `el-templo-api/src/modules/scheduling/booking-service.ts` lines 46–226
- Impact: Race condition can create bookings beyond capacity. Most at-risk at class opening time when multiple members book simultaneously.
- Fix approach: Wrap the delete + insert (steps 9–10) inside a `this.db.transaction(async (tx) => { ... })` block. The capacity check inside the transaction should use `SELECT ... FOR UPDATE` via raw SQL or Drizzle's `.for("update")` clause.

### `journeys/routes.ts` inlines admin role check per-route instead of using a hook

- Issue: Three admin routes in `el-templo-api/src/modules/journeys/routes.ts` (lines 355, 398, 507) each repeat the role check inline with `if (!ADMIN_ROLES.includes(...))` rather than using the `onRequest` hook pattern used by every other admin module.
- Files: `el-templo-api/src/modules/journeys/routes.ts`
- Impact: If a new route is added to this file without the inline check, it silently has no role guard. The DRY violation makes auditing authorization harder.
- Fix approach: Add an `onRequest` hook scoped to the admin section of the routes plugin (or split into a separate admin plugin), consistent with the pattern in `members/routes.ts`, `scheduling/routes.ts`, etc.

### `holiday-service.ts` inlines booking cancellation SQL instead of delegating to BookingService

- Issue: `el-templo-api/src/modules/scheduling/holiday-service.ts` line 59 has a comment: `// TODO: Consider injecting BookingService for clean dependency once booking cancellation logic grows`. It currently runs a raw `UPDATE bookings SET status='cancelado'` that bypasses BookingService's cancellation rules (waitlist auto-promotion, cancellation window checks, etc.).
- Files: `el-templo-api/src/modules/scheduling/holiday-service.ts` lines 55–75
- Impact: Adding a holiday silently cancels bookings without promoting waitlisted members. This is a silent data integrity gap today that worsens if cancellation rules become more complex.
- Fix approach: Inject `BookingService` into `HolidayService` and call `bookingService.cancelForHoliday()` (or equivalent) so waitlist promotion fires correctly.

---

## Security Considerations

### WhatsApp webhook endpoint has no HMAC signature verification (not yet built)

- Risk: Without verification, anyone who discovers the webhook URL can inject fake messages into the system, impersonate users, or trigger AI actions on their behalf.
- Files: `el-templo-bot/src/whatsapp/client.ts` (stub), `el-templo-bot/src/index.ts`
- Current mitigation: None — the feature is unbuilt.
- Recommendations: When implementing the webhook handler, verify `X-Hub-Signature-256` using `WHATSAPP_APP_SECRET` (HMAC-SHA256 of raw request body) before parsing or acting on any payload. Reject with 403 on mismatch. The reference bot does this correctly (`contexto/whatsapp-agent-renovafacil/webhook_whatsapp.py` lines 103–108). The `WHATSAPP_APP_SECRET` env var is currently missing from `el-templo-bot/.env.example` — add it.

### Admin `sendMessage` endpoint needs rate limiting and content validation

- Risk: `el-templo-api/src/modules/whatsapp/routes.ts` POST `/conversations/:id/send` will allow any coach/admin/superadmin to send arbitrary text to any phone number stored in the conversations table. No content validation, no rate limit on outbound messages, and the Cloud API account costs money per message.
- Files: `el-templo-api/src/modules/whatsapp/routes.ts` lines 101–121, `el-templo-api/src/modules/whatsapp/service.ts` `sendMessage` stub
- Current mitigation: Route is currently a stub (throws on call), so no actual sending happens.
- Recommendations: When implementing `sendMessage`, add: (1) content length limit in the Fastify JSON schema, (2) per-admin rate limit on outbound messages (e.g., 20/minute), (3) only allow sending to conversations in `human_takeover` or `active` state.

### Bot calls `el-templo-api` via localhost HTTP with no authentication

- Risk: The architecture (`contexto/whatsapp-bot-architecture.txt`) specifies the bot calls `el-templo-api` via `API_BASE_URL=http://localhost:3000` for actions like `book_class` and `register_trial`. These hit member-facing scheduling routes that require a JWT. The bot has no user context to supply a valid member JWT.
- Files: `el-templo-bot/.env.example` (`API_BASE_URL`), `el-templo-bot/src/ai/tools.ts` (book_class, register_trial tool stubs)
- Current mitigation: Tools are unimplemented stubs.
- Recommendations: Before implementing action tools, decide on an inter-service auth pattern. Options: (a) a shared `BOT_API_SECRET` header checked in relevant API routes (simplest), (b) a service-account JWT signed with `JWT_SECRET` that grants bot-specific permissions, (c) the bot directly writes to the DB for actions it owns (avoids the call but duplicates business logic). Document the chosen pattern in `el-templo-bot/CLAUDE.md`.

### Phone number in `users` table is not indexed, non-unique, and nullable

- Risk: The bot's state machine (`el-templo-bot/src/state/machine.ts`) plans to look up members by phone to determine `ACTIVE_MEMBER` vs `LAPSED` state. Without an index, every lookup is a full table scan. Without uniqueness, multiple users could share a phone number, causing ambiguous state determination.
- Files: `el-templo-api/src/db/schema/users.ts` line 49, `el-templo-bot/src/state/machine.ts`
- Current mitigation: Phone lookups do not exist yet (bot not implemented).
- Recommendations: Add a migration that creates an index on `users.phone` before bot lookups are implemented. Consider a unique constraint (MySQL allows multiple NULLs in a unique index). Phone format normalization (e.g., strip `+54`, leading zeros) must be consistent between how members register and how WhatsApp sends the phone in webhook payloads (WhatsApp sends country code without `+`, e.g. `5491155551234`).

---

## Performance Bottlenecks

### `analytics/service.ts` fires multiple full-scan queries in parallel

- Problem: `getKpis()` fires 4 parallel queries that each scan `payments` and `attendance` tables without date-range indexes.
- Files: `el-templo-api/src/modules/analytics/service.ts` lines 42–65
- Cause: No composite indexes on `(branchId, paymentDate)` or `(branchId, checkedInAt)`.
- Improvement path: Add composite indexes via a Drizzle migration. Consider caching analytics results in Redis with a short TTL (5 minutes) once the bot's Redis instance is available.

### No message deduplication designed for bot webhook

- Problem: Meta's webhook delivery has at-least-once semantics — duplicate payloads are common. The reference bot (`contexto/whatsapp-agent-renovafacil/webhook_whatsapp.py` lines 157–163) deduplicates via `msg_seen:{wamid}` in Redis with 24h TTL. The El Templo bot stubs have no dedup logic.
- Files: `el-templo-bot/src/whatsapp/types.ts`, `el-templo-bot/src/whatsapp/client.ts` (stub)
- Improvement path: When implementing the webhook handler, check `redis.get("wa:dedup:{whatsappMessageId}")` before processing. Set with 24h TTL after first seen. The `whatsappMessages` table also has an index on `whatsappMessageId` for DB-level dedup fallback.

---

## Fragile Areas

### Drizzle schema shared between `el-templo-api` and `el-templo-bot` via relative import

- Files: `el-templo-bot/src/db.ts`, `el-templo-bot/tsconfig.json`
- Why fragile: `db.ts` comments state `import * as schema from "../../el-templo-api/src/db/schema"` — a cross-package relative import with no workspace management. If `el-templo-api` moves or renames schema files, the bot silently breaks at compile time.
- Safe modification: When implementing, use a `tsconfig.json` path alias pointing to `../el-templo-api/src/db/schema` and document it, OR extract shared schema into a `packages/db` workspace package. Path alias is lower effort. Add the alias before any schema imports are written.
- Test coverage: No test currently imports from the bot, so no test will catch a broken schema import.

### WhatsApp `sendMessage` has an unresolved architectural decision

- Files: `el-templo-api/src/modules/whatsapp/service.ts` lines 74–88
- Why fragile: Comment says "bot process handles this — API just writes to DB and the bot picks it up, OR API calls bot via localhost HTTP." The two options have fundamentally different consistency models. Option 1 (DB polling) means admin messages silently stall if the bot never polls. Option 2 (localhost HTTP) means the API has a hard dependency on the bot being up.
- Safe modification: Decide before implementing. Recommended: API writes to `whatsapp_messages` with `direction='outbound_human'` and calls the bot's `/send` endpoint over localhost. The bot is the single source of outbound Cloud API calls. If the bot is down, the API returns a 503 to the admin (better than silent failure).

### Redis is a new infrastructure dependency with no fallback designed

- Files: `el-templo-bot/src/redis.ts` (stub)
- Why fragile: Redis does not currently exist on the EC2 instance. The bot requires Redis for conversation context, customer memory, distributed locks, and bot state. If Redis is unavailable at startup or crashes, every message will fail.
- Safe modification: At minimum, detect Redis connection failure at startup and crash with a clear error (PM2 will restart). Do NOT silently fall back to in-memory state (see anti-patterns below). Implement a startup health check before serving webhook traffic.

### Session pipeline has 9 stages with complex interdependencies

- Files: `el-templo-api/src/modules/sessions/pipeline/` (9 files, ~2,000 lines), `el-templo-api/src/modules/sessions/fallback/`
- Why fragile: Algorithmic session generation is the core product differentiator. Any regression silently produces wrong workouts. There are validation scripts in `el-templo-api/src/modules/sessions/validation/` but these are one-off generators, not CI tests.
- Test coverage: Partial. Coverage of failure paths (empty exercise pool, missing format, fallback triggers) is unknown.

---

## Missing Critical Features

### No integration tests for WhatsApp module

- Problem: `el-templo-api/test/whatsapp/` directory does not exist. The developer handoff explicitly specifies tests should live there.
- Blocks: CI will not catch regressions in conversation management, takeover, or message sending.

### No webhook signature verification in bot scaffolding

- Problem: `el-templo-bot/src/whatsapp/client.ts` comment lists functions needed but does not mention HMAC verification. `WHATSAPP_APP_SECRET` env var is absent from `el-templo-bot/.env.example`.
- Blocks: Without HMAC verification, the webhook endpoint accepts spoofed requests from any source.

### No message debounce/coalescing in bot design

- Problem: Architecture doc and developer handoff do not mention debouncing. The reference bot uses a 40-second debounce window (Redis sorted set + background worker) to coalesce rapid multi-message sends before triggering an AI call. Without this, a user sending three quick messages triggers three separate AI calls and three responses.
- Blocks: Poor UX (bot responds to each fragment separately) and unnecessary AI API cost.

### No prompt injection mitigation planned

- Problem: The reference bot (`contexto/whatsapp-agent-renovafacil/webhook_whatsapp.py` lines 46–65) has `_sanitize_for_prompt()` that strips control characters, limits length, replaces brackets, and removes known injection patterns. The El Templo bot has no equivalent planned.
- Blocks: A malicious user could corrupt AI context via crafted messages, especially if user-supplied strings (contact name, session context) are interpolated into system messages.

---

## Test Coverage Gaps

### WhatsApp admin API has no tests

- What's not tested: All five service methods, all five routes, role guard enforcement, 404 on unknown conversation.
- Files: `el-templo-api/src/modules/whatsapp/service.ts`, `el-templo-api/src/modules/whatsapp/routes.ts`
- Risk: Any implementation bugs ship silently.
- Priority: High — write tests in parallel with implementation.

### Bot process has no tests at all

- What's not tested: Webhook parsing, AI tool execution, Redis memory ops, state machine transitions, scheduler eligibility logic.
- Files: `el-templo-bot/` has no `test/` directory.
- Risk: Every phase of bot implementation ships without a safety net.
- Priority: High — unit tests for AI provider adapters and state machine; integration tests in `el-templo-api/test/whatsapp/` for webhook + DB flows.

### `booking-service.ts` concurrency/race condition is untested

- What's not tested: Concurrent reserve requests exceeding capacity. Duplicate booking guard. Waitlist auto-promotion on cancel.
- Files: `el-templo-api/src/modules/scheduling/booking-service.ts`
- Risk: Double-bookings or waitlist stalls under concurrent load.
- Priority: Medium.

### Session pipeline fallback paths are untested

- What's not tested: `exercise-fallback.ts` and `format-fallback.ts` trigger conditions; what happens when a stage returns no results.
- Files: `el-templo-api/src/modules/sessions/fallback/exercise-fallback.ts`, `el-templo-api/src/modules/sessions/fallback/format-fallback.ts`
- Risk: Production session generation could silently produce malformed sessions when exercise pools are exhausted.
- Priority: Medium.

---

## Reference Bot Anti-Patterns (Do Not Replicate)

The following issues exist in `contexto/whatsapp-agent-renovafacil/` and must be explicitly avoided in the El Templo bot.

### God file: `app.py` exceeds 3,000 lines with 30+ imports

- The El Templo bot's developer handoff already addresses this with the modular `src/` structure. Strictly follow the proposed directory layout. Never grow `el-templo-bot/src/index.ts` past startup and wiring logic.

### Hardcoded business data in source code

- `contexto/whatsapp-agent-renovafacil/HARDCODE_ANALYSIS.md` documents that prices, shipping times, and product colors are hardcoded in `config.py`. For El Templo, the system prompt must be generated from live DB data (schedules from `schedules` table, pricing from `subscription_plans` table, branch addresses from `branches` table) rather than hardcoded strings. This keeps the bot current without redeployment.

### In-memory fallback for Redis creates split-brain risk

- `contexto/whatsapp-agent-renovafacil/redis_client.py` falls back to a Python dict when Redis is unavailable. This silently masks failures and causes state divergence in multi-worker deployments. The El Templo bot must fail fast on Redis unavailability rather than silently operating with ephemeral state.

### Debounce state in module-level dict leaks across requests

- `contexto/whatsapp-agent-renovafacil/message_processor.py` line 1086 uses a module-level `_debounce_timers` dict as a Redis fallback. In the El Templo bot, debounce (if implemented) must use only Redis — never in-process state.

---

*Concerns audit: 2026-03-17*
