# Phase 108: Pago de Saldo + Historial Financiero — Pattern Map

**Mapped:** 2026-04-28
**Files analyzed:** 11 (5 backend / 6 frontend)
**Analogs found:** 11 / 11

This phase reuses ~80% of existing infrastructure (Phase 105/106/107). Most files have an exact analog already in-repo; pattern transfer is mostly direct copy + light adaptation.

## File Classification

| New / Modified File                                                                            | Role                 | Data Flow               | Closest Analog                                                                | Match Quality                                     |
| ---------------------------------------------------------------------------------------------- | -------------------- | ----------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------- |
| `el-templo-api/src/modules/finance/outstanding-service.ts` (NEW or method on existing service) | service / read       | request-response        | `transaction-service.ts:513-604` (`getFinancialHistory`)                      | exact (read with JOINs)                           |
| `el-templo-api/src/modules/finance/types.ts` (extend)                                          | type                 | n/a                     | `FinancialHistoryItem` (lines 126-139)                                        | exact                                             |
| `el-templo-api/src/modules/finance/schemas.ts` (extend)                                        | JSON Schema          | n/a                     | `financialHistorySchema` (lines 256-332)                                      | exact                                             |
| `el-templo-api/src/modules/members/routes.ts` — mount `GET /:userId/outstanding-concepts`      | route handler        | request-response        | `GET /:userId/financial-history` (lines 714-784)                              | exact                                             |
| `el-templo-api/test/members/outstanding-concepts.test.ts` (NEW)                                | integration test     | n/a                     | `test/finance/transactions-api.test.ts` (Phase 106)                           | role-match                                        |
| `el-templo-admin/src/composables/useTransactionsApi.ts` (extend)                               | composable           | request-response        | own file (lines 21-58) — already has `voidTransaction` and `listTransactions` | exact (extend)                                    |
| `el-templo-admin/src/types/transaction.ts` (extend)                                            | type                 | n/a                     | own file (lines 88-119) — already has `TransactionListItem`                   | exact (extend)                                    |
| `el-templo-admin/src/components/RegisterPaymentDialog.vue` (NEW)                               | Vue dialog component | request-response + form | `AssignPlanDialog.vue` (Cobro block lines 480-562)                            | role-match (validation pattern)                   |
| `el-templo-admin/src/components/FinancialHistoryTab.vue` (NEW)                                 | Vue tab content      | paginated read          | `CajaPage.vue` (filter + pagination + void flow lines 153-247, 601-625)       | role-match                                        |
| `el-templo-admin/src/components/VoidTransactionDialog.vue` (NEW)                               | Vue dialog component | mutation                | `CajaPage.vue:601-625` (`confirmVoid`)                                        | role-match (already inline; extract to component) |
| `el-templo-admin/src/pages/AlumnoDetailPage.vue` (modify)                                      | page / orchestrator  | n/a                     | own file (q-tabs at lines 130-143) — add 6th tab                              | exact (extend tabs)                               |

---

## Pattern Assignments

### Backend

#### 1. `GET /api/admin/members/:userId/outstanding-concepts` handler

**Analog:** `el-templo-api/src/modules/members/routes.ts:714-784` (`GET /:userId/financial-history`)

**Mounting + auth + cross-country guard pattern** (lines 714-771) — copy verbatim, only swap the schema name and the service call:

```ts
// FILE: members/routes.ts (Phase 106-04)
fastify.get<{
  Params: { userId: number };
  Querystring: { page?: number; limit?: number }; // 108: drop pagination
}>(
  "/:userId/financial-history",
  { schema: financialHistorySchema },
  async (request, reply) => {
    try {
      // D-04 privacy override (FINANCE_READ_ROLES is stricter than MEMBER_ROLES)
      if (
        !(FINANCE_READ_ROLES as readonly string[]).includes(request.user.role)
      ) {
        return reply.code(403).send({
          error: "Acceso denegado",
          message: "No tienes permiso para ver el historial financiero",
        });
      }

      // T-106-02 — verify target member + country scope
      const [target] = await fastify.db
        .select({
          id: schema.users.id,
          deletedAt: schema.users.deletedAt,
          branchCountry: schema.branches.country,
          branchIsVirtual: schema.branches.isVirtual,
        })
        .from(schema.users)
        .innerJoin(
          schema.branches,
          eq(schema.branches.id, schema.users.branchId),
        )
        .where(eq(schema.users.id, request.params.userId))
        .limit(1);

      if (!target || target.deletedAt) {
        return reply
          .code(404)
          .send({ error: "No encontrado", message: "Miembro no encontrado" });
      }
      if (
        !request.scope.isOwner &&
        !target.branchIsVirtual &&
        target.branchCountry !== request.scope.country
      ) {
        return reply
          .code(404)
          .send({ error: "No encontrado", message: "Miembro no encontrado" });
      }

      return await transactionService.getFinancialHistory(
        request.params.userId,
        {
          page: request.query.page,
          limit: request.query.limit,
        },
      );
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "get financial history");
    }
  },
);
```

**For Phase 108:** Identical structure, but:

- Path: `/:userId/outstanding-concepts`
- Schema: `outstandingConceptsSchema` (new in `finance/schemas.ts`)
- Service call: `transactionService.getOutstandingConcepts(request.params.userId)` (or new `outstandingService.list(userId)`) — NO pagination (D-02), returns plain array.
- Response shape: `{ concepts: OutstandingConcept[] }` or just the bare array — pick consistent with `financial-history` (which returns `PaginatedResult`); the array is fine since D-02 says no pagination.

**Hidden invariant:** non-owner cross-country → 404 (not 403) to mirror `DELETE /:userId` info-leak prevention. Required for parity.

---

#### 2. Outstanding-concepts service method

**Analog:** `transaction-service.ts:513-604` (`getFinancialHistory`) — same module, same JOIN pattern.

**Core query pattern** (lines 545-586) — adapt for `balances` source:

```ts
// FILE: finance/transaction-service.ts:545-586 (getFinancialHistory)
const linkRows = await this.db
  .select({
    transactionId: schema.transactionLinks.transactionId,
    targetKind: schema.transactionLinks.targetKind,
    targetId: schema.transactionLinks.targetId,
    allocatedAmount: schema.transactionLinks.allocatedAmount,
    planName: schema.subscriptionPlans.name,
    subscriptionStartDate: schema.subscriptions.startDate,
  })
  .from(schema.transactionLinks)
  .leftJoin(
    schema.subscriptions,
    and(
      eq(schema.transactionLinks.targetKind, "subscription"),
      eq(schema.subscriptions.id, schema.transactionLinks.targetId),
    ),
  )
  .leftJoin(
    schema.subscriptionPlans,
    eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
  )
  .where(inArray(schema.transactionLinks.transactionId, txIds));

// concept label resolution
const conceptLabel =
  l.targetKind === "subscription" && l.planName
    ? `${l.planName}${l.subscriptionStartDate ? " — " + String(l.subscriptionStartDate) : ""}`
    : undefined;
```

**For Phase 108:** Adapt this LEFT JOIN to use `balances` as the FROM table:

```ts
// FILE: finance/outstanding-service.ts (NEW) — pattern for getOutstandingConcepts(memberId)
import { eq, and, gt, sql } from "drizzle-orm";

const rows = await this.db
  .select({
    targetKind: schema.balances.targetKind,
    targetId: schema.balances.targetId,
    currency: schema.balances.currency,
    amount: schema.balances.amount,
    // for subscription target:
    planName: schema.subscriptionPlans.name,
    subscriptionStartDate: schema.subscriptions.startDate,
    // age computed inline
    ageInDays: sql<number>`DATEDIFF(CURDATE(), ${schema.subscriptions.startDate})`,
  })
  .from(schema.balances)
  .leftJoin(
    schema.subscriptions,
    and(
      eq(schema.balances.targetKind, "subscription"),
      eq(schema.subscriptions.id, schema.balances.targetId),
    ),
  )
  .leftJoin(
    schema.subscriptionPlans,
    eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
  )
  .where(
    and(
      eq(schema.balances.memberId, memberId),
      gt(schema.balances.amount, 0), // D-01: only outstanding (positive saldo)
    ),
  )
  .orderBy(schema.subscriptions.startDate); // FIFO order (D-01)
```

Then format description per D-06:

- `targetKind === 'subscription'`: `"Mensualidad ${monthName} ${year} — ${planName}"` (derive month/year from `subscriptionStartDate`).
- `targetKind === 'debt_balance'`: `"Saldo libre #${targetId}"`.

**Hidden invariants:**

- LEFT JOIN (not INNER) — `target_kind='debt_balance'` rows have no FK to subscriptions and must still show up.
- Effective date for subscription = `subscriptions.startDate` (verified above — schema has `startDate: date("start_date")`). NO field called `effectiveDate` on subscriptions; use `startDate`.
- `ageInDays` must clamp at 0 if `effective_date` is in the future (D-04). Use `GREATEST(0, DATEDIFF(...))` or post-process in TS.
- For `debt_balance` target, `effective_date` per D-05 comes from "the transaction that originated this balance" — but `balances` row doesn't track that. **Pragmatic fallback:** use `balances.createdAt::date` (verified: `createdAt: timestamp("created_at").defaultNow().notNull()` in `balances.ts:40`).
- If `subscriptionStartDate` is `null` (because `balances.targetKind = 'debt_balance'`), `ageInDays` calculation must use the fallback (`balances.createdAt`) — branch in SQL via CASE or compute in TS.

**Service location decision:** Plan 108 should add `getOutstandingConcepts(memberId)` as a method on existing `TransactionService` (same file, line ~605 — after `getFinancialHistory`). Avoids creating new service for one method. Bind in `members/routes.ts:91` next to existing `transactionService = new TransactionService(...)`.

---

#### 3. JSON Schema for outstanding-concepts response

**Analog:** `el-templo-api/src/modules/finance/schemas.ts:256-332` (`financialHistorySchema`)

**Pattern** — params (userId), no querystring (no pagination per D-02), loose `additionalProperties: true` on response items per the comment at lines 284-294:

```ts
// FILE: finance/schemas.ts:256-332 — adapt for outstanding
export const outstandingConceptsSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: { userId: { type: "integer", minimum: 1 } },
  },
  // NO querystring — D-02 says no pagination.
  response: {
    200: {
      type: "object",
      properties: {
        concepts: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true, // matches loose-response convention (line 287-294)
            properties: {
              targetKind: {
                type: "string",
                enum: ["subscription", "debt_balance"],
              },
              targetId: { type: "integer" },
              description: { type: "string" },
              currency: { type: "string" },
              balance: { type: "integer", minimum: 1 },
              ageInDays: { type: "integer", minimum: 0 },
              effectiveDate: { type: "string", format: "date" },
            },
          },
        },
      },
    },
    401: errorSchema,
    403: errorSchema,
    404: errorSchema,
    500: errorSchema,
  },
} as const;
```

**Why `additionalProperties: true`:** Fastify uses fast-json-stringify and STRIPS unlisted fields (see comment at `schemas.ts:287-294`). Required when service-produced shape carries fields not in the schema spec. If Phase 108 wants strict mode, list every field — but loose is the project default.

---

#### 4. Type definition `OutstandingConcept`

**Analog:** `el-templo-api/src/modules/finance/types.ts:126-139` (`FinancialHistoryItem`)

**Pattern** — TS interface mirroring the response shape:

```ts
// FILE: finance/types.ts:126-139 — for reference
export interface FinancialHistoryItem {
  transaction: FinancialTransactionRow;
  links: Array<{
    targetKind: TargetKind;
    targetId: number;
    allocatedAmount: number;
    conceptLabel?: string;
  }>;
  voidInfo?: {
    voidedAt: string;
    voidedBy: number;
    voidReason: string;
  };
}
```

**For Phase 108:** Add to same file:

```ts
export interface OutstandingConcept {
  targetKind: BalanceTargetKind; // existing enum: 'subscription' | 'debt_balance'
  targetId: number;
  description: string;
  currency: string;
  balance: number;
  ageInDays: number;
  effectiveDate: string; // YYYY-MM-DD
}
```

Use existing `BalanceTargetKind = BalanceRow["targetKind"]` (line 27) so the type stays in sync with the Drizzle schema.

---

#### 5. Integration test

**Analog:** Phase 106 test pattern at `el-templo-api/test/finance/transactions-api.test.ts` (referenced in 106-CONTEXT.md `<canonical_refs>`).

**Pattern:** `createApp()` + auth helpers from `test/helpers.ts` + real `eltemplo_test` MySQL.

**Cases to cover for Phase 108:**

- Member with no outstanding balances → returns `{ concepts: [] }` (D-03).
- Member with 1 subscription balance → description format `"Mensualidad <Mes> <Año> — <PlanName>"`, `ageInDays` correct, `effectiveDate = subscription.startDate`.
- Member with 1 `debt_balance` row → fallback description `"Saldo libre #<id>"`.
- Member with mixed (subscription + debt_balance) → both rows returned, ordered by `effectiveDate` ASC (FIFO).
- Cross-country: non-owner caller, member in foreign country → 404 (info-leak prevention).
- Coach role → 403 (D-04 / FINANCE_READ_ROLES excludes coach).
- Recepcion role → 200 (FINANCE_READ_ROLES includes recepcion).

---

### Frontend

#### 6. `useTransactionsApi.ts` extension

**Analog:** Same file (`el-templo-admin/src/composables/useTransactionsApi.ts`) — already has `voidTransaction` and `listTransactions`. Just add 2 methods.

**Pattern from existing methods** (lines 21-58):

```ts
// FILE: useTransactionsApi.ts:40-58 — voidTransaction is the prior art
async function voidTransaction(
  transactionId: number,
  reason: string,
): Promise<{ transaction: TransactionListItem }> {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await api.post<{ transaction: TransactionListItem }>(
      `/admin/finance/transactions/${transactionId}/void`,
      { reason },
    );
    return data;
  } catch (err: unknown) {
    error.value = extractError(err, "Error anulando transaccion");
    throw err;
  } finally {
    loading.value = false;
  }
}
```

**For Phase 108, add 3 new methods** (note: `getFinancialHistory` is referenced in the upstream input as already existing in Phase 106-05, but inspection of the current file shows it does NOT yet exist — Phase 108 must add it too):

```ts
// 1. Get outstanding concepts (Phase 108)
async function getOutstandingConcepts(
  memberId: number,
): Promise<OutstandingConcept[]> {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await api.get<{ concepts: OutstandingConcept[] }>(
      `/admin/members/${memberId}/outstanding-concepts`,
    );
    return data.concepts;
  } catch (err: unknown) {
    error.value = extractError(err, "Error cargando conceptos pendientes");
    throw err;
  } finally {
    loading.value = false;
  }
}

// 2. Get financial history (Phase 108 — NOT yet in composable)
async function getFinancialHistory(
  memberId: number,
  page: number,
  limit: number,
): Promise<PaginatedResult<FinancialHistoryItem>> {
  // ... same try/catch/finally pattern
  const { data } = await api.get(
    `/admin/members/${memberId}/financial-history`,
    {
      params: { page, limit },
    },
  );
  return data;
}

// 3. Create transaction (debt_settlement payload — Phase 108)
async function createTransaction(
  input: CreateTransactionInput,
): Promise<CreateTransactionResponse> {
  // ... same try/catch/finally
  const { data } = await api.post("/admin/finance/transactions", input);
  return data;
}
```

Append to the returned object in the composable: `getOutstandingConcepts, getFinancialHistory, createTransaction`.

---

#### 7. `transaction.ts` types extension

**Analog:** Same file (`el-templo-admin/src/types/transaction.ts:88-119`) — already has `TransactionListItem`, `TransactionListParams`.

**For Phase 108, add:**

```ts
export interface OutstandingConcept {
  targetKind: "subscription" | "debt_balance"; // mirrors BalanceTargetKind
  targetId: number;
  description: string;
  currency: string;
  balance: number;
  ageInDays: number;
  effectiveDate: string; // YYYY-MM-DD
}

// Mirrors backend FinancialHistoryItem (api/finance/types.ts:126-139)
export interface FinancialHistoryItem {
  transaction: {
    id: number;
    memberId: number;
    kind: TransactionKind;
    direction: TransactionDirection;
    amount: number;
    currency: string;
    paymentMethod: PaymentMethod;
    transactionDate: string;
    effectiveDate: string;
    branchId: number;
    notes: string | null;
    voidedAt: string | null;
    voidedBy: number | null;
    voidReason: string | null;
    createdAt: string;
  };
  links: Array<{
    targetKind: TargetKind;
    targetId: number;
    allocatedAmount: number;
    conceptLabel?: string;
  }>;
  voidInfo?: {
    voidedAt: string;
    voidedBy: number;
    voidReason: string;
  };
}

// Payload for POST /admin/finance/transactions when registering a payment
export interface RegisterPaymentInput {
  memberId: number;
  kind: "debt_settlement";
  direction: "inflow";
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  transactionDate: string; // YYYY-MM-DD
  effectiveDate: string;
  branchId: number;
  notes?: string | null;
  links: Array<{
    targetKind: TargetKind;
    targetId: number;
    allocatedAmount: number;
  }>;
}
```

---

#### 8. `RegisterPaymentDialog.vue` (NEW) — main payment dialog

**Analog:** `el-templo-admin/src/components/AssignPlanDialog.vue` "Cobro" block (lines 480-562) and validation logic (lines 851-872).

**Numeric input pattern with prefix `$` + max + min + disable** (lines 500-512):

```vue
<!-- FILE: AssignPlanDialog.vue:500-512 — copy verbatim for "Monto recibido" + per-concept inputs -->
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

**Live validation pattern blocking Confirmar** (lines 866-872):

```ts
// FILE: AssignPlanDialog.vue:866-872 — adapt for Σ allocated === amountReceived (D-09/D-10)
const isCobroInvalid = computed<boolean>(() => {
  if (chargeBase.value === 0) return false;
  if (amountReceived.value === null) return true;
  if (amountReceived.value < 0) return true;
  if (amountReceived.value > chargeBase.value) return true;
  return false;
});
```

**Dialog Confirmar button disabled binding** (lines 593-606):

```vue
<!-- FILE: AssignPlanDialog.vue:593-606 -->
<q-btn
  color="primary"
  label="Confirmar"
  icon="check"
  :loading="assigning"
  :disable="isCobroInvalid"
  @click="onConfirm"
/>
```

**Auto-FIFO pre-fill (NEW logic — no exact analog):** Watch on the dialog's open event + the `amountReceived` value, then walk concepts in order and assign greedily:

```ts
// NEW pattern for Phase 108 — closest reference is AssignPlanDialog watch on chargeBase (lines 1198-1205)
function autoFifoAllocate(
  amount: number,
  concepts: OutstandingConcept[],
): Map<number, number> {
  const allocations = new Map<number, number>();
  let remaining = amount;
  for (const concept of concepts) {
    // already FIFO-ordered from backend (D-01)
    if (remaining <= 0) break;
    const allocated = Math.min(concept.balance, remaining);
    allocations.set(concept.targetId, allocated);
    remaining -= allocated;
  }
  return allocations;
}

// Watch (mirrors AssignPlanDialog.vue:1198-1205 watch pattern)
watch(amountReceived, (newAmount) => {
  if (newAmount === null) return;
  const allocs = autoFifoAllocate(newAmount, outstandingConcepts.value);
  for (const concept of outstandingConcepts.value) {
    perConceptAllocation.value[concept.targetId] =
      allocs.get(concept.targetId) ?? 0;
  }
});
```

**Σ live display + visual ✓/✗ pattern** — adapt the partial-charge banner (`AssignPlanDialog.vue:540-551`):

```vue
<!-- FILE: AssignPlanDialog.vue:540-551 — pattern for Σ display -->
<q-card v-if="isPartialCharge" flat bordered class="q-mb-md bg-yellow-1">
  <q-card-section>
    <div class="row items-center q-gutter-sm q-mb-sm">
      <q-icon name="warning" color="warning" size="sm" />
      <div class="text-subtitle2 text-weight-bold">Cobro parcial</div>
    </div>
    <div class="text-body2">
      ...
    </div>
  </q-card-section>
</q-card>
```

For Phase 108, render `Total asignado: $X / $Y` with green ✓ when equal, red ✗ + diff message when not.

**Payment method selector** (lines 514-525):

```vue
<!-- FILE: AssignPlanDialog.vue:514-525 -->
<q-select
  v-model="paymentMethod"
  :options="paymentMethodOptions"
  label="Metodo de pago *"
  dense
  outlined
  emit-value
  map-options
/>
```

Use `PAYMENT_METHOD_OPTIONS` from `src/types/transaction.ts:78` (already imported at AssignPlanDialog.vue:631).

**Logger pattern** (line 635):

```ts
const log = createLogger("RegisterPaymentDialog");
```

---

#### 9. `FinancialHistoryTab.vue` (NEW) — tab content

**Analog:** `CajaPage.vue:153-247` (q-table rendering) + `:601-625` (void flow).

**Pagination pattern with q-table** (`CajaPage.vue:153-161` and `446-452`):

```ts
// FILE: CajaPage.vue:446-452 — copy for "Cargar más" pagination state
const tablePagination = ref({
  page: 1,
  rowsPerPage: 50, // D-14: default size = 50
  rowsNumber: 0,
  sortBy: null as string | null,
  descending: false,
});
```

**For Phase 108 D-12/D-13:** the granularity is `q-list + q-expansion-item` (not `q-table`), so the pattern shifts slightly. Use `q-table`'s pagination state but render with `q-list`. Or use `q-table` with `expand` slot — both work.

**"Cargar más" button** — Phase 108 D-14 says "default size 50, botón Cargar más al pie de la lista" (NOT q-table's built-in pagination). Pattern is simpler:

```vue
<!-- NEW Phase 108 pattern — append-mode pagination -->
<q-list separator>
  <q-expansion-item v-for="item in items" :key="item.transaction.id">
    <!-- collapsed row: fecha, monto, metodo, kind label -->
    <!-- expanded: links list -->
  </q-expansion-item>
</q-list>

<div class="row justify-center q-mt-md">
  <q-btn
    flat
    label="Cargar más"
    color="primary"
    :loading="loadingMore"
    :disable="items.length >= total"
    @click="loadMore"
  />
</div>
```

**Strikethrough + badge for voided rows** (`CajaPage.vue:184-192`):

```vue
<!-- FILE: CajaPage.vue:184-192 — exact pattern for voided rows (D-15) -->
<span
  :class="{
    'text-grey-5': isVoided(slotProps.row),
    'text-strike': isVoided(slotProps.row),
  }"
>
  {{ formatPrice(slotProps.row.amount, slotProps.row.currency ?? displayCurrency) }}
</span>
```

Plus a `q-badge color="negative" label="ANULADO"` (CajaPage.vue:342) shown when `voidedAt !== null`.

**`isVoided` helper** (CajaPage.vue:505-507):

```ts
function isVoided(transaction: { voidedAt: string | null }): boolean {
  return transaction.voidedAt !== null;
}
```

**RBAC gate for "Anular" button** — D-16 says only `owner | admin | gestion`. Pattern: read `authStore.user?.role` (already used in `AlumnoDetailPage.vue:514-517` for `canDeleteMember`):

```ts
// FILE: AlumnoDetailPage.vue:514-517 — pattern for role gate
const canVoidTransaction = computed(() => {
  const role = authStore.user?.role;
  return role === "owner" || role === "admin" || role === "gestion";
});
```

Match exactly to backend `FINANCE_VOID_ROLES = ['owner', 'admin', 'gestion']` (`api/src/modules/shared/permissions.ts:91`).

---

#### 10. `VoidTransactionDialog.vue` (NEW)

**Analog:** `CajaPage.vue:601-625` (current void flow, inline `$q.dialog.prompt`). Phase 108 D-17 wants a dedicated dialog component with explicit min-5-chars validation + clear UX.

**Pattern from `CajaPage.vue:601-625`:**

```ts
// FILE: CajaPage.vue:601-625 — current inline pattern
function confirmVoid(transaction: TransactionListItem) {
  $q.dialog({
    title: 'Anular transaccion',
    message: `Anular la transaccion de ${formatPrice(...)} de ${transaction.memberName}? Esta accion no se puede deshacer.`,
    prompt: {
      model: '',
      type: 'textarea',
      label: 'Motivo de anulacion *',
      isValid: (v: string) => v.trim().length > 0,
    },
    cancel: { flat: true, label: 'Cancelar' },
    ok: { color: 'negative', label: 'Anular' },
  }).onOk(async (reason: string) => {
    try {
      await transactionsApi.voidTransaction(transaction.id, reason.trim());
      $q.notify({ type: 'positive', message: 'Transaccion anulada' });
      loadTransactions();
      loadSummary();
    } catch (err: unknown) {
      // ...
    }
  });
}
```

**For Phase 108 D-17** — extract to component, change min-length to 5 chars (vs 1):

```ts
// NEW VoidTransactionDialog.vue logic (D-17)
const reason = ref("");
const submitting = ref(false);

const isValid = computed(() => reason.value.trim().length >= 5);

async function onConfirm() {
  if (!isValid.value) return;
  submitting.value = true;
  try {
    await transactionsApi.voidTransaction(
      props.transactionId,
      reason.value.trim(),
    );
    $q.notify({ type: "positive", message: "Transaccion anulada" });
    emit("voided");
    emit("update:modelValue", false);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    log.error("Error voiding transaction", { error: message });
    $q.notify({ type: "negative", message });
  } finally {
    submitting.value = false;
  }
}
```

**Dialog skeleton pattern** — copy from `AlumnoDetailPage.vue:405-450` (delete confirm dialog) for the modal scaffolding.

---

#### 11. `AlumnoDetailPage.vue` — add 6th tab "Finanzas"

**Analog:** Same file (`el-templo-admin/src/pages/AlumnoDetailPage.vue:130-143` q-tabs + `:146-382` q-tab-panels).

**Pattern (lines 130-143):**

```vue
<!-- FILE: AlumnoDetailPage.vue:130-143 — current 5 tabs -->
<q-tabs
  v-model="activeTab"
  dense
  align="left"
  class="text-grey-8"
  active-color="primary"
  indicator-color="primary"
>
  <q-tab name="perfil" label="Perfil" />
  <q-tab name="entrenamiento" label="Entrenamiento" />
  <q-tab name="notas" label="Notas" />
  <q-tab name="suscripcion" label="Suscripcion" />
  <q-tab name="asistencia" label="Asistencia" />
</q-tabs>
```

**For Phase 108:** Add 6th tab. Note user spec said "5to tab" but the page already has 5; this becomes the 6th. Suggested name: `"finanzas"` or `"historial"`.

```vue
<q-tab name="finanzas" label="Finanzas" />
```

And panel:

```vue
<q-tab-panel name="finanzas">
  <FinancialHistoryTab :userId="userId" />
</q-tab-panel>
```

**Botón "Registrar pago" placement** — D-19 says it lives in `AlumnoDetailPage.vue` (header card, near "Editar" / "Eliminar" at lines 85-100). Disabled when `outstandingConcepts.length === 0` with tooltip:

```vue
<!-- NEW button in header card row at AlumnoDetailPage.vue:51-101 -->
<q-btn
  flat
  icon="payments"
  label="Registrar pago"
  color="primary"
  :disable="outstandingConcepts.length === 0 || !canRegisterPayment"
  @click="showRegisterPaymentDialog = true"
>
  <q-tooltip v-if="outstandingConcepts.length === 0">Sin saldos pendientes</q-tooltip>
</q-btn>
```

**RBAC gate** (D-23) — `FINANCE_WRITE_ROLES = owner, admin, gestion, recepcion`:

```ts
const canRegisterPayment = computed(() => {
  const role = authStore.user?.role;
  return (
    role === "owner" ||
    role === "admin" ||
    role === "gestion" ||
    role === "recepcion"
  );
});
```

**Outstanding fetch** — call on mount and after successful payment / void:

```ts
const outstandingConcepts = ref<OutstandingConcept[]>([]);

async function loadOutstanding() {
  try {
    outstandingConcepts.value = await transactionsApi.getOutstandingConcepts(
      userId.value,
    );
  } catch {
    outstandingConcepts.value = [];
  }
}

// hook into existing loadAll() at line 678
```

Mount the dialog at the bottom (mirror `MemberFormDialog` at lines 387-392):

```vue
<RegisterPaymentDialog
  v-model="showRegisterPaymentDialog"
  :userId="userId"
  :memberBranchId="memberProfile.branchId"
  :outstandingConcepts="outstandingConcepts"
  @paid="onPaymentRegistered"
/>
```

---

## Shared Patterns

### Authentication / RBAC

**Source:** `el-templo-api/src/modules/members/routes.ts:100-109` (module-level hook) + `:722-733` (per-handler privacy override).

**Apply to:** `outstanding-concepts` endpoint — same module-level hook applies (`MEMBER_ROLES`); add per-handler check for stricter `FINANCE_READ_ROLES` (excludes coach for privacy). Identical to `financial-history`.

```ts
// Module hook — already applied at members/routes.ts:100-109
fastify.addHook("onRequest", async (request, reply) => {
  await fastify.authenticate(request, reply);
  if (!(MEMBER_ROLES as readonly string[]).includes(request.user.role)) {
    return reply.code(403).send({ error: "Acceso denegado", message: "..." });
  }
  await attachCountryScope(request, fastify.db);
});

// Per-handler privacy override (D-04)
if (!(FINANCE_READ_ROLES as readonly string[]).includes(request.user.role)) {
  return reply.code(403).send({ error: "Acceso denegado", message: "..." });
}
```

### Cross-country guard (info-leak prevention)

**Source:** `members/routes.ts:739-771` — re-applied in any new endpoint that takes `:userId`.

**Apply to:** `GET /:userId/outstanding-concepts`. Returns 404 (not 403) for foreign-country members to avoid existence leak.

### Error handling

**Source:** `el-templo-api/src/modules/shared/error-handler.ts` — `handleServiceError(err, reply, request.log, "operation name")`.

**Apply to:** Backend handler for outstanding-concepts. Final catch block:

```ts
} catch (err: unknown) {
  handleServiceError(err, reply, request.log, "get outstanding concepts");
}
```

### Frontend error / notify pattern

**Source:** `useTransactionsApi.ts:32-37` (`extractError(err, 'fallback message')`) + `CajaPage.vue:546-551` (`$q.notify` + `log.error`).

**Apply to:** Every async call in the new components. Pattern:

```ts
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : 'Error desconocido';
  log.error('Error doing X', { error: message });
  $q.notify({ type: 'negative', message });
}
```

### Logger

**Source:** `createLogger('ComponentName')` from `src/utils/logger.ts`.

**Apply to:** All 3 new Vue components. Examples:

- `RegisterPaymentDialog`: `createLogger('RegisterPaymentDialog')`
- `FinancialHistoryTab`: `createLogger('FinancialHistoryTab')`
- `VoidTransactionDialog`: `createLogger('VoidTransactionDialog')`

### Format helpers

**Source:** `src/utils/format-price.ts` (`formatPrice(amount, currency)`) + `src/utils/format-date.ts` (`formatDate(isoStr)`).

**Apply to:** All 3 new components for displaying `balance`, `amount`, `effectiveDate`, `transactionDate`. Already imported in `AlumnoDetailPage.vue:460`, `AssignPlanDialog.vue:617`, `CajaPage.vue:368-369`.

### Payment method options

**Source:** `src/types/transaction.ts:78` (`PAYMENT_METHOD_OPTIONS`).

**Apply to:** `RegisterPaymentDialog` payment method `q-select`. Same 3-option list (cash/transfer/card) used in `AssignPlanDialog.vue:631`.

---

## Hidden Invariants (Critical for Planner)

1. **`balances.amount > 0` is the source for outstanding** — NOT a LEFT JOIN against `financial_transactions`. The cache table is the single source of truth (verified at `balances.ts:22-52`; cache invariant locked in 105-SPEC §8).
2. **LEFT JOIN, not INNER:** `balances.target_kind = 'debt_balance'` rows have no FK into `subscriptions`; INNER JOIN would silently drop them.
3. **`subscriptions.startDate` is the field** for sub effective date (verified at `subscriptions.ts:55`: `startDate: date("start_date", { mode: "string" }).notNull()`). NOT `effectiveDate` (no such field). NOT `effective_date` (DB column is `start_date`).
4. **`subscription_plans.name` is the join target for description** (verified at `subscription-plans.ts:31`).
5. **Σ allocated === amountReceived** is enforced in 3 places: frontend `RegisterPaymentDialog` (live UX), Fastify JSON Schema (sum not directly enforceable, but `amount` and `links[].allocatedAmount` are validated as `integer >= 0`), and **service layer** at `transaction-service.ts:84-90` (already enforced by Phase 105 — Phase 108 NOT a no-op for backend; the existing service already rejects when sum mismatches).
6. **`debt_settlement` requires N≥1 links** (verified at `transaction-service.ts:50-53` — `KINDS_ALLOWED_WITHOUT_LINKS = ['advance_payment', 'adjustment']`; debt_settlement is NOT in that list, so service throws if `links` is empty). Matches D-08 (no `allocatedAmount=0` links sent).
7. **Cross-country member access returns 404, not 403** — info-leak prevention. Already established at `members/routes.ts:765-770`.
8. **No DB migration needed** — Phase 108 only adds a query + UI. Schema is locked from Phase 105.
9. **`balances.amount` is signed int**, but Phase 108 only queries `WHERE amount > 0`. Negative (saldo a favor) and zero rows are kept in the cache (D-08 in `balances.ts:21`) but excluded from the outstanding-concepts response.
10. **FIFO order is by `subscriptions.startDate ASC`** (D-01) — for `debt_balance` rows where startDate is NULL, MySQL's NULL ordering puts them first by default with `ASC`. Decide in planning whether `debt_balance` rows should sort by `balances.createdAt` instead (probably yes, to keep "oldest first" semantics consistent).

---

## No Analog Found

Files / logic with no exact precedent in the codebase:

| Area                                | Why no analog                                                                       | Recommendation                                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Auto-FIFO greedy allocation logic   | Pure new business logic                                                             | Pattern in this doc (§ Frontend / RegisterPaymentDialog). Plain TS function, no framework idiom needed. |
| "Cargar más" append-mode pagination | CajaPage uses `q-table` built-in pagination (replace mode); Phase 108 wants append. | New pattern shown above. Keep `q-table` state machinery but render `q-list` and append rows on click.   |
| 5-char min reason validation        | CajaPage current void uses `length > 0`                                             | Trivial extension; new component owns the rule.                                                         |

---

## Metadata

**Analog search scope:**

- `el-templo-api/src/modules/{members,finance,subscriptions,shared}/`
- `el-templo-api/src/db/schema/`
- `el-templo-admin/src/{components,composables,pages,types,utils}/`

**Files scanned:** 14
**Pattern extraction date:** 2026-04-28

---

_Phase: 108-pago-de-saldo-historial-financiero_
_Patterns mapped: 2026-04-28_
