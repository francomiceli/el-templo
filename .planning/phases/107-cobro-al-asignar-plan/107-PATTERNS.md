# Phase 107: Cobro al Asignar Plan — Pattern Map

**Mapped:** 2026-04-28
**Files analyzed:** 11 (8 modified, 1 new test, 2 verified-only)
**Analogs found:** 11 / 11

## File Classification

| New/Modified File                                                 | Role                         | Data Flow                             | Closest Analog                                                                                                                                                                                                                            | Match Quality                                       |
| ----------------------------------------------------------------- | ---------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `el-templo-api/src/modules/finance/transaction-service.ts`        | service                      | request-response (atomic write)       | `el-templo-api/src/modules/finance/balance-service.ts` (existing `tx: TxHandle` pattern)                                                                                                                                                  | exact — same module, identical pass-through pattern |
| `el-templo-api/src/modules/finance/balance-service.ts`            | service                      | request-response (atomic write)       | self (already accepts `tx`) — only signature change is making `applyDelta` work without an outer tx (currently always called inside one)                                                                                                  | self-analog                                         |
| `el-templo-api/src/modules/subscriptions/service.ts`              | service                      | request-response (CRUD + auto-record) | self (4 callsites at L1117, L2271, L2641, L2927) all share the same shape — refactor into a single helper                                                                                                                                 | self-analog                                         |
| `el-templo-api/src/modules/subscriptions/types.ts`                | type                         | n/a                                   | self (`AssignPlanInput` L218)                                                                                                                                                                                                             | exact                                               |
| `el-templo-api/src/modules/subscriptions/schemas.ts`              | schema (Fastify JSON Schema) | n/a                                   | self (`assignPlanSchema.body.properties` L296-311; `priceOverrideAmount` L307 is the integer numeric model)                                                                                                                               | exact                                               |
| `el-templo-api/src/modules/subscriptions/routes.ts`               | route handler                | request-response                      | self (L249-269 assign handler) — verify only, no logic change                                                                                                                                                                             | exact                                               |
| `el-templo-api/test/subscriptions/charge-on-assign.test.ts` (NEW) | integration test             | n/a                                   | `el-templo-api/test/finance/transactions-api.test.ts` (HTTP-level shape) + `el-templo-api/test/finance/transaction-service.test.ts` (atomicity + balance assertions) + `el-templo-api/test/subscriptions/_helpers.ts` (assignPlan helper) | composite-analog (3 sources)                        |
| `el-templo-admin/src/components/AssignPlanDialog.vue`             | Vue component                | request-response                      | self (existing `q-input` price override L160-167; `q-select` payment method L481-490; `q-list` summary L437-476)                                                                                                                          | exact — copy-and-extend                             |
| `el-templo-admin/src/types/subscription.ts`                       | type                         | n/a                                   | self (`AssignPlanInput` L228)                                                                                                                                                                                                             | exact                                               |
| `el-templo-admin/src/composables/useSubscriptionsApi.ts`          | composable (HTTP client)     | request-response                      | self (existing `assignPlan` L169, `changePlan` L186, `renewSubscription` L240) — payload extension only                                                                                                                                   | exact                                               |
| `el-templo-admin/src/types/transaction.ts`                        | type (re-use)                | n/a                                   | self (`PAYMENT_METHOD_OPTIONS` L78)                                                                                                                                                                                                       | reuse-as-is                                         |

---

## Pattern Assignments

### `el-templo-api/src/modules/finance/transaction-service.ts` (service, refactor)

**Goal:** Add optional `tx?: TxHandle` parameter to `create()` (D-09). When provided, reuse the caller's transaction; when omitted, open a new one (preserves existing behavior for the REST endpoint in `finance/routes.ts:119`).

**Analog: `balance-service.ts` lines 32-46 (the canonical `TxHandle` type already exists in this module).**

```ts
// el-templo-api/src/modules/finance/balance-service.ts:32-46
type DbInstance = MySql2Database<typeof schema>;

/**
 * The Drizzle `tx` handle passed to the `db.transaction(async (tx) => ...)`
 * callback. Pragmatic typing: same shape as the parent `MySql2Database`,
 * scoped to the running transaction.
 */
type TxHandle = Parameters<Parameters<DbInstance["transaction"]>[0]>[0];
```

**Pattern to apply:** export `TxHandle` from `balance-service.ts` (or duplicate in `transaction-service.ts`) and add the parameter:

```ts
// Refactor signature — currently transaction-service.ts:66-69
async create(
  input: CreateTransactionInput,
  recordedBy: number,
  tx?: TxHandle,            // ← NEW optional param (D-09)
): Promise<TransactionDetail> {
  const runner = tx
    ? (cb: (h: TxHandle) => Promise<TransactionDetail>) => cb(tx)
    : (cb: (h: TxHandle) => Promise<TransactionDetail>) =>
        this.db.transaction(cb);
  return await runner(async (txHandle) => {
    // ... entire existing body of `create` (lines 70-202) — all `tx`
    // references are renamed to `txHandle`. The body is unchanged otherwise.
  });
}
```

**Hidden invariants to preserve:**

- All existing validations (Σ allocated_amount, member exists, branch exists, target_id exists per target_kind) MUST run inside the transaction (current code at lines 71-143). Atomicity per SPEC §7-§8.
- `balanceService.applyDelta(txHandle, ...)` MUST be called with the same `txHandle` (line 187). The cache row insertion is the most failure-prone step; if it throws, the rollback must include the `financialTransactions` insert.
- The success log (line 189-199) must run **inside** the transaction, before the return — log signals durable persistence.

**Notes pattern (autogenerated default):**
The 4 subscription callsites currently pass `notes` as either `input.notes ?? null` (assignPlan L1129) or a hand-rolled string (`"Cambio de plan: …"` L2283, `"Cambio de plan programado: …"` L2654). Phase 107 §Claude's Discretion: the transaction's `notes` becomes autogenerated contextual ("Cobro al asignar plan {planName}"); the form's `notes` keeps going to the subscription. Refactor MUST preserve the subscription `notes` write path (currently inside the same `db.transaction` of `assignPlan`, not shown above).

---

### `el-templo-api/src/modules/finance/balance-service.ts` (service, refactor — minimal)

**Goal:** No signature change required — `applyDelta(tx, ...)` already takes `tx` as required (line 67). Phase 107 just calls it with the same `tx` that `TransactionService.create` is now operating in. **Verify-only.**

**Analog (self):** `balance-service.ts:67-71`

```ts
async applyDelta(
  tx: TxHandle,
  transaction: FinancialTransactionRow,
  links: TransactionLinkRow[],
  sign: 1 | -1,
): Promise<void> {
```

**Hidden invariant:** the `tx.insert(schema.balances)` (L147) and `tx.update(schema.balances)` (L100) MUST stay on the passed `tx`. If a future refactor accidentally swaps to `this.db`, atomicity breaks silently. Add a comment defending the invariant.

---

### `el-templo-api/src/modules/subscriptions/service.ts` (service, refactor 4 callsites)

**Goal:** Move the `transactionService.create(...)` call **inside** the existing `db.transaction` block (D-10) at all 4 sites; replace `pricePaid`/`netAmount` with `amountReceived` capped at `pricePaid`/`netAmount` (D-13/D-14); emit structured log when partial (D-16).

**Analog (self): `assignPlan` callsite at lines 1117-1140 — the canonical shape.**

```ts
// el-templo-api/src/modules/subscriptions/service.ts:1117-1140 (CURRENT — to refactor)
if (this.transactionService && pricePaid > 0) {
  await this.transactionService.create(
    {
      memberId: userId,
      kind: "plan_charge" as const,
      direction: "inflow" as const,
      amount: pricePaid,
      currency: plan.currency,
      paymentMethod: input.paymentMethod,
      transactionDate: input.startDate,
      effectiveDate: input.startDate,
      branchId: input.branchId,
      notes: input.notes ?? null,
      links: [
        {
          targetKind: "subscription" as const,
          targetId: subscriptionId,
          allocatedAmount: pricePaid,
        },
      ],
    },
    adminId,
  );
}
```

**Pattern to apply (target shape, inside existing `db.transaction(async (tx) => { ... })` block, before the `recomputeUserStatus` call at L1100 — i.e. before the tx commits):**

```ts
// Use amountReceived if provided, default to pricePaid (backward compat D-13).
const amountReceived = input.amountReceived ?? pricePaid;

// Validate cap (D-14). Throw before any side-effect, BadRequestError → 400.
if (amountReceived < 0) {
  throw new BadRequestError("amountReceived no puede ser negativo");
}
if (amountReceived > pricePaid) {
  throw new BadRequestError(
    `amountReceived no puede exceder el monto a cobrar (${pricePaid})`,
  );
}

if (this.transactionService && amountReceived > 0) {
  await this.transactionService.create(
    {
      memberId: userId,
      kind: "plan_charge" as const,
      direction: "inflow" as const,
      amount: amountReceived,
      currency: plan.currency,
      paymentMethod: input.paymentMethod,
      transactionDate: input.startDate,
      effectiveDate: input.startDate,
      branchId: input.branchId,
      notes: `Cobro al asignar plan ${plan.name}`, // autogenerated (Discretion)
      links: [
        {
          targetKind: "subscription" as const,
          targetId: newSubscriptionId,
          allocatedAmount: amountReceived,
        },
      ],
    },
    adminId,
    tx, // ← pass the outer tx (D-10 atomicity)
  );
}

// Structured log when partial (D-16) — emit before tx commits is fine; on
// rollback the line will still appear in logs (acceptable: it documents
// the *intent*, and the negative-path tests verify rollback).
if (amountReceived < pricePaid) {
  this.log.info(
    {
      userId,
      subscriptionId: newSubscriptionId,
      planId: plan.id,
      pricePaid,
      amountReceived,
      pendingBalance: pricePaid - amountReceived,
      paymentMethod: input.paymentMethod,
      branchId: input.branchId,
      recordedBy: adminId,
      flow: "assign", // or "change-now" / "change-after-current" / "renew"
    },
    "Plan asignado con cobro parcial",
  );
}
```

**Sites requiring identical refactor (only the cap-base and `flow` label differ):**

| Site                                                   | Cap base       | Flow label               | New subId variable                                             |
| ------------------------------------------------------ | -------------- | ------------------------ | -------------------------------------------------------------- |
| `service.ts:1117` (assignPlan)                         | `pricePaid`    | `"assign"`               | `newSubscriptionId` (alias for `subscriptionId` in this scope) |
| `service.ts:2271` (changePlanNow)                      | `netAmount`    | `"change-now"`           | `newSubscriptionId`                                            |
| `service.ts:2642` (changePlanAfterCurrent / scheduled) | `pricePaid`    | `"change-after-current"` | `newSubscriptionId`                                            |
| `service.ts:2927` (renew)                              | `renewalPrice` | `"renew"`                | `newSubscriptionId`                                            |

**Critical structural change for all 4 sites:**
The `transactionService.create(...)` call is currently **outside** the `db.transaction(async (tx) => ...)` block (e.g. L1107 closes the tx; L1117 then calls). Move it **inside** the block, just before the closing `return { subscriptionId: newSubscriptionId, ... }`. After the move, the entire block — subscription INSERT + link inserts + recompute + tx create + balance delta — is one atomic unit.

**Hidden invariants:**

- `recomputeUserStatus(userId, tx)` (e.g. L1100) MUST run **before** the transactionService.create inside the same tx. The order matters because flag-flips on user.status must precede balance writes that may join users.
- For `renew` (L2904-2925), the `renewBranchId` resolution currently runs **after** the tx closes. Moving the tx.create inside means the branch lookup must happen earlier (move it inside the tx, or hoist it before the tx opens).
- The `try { ... } catch` shape on the route handler (`routes.ts:252-268`) wraps a `BadRequestError` correctly via `handleServiceError` (cap-violation goes to 400). Verify by spot-checking; no handler change needed.

---

### `el-templo-api/src/modules/subscriptions/types.ts` (type extension)

**Goal:** Add `amountReceived?: number` to 3 inputs (D-13).

**Analog (self): `AssignPlanInput` lines 218-231.**

```ts
// el-templo-api/src/modules/subscriptions/types.ts:218-231 (CURRENT)
export interface AssignPlanInput {
  planId: number;
  branchId: number;
  startDate: string;
  priceTypeApplied: PriceType;
  paymentMethod: PaymentMethod;
  scheduleIds?: number[];
  auraSpend?: number;
  priceOverrideAmount?: number;
  priceOverrideReason?: string;
  boardingPass?: boolean;
  notes?: string;
  startMode?: "now" | "after_current";
}
```

**Pattern to apply:**

```ts
export interface AssignPlanInput {
  // ... existing fields unchanged ...
  startMode?: "now" | "after_current";
  /** Cobro al asignar (D-12, D-13). Backward-compat: undefined → defaults to pricePaid. */
  amountReceived?: number;
}

export interface RenewSubscriptionInput {
  paymentMethod: PaymentMethod;
  /** Cobro al renovar. Backward-compat: undefined → defaults to renewalPrice. */
  amountReceived?: number;
}
```

`changePlan` reuses `AssignPlanInput` (see `routes.ts:292`), so a single field add covers both flows.

---

### `el-templo-api/src/modules/subscriptions/schemas.ts` (Fastify JSON Schema, NOT Zod)

**Goal:** Extend 3 body schemas with `amountReceived: { type: "integer", minimum: 0 }` (D-15 — JSON Schema, **not Zod**).

**Analog (self): `assignPlanSchema.body.properties.priceOverrideAmount` line 307 — the canonical `integer, minimum: 0` numeric pattern.**

```ts
// el-templo-api/src/modules/subscriptions/schemas.ts:287-312 (CURRENT — assignPlanSchema)
export const assignPlanSchema = {
  params: {
    /* ... */
  },
  body: {
    type: "object",
    required: [
      "planId",
      "branchId",
      "startDate",
      "priceTypeApplied",
      "paymentMethod",
    ],
    properties: {
      planId: { type: "integer" },
      branchId: { type: "integer" },
      startDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      priceTypeApplied: {
        type: "string",
        enum: ["regular", "zero", "credit_card"],
      },
      paymentMethod: { type: "string", enum: ["cash", "transfer", "card"] },
      scheduleIds: { type: "array", items: { type: "integer" }, minItems: 1 },
      auraSpend: { type: "integer", minimum: 0 },
      priceOverrideAmount: { type: "integer", minimum: 0 }, // ← THIS shape to copy
      priceOverrideReason: { type: "string" },
      boardingPass: { type: "boolean" },
      notes: { type: "string" },
    },
  },
  response: {
    /* ... */
  },
};
```

**Pattern to apply** to `assignPlanSchema`, `changePlanSchema` (L321-365), and `renewSubscriptionSchema` (L367-388):

```ts
properties: {
  // ... existing properties ...
  amountReceived: { type: "integer", minimum: 0 },
},
```

**Important:** the schemas do NOT set `additionalProperties: false`. New optional fields are simply added; old clients sending the same fields still validate. Backward compat per D-19 holds at the schema level.

**Critical correction (per D-15):** Phase 106-CONTEXT.md mentioned "Zod schemas" — that is stale. The codebase uses Fastify JSON Schema with `as const`. All Phase 107 schema changes follow the example above (literal object, no Zod imports).

---

### `el-templo-api/src/modules/subscriptions/routes.ts` (verify only)

**Goal:** Confirm body schemas are wired and pass-through to `service.assignPlan`/`changePlan`/`renewSubscription` is unchanged.

**Analog (self): `routes.ts:249-269` (assignPlan handler) — happy-path shape.**

```ts
// el-templo-api/src/modules/subscriptions/routes.ts:249-269
fastify.post<{ Params: { userId: number }; Body: AssignPlanInput }>(
  "/members/:userId/subscription/assign",
  { schema: assignPlanSchema }, // ← schema applied here; will pick up amountReceived
  async (request, reply) => {
    try {
      const subscription = await subscriptionService.assignPlan(
        request.params.userId,
        request.body, // ← amountReceived flows through unchanged
        request.user.userId,
      );
      return reply.code(201).send(subscription);
    } catch (err: unknown) {
      if (err instanceof InsufficientBalanceError) {
        return reply
          .code(400)
          .send({ error: "Solicitud invalida", message: err.message });
      }
      handleServiceError(err, reply, request.log, "assign subscription");
    }
  },
);
```

**No code changes required** — the handler does not unpack body fields by name; it forwards the whole object. The schema is reference-imported and updated via the `schemas.ts` edit above.

**Hidden invariant:** `handleServiceError` correctly maps `BadRequestError` → 400 (verify in `el-templo-api/src/modules/shared/error-handler.ts`). Phase 107 cap-violations rely on this.

---

### `el-templo-api/test/subscriptions/charge-on-assign.test.ts` (NEW integration test)

**Goal:** Cover D-17 matrix: happy paths (default + explicit + partial + zero), sad paths (cap exceeded, negative), and atomicity (mocked failure of `balance-service.applyDelta`).

**Analog 1: HTTP-level shape — `el-templo-api/test/finance/transactions-api.test.ts:1-60` (header + setup pattern).**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
  registerUser,
} from "../helpers";
import * as schema from "../../src/db/schema";
```

**Analog 2: subscription-test helper — `el-templo-api/test/subscriptions/_helpers.ts:74-94` (`assignPlan` helper, signature already accepts `overrides` so amountReceived flows through with no helper change).**

```ts
export async function assignPlan(
  app: FastifyInstance,
  adminToken: string,
  userId: number,
  overrides: Record<string, unknown> = {},
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "POST",
    url: `${SUBSCRIPTIONS_URL}/members/${userId}/subscription/assign`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      planId: 1,
      branchId: 1,
      startDate: todayStr(),
      priceTypeApplied: "regular",
      paymentMethod: "cash",
      ...overrides, // ← amountReceived passes through here
    },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}
```

**Analog 3: balance-row assertion — `el-templo-api/test/finance/transaction-service.test.ts:65-118` + the SPEC §8 sequence (pricePaid=100k → plan_charge=90k → balance=10000).**

```ts
// Pattern for asserting balance row state after assign:
const [row] = await app.db
  .select()
  .from(schema.balances)
  .where(
    and(
      eq(schema.balances.memberId, memberId),
      eq(schema.balances.targetKind, "subscription"),
      eq(schema.balances.targetId, subId),
    ),
  )
  .limit(1);
expect(row.amount).toBe(10000); // pricePaid 100k - amountReceived 90k
```

**Atomicity test (D-11) — pattern to copy:**

The test must instantiate `SubscriptionService` directly (not via HTTP) so it can inject a mocked `BalanceService` whose `applyDelta` throws. The `app.db` connection is the same one used by `assignPlan`, so the rollback is observable via direct query.

```ts
// Sketch — see test/finance/transaction-service.test.ts beforeAll for the
// direct-instantiation pattern (no HTTP):
import { TransactionService } from "../../src/modules/finance/transaction-service";
import { BalanceService } from "../../src/modules/finance/balance-service";
import { SubscriptionService } from "../../src/modules/subscriptions/service";

const failingBalance = new BalanceService(app.db, app.log);
failingBalance.applyDelta = async () => {
  throw new Error("simulated balance failure");
};
const txSvc = new TransactionService(app.db, app.log, failingBalance);
const subSvc = new SubscriptionService(app.db, app.log, auraSvc, txSvc);

await expect(
  subSvc.assignPlan(memberId, validInput, adminId),
).rejects.toThrow();

// Assert: subscription row was rolled back
const subs = await app.db
  .select()
  .from(schema.subscriptions)
  .where(eq(schema.subscriptions.userId, memberId));
expect(subs).toHaveLength(0);

// Assert: no orphan financial_transaction
const txs = await app.db
  .select()
  .from(schema.financialTransactions)
  .where(eq(schema.financialTransactions.memberId, memberId));
expect(txs).toHaveLength(0);
```

**Hidden invariants:**

- Tests run against `eltemplo_test_<POOL_ID>` (per-worker DB, see `test/setup.ts`). `cleanAllTestData(app)` runs in `beforeEach` — branches survive but users/subscriptions/transactions/balances are wiped.
- The atomicity assertion **only** holds if D-10 is implemented correctly. If the `transactionService.create` call stays outside the outer tx, the subscription INSERT will already be committed before `applyDelta` runs and the test will fail (correctly catching the bug).

---

### `el-templo-admin/src/components/AssignPlanDialog.vue` (Vue component, extend)

**Goal:** Move `paymentMethod` q-select from step 2 (L481-490) to step Confirmar; add Cobro block with `amountReceived` q-input + live balance preview + yellow warning banner; show proration breakdown for `mode='change' + startMode='now'`.

**Analog 1 — numeric q-input with `$` prefix and currency: existing `priceOverrideAmount` q-input at lines 158-168.**

```vue
<!-- el-templo-admin/src/components/AssignPlanDialog.vue:158-168 -->
<div class="col-12 col-sm-4">
  <q-input
    v-model.number="assignForm.priceOverrideAmount"
    label="Monto"
    type="number"
    dense
    outlined
    prefix="$"
  />
</div>
```

**Pattern to apply for `amountReceived` input:**

```vue
<q-input
  v-model.number="amountReceived"
  label="Monto recibido"
  type="number"
  dense
  outlined
  prefix="$"
  :max="chargeBase"
  :min="0"
  :disable="chargeBase === 0"
  hint="Por defecto se cobra el total. Modificá si el cobro es parcial."
/>
```

Where `chargeBase` is a computed: in `mode='change' && startMode==='now'` → `changePlanPreviewData.netAmount`; else → `pricingDisplay.finalPrice`.

**Analog 2 — q-select with `PAYMENT_METHOD_OPTIONS`: existing line 481-490 (the q-select to MOVE to step Confirmar).**

```vue
<!-- el-templo-admin/src/components/AssignPlanDialog.vue:481-490 (DELETE FROM HERE) -->
<q-select
  v-model="assignForm.paymentMethod"
  :options="paymentMethodOptions"
  label="Metodo de pago *"
  dense
  outlined
  emit-value
  map-options
  class="q-mb-md"
/>
```

This entire block moves into the new "Cobro" section inside step `confirmStep`. The import from `src/types/transaction` (`PAYMENT_METHOD_OPTIONS, type PaymentMethod`) stays untouched (already at L569).

**Analog 3 — q-list summary inside q-card for proration breakdown: existing change-mode summary at lines 309-370.**

```vue
<!-- el-templo-admin/src/components/AssignPlanDialog.vue:309-370 (PATTERN TO COPY) -->
<q-card flat bordered class="q-mb-md">
  <q-card-section>
    <div class="text-subtitle1 text-weight-bold q-mb-md">Resumen de Cambio de Plan</div>
    <q-list dense>
      <q-item>
        <q-item-section>Plan actual</q-item-section>
        <q-item-section side>{{ changePlanPreviewData.currentPlan.name }} — {{ formatPrice(changePlanPreviewData.currentPlan.pricePaid, displayCurrency) }}</q-item-section>
      </q-item>
      <q-item>
        <q-item-section>Credito prorrateado</q-item-section>
        <q-item-section side class="text-positive">
          -{{ formatPrice(changePlanPreviewData.proration!.remainingValue, displayCurrency) }}
        </q-item-section>
      </q-item>
      <q-separator spaced />
      <q-item class="bg-blue-1 rounded-borders q-pa-sm">
        <q-item-section class="text-weight-bold text-h6">Total a cobrar</q-item-section>
        <q-item-section side class="text-weight-bold text-h5 text-primary">
          {{ formatPrice(changePlanPreviewData.netAmount!, displayCurrency) }}
        </q-item-section>
      </q-item>
    </q-list>
  </q-card-section>
</q-card>
```

The proration breakdown (Plan / Crédito prorrateado / Neto a cobrar) is **already present** in the change-mode summary card (L298-371). D-07 — explicit desglose — is essentially already there; the only Phase 107 addition is making the `Total a cobrar` line drive the `amountReceived` default.

**Analog 4 — yellow warning banner: existing red-1 "Cambio no permitido" banner at lines 270-296 (same `q-card flat bordered` + colored bg + `q-icon` + 2-line text pattern).**

```vue
<!-- el-templo-admin/src/components/AssignPlanDialog.vue:270-296 (PATTERN TO COPY) -->
<q-card flat bordered class="q-mb-md bg-red-1">
  <q-card-section>
    <div class="row items-center q-gutter-sm q-mb-sm">
      <q-icon name="block" color="negative" size="sm" />
      <div class="text-subtitle2 text-negative text-weight-bold">Cambio no permitido</div>
    </div>
    <div class="text-body2">{{ changePlanPreviewData.reason }}</div>
  </q-card-section>
</q-card>
```

**Pattern to apply (yellow partial-charge banner):**

```vue
<q-card v-if="isPartialCharge" flat bordered class="q-mb-md bg-yellow-1">
  <q-card-section>
    <div class="row items-center q-gutter-sm q-mb-sm">
      <q-icon name="warning" color="warning" size="sm" />
      <div class="text-subtitle2 text-warning text-weight-bold">Cobro parcial</div>
    </div>
    <div class="text-body2">
      El plan se asigna con saldo pendiente. El miembro quedará como deudor por
      {{ formatPrice(pendingBalance, displayCurrency) }}.
    </div>
  </q-card-section>
</q-card>
```

Where `isPartialCharge = computed(() => amountReceived.value < chargeBase.value && chargeBase.value > 0)` and `pendingBalance = computed(() => chargeBase.value - amountReceived.value)`.

\*\*Analog 5 — disabled-state with leyenda: no exact analog. Use a `q-card flat bordered class="bg-grey-2"` with `q-icon name="info"` and "Plan gratuito - sin cobro" text, with the q-input + q-select disabled via `:disable="chargeBase === 0"`. Combine analogs 1-4.

**Confirm button validation — extend existing disable expression at lines 538-542:**

```vue
<!-- CURRENT (L538-542) -->
:disable=" props.mode === 'change' && startMode === 'now' &&
changePlanPreviewData?.allowed === false "
```

```vue
<!-- TARGET — add cap and negative checks -->
:disable=" (props.mode === 'change' && startMode === 'now' &&
changePlanPreviewData?.allowed === false) || (chargeBase > 0 && (amountReceived
=== null || amountReceived < 0 || amountReceived > chargeBase)) "
```

**Payload extension — `executeConfirm` at lines 985-1008 — add one field:**

```ts
const payload: AssignPlanInput = {
  // ... existing fields ...
  notes: assignForm.value.notes.trim() || undefined,
  startMode: props.mode === "change" ? startMode.value : undefined,
  amountReceived:
    chargeBase.value === 0 ? undefined : (amountReceived.value ?? undefined),
};
```

**Logger import already in place (line 553):**

```ts
import { createLogger } from "src/utils/logger";
const log = createLogger("AssignPlanDialog");
```

No new logger setup needed.

**Hidden invariants:**

- The watch on `props.modelValue` (L1049-1078) resets `assignForm` on dialog open. The new `amountReceived` ref must be reset in the same watch, **after** the chargeBase becomes available — i.e. add a separate watch on `chargeBase` that pre-fills `amountReceived = chargeBase` whenever the user advances to step `confirmStep` (D-02).
- `pricingDisplay` (L747-765) already correctly handles override / boarding pass / AURA → finalPrice. Phase 107 reads it as-is, no refactor.
- For renewals, this dialog is NOT used — renewals go through a separate UI path. The `amountReceived` UI is added here only for assign + change. Renewal UI is implicitly out of scope of the dialog file but the type/API extension is in scope.

---

### `el-templo-admin/src/types/subscription.ts` (type extension)

**Goal:** Mirror the API extension (D-13).

**Analog (self): `AssignPlanInput` lines 228-241.**

```ts
// el-templo-admin/src/types/subscription.ts:228-241 (CURRENT)
export interface AssignPlanInput {
  planId: number;
  branchId: number;
  startDate: string;
  priceTypeApplied: PriceType;
  paymentMethod: PaymentMethod;
  scheduleIds?: number[];
  auraSpend?: number;
  priceOverrideAmount?: number;
  priceOverrideReason?: string;
  boardingPass?: boolean;
  notes?: string;
  startMode?: "now" | "after_current";
}

export interface RenewSubscriptionInput {
  paymentMethod: PaymentMethod;
}
```

**Pattern to apply:**

```ts
export interface AssignPlanInput {
  // ... unchanged ...
  startMode?: "now" | "after_current";
  /** Cobro al asignar (D-12). Backward-compat: undefined → backend defaults to pricePaid. */
  amountReceived?: number;
}

export interface RenewSubscriptionInput {
  paymentMethod: PaymentMethod;
  amountReceived?: number;
}
```

---

### `el-templo-admin/src/composables/useSubscriptionsApi.ts` (composable, no signature change)

**Goal:** Verify-only — `assignPlan`/`changePlan`/`renewSubscription` already accept `AssignPlanInput`/`RenewSubscriptionInput` and forward as the request body. The new optional field flows through.

**Analog (self): `assignPlan` at lines 169-184.**

```ts
// el-templo-admin/src/composables/useSubscriptionsApi.ts:169-184 (no change required)
async function assignPlan(
  userId: number,
  input: AssignPlanInput,
): Promise<SubscriptionDetail> {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await api.post<SubscriptionDetail>(
      `/admin/subscriptions/members/${userId}/subscription/assign`,
      input, // ← amountReceived flows through here untouched
    );
    return data;
  } catch (err: unknown) {
    error.value = extractError(err, "Error asignando plan");
    throw err;
  } finally {
    loading.value = false;
  }
}
```

No edit. Just confirm the test/manual smoke that the new field appears in network payload.

---

### `el-templo-admin/src/types/transaction.ts` (no change — reuse `PAYMENT_METHOD_OPTIONS`)

**Existing export at line 78:**

```ts
// el-templo-admin/src/types/transaction.ts:62-78
export const PAYMENT_METHOD_FILTER_OPTIONS: Array<{
  label: string;
  value: PaymentMethod;
}> = [
  { label: "Efectivo", value: "cash" },
  { label: "Transferencia", value: "transfer" },
  { label: "Tarjeta", value: "card" },
];

export const PAYMENT_METHOD_OPTIONS = PAYMENT_METHOD_FILTER_OPTIONS;
```

Re-used as-is in the moved `q-select` inside `AssignPlanDialog.vue`. Already imported at L569 of the dialog. **No change.**

---

## Shared Patterns

### Atomic transaction propagation (D-09, D-10)

**Source:** `el-templo-api/src/modules/finance/balance-service.ts:32-46`
**Apply to:** `transaction-service.ts` (`create()` adds optional `tx`), and the 4 callsites in `subscriptions/service.ts`.

```ts
type TxHandle = Parameters<Parameters<DbInstance["transaction"]>[0]>[0];

// Helper for opt-in nested transaction reuse:
const runner = tx
  ? (cb: (h: TxHandle) => Promise<T>) => cb(tx)
  : (cb: (h: TxHandle) => Promise<T>) => this.db.transaction(cb);
```

**Invariant:** every DB write in the `create()` body must use the inner `txHandle`, never `this.db`. The same applies to `balanceService.applyDelta(txHandle, ...)`.

### Structured logging on partial charge (D-16)

**Source:** `el-templo-api/src/modules/finance/transaction-service.ts:189-199` (existing structured log shape).
**Apply to:** all 4 refactored callsites in `subscriptions/service.ts`.

```ts
this.log.info(
  {
    userId,
    subscriptionId,
    planId,
    pricePaid,
    amountReceived,
    pendingBalance: pricePaid - amountReceived,
    paymentMethod,
    branchId,
    recordedBy: adminId,
    flow: "assign" | "change-now" | "change-after-current" | "renew",
  },
  "Plan asignado con cobro parcial",
);
```

### Error handling — BadRequestError → 400

**Source:** `el-templo-api/src/modules/shared/errors.ts` (`BadRequestError`) + `el-templo-api/src/modules/shared/error-handler.ts` (`handleServiceError`).
**Apply to:** the cap and negative checks in `subscriptions/service.ts`.

```ts
import { BadRequestError } from "../shared/errors";

if (amountReceived < 0)
  throw new BadRequestError("amountReceived no puede ser negativo");
if (amountReceived > pricePaid) {
  throw new BadRequestError(
    `amountReceived no puede exceder el monto a cobrar (${pricePaid})`,
  );
}
```

The route handler at `routes.ts:266` already pipes via `handleServiceError` → 400 response. No handler change needed.

### Frontend logging

**Source:** `el-templo-admin/src/utils/logger.ts` via `createLogger('AssignPlanDialog')` (already in place at `AssignPlanDialog.vue:573`).
**Apply to:** any new try/catch in the dialog. Use `log.warn` for `isExpectedClientError(err)`, `log.error` otherwise (existing pattern at L1034-1038).

### Currency-aware formatting

**Source:** `el-templo-admin/src/utils/format-price.ts:21` (`formatPrice(amount, currency)`).
**Apply to:** banner text, balance preview, and the moved Cobro block. Already imported at L555.

### Fastify JSON Schema (NOT Zod) for body extensions

**Source:** `el-templo-api/src/modules/subscriptions/schemas.ts` — every body schema in the file is a literal `{ type: "object", properties: {...} } as const` block.
**Apply to:** the 3 schemas extended in Phase 107 (assign/change/renew). **Do NOT introduce Zod** — the codebase has 0 Zod imports for API validation; the stale 106-CONTEXT note is corrected by 107 D-15.

---

## No Analog Found

None. All 11 files have a strong existing analog (most are self-analogs — extending an existing struct/function within the same file).

---

## Metadata

**Analog search scope:**

- `el-templo-api/src/modules/finance/` (transaction-service, balance-service, types, routes)
- `el-templo-api/src/modules/subscriptions/` (service, types, schemas, routes, tests)
- `el-templo-api/test/finance/` and `el-templo-api/test/subscriptions/` (test patterns)
- `el-templo-admin/src/components/AssignPlanDialog.vue` (UI building blocks)
- `el-templo-admin/src/composables/useSubscriptionsApi.ts`, `src/types/subscription.ts`, `src/types/transaction.ts`, `src/utils/format-price.ts`

**Files scanned in detail:** 14
**Pattern extraction date:** 2026-04-28

---

_Phase: 107-cobro-al-asignar-plan_
_Pattern map prepared for `gsd-planner` consumption._
