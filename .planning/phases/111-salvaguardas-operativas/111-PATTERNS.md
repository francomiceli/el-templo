# Phase 111: Salvaguardas operativas — Pattern Map

**Mapped:** 2026-05-01
**Files analyzed:** 16 (5 new + 11 modified)
**Analogs found:** 16 / 16

## File Classification

| File                                                                                                      | New/Modified | Role                           | Data Flow         | Closest Analog                                                                                                                                              | Match Quality |
| --------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `el-templo-api/src/db/schema/audit-log.ts`                                                                | NEW          | model (Drizzle schema)         | CRUD              | `el-templo-api/src/db/schema/subscription-schedule-changes.ts`                                                                                              | exact         |
| `el-templo-api/src/modules/shared/audit-log.ts`                                                           | NEW          | utility (transactional helper) | CRUD (write-only) | `el-templo-api/src/modules/shared/branch-access.ts` (helper shape) + `el-templo-api/src/modules/finance/transaction-service.ts:229-280` (tx-handle pattern) | role-match    |
| `el-templo-api/src/modules/shared/phone.ts`                                                               | NEW          | utility (pure function)        | transform         | `el-templo-api/src/modules/shared/date-utils.ts:15-19` (pure helper export)                                                                                 | role-match    |
| `el-templo-api/src/db/migrations/01XX_create_audit_log.sql`                                               | NEW          | migration (DDL)                | CRUD              | `el-templo-api/src/db/migrations/0096_debts_table.sql`                                                                                                      | exact         |
| `el-templo-api/src/db/migrations/01XX_reconcile_soledad_mailland.sql`                                     | NEW          | migration (DML idempotent)     | batch             | `el-templo-api/src/db/migrations/0107_admin_users_by_country.sql` (idempotent UPDATE/INSERT IGNORE pattern)                                                 | role-match    |
| `el-templo-api/src/modules/members/routes.ts` (extend with `/check-duplicates`)                           | MODIFIED     | controller (route handler)     | request-response  | same file lines 184-190 (`/check-dni`)                                                                                                                      | exact         |
| `el-templo-api/src/modules/members/service.ts` (extend `checkDuplicates` + trim names)                    | MODIFIED     | service (business logic)       | CRUD              | same file `checkDniUniqueness` lines 607-635                                                                                                                | exact         |
| `el-templo-api/src/modules/subscriptions/service.ts` (REQ-1 validation + REQ-3 guard + REQ-7 audit calls) | MODIFIED     | service                        | CRUD + validation | same file `assignPlan` lines 770-1158 (existing guards 797-807)                                                                                             | exact         |
| `el-templo-api/src/modules/finance/transaction-service.ts` (REQ-7 audit call in `void`)                   | MODIFIED     | service                        | CRUD              | same file `void` lines 229-280                                                                                                                              | exact         |
| `el-templo-api/src/modules/auth/routes.ts` (REQ-5 phone block + REQ-9 trim)                               | MODIFIED     | controller                     | request-response  | same file lines 49-79 (existing email/dni 409 pattern)                                                                                                      | exact         |
| `el-templo-admin/src/components/AssignPlanDialog.vue` (REQ-2 filter + banner)                             | MODIFIED     | component (Vue/Quasar)         | event-driven      | same file `filteredPlans` lines 768-775 + `loadPlans` 973-988                                                                                               | exact         |
| `el-templo-admin/src/components/MemberFormDialog.vue` (REQ-4 lookup on-blur)                              | MODIFIED     | component                      | event-driven      | same file `onDniChange` lines 615-635 + DNI input lines 94-116                                                                                              | exact         |
| `el-templo-admin/src/composables/useMembersApi.ts` (REQ-4 `checkDuplicates`)                              | MODIFIED     | composable                     | request-response  | same file `checkDni` lines 151-167                                                                                                                          | exact         |
| `el-templo-admin/src/pages/AlumnoDetailPage.vue` (REQ-6 remove delete + D-27 badge order)                 | MODIFIED     | page                           | event-driven      | self (lines 54-92, 102-110, 532-571) — pure removal + reorder                                                                                               | n/a           |
| `el-templo-admin/src/utils/phone.ts` (frontend mirror, optional)                                          | NEW (D-25)   | utility                        | transform         | `el-templo-api/src/modules/shared/phone.ts` (1:1 mirror)                                                                                                    | exact         |

## Pattern Assignments

### `el-templo-api/src/db/schema/audit-log.ts` (model, CRUD)

**Analog:** `el-templo-api/src/db/schema/subscription-schedule-changes.ts:1-50`

**Imports + table definition pattern** (lines 1-36 of analog):

```typescript
import {
  mysqlTable,
  int,
  json,
  text,
  timestamp,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

export const subscriptionScheduleChanges = mysqlTable(
  "subscription_schedule_changes",
  {
    id: int("id").primaryKey().autoincrement(),
    actorId: int("actor_id")
      .references(() => users.id)
      .notNull(),
    oldScheduleIds: json("old_schedule_ids").$type<number[]>().notNull(),
    newScheduleIds: json("new_schedule_ids").$type<number[]>().notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_sub_schedule_changes_sub_id").on(table.subscriptionId),
  ],
);
```

**Adaptations for `audit_log`** (per CONTEXT D-12):

- Add `action: varchar("action", { length: 50 })` — values `'subscription_cancelled' | 'transaction_voided' | 'plan_assigned' | 'reconciliation'`. Use `mysqlEnum` if planner prefers compile-time safety (precedent: `financial-transactions.ts:26-32` uses `mysqlEnum("kind", ...)`).
- Add `targetKind: varchar("target_kind", { length: 30 })` and `targetId: int("target_id").notNull()` (no FK — heterogeneous, mirror `transaction-links.ts:24-29` pattern).
- Add `payloadJson: json("payload_json").$type<Record<string, unknown>>().notNull()` (or per-action discriminated union type).
- Indexes per D-12: `(action, createdAt)`, `(targetKind, targetId)`, `(actorId, createdAt)`.
- Register export in `el-templo-api/src/db/schema/index.ts` (next to line 36 `export * from "./subscription-schedule-changes"`).
- Skip `relations(...)` block unless planner identifies a query that needs ORM joins (Phase 110 audit had no relations needed).

**Key pattern note:** No `.references()` for `target_id` (matches `transaction-links.ts:24-29` heterogeneous-FK precedent — enforcement at service layer).

---

### `el-templo-api/src/modules/shared/audit-log.ts` (utility, transactional helper)

**Analog 1 (helper shape):** `el-templo-api/src/modules/shared/branch-access.ts` — established pattern of `modules/shared/` exports (Phase 110 D-01).

**Analog 2 (tx-handle parameter):** `el-templo-api/src/modules/finance/transaction-service.ts:76-84`:

```typescript
async create(
  input: CreateTransactionInput,
  recordedBy: number,
  tx?: TxHandle,
): Promise<TransactionDetail> {
  const runner = tx
    ? <T>(cb: (h: TxHandle) => Promise<T>): Promise<T> => cb(tx)
    : <T>(cb: (h: TxHandle) => Promise<T>): Promise<T> =>
        this.db.transaction(cb);
```

**Adaptation for `auditLog.write`** (per CONTEXT D-14):

- Signature: `auditLog.write(tx: TxHandle, params: { actorId, action, targetKind, targetId, payload, reason? })`
- For Phase 111, `tx` is **required** (not optional) — every call site (cancelSubscription, void, assignPlan) already wraps in `db.transaction(...)`. Atomicity is the contract.
- Implementation: single `tx.insert(schema.auditLog).values({...})` call. No own transaction.
- Export as named function (project convention — `member-search.ts`, `date-utils.ts` all export named functions, not classes).
- Logging: `request.log` is not available here; pass through silently. The caller's transaction owns observability.

**TxHandle type source:** Already imported in `transaction-service.ts:79`. Reuse the same `TxHandle` type alias (likely defined in `finance/types.ts`).

---

### `el-templo-api/src/modules/shared/phone.ts` (utility, transform)

**Analog:** `el-templo-api/src/modules/shared/date-utils.ts:15-19`:

```typescript
/**
 * Add days to an ISO date string ("YYYY-MM-DD") and return new ISO date string.
 * Uses noon UTC to avoid DST/day-boundary drift.
 */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}
```

**Adaptation for `normalizePhone`** (per CONTEXT D-24):

```typescript
/**
 * Normalize a phone string to "last 10 digits" — AR mobile convention.
 * Strips all non-digits, then keeps the trailing 10. Empty input → empty string.
 */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, "").slice(-10);
}
```

**Test pattern (per D-24 unit tests):** Place in `el-templo-api/test/shared/phone.test.ts` (create `shared/` if it doesn't exist; precedent: `test/branch-access.test.ts`, `test/country-scope.test.ts` are direct test files for shared helpers — planner can choose flat or nested).

---

### `el-templo-api/src/db/migrations/01XX_create_audit_log.sql` (migration, DDL)

**Analog:** `el-templo-api/src/db/migrations/0096_debts_table.sql:1-32`:

```sql
-- Phase 101: Debt tracking — create debts table
--
-- Idempotency: the _migrations tracker prevents a successful file from
-- running twice. `CREATE TABLE` (no IF NOT EXISTS) is intentional — the
-- run-migrations.ts runner surfaces "table already exists" as a clear
-- error if someone manually applied the SQL outside the tracker.

CREATE TABLE debts (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  amount INT NOT NULL,
  ...
  PRIMARY KEY (id),
  CONSTRAINT fk_debts_user_id FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_debts_user_id (user_id),
  INDEX idx_debts_user_active (user_id, is_cancelled)
);
```

**Generation note (CLAUDE.md):** This SQL file is **generated** by `pnpm db:generate` from the Drizzle schema. Do not hand-write — let drizzle-kit emit it, then commit. The header comment block above (Phase X / idempotency note) is added manually after generation. Number is next free slot (0108 expected, but check `migrations/` at plan time).

**Critical (Phase 103-01 precedent):** SQL line comments must NOT contain inline semicolons — `run-migrations.ts` splits on `;` BEFORE stripping comments.

---

### `el-templo-api/src/db/migrations/01XX_reconcile_soledad_mailland.sql` (migration, DML idempotent)

**Analog:** `el-templo-api/src/db/migrations/0107_admin_users_by_country.sql:1-36` (idempotent backfill pattern):

```sql
-- Phase 110: Admin users por pais + multi-sede staff
--
-- Idempotency: the _migrations tracker prevents a successful file from running
-- twice. Defensive UPDATE guarded by IS NULL and INSERT IGNORE keep partial
-- replays safe.

UPDATE users
SET country = (SELECT country FROM branches WHERE branches.id = users.branch_id)
WHERE role IN ('admin', 'gestion') AND country IS NULL;

INSERT IGNORE INTO user_branches (user_id, branch_id)
SELECT id, branch_id FROM users WHERE role IN ('coach', 'recepcion');
```

**Adaptation for Soledad reconcile** (per CONTEXT D-18, D-19):

- Each `UPDATE` carries a guard in `WHERE` so re-execution is no-op:
  - `UPDATE financial_transactions SET member_id=5912 WHERE id=34 AND member_id=5588;`
  - `UPDATE transaction_links SET target_id=6382 WHERE transaction_id=34 AND target_id=6132;`
  - `DELETE FROM balances WHERE id IN (14, 16, 20) AND member_id IN (5588, 5912);`
  - `UPDATE program_enrollments SET status='cancelled', cancelled_at=NOW() WHERE id=1125 AND status='active';`
  - `INSERT INTO audit_log (...) SELECT ... WHERE NOT EXISTS (SELECT 1 FROM audit_log WHERE action='reconciliation' AND target_id=5912)` — guard the audit insert by content (avoid duplicate row on replay).
- Header comment must reference Phase 111 + idempotency strategy (mirror 0107 header verbatim).
- **No semicolons inside line comments** (Phase 103-01 caveat).

---

### `el-templo-api/src/modules/members/routes.ts` — new `GET /check-duplicates` (controller)

**Analog (same file):** lines 180-190:

```typescript
// =========================================================================
// DNI Check (must be defined BEFORE :userId param routes)
// =========================================================================

// GET /admin/members/check-dni?dni=X&excludeUserId=Y
fastify.get<{
  Querystring: { dni: string; excludeUserId?: number };
}>("/check-dni", { schema: checkDniSchema }, async (request) => {
  const { dni, excludeUserId } = request.query;
  return memberService.checkDniUniqueness(dni, excludeUserId);
});
```

**Adaptation for `/check-duplicates`** (per D-06):

- Querystring: `{ dni?: string; phone?: string; excludeUserId?: number }` (both optional, at least one required — validate in handler or schema).
- Place this route definition **before any `:userId` param routes** (same comment block already documents this constraint).
- Add a new schema export to `members/schemas.ts` (sibling file — mirror `checkDniSchema`).
- Service call: `memberService.checkDuplicates({ dni, phone })`.
- Response shape (per D-06): `{ matches: [{ id, firstName, lastName, branchId, branchName, isVirtual, status, deletedAt, matchedField }] }`.

---

### `el-templo-api/src/modules/members/service.ts` — new `checkDuplicates` + name trim (service)

**Analog (same file):** `checkDniUniqueness` lines 607-635:

```typescript
async checkDniUniqueness(
  dni: string,
  excludeUserId?: number,
): Promise<DniCheckResult> {
  const conditions = [eq(schema.users.dni, dni)];

  if (excludeUserId !== undefined) {
    conditions.push(ne(schema.users.id, excludeUserId));
  }

  const [existing] = await this.db
    .select({
      id: schema.users.id,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
    })
    .from(schema.users)
    .where(and(...conditions))
    .limit(1);

  if (existing) {
    const name = [existing.firstName, existing.lastName].filter(Boolean).join(" ");
    return { available: false, existingMemberName: name || "Unknown" };
  }

  return { available: true };
}
```

**Adaptation for `checkDuplicates`** (per D-05, D-06):

- Two independent OR-branches in the WHERE: `eq(users.dni, dniInput)` OR `<phone-match-expr>`.
- **Phone match SQL expression** (D-05 — runtime normalization, no new column):
  ```typescript
  // Last 10 digits comparison, MySQL-side
  sql`RIGHT(REGEXP_REPLACE(${schema.users.phone}, '[^0-9]', ''), 10) = ${normalizedInput}`;
  ```
  Use `import { sql } from "drizzle-orm"`. Normalize the input via `normalizePhone()` before sending.
- Exclude `deletedAt IS NOT NULL` — `isNull(schema.users.deletedAt)` from `drizzle-orm`.
- JOIN `branches` to project `branchName` and `isVirtual` (precedent: `assignPlan` lines 777-786 inner-joins branches).
- Return `{ matches: Array<{...}> }` (array, not just first match — D-06 explicit).

**Name-trim adaptation (REQ-9, D-26):** in `createMember` (lines 405-449) and `updateMember` (lines 454-500), apply `.trim()` to `firstName` and `lastName` before insert/update:

```typescript
const result = await this.db.insert(schema.users).values({
  ...
  firstName: input.firstName.trim(),
  lastName: input.lastName.trim(),
  ...
});
```

---

### `el-templo-api/src/modules/subscriptions/service.ts` — REQ-1 / REQ-3 / REQ-7 (service)

**Analog 1 (REQ-1 validation insert):** existing guards in same file at lines 797-807:

```typescript
if (!plan.isActive) {
  throw new BadRequestError("El plan seleccionado no esta activo");
}
if (plan.isArchived) {
  throw new BadRequestError("No se puede asignar un plan archivado");
}
if (plan.country !== member.branchCountry) {
  throw new BadRequestError("El plan no corresponde al pais de la sucursal");
}
```

**REQ-1 insertion point:** After existing `plan.country !== member.branchCountry` guard (around line 807). New guard:

```typescript
// REQ-1: Reject presencial plan on virtual branch — admin must convert member first.
const [memberBranch] = await this.db
  .select({ isVirtual: schema.branches.isVirtual })
  .from(schema.branches)
  .where(eq(schema.branches.id, member.branchId));
if (plan.planCategory === "presencial" && memberBranch?.isVirtual === true) {
  throw new BadRequestError(
    "Plan presencial requiere sede física. Convertí al alumno primero.",
  );
}
```

Reuse `isOnlinePlan` from `./types` (line 30) to invert: `!isOnlinePlan(plan.planCategory) && memberBranch.isVirtual` if planner prefers the helper over literal `=== "presencial"`.

**Analog 2 (REQ-3 cancel guard):** `cancelSubscription` lines 1881-1955. Insertion point: between line 1899 (existing status guard) and line 1901 (updateData):

```typescript
// REQ-3: Block cancellation if there are active (non-voided) charge transactions.
const activeLinks = await this.db
  .select({
    txId: schema.financialTransactions.id,
    amount: schema.financialTransactions.amount,
    currency: schema.financialTransactions.currency,
  })
  .from(schema.transactionLinks)
  .innerJoin(
    schema.financialTransactions,
    eq(schema.transactionLinks.transactionId, schema.financialTransactions.id),
  )
  .where(
    and(
      eq(schema.transactionLinks.targetKind, "subscription"),
      eq(schema.transactionLinks.targetId, sub.id),
      isNull(schema.financialTransactions.voidedAt),
    ),
  );
if (activeLinks.length > 0) {
  // Structured error (Phase 110 D-05 pattern). See "Shared Patterns" below.
  throw new BadRequestError(JSON.stringify({
    message: "Hay transacciones de cobro activas en esta suscripción. Anulalas primero (Detalle Financiero → Anular) y volvé a intentar.",
    code: "SUB_HAS_ACTIVE_TRANSACTIONS",
    details: { transactionIds: activeLinks.map(l => l.txId), totalAmount: ..., currency: ... },
  }));
}
```

**Note for planner:** the current `BadRequestError` constructor accepts a single string. Two options:

1. Extend `BadRequestError` to accept `{ code, details }` (preferred — affects all 4xx call sites globally; out of scope per CONTEXT minimalism).
2. Throw structured body from the route layer (catch BadRequestError in route, attach code/details). Recommended: do this in `subscriptions/routes.ts` similar to existing 409 handling at `members/routes.ts:520-539`.

**Analog 3 (REQ-7 audit_log call sites):** all three live inside existing `db.transaction(...)` blocks. Pattern (after every state mutation, before the transaction returns):

In `cancelSubscription` lines 1914-1942, after `this.recomputeUserStatus(userId, tx)`:

```typescript
await auditLog.write(tx, {
  actorId, // pass through from caller (request.user.userId)
  action: "subscription_cancelled",
  targetKind: "subscription",
  targetId: sub.id,
  payload: {
    subId: sub.id,
    prevStatus: sub.status,
    newStatus: "cancelled",
    cancelledAt: new Date().toISOString(),
    notes,
    hasActiveTx: false, // by definition — REQ-3 already blocked active tx
  },
  reason: notes ?? null,
});
```

**Important signature change:** `cancelSubscription(userId, notes?)` does **not** currently take `actorId`. Phase 111 plan must add an `actorId` param (passed from route handler that has `request.user.userId`). Same for `assignPlan` — already takes `adminId` (line 773), use that.

---

### `el-templo-api/src/modules/finance/transaction-service.ts` — REQ-7 audit call (service)

**Analog (same file):** `void` lines 229-280:

```typescript
async void(
  id: number,
  voidedBy: number,
  input: VoidTransactionInput,
): Promise<TransactionDetail> {
  return await this.db.transaction(async (tx) => {
    ...
    await this.balanceService.applyDelta(tx, existing, linkRows, -1);
    const [updatedRow] = await tx.select()...
    this.log.info(
      { transactionId: id, voidedBy, reason: input.reason },
      "Financial transaction voided",
    );
    return { ...updatedRow, links: linkRows };
  });
}
```

**REQ-7 insertion point:** Inside the `db.transaction(async (tx) => {...})`, between `applyDelta` (line 266) and the final `select` (line 268):

```typescript
await auditLog.write(tx, {
  actorId: voidedBy,
  action: "transaction_voided",
  targetKind: "transaction",
  targetId: id,
  payload: {
    txId: id,
    amount: existing.amount,
    currency: existing.currency,
    voidedAt: new Date().toISOString(),
    voidReason: input.reason,
    links: linkRows.map((l) => ({
      targetKind: l.targetKind,
      targetId: l.targetId,
      allocatedAmount: l.allocatedAmount,
    })),
  },
  reason: input.reason,
});
```

---

### `el-templo-api/src/modules/auth/routes.ts` — REQ-5 phone block + REQ-9 trim (controller)

**Analog (same file):** lines 49-79 (existing email/dni 409 block):

```typescript
// Reject if email already exists
const [existingByEmail] = await fastify.db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.email, email))
  .limit(1);

if (existingByEmail) {
  return reply.code(409).send({
    error: "Email en uso",
    message: "Ya existe una cuenta con este email. Intentá iniciar sesión.",
  });
}
```

**REQ-5 adaptation (D-08):** add a new block after the dni check (line 79), before branch resolution:

```typescript
// REQ-5: Block duplicate phone (any non-deleted user, normalized AR last-10).
if (phone) {
  const normalized = normalizePhone(phone);
  if (normalized.length > 0) {
    const [existingByPhone] = await fastify.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          sql`RIGHT(REGEXP_REPLACE(${users.phone}, '[^0-9]', ''), 10) = ${normalized}`,
          isNull(users.deletedAt),
        ),
      )
      .limit(1);
    if (existingByPhone) {
      return reply.code(409).send({
        error: "Conflict",
        message: "Esta persona ya tiene cuenta. Iniciá sesión o contactanos.",
        code: "PHONE_ALREADY_REGISTERED",
      });
    }
  }
}
```

**REQ-9 trim insertion** at line 116 (existing insert block):

```typescript
const result = await fastify.db.insert(users).values({
  email,
  passwordHash,
  branchId,
  firstName: firstName.trim(),
  lastName: lastName.trim(),
  ...
});
```

---

### `el-templo-admin/src/components/AssignPlanDialog.vue` — REQ-2 filter + banner CTA (component)

**Analog 1 (filter logic):** same file lines 768-775:

```typescript
const filteredPlans = computed(() => {
  if (!props.categoryFilter) return plans.value;
  if (props.categoryFilter === "presencial") {
    return plans.value.filter((p) => p.planCategory === "presencial");
  }
  return plans.value.filter((p) => p.planCategory !== "presencial");
});
```

**Adaptation:** Extend `filteredPlans` to also drop presencial when `props.member.branch.isVirtual === true`:

```typescript
const filteredPlans = computed(() => {
  let list = plans.value;
  // REQ-2: virtual-branch members cannot receive presencial plans.
  if (props.memberBranchIsVirtual) {
    list = list.filter((p) => p.planCategory !== "presencial");
  }
  if (props.categoryFilter === "presencial") {
    return list.filter((p) => p.planCategory === "presencial");
  }
  // ...rest of existing logic
  return list;
});
```

**Note:** add a new prop `memberBranchIsVirtual: boolean` (parent component already has the data — `AlumnoDetailPage` reads `memberProfile.branchId` and the `branches` list).

**Analog 2 (banner template):** same file lines 113-119:

```vue
<q-banner v-if="isFutureStart" dense rounded class="bg-blue-1 q-mb-md">
  <template #avatar><q-icon name="schedule" /></template>
  ...
</q-banner>
```

**Adaptation (D-02):** Render a `q-banner` above/within the plan list when `props.memberBranchIsVirtual && plansByTier.length === 0` (or always when virtual, depending on UX). Banner action button opens `MemberFormDialog` mode='edit' as a stacked dialog (Quasar supports this natively — the existing `q-dialog` wraps everything; just `<MemberFormDialog v-model="showEditFromAssign" :member="member" mode="edit" />` inside the same template).

**Analog 3 (refetch after dialog close — D-03):** same file `loadPlans` lines 973-988. Already calls `subsApi.getPlans(true, { branchId: props.memberBranchId })`. Add a watcher:

```typescript
watch(
  () => props.memberBranchId,
  (newId, oldId) => {
    if (newId !== oldId) loadPlans();
  },
);
```

---

### `el-templo-admin/src/components/MemberFormDialog.vue` — REQ-4 lookup on-blur (component)

**Analog 1 (DNI input + check):** same file lines 94-116 (input) + 615-635 (handler):

```vue
<q-input
  v-model="form.dni"
  label="DNI *"
  ...
  :error="dniStatus === 'taken'"
  :error-message="`DNI ya registrado para ${dniExistingName}`"
  debounce="500"
  @update:model-value="onDniChange"
>
  <template #append>
    <q-spinner v-if="dniStatus === 'checking'" size="xs" color="grey" />
    <q-icon v-else-if="dniStatus === 'available'" name="check_circle" color="positive" size="xs" />
  </template>
</q-input>
```

```typescript
async function onDniChange(val: string | number | null) {
  const dni = typeof val === "string" ? val.trim() : "";
  if (!dni || dni.length < 3) {
    dniStatus.value = "idle";
    return;
  }
  dniStatus.value = "checking";
  try {
    const excludeUserId = props.member?.id;
    const result = await membersApi.checkDni(dni, excludeUserId);
    if (result.available) dniStatus.value = "available";
    else {
      dniStatus.value = "taken";
      dniExistingName.value = result.existingMemberName ?? "Desconocido";
    }
  } catch {
    dniStatus.value = "idle";
  }
}
```

**Adaptation (D-07):** Replace `onDniChange` (and add `onPhoneChange`) so both call the new `checkDuplicates` and store an `existingMatch: { id, firstName, lastName, branchName } | null` ref. When match exists:

- Render an inline row below the input (not a modal) with text "Ya existe: {firstName} {lastName} ({branchName})" and a `<router-link to="/alumnos/:id">Ver alumno</router-link>` (Quasar pattern — use `<q-btn flat dense :to="...">`).
- Compute `submitDisabled = computed(() => existingMatch.value !== null)` and bind to the form's submit button `:disable="submitDisabled"`.
- Apply only in **create mode** (per D-07): wrap calls with `if (!props.member) {...}`.
- Use `debounce="300"` on the `q-input` (lower than DNI's 500 per D-07).

---

### `el-templo-admin/src/composables/useMembersApi.ts` — REQ-4 `checkDuplicates` (composable)

**Analog (same file):** `checkDni` lines 151-167:

```typescript
async function checkDni(
  dni: string,
  excludeUserId?: number,
): Promise<DniCheckResult> {
  loading.value = true;
  error.value = null;
  try {
    const params: Record<string, unknown> = { dni };
    if (excludeUserId !== undefined) params.excludeUserId = excludeUserId;
    const { data } = await api.get<DniCheckResult>("/admin/members/check-dni", {
      params,
    });
    return data;
  } catch (err: unknown) {
    error.value = extractError(err, "Error verificando DNI");
    throw err;
  } finally {
    loading.value = false;
  }
}
```

**Adaptation:** mirror exactly with new types + endpoint:

```typescript
interface DuplicateMatch {
  id: number;
  firstName: string;
  lastName: string;
  branchId: number;
  branchName: string;
  isVirtual: boolean;
  status: string;
  deletedAt: string | null;
  matchedField: "dni" | "phone";
}
async function checkDuplicates(opts: {
  dni?: string;
  phone?: string;
}): Promise<{ matches: DuplicateMatch[] }> {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await api.get<{ matches: DuplicateMatch[] }>(
      "/admin/members/check-duplicates",
      { params: opts },
    );
    return data;
  } catch (err: unknown) {
    error.value = extractError(err, "Error verificando duplicados");
    throw err;
  } finally {
    loading.value = false;
  }
}
```

Add to the returned object at line 384 alongside `checkDni`.

---

### `el-templo-admin/src/pages/AlumnoDetailPage.vue` — REQ-6 + D-27 (page)

**Removal targets** (REQ-6 / D-21, D-22):

- Lines 102-110: `<q-btn ... label="Eliminar" />` block — delete entirely (no `v-if="false"` shim).
- Lines 532-535: `canDeleteMember` computed.
- Lines 539-571 area: `canConfirmDelete`, `onCancelDelete`, `onConfirmDelete`, `deleting` ref, `showDeleteDialog` ref, `deleteConfirmInput` ref.
- The corresponding `<q-dialog v-model="showDeleteDialog">` template block (find with grep — likely 200-250 line range).
- Imports: drop `deleteMember` from `membersApi` destructure if it's locally pulled (composable line 95 keeps it — no change needed there per D-22).

**D-27 reorder:** Move the segment + avatar `q-badge` block (lines 67-93) from the right `column items-end` wrapper into the left name/details `<div class="col">` (lines 43-58), placed **after** the status badge (line 54-58). Result HTML structure:

```vue
<div class="col">
  <div class="text-h5">{{ memberName }}</div>
  <div class="text-caption text-grey-7">{{ levelDisplayName(...) }} · {{ branchName }}</div>
  <div class="row items-center q-gutter-xs q-mt-xs">
    <q-badge :color="getStatusColor(...)" :label="getStatusLabel(...)" class="text-body2" />
    <q-badge v-if="memberProfile.segment" :color="..." :label="..." outline class="text-body2" />
    <q-badge v-if="memberProfile.avatarType" color="primary" :label="..." outline class="text-body2" />
  </div>
</div>
<div class="column items-end q-gutter-sm">
  <!-- only the action buttons remain here -->
</div>
```

---

### `el-templo-admin/src/utils/phone.ts` — frontend mirror (D-25)

**Analog:** `el-templo-api/src/modules/shared/phone.ts` (the new backend file). 1:1 copy:

```typescript
/**
 * Normalize a phone string to "last 10 digits" — AR mobile convention.
 * Mirrors el-templo-api/src/modules/shared/phone.ts (kept in sync manually
 * since admin and api are separate apps without shared TS package).
 */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, "").slice(-10);
}
```

**Decision (per D-25):** Plan-phase decides whether to share via a workspace package or duplicate. Current monorepo has no shared TS package — duplication with synchronizer comment is the lowest-effort path. Frontend tests in `el-templo-admin/test/` if directory exists; otherwise add to `el-templo-admin/src/utils/__tests__/phone.spec.ts`.

---

## Shared Patterns

### Structured 4xx error body (Phase 110 D-05)

**Source pattern:** `el-templo-api/src/modules/shared/branch-access.ts:184-198`:

```typescript
return reply.code(403).send({
  error: "Forbidden",
  message: "No tenés acceso a esta sede",
  code: BRANCH_OUT_OF_SCOPE,
});
```

**Apply to:**

- REQ-3 cancel-sub block (`code: 'SUB_HAS_ACTIVE_TRANSACTIONS'` + `details.transactionIds`) — emitted from `subscriptions/routes.ts` route handler (catch BadRequestError, parse JSON message, re-emit with shape).
- REQ-5 phone-duplicate block (`code: 'PHONE_ALREADY_REGISTERED'`) — emitted directly in `auth/routes.ts` register handler.

**Frontend match contract:** admin reads `err.response.data.code` for exact-match handling, `err.response.data.message` for user-facing display. Existing helper `extractError` (`el-templo-admin/src/utils/extract-error.ts:7`) already handles axios error unwrap.

### 4xx logging (Phase 110 D-06)

**Source pattern:** same file lines 184-193:

```typescript
request.log.warn(
  {
    userId: request.user?.userId,
    role: request.user?.role,
    branchId,
    scope: request.scope,
  },
  BRANCH_OUT_OF_SCOPE,
);
```

**Apply to:** REQ-3 and REQ-5 4xx returns. Use `request.log.warn`, never `request.log.error` (4xx is user error, not system error — keeps Sentry clean).

### Transactional helper invocation (Phase 110 D-01 + D-09)

**Source pattern:** `transaction-service.ts:76-84` accepts `tx?: TxHandle`; `assignPlan` at `subscriptions/service.ts` already passes `tx` into nested operations.

**Apply to:** All 3 audit_log call sites pass the surrounding transaction's `tx` handle to `auditLog.write(tx, {...})`. Atomicity is the contract: if the surrounding transaction rolls back, the audit row vanishes too.

### Drizzle query helpers

**Source pattern:** `members/service.ts` uses `eq, ne, and, isNull` from `drizzle-orm` (lines 4-ish). `auth/routes.ts:2` imports `eq, sql`.

**Apply to:**

- REQ-3 cancel-sub guard: `and`, `eq`, `isNull` for the `voidedAt IS NULL` predicate.
- REQ-4 `checkDuplicates`: `or` for DNI/phone branches; `sql\`...\``template for the`RIGHT(REGEXP_REPLACE(...))` phone normalization expression.
- REQ-5 phone block: same `sql` template + `isNull(users.deletedAt)`.

### Integration test pattern

**Source pattern:** `test/finance/transaction-service.test.ts:1-60` shows the test bootstrap (per-worker MySQL DB, `createTestApp`, direct Drizzle inserts to bypass not-yet-tested endpoints). `test/helpers.ts` exposes `registerUser` and auth utilities (per CLAUDE.md).

**Apply to (per SPEC §7 acceptance):**

- REQ-1: new test in `test/subscriptions/lifecycle.test.ts` or new file `test/subscriptions/assign-plan-validation.test.ts`. Assert HTTP 400 on presencial+virtual combo.
- REQ-3: new test in `test/subscriptions/lifecycle.test.ts` — seed a sub with a non-voided transaction_link, attempt cancel, assert 400 + body shape.
- REQ-4: new test in `test/members/check-duplicates.test.ts` (mirror existing `members.test.ts` structure).
- REQ-5: new test in `test/auth/` (create dir if missing — precedent: `test/onboarding/`).
- REQ-7: each call-site test verifies a row was inserted in `audit_log` with the expected `payload_json`. Recovery test: force the wrapping transaction to rollback (e.g. via a constraint violation injected after the audit write) and assert no row persisted.
- REQ-8: dedicated `test/migrations/0XXX_reconcile_soledad.test.ts` — seed the buggy state, run migration, assert end state, run migration again, assert idempotency.
- REQ-9: unit test for `normalizePhone` in `test/shared/phone.test.ts` (no MySQL needed).

### `actorId` plumbing

**Source pattern:** `assignPlan(userId, input, adminId)` already takes `adminId` (line 773). Route handler reads `request.user.userId`.

**Apply to:**

- `cancelSubscription(userId, notes?)` — add a third param `actorId: number`. All callers (route handler in `subscriptions/routes.ts`, internal callers in `members/service.ts:softDeleteMember`) must be updated.
- For REQ-8 reconcile migration audit row: there's no real actor. Per D-16, use the system "owner" user id. Plan-phase decides: hardcoded constant (read from a config), `SELECT id FROM users WHERE role='owner' LIMIT 1` inline, or env var. The migration is SQL-only — recommend hardcoded subquery `(SELECT id FROM users WHERE role='owner' ORDER BY id LIMIT 1)`.

---

## No Analog Found

None. Every file in scope has a strong existing analog. Phase 111 is intentionally a "consolidate + reuse" phase per CONTEXT.md (`The fase NO inventa flujos nuevos — reusa al máximo TransactionService.void, MemberFormDialog mode=edit, checkDniUniqueness pattern, subscription_schedule_changes audit pattern`).

---

## Metadata

**Analog search scope:**

- `el-templo-api/src/modules/{members,subscriptions,finance,auth,shared}/`
- `el-templo-api/src/db/{schema,migrations}/`
- `el-templo-admin/src/{components,composables,pages,utils}/`
- `el-templo-api/test/{members,finance,subscriptions}/`

**Files scanned:** ~35 files inspected, 16 selected as analogs.
**Pattern extraction date:** 2026-05-01

---

_Phase: 111-salvaguardas-operativas_
_Patterns mapped: 2026-05-01_
_Next step: gsd-planner reads this file + 111-CONTEXT.md + 111-SPEC.md to produce per-plan PLAN.md files_
