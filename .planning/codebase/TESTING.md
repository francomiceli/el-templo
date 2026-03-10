# Testing Patterns

**Analysis Date:** 2025-03-10

## Test Framework

**API (`el-templo-api/`):**

- Runner: Vitest 4.0.18
- Config: `vitest.config.ts`
- Environment: Node.js (tests run against real MySQL database)
- Global setup: `test/setup.ts` (creates and seeds test database)
- Assertion library: Vitest built-in `expect`

**Frontend Apps (`el-templo-admin/`, `el-templo-app/`):**

- Runner: Vitest 4.0.18
- Config: `vitest.config.ts` (minimal, node environment)
- No tests currently present in el-templo-admin
- No tests currently present in el-templo-app
- No E2E tests (Cypress, Playwright not installed)

**Web App (`el-templo-web/`):**

- No test framework configured
- No tests present

## Run Commands

**API Tests:**

```bash
cd el-templo-api
pnpm test              # Run all tests once
pnpm test:watch        # Watch mode for development
```

**Frontend Tests (when present):**

```bash
cd el-templo-app
pnpm test              # Run all tests once
pnpm test:watch        # Watch mode
pnpm test:ui           # Vitest UI dashboard
```

## Test File Organization

**Location:**

- API: `el-templo-api/test/{feature}/{feature}.test.ts`
  - Examples: `test/members/members.test.ts`, `test/attendance/attendance.test.ts`, `test/unit/aura-service.test.ts`
  - Integration tests run against `eltemplo_test` database (not unit tests)
- Frontend: `src/**/*.test.ts` (co-located with source, not yet used)

**Naming:**

- Pattern: `{feature}.test.ts` or `{feature-area}.test.ts`
- Describe blocks: `describe("Feature Name Routes", () => { ... })`
- Test cases: `it("specific behavior", async () => { ... })`

**Structure:**

```
test/
├── helpers.ts                    # Shared test utilities
├── setup.ts                      # Global setup/teardown (vitest globalSetup)
├── unit/
│   ├── aura-service.test.ts      # Unit tests for services
│   └── format-params.test.ts
└── {feature}/
    ├── {feature}.test.ts         # Integration tests (call HTTP endpoints)
    ├── auth.test.ts
    ├── members.test.ts
    ├── scheduling.test.ts
    └── ...
```

## Test Configuration

**Vitest Config (`el-templo-api/vitest.config.ts`):**

```typescript
export default defineConfig({
  test: {
    globals: true, // Use global describe/it/expect (no imports needed)
    root: ".",
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/setup.ts"], // Run setup/teardown once per test session
    fileParallelism: false, // DB tests run sequentially (not in parallel)
    testTimeout: 30000, // 30s timeout for slow DB operations
    env: {
      NODE_ENV: "test",
      DB_NAME: "eltemplo_test", // Dedicated test database
      DB_HOST: "localhost",
      DB_PORT: "3306",
      DB_USER: "root",
      DB_PASSWORD: "",
      JWT_SECRET: "test-secret-for-testing",
    },
  },
});
```

**Database Setup (`test/setup.ts`):**

- Creates and seeds `eltemplo_test` database
- Runs all migration SQL files in `src/db/migrations/`
- Seeds minimal reference data: 1 branch, 1 SPOM config, 1 admin user
- Teardown: drops test database after all tests complete

## Test Structure

**Suite Organization:**

```typescript
describe("Members Management Routes", () => {
  let app: FastifyInstance;
  let adminToken: string;

  const baseMember = {
    email: "member@test.com",
    password: "pass123456",
    firstName: "Juan",
    lastName: "Perez",
    phone: "+5491155551234",
    dni: "30123456",
    branchId: 1,
  };

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await cleanupTestMembers();
  });

  it("creates a member with valid input", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/members",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: baseMember,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBeGreaterThan(0);
  });
});
```

**Patterns:**

1. **Setup and Teardown:**
   - `beforeAll(async () => { ... })` — create test app, get auth tokens
   - `afterAll(async () => { ... })` — close database connections
   - `beforeEach(async () => { ... })` — clean up test data from previous tests

2. **Helper Functions:**
   - `createTestApp()` — returns Fastify instance connected to test database
   - `getAuthToken(app, email, password)` — login and return JWT token
   - `registerUser(app, data)` — register a new user and return token + user object
   - `cleanupTestMembers()` — delete all test data in FK order to avoid constraint violations

3. **Making HTTP Requests:**
   - Use `app.inject()` for in-process HTTP testing (no network overhead)
   - Format: `app.inject({ method: "POST", url: "/api/...", headers: {...}, payload: {...} })`
   - Returns response object with `statusCode`, `body` (string), `headers`

4. **Assertions:**
   - HTTP status: `expect(res.statusCode).toBe(200)`
   - Response body: `const body = JSON.parse(res.body); expect(body.id).toBeDefined()`
   - Count: `expect(newBalance).toBe(10)`
   - Error throwing: `await expect(async () => { ... }).rejects.toThrow("message")`

## Mocking

**Database Operations:**

- No mocking of database calls
- Tests run against real MySQL `eltemplo_test` database
- Setup/teardown ensures clean state before each test

**HTTP Requests:**

- No mocking of Axios calls in backend tests (not applicable)
- Frontend tests would use `vi.mock()` from vitest, but no frontend tests present yet

**Authentication:**

- Real JWT tokens are generated via `getAuthToken()` helper
- Token includes user ID and role (coach/admin/superadmin)
- Tokens are validated by Fastify's JWT plugin in each test request

## Fixtures and Factories

**Test Data:**

```typescript
const baseMember = {
  email: "member@test-members.com",
  password: "pass123456",
  firstName: "Juan",
  lastName: "Perez",
  phone: "+5491155551234",
  dni: "30123456",
  branchId: 1,
};

async function createMember(
  overrides: Record<string, unknown> = {},
): Promise<{ id: number; [key: string]: unknown }> {
  const res = await app.inject({
    method: "POST",
    url: "/api/admin/members",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { ...baseMember, ...overrides },
  });
  return JSON.parse(res.body);
}
```

**Location:**

- Inline in test files (at top of describe block)
- Helper functions defined in same test file or shared in `test/helpers.ts`
- AURA test data seeded in `beforeEach()` via SQL: `INSERT INTO aura_config (...)`

## Coverage

**Requirements:** No enforced coverage targets in vitest config

**Current Coverage:**

- API: Comprehensive integration tests for:
  - `el-templo-api/test/members/members.test.ts` — Member CRUD, notes, DNI checks
  - `el-templo-api/test/attendance/attendance.test.ts` — Check-in, attendance tracking
  - `el-templo-api/test/scheduling/scheduling.test.ts` — Activities, schedules, bookings
  - `el-templo-api/test/payments/payments.test.ts` — Payment recording, refunds
  - `el-templo-api/test/subscriptions/subscriptions.test.ts` — Subscription lifecycle
  - `el-templo-api/test/analytics/analytics.test.ts` — Analytics endpoints
  - `el-templo-api/test/unit/aura-service.test.ts` — AURA economy (unit tests)
  - Many more: auth, blog, academy, gladius, franchise, sessions, journeys, progression
- Frontend: No tests present (coverage gaps)
- Web: No tests present

## Test Types

**Unit Tests:**

- Scope: Single service class methods without HTTP layer
- Example: `test/unit/aura-service.test.ts` tests `AuraService.award()`, `.spend()`, `.getBalance()`
- Pattern: Create service instance with test database, call methods directly, assert results
- Database: Real (uses `eltemplo_test`)
- Location: `test/unit/*.test.ts`

**Integration Tests:**

- Scope: Full HTTP request → route handler → service → database → response
- Example: `test/members/members.test.ts` calls `/api/admin/members` endpoints
- Pattern: Use `app.inject()` to simulate HTTP requests, validate response status and body
- Database: Real (uses `eltemplo_test`)
- Location: `test/{feature}/{feature}.test.ts`
- Covers:
  - Request validation (schemas enforce types)
  - Authentication/authorization (token-based access control)
  - Business logic (service methods called by routes)
  - Database state changes (queries return updated data)
  - Error handling (invalid inputs, missing resources, conflicts)

**E2E Tests:**

- Not implemented (Cypress/Playwright not installed)
- Would test: User workflows across multiple pages/screens in mobile/web apps

## Common Patterns

**Async Testing:**

```typescript
it("lists members with pagination", async () => {
  const { data } = await app.inject({
    method: "GET",
    url: "/api/admin/members?page=1&limit=10",
    headers: { authorization: `Bearer ${adminToken}` },
  });
  const body = JSON.parse(data.body);
  expect(body.members).toBeDefined();
  expect(body.total).toBeGreaterThanOrEqual(0);
});
```

**Error Testing:**

```typescript
it("rejects with 400 if email is invalid", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/admin/members",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { ...baseMember, email: "not-an-email" },
  });
  expect(res.statusCode).toBe(400);
  const body = JSON.parse(res.body);
  expect(body.error).toContain("email");
});
```

**Transaction Testing (AURA Service):**

```typescript
it("accumulates balance across multiple awards", async () => {
  await auraService.award({
    userId: testUserId,
    sourceType: "training_completion",
    referenceType: "session",
    referenceId: 1,
  });

  const newBalance = await auraService.award({
    userId: testUserId,
    sourceType: "attendance",
    referenceType: "class",
    referenceId: 1,
  });

  expect(newBalance).toBe(15); // 10 + 5 from config defaults
});
```

## Testing Checklist for New Features

When adding a new API endpoint:

1. Create `test/{feature}/{feature}.test.ts`
2. Import `createTestApp`, `getAuthToken`, `registerUser` from `test/helpers.ts`
3. Set up test data in `beforeAll()` (auth tokens)
4. Add cleanup helper in `beforeEach()` to delete test records
5. Test happy path: valid input → 200 response with expected data
6. Test auth: missing/invalid token → 401
7. Test validation: invalid input (type, constraint) → 400 with error message
8. Test conflicts: duplicate creation, overdue blocks, insufficient balance → appropriate status code
9. Test not found: request non-existent resource → 404
10. Run tests: `pnpm test` should pass sequentially against test database

## Known Gaps

**Frontend Testing:**

- No tests for `el-templo-admin/` components or stores
- No tests for `el-templo-app/` composables, stores, or pages
- Vitest configured but no test files written
- Missing: unit tests for composables (useSessionPlayer, useMembersApi, etc.)
- Missing: store tests (Pinia store state and actions)

**Web App Testing:**

- No test framework configured
- No tests for Nuxt pages or components

---

_Testing analysis: 2025-03-10_
