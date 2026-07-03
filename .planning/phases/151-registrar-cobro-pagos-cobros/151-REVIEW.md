---
phase: 151-registrar-cobro-pagos-cobros
reviewed: 2026-07-03T16:25:36Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - el-templo-admin/src/components/caja/CobroResumen.vue
  - el-templo-admin/src/components/caja/CuentaBancariaFormDialog.vue
  - el-templo-admin/src/composables/useFinanceLoadApi.ts
  - el-templo-admin/src/config/templo-config.ts
  - el-templo-admin/src/css/app.scss
  - el-templo-admin/src/pages/CobrosPage.vue
  - el-templo-admin/src/router/routes.ts
  - el-templo-api/src/modules/finance/cash-register-service.ts
  - el-templo-api/src/modules/finance/coach-load-routes.ts
  - el-templo-api/src/modules/subscriptions/service.ts
  - el-templo-api/src/modules/subscriptions/types.ts
  - el-templo-api/test/finance/coach-load.test.ts
findings:
  critical: 1
  warning: 5
  info: 7
  total: 13
status: issues_found
---

# Phase 151: Code Review Report

**Reviewed:** 2026-07-03T16:25:36Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Phase 151 renamed the Pagos PoS to a 4-step Cobros wizard (CobrosPage.vue replaces PagosPage.vue), added a shared CobroResumen summary component, and threaded `bankAccountId` through the 4 PoS charge paths (settle / renew / misc / alta) with server-side validation (`assertChosenBankAccount`) plus a coach-reachable `GET /bank-accounts` catalog endpoint.

The **API side is solid**: the bank-account guard (`validateBankAccountForCharge`) correctly enforces transfer/card-requires-account, cash-rejects-account, and type/active/currency invariants before any side effect; `cashRegisterIdOverride` threading into `assignPlan`/`renewSubscription` preserves the v5.3 invariant (body can never choose `cashRegisterId`); the `/alta` path validates the account _before_ creating the member; `resolveRenewCurrency` exactly mirrors `renewSubscription`'s active-wins-over-expired ordering; and the new integration tests cover the rejection matrix plus persisted imputation on all 4 paths.

The problems concentrate in the **frontend wizard rewrite** (COBRO-02): the step redistribution dropped the Sede selector for existing-member altas (silent wrong-branch attribution — Critical), left reachable dead-end states in the step gating, kept a hardcoded "Pendiente" badge on a historical list that includes validated and voided rows, and left an idempotency-key gap on plan changes. The rename also left a stale duplicate landing map pointing at `/pagos`.

## Critical Issues

### CR-01: Sede selector dropped for existing-member alta — charge/sub silently attributed to the operator's branch

**File:** `el-templo-admin/src/pages/CobrosPage.vue:193-211` (Sede `q-select` gated inside `v-if="showNewStudentForm"`), `1401-1419` (submit uses `sucursalId`)
**Issue:** In the old `PagosPage.vue` the Sede selector rendered for **every** alta (`v-if="mode === 'alta'"` — "chip Sede al tope (default sede del profe, editable)"; renew/misc use the socio's own sede server-side). In the new wizard the selector only renders inside the new-student mini-form. For an **existing member** alta, `sucursalId` silently stays at its default (`authStore.user?.branchId`, or `branchOptions[0]` via the `loadBranches()` fallback at line 1112-1114) and is never shown to the operator. That value drives both the plan catalog (`loadAltaPlans` filters by `branchId`), the fixed-schedule picker (`:branch-id="sucursalId ?? 0"`), and the persisted `branchId` of the subscription **and** the plan charge (`body.branchId` → `assignPlan` → sub + ledger `branch_id`). A gestión/admin/owner or multi-sede coach assigning a plan to a socio of another sede writes the wrong branch on membership and financial records with no UI indication and no way to correct it in the flow. Phase 148 explicitly designed `branchId` as "sede ELEGIDA del socio"; this is a functional regression introduced by the step redistribution (commit `e59e0130`).
**Fix:** Render the Sede selector for alta mode regardless of member origin (restore the old gating), e.g. in step 2 when `mode === 'alta'`:

```html
<!-- Step 2, mode === 'alta', BEFORE the plan grid -->
<q-select
  v-model="sucursalId"
  :options="branchOptions"
  option-value="id"
  option-label="name"
  emit-value
  map-options
  dense
  outlined
  label="Sede"
  @update:model-value="onSucursalChange"
/>
```

and remove the duplicated Sede select from the new-student mini-form (or keep one instance shared by both branches). At minimum, surface the resolved sede in `CobroResumen` so the operator sees what will be written.

## Warnings

### WR-01: Wizard step gating allows dead-end states (new student + misc/renew)

**File:** `el-templo-admin/src/pages/CobrosPage.vue:976-999` (`canContinueStep`), `941-964` (`canConfirm`), `299-327` (renew step-2 body)
**Issue:** Step-1 gating accepts `newStudentValid` (a brand-new student), but the step-2 association list still offers "Renovar plan vigente" and "Cobro suelto", which both require `selectedMember` at confirm time. Two broken paths:

1. **New student + misc:** `canContinueStep` case 2 (misc) only checks `concepto` + `miscReason`, case 3 only checks payment fields — the coach walks all the way to step 4 where `canConfirm` returns `false` (`if (!selectedMember.value) return false;` line 956) and the Confirmar button is permanently disabled with no explanation.
2. **New student + renew:** `autocompletar` is `null`, so all three step-2 template branches (`autocompletando` / `autocompletar && !hasRenewable` / `autocompletar`) are falsy — the step renders **nothing** below the association list, a silent empty state.
   **Fix:** Disable (or hide with a hint) the `renew` and `misc` options in `associationOptions` when the socio context is a new student (`showNewStudentForm && !selectedMember`), and add the member-consistency check to `canContinueStep` cases 2/3 so a dead-end state is unreachable.

### WR-02: `onUsarExistente` skips `loadAutocompletar` — debt banner, renew pre-fill and currency stay empty for dedup-adopted members

**File:** `el-templo-admin/src/pages/CobrosPage.vue:1157-1167`
**Issue:** When the coach adopts an existing member via the DNI-dedup banner ("Usar ese alumno"), `selectedMember` is set but `loadAutocompletar(m.id)` is never called (contrast `onMemberSelected` at 1329-1334, which always loads it). Consequences: the POS-01 debt banner (line 251-265) never shows for that member even if they owe money; `mode === 'renew'` is un-continuable (`autocompletar?.hasRenewable` never true) with the silent-empty step-2 body; and `resumenCurrency`/misc `currency` fall back to `'ARS'` regardless of the member's real plan currency, which also filters the bank-account list to ARS.
**Fix:**

```ts
function onUsarExistente() {
  const m = dedupMatch.value;
  if (!m) return;
  selectedMember.value = { ... };
  resetAltaFields();
  void loadAutocompletar(m.id); // mirror onMemberSelected
}
```

### WR-03: Portada badges every historical load "Pendiente" — including validated and voided charges

**File:** `el-templo-admin/src/pages/CobrosPage.vue:59` (`<q-badge color="warning" label="Pendiente" />`)
**Issue:** COBRO-03 reworked the portada into a day-grouped "Historial de cobros" fed by `GET /mis-cargas` (last 50 loads, historical). `TransactionService.list()` applies **no** `voidedAt`/`validationStatus` filter (`buildListConditions`, transaction-service.ts:1593-1634), so the list contains charges that gestión already validated **and** charges that were anulados — yet every row is badged "Pendiente" unconditionally. On a finance surface this is actively misleading (a voided charge looks like it's still awaiting validation; a validated one looks unprocessed). `voidedAt` is already in the `TransactionListItem` payload and is unused; `validationStatus` is not exposed in the list item.
**Fix:** Add `validationStatus` to the list select/`TransactionListItem` (API + admin type) and badge by real state (`Pendiente`/`Validado`), and badge `voidedAt != null` rows as `Anulado` (data already available client-side today). Alternatively filter `/mis-cargas` to non-voided rows server-side.

### WR-04: Idempotency key not regenerated when the selected plan changes

**File:** `el-templo-admin/src/pages/CobrosPage.vue:1239-1242` (`selectPlan`), `783-788` (key lifecycle comment), `1320-1327` (`resetChargeFields`)
**Issue:** The page's own convention is "a deliberate change of target = a new charge → new idempotency key": `resetChargeFields`, `onSelectAssociation` and `onSucursalChange` all clear `currentIdempotencyKey`, but `selectPlan` does not. Failure mode: the coach taps Confirmar (key K generated), the request **succeeds server-side but the response is lost** (timeout → error toast), the coach goes back to step 2, picks a **different plan**, and confirms — the same key K is sent, the server's D-09 dedup returns the OLD charge as a 200 no-op, and the UI shows a success toast for the NEW plan that was never charged. Amount/payment-method edits after a lost-success retry have the same wrong-feedback shape.
**Fix:** Clear the key on any deliberate target change within alta:

```ts
function selectPlan(plan: PlanListItem) {
  selectedPlan.value = plan;
  scheduleIds.value = [];
  currentIdempotencyKey.value = null; // new target → new attempt
}
```

### WR-05: Stale duplicate landing map still points denied roles at `/pagos`

**File:** `el-templo-admin/src/router/index.ts:57-67` (integration point of the rename reviewed in `routes.ts`)
**Issue:** COBRO-01 (commit `da7a6eda`, "rename … route, redirect, landing, nav") updated `landingForRole()` and the static index redirect in `routes.ts` to `/cobros`, but the role-denied fallback in the router guard keeps its own `defaultPages` map with `coach/gestion/recepcion → '/pagos'` and fallback `'/pagos'`. It only works today because of the compat redirect record `{ path: 'pagos', redirect: '/cobros' }` — an extra hop and a trap: if that redirect is ever removed (it's documented as bookmark-compat, not as a dependency of the guard), role-denied bounces 404. It also duplicates the landing-by-role logic that `landingForRole()` already owns (DRY).
**Fix:** Replace the `defaultPages` map + fallback with `return landingForRole();` (or at minimum update the three entries and the fallback to `/cobros`).

## Info

### IN-01: Dead code copied over from PagosPage

**File:** `el-templo-admin/src/pages/CobrosPage.vue:931-939, 1177-1179, 1431-1432`
**Issue:** `showPaymentMethods` and `hasAlumnoContext` are computed but never referenced in the new template (the wizard renders payment buttons unconditionally in step 3). Also `onConfirm` calls `resetForm()` immediately followed by `resetToPortada()`, which calls `resetForm()` again.
**Fix:** Delete both computeds; drop the redundant `resetForm()` call.

### IN-02: Bank-account rejection message mentions "efectivo" for non-cash methods

**File:** `el-templo-api/src/modules/finance/coach-load-routes.ts:353-359`
**Issue:** `validateBankAccountForCharge` throws "No corresponde cuenta bancaria para pagos en efectivo." for **any** non-bank method — including `aura_credit`/`internal`, which the schema enum accepts. The PoS UI only offers cash/transfer/card, but an API consumer sending `aura_credit` + `bankAccountId` gets a misleading message.
**Fix:** Generalize the message ("No corresponde cuenta bancaria para este medio de pago.").

### IN-03: Renew-path bank validation uses `subscriptions.currency`, the charge uses `plan.currency`

**File:** `el-templo-api/src/modules/finance/coach-load-routes.ts:374-396`; `el-templo-api/src/modules/subscriptions/service.ts` (`renewSubscription` charge in `plan.currency`)
**Issue:** `resolveRenewCurrency` validates the chosen account against the sub row's `currency`, but the renewal charge is created in `plan.currency` (of `currentSub.planId`). These are equal at assignment time, but if a plan's currency ever drifts post-assignment, the account is validated against the stale sub currency while the charge (and caja imputation) lands in the plan currency — reopening the currency-mixed-caja hole the guard exists to close.
**Fix:** Resolve the validation currency from the plan of the renewable sub (same source `recordAssignmentCharge` uses), or assert sub.currency === plan.currency in the renew path.

### IN-04: Settle path missing the "transfer without bankAccountId → 400" rejection test

**File:** `el-templo-api/test/finance/coach-load.test.ts:1082-1097, 1230-1263`
**Issue:** The rejection matrix uses `/misc` as representative and adds explicit no-account rejects for renew and alta, but the **settle** path only has the happy-path imputation test. The shared `validateBankAccountForCharge` mitigates, yet the claim "validated across 4 PoS paths" isn't fully pinned — a future refactor that inlines or reorders the settle branch could drop the guard unnoticed.
**Fix:** Add one test: seed sub + debt, POST `/pay-plan` with `paymentMethod: "transfer"` and no `bankAccountId`, expect 400.

### IN-05: Dead test helper `countMemberTx` uses unimported `sql` (latent ReferenceError)

**File:** `el-templo-api/test/finance/coach-load.test.ts:80-87`
**Issue:** `countMemberTx` is never called and references `sql` which is not imported (imports are `{ eq, and }` only). Vitest/esbuild won't catch it (no type-check; tests are excluded from `tsconfig.json` include), so the first future caller gets a runtime ReferenceError. Pre-existing (phase 140), flagged because the phase-151 suite extends this file.
**Fix:** Delete the helper, or import `sql` from `drizzle-orm` if it's meant to be used.

### IN-06: `cashRegisterIdOverride` is trusted blindly inside the service

**File:** `el-templo-api/src/modules/subscriptions/service.ts` (assignPlan ~line 1171, renewSubscription ~line 3578); `el-templo-api/src/modules/subscriptions/types.ts` (`cashRegisterIdOverride` docs)
**Issue:** Both branches set `suggestedCajaId = input.cashRegisterIdOverride` with no re-validation — correctness depends entirely on the caller having run `assertChosenBankAccount` first (documented, and true for the only current caller). Any future caller passing an unvalidated id bypasses the type/active/currency invariants and can imputate a charge to an efectivo caja or a mismatched-currency account.
**Fix:** Cheap defense-in-depth: have the service re-run `assertChosenBankAccount` (or a lighter type+active+currency check) when the override is present, or rename/type the field to make the pre-validated contract structurally harder to misuse.

### IN-07: Monto input accepts decimals the API rejects with a generic error

**File:** `el-templo-admin/src/pages/CobrosPage.vue:452-465`
**Issue:** The Monto `q-input type="number"` + `v-model.number` accepts decimal input, but all three API schemas require `type: "integer"` for `amount`/`amountReceived` — a decimal submits, fails schema validation, and surfaces only as the generic "No se pudo registrar el cobro. Reintentá." toast.
**Fix:** Add `step="1"` / round on input (`Math.round`) or validate integer-ness in `canConfirm`/`canContinueStep` with an inline hint.

---

_Reviewed: 2026-07-03T16:25:36Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
