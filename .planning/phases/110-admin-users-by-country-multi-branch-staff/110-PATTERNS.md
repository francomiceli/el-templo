# Phase 110: Admin users por país + multi-sede staff — Pattern Map

**Mapped:** 2026-04-30
**Files analyzed:** 15 (9 backend new/modified + 6 frontend)
**Analogs found:** 14 / 15

## File Classification

| New/Modified File                                                       | Role                          | Data Flow        | Closest Analog                                                              | Match Quality |
| ----------------------------------------------------------------------- | ----------------------------- | ---------------- | --------------------------------------------------------------------------- | ------------- |
| `el-templo-api/src/modules/shared/branch-access.ts`                     | utility (helper + preHandler) | request-response | `el-templo-api/src/modules/shared/country-scope.ts`                         | exact         |
| `el-templo-api/src/modules/shared/country-scope.ts` (modify)            | middleware                    | request-response | self (extension)                                                            | exact         |
| `el-templo-api/src/db/schema/users.ts` (modify)                         | model (schema)                | CRUD             | self (additive column)                                                      | exact         |
| `el-templo-api/src/db/schema/user-branches.ts` (NEW)                    | model (schema)                | CRUD             | `el-templo-api/src/db/schema/blog-tags.ts` (`blogPostTags`)                 | exact         |
| `el-templo-api/src/db/migrations/0107_admin_users_by_country.sql` (NEW) | migration                     | batch DDL        | `el-templo-api/src/db/migrations/0091_multi_currency_and_country_scope.sql` | exact         |
| `el-templo-api/src/modules/users/routes.ts` (modify)                    | controller                    | CRUD             | self (extend payloads)                                                      | exact         |
| `el-templo-api/src/modules/users/service.ts` (modify)                   | service                       | CRUD             | self (cardinality validation)                                               | exact         |
| `el-templo-api/src/modules/users/schemas.ts` (modify)                   | schema                        | request-response | self (additive props)                                                       | exact         |
| `el-templo-api/src/modules/users/types.ts` (modify)                     | type defs                     | n/a              | self                                                                        | exact         |
| `el-templo-api/src/modules/members/routes.ts:120` (modify)              | controller                    | CRUD             | self (`GET /branches`)                                                      | exact         |
| `el-templo-api/src/modules/scheduling/booking-service.ts:142` (modify)  | service                       | CRUD             | self (multibranch check)                                                    | exact         |
| `el-templo-api/test/branch-access.test.ts` (NEW)                        | test                          | request-response | `el-templo-api/test/country-scope.test.ts`                                  | exact         |
| `el-templo-admin/src/pages/UsuariosPage.vue` (modify)                   | component                     | CRUD             | self (extend form)                                                          | exact         |
| `el-templo-admin/src/composables/useUsersApi.ts` (modify)               | composable                    | request-response | self (extend types)                                                         | exact         |
| `el-templo-admin/src/composables/useMembersApi.ts:287` (no API change)  | composable                    | request-response | self                                                                        | exact         |

---

## Pattern Assignments

### `el-templo-api/src/modules/shared/branch-access.ts` (utility, request-response)

**Analog:** `el-templo-api/src/modules/shared/country-scope.ts` (entire file).

**Imports + Fastify type augmentation pattern** (`country-scope.ts` lines 1-18):

```typescript
import type { FastifyRequest } from "fastify";
import { MySql2Database } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { OWNER_ROLES } from "./permissions";

export type CountryCode = "AR" | "ES";

export interface CountryScope {
  country: CountryCode;
  isOwner: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    scope: CountryScope;
  }
}
```

**Mirror for branch-access.ts:** export pure async helper + a preHandler factory. The helper signature should match the discretion in CONTEXT D-Helper API: `async canAccessBranch(scope: CountryScope, branchId: number, db: MySql2Database<typeof schema>): Promise<boolean>`. Single SELECT for the branch row, then evaluate rules in order.

**Error reply shape pattern** (mimic `users/routes.ts` lines 28-33 + `finance/routes.ts` lines 114-118):

```typescript
return reply.code(403).send({
  error: "Forbidden",
  message: "No tenés acceso a esta sede",
  code: "BRANCH_OUT_OF_SCOPE",
});
```

**Structured warn-log pattern** (per CONTEXT D-06 + Phase 98 D-17 — mirror `country-scope.ts` lines 60-63):

```typescript
request.log.warn(
  { userId, role, branchId, scope: request.scope },
  "BRANCH_OUT_OF_SCOPE",
);
```

**preHandler factory pattern** (Fastify idiom — closest in-repo precedent is the `attachCountryScope(request, fastify.db)` invocation in module preHandlers):

```typescript
// requireBranchAccess({ from: 'query.branchId' }) → returns a preHandler.
// Reads branchId from the declared location, calls canAccessBranch,
// short-circuits with 403 + warn log on failure. No auto-detection (D-02).
export function requireBranchAccess(opts: { from: BranchIdLocation }) {
  return async function preHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const branchId = readBranchId(request, opts.from);
    if (branchId == null) return; // route accepts requests without branchId
    const ok = await canAccessBranch(
      request.scope,
      branchId,
      request.server.db,
    );
    if (!ok) {
      request.log.warn(
        {
          userId: request.user?.userId,
          role: request.user?.role,
          branchId,
          scope: request.scope,
        },
        "BRANCH_OUT_OF_SCOPE",
      );
      return reply.code(403).send({
        error: "Forbidden",
        message: "No tenés acceso a esta sede",
        code: "BRANCH_OUT_OF_SCOPE",
      });
    }
  };
}
```

---

### `el-templo-api/src/modules/shared/country-scope.ts` (middleware, modify)

**Analog:** self. Two surgical changes per CONTEXT decisions:

1. **Read `users.country` directly for admin/gestion** (replace JOIN at lines 70-83 with two-branch logic: admin/gestion → `SELECT country FROM users WHERE id=?`; coach/recepción → `SELECT branch_id FROM user_branches WHERE user_id=?` aggregated; member/owner unchanged from current behavior).

2. **Extend `CountryScope` interface** (lines 9-12) to:

```typescript
export interface CountryScope {
  country: CountryCode;
  branchIds: number[]; // populated for coach/recepción; empty for others
  isOwner: boolean;
  role: string; // mirrored from request.user.role for downstream guards
}
```

**Backward compat guarantee:** all existing consumers (`subscriptions/`, `finance/routes.ts`, `members/routes.ts`) read only `scope.country` and `scope.isOwner`. Adding `branchIds` and `role` is a strict superset — Phase 98 D-18 idiom.

---

### `el-templo-api/src/db/schema/users.ts` (model, modify)

**Analog:** self. Add a single nullable column under the existing column list (after `branchId`, before `level`). Match the existing varchar-with-comment style:

```typescript
// Phase 110: Country of management for staff with country-wide scope (admin/gestion).
// NULL for owner (global access by role), member, coach, recepción.
// Authoritative source for `attachCountryScope` for admin/gestion (replaces
// JOIN to branches.country).
country: varchar("country", { length: 2 }),
```

**Documentation update:** prepend a comment block above `branchId` (line 63-65) clarifying that branch_id is now "sede personal de entrenamiento" per REQ-4, distinct from the operational scope tables.

---

### `el-templo-api/src/db/schema/user-branches.ts` (model, NEW)

**Analog:** `el-templo-api/src/db/schema/blog-tags.ts` (`blogPostTags` table, lines 17-29) for the join-table shape, plus `el-templo-api/src/db/schema/session-blocks.ts` (line 11) for `onDelete: 'cascade'` pattern.

**Important pattern deviation:** The codebase **does not use composite primary keys** anywhere — every join table uses `id` autoincrement + `uniqueIndex` on the natural key. SPEC R2 says `PRIMARY KEY (user_id, branch_id)` but the in-repo convention is `id PRIMARY KEY + UNIQUE INDEX (user_id, branch_id)`. Planner must flag this as a decision: follow SPEC strictly (composite PK) or follow codebase convention (autoincrement id + unique index). Recommend deferring to planner, but every existing junction table chose the latter.

**Pattern excerpt** (`blog-tags.ts` lines 17-29):

```typescript
export const blogPostTags = mysqlTable(
  "blog_post_tags",
  {
    id: int("id").primaryKey().autoincrement(),
    postId: int("post_id").notNull(),
    tagId: int("tag_id").notNull(),
  },
  (table) => [
    uniqueIndex("post_tag_unique").on(table.postId, table.tagId),
    index("idx_post_tags_post_id").on(table.postId),
    index("idx_post_tags_tag_id").on(table.tagId),
  ],
);
```

**FK with cascade pattern** (`session-blocks.ts` line 11):

```typescript
sessionId: int("session_id")
  .notNull()
  .references(() => sessions.id, { onDelete: "cascade" }),
```

**Suggested shape for `user-branches.ts`:**

```typescript
import { mysqlTable, int, uniqueIndex, index } from "drizzle-orm/mysql-core";
import { users } from "./users";
import { branches } from "./branches";

export const userBranches = mysqlTable(
  "user_branches",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    branchId: int("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("user_branch_unique").on(table.userId, table.branchId),
    index("idx_user_branches_user_id").on(table.userId),
    index("idx_user_branches_branch_id").on(table.branchId),
  ],
);
```

(If planner sticks with SPEC's literal composite PK, drop the autoincrement id and use `primaryKey({ columns: [table.userId, table.branchId] })` from `drizzle-orm/mysql-core` — but no in-repo precedent exists, raising migration runner risk.)

---

### `el-templo-api/src/db/migrations/0107_admin_users_by_country.sql` (migration, NEW)

**Analog:** `el-templo-api/src/db/migrations/0091_multi_currency_and_country_scope.sql` (header style + ALTER + defensive UPDATE). Phase 105's `0106_finance_model_replace_payments_debts.sql` (CREATE TABLE structure with FKs + indexes inline). Numbering: `0106` is the latest applied migration → Phase 110 is `0107`.

**Header comment block pattern** (`0091_*.sql` lines 1-16 — explain _what_ + _idempotency_):

```sql
-- Phase 110: Admin users por país + multi-sede staff
-- 1. ALTER users ADD COLUMN country VARCHAR(2) NULL.
-- 2. CREATE TABLE user_branches with FK CASCADE to users + branches.
-- 3. Backfill UPDATE users.country from users → branches JOIN for admin/gestion.
-- 4. Backfill INSERT INTO user_branches from users for coach/recepción.
--
-- Idempotency: the _migrations tracker prevents a successful file from running
-- twice. CREATE TABLE without IF NOT EXISTS surfaces a clear "already exists"
-- error if someone applied SQL outside the tracker. The defensive UPDATE/
-- INSERT IGNORE statements make partial-failure replay safe.
--
-- Note: SQL line comments must NOT contain inline `;` because run-migrations.ts
-- splits on the semicolon BEFORE stripping comments (Phase 103-01 precedent).
```

**ALTER + defensive backfill pattern** (`0091_*.sql` lines 22-41):

```sql
ALTER TABLE users ADD COLUMN country VARCHAR(2) NULL;

UPDATE users
SET country = (SELECT country FROM branches WHERE branches.id = users.branch_id)
WHERE role IN ('admin', 'gestion') AND country IS NULL;
```

**CREATE TABLE with FKs + indexes inline pattern** (`0106_*.sql` lines 19-46):

```sql
CREATE TABLE user_branches (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  branch_id INT NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_user_branches_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_branches_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_user_branch (user_id, branch_id),
  INDEX idx_user_branches_user_id (user_id),
  INDEX idx_user_branches_branch_id (branch_id)
);

INSERT IGNORE INTO user_branches (user_id, branch_id)
SELECT id, branch_id FROM users WHERE role IN ('coach', 'recepcion');
```

---

### `el-templo-api/src/modules/users/routes.ts` (controller, modify)

**Analog:** self. Routes already require OWNER role (lines 26-34). Phase 110 adds `country` and `branchIds: number[]` to the `CreateStaffInput` and `UpdateStaffInput` payloads, and to the JSON Schema in `schemas.ts`.

**JSON Schema additive props pattern** (extend `createStaffSchema` at `schemas.ts` lines 38-75):

```typescript
properties: {
  // ...existing props...
  country: { type: "string", enum: ["AR", "ES"], nullable: true },
  branchIds: { type: "array", items: { type: "integer" }, default: [] },
},
```

**Service-error coercion pattern** (existing 409 in `routes.ts` lines 60-69 — mirror this for the new 400 cardinality errors thrown by `service.ts`):

```typescript
} catch (err: unknown) {
  if (
    err instanceof Error &&
    (err as Error & { statusCode?: number }).statusCode === 400
  ) {
    return reply.code(400).send({ error: err.message });
  }
  if (
    err instanceof Error &&
    (err as Error & { statusCode?: number }).statusCode === 409
  ) {
    return reply.code(409).send({ error: err.message });
  }
  return handleServiceError(err, reply, request.log, "create staff user");
}
```

---

### `el-templo-api/src/modules/users/service.ts` (service, modify)

**Analog:** self. Add cardinality validation per REQ-9 inside `createStaff` (line 59) and `updateStaff` (line 131) before the actual INSERT/UPDATE.

**Throw-with-statusCode pattern** (existing at `service.ts` lines 70-72 + 247-250):

```typescript
const error = new Error("Los roles admin y gestión requieren un país");
(error as Error & { statusCode: number }).statusCode = 400;
throw error;
```

**Cardinality-validation block to add (suggested):**

```typescript
function validateStaffCardinality(input: {
  role: string;
  country?: string | null;
  branchIds?: number[];
}) {
  if ((input.role === "admin" || input.role === "gestion") && !input.country) {
    const e = new Error("Los roles admin y gestión requieren un país");
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }
  if (
    (input.role === "coach" || input.role === "recepcion") &&
    (!input.branchIds || input.branchIds.length === 0)
  ) {
    const e = new Error(
      "Coach y recepción requieren al menos una sede operativa",
    );
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }
  if (input.role === "owner" && input.country) {
    const e = new Error("Owner no puede tener país asignado (acceso global)");
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }
  // member with branchIds rejected at JSON-schema level (members not editable here)
}
```

**user_branches multi-row insert pattern** (no in-repo analog for users module, but match the existing INSERT idiom in `service.ts` lines 98-115 with a follow-up `.insert(schema.userBranches).values([...])` inside the same logical block).

---

### `el-templo-api/src/modules/members/routes.ts:120` (controller, modify `GET /branches`)

**Analog:** self. The current handler (lines 119-130) returns all active branches. Phase 110 D-07 modifies it to filter by `request.scope`.

**Existing pattern to extend** (lines 119-130):

```typescript
fastify.get("/branches", async () => {
  const rows = await fastify.db
    .select({
      id: schema.branches.id,
      name: schema.branches.name,
    })
    .from(schema.branches)
    .where(eq(schema.branches.isActive, true))
    .orderBy(schema.branches.name);
  return { branches: rows };
});
```

**Filter-by-scope shape for the rewrite** (consume `request.scope` like other routes in the same file — lines 161-174):

```typescript
fastify.get("/branches", async (request) => {
  const { isOwner, country, branchIds, role } = request.scope;
  let rows = await fastify.db
    .select({
      id: schema.branches.id,
      name: schema.branches.name,
      country: schema.branches.country,
      isVirtual: schema.branches.isVirtual,
    })
    .from(schema.branches)
    .where(eq(schema.branches.isActive, true))
    .orderBy(schema.branches.name);
  if (isOwner) {
    rows = rows.filter((b) => b.isVirtual || b.country === country);
  } else if (role === "admin" || role === "gestion") {
    rows = rows.filter((b) => b.isVirtual || b.country === country);
  } else if (role === "coach" || role === "recepcion") {
    const allowed = new Set(branchIds);
    rows = rows.filter((b) => b.isVirtual || allowed.has(b.id));
  }
  return {
    branches: rows.map(({ country: _c, isVirtual: _v, ...rest }) => rest),
  };
});
```

(Response shape stays `{ branches: [{id, name}] }` — no breaking change for the admin frontend per CONTEXT — but the country/isVirtual columns are stripped before return to match the existing shape.)

---

### `el-templo-api/src/modules/scheduling/booking-service.ts:142` (service, modify)

**Analog:** self. Single-line bypass per REQ-8.

**Current code** (lines 140-150):

```typescript
if (isBonus) {
  // Multi-branch check: bonuses on a different branch require plan.multiBranch
  if (
    scheduleRow.branchId !== subscription.branchId &&
    !plan?.multiBranch
  ) {
    throw new BadRequestError(
      "No podes reservar clases bonus en otra sucursal con tu plan actual",
    );
  }
```

**Target rewrite** (insert role bypass; the user role is reachable via the surrounding service — booking-service has access to the member row by the `memberId` argument):

```typescript
if (isBonus) {
  // Multi-branch check: bonuses on a different branch require plan.multiBranch
  // Phase 110 REQ-8: staff (role !== 'member') bypass this check entirely.
  if (
    scheduleRow.branchId !== subscription.branchId &&
    !plan?.multiBranch &&
    user.role === "member"
  ) {
    throw new BadRequestError(
      "No podes reservar clases bonus en otra sucursal con tu plan actual",
    );
  }
```

(Planner: confirm that the surrounding scope already loads the user role — if not, add a single `SELECT role FROM users WHERE id=memberId` at the top of `createBooking`.)

---

### `el-templo-api/test/branch-access.test.ts` (test, NEW)

**Analog:** `el-templo-api/test/country-scope.test.ts` (entire file — same RBAC matrix shape).

**Test file header pattern** (`country-scope.test.ts` lines 1-29):

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  createStaffUser,
  cleanAllTestData,
} from "./helpers";
import * as schema from "../src/db/schema";

describe("Branch access — canAccessBranch + requireBranchAccess (Phase 110)", () => {
  let app: FastifyInstance;
  // ... tokens + fixture ids
  beforeAll(async () => {
    app = await createTestApp();
    await cleanAllTestData(app);
    // ... seed AR + ES + virtual branches, plus admin/coach/owner/member for each country
  });
  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });
});
```

**Cross-country 403 test pattern** (mirror `country-scope.test.ts` lines 311-324 for the 403/404 tolerance, but Phase 110 tightens to strict 403 with `code: 'BRANCH_OUT_OF_SCOPE'`):

```typescript
it("AR admin GET /api/admin/<endpoint>?branchId=<ES> returns 403 with BRANCH_OUT_OF_SCOPE", async () => {
  const res = await app.inject({
    method: "GET",
    url: `/api/admin/some-endpoint?branchId=${esBranchId}`,
    headers: { authorization: `Bearer ${arAdminToken}` },
  });
  expect(res.statusCode).toBe(403);
  const body = JSON.parse(res.body) as { code: string };
  expect(body.code).toBe("BRANCH_OUT_OF_SCOPE");
});
```

**Virtual branch bypass test pattern** (`country-scope.test.ts` lines 335-400):

```typescript
it("ES admin GET /api/admin/<endpoint>?branchId=<virtual AR> returns 200", async () => {
  const res = await app.inject({
    method: "GET",
    url: `/api/admin/some-endpoint?branchId=${virtualBranchId}`,
    headers: { authorization: `Bearer ${esAdminToken}` },
  });
  expect(res.statusCode).toBe(200);
});
```

**Required test categories per SPEC AC + REQ-9 (planner produces concrete count):**

1. `canAccessBranch` unit tests (5 categories: owner / admin-gestion same-country / admin-gestion cross-country / coach in branchIds / coach not in branchIds + virtual bypass + branch-not-found).
2. Integration: AR admin → ES branchId → 403 + `BRANCH_OUT_OF_SCOPE`.
3. Integration: ES admin → AR virtual branchId → 200.
4. Integration: coach with `user_branches=[A,B]` → operates on A → 200; on B → 200; on C → 403.
5. Integration: staff (any role !== member) reserves on different branch without `multiBranch` plan → 200 (REQ-8).
6. Integration cardinality: create admin without `country` → 400; create coach with empty `branchIds` → 400; create owner with `country` → 400; create member with `branchIds` → 400 (or rejected at schema level).
7. Integration cardinality success: one valid create per role.

---

### `el-templo-admin/src/pages/UsuariosPage.vue` (component, modify)

**Analog:** self. Existing form already uses conditional fields (`v-if="needsBranch"` at line 119). Phase 110 adds two new conditional sections.

**Existing conditional-field pattern** (lines 118-130 + 192-193):

```vue
<q-select
  v-if="needsBranch"
  v-model="form.branchId"
  label="Sede"
  :options="branches"
  option-value="id"
  option-label="name"
  emit-value
  map-options
  outlined
  dense
  :rules="[(v: number | null) => v !== null || 'Requerido']"
/>
```

```typescript
const BRANCH_ROLES = new Set(["admin", "coach", "gestion", "recepcion"]);
const needsBranch = computed(() => BRANCH_ROLES.has(form.value.role));
```

**Pattern to copy for new conditionals (Phase 110):**

```typescript
const COUNTRY_ROLES = new Set(["admin", "gestion"]);
const OPERATIONAL_BRANCH_ROLES = new Set(["coach", "recepcion"]);
const needsCountry = computed(() => COUNTRY_ROLES.has(form.value.role));
const needsOperationalBranches = computed(() =>
  OPERATIONAL_BRANCH_ROLES.has(form.value.role),
);

const countryOptions = [
  { label: "Argentina", value: "AR" },
  { label: "España", value: "ES" },
];
```

**Country select** (mirror existing q-select at lines 108-117):

```vue
<q-select
  v-if="needsCountry"
  v-model="form.country"
  label="País"
  :options="countryOptions"
  emit-value
  map-options
  outlined
  dense
  :rules="[(v: string | null) => !!v || 'Requerido']"
/>
```

**Multi-select de sedes operativas** (q-select with `multiple` — same Quasar idiom as the existing branch select but with `multiple` + `use-chips` + `:options="branches"` filtered to the country chosen). Existing `loadBranches()` (lines 285-295) returns the scope-filtered list — no extra filtering needed once REQ-12 ships.

```vue
<q-select
  v-if="needsOperationalBranches"
  v-model="form.branchIds"
  label="Sedes operativas"
  :options="branches"
  option-value="id"
  option-label="name"
  emit-value
  map-options
  multiple
  use-chips
  outlined
  dense
  :rules="[(v: number[]) => (Array.isArray(v) && v.length > 0) || 'Requerido al menos una sede']"
/>
```

**Form state init pattern** (extend `resetForm` at lines 301-311):

```typescript
form.value = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  role: "" as string,
  branchId: null as number | null,
  country: null as "AR" | "ES" | null,
  branchIds: [] as number[],
};
```

---

### `el-templo-admin/src/composables/useUsersApi.ts` (composable, modify)

**Analog:** self. Pure type-extension change.

**Existing types** (lines 19-35):

```typescript
export interface CreateStaffInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: "coach" | "admin" | "owner" | "gestion" | "recepcion";
  branchId: number;
}

export interface UpdateStaffInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  role?: "coach" | "admin" | "owner" | "gestion" | "recepcion";
  branchId?: number;
}
```

**Extension pattern (additive — Phase 98 D-18 idiom on the frontend side):**

```typescript
export interface CreateStaffInput {
  // ...existing fields
  country?: "AR" | "ES" | null;
  branchIds?: number[];
}

export interface UpdateStaffInput {
  // ...existing fields
  country?: "AR" | "ES" | null;
  branchIds?: number[];
}

export interface StaffUser {
  // ...existing fields
  country: "AR" | "ES" | null;
  branchIds: number[];
}
```

---

### `el-templo-admin/src/composables/useMembersApi.ts:287` (composable, no API change)

**Analog:** self. The `getBranches()` function (lines 283-295) makes the same `GET /admin/members/branches` call — backend filtering (D-07) is transparent. No change needed beyond updating the TS comment that documents the new scope behavior.

---

### Other admin pages consuming `loadBranches()` (no code change)

`CajaPage.vue`, `ReportesPage.vue`, `AlumnosPage.vue`, `AnaliticasPage.vue`, `ChangeFixedSchedulesDialog.vue` — all consume the same composable. Per CONTEXT integration-points, **no code change required** in these files for REQ-12; the backend filter at `members/routes.ts:120` is the single seam.

Planner: validate this assumption per page (run grep for `getBranches()` + `loadBranches()` in admin app to confirm 100% of selector consumers go through the composable, not direct `api.get` calls).

---

## Shared Patterns

### Authentication + role gate + country-scope as preHandler

**Source:** `el-templo-api/src/modules/finance/routes.ts` lines 56-67 (canonical).

**Apply to:** all admin routes that should also receive scope. Phase 110 reuses unchanged.

```typescript
fastify.addHook("onRequest", async (request, reply) => {
  await fastify.authenticate(request, reply);
  if (!(FINANCE_READ_ROLES as readonly string[]).includes(request.user.role)) {
    return reply.code(403).send({
      error: "Acceso denegado",
      message: "Acceso requerido",
    });
  }
  await attachCountryScope(request, fastify.db);
});
```

### Per-route `requireBranchAccess` registration

**Source:** new — Phase 110 introduces the pattern. Apply per route inside admin/finance/scheduling/reports plugins where the route consumes a `branchId`.

```typescript
fastify.get<{ Querystring: { branchId?: number } }>(
  "/foo",
  {
    schema: fooSchema,
    preHandler: [requireBranchAccess({ from: "query.branchId" })],
  },
  async (request) => {
    /* ... */
  },
);
```

**Lookup table for `from`:**

| Route convention       | `from` value        |
| ---------------------- | ------------------- |
| `?branchId=` query     | `'query.branchId'`  |
| `:branchId` path param | `'params.branchId'` |
| body field `branchId`  | `'body.branchId'`   |

**Endpoints that need `requireBranchAccess` (planner produces concrete list during plan-phase):** all under `/api/admin/*`, `/api/finance/*`, `/api/reports/*`, `/api/scheduling/*` admin that accept a `branchId`. Grep: `grep -rn "branchId" el-templo-api/src/modules/{admin,finance,reports,scheduling}/routes.ts member` to enumerate.

### Service-level cross-country data validation (coexists with preHandler)

**Source:** `el-templo-api/src/modules/finance/routes.ts` lines 94-119 (already-existing pattern — D-03 says preHandler + service guards coexist).

```typescript
// Pre-handler: 403 (permission)
// Service: 400 (data inconsistency)
if (!request.scope.isOwner) {
  const [branchRow] = await fastify.db
    .select({
      id: schema.branches.id,
      country: schema.branches.country,
      isVirtual: schema.branches.isVirtual,
    })
    .from(schema.branches)
    .where(eq(schema.branches.id, request.body.branchId))
    .limit(1);
  if (!branchRow) {
    return reply
      .code(404)
      .send({ error: "No encontrado", message: "Sucursal no encontrada" });
  }
  if (!branchRow.isVirtual && branchRow.country !== request.scope.country) {
    return reply
      .code(403)
      .send({
        error: "Acceso denegado",
        message: "No tienes permiso sobre esta sucursal",
      });
  }
}
```

(Once Phase 110 ships, the inline branch-country comparison block can be replaced by a `requireBranchAccess({from:'body.branchId'})` preHandler. Plan-phase decides whether existing inline checks get migrated or left as belt-and-suspenders.)

### Test integration setup (per-worker DB + cleanAllTestData)

**Source:** `el-templo-api/test/helpers.ts` lines 22-26 + 184-207 + `country-scope.test.ts` lines 48-182 (canonical fixture seed).

**Apply to:** all new integration tests. `cleanAllTestData(app)` must include `userBranches` in the cleanup table list (modify `helpers.ts` lines 125-182).

### Quasar form conditional fields by reactive role

**Source:** `el-templo-admin/src/pages/UsuariosPage.vue` lines 192-193 + 119-130.

**Apply to:** new country/branchIds conditional sections. Pattern is `Set` of allowed roles + `computed` predicate + `v-if` on the field.

---

## No Analog Found

No file group lacks an analog. Every Phase 110 file has a strong in-repo precedent.

**Pattern caveat (not a missing analog, but planner must decide):**

| Concern                                  | Issue                                                                                                     | Recommendation                                                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Composite primary key on `user_branches` | SPEC R2 says `PRIMARY KEY (user_id, branch_id)`; codebase uses `id PRIMARY KEY + UNIQUE INDEX` everywhere | Default to codebase convention (`id` autoincrement + unique index). Planner must surface this choice in 110-PLAN as it deviates from SPEC literal text. |
| Composite-PK Drizzle helper              | No in-repo precedent for `primaryKey({ columns })` from `drizzle-orm/mysql-core`                          | If planner chooses literal SPEC composite PK, validate the migration runner accepts the resulting DDL.                                                  |

---

## Metadata

**Analog search scope:**

- `el-templo-api/src/modules/{shared,users,members,finance,subscriptions,scheduling,analytics,reports,attendance,gladius,settings,onboarding,admin}/`
- `el-templo-api/src/db/schema/`
- `el-templo-api/src/db/migrations/`
- `el-templo-api/test/`
- `el-templo-admin/src/{pages,components,composables}/`

**Files scanned:** ~25 (sufficient — early-stop reached at strong matches).

**Pattern extraction date:** 2026-04-30
