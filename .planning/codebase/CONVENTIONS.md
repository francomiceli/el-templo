# Coding Conventions

**Analysis Date:** 2026-03-17

**Scope:** Covers `el-templo-api/` (primary), `el-templo-bot/` (new bot under development), and `contexto/whatsapp-agent-renovafacil/` (Python reference bot -- patterns only).

---

## Naming Patterns

**Files (TypeScript -- API and Bot):**
- kebab-case for all source files: `attendance-service.ts`, `edit-service.ts`, `class-reminder.ts`
- Suffix by role: `service.ts`, `routes.ts`, `types.ts`, `schemas.ts`, `index.ts`
- Schema files match table names: `aura-balances.ts`, `completed-sessions.ts`

**Files (Python -- reference bot):**
- snake_case module names: `client_state.py`, `redis_client.py`, `human_handoff.py`
- Test files prefixed `test_`: `test_client_state.py`, `test_channel_flow.py`

**Classes:**
- PascalCase: `AttendanceService`, `AuraService`, `AdminEditService`, `InsufficientBalanceError`
- Service classes follow `<Domain>Service` pattern

**Functions:**
- camelCase for TypeScript: `createTestApp`, `getAuthToken`, `registerUser`, `handleServiceError`
- snake_case for Python: `get_client_state`, `set_client_state`, `transition_state`

**Variables:**
- camelCase in TypeScript: `adminToken`, `testBranchId`, `baseMemberDefaults`
- Uppercase constants: `ADMIN_ROLES`, `ADMIN_ATTENDANCE_URL`, `STATUS_LABELS`

**Types and Interfaces:**
- PascalCase: `AttendanceRecord`, `SessionFilter`, `ChatMessage`, `AiProvider`
- Union string types for status enums: `type AttendanceStatus = "registrado" | "confirmado"`
- No actual `enum` keyword -- use union types (TypeScript) or `str, Enum` class (Python reference)

---

## TypeScript Rules (Non-Negotiable)

**No `any` types.** Use `unknown` + type narrowing or explicit interfaces:
```typescript
// Correct
catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
}

// Correct -- AppError narrowing
if (err instanceof AppError) {
  reply.code(err.statusCode).send({ ... });
}
```

**Strict mode enabled** in `el-templo-bot/tsconfig.json`:
```json
{ "strict": true, "target": "ES2022", "module": "NodeNext" }
```

---

## Code Style

**Formatting:**
- Prettier (configured in monorepo root, `prettier` ^3.8.1 in API devDependencies)
- Pre-commit hook via Husky + lint-staged runs Prettier automatically
- If a commit fails due to lint-staged, fix and create a NEW commit (never amend)

**Linting:**
- ESLint (^9.39.2) configured in `el-templo-api/`
- Standard rules; no custom ESLint config discovered

---

## Import Organization

**TypeScript -- API modules follow this order:**
```typescript
// 1. Framework/third-party
import { FastifyPluginAsync } from "fastify";
import { eq, and, desc } from "drizzle-orm";

// 2. Internal modules (relative)
import { AttendanceService } from "./service";
import { handleServiceError } from "../shared/error-handler";
import { memberCheckInSchema } from "./schemas";

// 3. Types (type-only imports)
import type { AttendanceRecord } from "./types";
import type { FastifyBaseLogger } from "fastify";
```

**Module barrel pattern:** `index.ts` re-exports named exports for each module:
```typescript
// el-templo-api/src/modules/admin/index.ts
export { adminRoutes } from "./routes";
export { AdminSessionService } from "./service";
export type { SessionStatus, EditAction } from "./types";
```

---

## Error Handling

**Service layer:** Throw typed error subclasses from `el-templo-api/src/modules/shared/errors.ts`:
```typescript
export class AppError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Solicitud invalida") { super(message, 400); }
}
// Also: NotFoundError (404), ConflictError (409), ValidationError (400)
```

**Route handlers:** Use `handleServiceError` from `el-templo-api/src/modules/shared/error-handler.ts`:
```typescript
async (request, reply) => {
  try {
    const record = await attendanceService.checkIn(...);
    return reply.code(201).send(record);
  } catch (err: unknown) {
    handleServiceError(err, reply, request.log, "member check-in");
  }
}
```

**`handleServiceError` logic:**
- `AppError` subclasses -> use their `statusCode` and `message`
- Unknown errors -> log with `log.error({ err }, ...)` then return 500 with generic message
- Never expose internal error details to clients

**Error messages:** Spanish for user-facing messages (`"No tenes una suscripcion activa"`), English for internal/dev messages.

---

## Logging

**API:** Fastify's built-in Pino logger. Never `console.log`. Access via:
- `request.log.info(...)` in route handlers
- `this.log.info(...)` in services (logger injected via constructor)
- `app.log.info(...)` in startup code

**Bot:** Use Pino logger (`pino` already in `el-templo-bot/package.json`). Never `console.log`.

**Log context pattern (structured logging):**
```typescript
this.log.info(
  { memberId, bookingId: todayBooking.id },
  "Booking linked on QR check-in",
);
// Object with context keys FIRST, message string SECOND
```

---

## Module Structure (API)

Each module in `el-templo-api/src/modules/<domain>/` contains:

| File | Purpose |
|------|---------|
| `index.ts` | Barrel re-exports |
| `routes.ts` | Fastify route plugins |
| `service.ts` | Business logic class |
| `schemas.ts` | JSON Schema for request validation |
| `types.ts` | TypeScript interfaces and union types |

Complex modules split service further (facade pattern):
- `el-templo-api/src/modules/admin/edit-service.ts` -- facade delegating to:
  - `exercise-service.ts`, `exercise-swap-service.ts`, `session-mutation-service.ts`, `prescribe-service.ts`

**Bot module structure** (emerging, follow same organizational pattern):
- `el-templo-bot/src/ai/` -- AI provider abstraction
- `el-templo-bot/src/memory/` -- Session and profile memory
- `el-templo-bot/src/state/` -- Client state machine
- `el-templo-bot/src/whatsapp/` -- WhatsApp Cloud API client
- `el-templo-bot/src/schedulers/` -- Cron-based scheduled tasks

---

## Service Class Pattern

Services receive dependencies via constructor injection:
```typescript
export class AttendanceService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
    private paymentService: PaymentService,
    private subscriptionService: SubscriptionService,
    private auraService: AuraService,
  ) {}
}
```

Services are instantiated inside route plugins (not singletons):
```typescript
export const attendanceMemberRoutes: FastifyPluginAsync = async (fastify) => {
  const paymentService = new PaymentService(fastify.db, fastify.log);
  const auraService = new AuraService(fastify.db);
  const attendanceService = new AttendanceService(fastify.db, fastify.log, ...);
  // ... routes use attendanceService
};
```

---

## Route Pattern (Fastify)

**Auth guard via `addHook("onRequest")`:**
```typescript
fastify.addHook("onRequest", async (request, reply) => {
  await fastify.authenticate(request, reply);
  if (!ADMIN_ROLES.includes(request.user.role)) {
    return reply.code(403).send({ error: "Forbidden", message: "..." });
  }
});
```

**Route with schema validation and typed generic:**
```typescript
fastify.post<{ Body: { qrToken: string } }>(
  "/check-in",
  { schema: memberCheckInSchema },
  async (request, reply) => { ... },
);
```

**HTTP status codes:** 201 for creates, 200 for reads, 400/403/404/409 for client errors, 500 for server errors.

---

## Schema Pattern (Fastify validation)

Schemas are plain JSON Schema objects exported from `schemas.ts`:
```typescript
export const memberCheckInSchema = {
  body: {
    type: "object",
    required: ["qrToken"],
    properties: {
      qrToken: { type: "string" },
    },
  },
};
```

Use `querystring` for GET params, `params` for URL params, `body` for POST/PUT payloads. Include `minimum`, `maximum`, `default`, `enum` constraints where applicable (see `el-templo-api/src/modules/admin/schemas.ts` for detailed examples).

---

## Comment Style

**File-level JSDoc** on every file describing purpose:
```typescript
/**
 * Attendance Service
 *
 * Business logic for QR token validation, member check-in
 * (with subscription/overdue/branch enforcement), and attendance queries.
 */
```

**Method-level JSDoc** on public service methods:
```typescript
/**
 * Member QR check-in.
 *
 * Validates QR token, checks subscription, overdue status, branch enforcement,
 * and one-per-day constraint. Creates attendance record with status "registrado".
 */
async checkIn(memberId: number, qrToken: string): Promise<AttendanceRecord>
```

**Section dividers** for long files (using em-dash lines):
```typescript
// --- Check-in Methods -------------------------------------------------------
// --- Query Methods -----------------------------------------------------------
// --- Private Helpers ---------------------------------------------------------
```

---

## Bot-Specific Conventions (el-templo-bot)

**Shared MySQL:** Import schema via relative path from `../../el-templo-api/src/db/schema` (monorepo, same pnpm workspace).

**Business logic boundary:** For mutations (book class, create user), call `el-templo-api` via localhost HTTP -- do NOT duplicate business logic in the bot.

**AI provider abstraction:** Model-agnostic via `AiProvider` interface (`el-templo-bot/src/ai/provider.ts`). Select implementation via `AI_PROVIDER` env var (`openai` | `anthropic`).

**Scheduler pattern:** Acquire Redis distributed lock -> query DB -> process -> release lock. Use `node-cron` for scheduling. See `el-templo-bot/src/schedulers/class-reminder.ts` for the template.

---

## Reference Bot Patterns (contexto/whatsapp-agent-renovafacil)

These Python patterns should be adapted to TypeScript for `el-templo-bot`:

**State machine (Redis Hash, no TTL):**
```python
# Python original
r.hset(f"client_state:{phone}", mapping={
    "state": state.value,
    "updated_at": datetime.utcnow().isoformat(),
    "previous_state": current,
    "trigger": trigger,
})
```
TypeScript: use `ioredis` `hset` with the same key naming scheme.

**Atomic state transitions via Lua script** -- in TypeScript use `ioredis` `eval()`. See `contexto/whatsapp-agent-renovafacil/client_state.py` lines 80-91 for the Lua script.

**Redis key naming convention (adopt for el-templo-bot):**
- `conversation:{phone}` -- message history (TTL: 24h)
- `client_state:{phone}` -- lifecycle state hash (no TTL, persists indefinitely)
- `ratelimit_count:{phone}` -- rate limiter
- `blocked:{phone}` -- blocked users

**Mock pattern for Redis in tests:** `MockRedisClient` in-memory class mirroring the real client interface. See `contexto/whatsapp-agent-renovafacil/conftest.py` lines 42-328 for the full implementation -- replicate this concept in TypeScript.

---

*Convention analysis: 2026-03-17*
