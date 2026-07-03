# Phase 151: Registrar cobro (Pagos → Cobros) - Pattern Map

**Mapped:** 2026-07-03
**Files analyzed:** 11 (create/modify)
**Analogs found:** 11 / 11 (all patterns live inside the current PoS + v5.3 caja surface)

## File Classification

| New/Modified File                                                                                                                            | Role               | Data Flow                 | Closest Analog                                                                              | Match Quality                  |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------ |
| `el-templo-admin/src/pages/CobrosPage.vue` (rename of `PagosPage.vue`)                                                                       | page/component     | request-response (wizard) | `el-templo-admin/src/pages/PagosPage.vue` (self, restructured)                              | exact (self)                   |
| `el-templo-admin/src/components/caja/CobroResumen.vue` (new shared summary)                                                                  | component          | transform/display         | summary/ticket blocks in `PagosPage.vue` (lines 353-374)                                    | role-match                     |
| Progress header (inline in `CobrosPage.vue` or small component)                                                                              | component          | display                   | none direct — Quasar `q-linear-progress` / stepper primitives                               | no analog                      |
| `el-templo-api/src/modules/finance/coach-load-routes.ts`                                                                                     | route/controller   | request-response          | self (`/pay-plan`, `/misc`, `/alta` handlers)                                               | exact (self)                   |
| NEW `GET /coach-load/bank-accounts` endpoint (in `coach-load-routes.ts`)                                                                     | route/controller   | request-response (read)   | `GET /coach-load/mis-cargas` + `GET /cash-registers` (routes.ts:1288)                       | role-match                     |
| `el-templo-api/src/modules/finance/cash-register-service.ts` (add active-bank list + validate-chosen)                                        | service            | CRUD/read                 | `listBankAccounts` (549-573), `resolveCashRegister` (56-124), `validate` guard              | exact (self)                   |
| `el-templo-api/src/modules/finance/transaction-service.ts` (`create` override)                                                               | service            | CRUD                      | `create` cashRegisterId override (269-276) — **already supported** (settle/misc paths only) | exact (self)                   |
| `el-templo-api/src/modules/subscriptions/types.ts` (add `cashRegisterIdOverride` to AssignPlanInput + RenewSubscriptionInput)                | types              | —                         | `recorderBranchId` field added by v5.3 fase 146 (same pattern: PoS-only optional input)     | exact (self)                   |
| `el-templo-api/src/modules/subscriptions/service.ts` (short-circuit caja resolution in assignPlan ~1160-1194 + renewSubscription ~3562-3597) | service            | CRUD                      | the existing `recorderBranchId` suggestion blocks (self)                                    | exact (self)                   |
| `el-templo-admin/src/router/routes.ts` (rename + redirect + landing)                                                                         | config/route       | —                         | `{ path: '', redirect: '/pagos' }` (43) + `landingForRole` (16-26)                          | exact (self)                   |
| `el-templo-admin/src/composables/useFinanceLoadApi.ts` (new bank-account field + list)                                                       | service/composable | request-response          | self (`payPlan`/`miscCharge`/`altaConPlan`) + `useTransactionsApi.listBankAccounts`         | exact (self)                   |
| `el-templo-admin/src/components/caja/BandejaPendientesTab.vue` (show prefilled account)                                                      | component          | display                   | self — already renders prefilled caja (582)                                                 | exact (self, likely no-change) |
| `el-templo-api/test/finance/coach-load.test.ts` (+ new bank-account cases)                                                                   | test               | integration               | self + `test/finance/validate-caja.test.ts`                                                 | exact (self)                   |

## Pattern Assignments

### `el-templo-admin/src/pages/CobrosPage.vue` (page, wizard — rename of `PagosPage.vue`)

**Analog:** `el-templo-admin/src/pages/PagosPage.vue` (the entire existing page — behavior is redistributed into steps, not rewritten). All the reusable logic below is a copy target.

**Imports pattern** (`PagosPage.vue` lines 397-417) — copy verbatim; keep `createLogger`, `formatPrice`, the three composables, `FixedSchedulePicker`:

```typescript
import { ref, computed, watch } from "vue";
import { useQuasar } from "quasar";
import { createLogger } from "src/utils/logger";
import { formatPrice } from "src/utils/format-price";
import { useMembersApi } from "src/composables/useMembersApi";
import {
  useFinanceLoadApi,
  type AutocompletarResult,
  type CoachAltaInput,
} from "src/composables/useFinanceLoadApi";
import { useSubscriptionsApi } from "src/composables/useSubscriptionsApi";
import { useAuthStore } from "src/stores/useAuthStore";
import FixedSchedulePicker from "src/components/scheduling/FixedSchedulePicker.vue";
```

**Idempotency key per attempt** (lines 488-493, 851-855, 912-926) — **preserve EXACTLY** (140 D-09; CONTEXT D-03 step 4). Lazy-generate on first Confirmar tap, reuse on retry, regenerate only after acknowledged success:

```typescript
const currentIdempotencyKey = ref<string | null>(null);
// ...in onConfirm:
if (!currentIdempotencyKey.value) {
  currentIdempotencyKey.value = crypto.randomUUID();
}
const idempotencyKey = currentIdempotencyKey.value;
// on success → resetForm() nulls the key; on catch → keep the SAME key for retry
```

Note: `resetChargeFields()` (773-780) and `onSucursalChange` (623) already null the key on a deliberate target change — carry this into step navigation that changes the socio/plan.

**Confirm dispatch to the 3 endpoints** (lines 839-927) — the wizard chooses the endpoint at step 4 (D-01). Copy the `if (mode === 'renew') payPlan / else if 'misc' miscCharge / else altaConPlan` branch structure; the "mode" becomes the step-2 "¿a qué se asocia?" selection:

```typescript
if (mode.value === "renew") {
  await financeApi.payPlan({
    userId,
    amountReceived,
    paymentMethod,
    idempotencyKey,
  });
} else if (mode.value === "misc") {
  await financeApi.miscCharge({
    memberId,
    amount,
    concepto,
    paymentMethod,
    currency,
    idempotencyKey,
    miscReason,
  });
} else {
  /* alta */ const body: CoachAltaInput = {
    ...alumno,
    branchId,
    planId,
    zero,
    paymentMethod,
    amountReceived,
    idempotencyKey,
    ...(fixed ? { scheduleIds } : {}),
  };
  await financeApi.altaConPlan(body);
}
```

**New field this phase (COBRO-04):** each of the three bodies gains `bankAccountId` (or equivalent) when `paymentMethod ∈ {transfer, card}` — see the composable/API section below.

**Socio typeahead** (lines 47-78 template, 724-770 `onMemberSearch`) → Step 1. Copy the `q-select` with `use-input`, `input-debounce="300"`, `@filter`, and the status-badge `#option` slot. Preserve the `membersApi.searchMembers(val, 15)` mapping to `{ displayLabel, statusLabel, statusColor }`.

**New-student mini-form + DNI dedup on-blur** (lines 112-136 template, 587-616 `onDniBlur`/`onUsarExistente`) → Step 1. Copy the `membersApi.checkDuplicates({ dni })` + `matches.find(m => m.matchedField === 'dni' && !m.deletedAt)` pattern.

**Debt notice banner POS-01** (lines 97-108) → Step 1, below the selected socio (CONTEXT D-Discretion). Copy the `q-banner bg-warning text-dark` with `autocompletar.outstanding > 0` guard. **UI-SPEC:** use 14px Label, not `text-caption`.

**Plan grid by tier + Zero + FixedSchedulePicker** (lines 216-289 template, 640-721 script) → Step 2. Copy `plansByTier` computed, `selectPlan`, the `getBasePriceFor(plan, method, zero)` price map (662-665), and the `watch([selectedPlan, paymentMethod, zeroPrice])` amount auto-calc (716-721). `FixedSchedulePicker` moves unchanged.

**Payment-method buttons** (lines 292-308, `paymentOptions` 495-499) → Step 3. Copy the `q-btn v-for` over `paymentOptions` with active-color. **Add here:** the bank-account `q-select` (COBRO-04), shown only for `transfer`/`card`.

**Listado (COBRO-03 fix)** (lines 338-374 template, 939-966 script) → portada, below the CTA. Endpoint unchanged (`financeApi.listMyLoads()`). **Changes (D-10, frontend-only):** title `Cobros` (was "Mis cargas de hoy"), group by day (`Hoy`/`Ayer`/`{ddd d MMM}` es-AR), each row shows `HH:mm` via a `formatDateTime` helper (extend `formatTime` at 962-966). Keep the method badge + `Pendiente` badge + amount.

**Error/success notify** (lines 902-922) — copy `$q.notify` shape; use the UI-SPEC copy strings (`No se pudo registrar el cobro. Reintentá.` etc.).

---

### `el-templo-admin/src/components/caja/CobroResumen.vue` (component, shared summary — NEW)

**Analog:** the ticket/summary rendering in `PagosPage.vue` (lines 353-374) and the read-only field blocks (renew plan readonly input 164-179).

**Pattern to copy:** a pure presentational component taking props (`socio`, `queSecobra`, `comoPaga`, `total`, `currency`) and rendering `q-list`/`q-item` rows with `formatPrice(total, currency)`. UI-SPEC (§Two-column, §Step 4) mandates this is the **single source of truth** shared by the desktop right panel AND step 4 — one component, two mount points. Empty rows show `—` placeholder. Total uses Heading 20/600 (`text-h6`). No API calls, no logger needed (presentational).

---

### `el-templo-api/src/modules/finance/coach-load-routes.ts` (route, request-response — MODIFY)

**Analog:** self. The three POST handlers (`/pay-plan` 327-471, `/misc` 478-546, `/alta` 570-712) share an identical server-derived contract.

**Schema invariant to PRESERVE** (lines 106-177) — `additionalProperties:false` + no `cashRegisterId`/`validationStatus` in properties. COBRO-04 adds ONE new optional property (e.g. `bankAccountId: { type: "integer", minimum: 1 }`) to all three body schemas. The raw `cashRegisterId` rejection stays (D-05 invariant note):

```typescript
const coachPayPlanSchema = {
  body: {
    type: "object",
    required: ["userId", "paymentMethod", "idempotencyKey"],
    additionalProperties: false,   // ← keep: rejects raw cashRegisterId
    properties: { /* ...existing... */, bankAccountId: { type: "integer", minimum: 1 } },
  },
} as const;
```

**Server-side validation of the chosen account** — mirror the `validate()` caja guard (transaction-service.ts:668-688): the `bankAccountId` must be **type='banco' + isActive + currency === charge currency**, else 400. Best placed as a new `cashRegisterService` method (below) called by each handler before `transactionService.create`. Required when `transfer`/`card`; a `bankAccountId` sent for `cash` → 400 (D-05).

**Override wiring — ⚠ CORRECTED (plan-checker): the 4 charge code paths are NOT uniform.** Only TWO of them call `transactionService.create` directly with `cashRegisterId: suggestedCajaId` (from `resolveSuggestedCaja`, 284-313):

- `/pay-plan` **settle-debt branch** (~375-412) and `/misc` (~478-546, feed at ~512): direct create — here COBRO-04 is a direct swap: pass the **validated `bankAccountId`** as the `cashRegisterId` override instead of the resolver's currency-default suggestion. `transactionService.create` already honors the override — no service change needed for these two.
- `/pay-plan` **renew branch** (~428-452) and `/alta` (~570-712, call at ~651-670): these do NOT call create directly. They delegate to `subscriptionService.renewSubscription(userId, {..., recorderBranchId})` / `assignPlan(memberId, {..., recorderBranchId})`, and the caja is resolved INSIDE `subscriptions/service.ts` (renew block ~3562-3597 feeding the charge at ~3740; assign block ~1160-1194 feeding at ~1439). `RenewSubscriptionInput` (subscriptions/types.ts ~303) and `AssignPlanInput` (~226) have NO override field today. **COBRO-04 must add `cashRegisterIdOverride?: number` to both inputs and short-circuit both resolution blocks** (`if (input.cashRegisterIdOverride !== undefined) suggestedCajaId = input.cashRegisterIdOverride` — skip `resolveCashRegister`), then have the renew/alta handlers pass the validated id via that field. Without this threading, renovación (the most common PoS flow) and alta+plan would silently keep the currency-default caja, violating D-05/D-06. Do NOT touch the advance-payment branch (~1410-1413) where `advance.cashRegisterId` wins by design.

**Idempotent no-op on duplicate key** (lines 453-468) — unchanged; copy for any new logic paths:

```typescript
if (isDuplicateKeyError(err).isDuplicate) {
  const existing =
    await transactionService.findByIdempotencyKey(idempotencyKey);
  if (existing) {
    return reply.code(200).send({ ...existing });
  }
}
handleServiceError(err, reply, request.log, "coach ...");
```

---

### NEW `GET /coach-load/bank-accounts` (route, read — in `coach-load-routes.ts`)

**⚠ Architectural gap — this endpoint MUST be new.** The existing bank-account list (`GET /admin/finance/cash-registers`, routes.ts:1288-1303) lives in the finance module whose module hook gates `FINANCE_READ_ROLES` (coach EXCLUDED, permissions.ts:250-255) AND further gates `ADMIN_ROLES` per-handler. A coach/recepcion at the PoS cannot call it. The coach-load plugin declares its OWN `onRequest` hook with `FINANCE_LOAD_ROLES` (coach-load-routes.ts:228-239), so the selector's data source must be a new endpoint here.

**Analog:** `GET /coach-load/mis-cargas` (770-780) for the thin handler shape; `cashRegisterService.listBankAccounts` (549-573) / `listActiveCajasWithBalance` (247-287) for the query. Add a service method that returns **active** (`isActive=true`) `type='banco'` accounts, optionally filtered by `currency` query param (the charge currency), mapped to `{ id, name, currency }` — no balance needed for the selector:

```typescript
fastify.get<{ Querystring: { currency?: string } }>("/bank-accounts", { schema: ... }, async (request, reply) => {
  try {
    const accounts = await cashRegisterService.listActiveBankAccounts(request.query.currency);
    return reply.send({ accounts });
  } catch (err: unknown) { handleServiceError(err, reply, request.log, "coach bank-accounts"); }
});
```

---

### `el-templo-api/src/modules/finance/cash-register-service.ts` (service — ADD two methods)

**Analog:** self.

**`listActiveBankAccounts(currency?)`** — copy the query shape from `resolveCashRegister`'s bank branch (71-82) and `listBankAccounts` (562-573), but filter `isActive=true` and map to a lean `{ id, name, currency }`:

```typescript
const conditions = [
  eq(schema.cashRegisters.type, "banco"),
  eq(schema.cashRegisters.isActive, true),
];
if (currency) conditions.push(eq(schema.cashRegisters.currency, currency));
return this.db
  .select({
    id: schema.cashRegisters.id,
    name: schema.cashRegisters.name,
    currency: schema.cashRegisters.currency,
  })
  .from(schema.cashRegisters)
  .where(and(...conditions))
  .orderBy(asc(schema.cashRegisters.id));
```

**`assertChosenBankAccount(id, currency)`** (or inline in the route) — mirror the `validate()` caja guard (transaction-service.ts:668-688): NotFound/inactive → BadRequest, currency mismatch → BadRequest. Reuse `BadRequestError`/`NotFoundError` from `../shared/errors` (already imported, line 17):

```typescript
const [caja] = await this.db
  .select({ id, currency, isActive, type })
  .from(schema.cashRegisters)
  .where(eq(schema.cashRegisters.id, id))
  .limit(1);
if (!caja || caja.type !== "banco" || !caja.isActive)
  throw new BadRequestError("La cuenta elegida no existe o está inactiva");
if (caja.currency !== currency)
  throw new BadRequestError(
    `Moneda inconsistente: la cuenta es ${caja.currency}, el cobro es ${currency}`,
  );
```

---

### `el-templo-api/src/modules/finance/transaction-service.ts` (`create` — LIKELY NO CHANGE)

**Analog:** self, lines 269-276. The `create` method **already honors** an `input.cashRegisterId` override (`input.cashRegisterId !== undefined ? input.cashRegisterId : resolveCashRegister(...)`). `CreateTransactionInput.cashRegisterId?: number | null` already exists (types.ts:106). **⚠ CORRECTED (plan-checker): this only covers the settle-debt and `/misc` paths, which call create directly.** The `/pay-plan` renew and `/alta` paths delegate to `subscriptionService` (see the corrected Override-wiring section above) and require `cashRegisterIdOverride` threading through `subscriptions/types.ts` + `subscriptions/service.ts`. No edit to `transaction-service.ts create` itself is expected.

---

### `el-templo-admin/src/router/routes.ts` (config — rename + redirect + landing)

**Analog:** self.

**Rename the route + add redirect** (D-09). Change the `/pagos` record (112-119) to `/cobros` and add a redirect record so old links/bookmarks resolve:

```typescript
{ path: 'cobros', component: () => import('pages/CobrosPage.vue'), meta: { allowedRoles: PAGOS_ROLES } },
{ path: 'pagos', redirect: '/cobros' },
```

**Landing per role** (`landingForRole` 16-26): change the two `return '/pagos'` (25) and the static fallback `{ path: '', redirect: '/pagos' }` (43) to `/cobros`. Keep the fallback static+accessible-to-all-staff reasoning (comment 38-42). `PAGOS_ROLES` internal constant rename is planner's discretion (D-09) — it's in `src/config/templo-config.ts:45` and also drives the nav item `templo-config.ts:107` (label `'Pagos'` → `'Cobros'`).

---

### `el-templo-admin/src/composables/useFinanceLoadApi.ts` (service/composable — ADD field + list method)

**Analog:** self.

**New optional `bankAccountId` field** on `CoachPayPlanInput` (28-35), `CoachMiscChargeInput` (38-53), `CoachAltaInput` (63-83) — the composable only forwards it in the body (same as `miscReason`, `scheduleIds`).

**New `listBankAccounts(currency)` method** — copy the `getAutocompletar` GET shape (136-150) pointed at the new `/coach-load/bank-accounts` endpoint. (Do NOT reuse `useTransactionsApi.listBankAccounts` at useTransactionsApi.ts:568 — it hits the admin-only `/cash-registers` route that a coach cannot reach.)

```typescript
async function listBankAccounts(
  currency?: string,
): Promise<{
  accounts: Array<{ id: number; name: string; currency: string }>;
}> {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await api.get("/admin/finance/coach-load/bank-accounts", {
      params: currency ? { currency } : {},
    });
    return data;
  } catch (err: unknown) {
    error.value = extractError(err, "Error cargando las cuentas bancarias");
    throw err;
  } finally {
    loading.value = false;
  }
}
```

Return it from the composable (add to the return object, 245-254). Keep the no-`onUnmounted` / `cleanup()` convention (CLAUDE.md, file header lines 9-11).

---

### `el-templo-admin/src/components/caja/BandejaPendientesTab.vue` (component — LIKELY NO CHANGE)

**Analog:** self. The prefilled account is **already** surfaced and corregible (D-05): `onValidar` pre-selects the suggested caja (`selectedCajaId.value = row.cashRegisterId`, line 582), and `cajaOptions` (557-570) already filters bank accounts by `type === 'banco'` + row currency for transfer/card. The validator's caja-change flow (submitValidar → `validateTransaction(row.id, selectedCajaId)`, 586-606) is untouched. Because the PoS now prefills a REAL account (not the currency-default suggestion), the same row.cashRegisterId prefill just carries better data — **no code change expected.** Confirm the prefill shows in the row (`cashRegisterName` column, 114-116) and flag only if the display needs the account name where it's currently blank.

---

## Shared Patterns

### Server-derived, never from body (v5.3 T-146-01)

**Source:** `coach-load-routes.ts` schema comments (92-104), `permissions.ts:232-241`
**Apply to:** all 3 PoS endpoints + new bank-accounts endpoint
`validation_status` (role→status), `branchId` (member/recorder resolution), `recordedBy` (JWT) stay server-derived. `bankAccountId` is the ONLY new body-sourced field, and it is validated server-side (type=banco + active + currency). The `additionalProperties:false` rejection of raw `cashRegisterId` for cash stays.

### Idempotency key per confirmation attempt (140 D-09)

**Source:** `PagosPage.vue:488-493, 851-855, 912-926`
**Apply to:** `CobrosPage.vue` step 4
Lazy on first tap, reused on retry, regenerated only after acknowledged success. The composable never generates it (`useFinanceLoadApi.ts` header 13-16).

### Error handling — API

**Source:** `coach-load-routes.ts` — `handleServiceError(err, reply, request.log, "context")` (imported from `../shared/error-handler`, line 38); `isDuplicateKeyError(err).isDuplicate` for idempotent 200 no-op (42, 457).
**Apply to:** every new/modified handler.
Service-layer throws `BadRequestError` / `NotFoundError` from `../shared/errors`.

### Error handling — frontend

**Source:** `CuentaBancariaFormDialog.vue:235-241`, `PagosPage.vue:912-922`
**Apply to:** `CobrosPage.vue`, composable
`catch (err: unknown)` → `extractError(err, fallbackMsg)` (composable) or `err instanceof Error ? err.message : String(err)` (page log) → `createLogger('cobros').error(...)` → `$q.notify({ type: 'negative', message })`. Never `console.*` (CLAUDE.md).

### Quick-create inline — reuse phase-150 dialog (D-08, 150 D-11)

**Source:** `CuentaBancariaFormDialog.vue` (whole file); mounted with props `modelValue`, `selectedCountry`, `isOwner`, optional `account`; emits `saved`.
**Apply to:** `CobrosPage.vue` step 3 bank-account selector.
Only rendered for admin/owner (gate the `+ Nueva cuenta` button on `isOwner`/ADMIN role from `useAuthStore`); preselect the charge currency. The real security gate is the API `ADMIN_ROLES` check on the create route (routes.ts:1203) — UI only hides the button (149 D-04).

### Bank-account selector filtering (Claude's Discretion → mirror v5.3)

**Source:** `BandejaPendientesTab.vue:557-570` (`cajaOptions` computed)
**Apply to:** `CobrosPage.vue` step 3 selector.
Filter to `type === 'banco'` + `currency === chargeCurrency` + active. Label `Cuenta banco` (mirror `cajaSelectLabel`, 572-574).

### Integration tests (mandatory for API route changes)

**Source:** `test/finance/coach-load.test.ts` (setup 26-75), `test/finance/validate-caja.test.ts`
**Apply to:** the new bank-account field + endpoint.
Helpers: `createTestApp`, `createStaffUser`, `getAuthToken`, `registerUser`, `ensureEfectivoCaja`, `readTx` (reads the row incl. `cashRegisterId`). Required cases (CONTEXT code_context 106): transfer/card without account → 400; invalid account (closed / efectivo / wrong currency) → 400; cash WITH account → 400/rejected; chosen account persisted as `cashRegisterId` on the pendiente row; new `GET /bank-accounts` returns active-only filtered by currency and is reachable by a coach token (403 for the admin-only `/cash-registers`). Tests run in CI, not locally (MEMORY: typecheck local only).

## No Analog Found

| File                                                                               | Role        | Data Flow | Reason                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------- | ----------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Progress header (steps 1-4 + mobile `q-linear-progress`)                           | component   | display   | No multi-step/wizard UI exists in `el-templo-admin`; build from Quasar primitives per UI-SPEC §Progress header. `QStepper` was explicitly rejected (CONTEXT D-02, keeps accordion effect). |
| Step horizontal slide transition (`<transition>`, 200ms, `prefers-reduced-motion`) | interaction | —         | No existing animated route/step transition in the admin app; implement per UI-SPEC §Step transitions.                                                                                      |

## Metadata

**Analog search scope:** `el-templo-admin/src/pages`, `el-templo-admin/src/components/caja`, `el-templo-admin/src/composables`, `el-templo-admin/src/router`, `el-templo-admin/src/config`, `el-templo-api/src/modules/finance`, `el-templo-api/src/modules/shared`, `el-templo-api/test/finance`
**Files scanned:** ~14 read in full/part + grep across finance module and tests
**Pattern extraction date:** 2026-07-03
