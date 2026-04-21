# Phase 98: Multi-currency and country-scoped plans — Pattern Map

**Mapped:** 2026-04-21
**Files analyzed:** 27 new/modified files
**Analogs found:** 26 / 27 (one new utility has mirror analog in the other app)

All excerpts are verbatim from the codebase. Executor agents should copy these shapes as the starting template for new code.

---

## File Classification

### Server (el-templo-api)

| File                                                                                   | Status     | Role                    | Data Flow        | Closest Analog                                                                                       | Match                |
| -------------------------------------------------------------------------------------- | ---------- | ----------------------- | ---------------- | ---------------------------------------------------------------------------------------------------- | -------------------- |
| `src/db/schema/subscription-plans.ts`                                                  | MODIFY     | schema                  | —                | (self — add two columns)                                                                             | exact                |
| `src/db/schema/subscriptions.ts`                                                       | MODIFY     | schema                  | —                | (self — add one column)                                                                              | exact                |
| `src/db/schema/payments.ts`                                                            | MODIFY     | schema                  | —                | (self — add one column)                                                                              | exact                |
| `src/db/schema/promo-plans.ts`                                                         | MODIFY     | schema                  | —                | (self — add one column)                                                                              | exact                |
| `src/db/schema/gladius-products.ts`                                                    | MODIFY     | schema                  | —                | (self — add one column)                                                                              | exact                |
| `src/db/migrations/0069_multi_currency_and_country_scope.sql`                          | NEW        | migration               | DDL + seed       | `src/db/migrations/0087_widen_branch_code_and_fix_chapadmalal.sql`                                   | role-match           |
| `src/modules/shared/country-scope.ts`                                                  | NEW        | middleware / preHandler | request-response | `src/plugins/auth.ts` (decorate pattern) + `src/modules/scheduling/holiday-service.ts` (country SQL) | role-match composite |
| `src/modules/subscriptions/routes.ts`                                                  | MODIFY     | route plugin            | request-response | (self — register hook)                                                                               | exact                |
| `src/modules/subscriptions/member-routes.ts`                                           | MODIFY     | route plugin            | request-response | (self — scope `/plans`)                                                                              | exact                |
| `src/modules/subscriptions/service.ts` (`assignPlan`, `changePlan`)                    | MODIFY     | service                 | CRUD             | (self — add country guard alongside the existing category guard at line ~508)                        | exact                |
| `src/modules/members/routes.ts`                                                        | MODIFY     | route plugin            | request-response | (self — cross-country 400 mirrors duplicate-DNI 409 at line ~363)                                    | exact                |
| `src/modules/payments/routes.ts`                                                       | MODIFY     | route plugin            | request-response | (self — register hook)                                                                               | exact                |
| `src/modules/payments/service.ts` (`recordPayment`)                                    | MODIFY     | service                 | CRUD             | (self — add currency guard after subscription lookup at line 52)                                     | exact                |
| `src/modules/reports/routes.ts`                                                        | MODIFY     | route plugin            | request-response | (self — register hook + Excel `currency` column)                                                     | exact                |
| `src/modules/reports/service.ts`                                                       | MODIFY     | service                 | CRUD             | (self — country branch at lines 225/266/372/407/440)                                                 | exact                |
| `src/modules/analytics/routes.ts`                                                      | MODIFY     | route plugin            | request-response | (self — mirror reports/routes.ts registration)                                                       | exact                |
| `src/modules/analytics/service.ts`                                                     | MODIFY     | service                 | CRUD             | `reports/service.ts` (same filter pattern)                                                           | exact                |
| `src/modules/gladius/routes.ts`                                                        | MODIFY     | route plugin            | request-response | (self — register hook; mirror members/routes.ts)                                                     | exact                |
| `test/subscriptions/subscriptions.test.ts` (extend) + new `test/country-scope.test.ts` | NEW/MODIFY | integration test        | request-response | `test/subscriptions/subscriptions.test.ts`                                                           | exact                |

### Admin (el-templo-admin)

| File                                                  | Status | Role           | Analog                                                                                   | Match                                                     |
| ----------------------------------------------------- | ------ | -------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `src/utils/format-price.ts`                           | NEW    | utility        | `src/utils/extract-error.ts`                                                             | role-match (same "~20-line pure util with named exports") |
| `src/composables/useMembersApi.ts` (`getPlans`)       | MODIFY | composable     | (self — add `branchId` param)                                                            | exact                                                     |
| `src/composables/useSubscriptionsApi.ts` (`getPlans`) | MODIFY | composable     | (self — add `country` param)                                                             | exact                                                     |
| `src/pages/PlanesPage.vue`                            | MODIFY | page           | (self + `CajaPage.vue` QSelect pattern at lines 98-107)                                  | exact                                                     |
| `src/components/MemberFormDialog.vue`                 | MODIFY | form component | (self — line 625 plan fetch, line 545 inline price)                                      | exact                                                     |
| `src/components/AssignPlanDialog.vue`                 | MODIFY | form component | (self — line 812 plan fetch, lines 43/173/184/346/427/456 price displays)                | exact                                                     |
| `src/components/PlanFormDialog.vue`                   | MODIFY | form component | (self — line 88 weekly price, country QSelect addition)                                  | exact                                                     |
| `src/components/MemberSubscriptionTab.vue`            | MODIFY | component      | (self — lines 166/295 price displays)                                                    | exact                                                     |
| `src/components/SubscriptionCard.vue`                 | MODIFY | component      | (self — line 102 price display)                                                          | exact                                                     |
| `src/pages/CajaPage.vue`                              | MODIFY | page           | (self — lines 23-71 summary displays, 174/267/539 amount displays, 98 QSelect reference) | exact                                                     |
| `src/pages/ReportesPage.vue`                          | MODIFY | page           | (self + `CajaPage.vue` pattern)                                                          | exact                                                     |
| `src/pages/AnaliticasPage.vue`                        | MODIFY | page           | `CajaPage.vue`                                                                           | exact                                                     |
| `src/components/analytics/FinanzasTab.vue`            | MODIFY | component      | `CajaPage.vue` QSelect pattern                                                           | role-match                                                |

### Member app (el-templo-app)

| File                                    | Status | Role    | Analog                                                                               | Match |
| --------------------------------------- | ------ | ------- | ------------------------------------------------------------------------------------ | ----- |
| `src/utils/format-price.ts`             | NEW    | utility | `el-templo-admin/src/utils/format-price.ts` (sibling) + `src/utils/extract-error.ts` | exact |
| `src/modules/plan/pages/PlanesPage.vue` | MODIFY | page    | (self — line 58 inline price, lines 196-221 weekly price helpers)                    | exact |

---

## Pattern Assignments

### 1. `el-templo-api/src/modules/shared/country-scope.ts` (NEW — preHandler)

**Role:** middleware / preHandler. Decorates `request.scope = { country, isOwner }`.

**Composite analog:** shape of decorator from `src/plugins/auth.ts`; SQL shape from `src/modules/scheduling/holiday-service.ts`.

**Decorate-request pattern** — copy from `src/plugins/auth.ts` lines 12-19:

```typescript
declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}
```

→ For the new file, add:

```typescript
declare module "fastify" {
  interface FastifyRequest {
    scope: { country: "AR" | "ES"; isOwner: boolean };
  }
}
```

**Country lookup SQL** — mirror `holiday-service.ts` lines 41-44:

```typescript
const countryBranches = await this.db
  .select({ id: schema.branches.id })
  .from(schema.branches)
  .where(eq(schema.branches.country, country));
```

→ For the new hook, derive `country` from `request.user.branchId`:

```typescript
const [branch] = await fastify.db
  .select({ country: schema.branches.country })
  .from(schema.branches)
  .where(eq(schema.branches.id, request.user.branchId));
```

**Owner override** — read `OWNER_ROLES` exactly as existing route guards do (see `reports/routes.ts` line 32 and 42):

```typescript
import { OWNER_ROLES } from "../shared/permissions";
// ...
const isOwner = (OWNER_ROLES as readonly string[]).includes(request.user.role);
```

**Integration guidance**

- Export as `attachCountryScope: preHandlerAsyncHookHandler` and an `fp`-wrapped plugin if you need global decoration (see `src/plugins/auth.ts` line 56: `export default fp(authPlugin, { name: "auth" })`). For per-plugin registration, a plain async function is fine.
- Owners sending `?country=AR|ES` honored by the hook; non-owners' query-string `country` ignored (defense in depth per D-02).
- Must run **after** `fastify.authenticate` because it reads `request.user.branchId`. Register as the second `onRequest` hook, or combine into the existing `onRequest` hook block (see pattern in §2 below).

---

### 2. Fastify plugin hook registration (all route files)

**Applies to:** `subscriptions/routes.ts`, `members/routes.ts`, `payments/routes.ts`, `reports/routes.ts`, `analytics/routes.ts`, `gladius/routes.ts`, and any other plugin touched.

**Analog:** `src/modules/payments/routes.ts` lines 34-42 — the canonical `onRequest` block used across every admin-scoped plugin:

```typescript
fastify.addHook("onRequest", async (request, reply) => {
  await fastify.authenticate(request, reply);
  if (!(PAYMENT_ROLES as readonly string[]).includes(request.user.role)) {
    return reply.code(403).send({
      error: "Acceso denegado",
      message: "Acceso de administrador requerido",
    });
  }
});
```

**Integration guidance**

- Add `attachCountryScope(request)` call **after** the existing role-check, same hook, same block. Example shape:

  ```typescript
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(PAYMENT_ROLES as readonly string[]).includes(request.user.role)) {
      return reply
        .code(403)
        .send({
          error: "Acceso denegado",
          message: "Acceso de administrador requerido",
        });
    }
    await attachCountryScope(request);
  });
  ```

- `members/routes.ts` lines 84-92 is identical in shape — reuse the same modification there.
- `subscriptions/routes.ts` lines 74-84 is identical.
- `reports/routes.ts` lines 40-48 is identical.
- **Do not** introduce a second `addHook`; keep one block per plugin (matches existing convention).

---

### 3. Service-layer cross-country / cross-currency validation

**Applies to:** `subscriptions/service.ts` (`assignPlan`, `changePlan`, `renewSubscription`) and `payments/service.ts` (`recordPayment`).

**Analog:** existing guards inside `assignPlan` at `src/modules/subscriptions/service.ts` lines 489-535 — they throw `NotFoundError` / `BadRequestError` / `ConflictError` from `../shared/errors`, which `handleServiceError` maps to 404/400/409 responses.

**Excerpt (self, lines 489-502):**

```typescript
if (!member) {
  throw new NotFoundError("Miembro no encontrado");
}

// Validate plan exists and is active
const plan = await this.getPlanById(input.planId);
if (!plan) {
  throw new NotFoundError("Plan no encontrado");
}
if (!plan.isActive) {
  throw new BadRequestError("El plan seleccionado no esta activo");
}
if (plan.isArchived) {
  throw new BadRequestError("No se puede asignar un plan archivado");
}
```

**Member branch lookup to enable country check** — `assignPlan` already fetches `member.branchId` at lines 480-487:

```typescript
const [member] = await this.db
  .select({
    id: schema.users.id,
    branchId: schema.users.branchId,
    boardingPassUsed: schema.users.boardingPassUsed,
  })
  .from(schema.users)
  .where(eq(schema.users.id, userId));
```

→ Extend this select to also pull `branchCountry: schema.branches.country` with an `innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))`, then add immediately after the `plan.isArchived` check:

```typescript
if (plan.country !== member.branchCountry) {
  throw new BadRequestError("El plan no corresponde al pais de la sucursal");
}
```

**For `recordPayment`** — same approach at `payments/service.ts` lines 52-59 where the subscription is already fetched. Extend the select to include `currency: schema.subscriptions.currency` and add:

```typescript
if (sub.currency !== input.currency) {
  throw new BadRequestError(
    "No puedes registrar un pago en una moneda distinta a la suscripcion",
  );
}
```

**Route-level error mapping** — already handled by `handleServiceError` in `subscriptions/routes.ts` line 173 / 243 / 286 (`handleServiceError(err, reply, request.log, "...")`). No new catch blocks needed. `BadRequestError` → HTTP 400 with `{ error, message }` shape.

**Duplicate-DNI template for routes that bypass `handleServiceError`** — `members/routes.ts` lines 358-377 (the reference the CONTEXT calls out):

```typescript
} catch (err: unknown) {
  const { isDuplicate, detail } = isDuplicateKeyError(err);
  if (isDuplicate) {
    if (detail.includes("email")) {
      return reply.code(409).send({
        error: "Conflicto",
        message: "El email ya esta registrado",
      });
    }
    // ...
  }
  request.log.error({ err }, "Error creating member");
  return reply.code(500).send({
    error: "Error del servidor",
    message: "Error al crear miembro",
  });
}
```

→ Cross-country 400 response uses exactly the same `{ error, message }` shape, swapping to status 400 and the Spanish error copy per SPEC Requirement 6. Do **not** throw through `handleServiceError` when you already have an explicit 400; be explicit and return inline.

---

### 4. Migration SQL — `0069_multi_currency_and_country_scope.sql`

**Analog:** `src/db/migrations/0087_widen_branch_code_and_fix_chapadmalal.sql` lines 1-32 (most recent manual SQL with ALTER + UPDATE + idempotent INSERTs).

**Excerpt (self, lines 1-12):**

```sql
-- Widens branches.code from varchar(10) to varchar(20) and converges
-- Chapadmalal across envs. 0086 failed on prod (strict mode) and silently
-- truncated on staging ("CHAPADMALA"), so this migration:
--   1. widens the column
--   2. fixes the truncated code on staging (no-op on prod)
--   3. idempotently inserts the branch + schedules (no-op on staging, fires on prod)

ALTER TABLE branches MODIFY code VARCHAR(20) NOT NULL;

UPDATE branches SET code = 'CHAPADMALAL' WHERE code = 'CHAPADMALA';

INSERT IGNORE INTO branches (name, code, max_capacity) VALUES ('El Templo Chapadmalal', 'CHAPADMALAL', 8);
```

**Integration guidance (0069):**

- Header comment block: document the three sections (ALTERs, backfill, ES seed) and the all-or-nothing atomic expectation. Atomicity is **not** from a `BEGIN/COMMIT` wrapper — MySQL's DDL is implicitly auto-commit per statement — it's from relying on the migration runner (`run-migrations.ts`) to record success/failure per file. If any statement fails, the file is not marked applied; re-run will retry everything. Use `INSERT IGNORE` / `UPDATE … WHERE currency IS NULL` for idempotency so a partial prior run is safe to re-run.
- ALTER columns in this exact order to minimize downtime on larger tables:
  ```sql
  ALTER TABLE subscription_plans ADD COLUMN country VARCHAR(2) NOT NULL DEFAULT 'AR';
  ALTER TABLE subscription_plans ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'ARS';
  ALTER TABLE subscriptions     ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'ARS';
  ALTER TABLE payments          ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'ARS';
  ALTER TABLE promo_plans       ADD COLUMN country  VARCHAR(2) NOT NULL DEFAULT 'AR';
  ALTER TABLE gladius_products  ADD COLUMN country  VARCHAR(2) NOT NULL DEFAULT 'AR';
  ```
  The `NOT NULL DEFAULT` backfills existing rows inline — no separate `UPDATE` is needed for the defaults. A defensive `UPDATE ... WHERE currency IS NULL` is still worth adding for belt-and-suspenders.
- ES seed block: 12 `INSERT` rows with exact prices (cents) per SPEC Requirement 4. Cross-reference the plan category/tier already present on AR rows by querying `SELECT * FROM subscription_plans WHERE name LIKE 'Flex%' AND country='AR' LIMIT 1` before writing — copy their `plan_tier`, `booking_mode`, `plan_category`, `duration_days`, `classes_per_week` onto the ES rows so enum/shape validity is preserved.

**Schema-file update (same PR, per D-15):** update all 5 Drizzle schema files to reflect the new columns.

Example diff for `subscription-plans.ts` (add after `isArchived`, before `createdAt`, lines 47-48):

```typescript
country: varchar("country", { length: 2 }).default("AR").notNull(),
currency: varchar("currency", { length: 3 }).default("ARS").notNull(),
```

Same `varchar` import already used in the file. Pattern identical to `branches.ts` line 19 (`country: varchar("country", { length: 2 }).default("AR").notNull()`).

---

### 5. Reports service country filter

**Analog:** `src/modules/reports/service.ts` lines 220-227 (inside `getExpiringMemberships`) and lines 402-432 (`buildChargeConditions`).

**Excerpt (self, lines 402-432):**

```typescript
private buildChargeConditions(
  filters: ChargeReportFilters,
): ReturnType<typeof sql>[] {
  const conditions: ReturnType<typeof sql>[] = [sql`1 = 1`];

  if (filters.branchId !== undefined) {
    conditions.push(eq(schema.users.branchId, filters.branchId));
  }

  if (filters.dateFrom) {
    conditions.push(
      sql`${schema.payments.paymentDate} >= ${filters.dateFrom}`,
    );
  }
  // ...
}
```

**Raw-SQL variant at lines 435-455 (`buildChargeConditionsRaw`):**

```typescript
if (filters.branchId !== undefined) {
  parts.push(sql`m.branch_id = ${filters.branchId}`);
}
```

**Integration guidance**

- Extend `AccessReportFilters`, `ChargeReportFilters`, `ExpiringReportFilters`, `InactiveReportFilters` (in `reports/types.ts`) with `country?: "AR" | "ES"`.
- In every `buildXxxConditions` method, add alongside the existing `branchId` block:
  ```typescript
  if (filters.country !== undefined) {
    conditions.push(eq(schema.branches.country, filters.country));
  }
  ```
  This requires the queries to already join `branches`. `getExpiringMemberships` (line 239-246) and `getChargeHistory`/`getInactiveMembers` currently join `users` → add `.innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))` where missing.
- For the raw-SQL `buildChargeConditionsRaw`, mirror:
  ```sql
  AND b.country = 'AR'
  ```
  with a join on `branches b ON b.id = m.branch_id` added to the parent query text. Line 278-283 shows where raw SQL joins live — add the `branches b` join there.
- Route layer: `reports/routes.ts` — plumb `request.scope.country` into the filters object. For owner, this is the `?country=` value (already honored by the preHandler). For non-owner, it's auto-derived from branch.

---

### 6. Excel export with `currency` column

**Analog:** `src/modules/reports/routes.ts` lines 230-257 (charge-history Excel export).

**Excerpt:**

```typescript
const workbook = new Workbook();
workbook.creator = "El Templo";
workbook.created = new Date();
const sheet = workbook.addWorksheet("Cobros");

sheet.columns = [
  { header: "Fecha", key: "paymentDate", width: 15 },
  { header: "Miembro", key: "memberName", width: 30 },
  { header: "Plan", key: "planName", width: 25 },
  { header: "Monto", key: "amount", width: 12 },
  { header: "Metodo", key: "paymentMethod", width: 15 },
  { header: "Registro", key: "recorderName", width: 25 },
  { header: "Estado", key: "estado", width: 12 },
];

styleHeaderRow(sheet);

for (const row of rows) {
  sheet.addRow({
    paymentDate: row.paymentDate,
    memberName: row.memberName,
    planName: row.planName,
    amount: row.amount,
    paymentMethod: row.paymentMethod,
    recorderName: row.recorderName,
    estado: row.voidedAt ? "ANULADO" : "Normal",
  });
}
```

**Integration guidance (D-13: currency column on every row):**

- Add `{ header: "Moneda", key: "currency", width: 10 }` immediately after the "Monto" column so it reads naturally.
- Ensure the matching `exportChargeHistory` service method SELECTs `payments.currency` and passes it through on each row object.
- Repeat for `exportExpiringMemberships` (at lines 285+) and any other export. For members/routes.ts `/export` at lines 138-192, no currency column needed (member list is not financial).
- Member-level Excel at `members/routes.ts` lines 154-166 shows the identical `sheet.columns` pattern — mirror its shape.

---

### 7. `format-price.ts` utility (NEW in both apps)

**Analog:** `el-templo-admin/src/utils/extract-error.ts` — tiny (~25 lines), two named exports, JSDoc on each, no external deps beyond the native runtime.

**Excerpt (self, `extract-error.ts` lines 1-25):**

```typescript
import axios from "axios";

/**
 * Extract a user-friendly error message from an Axios error or unknown error.
 * Returns the server-provided message if available, otherwise the fallback.
 */
export function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const message = err.response?.data?.message ?? err.response?.data?.error;
    if (typeof message === "string") return message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

/**
 * True for user-correctable HTTP errors (4xx with a response): validation,
 * conflicts, not-found, etc. These should not be logged to Sentry as errors.
 */
export function isExpectedClientError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  const status = err.response?.status;
  return typeof status === "number" && status >= 400 && status < 500;
}
```

**Integration guidance (target `format-price.ts`):**

```typescript
export type Currency = "ARS" | "EUR";

/**
 * Format a whole-unit monetary amount with the correct currency symbol
 * and locale. Amounts are stored as ints in the DB (whole currency units).
 *
 * ARS uses es-AR (e.g., $1.500), EUR uses es-ES (e.g., €70).
 */
export function formatPrice(amount: number, currency: Currency): string {
  const locale = currency === "EUR" ? "es-ES" : "es-AR";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(amount);
}
```

- **Admin file** uses semicolons (matches `extract-error.ts`); **member app file** omits them (matches `el-templo-app/src/utils/extract-error.ts`, which is no-semicolon). This mirrors the existing formatting convention in each app's Prettier config.
- Duplicate file across the two apps per D-07; do not invent a pnpm workspace package.
- Export the `Currency` type — consumers (AssignPlanDialog pricing, MemberSubscriptionTab) need it for type-narrowing on plan/subscription rows.

---

### 8. Price display migration (frontend, admin + member app)

**Applies to:** every inline `${x.toLocaleString()}` found across these files:

- `el-templo-admin/src/pages/PlanesPage.vue` lines 71, 165
- `el-templo-admin/src/components/MemberFormDialog.vue` line 545
- `el-templo-admin/src/components/AssignPlanDialog.vue` lines 43, 173, 178, 184, 323, 330, 346, 367, 427, 456, 462
- `el-templo-admin/src/components/MemberSubscriptionTab.vue` lines 166, 295
- `el-templo-admin/src/components/SubscriptionCard.vue` line 102
- `el-templo-admin/src/components/PlanFormDialog.vue` line 88
- `el-templo-admin/src/pages/CajaPage.vue` lines 23, 39, 55, 71, 174, 267, 539
- `el-templo-admin/src/pages/ReportesPage.vue` (see line 819 — column def for `amount`)
- `el-templo-admin/src/pages/AnaliticasPage.vue` (grep for `toLocaleString`)
- `el-templo-admin/src/components/analytics/FinanzasTab.vue` (revenue charts — currency-aware axis labels)
- `el-templo-app/src/modules/plan/pages/PlanesPage.vue` line 58 (template), lines 196-221 (TS helpers `buildWhatsAppMessage` / weekly-price computation)

**Current pattern (self, admin `PlanesPage.vue` line 71):**

```html
<q-td :props="props"> ${{ props.row.priceRegular.toLocaleString() }} </q-td>
```

**Target pattern:**

```html
<q-td :props="props"
  >{{ formatPrice(props.row.priceRegular, props.row.currency) }}</q-td
>
```

**Current pattern (self, `MemberFormDialog.vue` line 545):**

```typescript
label: `${p.name} — $${p.priceRegular.toLocaleString()}`,
```

**Target pattern:**

```typescript
label: `${p.name} — ${formatPrice(p.priceRegular, p.currency)}`,
```

**Current pattern (self, `el-templo-app/src/modules/plan/pages/PlanesPage.vue` line 58):**

```html
<q-badge v-if="exp.price != null" outline color="primary"
  >${{ exp.price.toLocaleString() }}</q-badge
```

**Target pattern:**

```html
<q-badge v-if="exp.price != null" outline color="primary"
  >{{ formatPrice(exp.price, exp.currency ?? 'ARS') }}</q-badge
```

Use the `?? 'ARS'` fallback per D-19 — needed only in the member app for rows that may still come from older cached API responses. Admin app has no such fallback need (same-session data, always fresh).

---

### 9. QSelect dropdown (Argentina/España)

**Analog:** `src/pages/CajaPage.vue` lines 97-107.

**Excerpt:**

```html
<div class="col-6 col-sm-2">
  <q-select
    v-model="filters.branchId"
    :options="branchFilterOptions"
    label="Sucursal"
    dense
    outlined
    emit-value
    map-options
    @update:model-value="onFilterChange"
  />
</div>
```

**Richer analog (multiple QSelect in a form):** `src/components/MemberFormDialog.vue` lines 22, 44 (documentType & gender selects with identical props).

**Target shape for the country selector (add at top of PlanesPage, CajaPage, ReportesPage, AnaliticasPage, FinanzasTab):**

```html
<q-select
  v-if="isOwner"
  v-model="selectedCountry"
  :options="countryOptions"
  label="Pais"
  dense
  outlined
  emit-value
  map-options
  @update:model-value="onCountryChange"
/>
```

```typescript
const countryOptions = [
  { label: "Argentina", value: "AR" },
  { label: "España", value: "ES" },
];
const selectedCountry = ref<"AR" | "ES">("AR"); // Default Argentina (D-06)
```

**Integration guidance**

- `isOwner` check: owners use the existing auth store. Pattern for role check in admin is `authStore.user?.role === 'owner'` — grep for `role === 'owner'` in existing pages (e.g., `UsuariosPage.vue`) to copy exact shape.
- Per D-12, do **not** add a currency badge column. Single-country view = single currency.
- `onCountryChange`: re-fetches data by passing `country` query param to the API. All admin composables that wrap these API calls (useSubscriptionsApi.getPlans, reports API, analytics API) must gain an optional `country` parameter.

---

### 10. Composables — `getPlans` with branch/country filter

**Analog:** `el-templo-admin/src/composables/useMembersApi.ts` lines 201-215.

**Excerpt:**

```typescript
async function getPlans(includeArchived = false): Promise<PlanOption[]> {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await api.get<{ plans: PlanOption[] }>(
      "/admin/subscriptions/plans",
      {
        params: {
          isActive: true,
          ...(includeArchived ? { includeArchived: true } : {}),
        },
      },
    );
    return data.plans;
  } catch (err: unknown) {
    error.value = extractError(err, "Error cargando planes");
    throw err;
  } finally {
    loading.value = false;
  }
}
```

**Target shape:**

```typescript
async function getPlans(
  includeArchived = false,
  opts?: { branchId?: number; country?: "AR" | "ES" },
): Promise<PlanOption[]> {
  loading.value = true;
  error.value = null;
  try {
    const params: Record<string, unknown> = { isActive: true };
    if (includeArchived) params.includeArchived = true;
    if (opts?.branchId !== undefined) params.branchId = opts.branchId;
    if (opts?.country !== undefined) params.country = opts.country;
    const { data } = await api.get<{ plans: PlanOption[] }>(
      "/admin/subscriptions/plans",
      { params },
    );
    return data.plans;
  } catch (err: unknown) {
    error.value = extractError(err, "Error cargando planes");
    throw err;
  } finally {
    loading.value = false;
  }
}
```

**Integration guidance**

- Update every `getPlans()` call-site (6 places, grep-listed above). Each passes the target member/branch's country — see D-05:
  - `MemberFormDialog.vue` line 625: pass `{ branchId: form.value.branchId }` (depends on selected branch during create).
  - `AssignPlanDialog.vue` line 812: pass `{ branchId: member.branchId }`.
  - `PlanesPage.vue` line 537: pass `{ country: selectedCountry.value }` for owner, omit for non-owner (server derives).
  - `AlumnosPage.vue` line 530: filter depends on UX — usually no scope needed (list context), but if a dropdown filters members by branch, scope by that.
- `PlanOption` interface at `useMembersApi.ts` lines 190-199 — add `currency: 'ARS' | 'EUR'`, `country: 'AR' | 'ES'` fields so the formatPrice migration compiles cleanly.

---

### 11. Integration tests

**Analog:** `test/subscriptions/subscriptions.test.ts` lines 1-50 (setup, imports, `BASE_URL`, `describe`, fixture plan payload).

**Excerpt:**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
// ...
const BASE_URL = "/api/admin/subscriptions";

describe("Subscriptions API", () => {
  let app: FastifyInstance;
  let adminToken: string;

  // Reusable plan payload
  const basePlan = {
    name: "Plan Flex Mensual",
    planTier: "flex",
    bookingMode: "flexible",
    priceRegular: 15000,
    priceZero: 10000,
    durationDays: 30,
    classesPerWeek: 3,
  };
```

**Integration guidance**

- New file: `test/country-scope.test.ts` covering the RBAC matrix and cross-country write validation (Acceptance Criteria in SPEC.md).
- Fixtures needed:
  - An AR branch (id=1 already seeded in test DB), an ES branch inserted in `beforeAll`.
  - An AR admin user, an ES admin user, an owner user. Use `registerUser()` helper for each.
  - One AR plan + one ES plan.
- Test cases (one per Acceptance Criterion, matching SPEC.md requirement 5 and 6):
  1. AR admin GET `/admin/members` → only AR members.
  2. ES admin GET `/admin/subscriptions/plans` → only ES plans.
  3. Owner GET `/admin/subscriptions/plans?country=ES` → only ES plans.
  4. Owner GET `/admin/subscriptions/plans` (no query) → both (or default-AR if that's the UX, confirm in plan).
  5. POST `/admin/subscriptions/members/:id/subscription/assign` with AR plan to ES member → 400 with `"El plan no corresponde…"`.
  6. POST `/admin/members/:id/payments` with EUR currency vs ARS subscription → 400 with `"No puedes registrar un pago…"`.
  7. AR admin GET `/admin/subscriptions/members/:esUserId/subscription` → 403 or empty (decide in planner; 403 is closer to "non-owner cannot read").
- Leverage existing `test/helpers.ts` `registerUser` / `cleanAllTestData` / `getAuthToken` patterns — no new helper infra required.

---

## Shared Patterns

### Authentication + role guard (server-wide)

**Source:** `src/plugins/auth.ts` (decorator) and `src/modules/payments/routes.ts` lines 34-42 (guard hook).
**Apply to:** every route plugin touched in this phase. Existing guard blocks stay unchanged — `attachCountryScope(request)` is appended at the end of the same `onRequest` hook.

### Error shape (`{ error, message }` Spanish copy)

**Source:** `src/modules/members/routes.ts` lines 362-376 (409 duplicate + 500 fallback); `src/modules/subscriptions/routes.ts` line 110 (`{ error: "No encontrado", message: "Plan no encontrado" }`).
**Apply to:** every new cross-country 400 response and every new Spanish error thrown from services via `BadRequestError`. Copy verbatim:

```typescript
return reply.code(400).send({
  error: "Solicitud invalida",
  message: "El plan no corresponde al pais de la sucursal",
});
```

**Service-side counterpart:** `throw new BadRequestError("…")` gets mapped to 400 by `handleServiceError` (see `shared/error-handler.ts`).

### Drizzle country-filter SQL

**Source:** `src/modules/scheduling/holiday-service.ts` line 44: `.where(eq(schema.branches.country, country))`; reusable on users (`schema.users.branchId → schema.branches.country`), subscriptions (via `branchId`), payments (via `subscriptions.branchId → branches.country`).
**Apply to:** every service method that currently checks `filters.branchId` (reports/service.ts lines 225/266/372/407/440, analytics/service.ts, etc.). Always join `branches` on the branch-id-owning table.

### Frontend error-surface (Sentry-noise guard)

**Source:** `el-templo-admin/src/utils/extract-error.ts` `isExpectedClientError` (added earlier this session).
**Apply to:** every new admin catch block that surfaces a cross-country 400. Pattern:

```typescript
} catch (err: unknown) {
  if (isExpectedClientError(err)) {
    log.warn('Cross-country validation rejected', { ... });
  } else {
    log.error('Unexpected error', { err });
  }
  $q.notify({ type: 'negative', message: extractError(err, 'Error'), timeout: 5000 });
}
```

Per D-17, keep the dialog open after the notification so the admin can correct.

### QSelect + emit-value+map-options props

**Source:** `src/components/MemberFormDialog.vue` lines 22-44 (documentType/gender), `src/pages/CajaPage.vue` lines 98-118 (branch/method filters).
**Apply to:** every new country dropdown and every new owner-only filter.

### Excel export convention

**Source:** `src/modules/reports/routes.ts` lines 230-257 + `members/routes.ts` lines 149-192.
**Apply to:** all financial exports in this phase — currency column added after Monto.

---

## No Analog Found

None. Every file touched has a close analog; the two new `format-price.ts` files mirror `extract-error.ts` shape and mirror each other.

## Metadata

**Analog search scope:**

- `el-templo-api/src/modules/{members,subscriptions,payments,reports,analytics,scheduling,gladius}/`
- `el-templo-api/src/db/{schema,migrations}/`
- `el-templo-api/src/plugins/`
- `el-templo-api/test/{subscriptions,members,helpers.ts}/`
- `el-templo-admin/src/{pages,components,composables,utils,boot}/`
- `el-templo-app/src/{modules/plan,utils}/`

**Files scanned:** ~45 files read or grepped across the three apps.
**Pattern extraction date:** 2026-04-21.
