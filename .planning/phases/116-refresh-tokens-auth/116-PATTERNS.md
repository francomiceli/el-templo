# Phase 116: Refresh Tokens Auth - Pattern Map

**Mapped:** 2026-05-25
**Files analyzed:** 13 (new/modified across api + app + admin)
**Analogs found:** 13 / 13

## File Classification

| New/Modified File                                                                                                                                   | Role                 | Data Flow                        | Closest Analog                                                                                                | Match Quality           |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `el-templo-api/src/db/schema/refresh-tokens.ts` (new)                                                                                               | model (schema)       | CRUD                             | `el-templo-api/src/db/schema/member-logins.ts` (FK to users + index) and `audit-log.ts` (FK + multi-index)    | exact                   |
| `el-templo-api/src/db/migrations/0125_create_refresh_tokens.sql` (new)                                                                              | migration            | CRUD/DDL                         | `el-templo-api/src/db/migrations/0108_create_audit_log.sql` (CREATE TABLE + FK + indexes)                     | exact                   |
| `el-templo-api/src/db/schema/index.ts` (modify — add export)                                                                                        | config (barrel)      | —                                | existing `export * from "./member-logins";` line 48                                                           | exact                   |
| `el-templo-api/src/modules/auth/refresh-token-service.ts` (new)                                                                                     | service              | CRUD (token rotation/revocation) | `el-templo-api/src/modules/segmentation/service.ts` (constructor DI, Phase 56)                                | role-match (DI exact)   |
| `el-templo-api/src/modules/auth/routes.ts` (modify — `/refresh`, `/logout`, extend `/login` `/register` `/me/change-password` `/me/delete-account`) | route/controller     | request-response                 | same file — existing `POST /login` (293-409), `/me/change-password` (534-583), `/me/delete-account` (586-665) | exact (self)            |
| `el-templo-api/src/plugins/auth.ts` (modify — add `JWT_ACCESS_EXPIRES_IN` sign)                                                                     | config (plugin)      | —                                | same file — existing `expiresIn` wiring (28-35)                                                               | exact (self)            |
| `el-templo-api/.env.example` (modify — add `JWT_ACCESS_EXPIRES_IN=30m`)                                                                             | config               | —                                | existing `JWT_EXPIRES_IN=7d` line 13                                                                          | exact                   |
| `el-templo-api/test/auth/refresh.test.ts` (new)                                                                                                     | test                 | request-response                 | `el-templo-api/test/auth/auth.test.ts` + `test/helpers.ts`                                                    | exact                   |
| `el-templo-app/src/composables/useTokenStorage.ts` (modify — dual-key + legacy read)                                                                | utility (composable) | file-I/O (storage)               | same file — existing single-key impl                                                                          | exact (self)            |
| `el-templo-app/src/boot/axios.ts` (modify — lock + retry interceptor)                                                                               | config (boot)        | request-response                 | same file — existing 401 interceptor (60-77)                                                                  | exact (self)            |
| `el-templo-app/src/boot/auth.ts` (modify — silent refresh before `/me`)                                                                             | config (boot)        | request-response                 | same file — existing boot flow (12-40)                                                                        | exact (self)            |
| `el-templo-app/src/auth/refresh-lock.ts` (new, per-app, D-02)                                                                                       | utility              | request-response                 | no direct analog — pattern is shared Promise in module scope (see Shared Patterns)                            | no analog (new pattern) |
| `el-templo-admin/src/boot/axios.ts` (modify — lock + retry, `adminAccessToken`/`adminRefreshToken`)                                                 | config (boot)        | request-response                 | same file — existing 401 interceptor (32-47)                                                                  | exact (self)            |

## Pattern Assignments

### `el-templo-api/src/db/schema/refresh-tokens.ts` (model, CRUD)

**Analog:** `el-templo-api/src/db/schema/member-logins.ts` (FK to users + index) and `audit-log.ts` (multi-index).

**Imports + table + relations pattern** (`member-logins.ts:1-30`):

```typescript
import { mysqlTable, int, timestamp, index } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

export const memberLogins = mysqlTable(
  "member_logins",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .references(() => users.id)
      .notNull(),
    loggedInAt: timestamp("logged_in_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_member_logins_user_date").on(table.userId, table.loggedInAt),
  ],
);

export const memberLoginsRelations = relations(memberLogins, ({ one }) => ({
  user: one(users, {
    fields: [memberLogins.userId],
    references: [users.id],
  }),
}));
```

**Notes for new file:** Required columns (Req 1): `id`, `userId` (FK users), `tokenHash` (unique, sha256), `expiresAt`, `revokedAt` (nullable), `replacedById` (self-FK nullable, for rotation), `createdAt`. Use `varchar("token_hash", { length: 64 }).notNull().unique()` for the sha256 hex (or 43 for base64url). Use `timestamp(...)` (nullable, no `.notNull()`) for `revokedAt`. Self-FK `replacedById` references `refreshTokens.id` — Drizzle self-reference needs `AnyMySqlColumn` type annotation. Indexes on `token_hash` (unique already covers lookup) and `user_id`. Use `varchar` import like `audit-log.ts:1-10`.

---

### `el-templo-api/src/db/migrations/0125_create_refresh_tokens.sql` (migration, DDL)

**Analog:** `el-templo-api/src/db/migrations/0108_create_audit_log.sql`.

**Full pattern** (`0108_create_audit_log.sql:22-36`):

```sql
CREATE TABLE audit_log (
  id INT NOT NULL AUTO_INCREMENT,
  actor_id INT NOT NULL,
  action VARCHAR(50) NOT NULL,
  ...
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_audit_log_actor FOREIGN KEY (actor_id) REFERENCES users(id),
  INDEX idx_audit_log_action_created (action, created_at),
  INDEX idx_audit_log_target (target_kind, target_id),
  INDEX idx_audit_log_actor_created (actor_id, created_at)
);
```

**FK with cascade reference** (`0121_users_lead_fields.sql:33-38`):

```sql
ALTER TABLE users
  ADD CONSTRAINT users_created_by_users_id_fk
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
```

**Hard constraints for this file:**

- Next migration number is **0125** (0124 taken by bar-challenge).
- Plain `CREATE TABLE` — **no `IF NOT EXISTS`** (project pattern, `_migrations` table is the idempotency guard — see header comment in 0108/0121).
- **No `;` inside any comment line** — runner splits on `;` before stripping `--` comments (CLAUDE.md + memory note; breaks the whole migration).
- D-05: include `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE` as future-proofing for hard deletes (soft-delete won't trigger it).
- Self-FK for `replaced_by_id`: `FOREIGN KEY (replaced_by_id) REFERENCES refresh_tokens(id)` — declare after the table or as inline constraint; nullable, `ON DELETE SET NULL`.
- FK constraint names should follow Drizzle's convention (`refresh_tokens_user_id_users_id_fk`) so a future `db:generate` converges (see 0121:33-35 rationale).
- Commit the SQL alongside the schema file (CLAUDE.md + memory note).
- Header comment block mirroring 0108/0121 (idempotency rationale + comment-safety note).

---

### `el-templo-api/src/modules/auth/refresh-token-service.ts` (service, CRUD)

**Analog:** `el-templo-api/src/modules/segmentation/service.ts` (constructor DI, Phase 56).

**Constructor DI pattern** (`segmentation/service.ts:11-28`):

```typescript
import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, gte, sql, desc, inArray } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";

export class SegmentationService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  async getThresholds(): Promise<SegmentThresholds> {
    const rows = await this.db
      .select({ ... })
      .from(schema.systemSettings)
      .where(inArray(schema.systemSettings.settingKey, [...keys]));
    ...
  }
}
```

**Instantiation in route handler** (`auth/routes.ts:417-420`):

```typescript
const segmentationService = new SegmentationService(fastify.db, request.log);
```

**Notes for new file:** `RefreshTokenService` takes `(db, log)`. Methods needed by the routes: `issue(userId)` → returns plain token (`crypto.randomBytes(32).toString("base64url")`) + persists sha256 hash with `expires_at = now + 30d`; `rotate(plainToken)` → validates (exists, not revoked, not expired), reuse-detection (if `revoked_at` set → revoke whole family by `user_id` and throw/return 401 signal), marks old `revoked_at=now` + `replaced_by_id=new`, returns new token; `revoke(plainToken)` → idempotent (for `/logout`); `revokeAllForUser(userId)` → for change-password (D-01) and delete-account (D-05): `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL`. Token plain value is **never persisted** — only `sha256` hash. Use `crypto` from node. Logging: refresh failures at `warn` level, not `error` (avoids Sentry spam — SPEC constraint + CONTEXT specific idea).

---

### `el-templo-api/src/modules/auth/routes.ts` (route/controller, request-response — modify)

**Analog:** same file — existing handlers.

**JWT sign + extensible response pattern** (`routes.ts:383-407`, `/login`):

```typescript
// Sign JWT
const token = fastify.jwt.sign({
  userId: user.id,
  email: user.email,
  role: user.role,
});

return {
  token,
  user: { id: user.id, email: user.email, ... },
};
```

**Service instantiation inside handler** (`routes.ts:201-221`) — shows DI of services with `fastify.db` + `request.log`:

```typescript
const auraService = new AuraService(fastify.db);
const balanceService = new BalanceService(fastify.db, fastify.log);
const subscriptionService = new SubscriptionService(
  fastify.db,
  request.log,
  auraService,
  transactionService,
  enrollmentService,
);
```

**Protected route + body schema pattern** (`routes.ts:534-548`, `/me/change-password`):

```typescript
fastify.post<{ Body: { currentPassword: string; newPassword: string } }>(
  "/me/change-password",
  {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: "object",
        required: ["currentPassword", "newPassword"],
        properties: {
          currentPassword: { type: "string" },
          newPassword: { type: "string", minLength: 6 },
        },
      },
    },
  },
  async (request, reply) => {
    const { userId } = request.user;
    ...
  },
);
```

**Error/401 response shape** (`routes.ts:322-325`):

```typescript
return reply
  .code(401)
  .send({ error: "No autorizado", message: "Credenciales invalidas" });
```

**Notes for handlers:**

- `/auth/refresh` and `/auth/logout` are **public** (no `onRequest: [fastify.authenticate]`) — they take `{ refreshToken }` in body (D-04). Add JSON body schema like change-password (required `refreshToken`).
- Extend `/login` (390-407) and `/register` (273-288) return objects with `accessToken` + `refreshToken` keeping `token`. `accessToken` signed via the new short-lived sign option (see auth.ts pattern below); `token` keeps 7d.
- `/me/change-password` (D-01): after the password update (579), call `refreshTokenService.revokeAllForUser(userId)` then issue a fresh pair, and extend the response (581) to `{ message, accessToken, refreshToken }`.
- `/me/delete-account` (D-05): after the anonymize UPDATE (641-659), add `refreshTokenService.revokeAllForUser(userId)`.
- **Path correction (CONTEXT D-01):** real path is `POST /me/change-password` at line 534, registered under prefix `/api/auth` (`app.ts:114`) — NOT `/auth/change-password`.

---

### `el-templo-api/src/plugins/auth.ts` (config/plugin — modify)

**Analog:** same file — existing sign config.

**Current sign wiring** (`auth.ts:28-35`):

```typescript
const expiresIn = process.env.JWT_EXPIRES_IN || "7d";

await fastify.register(jwt, {
  secret,
  sign: { expiresIn },
});
```

**Notes:** `@fastify/jwt` `fastify.jwt.sign(payload, { expiresIn })` accepts a per-call override. The legacy `token` keeps the default `7d`; the new `accessToken` is signed with `fastify.jwt.sign(payload, { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "30m" })`. **Req 8 is no-change**: `fastify.authenticate` (37-52) already verifies any JWT signed with `JWT_SECRET` regardless of expiry length — both legacy 7d and new 30m verify against `/auth/me` with no code change.

---

### `el-templo-api/test/auth/refresh.test.ts` (test — new)

**Analog:** `el-templo-api/test/auth/auth.test.ts` + `test/helpers.ts`.

**Test scaffold** (`auth.test.ts:1-18`):

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, registerUser } from "../helpers";
import * as schema from "../../src/db/schema";

describe("Auth Routes", () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => { await app.close(); });
```

**Inject + assert pattern** (`auth.test.ts:231-245`):

```typescript
const res = await app.inject({
  method: "POST",
  url: "/api/auth/login",
  payload: { email: "logintest@test.com", password: "password123" },
});
expect(res.statusCode).toBe(200);
const body = JSON.parse(res.body);
expect(body).toHaveProperty("token");
```

**Direct DB assertion via `app.db`** (`auth.test.ts:588-592`):

```typescript
const [row] = await app.db
  .select()
  .from(schema.users)
  .where(eq(schema.users.id, u.id));
expect(row.deletedAt).not.toBeNull();
```

**Helpers available** (`test/helpers.ts`): `createTestApp()` (22-26), `registerUser(app, {...})` (81-123, returns `{ token, user }`), `getAuthToken(app, email, password)` (59-74), `createTestMember(app, overrides)` (277-311). Seed user `admin@test.com` / `adminpass123` exists. `app.db` (Drizzle) and `app.dbPool` (raw pool) both exposed.

**Notes:** Add a new `refresh_tokens` entry to `TABLES_TO_CLEAN` in `helpers.ts:144-202` (top of list — FK to users, must delete before users) so cross-file isolation works. Cover (Req 14): happy-path refresh + rotation (assert old `revoked_at` set, `replaced_by_id` points to new via direct `app.db` query against `schema.refreshTokens`), reuse detection (reused rotated token → 401 + whole family revoked), logout (idempotent 200, subsequent refresh → 401), change-password revokes all + returns new pair, dual-token verify (legacy `token` and new `accessToken` both 200 on `/me`), and the access-token 30m unit assertion (`exp - iat === 1800`).

---

### `el-templo-app/src/composables/useTokenStorage.ts` (utility — modify)

**Analog:** same file.

**Current single-key impl** (`useTokenStorage.ts:1-34`):

```typescript
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const TOKEN_KEY = 'authToken';

export function useTokenStorage() {
  const isNative = Capacitor.isNativePlatform();

  async function getToken(): Promise<string | null> {
    if (isNative) {
      const { value } = await Preferences.get({ key: TOKEN_KEY });
      return value;
    }
    return localStorage.getItem(TOKEN_KEY);
  }
  async function setToken(token: string): Promise<void> { ... }
  async function removeToken(): Promise<void> { ... }
  return { getToken, setToken, removeToken };
}
```

**Notes (D-03):** Add keys `accessToken` + `refreshToken`. `getAccessToken()` reads `accessToken`; if absent, falls back to reading the legacy `authToken` (soft migration). `getRefreshToken()` reads `refreshToken`. `setTokens(access, refresh)` writes both. **Cleanup of `authToken` is deferred** — delete it only on first successful refresh or re-login, not eagerly at boot. Keep the same `isNative` branch for Capacitor Preferences vs localStorage on every key.

---

### `el-templo-app/src/boot/axios.ts` (config/boot — modify, member app)

**Analog:** same file — existing 401 interceptor.

**Current 401 interceptor (no retry)** (`axios.ts:58-77`):

```typescript
export default boot(({ app, router }) => {
  api.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error.response?.status === 401) {
        if (Capacitor.isNativePlatform()) {
          await Preferences.remove({ key: TOKEN_KEY })
        } else {
          localStorage.removeItem(TOKEN_KEY)
        }
        if (router.currentRoute.value.path !== '/login') {
          await router.push('/login')
        }
      }
      return Promise.reject(error)
    },
  )
  ...
})
```

**Request interceptor (token attach, async for Capacitor)** (`axios.ts:33-56`) — also has the Capacitor empty-body workaround (43-50) that MUST be preserved.

**Notes (Req 9, D-02):** On 401, if a refresh token exists and the failing request is not `/auth/refresh` (whitelist to prevent loop), enqueue the original request, trigger a single `/auth/refresh` via the shared lock (`refresh-lock.ts`), update tokens via `useTokenStorage.setTokens`, retry the queued requests with the new access token. Only on refresh failure (401 from refresh or persistent network error after one backoff retry) run clearAuth + `router.push('/login')`. Preserve the existing `Capacitor.isNativePlatform()` storage branching and the empty-body workaround.

---

### `el-templo-app/src/boot/auth.ts` (config/boot — modify, member app)

**Analog:** same file.

**Current boot flow** (`auth.ts:7-41`):

```typescript
export default boot(async () => {
  const authStore = useAuthStore()
  const { getToken, removeToken } = useTokenStorage()
  const token = await getToken()
  if (token) {
    authStore.token = token
    try {
      const response = await api.get('/auth/me')
      authStore.setAuth(token, { ... })
      ...
    } catch {
      authStore.clearAuth()
      await removeToken()
    }
  }
})
```

**Notes (Req 11, D-03):** Read access + refresh. If access exists but is expired (decode JWT `exp`) and a refresh token exists, call `/auth/refresh` first, then `/auth/me`. Only clear if refresh fails. Keep the existing `hydrateSelection()` / `loadSubscription()` hydration calls (27-34) after a successful `/auth/me`.

---

### `el-templo-app/src/auth/refresh-lock.ts` (utility — new, per-app)

**Analog:** No direct analog in codebase. See Shared Patterns below — this is the canonical lock implementation that both `boot/axios.ts` and `boot/auth.ts` import.

---

### `el-templo-admin/src/boot/axios.ts` (config/boot — modify, admin)

**Analog:** same file (and mirrors member app `boot/axios.ts`).

**Current 401 interceptor** (`admin/src/boot/axios.ts:31-47`):

```typescript
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      (error as { __authRedirected?: boolean }).__authRedirected = true;
      localStorage.removeItem(TOKEN_KEY);
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);
```

**Notes (Req 10, D-02):** Simpler than member app — web-only, `localStorage` only, no Capacitor. Keys `adminAccessToken` + `adminRefreshToken` (read legacy `adminToken` as access for soft migration). Same lock + single-retry algorithm (its own copy per D-02, ~40 LOC, no shared cross-repo package). Preserve the `__authRedirected` flag (38) used for Sentry filtering. Uses `window.location.href` for redirect (not vue-router) — keep that.

## Shared Patterns

### Constructor DI for services (API)

**Source:** `el-templo-api/src/modules/segmentation/service.ts:24-28`
**Apply to:** `refresh-token-service.ts`

```typescript
export class SegmentationService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}
}
```

Instantiate inside the route handler with `new RefreshTokenService(fastify.db, request.log)` (matches `auth/routes.ts:417-420`).

### 401 / error response shape (API)

**Source:** `el-templo-api/src/modules/auth/routes.ts:322-325`
**Apply to:** all new auth route error paths

```typescript
return reply.code(401).send({ error: "No autorizado", message: "..." });
```

### Drizzle schema barrel export

**Source:** `el-templo-api/src/db/schema/index.ts:48`
**Apply to:** add `export * from "./refresh-tokens";` and add `schema.refreshTokens` to `TABLES_TO_CLEAN` in `test/helpers.ts:144`.

```typescript
export * from "./member-logins";
```

### Migration comment-safety + idempotency (API)

**Source:** `el-templo-api/src/db/migrations/0121_users_lead_fields.sql:8-19` (header), `0108_create_audit_log.sql:22-36` (DDL)
**Apply to:** `0125_create_refresh_tokens.sql`

- No `;` inside comment lines (runner splits on `;` before stripping `--`).
- No `IF NOT EXISTS` — `_migrations` table is the idempotency guard.
- FK constraint names follow Drizzle convention for future `db:generate` convergence.

### Refresh lock (frontend, per-app — D-02)

**Source:** No existing analog. Canonical algorithm both apps copy (each its own ~40 LOC file, NO shared package):

```typescript
// Module-scope shared promise — NOT per-request.
let refreshPromise: Promise<string> | null = null;

export function refreshAccessToken(
  doRefresh: () => Promise<string>,
): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}
```

First 401 triggers a single `/auth/refresh`; concurrent requests await the same promise and retry once with the new access token. `/auth/refresh` itself is whitelisted (a 401 from it → clearAuth + redirect, no recursion). Differs per app only in storage (Capacitor Preferences vs localStorage) and redirect (vue-router push vs `window.location.href`).

### Logging level for refresh failures

**Source:** CONTEXT specific idea + SPEC constraint
**Apply to:** API refresh handler + frontend interceptors

- API: `request.log.warn(...)` for failed refresh (NOT `.error` — avoids Sentry spam).
- Frontend: `createLogger().warn(...)` (never `console.*`; `createLogger().error()` auto-sends to Sentry per CLAUDE.md).

## No Analog Found

| File                                     | Role    | Data Flow        | Reason                                                                                                                                                                                                                                                                                              |
| ---------------------------------------- | ------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-app/src/auth/refresh-lock.ts` | utility | request-response | No refresh-token / shared-promise-lock pattern exists anywhere in either frontend (confirmed: zero `refreshToken`/`refresh_token` occurrences). Planner uses the canonical algorithm in Shared Patterns; structure/location at planner discretion per CONTEXT D-02. Same applies to the admin copy. |

## Metadata

**Analog search scope:** `el-templo-api/src/{plugins,modules/auth,modules/segmentation,db/schema,db/migrations}`, `el-templo-api/test/auth`, `el-templo-api/test/helpers.ts`, `el-templo-app/src/{boot,composables}`, `el-templo-admin/src/boot`
**Files scanned:** ~14 read in full + schema/migration/test directory listings
**Pattern extraction date:** 2026-05-25
