# Architecture

**Analysis Date:** 2026-03-17

## Pattern Overview

**Overall:** Modular monolith (API) + Separate process (Bot) — all on one EC2 instance

**Key Characteristics:**
- API is a Fastify plugin-based server; all modules are registered as route plugins
- Each API module follows a strict 5-file pattern: `routes.ts`, `service.ts`, `types.ts`, `schemas.ts`, `index.ts`
- Services use constructor dependency injection (db + logger injected by routes layer)
- Frontend apps (admin, member) are Quasar + Vue 3 SPAs with Pinia stores and composable API clients
- Bot (`el-templo-bot`) is a separate Node.js process sharing the same MySQL database, with Redis for ephemeral state

---

## Processes (Runtime)

```
EC2 Instance (PM2-managed)
├── eltemplo-api   — Fastify, port 3000  — el-templo-api/
├── eltemplo-bot   — Node.js, port 3001  — el-templo-bot/
└── Redis          — localhost:6379
```

Both processes are declared in `el-templo-api/ecosystem.config.cjs` and managed by PM2 with auto-restart.

---

## Layers — API (`el-templo-api`)

**Entry Point:**
- Purpose: Load env, register Sentry, build app, start cron jobs
- Location: `el-templo-api/src/index.ts`
- Responsibilities: dotenv load → instrument (Sentry) → `buildApp()` → listen → start cron jobs

**App Assembly:**
- Purpose: Register plugins and route modules
- Location: `el-templo-api/src/app.ts`
- Responsibilities: CORS, plugin registration (db, r2, auth, spom, sessions, progression), route registration with URL prefixes

**Plugins Layer (`src/plugins/`):**
- Purpose: Extend Fastify instance with decorated properties
- Location: `el-templo-api/src/plugins/`
- Contains: `database.ts` (decorates `fastify.db`), `auth.ts` (decorates `fastify.authenticate` + JWT), `r2.ts` (decorates `fastify.r2`), `spom.ts`, `sessions.ts`, `progression.ts`
- Pattern: All use `fastify-plugin` (`fp()`) so decorations are visible to sibling plugins

**Module Layer (`src/modules/<name>/`):**
- Purpose: Domain-specific HTTP handlers and business logic
- Location: `el-templo-api/src/modules/`
- Contains 20+ modules (see Module Inventory below)
- Module file structure: `routes.ts` → `service.ts` → `types.ts`, `schemas.ts`, `index.ts`
- Depends on: plugins layer (receives db + log via `fastify.db`, `fastify.log`)

**Database Layer (`src/db/`):**
- Purpose: Drizzle ORM schema, migrations, seed scripts
- Location: `el-templo-api/src/db/`
- Contains: `schema/` (one file per table), `migrations/` (SQL files), `index.ts` (re-exports), `config.ts`

**Jobs Layer (`src/jobs/`):**
- Purpose: Scheduled background tasks (node-cron)
- Location: `el-templo-api/src/jobs/`
- Contains: `mark-no-shows.ts` (22:00 daily, Argentina TZ), `auto-approve.ts`
- Receive `db` as parameter from `index.ts`, started after server is ready

**Shared Utilities (`src/modules/shared/`):**
- `error-handler.ts` — `handleServiceError(err, reply, log, context)` maps AppError subclasses to HTTP status codes
- `errors.ts` — `AppError`, `BadRequestError`, `NotFoundError`, `ConflictError` hierarchy
- `date-utils.ts`, `qr-token.ts`, `training-constants.ts`, `video-url.ts`

---

## Layers — Bot (`el-templo-bot`)

**Status:** Scaffold only — all core logic has TODO stubs. Entry point exists; implementations are empty.

**Entry Point:**
- Location: `el-templo-bot/src/index.ts`
- Planned startup sequence: env → db connect → Redis connect → Fastify webhook server → start schedulers

**AI Layer (`src/ai/`):**
- `provider.ts` — `AiProvider` interface with `chat(messages, tools)` method; factory function `createAiProvider()` reads `AI_PROVIDER` env
- `openai.ts` / `anthropic.ts` — implementations (stubbed)
- `tools.ts` — `BOT_TOOLS: ToolDefinition[]` array (fully defined), 6 tools: `check_schedule`, `book_class`, `check_membership`, `register_trial`, `get_location`, `request_human`

**WhatsApp Layer (`src/whatsapp/`):**
- `client.ts` — Cloud API send/verify functions (stubbed)
- `types.ts` — Meta webhook payload types

**Memory Layer (`src/memory/`):**
- `session.ts` — Session context (Redis, 6h TTL) — current conversation facts (stubbed)
- `profile.ts` — Customer profile (Redis, 90d TTL) — persistent across conversations (stubbed)

**State Layer (`src/state/`):**
- `machine.ts` — `ClientState` type (`"lead" | "trial" | "active_member" | "lapsed" | "returning"`); `determineClientState` and `updateClientState` (stubbed)

**Schedulers (`src/schedulers/`):**
- `class-reminder.ts` — sends WhatsApp reminders before booked classes (stubbed)
- `trial-followup.ts` — follows up after trial attendance (stubbed)

**Infrastructure:**
- `db.ts` — Drizzle connection; imports `el-templo-api/src/db/schema` directly via relative path
- `redis.ts` — ioredis singleton; key patterns: `wa:context:{phone}`, `wa:profile:{phone}`, `wa:lock:{scheduler}`, `wa:bot_state:{phone}` (stubbed)

---

## Layers — Admin App (`el-templo-admin`)

**Pattern:** Quasar SPA — `AdminLayout.vue` shell with child page routes

- `src/boot/` — Axios config, Sentry init, modules loader
- `src/router/routes.ts` — Route tree under `AdminLayout.vue`; role-gated via `meta.allowedRoles`
- `src/pages/` — One Vue SFC per page (AlumnosPage, HorariosPage, PagosPage, etc.)
- `src/composables/useXxxApi.ts` — API call composable per domain; exposes `loading`, `error`, named async methods, `cleanup()`
- `src/stores/useAuthStore.ts` — Pinia composition API store for auth state
- `src/stores/useAdminStore.ts` — Pinia store for admin-wide state

---

## Layers — Member App (`el-templo-app`)

**Pattern:** Quasar SPA + Capacitor (iOS/Android). Feature modules under `src/modules/`.

- `src/modules/training/` — Session player, week view, day player, timer
- `src/modules/journey/` — Member journey lifecycle
- `src/modules/progression/` — Stats, progression tracking
- `src/stores/useAuthStore.ts` — Pinia composition API auth store
- `src/composables/useTokenStorage.ts` — Token persistence (Capacitor Preferences on mobile, localStorage on web)
- `src/boot/axios.ts` — Axios instance wired to API base URL

---

## Module Inventory (API)

| Module | Prefix | Description |
|--------|--------|-------------|
| `auth` | `/api/auth` | Login, register, profile |
| `admin` | `/api/admin` | Session generation, editing (facade pattern via `edit-service.ts`) |
| `journeys` | `/api` | Member journey lifecycle |
| `members` | `/api/admin/members` | Member CRUD + notes |
| `subscriptions` | `/api/admin/subscriptions` + `/api/members/subscription` | Plan lifecycle |
| `payments` | `/api/admin/payments` | Record, void, balance, overdue |
| `attendance` | `/api/admin/attendance` + `/api/members/attendance` | QR check-in, history |
| `scheduling` | `/api/admin/scheduling` + `/api/members/scheduling` | Activities, schedules, bookings, holidays |
| `analytics` | `/api/admin/analytics` | KPI stats, financial analytics |
| `whatsapp` | `/api/admin/whatsapp` | Conversation management, human takeover |
| `sessions` | plugin-registered | Session generation pipeline (7-stage) |
| `spom` | plugin-registered | SPOM data access |
| `progression` | plugin-registered | Member stats, evaluation requests |
| `blog` | `/api/blog` | Blog CRUD + image upload |
| `franchise` | `/api/franchise` | Franchise application form |
| `gladius` | `/api/gladius` | Product catalog + inquiries |
| `academy` | `/api/academy` | Enrollment inquiry |
| `app-landing` | `/api/app` | Waitlist + Labs inquiry |
| `email` | Internal only | Nodemailer-based email service |
| `aura` | Internal only | Aura points transactions |
| `lifestyle` | Seed data only | Lifestyle content |

---

## Data Flow — Incoming WhatsApp Message (Planned)

1. Meta sends POST to `el-templo-bot` webhook endpoint
2. Bot parses Meta payload (`whatsapp/types.ts`)
3. Bot checks `wa:bot_state:{phone}` in Redis — if `human_takeover`, skip AI
4. Bot saves message to MySQL `whatsapp_messages` (direction: `inbound`)
5. Bot loads `wa:context:{phone}` (last N messages) and `wa:profile:{phone}` from Redis
6. Bot calls AI provider (`ai/provider.ts`) with system prompt + context + message + tools
7. If AI returns tool call: execute tool (read-only tools query DB directly; write tools call el-templo-api via localhost HTTP)
8. Bot saves response to MySQL `whatsapp_messages` (direction: `outbound_bot`)
9. Bot sends response via WhatsApp Cloud API (`whatsapp/client.ts`)
10. Bot updates Redis context and optionally updates client state in MySQL

---

## Data Flow — Admin Human Takeover

1. Admin clicks "Tomar control" in `el-templo-admin` → PUT `/api/admin/whatsapp/conversations/:id/takeover`
2. `WhatsAppService.takeover()` sets `whatsapp_conversations.status = 'human_takeover'` in MySQL
3. API also sets `wa:bot_state:{phone} = 'human_takeover'` in Redis (planned — currently API has no Redis access)
4. Bot reads Redis key before AI processing — skips AI while in takeover state
5. Admin sends messages via POST `/api/admin/whatsapp/conversations/:id/send`
6. `WhatsAppService.sendMessage()` saves to DB and calls WhatsApp Cloud API
7. Admin clicks "Devolver al bot" → PUT `/api/admin/whatsapp/conversations/:id/resume` → status back to `active`

---

## Data Flow — Standard API Request

1. HTTP request arrives at Fastify
2. Route plugin's `onRequest` hook: `fastify.authenticate(request, reply)` → JWT verify
3. Role check (ADMIN_ROLES array guard if admin route)
4. Route handler instantiates Service with `fastify.db` and `fastify.log`
5. Service executes Drizzle query against MySQL
6. Service throws `AppError` subclass on domain errors
7. Route handler catches: `handleServiceError(err, reply, request.log, context)`
8. `handleServiceError` maps `AppError` → HTTP status code; unknown errors → 500

---

## Key Abstractions

**Fastify Plugin Decoration:**
- `fastify.db` — `MySql2Database<typeof schema>` (from `plugins/database.ts`)
- `fastify.authenticate` — JWT verify middleware (from `plugins/auth.ts`)
- `fastify.r2` — R2 storage client (from `plugins/r2.ts`)

**Service Constructor Pattern:**
```typescript
export class SomeService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
    // optional cross-service deps:
    private otherService: OtherService,
  ) {}
}
```

**Error Hierarchy:**
- `AppError` (base, with `statusCode`)
- `BadRequestError` (400), `NotFoundError` (404), `ConflictError` (409)
- All caught by `handleServiceError()` in route handlers

**Facade Pattern (admin/sessions):**
- `el-templo-api/src/modules/admin/edit-service.ts` is the facade for session editing — delegates to `ExerciseSwapService`, `SessionMutationService`, `PrescribeService`

**AiProvider Interface (bot):**
```typescript
interface AiProvider {
  chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<AiResponse>;
}
```
Swap provider via `AI_PROVIDER=openai|anthropic` env var.

---

## Authentication

**JWT-based:**
- Sign/verify via `@fastify/jwt` in `el-templo-api/src/plugins/auth.ts`
- Payload: `{ userId: number; email: string; role: string }`
- Roles: `member`, `coach`, `admin`, `superadmin`
- Admin routes guard with `ADMIN_ROLES = ["coach", "admin", "superadmin"]`
- Member routes guard with `fastify.authenticate` only (role = `member`)

---

## Error Handling

**Strategy:** AppError hierarchy in service layer, caught in route handlers

**API Patterns:**
- Service throws: `throw new BadRequestError("message")` / `throw new NotFoundError("message")`
- Route handler: `catch (err: unknown) { handleServiceError(err, reply, request.log, "context") }`
- Unhandled errors → Sentry via `Sentry.setupFastifyErrorHandler(app)` in `el-templo-api/src/app.ts`

**Bot Patterns (planned):**
- `catch (err: unknown)` with `instanceof Error` checks per CLAUDE.md standard
- No `any` types

---

## Cron Jobs

All scheduled via `node-cron`:

**API:**
- `mark-no-shows` — `el-templo-api/src/jobs/mark-no-shows.ts` — 22:00 daily (Argentina TZ), bulk-updates `bookings` to `no_show`
- `auto-approve` — `el-templo-api/src/jobs/auto-approve.ts`

**Bot (planned):**
- `class-reminder` — `el-templo-bot/src/schedulers/class-reminder.ts` — every 30 min, Redis distributed lock, sends WhatsApp templates
- `trial-followup` — `el-templo-bot/src/schedulers/trial-followup.ts` — periodic, queries trial attendance, sends follow-up

---

## WhatsApp Admin Module (Current State)

The `el-templo-api/src/modules/whatsapp/` module is fully scaffolded:
- Schema: `el-templo-api/src/db/schema/whatsapp.ts` — `whatsapp_conversations` + `whatsapp_messages` tables with enums, indexes, relations
- Routes: `el-templo-api/src/modules/whatsapp/routes.ts` — 5 endpoints (list, detail, send, takeover, resume)
- Service: `el-templo-api/src/modules/whatsapp/service.ts` — method signatures defined
- Types: `el-templo-api/src/modules/whatsapp/types.ts`
- Schemas: `el-templo-api/src/modules/whatsapp/schemas.ts` — Fastify JSON validation

---

## Reference: RenovaFacil Bot Architecture (Python)

**Location:** `contexto/whatsapp-agent-renovafacil/` — production Python/Flask e-commerce bot

**Stack:** Flask + Gunicorn (2 workers), Redis, OpenAI GPT-4o mini, Railway deployment

**Architecture differences vs el-templo-bot:**
| Concern | RenovaFacil (Python) | El Templo Bot (TypeScript) |
|---------|---------------------|---------------------------|
| Framework | Flask + Gunicorn | Fastify (planned) |
| AI | OpenAI only | Model-agnostic interface |
| Database | Redis only (no SQL) | MySQL (shared) + Redis |
| State | Redis only (`client_state:{phone}`) | MySQL `whatsapp_conversations.clientState` + Redis |
| Deployment | Railway | EC2 + PM2 |

**Patterns worth studying in RenovaFacil:**

| Pattern | File | What to learn |
|---------|------|---------------|
| Two-layer memory | `contexto/whatsapp-agent-renovafacil/customer_memory.py` | `sesion_actual` + `perfil` Redis JSON structure, TTL strategy, background update every 5 messages |
| Message processing | `contexto/whatsapp-agent-renovafacil/message_processor.py` | AI call loop with tool dispatch, error handling |
| Client state machine | `contexto/whatsapp-agent-renovafacil/client_state.py` | Lua atomic transitions, state persistence with no TTL |
| Distributed lock scheduler | `contexto/whatsapp-agent-renovafacil/abandoned_carts.py` | Lock acquire → query → send → release pattern |
| Human handoff | `contexto/whatsapp-agent-renovafacil/human_handoff.py` | Context handoff, state flag check before AI |
| System prompt | `contexto/whatsapp-agent-renovafacil/config.py` | Business context in prompt, version tracking |
| WhatsApp client | `contexto/whatsapp-agent-renovafacil/whatsapp_client.py` | Graph API send, template params, media upload |
| Webhook handler | `contexto/whatsapp-agent-renovafacil/webhook_whatsapp.py` | Meta payload parsing, deduplication |

**Key RenovaFacil state machine (`client_state.py`):**
```python
class ClientState(str, Enum):
    NUEVO = "nuevo"
    INTERESADO = "interesado"
    LINK_ENVIADO = "link_enviado"
    PAGO_PENDIENTE = "pago_pendiente"
    PAGO_CONFIRMADO = "pago_confirmado"
    ENTREGADO = "entregado"
    RECURRENTE = "recurrente"
```
Uses Lua script for atomic Redis state transitions (safe for multi-worker). El Templo equivalent states: `lead | trial | active_member | lapsed | returning`.

**Key RenovaFacil memory pattern (`customer_memory.py`):**
```python
{
  "sesion_actual": {},  # Current conversation facts, updated every 5 msgs via AI extraction
  "perfil": {}          # Persistent across conversations, TTL 90 days
}
```
Redis key: `customer_profile:{phone}`, TTL 90 days. El Templo equivalent: `wa:profile:{phone}` (profile, 90d) + `wa:context:{phone}` (last N messages for AI window, 6h).

---

*Architecture analysis: 2026-03-17*
