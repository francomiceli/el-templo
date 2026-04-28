# Phase 106: Endpoints Transaccionales — Pattern Map

**Mapped:** 2026-04-28
**Files analyzed:** 11 (5 new, 6 modified)
**Analogs found:** 11 / 11

---

## Pre-flight Note: Schema Format

**CONTEXT.md mentioned "Zod schemas" — this is imprecise.** The API has **zero Zod usage** (`grep -rln "zod" el-templo-api/src/modules/` returns nothing). The established pattern is **Fastify JSON Schema** with `as const` literals (see `reports/schemas.ts`). The planner MUST follow the JSON Schema pattern, not introduce Zod.

---

## File Classification

| New / Modified File                                                           | Role                        | Data Flow                     | Closest Analog                                                                                                                   | Match Quality                                                                                   |
| ----------------------------------------------------------------------------- | --------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **NEW** `el-templo-api/src/modules/finance/routes.ts`                         | controller (Fastify plugin) | request-response, CRUD + RBAC | `el-templo-api/src/modules/reports/routes.ts`                                                                                    | **exact** (admin module, hook with auth + role + country scope, paginated list, error handling) |
| **NEW** `el-templo-api/src/modules/finance/schemas.ts`                        | config (JSON Schema)        | request validation            | `el-templo-api/src/modules/reports/schemas.ts`                                                                                   | **exact**                                                                                       |
| **NEW** `el-templo-api/test/finance/transactions-api.test.ts`                 | test (integration)          | request-response              | `el-templo-api/test/reports/reports.test.ts` + `el-templo-api/test/finance/transaction-service.test.ts`                          | **exact** (reports for HTTP+RBAC; finance for txn fixture)                                      |
| **MODIFIED** `el-templo-api/src/modules/finance/types.ts`                     | model (TS types)            | n/a                           | self (extend with `TransactionListItem`, `FinancialHistoryItem`, filter types) + `reports/types.ts:150` for `PaginatedResult<T>` | role-match                                                                                      |
| **MODIFIED** `el-templo-api/src/modules/finance/index.ts`                     | barrel                      | n/a                           | `reports/index.ts:1`                                                                                                             | exact                                                                                           |
| **MODIFIED** `el-templo-api/src/modules/finance/transaction-service.ts`       | service                     | CRUD, paginated list          | self + `reports/service.ts:56-149` (paginated list pattern with COUNT + filter conditions)                                       | role-match (extend)                                                                             |
| **MODIFIED** `el-templo-api/src/modules/finance/balance-service.ts`           | service                     | read                          | self (add `getRowsForTransaction(tx, txId)` helper for `affectedBalances` response)                                              | role-match (extend)                                                                             |
| **MODIFIED** `el-templo-api/src/modules/shared/permissions.ts`                | config (constants)          | n/a                           | self (add `FINANCE_*_ROLES` next to existing `CAJA_ROLES`, `PAYMENT_ROLES`)                                                      | exact                                                                                           |
| **MODIFIED** `el-templo-api/src/app.ts`                                       | config (registration)       | n/a                           | self lines 148-151 (`reportsRoutes` register)                                                                                    | exact                                                                                           |
| **MODIFIED** `el-templo-api/src/modules/members/routes.ts`                    | controller                  | request-response              | self lines 700-705 (sub-resource `GET /:userId/notes` pattern)                                                                   | exact                                                                                           |
| **MODIFIED** `el-templo-admin/src/composables/usePaymentsApi.ts`              | composable (frontend)       | request-response              | `el-templo-admin/src/composables/useReportsApi.ts:30-64` (paginated GET pattern)                                                 | exact                                                                                           |
| **MODIFIED** `el-templo-admin/src/pages/CajaPage.vue`                         | page (frontend)             | request-response              | self (surgical swap of API binding)                                                                                              | n/a (in-place migration)                                                                        |
| **MODIFIED** `el-templo-admin/src/types/payment.ts` (or new `transaction.ts`) | model (TS types)            | n/a                           | self + `el-templo-admin/src/types/report.ts` for paginated shape                                                                 | role-match                                                                                      |

---

## Pattern Assignments

### `el-templo-api/src/modules/finance/routes.ts` (controller, request-response)

**Analog:** `el-templo-api/src/modules/reports/routes.ts` — THIS IS THE PRIMARY REFERENCE. Read end-to-end before writing any handler.

**Imports pattern** (lines 11-35):

```typescript
import { FastifyPluginAsync } from "fastify";
import { TransactionService, BalanceService } from ".";
import { handleServiceError } from "../shared/error-handler";
import type {} from /* filter & response types */ "./types";
import {
  createTransactionSchema,
  voidTransactionSchema,
  listTransactionsSchema,
  financialHistorySchema,
} from "./schemas";

import {
  FINANCE_READ_ROLES,
  FINANCE_WRITE_ROLES,
  FINANCE_VOID_ROLES,
  FINANCE_ADJUSTMENT_ROLES,
} from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
```

**Plugin + service instantiation pattern** (lines 37-38):

```typescript
export const financeRoutes: FastifyPluginAsync = async (fastify) => {
  const balanceService = new BalanceService(fastify.db, fastify.log);
  const transactionService = new TransactionService(
    fastify.db,
    fastify.log,
    balanceService,
  );
  // ... hook + handlers
};
```

Note: `TransactionService` constructor (transaction-service.ts:36-40) takes `(db, log, balanceService)` — must instantiate `BalanceService` first.

**Module-level guard hook** — copy verbatim from `reports/routes.ts:43-52`:

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

**Why FINANCE_READ_ROLES at hook level:** it is the most permissive of the four (per D-04 = `[owner, admin, gestion, recepcion]`). Stricter checks (`FINANCE_WRITE_ROLES` for create operativos, `FINANCE_ADJUSTMENT_ROLES` for adjustments, `FINANCE_VOID_ROLES` for void) are applied **inside individual handlers** because for `POST /transactions` the rule depends on `request.body.kind` — see members/routes.ts:499 for the pattern of in-handler 403.

**Per-handler role check pattern** (when role depends on body) — model: `members/routes.ts:496-504`:

```typescript
fastify.post<{ Body: CreateTransactionInput }>(
  "/transactions",
  { schema: createTransactionSchema },
  async (request, reply) => {
    // Role check depends on kind (D-01, D-02)
    const requiredRoles =
      request.body.kind === "adjustment"
        ? FINANCE_ADJUSTMENT_ROLES
        : FINANCE_WRITE_ROLES;
    if (!(requiredRoles as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message:
          request.body.kind === "adjustment"
            ? "Solo owner/admin/gestion puede crear ajustes"
            : "No tienes permiso para crear esta transaccion",
      });
    }
    // Country scope check on branchId for non-owners (D-06)
    // ... call service, build response with affectedBalances
  },
);
```

**Paginated GET handler pattern** — model: `reports/routes.ts:88-114` (charges):

```typescript
fastify.get<{
  Querystring: {
    branchId?: number;
    kind?: TransactionKind;
    dateFrom?: string;
    dateTo?: string;
    memberId?: number;
    paymentMethod?: PaymentMethod;
    search?: string;
    page?: number;
    limit?: number;
  };
}>(
  "/transactions",
  { schema: listTransactionsSchema },
  async (request, reply) => {
    try {
      const filters: TransactionListFilters = {
        branchId: request.query.branchId,
        country: request.scope.country, // <-- always pass country from hook
        kind: request.query.kind,
        dateFrom: request.query.dateFrom,
        dateTo: request.query.dateTo,
        memberId: request.query.memberId,
        paymentMethod: request.query.paymentMethod,
        search: request.query.search,
        page: request.query.page,
        limit: request.query.limit,
      };
      return await transactionService.list(filters);
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "list transactions");
    }
  },
);
```

**Error handling pattern** — every handler ends with the same catch (reports/routes.ts:82-84):

```typescript
} catch (err: unknown) {
  handleServiceError(err, reply, request.log, "<context-string>");
}
```

This delegates to `shared/error-handler.ts:26-42` which maps `AppError` subclasses (`BadRequestError`, `NotFoundError`, `ConflictError`) to HTTP codes via `instanceof AppError`. **Service layer already throws these** — see `transaction-service.ts:55, 60, 71, 81, 119, 202, 205, 208`. Do NOT add per-error catches.

---

### `el-templo-api/src/modules/finance/schemas.ts` (config, JSON Schema)

**Analog:** `el-templo-api/src/modules/reports/schemas.ts` — copy structure exactly.

**Shared fragments** (lines 9-20):

```typescript
const errorSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
  },
} as const;

const paginationQuerystring = {
  page: { type: "integer", minimum: 1 },
  limit: { type: "integer", minimum: 1, maximum: 200 }, // D-12: max 200 (reports uses 100)
} as const;
```

**List querystring + paginated response shape** — model: `reports/schemas.ts:72-118` (chargeReportSchema):

```typescript
export const listTransactionsSchema = {
  querystring: {
    type: "object",
    properties: {
      branchId: { type: "integer" },
      kind: {
        type: "string",
        enum: [
          "plan_charge",
          "debt_settlement",
          "refund",
          "adjustment",
          "advance_payment",
        ],
      },
      dateFrom: { type: "string", format: "date" },
      dateTo: { type: "string", format: "date" },
      memberId: { type: "integer" },
      paymentMethod: {
        type: "string",
        enum: ["cash", "transfer", "card", "aura_credit", "internal"],
      },
      search: { type: "string" },
      ...paginationQuerystring,
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        rows: {
          type: "array",
          items: {
            /* TransactionListItem shape */
          },
        },
        total: { type: "integer" },
        page: { type: "integer" },
        limit: { type: "integer" },
      },
    },
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;
```

**Body schema (for POST)** — no exact analog in `reports` (read-only). Pattern reference: this codebase uses `body: { type: "object", properties: { ... }, required: [...], additionalProperties: false }`. Use the inferred `CreateTransactionInput` shape from `finance/types.ts:36-51` as the source of truth.

```typescript
export const createTransactionSchema = {
  body: {
    type: "object",
    required: [
      "memberId",
      "kind",
      "direction",
      "amount",
      "paymentMethod",
      "transactionDate",
      "effectiveDate",
      "branchId",
      "links",
    ],
    properties: {
      memberId: { type: "integer" },
      kind: {
        type: "string",
        enum: [
          "plan_charge",
          "debt_settlement",
          "refund",
          "adjustment",
          "advance_payment",
        ],
      },
      direction: { type: "string", enum: ["inflow", "outflow"] },
      amount: { type: "integer" }, // amounts are integer cents/units in this codebase
      currency: { type: "string" },
      paymentMethod: {
        type: "string",
        enum: ["cash", "transfer", "card", "aura_credit", "internal"],
      },
      transactionDate: { type: "string", format: "date" },
      effectiveDate: { type: "string", format: "date" },
      branchId: { type: "integer" },
      notes: { type: ["string", "null"] },
      links: {
        type: "array",
        items: {
          type: "object",
          required: ["targetKind", "targetId", "allocatedAmount"],
          properties: {
            targetKind: {
              type: "string",
              enum: ["subscription", "debt_balance", "transaction"],
            },
            targetId: { type: "integer" },
            allocatedAmount: { type: "integer" },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
  response: {
    400: errorSchema,
    401: errorSchema,
    403: errorSchema,
    404: errorSchema,
    500: errorSchema,
  },
} as const;
```

**Void body schema:**

```typescript
export const voidTransactionSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "integer" } },
  },
  body: {
    type: "object",
    required: ["reason"],
    properties: { reason: { type: "string", minLength: 1 } },
    additionalProperties: false,
  },
  response: {
    /* errorSchema for 400/401/403/404/500 */
  },
} as const;
```

**Note:** Fastify validation runs BEFORE the handler. After Fastify validates, the handler can trust the shapes (type assertions allowed in `request.body`).

---

### `el-templo-api/test/finance/transactions-api.test.ts` (test, integration)

**Primary analog:** `el-templo-api/test/reports/reports.test.ts` (HTTP-level tests with auth, RBAC denial, pagination, filters)
**Secondary analog:** `el-templo-api/test/finance/transaction-service.test.ts` (existing — for fixture seeding patterns)

**Imports + setup pattern** — copy from `reports.test.ts:1-47`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
  createStaffUser, // for RBAC tests with non-owner roles
} from "../helpers";
import { financialTransactions } from "../../src/db/schema/financial-transactions";
import { transactionLinks } from "../../src/db/schema/transaction-links";
import { balances } from "../../src/db/schema/balances";
import { users, branches } from "../../src/db/schema";

const FINANCE_URL = "/api/admin/finance";

describe("Finance API", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let testBranchId: number;
  // ... beforeAll / afterAll identical to reports.test.ts:27-47
});
```

**Auth + role denial pattern** — for each excluded role per CONTEXT decision (coach for read endpoints, recepcion for void, etc.):

```typescript
it("denies coach from listing transactions (D-04 privacy)", async () => {
  await createStaffUser(app, {
    email: "coach@test.com",
    password: "pass123456",
    firstName: "C",
    lastName: "C",
    role: "coach",
    branchId: testBranchId,
  });
  const coachToken = await getAuthToken(app, "coach@test.com", "pass123456");
  const res = await app.inject({
    method: "GET",
    url: `${FINANCE_URL}/transactions`,
    headers: { authorization: `Bearer ${coachToken}` },
  });
  expect(res.statusCode).toBe(403);
});
```

**Fixture seeding** — reuse the `seedSubscription` helper pattern from `transaction-service.test.ts:42-63` (insert subscription directly via Drizzle). For HTTP create tests, hit `POST /api/admin/finance/transactions` and assert on `affectedBalances` in the response body.

**Coverage required (per CONTEXT D-09 strategy):**

- Happy path per endpoint (create plan_charge, void, list, financial-history)
- RBAC denial per excluded role per endpoint (coach for read; recepcion for void; coach + recepcion for adjustment)
- Validation errors (`additionalProperties: false`, missing required, wrong enum)
- Pagination bounds (`page=0` rejected; `limit=300` rejected; `limit=200` accepted per D-12)
- Country scope: non-owner cannot create against branch in another country (D-06); cannot void cross-country (D-07)
- `affectedBalances` populated in create response (D-10)
- Idempotency / atomicity already covered by Phase 105 service tests — DO NOT duplicate.

---

### `el-templo-api/src/modules/finance/types.ts` (model, extend)

**Analog:** self + `el-templo-api/src/modules/reports/types.ts:150-156` for `PaginatedResult<T>`.

**Decision needed (D-12 vs reuse):** The reuse target `PaginatedResult<T>` is currently in `reports/types.ts:150`. CONTEXT D-15 says "reusar tal cual desde reports/types.ts (o moverlo a shared/types.ts si más módulos lo necesitan)." **Recommendation:** move to `shared/types.ts` now since finance is the second consumer; update the existing `reports/types.ts:150` to re-export from shared to avoid breaking existing imports. The planner should make this an explicit micro-task.

**`PaginatedResult<T>`** (reports/types.ts:150-156):

```typescript
export interface PaginatedResult<T> {
  rows: T[];
  total: number;
  page: number;
  limit: number;
}
```

**New types to add to finance/types.ts:**

```typescript
// -- Filter shapes (analog: reports/types.ts:21-30 ChargeReportFilters) ----

export interface TransactionListFilters {
  branchId?: number;
  country?: "AR" | "ES"; // injected from request.scope.country
  kind?: TransactionKind;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;
  memberId?: number;
  paymentMethod?: PaymentMethod;
  search?: string; // member name (uses buildMemberNameSearchCondition)
  page?: number;
  limit?: number;
}

export interface FinancialHistoryFilters {
  page?: number;
  limit?: number;
  // No country: scope is implicit — handler enforces member belongs to scope.country
}

// -- Response row shapes ----------------------------------------------------

export interface TransactionListItem {
  // Flat shape for the table — analog: ChargeReportRow at reports/types.ts:57-68
  id: number;
  transactionDate: string; // YYYY-MM-DD
  memberId: number;
  memberName: string; // CONCAT(firstName, ' ', lastName)
  kind: TransactionKind;
  direction: TransactionDirection;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  branchId: number;
  branchName: string;
  recordedBy: number;
  recorderName: string;
  voidedAt: string | null;
  notes: string | null;
  // Lightweight summary of links (full detail via getById)
  linkSummary: Array<{
    targetKind: TargetKind;
    targetId: number;
    allocatedAmount: number;
  }>;
}

export interface FinancialHistoryItem {
  transaction: FinancialTransactionRow;
  links: Array<{
    targetKind: TargetKind;
    targetId: number;
    allocatedAmount: number;
    conceptLabel?: string; // e.g. "Mensualidad Marzo 2026 — Plan Pro" — D-13
  }>;
  voidInfo?: { voidedAt: string; voidedBy: number; voidReason: string };
}

// -- POST /transactions response (D-10) ------------------------------------

export interface CreateTransactionResponse {
  transaction: FinancialTransactionRow;
  links: TransactionLinkRow[];
  affectedBalances: BalanceRow[];
}
```

---

### `el-templo-api/src/modules/finance/transaction-service.ts` (service, extend)

**Existing:** `create()`, `void()`, `getById()`, `listForMember()` (lines 46-298).
**To add:** `list(filters)` for `GET /transactions` and `getFinancialHistory(memberId, filters)` for `GET /members/:id/financial-history`.

**Analog for paginated `list()`:** `reports/service.ts:153-247` (`getChargeHistory`). The current `getChargeHistory` already queries `financial_transactions` JOIN `transaction_links` (post-Phase-105 D-01). The new `TransactionService.list()` is essentially the same query without the `kind IN ('plan_charge', 'debt_settlement') AND direction='inflow' AND voided_at IS NULL` filters — those become optional filter params instead.

**Shape of `list()` method** (mirror reports/service.ts:153-247 structure):

```typescript
async list(
  filters: TransactionListFilters,
): Promise<PaginatedResult<TransactionListItem>> {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 50;       // D-12: default 50
  const offset = (page - 1) * limit;

  const conditions = this.buildListConditions(filters);

  // 1. COUNT (separate query — same pattern as reports/service.ts:170-194)
  const [countResult] = await this.db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.financialTransactions)
    .innerJoin(schema.users, eq(schema.users.id, schema.financialTransactions.memberId))
    .innerJoin(schema.branches, eq(schema.branches.id, schema.financialTransactions.branchId))
    .where(and(...conditions));
  const total = Number(countResult?.count ?? 0);

  // 2. Rows (analog: reports/service.ts:201-227 — but no recorder self-join needed
  //    if we use Drizzle aliasedTable; reports does it via raw SQL to alias users twice)
  // ... select with joins, ORDER BY transaction_date DESC, LIMIT/OFFSET
  // 3. Map to TransactionListItem (analog: reports/service.ts:231-244)
  // 4. Fetch link summaries in a single follow-up query (avoid N+1)
  return { rows: mapped, total, page, limit };
}

private buildListConditions(filters: TransactionListFilters): SQL[] {
  // Analog: reports/service.ts buildChargeConditions (private method).
  // Use buildMemberNameSearchCondition from ../shared/member-search when filters.search is set.
}
```

**Search filter pattern** — reuse `buildMemberNameSearchCondition` from `shared/member-search.ts:18-50`:

```typescript
if (filters.search) {
  const cond = buildMemberNameSearchCondition(filters.search);
  if (cond) conditions.push(cond);
}
```

**Country scope condition** — analog: `reports/service.ts:279-281`:

```typescript
if (filters.country !== undefined) {
  conditions.push(eq(schema.branches.country, filters.country));
}
```

---

### `el-templo-api/src/modules/finance/balance-service.ts` (service, extend)

Add a small helper for the create-response `affectedBalances` field (D-10):

```typescript
/**
 * Read the balance rows touched by a given transaction's links. Used by
 * the POST /transactions handler to populate affectedBalances in the
 * response without forcing the frontend to re-fetch.
 */
async getRowsForTransaction(
  transactionId: number,
): Promise<BalanceRow[]> {
  // SELECT b.* FROM balances b
  // JOIN transaction_links tl ON tl.target_kind = b.target_kind
  //   AND tl.target_id = b.target_id
  // JOIN financial_transactions ft ON ft.id = tl.transaction_id
  //   AND ft.member_id = b.member_id
  //   AND ft.currency = b.currency
  // WHERE tl.transaction_id = ? AND tl.target_kind != 'transaction'
}
```

**Analog:** existing read methods on lines 175-240 (`getOutstandingTotalsByCurrency`, `hasOutstandingForUser`, `getRow`).

**Alternative:** the `TransactionService.create` handler can compose `affectedBalances` by calling `balanceService.getRow()` per link inside the same transaction (transaction-service.ts already returns `txRow + linkRows`). Either approach is fine; planner picks the DRY-er one.

---

### `el-templo-api/src/modules/shared/permissions.ts` (config, extend)

**Analog:** self lines 38-65 (`CAJA_ROLES`, `PAYMENT_ROLES` style).

**Add at the end of the file** (preserving the existing `[role, role, role] as const` pattern):

```typescript
/** Roles that can create finance transactions of operational kinds
 *  (plan_charge, debt_settlement, refund, advance_payment) — D-02. */
export const FINANCE_WRITE_ROLES = [
  "owner",
  "admin",
  "gestion",
  "recepcion",
] as const;

/** Roles that can create kind=adjustment (sensitive, D-01). */
export const FINANCE_ADJUSTMENT_ROLES = ["owner", "admin", "gestion"] as const;

/** Roles that can void a finance transaction (D-03 — recepcion excluded). */
export const FINANCE_VOID_ROLES = ["owner", "admin", "gestion"] as const;

/** Roles that can read finance transactions / financial history (D-04 — coach excluded for privacy). */
export const FINANCE_READ_ROLES = [
  "owner",
  "admin",
  "gestion",
  "recepcion",
] as const;
```

---

### `el-templo-api/src/modules/finance/index.ts` (barrel, extend)

**Current:** lines 1-17 exports services + types.
**Add:**

```typescript
export { financeRoutes } from "./routes";
```

**Analog:** `reports/index.ts:1` — `export { reportsRoutes } from "./routes";`

---

### `el-templo-api/src/app.ts` (config, register route)

**Analog:** lines 148-151:

```typescript
// Reports routes (access log, charges, expiring, inactive + Excel exports)
await app.register(reportsRoutes, {
  prefix: "/api/admin/reports",
});
```

**Add (next to reports register, ~line 152):**

```typescript
// Finance routes (transactions create/void/list, financial history) — Phase 106
await app.register(financeRoutes, {
  prefix: "/api/admin/finance",
});
```

Place after `reportsRoutes` but BEFORE `settingsRoutes` to keep admin modules grouped. Don't forget to add `import { financeRoutes } from "./modules/finance";` near the other module imports at the top of app.ts.

---

### `el-templo-api/src/modules/members/routes.ts` (controller, extend with sub-resource)

**Decision (D-09):** mount `GET /api/admin/members/:userId/financial-history` inside `members/routes.ts`. This module already has the right hook (authenticate + MEMBER_ROLES + attachCountryScope, lines 87-96), and other sub-resources like `/:userId/notes` (lines 700-705) follow the same pattern.

**Caveat on RBAC mismatch:** the module-level guard in members/routes.ts:89 uses `MEMBER_ROLES` which **includes coach** (permissions.ts:50-56). But D-04 excludes coach from finance reads. **Therefore** the financial-history handler MUST do an additional `FINANCE_READ_ROLES` check inside the handler — analog: members/routes.ts:499 (`ADMIN_ROLES` check inside DELETE handler):

```typescript
fastify.get<{
  Params: { userId: number };
  Querystring: { page?: number; limit?: number };
}>(
  "/:userId/financial-history",
  { schema: financialHistorySchema },
  async (request, reply) => {
    // D-04: coach excluded from finance reads even though MEMBER_ROLES includes them
    if (
      !(FINANCE_READ_ROLES as readonly string[]).includes(request.user.role)
    ) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "No tienes permiso para ver el historial financiero",
      });
    }
    // ... country scope check on target member's branch (mirror lines 506-540 pattern)
    // ... call transactionService.getFinancialHistory(userId, filters)
  },
);
```

**Service instantiation:** members/routes.ts already instantiates several services (line 82, plus AuraService/SubscriptionService/etc. inside specific handlers). Instantiate `TransactionService` + `BalanceService` either at the plugin top (cheap) or inline in this handler.

**Imports to add to members/routes.ts:**

```typescript
import { TransactionService, BalanceService } from "../finance";
import { financialHistorySchema } from "../finance/schemas"; // or define inline
import { FINANCE_READ_ROLES } from "../shared/permissions";
```

---

### `el-templo-admin/src/composables/usePaymentsApi.ts` → migrate

**Analog:** `el-templo-admin/src/composables/useReportsApi.ts:30-64` (paginated GET pattern with `PaginatedResult<T>`).

**CONTEXT D-14 / D-15 swap pattern** — the existing 3 methods map to:

| Old method (current usePaymentsApi.ts)                               | New endpoint                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Notes                                                                           |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `listPayments(params)` → `/admin/payments/payments`                  | `GET /admin/finance/transactions`                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Returns `PaginatedResult<TransactionListItem>` instead of `{ payments, total }` |
| `voidPayment(id, reason)` → `POST /admin/payments/payments/:id/void` | `POST /admin/finance/transactions/:id/void`                                                                                                                                                                                                                                                                                                                                                                                                                                            | Same shape (`{ reason }` body); response is `{ transaction }`                   |
| `getFinancialSummary(...)` → `/admin/payments/payments/summary`      | **Not provided by Phase 106.** D-16 says: if CajaPage uses summary, Phase 106 ALSO rewrites it against `financial_transactions`. **Planner must decide:** add a `GET /api/admin/finance/transactions/summary` endpoint OR move summary to `analytics/` module (already rewrote `monthlyRevenue` against `financial_transactions` in Phase 105 D-01). **Recommendation:** add finance summary endpoint in the same plugin (small handler, 50 LOC) — keeps the migration self-contained. |

**Reference shape for the migrated composable** (model: `useReportsApi.ts:30-46`):

```typescript
async function listTransactions(
  params: TransactionListParams = {},
): Promise<PaginatedResult<TransactionListItem>> {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await api.get<PaginatedResult<TransactionListItem>>(
      "/admin/finance/transactions",
      { params },
    );
    return data;
  } catch (err: unknown) {
    error.value = extractError(err, "Error cargando transacciones");
    throw err;
  } finally {
    loading.value = false;
  }
}
```

**Naming decision:** Per CONTEXT, "rename to `useTransactionsApi.ts` or keep `usePaymentsApi.ts` with new endpoints — decide in planning." **Recommendation:** rename to `useTransactionsApi.ts` to match the new domain noun and the API path. Update the 1 import in CajaPage.vue:368.

---

### `el-templo-admin/src/pages/CajaPage.vue` → surgical migration

**No analog needed — this is an in-place swap.** The mapping (per D-15 "preserve UI; change API binding only"):

| CajaPage line     | Current code                                                                                          | Migrated code                                                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 368               | `import { usePaymentsApi }`                                                                           | `import { useTransactionsApi }` (or keep filename)                                                                                                               |
| 374-378           | `import { type PaymentListItem, type PaymentMethod, type FinancialSummary } from 'src/types/payment'` | Add `TransactionListItem` to `src/types/transaction.ts` (new) or extend `payment.ts`. Reuse `PaymentMethod` (now extended to include `aura_credit`, `internal`). |
| 385               | `const paymentsApi = usePaymentsApi()`                                                                | `const transactionsApi = useTransactionsApi()`                                                                                                                   |
| 417               | `const payments = ref<PaymentListItem[]>([])`                                                         | `const transactions = ref<TransactionListItem[]>([])` (rename ref)                                                                                               |
| 525               | `paymentsApi.getFinancialSummary(...)`                                                                | `transactionsApi.getSummary(...)` (if summary endpoint added per D-16 recommendation)                                                                            |
| 545               | `paymentsApi.listPayments({ ... })`                                                                   | `transactionsApi.listTransactions({ ... })`                                                                                                                      |
| 555-556           | `payments.value = result.payments; tablePagination.value.rowsNumber = result.total`                   | `transactions.value = result.rows; tablePagination.value.rowsNumber = result.total` (note `result.rows` not `result.payments`)                                   |
| 596               | `paymentsApi.voidPayment(payment.id, reason.trim())`                                                  | `transactionsApi.voidTransaction(payment.id, reason.trim())`                                                                                                     |
| 466-487 (columns) | `field: 'paymentDate'`, `field: 'planName'` etc.                                                      | Map fields from `TransactionListItem` shape. Phase 106 deliberately does NOT add the `kind` column (deferred to Phase 109 / CAJA-02).                            |

**Filter `paymentMethod` enum widening:** new endpoint accepts `aura_credit | internal` in addition to `cash | transfer | card`. Phase 106 keeps the dropdown options the same (CajaPage today only shows the 3 user-facing methods); `aura_credit` and `internal` simply appear in the table for transactions that use them. Phase 109 adds dedicated UI.

---

### `el-templo-admin/src/types/transaction.ts` (NEW — recommendation) or extend `payment.ts`

**Analog:** `el-templo-admin/src/types/payment.ts` (PaymentMethod, label/color maps, list params, list item shape) + `el-templo-admin/src/types/report.ts` (PaginatedResult).

**Shape:**

```typescript
export type TransactionKind =
  | "plan_charge"
  | "debt_settlement"
  | "refund"
  | "adjustment"
  | "advance_payment";

export type TransactionDirection = "inflow" | "outflow";

export type PaymentMethod =
  | "cash"
  | "transfer"
  | "card"
  | "aura_credit"
  | "internal";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  aura_credit: "AURA",
  internal: "Interno",
};

export interface TransactionListItem {
  // Mirror server-side TransactionListItem from finance/types.ts
  id: number;
  transactionDate: string;
  memberId: number;
  memberName: string;
  kind: TransactionKind;
  direction: TransactionDirection;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  branchId: number;
  branchName: string;
  voidedAt: string | null;
  // ... rest matching server shape
}

export interface TransactionListParams {
  branchId?: number;
  country?: "AR" | "ES";
  kind?: TransactionKind;
  paymentMethod?: PaymentMethod;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  memberId?: number;
  page: number;
  limit: number;
}
```

**Recommendation:** create new file `transaction.ts` and **delete** `payment.ts` once CajaPage migration is done. Other files that import `payment.ts`: search via `grep -rln "from 'src/types/payment'"` in `el-templo-admin/src` during planning.

---

## Shared Patterns (cross-cutting)

### Authentication + RBAC + Country Scope (apply to ALL finance routes)

**Sources:**

- `el-templo-api/src/modules/reports/routes.ts:43-52` — module-level hook
- `el-templo-api/src/modules/shared/country-scope.ts:36-68` — `attachCountryScope`
- `el-templo-api/src/modules/shared/permissions.ts:38-76` — role constants

**Apply to:** every handler in `finance/routes.ts` and the new `members/routes.ts:/:userId/financial-history` handler.

**Three-layer pattern:**

1. **Authenticate** at hook (`fastify.authenticate(request, reply)`)
2. **Coarse role gate** at hook (most-permissive of finance roles = `FINANCE_READ_ROLES`)
3. **Fine role gate** in handler when role depends on body (POST /transactions: kind→adjustment vs other; void: stricter than read)
4. **Country scope** at hook via `attachCountryScope`. Handler reads `request.scope.country` and `request.scope.isOwner`. For POST/void on a target row, additionally validate the target's branch country matches scope.country if `!isOwner`.

### Error Handling (apply to all handlers)

**Source:** `el-templo-api/src/modules/shared/error-handler.ts:26-42` — `handleServiceError(err, reply, log, context)`.

**Apply to:** every handler's catch block. Service layer throws `BadRequestError`, `NotFoundError`, etc.; handler does not need per-error logic.

### Drizzle DB Transactions (already enforced by service)

**Source:** `el-templo-api/src/modules/finance/transaction-service.ts:50, 196` — `await this.db.transaction(async (tx) => { ... })`.

**Phase 106 implication:** the routes layer does NOT open transactions. Calling `transactionService.create(...)` and `transactionService.void(...)` is sufficient — atomicity is locked inside the service per Phase 105 D-04 / SPEC §8.

### Logging (apply to all new server code)

**Source:** `CLAUDE.md` — Pino via `request.log` / `app.log`. Service layer already uses `this.log.info` (transaction-service.ts:169-179). Frontend uses `createLogger('CajaPage')` (CajaPage.vue:381).

### Member Search (apply to GET /transactions search filter)

**Source:** `el-templo-api/src/modules/shared/member-search.ts:18-50` — `buildMemberNameSearchCondition(search)`.

**Apply in:** `TransactionService.list()` private `buildListConditions` helper.

### Paginated Response Shape (apply to GET /transactions and GET /financial-history)

**Source:** `el-templo-api/src/modules/reports/types.ts:150-156` — `PaginatedResult<T>`.

**Apply to:** every paginated finance read endpoint. **Recommendation:** move to `shared/types.ts` since finance is the second consumer.

### Test Utilities (apply to integration tests)

**Source:** `el-templo-api/test/helpers.ts` — `createTestApp()`, `getAuthToken()`, `registerUser()`, `cleanAllTestData()`, `createStaffUser()`, `createTestPlan()`, `createTestMember()`, `assignTestPlan()`, `seedAuraBalance()`.

**Apply to:** `test/finance/transactions-api.test.ts`. Patterns: `beforeAll` creates app + admin token; `beforeEach` calls `cleanAllTestData(app)`; `afterAll` calls `app.close()`.

---

## No Analog Found

| File   | Role | Reason                                                                                        |
| ------ | ---- | --------------------------------------------------------------------------------------------- |
| (none) | —    | All Phase 106 files have strong analogs; the codebase has clear precedents for every pattern. |

---

## Metadata

**Analog search scope:**

- `el-templo-api/src/modules/{reports,members,finance,shared}/`
- `el-templo-api/src/app.ts`
- `el-templo-api/test/{reports,finance,members,helpers.ts}`
- `el-templo-admin/src/{composables,types,pages/CajaPage.vue}`

**Files scanned:** ~25 (read in full or targeted ranges)
**Pattern extraction date:** 2026-04-28
**Mapper:** gsd-phase-pattern-mapper

---

## Open Decisions for the Planner

1. **`PaginatedResult<T>` location** — keep in `reports/types.ts` and import, or move to `shared/types.ts` and re-export from reports? **Recommended:** move to shared.
2. **`usePaymentsApi.ts` rename** — rename to `useTransactionsApi.ts` (recommended) or keep filename with new endpoints?
3. **`affectedBalances` computation** — add `BalanceService.getRowsForTransaction()` method, or compose in `TransactionService.create()` from existing `getRow()` calls? **Recommended:** new method, single SQL query, DRY.
4. **`paymentMethod` widening on Caja UI** — Phase 106 keeps the 3-option dropdown (cash/transfer/card), and the table renders `aura_credit`/`internal` rows when present. Phase 109 adds full dropdown options.
5. **Finance summary endpoint** — add `GET /admin/finance/transactions/summary` in Phase 106 (D-16 says yes if CajaPage needs it). **Recommended:** yes, ~50 LOC handler that aggregates revenue by method, by branch, and a monthlyRevenue total — preserves CajaPage UX.
6. **Mount of `/financial-history`** — confirmed inside `members/routes.ts` (D-09 + my analysis above), with explicit `FINANCE_READ_ROLES` check inside the handler to override the module-level `MEMBER_ROLES` (which includes coach).
