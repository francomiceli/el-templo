# Phase 105: Modelo de Datos + Drop del Viejo — Pattern Map

**Mapped:** 2026-04-28
**Files analyzed:** 21 (9 new, 9 modified, 3 deleted directory/file groups)
**Analogs found:** 21 / 21 (every new file has a strong codebase analog)

## File Classification

### New files

| New file                                                                        | Role                     | Data flow                                | Closest analog                                                                                                                                                                                             | Match quality                                                                                                                                      |
| ------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/db/schema/financial-transactions.ts`                         | schema                   | CRUD + soft-void                         | `el-templo-api/src/db/schema/payments.ts`                                                                                                                                                                  | exact (same domain: members + voidedAt/voidedBy/voidReason + branch + recordedBy)                                                                  |
| `el-templo-api/src/db/schema/transaction-links.ts`                              | schema (pivot M:N)       | CRUD                                     | `el-templo-api/src/db/schema/format-compatibility.ts`                                                                                                                                                      | role-match (small pivot with `uniqueIndex` lookup); also `aura-transactions.ts` for the `referenceType + referenceId` discriminated-target pattern |
| `el-templo-api/src/db/schema/balances.ts`                                       | schema (cache of totals) | upsert + reverse                         | `el-templo-api/src/db/schema/aura-balances.ts`                                                                                                                                                             | role-match (cache table mirrored from a ledger; UNIQUE on owner tuple)                                                                             |
| `el-templo-api/src/db/migrations/0106_finance_model_replace_payments_debts.sql` | migration                | DDL                                      | `el-templo-api/src/db/migrations/0096_debts_table.sql` (CREATE) + `el-templo-api/src/db/migrations/0070_rename_programs_merge_goal_plans.sql` (DROP)                                                       | exact for both halves                                                                                                                              |
| `el-templo-api/src/modules/finance/index.ts`                                    | barrel                   | n/a                                      | `el-templo-api/src/modules/aura/index.ts`                                                                                                                                                                  | exact (small re-export barrel)                                                                                                                     |
| `el-templo-api/src/modules/finance/types.ts`                                    | types                    | n/a                                      | `el-templo-api/src/modules/payments/types.ts`                                                                                                                                                              | role-match (input/detail/list shapes), but enum literals must come from Drizzle `$inferSelect` per D-05                                            |
| `el-templo-api/src/modules/finance/transaction-service.ts`                      | service                  | event-driven write + atomic cache update | `el-templo-api/src/modules/aura/service.ts` (atomic ledger + cache via `db.transaction`) **+** `el-templo-api/src/modules/payments/service.ts` (`recordPayment` / `voidPayment` shape, Spanish error copy) | exact (combination — aura supplies the atomicity pattern, payments supplies the void shape)                                                        |
| `el-templo-api/src/modules/finance/balance-service.ts`                          | service (cache writer)   | upsert + reverse                         | `el-templo-api/src/modules/aura/service.ts:80-83` (`INSERT ... ON DUPLICATE KEY UPDATE` via `tx.execute(sql\`...\`)`)                                                                                      | exact                                                                                                                                              |
| `el-templo-api/test/finance/transaction-service.test.ts`                        | test (integration)       | seed → call → assert                     | `el-templo-api/test/unit/aura-service.test.ts` (per-test cleanup, direct service constructor, atomic-ledger asserts)                                                                                       | exact                                                                                                                                              |

### Modified files

| File                                                                                                                                                    | Role          | Data flow                | Change kind                                                                                                                                                                                                                                                                             | Closest analog (if rewriting a block)                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/db/schema/index.ts`                                                                                                                  | schema barrel | n/a                      | remove 2 exports, add 3                                                                                                                                                                                                                                                                 | self (lines 36-37 to remove)                                                                                                       |
| `el-templo-api/src/app.ts`                                                                                                                              | bootstrap     | n/a                      | remove `paymentRoutes` register at L120; do **not** register finance routes (Phase 106)                                                                                                                                                                                                 | self                                                                                                                               |
| `el-templo-api/src/modules/auth/routes.ts` (line 155)                                                                                                   | route         | DI                       | replace `new PaymentService(...)` with `new TransactionService(...)`                                                                                                                                                                                                                    | `subscriptions/routes.ts:59-64`                                                                                                    |
| `el-templo-api/src/modules/subscriptions/service.ts` (constructor L115; callsites L1117, L2261, L2622, L2871)                                           | service       | event-driven             | swap `paymentService?: PaymentService` for `transactionService?: TransactionService`; rewrite each `recordPayment(...)` callsite to `transactionService.create({kind:'plan_charge', direction:'inflow', links:[{target_kind:'subscription', target_id, allocated_amount: pricePaid}]})` | new TransactionService.create signature (sibling pattern in `aura/service.ts:42-101`)                                              |
| `el-templo-api/src/modules/subscriptions/routes.ts` (L59-64)                                                                                            | route         | DI                       | replace PaymentService instantiation with TransactionService                                                                                                                                                                                                                            | self                                                                                                                               |
| `el-templo-api/src/jobs/auto-resume-pauses.ts`                                                                                                          | cron job      | DI                       | replace PaymentService import + instance                                                                                                                                                                                                                                                | self (3-line swap)                                                                                                                 |
| `el-templo-api/src/modules/analytics/service.ts` (L780-870+: `getRevenueTrend`, `getRevenueByMethod`, `getRevenueByBranch`)                             | service       | aggregate read           | rewrite WHERE: `isNull(financialTransactions.voidedAt)` + `inArray(financialTransactions.kind, ['plan_charge','debt_settlement'])` instead of `isNull(payments.voidedAt)`                                                                                                               | self (preserve same SELECT shape; only swap table + add `kind IN (...)` filter)                                                    |
| `el-templo-api/src/modules/reports/service.ts` (L160-200, L434, L755+)                                                                                  | service       | aggregate read + raw SQL | rewrite both Drizzle queries (L167-200) and raw `sql\`SELECT ... FROM payments p ...\``blocks (L179-200) against`financial_transactions`                                                                                                                                                | self                                                                                                                               |
| `el-templo-api/src/modules/members/service.ts` (L165-174 `EXISTS debts`, L267-282 `totalDebtPromise`, L293 `getActiveDebtsForUsers` call, L509 comment) | service       | aggregate + filter       | swap `EXISTS(SELECT 1 FROM debts ...)` for `EXISTS(SELECT 1 FROM balances WHERE balances.member_id = users.id AND balances.amount > 0)`; rewrite `totalDebtPromise` against `balances` grouped by currency; remove `debtService` constructor param + `getActiveDebtsForUsers` join      | self (preserve `Promise.all` parallelism + `TotalDebtRow[]` response shape — the API contract toward AlumnosPage stays identical)  |
| `el-templo-api/src/modules/members/routes.ts` (L23 import, L84-85 instantiation, L489-498 debt PUT/GET handlers, L526)                                  | route         | request-response         | delete `DebtService` import + instance; delete debt sub-routes; remove `debt` field from PATCH handler                                                                                                                                                                                  | self                                                                                                                               |
| `el-templo-api/src/modules/members/types.ts` (L190+ `DebtUpsertInput`, `TotalDebtRow`, `ActiveDebt`)                                                    | types         | n/a                      | delete `DebtUpsertInput`, `ActiveDebt`; **keep** `TotalDebtRow` shape (still used by listMembers response — now sourced from `balances`)                                                                                                                                                | self                                                                                                                               |
| `el-templo-api/src/modules/members/schemas.ts`                                                                                                          | Zod schemas   | validation               | drop `debt`/`isDebtor`/`debtAmount`/`debtCurrency`/`debtNote` from `updateMemberSchema`; ensure `.strict()` (or `additionalProperties: false`) so legacy clients get 400                                                                                                                | self                                                                                                                               |
| `el-templo-admin/src/components/MemberFormDialog.vue` (L420-464)                                                                                        | component     | form                     | delete the `<!-- Deuda -->` section + `q-toggle` for `isDebtor` + the conditional currency/note block; remove `form.isDebtor / debtAmount / debtCurrency / debtNote` from form state, defaults, reset(), and submit payload                                                             | self                                                                                                                               |
| `el-templo-admin/src/pages/AlumnosPage.vue` (L55, L149, L538)                                                                                           | component     | form/list                | filter toggle stays (label same, semantics now "balance > 0"); banner stays (data flows in from updated endpoint); column stays                                                                                                                                                         | self — the _server_ side of the contract changes, the Vue side keeps the same `MemberListItem.debt` field unless types are renamed |
| `el-templo-admin/src/types/member.ts` (L70 `debt`, L144 `debt?: DebtUpsertInput`, L165-191 `DebtCurrency` / `ActiveDebt` / `DebtUpsertInput`)           | types         | n/a                      | delete `DebtUpsertInput` and the `debt?` field from `UpdateMemberInput`; keep `MemberListItem.debt` shape (now sourced from `balances`) **OR** rename to `outstandingBalance` to reflect the new model — planner decides                                                                | self                                                                                                                               |
| `el-templo-admin/src/composables/useMembersApi.ts`                                                                                                      | composable    | API call                 | no changes needed — composable is generic over `MembersListResponse`; only its types update                                                                                                                                                                                             | self                                                                                                                               |

### Files deleted entirely

| Path                                                                                                     | Reason                                                                          |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `el-templo-api/src/db/schema/payments.ts`                                                                | replaced by `financial-transactions.ts`                                         |
| `el-templo-api/src/db/schema/debts.ts`                                                                   | replaced by `balances.ts`                                                       |
| `el-templo-api/src/modules/payments/` (whole dir: index.ts, types.ts, schemas.ts, service.ts, routes.ts) | replaced by `modules/finance/`                                                  |
| `el-templo-api/src/modules/members/debts-service.ts` (149 LOC)                                           | replaced by service-layer cache maintenance in `BalanceService`                 |
| `el-templo-admin/src/composables/usePaymentsApi.ts`                                                      | dead — referenced no longer exists; verify in planning                          |
| `el-templo-api/test/payments/payments.test.ts`                                                           | replaced by `test/finance/transaction-service.test.ts`                          |
| `el-templo-api/test/members/debts.test.ts`                                                               | replaced by integration coverage in finance test + members listing test rewrite |

---

## Pattern Assignments

### `el-templo-api/src/db/schema/financial-transactions.ts` (schema)

**Analog:** `el-templo-api/src/db/schema/payments.ts` (full file, 78 lines)

**Imports + table opener (analog L1-22):**

```typescript
import {
  mysqlTable,
  int,
  varchar,
  text,
  timestamp,
  date,
  mysqlEnum,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { branches } from "./branches"; // NEW — branchId is NOT NULL per SPEC

// D-05: enums declared inline; TS types inferred from $inferSelect downstream.
export const transactionKindEnum = mysqlEnum("kind", [
  "plan_charge",
  "debt_settlement",
  "refund",
  "adjustment",
  "advance_payment",
]);
export const transactionDirectionEnum = mysqlEnum("direction", [
  "inflow",
  "outflow",
]);
export const transactionPaymentMethodEnum = mysqlEnum("payment_method", [
  "cash",
  "transfer",
  "card",
  "aura_credit",
  "internal",
]);
```

**Void columns + indices pattern (analog L41-54):**

```typescript
voidedAt: timestamp("voided_at"),
voidedBy: int("voided_by").references(() => users.id),
voidReason: text("void_reason"),
createdAt: timestamp("created_at").defaultNow().notNull(),
// (add updatedAt for transactional integrity though SPEC only requires it for balances)
},
(table) => [
  index("idx_financial_tx_member_id").on(table.memberId),
  index("idx_financial_tx_transaction_date").on(table.transactionDate),
  index("idx_financial_tx_branch_date").on(table.branchId, table.transactionDate),
  index("idx_financial_tx_kind_voided").on(table.kind, table.voidedAt),
],
```

**Relations export (analog L57-77):**

```typescript
export const financialTransactionsRelations = relations(
  financialTransactions,
  ({ one, many }) => ({
    member: one(users, {
      fields: [financialTransactions.memberId],
      references: [users.id],
      relationName: "financialTxMember",
    }),
    recorder: one(users, {
      fields: [financialTransactions.recordedBy],
      references: [users.id],
      relationName: "financialTxRecorder",
    }),
    voider: one(users, {
      fields: [financialTransactions.voidedBy],
      references: [users.id],
      relationName: "financialTxVoider",
    }),
    branch: one(branches, {
      fields: [financialTransactions.branchId],
      references: [branches.id],
    }),
    links: many(transactionLinks),
  }),
);
```

**Deviations from analog:**

- Drop `subscriptionId` column (was NOT NULL in payments). Replaced by `transaction_links` rows.
- Add `direction`, `kind`, `effectiveDate`, `branchId` (NOT NULL).
- Currency: same `varchar(3) default 'ARS'` shape.

---

### `el-templo-api/src/db/schema/transaction-links.ts` (pivot)

**Analog primary:** `el-templo-api/src/db/schema/format-compatibility.ts` (17 lines — small pivot with composite `uniqueIndex`)
**Analog secondary:** `el-templo-api/src/db/schema/aura-transactions.ts:36-49` (the `referenceType + referenceId` discriminated-target pattern — **target_kind + target_id in our case**)

**Pattern from format-compatibility (entire file):**

```typescript
import { mysqlTable, int, mysqlEnum, uniqueIndex } from 'drizzle-orm/mysql-core';
import { formats } from './formats';

export const blockEnum = mysqlEnum('block', ['initium', ...]);

export const formatCompatibility = mysqlTable('format_compatibility', {
  id: int('id').primaryKey().autoincrement(),
  formatId: int('format_id').notNull().references(() => formats.id),
  block: blockEnum.notNull(),
  // ...
}, (table) => [
  uniqueIndex('format_compat_lookup_idx').on(table.formatId, table.block, table.level, table.intensity),
]);
```

**Pattern from aura-transactions for discriminated-target (analog L36-49):**

```typescript
referenceType: varchar("reference_type", { length: 50 }),
referenceId: int("reference_id"),
// ...
(table) => [
  uniqueIndex("unique_user_source_ref").on(
    table.userId, table.sourceType, table.referenceType, table.referenceId,
  ),
],
```

**Apply to `transaction-links.ts`:**

- `targetKindEnum = mysqlEnum('target_kind', ['subscription','debt_balance','transaction'])`
- `targetId: int('target_id').notNull()` — **no `.references(...)`** (heterogeneous FK target by `target_kind`; service layer enforces integrity per SPEC §7).
- `uniqueIndex('uniq_tx_target').on(table.transactionId, table.targetKind, table.targetId)` — SPEC §2 UNIQUE constraint.
- Add `index('idx_tx_links_target').on(table.targetKind, table.targetId)` for "qué transacciones afectan al concepto X" lookups.

---

### `el-templo-api/src/db/schema/balances.ts` (cache)

**Analog:** `el-templo-api/src/db/schema/aura-balances.ts` (full file, 22 lines)

**Pattern (analog L1-22):**

```typescript
import { mysqlTable, int, timestamp } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

export const auraBalances = mysqlTable("aura_balances", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id")
    .references(() => users.id)
    .notNull()
    .unique(),
  balance: int("balance").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const auraBalancesRelations = relations(auraBalances, ({ one }) => ({
  user: one(users, { fields: [auraBalances.userId], references: [users.id] }),
}));
```

**Apply to `balances.ts`:**

- Replace `userId.unique()` (single-key) with composite `uniqueIndex('uniq_balance_target').on(memberId, targetKind, targetId, currency)` — SPEC §3 UNIQUE constraint is on the tuple.
- Add `targetKind` enum (`subscription`, `debt_balance`).
- Rename `balance` → `amount` (signed int; SPEC §3 explicitly allows negatives).
- Add `currency varchar(3) NOT NULL` (no default — caller chooses).
- Replace `updatedAt` with `lastRecomputedAt timestamp NOT NULL` per SPEC. Add `createdAt` for audit symmetry.
- Add `index('idx_balances_member').on(memberId)` and `index('idx_balances_amount_member').on(amount, memberId)` for "deudores" listing.

---

### `el-templo-api/src/db/migrations/0106_finance_model_replace_payments_debts.sql` (migration)

**Analog (CREATE half):** `el-templo-api/src/db/migrations/0096_debts_table.sql` (entire file)

**Header comment + table shape (analog L1-32):**

```sql
-- Phase 105: Finance model — replace payments + debts with transactional 3-table model.
-- CREATE order: financial_transactions → transaction_links → balances → DROP payments → DROP debts.
-- Idempotency: the _migrations tracker prevents a successful file from running
-- twice. CREATE TABLE without IF NOT EXISTS is intentional — surfaces clear
-- "table already exists" if someone ran SQL outside the tracker.
-- Numbering: 0106 (next free slot after 0105).
-- No backfill: per SPEC, payments + debts are dropped without data migration.

CREATE TABLE financial_transactions (
  id INT NOT NULL AUTO_INCREMENT,
  member_id INT NOT NULL,
  ...
  PRIMARY KEY (id),
  CONSTRAINT fk_financial_tx_member FOREIGN KEY (member_id) REFERENCES users(id),
  CONSTRAINT fk_financial_tx_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_financial_tx_recorder FOREIGN KEY (recorded_by) REFERENCES users(id),
  CONSTRAINT fk_financial_tx_voider FOREIGN KEY (voided_by) REFERENCES users(id),
  INDEX idx_financial_tx_member_id (member_id),
  INDEX idx_financial_tx_kind_voided (kind, voided_at)
);
```

**Analog (DROP half):** `el-templo-api/src/db/migrations/0070_rename_programs_merge_goal_plans.sql` (entire file, 11 lines)

**DROP pattern (analog L8):**

```sql
DROP TABLE `member_goal_plans`;
```

**Apply to 0106:** end the file with:

```sql
DROP TABLE `payments`;
DROP TABLE `debts`;
```

**Note from CONTEXT D-Migration Constraints:** MySQL DDL is not transactional for CREATE/DROP TABLE — order is the only protection. Place CREATEs before DROPs so a partial failure leaves the old tables intact.

---

### `el-templo-api/src/modules/finance/transaction-service.ts` (service — atomicity pattern)

**Primary analog:** `el-templo-api/src/modules/aura/service.ts` (full file, 163 lines) — supplies the **atomic ledger + cache via `db.transaction`** pattern.
**Secondary analog:** `el-templo-api/src/modules/payments/service.ts:37-141` — supplies the **`recordPayment` / `voidPayment` API shape, Spanish error copy, and `this.log.info({...}, "...")` audit logging**.

**Imports pattern (aura/service.ts L1-7 + payments/service.ts L11-16):**

```typescript
import { eq, and, sql, isNull, isNotNull } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { NotFoundError, BadRequestError } from "../shared/errors";
import type {
  CreateTransactionInput,
  VoidTransactionInput,
  TransactionDetail,
} from "./types";
import { BalanceService } from "./balance-service";
```

**Constructor pattern (aura/service.ts L29-33):**

```typescript
type DbInstance = MySql2Database<typeof schema>;

export class TransactionService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
    private readonly balanceService: BalanceService, // injected — facade D-04
  ) {}
}
```

**Atomic write + cache update (aura/service.ts L42-101) — the load-bearing pattern:**

```typescript
async award(input: AwardInput): Promise<number> {
  // ...
  return await this.db.transaction(async (tx) => {
    // Insert ledger entry (unique constraint prevents duplicates)
    await tx.insert(auraTransactions).values({ ... });

    // Upsert balance: INSERT ... ON DUPLICATE KEY UPDATE
    await tx.execute(
      sql`INSERT INTO aura_balances (user_id, balance)
          VALUES (${userId}, ${amount})
          ON DUPLICATE KEY UPDATE balance = balance + ${amount}`,
    );

    // Read and return the new balance
    const balanceRows = await tx
      .select({ balance: auraBalances.balance })
      .from(auraBalances)
      .where(eq(auraBalances.userId, userId));

    this.log?.info({ userId, sourceType, amount, newBalance }, "AURA awarded");
    return newBalance;
  });
}
```

**Apply to `TransactionService.create`:**

1. Open `await this.db.transaction(async (tx) => { ... })`.
2. Validate invariants **before any write** (SPEC §7):
   - Member exists (FK probe).
   - If `links.length > 0`: `Σ allocated_amount === amount`. Throw `BadRequestError("La suma de los montos asignados no coincide con el monto de la transacción")`.
   - If `links.length === 0` and `kind ∉ {advance_payment, adjustment}`: throw.
   - For each link: probe `target_id` exists in the table corresponding to `target_kind` (subscriptions/balances/transactions). Throw `NotFoundError("Concepto enlazado no existe: ...")`.
3. `INSERT` row into `financial_transactions`; capture `insertId`.
4. `INSERT` rows into `transaction_links` (UNIQUE constraint catches dup target tuples).
5. Call `this.balanceService.applyDelta(tx, transactionRow, links, /*sign=*/ +1)` — **same `tx`, same DB transaction**.
6. `this.log.info({ transactionId, memberId, kind, amount, links: links.length }, "Financial transaction created")`.
7. Return the inserted `TransactionDetail`.

**Apply to `TransactionService.void`:** copy the shape of `payments/service.ts voidPayment` (L110-141) — `getById`, throw if already voided (`"La transacción ya fue anulada"`), set `voidedAt/voidedBy/voidReason`. Wrap in `db.transaction` and call `balanceService.applyDelta(tx, tx, links, -1)` to reverse the cache. Log via `this.log.info({ transactionId, voidedBy, reason }, "Financial transaction voided")`.

**Inmutabilidad (SPEC §7 invariant 1):** the service simply **never exposes an `update` method**. The TypeScript surface is the enforcement (no caller can call something that doesn't exist). No SQL trigger needed.

---

### `el-templo-api/src/modules/finance/balance-service.ts` (cache writer)

**Analog:** `el-templo-api/src/modules/aura/service.ts:80-91` (the upsert + read-back block).

**Upsert-with-sign pattern (analog L80-83):**

```typescript
await tx.execute(
  sql`INSERT INTO aura_balances (user_id, balance)
      VALUES (${userId}, ${amount})
      ON DUPLICATE KEY UPDATE balance = balance + ${amount}`,
);
```

**Apply to `BalanceService.applyDelta(tx, transaction, links, sign)`:**

- Loop over links.
- For each link compute `delta = sign * (direction === 'inflow' ? -allocated_amount : +allocated_amount)`. Direction inflow **decrements** the outstanding balance (member paid), outflow increments it (refund / new charge).
- Per link execute:
  ```typescript
  await tx.execute(
    sql`INSERT INTO balances (member_id, target_kind, target_id, currency, amount, last_recomputed_at)
        VALUES (${memberId}, ${targetKind}, ${targetId}, ${currency}, ${delta}, NOW())
        ON DUPLICATE KEY UPDATE amount = amount + ${delta}, last_recomputed_at = NOW()`,
  );
  ```
- D-07: amount=0 row is **kept** (no DELETE). Amount can go negative (saldo a favor) — supported natively by the signed `int`.
- Service surface: `applyDelta` is the **only** mutator. No public update/delete. (D-04 / SPEC §8.)

**No `update`/`delete` public methods** — read-only methods (`getForMember`, `getOutstandingDebtors`) are pure SELECTs.

---

### `el-templo-api/test/finance/transaction-service.test.ts` (integration test)

**Primary analog:** `el-templo-api/test/unit/aura-service.test.ts` (full file, ~80 lines visible) — supplies the **direct service instantiation + per-test cleanup** pattern (no HTTP injection needed for service-only tests).
**Secondary analog:** `el-templo-api/test/payments/payments.test.ts:1-85` — supplies the **realistic seeding via `getAuthToken` + `createPlan` + `createMember` helpers** when the test must touch subscriptions for FK targets.

**Bootstrap pattern (aura-service.test.ts L9-53):**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestApp, registerUser } from "../helpers";
import { TransactionService } from "../../src/modules/finance/transaction-service";
import { BalanceService } from "../../src/modules/finance/balance-service";
import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";

let app: FastifyInstance;
let txService: TransactionService;
let balanceService: BalanceService;
let testUserId: number;

beforeAll(async () => {
  app = await createTestApp();
  balanceService = new BalanceService(app.db, app.log);
  txService = new TransactionService(app.db, app.log, balanceService);
  // ... registerUser, capture testUserId
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.db.execute(sql`DELETE FROM transaction_links`);
  await app.db.execute(sql`DELETE FROM financial_transactions`);
  await app.db.execute(sql`DELETE FROM balances`);
});
```

**Required test cases (D-09 + SPEC §7-9):**

- Invariante inmutabilidad: TS surface — assert `txService.update` is not a function (or just don't write the test; absence of API IS the invariant).
- Invariante suma: 1 link `allocated = amount` (happy); 2 links summing to `amount` (happy); 2 links not summing → expect `BadRequestError` with message containing "suma de los montos asignados".
- Invariante integridad referencial: `target_id` apuntando a `subscription_id` inexistente → expect `NotFoundError`.
- Mantenimiento de cache create: `plan_charge` 90k contra subscription → `balances.amount = -90000` (or `+10000` debtor depending on sign convention chosen — see SPEC §8 example: `pricePaid=100k, charge=90k → balance.amount=10000`). Then `debt_settlement` 5k → `balance.amount = 5000`. Void of debt_settlement → `balance.amount = 10000`.
- `kind='adjustment', links=[]` → succeeds, no balances row created.
- UNIQUE constraint en `transaction_links`: insert duplicate `(transaction_id, target_kind, target_id)` → expect MySQL duplicate key error (catch via `instanceof Error` + check `(err as { cause?: { code?: string } }).cause?.code === 'ER_DUP_ENTRY'`).

---

### `el-templo-api/src/modules/finance/index.ts` (barrel)

**Analog:** `el-templo-api/src/modules/aura/index.ts` (full file, 9 lines).

```typescript
// Module: finance
export { TransactionService } from "./transaction-service";
export { BalanceService } from "./balance-service";
export type {
  CreateTransactionInput,
  VoidTransactionInput,
  TransactionDetail,
  TransactionKind,
  TransactionDirection,
  PaymentMethod,
  TargetKind,
} from "./types";
```

No `routes.ts` export in 105 — Phase 106 will add it.

---

### `el-templo-api/src/modules/finance/types.ts` (types)

**Analog:** `el-templo-api/src/modules/payments/types.ts` (full file, 80 lines) for shape.

**Apply (per D-05 — single source of truth in schema):**

```typescript
import type { financialTransactions, transactionLinks, balances } from "../../db/schema";

export type FinancialTransaction = typeof financialTransactions.$inferSelect;
export type FinancialTransactionRow = typeof financialTransactions.$inferInsert;
export type TransactionKind = FinancialTransaction["kind"];          // inferred from enum
export type TransactionDirection = FinancialTransaction["direction"];
export type PaymentMethod = FinancialTransaction["paymentMethod"];
export type TargetKind = (typeof transactionLinks.$inferSelect)["targetKind"];

export interface CreateTransactionInput {
  memberId: number;
  kind: TransactionKind;
  direction: TransactionDirection;
  amount: number;
  currency?: "ARS" | "EUR" | "USD";
  paymentMethod: PaymentMethod;
  transactionDate: string;
  effectiveDate: string;
  branchId: number;
  notes?: string | null;
  links: Array<{ targetKind: TargetKind; targetId: number; allocatedAmount: number }>;
}

export interface VoidTransactionInput { reason: string; }
export interface TransactionDetail extends FinancialTransaction { links: Array<...>; }
```

---

### `el-templo-api/src/modules/subscriptions/service.ts` callsites

**Pattern at L1117 (analog — current code to replace):**

```typescript
if (this.paymentService && pricePaid > 0) {
  await this.paymentService.recordPayment(
    {
      memberId: userId,
      subscriptionId,
      amount: pricePaid,
      paymentMethod: input.paymentMethod,
      paymentDate: input.startDate,
      notes: input.notes ?? null,
      currency: plan.currency,
    },
    adminId,
  );
}
```

**Replacement (per D-02):**

```typescript
if (this.transactionService && pricePaid > 0) {
  await this.transactionService.create(
    {
      memberId: userId,
      kind: "plan_charge",
      direction: "inflow",
      amount: pricePaid,
      currency: plan.currency,
      paymentMethod: input.paymentMethod,
      transactionDate: input.startDate,
      effectiveDate: input.startDate,
      branchId: input.branchId,
      notes: input.notes ?? null,
      links: [
        {
          targetKind: "subscription",
          targetId: subscriptionId,
          allocatedAmount: pricePaid,
        },
      ],
    },
    adminId,
  );
}
```

Apply identically at L2261 (change-plan, link to `newSubscriptionId`, notes "Cambio de plan: ..."), L2622 (scheduled assignment), L2871 (renewal).

---

### `el-templo-api/src/modules/analytics/service.ts` rewrite (L780-870+)

**Pattern at L788 (current):**

```typescript
const conditions: ReturnType<typeof eq>[] = [
  isNull(schema.payments.voidedAt),
  sql`${schema.payments.paymentDate} >= ${dateFrom}`,
  sql`${schema.payments.paymentDate} <= ${dateTo}`,
];
// ...
.from(schema.payments)
.innerJoin(schema.users, eq(schema.users.id, schema.payments.memberId))
```

**Replacement (per D-01 — revenue real = cobros, no internal movements):**

```typescript
const conditions: ReturnType<typeof eq>[] = [
  isNull(schema.financialTransactions.voidedAt),
  inArray(schema.financialTransactions.kind, ["plan_charge", "debt_settlement"]),
  eq(schema.financialTransactions.direction, "inflow"),
  sql`${schema.financialTransactions.transactionDate} >= ${dateFrom}`,
  sql`${schema.financialTransactions.transactionDate} <= ${dateTo}`,
];
// ...
.from(schema.financialTransactions)
.innerJoin(schema.users, eq(schema.users.id, schema.financialTransactions.memberId))
```

Same pattern for `getRevenueByMethod` (groupBy `paymentMethod`) and `getRevenueByBranch`. The SELECT/aggregate shape is identical — only WHERE table changes.

---

### `el-templo-api/src/modules/reports/service.ts` rewrite (L160-200, L434, L755+)

**Pattern at L169 (current Drizzle query):**

```typescript
.from(schema.payments)
.innerJoin(memberAlias, eq(memberAlias.id, schema.payments.memberId))
```

**Replacement:** `schema.financialTransactions` everywhere, with same `kind IN ('plan_charge','debt_settlement') AND voided_at IS NULL` filter as analytics.

**Pattern at L179 (current raw SQL block):**

```typescript
const rows = await this.db.execute(sql`
  SELECT p.id, p.payment_date AS paymentDate, ... p.amount, p.currency,
         p.payment_method AS paymentMethod, ... p.voided_at AS voidedAt
  FROM payments p
  INNER JOIN users m ON m.id = p.member_id
  INNER JOIN branches b ON b.id = m.branch_id
  INNER JOIN subscriptions s ON s.id = p.subscription_id
  INNER JOIN subscription_plans sp ON sp.id = s.plan_id
  INNER JOIN users r ON r.id = p.recorded_by
  WHERE ...
`);
```

**Replacement:** join `financial_transactions ft` to its `transaction_links tl` on `tl.transaction_id = ft.id AND tl.target_kind = 'subscription'`, then `subscriptions s ON s.id = tl.target_id`. Filter `WHERE ft.kind IN ('plan_charge','debt_settlement') AND ft.voided_at IS NULL`. Keep the same column aliases so the `ChargeReportRow` mapper at L204+ stays untouched (other than `paymentDate` → `transactionDate` if the type renames; planner decides).

---

### `el-templo-api/src/modules/members/service.ts` (L165-282) rewrite

**Pattern at L165-174 (current "Solo deudores" filter):**

```typescript
if (debtorOnly === true) {
  conditions.push(
    sql`EXISTS (
      SELECT 1 FROM debts d
      WHERE d.user_id = users.id AND d.is_cancelled = 0
    )`,
  );
}
```

**Replacement (per D-10 + SPEC §6):**

```typescript
if (debtorOnly === true) {
  conditions.push(
    sql`EXISTS (
      SELECT 1 FROM balances b
      WHERE b.member_id = users.id AND b.amount > 0
    )`,
  );
}
```

The `idx_balances_amount_member(amount, member_id)` index covers this lookup.

**Pattern at L267-282 (current `totalDebtPromise`):**

```typescript
const totalDebtPromise = this.db
  .select({
    currency: schema.debts.currency,
    amount: sql<number>`CAST(SUM(${schema.debts.amount}) AS SIGNED)`,
  })
  .from(schema.debts)
  .innerJoin(schema.users, eq(schema.users.id, schema.debts.userId))
  .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
  .where(and(eq(schema.debts.isCancelled, false), whereClause))
  .groupBy(schema.debts.currency);
```

**Replacement:**

```typescript
const totalDebtPromise = this.db
  .select({
    currency: schema.balances.currency,
    amount: sql<number>`CAST(SUM(${schema.balances.amount}) AS SIGNED)`,
  })
  .from(schema.balances)
  .innerJoin(schema.users, eq(schema.users.id, schema.balances.memberId))
  .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
  .where(and(sql`${schema.balances.amount} > 0`, whereClause))
  .groupBy(schema.balances.currency);
```

**Constructor change:** drop `debtService` parameter (was at L34). Drop `getActiveDebtsForUsers` call (L293) — the per-row `debt: ActiveDebt | null` field on `MemberListItem` either:

- (a) goes away (planner option: rename TS field); OR
- (b) re-derives from `balances` via a single `inArray` query batched after the page SELECT (same shape pattern as `DebtService.getActiveDebtsForUsers` returning `Map<number, T>`).

Recommended (a) — the cleanest semantics: the user already opted in to "Solo deudores" so per-member detail can come from a **separate** dedicated endpoint if Phase 108+ needs it. AlumnosPage's column at L538 just shows aggregate from the banner.

---

### `el-templo-api/src/modules/members/routes.ts` (L23, L84-85, L489-498)

**Current (L23, L84-85, L489-498):**

```typescript
import { DebtService } from "./debts-service";
// ...
const debtService = new DebtService(fastify.db, fastify.log);
const memberService = new MemberService(fastify.db, fastify.log, debtService);
// ...
if (debt === null) {
  await debtService.cancelActiveDebt(request.params.userId);
} else {
  await debtService.upsertActiveDebt(request.params.userId, debt);
}
```

**Replacement:**

- Remove the `DebtService` import (L23).
- Remove `debtService` instance and the third constructor argument (L84-85).
- Delete the debt-handling branch in the PATCH handler (L489-498) and the GET active debt route (L495+).

The route file's CAJA_ROLES gate stays for any other endpoints. (The debt-write endpoint is gone; CAJA_ROLES no longer guards "debt" routes after 105.)

---

### `el-templo-api/src/modules/members/schemas.ts` and `types.ts`

**Pattern (current types.ts L190+):**

```typescript
/** Input accepted by DebtService.upsertActiveDebt. */
export interface DebtUpsertInput { ... }
/** Row returned by DebtService.getTotalDebtByCurrency. */
export interface TotalDebtRow { ... }
```

**Apply:** delete `DebtUpsertInput`, `ActiveDebt`. Keep `TotalDebtRow` (still used by listMembers response, semantics now "outstanding balance" not "debt"). The Zod `updateMemberSchema` must drop the `debt` field; ensure `.strict()` is on the schema (project convention) so legacy admin clients posting `debt` get HTTP 400 (per D-11).

---

### `el-templo-admin/src/components/MemberFormDialog.vue` (L420-464)

**Current (analog — to delete):**

```vue
<!-- ─── Deuda (Phase 101) ─────────────────────────────────────── -->
<q-separator class="q-my-md" />
<div class="text-subtitle2 text-weight-bold">Deuda</div>
<q-toggle
  v-model="form.isDebtor"
  label="Deudor"
  color="negative"
  class="q-mt-sm"
/>
<div v-if="form.isDebtor" class="q-gutter-sm q-mt-sm">
  <!-- amount, currency select, note textarea -->
</div>
```

**Apply:** delete the block entirely. Also remove from `<script setup>`:

- `form.isDebtor`, `form.debtAmount`, `form.debtCurrency`, `form.debtNote` from the reactive form ref + its initial defaults + reset-on-close logic.
- `debtCurrencyOptions` constant.
- `debt` field in the submit payload to `useMembersApi.updateMember(...)`.
- Any `import { DEBT_CURRENCY_OPTIONS, type DebtCurrency } from '...'`.

---

### `el-templo-admin/src/pages/AlumnosPage.vue` (L55, L149, L538)

**No structural changes** — the toggle, banner, and column stay. The data flowing in changes shape only at the type level (debt source = balances). The composable `useMembersApi` is generic over the response so no changes there.

If types.ts renames `MemberListItem.debt` → e.g. `outstandingBalance`, update the column field accessor at L545 and the optional chaining in the column `format` callback.

---

## Shared Patterns

### Atomicity: ledger + cache in one DB transaction

**Source:** `el-templo-api/src/modules/aura/service.ts:42-101`
**Apply to:** `TransactionService.create`, `TransactionService.void`, `BalanceService.applyDelta`

```typescript
return await this.db.transaction(async (tx) => {
  await tx.insert(ledger).values({ ... });
  await tx.execute(sql`INSERT INTO cache (...) VALUES (...) ON DUPLICATE KEY UPDATE ...`);
  this.log.info({ ... }, "...");
  return result;
});
```

**Critical:** the cache update **must** receive the same `tx` parameter (not `this.db`). `BalanceService.applyDelta(tx, ...)` accepts the tx as its first parameter. (D-04 deferred TypeScript brand types to a later phase, but the runtime constraint is real.)

### Error types

**Source:** `el-templo-api/src/modules/shared/errors.ts:17, 29` (`NotFoundError`, `BadRequestError` extend `AppError`)
**Apply to:** all `TransactionService` validation throws. Spanish messages per project convention (`payments/service.ts:48,69,117,121` for tone — short, direct, no English).

```typescript
throw new BadRequestError(
  "La suma de los montos asignados no coincide con el monto",
);
throw new NotFoundError("Suscripcion no encontrada");
throw new BadRequestError("La transacción ya fue anulada");
```

### Logging

**Source:** `el-templo-api/src/modules/payments/service.ts:93-101, 138`
**Apply to:** all `TransactionService` mutations.

```typescript
this.log.info(
  {
    transactionId,
    memberId,
    kind,
    amount,
    recordedBy,
    linkCount: links.length,
  },
  "Financial transaction created",
);
this.log.info(
  { transactionId, voidedBy, reason },
  "Financial transaction voided",
);
```

Never `console.log` (CLAUDE.md). Use `request.log` in routes (Phase 106+), `this.log` in services.

### Test bootstrap

**Source:** `el-templo-api/test/unit/aura-service.test.ts:9-53`
**Apply to:** `test/finance/transaction-service.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestApp, registerUser } from "../helpers";
// ... beforeAll: createTestApp + registerUser
// ... beforeEach: DELETE FROM transaction_links / financial_transactions / balances
// ... afterAll: app.close()
```

For tests that require a real subscription target_id (FK probe in invariant 3), use `createTestPlan` + `assignTestPlan` from `test/helpers.ts:235-320`.

### Module barrel

**Source:** `el-templo-api/src/modules/aura/index.ts` (9 lines)
**Apply to:** `modules/finance/index.ts` — only re-export classes + types. No `routes` export until Phase 106.

### Schema barrel updates

**Source:** `el-templo-api/src/db/schema/index.ts:36-37` (lines to remove)
**Apply:**

```typescript
// remove
export * from "./payments";
export * from "./debts";
// add (alphabetical with siblings)
export * from "./financial-transactions";
export * from "./transaction-links";
export * from "./balances";
```

### Frontend logging convention

**Source:** project CLAUDE.md — `createLogger()` from `src/utils/logger.ts`
**Apply to:** any new admin code (none expected — only deletions in 105). Confirm no `console.*` slips into `MemberFormDialog.vue` or `AlumnosPage.vue` during the surgical edits.

---

## No Analog Found

None. Every new file in this phase has a strong codebase analog. The 3-table cache pattern (transactional ledger + cache + pivot links) is **closer** to the `aura_transactions` + `aura_balances` shape than to anything else in the codebase, and the void/recordedBy/branchId columns map 1:1 to `payments`. The discriminated-target `(target_kind, target_id)` shape on `transaction_links` is a direct lift from `aura_transactions.referenceType + referenceId`.

---

## Metadata

**Analog search scope:**

- `el-templo-api/src/db/schema/` (all 50 files)
- `el-templo-api/src/db/migrations/` (recent CREATE: 0096, 0103, 0105; DROP example: 0070)
- `el-templo-api/src/modules/payments/` (full module — primary analog for service shape + types)
- `el-templo-api/src/modules/aura/` (full module — primary analog for atomic ledger + cache pattern)
- `el-templo-api/src/modules/members/` (debts-service.ts + service.ts L160-290 + routes.ts L23,L84,L489)
- `el-templo-api/src/modules/subscriptions/service.ts` (constructor L108-116 + 4 callsites L1117/L2261/L2622/L2871)
- `el-templo-api/src/modules/analytics/service.ts:780-880`
- `el-templo-api/src/modules/reports/service.ts:160-200`
- `el-templo-api/src/jobs/auto-resume-pauses.ts` (full file)
- `el-templo-api/src/app.ts:24,L120` (paymentRoutes register)
- `el-templo-api/src/modules/auth/routes.ts:155-163`
- `el-templo-api/test/helpers.ts` (full file)
- `el-templo-api/test/unit/aura-service.test.ts` (bootstrap pattern)
- `el-templo-api/test/payments/payments.test.ts:1-100`
- `el-templo-api/test/members/debts.test.ts:1-60`
- `el-templo-admin/src/components/MemberFormDialog.vue:410-480`
- `el-templo-admin/src/pages/AlumnosPage.vue:40-60, 140-160, 525-545`
- `el-templo-admin/src/types/member.ts:60-200`
- `el-templo-admin/src/composables/useMembersApi.ts` (full)

**Files scanned:** 24 source files + 5 migration files + 4 test files = 33 files
**Pattern extraction date:** 2026-04-28
