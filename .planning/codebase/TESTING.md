# Testing Patterns

**Analysis Date:** 2026-03-17

**Scope:** Covers `el-templo-api/` (comprehensive test suite), `el-templo-bot/` (no tests yet), and `contexto/whatsapp-agent-renovafacil/` (Python reference bot test patterns).

---

## Test Framework (API)

**Runner:**
- Vitest ^4.0.18
- Config: `el-templo-api/vitest.config.ts` (integration), `el-templo-api/vitest.config.unit.ts` (unit)

**Assertion Library:**
- Vitest built-in (`expect`, `toBe`, `toContain`, `rejects.toThrow`, etc.)

**Run Commands:**
```bash
cd el-templo-api && pnpm test           # Run all tests (integration + unit)
cd el-templo-api && pnpm test:watch     # Watch mode
cd el-templo-api && vitest run --config vitest.config.unit.ts  # Unit tests only (no DB)
```

## Test Framework (Reference Bot -- Python)

**Runner:** pytest
- Config: `contexto/whatsapp-agent-renovafacil/conftest.py` (fixtures)
- Fixtures: `mock_redis`, `app_client`, `auth_token`, `auth_headers`, `mock_openai_classify`

---

## Test File Organization

**API -- Integration tests (separate directory, by domain):**
```
el-templo-api/test/
  helpers.ts              # createTestApp, getAuthToken, registerUser
  setup.ts                # Global setup: create DB, run migrations, seed
  attendance/
    attendance.test.ts
  auth/
    auth.test.ts
  subscriptions/
    subscriptions.test.ts
  payments/
    payments.test.ts
  scheduling/
    scheduling.test.ts
  sessions/
    sessions.test.ts
  members/
    members.test.ts
  admin/
    admin.test.ts
  analytics/
    analytics.test.ts
  blog/
    blog.test.ts
    blog-tags.test.ts
  franchise/
    franchise-admin.test.ts
    franchise-application.test.ts
  gladius/
    gladius.test.ts
  journeys/
    journeys.test.ts
  academy/
    academy.test.ts
  app-landing/
    app-landing.test.ts
  unit/                   # Pure unit tests (no DB)
    date-utils.test.ts
    format-params.test.ts
    progression.test.ts
    aura-service.test.ts  # Exception: needs DB despite being in unit/
    import-members.test.ts
```

**Naming convention:** `<domain>.test.ts` inside a matching `<domain>/` directory.

**Reference bot -- Python:**
```
contexto/whatsapp-agent-renovafacil/
  conftest.py             # Shared fixtures (autouse mock_redis, fake env)
  tests/
    __init__.py
    test_client_state.py
    test_state_triggers.py
    test_channel_flow.py
    test_security.py
    test_endpoints.py
    test_auth.py
    test_redis_client.py
    test_lead_scorer.py
    test_campaigns.py
    test_pipeline_api.py
    test_customer_memory.py
    test_customer_context.py
    test_execute_tool.py
    test_product_catalog.py
    test_urgency_classification.py
    test_scheduler_locks.py
    test_scheduler_guards.py
    test_post_purchase.py
    test_40_scenarios.py   # E2E scenario runner (40 real conversation scenarios)
    test_state_migration.py
```

---

## Vitest Configuration Details

**Integration tests** (`el-templo-api/vitest.config.ts`):
```typescript
export default defineConfig({
  test: {
    globals: true,
    root: ".",
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/setup.ts"],
    fileParallelism: false,   // DB tests must run sequentially
    testTimeout: 30000,       // DB operations can be slow
    env: {
      NODE_ENV: "test",
      DB_NAME: "eltemplo_test",
      JWT_SECRET: "test-secret-for-testing",
    },
  },
});
```

**Unit tests** (`el-templo-api/vitest.config.unit.ts`):
```typescript
export default defineConfig({
  test: {
    globals: true,
    root: ".",
    include: ["test/unit/**/*.test.ts"],
    exclude: ["test/unit/aura-service.test.ts"],  // Needs DB
    fileParallelism: true,   // Pure functions, safe to parallelize
    testTimeout: 5000,
  },
});
```

---

## Global Test Setup

**`el-templo-api/test/setup.ts`** -- Vitest `globalSetup`:
1. Drops and recreates `eltemplo_test` database (clean slate every run)
2. Runs all `.sql` migration files from `el-templo-api/src/db/migrations/`
3. Skips `@data-only` migrations (production data seeding)
4. Tolerates duplicate column/key errors (idempotent migrations)
5. Seeds minimal reference data: 1 branch, 1 spom_config, 1 admin user
6. Teardown: drops `eltemplo_test` database

**Seeded admin credentials:** `admin@test.com` / `adminpass123` (role: `superadmin`, branch: 1)

---

## Test Helpers

**`el-templo-api/test/helpers.ts`** provides three core functions:

```typescript
// Create a Fastify app connected to eltemplo_test
export async function createTestApp(): Promise<FastifyInstance>

// Login and return JWT token
export async function getAuthToken(
  app: FastifyInstance, email: string, password: string
): Promise<string>

// Register a new user, returns { token, user }
export async function registerUser(
  app: FastifyInstance,
  data: { email: string; password: string; branchId: number; ... }
): Promise<{ token: string; user: Record<string, unknown> }>
```

---

## Integration Test Structure

**Suite organization pattern (from `el-templo-api/test/attendance/attendance.test.ts`):**

```typescript
describe("Attendance API", () => {
  let app: FastifyInstance;
  let adminToken: string;

  // Reusable payloads as constants
  const basePlan = { name: "Plan Test", planTier: "flex", ... };
  const baseMemberDefaults = { email: "test@test.com", password: "pass123456", ... };

  beforeAll(async () => {
    // Optional: pin time with vi.useFakeTimers()
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-03-11T10:00:00Z"));

    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });

  // Per-test cleanup helper
  async function cleanupAll(): Promise<void> {
    // Delete in FK order
    await app.db.delete(auraTransactions);
    await app.db.delete(bookings);
    // ... more tables ...
    // Delete non-admin users with FK checks disabled
    await app.db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
    // ... delete users ...
    await app.db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
  }

  // Domain-specific setup helpers
  async function createPlan(overrides = {}): Promise<{ id: number }> { ... }
  async function createMember(overrides = {}): Promise<{ id: number }> { ... }
  async function setupMemberWithSubscription(): Promise<{ member, plan, subscription, memberToken }> { ... }

  describe("Member Check-in", () => {
    beforeEach(async () => { await cleanupAll(); });

    it("POST valid QR check-in returns 201 with registrado record", async () => {
      const { member, memberToken } = await setupMemberWithSubscription();
      const res = await app.inject({
        method: "POST",
        url: "/api/members/attendance/check-in",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { qrToken },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("registrado");
    });
  });
});
```

**Key patterns:**
- `app.inject()` for HTTP requests (Fastify's built-in test helper, no HTTP server needed)
- `JSON.parse(res.body)` for response parsing
- `expect(res.statusCode).toBe(...)` as first assertion
- Custom error messages: `expect(res.statusCode, \`Expected 403 for ...\`).toBe(403)`
- Setup composable helpers that build on each other (createPlan -> createMember -> assignPlan -> recordPayment)

---

## Unit Test Structure

**Pure function tests (from `el-templo-api/test/unit/date-utils.test.ts`):**

```typescript
describe("date-utils", () => {
  describe("addDays", () => {
    it("adds 1 day to a regular date", () => {
      expect(addDays("2026-03-10", 1)).toBe("2026-03-11");
    });

    it("handles month boundary", () => {
      expect(addDays("2026-03-31", 1)).toBe("2026-04-01");
    });

    it("handles February leap year", () => {
      expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    });
  });
});
```

**Key patterns:**
- Nested `describe` blocks per function
- Edge cases: boundaries (month, year, leap year), zero values, negative inputs
- No setup/teardown needed for pure functions

---

## Service-Level Tests (DB-backed)

**From `el-templo-api/test/unit/aura-service.test.ts`:**

```typescript
let app: FastifyInstance;
let auraService: AuraService;
let testUserId: number;

beforeAll(async () => {
  app = await createTestApp();
  auraService = new AuraService(app.db, app.log);
  const result = await registerUser(app, { ... });
  testUserId = result.user.id;
});

afterAll(async () => { await app.close(); });

beforeEach(async () => {
  // Clean tables directly via Drizzle
  await app.db.execute(sql`DELETE FROM aura_transactions`);
  await app.db.execute(sql`DELETE FROM aura_balances`);
  await app.db.execute(sql`DELETE FROM aura_config`);
  // Re-seed config
  await app.db.execute(sql`INSERT INTO aura_config ...`);
});

describe("AuraService.award()", () => {
  it("creates a ledger entry and updates balance atomically", async () => {
    const newBalance = await auraService.award({ ... });
    expect(newBalance).toBe(10);
  });

  it("rejects duplicate awards", async () => {
    await auraService.award({ ... });
    await expect(auraService.award({ ... })).rejects.toThrow();
  });
});
```

**Key pattern:** Instantiate service directly with `app.db` and `app.log`, test methods without going through HTTP routes.

---

## Cleanup Strategy

**Integration tests use per-test cleanup via `beforeEach`:**
1. Delete child tables first (FK order): `aura_transactions` -> `bookings` -> `attendance` -> etc.
2. Delete parent tables: `subscriptions` -> `subscription_plans`
3. For user cleanup: `SET FOREIGN_KEY_CHECKS = 0`, delete non-admin users, `SET FOREIGN_KEY_CHECKS = 1`
4. Always preserve the seeded admin user (`admin@test.com`)

**Each test file manages its own cleanup** -- no shared cleanup across test files.

---

## Mocking

**Time mocking (Vitest):**
```typescript
vi.useFakeTimers({ shouldAdvanceTime: true });
vi.setSystemTime(new Date("2026-03-11T10:00:00Z")); // Pin to specific day
// ... tests run at this frozen time ...
vi.useRealTimers(); // Restore in afterAll
```

**What to mock in API tests:**
- Time (when tests are date-sensitive -- booking windows, subscription expiry)
- Nothing else -- tests run against real MySQL `eltemplo_test` database

**What NOT to mock in API tests:**
- Database queries (real DB)
- Service dependencies (real service instances)
- HTTP routes (real Fastify injection)

---

## Reference Bot Test Patterns (Python -- conftest.py)

**Mock Redis (in-memory, no real Redis needed):**
```python
class MockRedisClient:
    """In-memory mock mirroring the RedisClient interface."""
    def __init__(self):
        self._store = {}
        self._expiry = {}
        self._lock = threading.RLock()

    def get(self, key): ...
    def set(self, key, value, ex=None): ...
    def hget(self, key, field): ...
    def hset(self, key, mapping=None): ...
    def eval(self, script, num_keys, *args): ...  # Simplified Lua execution
```
Apply this pattern in TypeScript: create a `MockRedis` class that implements the `ioredis` methods used by the bot.

**Auto-patched fixtures (autouse=True):**
```python
@pytest.fixture(autouse=True)
def mock_redis(monkeypatch):
    mock = MockRedisClient()
    monkeypatch.setattr(rc_module, "_instance", mock)
    return mock

@pytest.fixture(autouse=True)
def _patch_external_calls(monkeypatch):
    # Prevent real HTTP calls during tests
    monkeypatch.setattr(requests, "post", lambda *a, **kw: FakeResponse())
```

**AI mock fixture (opt-in):**
```python
@pytest.fixture
def mock_openai_classify(monkeypatch):
    def _configure_mock(requiere_escalacion=False, razon="Default reason"):
        mock_response = MagicMock()
        # ... configure mock to return specific JSON ...
        monkeypatch.setattr(human_handoff, "openai_client", mock_client)
    return _configure_mock
```

**WhatsApp mock fixture:**
```python
@pytest.fixture
def mock_whatsapp(monkeypatch):
    mock_client = MagicMock()
    mock_client.send_whatsapp_message.return_value = {"success": True}
    monkeypatch.setattr(whatsapp_client, "send_whatsapp_message", ...)
    return mock_client
```

---

## Reference Bot Test Types

**State machine tests (`tests/test_client_state.py`):**
- Test enum values match expected strings
- Test default state for new phone numbers
- Test state storage and retrieval from Redis
- Test atomic transitions (Lua script)
- Test transition rejection when current state mismatches
- Test TTL behavior (state keys should NOT expire)
- Many marked `@pytest.mark.skip(reason="not implemented yet")` -- tests written before implementation

**Security tests (`tests/test_security.py`):**
- AST/source inspection: verify `markupsafe.escape` is imported
- Verify no `str(e)` in error responses (no exception leak)
- Verify tokens are not logged in full
- Verify CORS is not wildcard

**Scenario tests (`tests/test_40_scenarios.py`):**
- 40 end-to-end conversation scenarios against the live bot
- Each scenario: send messages, check response with lambda assertion
- Categories: ventas, soporte, tracking, edge cases
- Runnable against local or production URL
- Pattern: `{"messages": [...], "expected": "...", "check": lambda r: ...}`

---

## Bot Testing Strategy (el-templo-bot -- to be built)

Based on analysis of both codebases, follow this testing strategy:

**Unit tests** (`el-templo-bot/test/unit/`):
- State machine transitions (`state/machine.ts`)
- AI provider interface (mock AI responses)
- WhatsApp payload parsing (`whatsapp/types.ts`)
- Session context extraction
- No DB, no Redis needed -- use mocks

**Integration tests** (`el-templo-bot/test/` or `el-templo-api/test/whatsapp/`):
- Webhook endpoint (POST /webhook) -- Fastify injection
- State determination from DB (phone -> user lookup -> subscription check)
- Scheduler logic (class reminders, trial follow-ups)
- Uses real MySQL `eltemplo_test` database

**Required test fixtures for bot:**
- `MockRedis` class (TypeScript port of Python `MockRedisClient`)
- `MockAiProvider` implementing `AiProvider` interface with canned responses
- `MockWhatsAppClient` that captures sent messages without calling Meta API
- Reuse `createTestApp`/`registerUser` from `el-templo-api/test/helpers.ts` for DB setup

**Test framework:** Vitest (same as API, consistent tooling). Add to `el-templo-bot/package.json`:
```json
{
  "devDependencies": {
    "vitest": "^4.0.18"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

---

## Coverage

**Requirements:** None enforced currently. No coverage thresholds configured.

**CI runs:** Type check, lint, security audit, integration tests, build -- on every push.

---

## Common Assertion Patterns

**Status code + body parsing:**
```typescript
expect(res.statusCode).toBe(201);
const body = JSON.parse(res.body);
expect(body.id).toBeTruthy();
expect(body.status).toBe("registrado");
```

**Error message assertion (Spanish):**
```typescript
expect(res.statusCode).toBe(400);
const body = JSON.parse(res.body);
expect(body.message).toContain("suscripcion activa");
```

**Async error assertion:**
```typescript
await expect(
  auraService.spend({ userId: testUserId, amount: 50, description: "Too expensive" }),
).rejects.toThrow("Insufficient");
```

**Auth/authorization assertions:**
```typescript
// 401 for unauthenticated
const res = await app.inject({ method: "POST", url: "/api/...", payload: { ... } });
expect(res.statusCode).toBe(401);

// 403 for wrong role
const res = await app.inject({
  method: "GET", url: "/api/admin/...",
  headers: { authorization: `Bearer ${memberToken}` },
});
expect(res.statusCode, `Expected 403 for GET /api/admin/...`).toBe(403);
```

---

*Testing analysis: 2026-03-17*
