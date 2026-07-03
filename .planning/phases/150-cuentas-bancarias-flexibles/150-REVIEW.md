---
phase: 150-cuentas-bancarias-flexibles
reviewed: 2026-07-03T04:20:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - el-templo-admin/src/components/caja/CuentaBancariaFormDialog.vue
  - el-templo-admin/src/components/caja/CuentasTab.vue
  - el-templo-admin/src/components/caja/RegistrarMovEgresoDialog.vue
  - el-templo-admin/src/composables/useTransactionsApi.ts
  - el-templo-admin/src/constants/caja.ts
  - el-templo-admin/src/pages/CajaPage.vue
  - el-templo-admin/src/types/transaction.ts
  - el-templo-api/src/db/migrations/0163_bank_accounts_and_retiros.sql
  - el-templo-api/src/db/schema/cash-registers.ts
  - el-templo-api/src/modules/finance/cash-register-service.ts
  - el-templo-api/src/modules/finance/routes.ts
  - el-templo-api/src/modules/finance/schemas.ts
  - el-templo-api/src/modules/finance/types.ts
  - el-templo-api/test/finance/bank-accounts.test.ts
findings:
  critical: 3
  warning: 7
  info: 4
  total: 14
status: issues_found
---

# Phase 150: Code Review Report

**Reviewed:** 2026-07-03T04:20:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Reviewed the bank-account ABM end to end: migration 0163, Drizzle schema, `CashRegisterService` ABM methods, routes/schemas, integration tests, and the admin frontend (types, composable, form dialog, Cuentas tab, retiro prefill). Overall structure is clean (uno-de-dos rule mirrored front/back, currency immutability doubly guarded, `catch (err: unknown)` + `createLogger` used consistently, no secrets/debug artifacts).

Three issues must be fixed before ship: (1) editing the pre-existing "Banco ARS"/"Banco EUR" cajas crashes the form dialog at runtime because their bank columns are NULL but the frontend type declares them non-null; (2) `GET /admin/finance/cash-registers` is missing the per-handler `ADMIN_ROLES` guard every sibling write endpoint has, exposing CBU/CUIT/firm balances of country-agnostic bank cajas to gestion and recepcion via direct API — contradicting both D-12 and the phase-141 invariant that branch-less caja balances are owner-only for non-owners; (3) the CTA-03 "Registrar retiro" flow is structurally broken for role=admin (non-owner): the retiro dialog cannot list nor submit against a branch-less banco caja, silently steering an admin toward registering the owner's withdrawal against an efectivo caja.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Editing a legacy banco caja crashes the form dialog (NULL bankName → `.trim()` TypeError) — BLOCKER

**File:** `el-templo-admin/src/types/transaction.ts:504-505`, `el-templo-admin/src/components/caja/CuentaBancariaFormDialog.vue:152, 183-184`
**Issue:** The backend `BankAccountRow` (el-templo-api/src/modules/finance/types.ts:585-586) declares `bankName: string | null` and `accountHolder: string | null` — correctly, because the pre-existing phase-138 cajas "Banco ARS" and "Banco EUR" (present in prod) have NULL in all six new bank columns after migration 0163. The frontend mirror `BankAccount` declares them **non-null** (`bankName: string; accountHolder: string`). `listBankAccounts()` returns ALL `type='banco'` rows, so the Cuentas tab lists the two legacy cajas. Clicking "Editar" on one runs `onShow()` → `form.bankName = acc.bankName` (assigns `null`), and the `canSubmit` computed then evaluates `form.bankName.trim()` → runtime `TypeError: Cannot read properties of null (reading 'trim')`, breaking the dialog render. TypeScript cannot catch this because the frontend type lies about nullability.
**Fix:**

```ts
// types/transaction.ts — mirror the backend nullability
bankName: string | null;
accountHolder: string | null;
```

```ts
// CuentaBancariaFormDialog.vue onShow()
form.bankName = acc.bankName ?? "";
form.accountHolder = acc.accountHolder ?? "";
```

### CR-02: GET /cash-registers lacks the ADMIN_ROLES guard — gestion/recepcion can read CBU/CUIT/balances of all bank accounts — BLOCKER

**File:** `el-templo-api/src/modules/finance/routes.ts:1288-1297`
**Issue:** The route block comment (routes.ts:1190-1192) states the ABM authorization is admin/owner-only (D-12) with a stricter in-handler guard, and all four write endpoints enforce `ADMIN_ROLES`. The GET, however, relies only on the module-level `FINANCE_READ_ROLES` hook, which includes **gestion and recepcion**. Result: gestion/recepcion can call `GET /api/admin/finance/cash-registers` directly and receive every bank account's CBU/CVU, alias, CUIT, account number, and **firm balance** — for country-agnostic cajas that `listActiveCajasWithBalance` deliberately hides from non-owners ("central/banco → owner-only", cash-register-service.ts:271-273). The frontend router hides `/caja` from gestion, but that is client-side only; the API is the boundary. The test suite only asserts 403 on POST, so this gap is untested (see WR-06).
**Fix:**

```ts
fastify.get("/cash-registers", async (request, reply) => {
  try {
    if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "No tienes permiso para administrar cuentas bancarias",
      });
    }
    const accounts = await cashRegisterService.listBankAccounts();
    ...
```

### CR-03: "Registrar retiro" is broken for role=admin (non-owner) and steers toward mis-imputation — BLOCKER

**File:** `el-templo-admin/src/components/caja/CuentasTab.vue:243-246`, `el-templo-admin/src/components/caja/RegistrarMovEgresoDialog.vue:205-219, 264-267`; `el-templo-api/src/modules/finance/routes.ts:629-638`; `el-templo-api/src/modules/finance/cash-register-service.ts:271-274`
**Issue:** `/caja` is routable by `admin` + `owner` (admin router routes.ts:106-110), but `scope.isOwner` is true only for role `owner` (country-scope.ts:80). For a non-owner admin, the retiro flow fails on both layers:

1. The dialog loads cajas via `GET /cash-registers/balances`; for non-owners the service skips every branch-less caja (`if (c.branchId === null) continue`) — so the bank account being "retirado" is **absent from the Caja selector** and `prefillCajaId` silently no-ops.
2. Even if it were selectable, `POST /expenses` runs `enforceCajaScope`, which 404s any branch-less caja for non-owners.

Net effect: an admin clicking "Registrar retiro" on a bank account gets a dialog pre-set to the 'Retiros' cost center whose caja list contains **only efectivo sucursal cajas**. The natural completion path registers the owner's withdrawal against an efectivo caja — money silently deducted from the wrong caja — or fails with a confusing 404. The feature works only for the owner, but the button is rendered for every viewer of the tab.
**Fix:** Either (a) gate the retiro button with `v-if="isOwner"` in `CuentasTab.vue` and document CTA-03 as owner-only, or (b) if admins must register retiros, widen `enforceCajaScope`/`listActiveCajasWithBalance` for role=admin on banco cajas. At minimum ship (a); silent prefill failure should also notify (`$q.notify`) when `prefillCajaId` is not found in the loaded caja list.

## Warnings

### WR-01: updateBankAccount can silently blank bankName/accountHolder and destroy a legacy caja's display name

**File:** `el-templo-api/src/modules/finance/cash-register-service.ts:472-479, 497-516`
**Issue:** The merge falls back to `current.bankName ?? ""` / `current.accountHolder ?? ""`. For a legacy banco caja (NULL bank fields), a PATCH carrying only `{ accountAlias: "x" }` passes `assertTransferIdentifier`, then writes `bankName = ""`, `accountHolder = ""` and **overwrites `name`** (e.g. "Banco ARS") with the derived `" · x"` — corrupting the label shown in Saldos, arqueo, bandeja and Excel exports. Additionally, at create time a whitespace-only `bankName` (`" "`) passes the schema `minLength: 1`, is trimmed to `""`, and produces the same degenerate name. There is no non-empty assertion on the resulting state.
**Fix:** After the merge, assert the resulting state: `if (!bankName || !accountHolder) throw new BadRequestError("Banco y titular son obligatorios");` — this covers both the legacy-row PATCH and whitespace-only create.

### WR-02: Closing the last active banco caja of a currency breaks all transfer/card charges of that currency

**File:** `el-templo-api/src/modules/finance/cash-register-service.ts:530-538` (close) vs `71-87` (resolver); `el-templo-admin/src/components/caja/CuentasTab.vue:187-205`
**Issue:** `resolveCashRegister` requires an active `type='banco'` caja for the tx currency and throws `BadRequestError("No existe caja banco para ARS")` otherwise — this fires on **every** transfer/card plan charge, renewal, and coach load. The new ABM lets an admin close every ARS bank account; neither the service nor the close confirmation warns that this bricks transfer/card collection app-wide. The frontend warning covers only nonzero balance.
**Fix:** In `closeBankAccount`, count other active banco cajas of the same currency; if zero, either reject with a descriptive `BadRequestError` or return a `lastOfCurrency: true` flag so the frontend can escalate the confirmation copy.

### WR-03: 'Retiros' cost center seeded only for AR — EUR/ES retiros silently fall back to 'Varios'

**File:** `el-templo-api/src/db/migrations/0163_bank_accounts_and_retiros.sql:31-36`; `el-templo-admin/src/components/caja/RegistrarMovEgresoDialog.vue:241-246, 268-271`; `el-templo-admin/src/components/caja/CuentasTab.vue:104`
**Issue:** The seed inserts 'Retiros' with `country='AR'` only. When the owner has the country toggle on ES (or registers a retiro against the EUR account with cost centers loaded for ES), `prefillCostCenterName='Retiros'` finds no match and the dialog **silently** keeps the auto-selected 'Varios' — the owner's withdrawal is misclassified with no feedback. Cost centers are per-country by design, so ES retiros can never be classified correctly.
**Fix:** Seed a second idempotent row for `country='ES'` in the migration (or a follow-up migration), and/or notify in `onShow()` when the requested prefill cost center is not found.

### WR-04: "Registrar retiro" button rendered for closed accounts; prefill silently no-ops

**File:** `el-templo-admin/src/components/caja/CuentasTab.vue:44-53, 243-246`
**Issue:** The retiro button is not gated by `row.isActive`. For a closed account, `getCashRegisterBalances` (active cajas only) won't contain it, so the caja prefill silently fails and the dialog opens on the egreso tab with 'Retiros' preselected and no caja — inviting the user to pick a different (wrong) caja to complete the flow. The backend would also reject the inactive caja anyway.
**Fix:** Add `v-if="tableProps.row.isActive"` to the retiro button (mirroring the close button), or disable it with a tooltip for closed accounts.

### WR-05: close route rebuilds the entire ABM list to re-read one row

**File:** `el-templo-api/src/modules/finance/routes.ts:1254-1259`
**Issue:** Because `getBankAccountRow` is private, the close handler calls `listBankAccounts()` — recomputing 3 SUM queries per bank account — and `find()`s the one row. Besides the waste, `account` is typed as possibly `undefined`, so the response can legally be `{ account: undefined, balance }`, diverging from the composable's declared `{ account: BankAccount; balance: number }` contract.
**Fix:** Make `getBankAccountRow(id)` public (or add a public `getBankAccount(id)` wrapper) and return it directly from `closeBankAccount` alongside the balance, like `reactivateBankAccount` does.

### WR-06: Test coverage gaps around the exact areas that regressed

**File:** `el-templo-api/test/finance/bank-accounts.test.ts`
**Issue:** Missing tests that would have caught the findings above and the service guards claimed in the code comments:

- No RBAC test for `GET /cash-registers` (gestion/recepcion currently get 200 — CR-02 would have surfaced).
- 403 is asserted only on POST create; PATCH/close/reactivate have no gestion/coach 403 tests.
- No test for the uno-de-dos rule **on update** (PATCH clearing both `cbuCvu` and `accountAlias` → 400), only on create.
- No test that PATCH/close/reactivate against an **efectivo** caja id returns 404 (the `type='banco'` guard, T-150-04).
- No EUR-account test (currency enum path).
- The close test never asserts the returned `balance` field.
  **Fix:** Add the five cases; each is a short `app.inject` block reusing the existing harness.

### WR-07: `cutoffDate` derived from UTC — evening-created accounts can permanently exclude same-day transfers from the balance

**File:** `el-templo-api/src/modules/finance/cash-register-service.ts:318-320` (with `getBalance` gte at 180, 198)
**Issue:** `today()` uses `new Date().toISOString()`. Between 21:00 and 24:00 Argentina time (UTC-3), a newly created account gets **tomorrow's** date as `cutoff_date`. A transfer registered that same evening with a frontend-supplied `transactionDate` of the local date fails the `gte(transactionDate, cutoffDate)` gate and is silently excluded from `firmeBalance` forever. UTC-date derivation is the codebase-wide convention (movement-service.ts:417 etc.), but here the mismatch with the user-picked local `transactionDate` drops money from the saldo rather than merely shifting a label.
**Fix:** Derive the cutoff in the business timezone (e.g. `America/Argentina/Buenos_Aires` via `Intl.DateTimeFormat` or the shared date helper) or set the cutoff to yesterday (`today - 1 day`) so a same-local-day transaction can never fall before it (opening balance is 0, so widening backward by one day is safe for a brand-new account created via ABM).

## Info

### IN-01: Dead props and no-op country reactivity in the Cuentas surface

**File:** `el-templo-admin/src/components/caja/CuentaBancariaFormDialog.vue:105-106`; `el-templo-admin/src/components/caja/CuentasTab.vue:143-144, 258`
**Issue:** `CuentaBancariaFormDialog` declares `selectedCountry` and `isOwner` props that are never read. `CuentasTab` watches `selectedCountry` and re-fetches, but `listBankAccounts()` takes no country parameter — the reload returns identical data, and the tab shows all countries' accounts regardless of the owner toggle, unlike every sibling tab. The comment "reactivo al país... igual que los demás tabs" is misleading.
**Fix:** Drop the unused props and the watch, or document that accounts are intentionally country-agnostic (D-01) next to the load.

### IN-02: deriveBankAccountName edge cases — digitless cbuCvu short-circuits accountNumber; no name uniqueness

**File:** `el-templo-api/src/modules/finance/cash-register-service.ts:327-342`
**Issue:** `(cbuCvu ?? accountNumber ?? "")` — a non-null but digit-free `cbuCvu` (possible: schema allows any string ≤34 chars) prevents falling back to `accountNumber`'s digits. Separately, two accounts with the same bank + alias derive identical `name`s; nothing warns or disambiguates in Saldos/selectors.
**Fix:** Concatenate candidates before extracting digits: `const digits = ((cbuCvu ?? "") + (accountNumber ?? "")).replace(/\D/g, "")` — or check each in turn; optionally append the id when a derived name collides.

### IN-03: GET /cash-registers registers no schema at all

**File:** `el-templo-api/src/modules/finance/routes.ts:1289`
**Issue:** Every sibling route registers at least error-response schemas; the new GET registers none, breaking module consistency and skipping response serialization contracts.
**Fix:** Add a `listBankAccountsSchema` with the standard 401/403/500 error schemas (and a loose 200 like the other list endpoints).

### IN-04: Seed keeps a pre-existing inactive 'Retiros' row inactive

**File:** `el-templo-api/src/db/migrations/0163_bank_accounts_and_retiros.sql:31-36`
**Issue:** The `WHERE NOT EXISTS` key is (name, country) without `is_active`, so if 'Retiros' (AR) was ever soft-deactivated via a future cost-center ABM, re-running the migration path leaves it inactive and the retiro prefill silently falls back to 'Varios' (compounding WR-03).
**Fix:** Acceptable for now; if a cost-center ABM ships, add an `UPDATE ... SET is_active = true` companion or document the invariant.

---

_Reviewed: 2026-07-03T04:20:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
