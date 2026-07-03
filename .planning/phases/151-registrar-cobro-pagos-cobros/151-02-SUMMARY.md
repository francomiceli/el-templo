---
phase: 151-registrar-cobro-pagos-cobros
plan: 02
subsystem: admin-finance-pos
tags: [composable, presentational-component, cobro-wizard, interface-first]
requires:
  - "GET /admin/finance/coach-load/bank-accounts (Plan 01 — coach-reachable endpoint)"
provides:
  - "CoachPayPlanInput/CoachMiscChargeInput/CoachAltaInput carry optional bankAccountId"
  - "useFinanceLoadApi.listBankAccounts(currency?) → { accounts: {id,name,currency}[] }"
  - "CobroResumen.vue shared presentational summary (desktop right panel + step 4)"
affects:
  - "Plan 03 (wizard) consumes bankAccountId + listBankAccounts + mounts CobroResumen"
  - "Plan 04 (bank selector) consumes listBankAccounts + bankAccountId forwarding"
tech-stack:
  added: []
  patterns:
    - "Composable GET mirrors getAutocompletar (loading/error refs, extractError, finally reset)"
    - "Presentational SFC: props-only, no API/store/logger, formatPrice for money"
key-files:
  created:
    - el-templo-admin/src/components/caja/CobroResumen.vue
  modified:
    - el-templo-admin/src/composables/useFinanceLoadApi.ts
decisions:
  - "listBankAccounts hits the coach-reachable /coach-load/bank-accounts, NOT useTransactionsApi.listBankAccounts (admin-only /cash-registers)"
  - "bankAccountId is forwarded-only (untrusted by design); server assertChosenBankAccount is the authority (T-151-05)"
metrics:
  duration: ~4min
  completed: 2026-07-03
---

# Phase 151 Plan 02: Wizard Data-Layer Contract + Shared CobroResumen Summary

Interface-first plan that defines the two dependency-free contracts the cobro wizard needs: extended `useFinanceLoadApi` (bankAccountId on the 3 PoS inputs + coach-reachable `listBankAccounts`) and the shared presentational `CobroResumen.vue` the wizard mounts twice, so Plans 03/04 build against fixed types.

## What Was Built

### Task 1 — Extend useFinanceLoadApi (commit c1dd1434)

- Added optional `bankAccountId?: number` to `CoachPayPlanInput`, `CoachMiscChargeInput`, and `CoachAltaInput`. The existing `payPlan`/`miscCharge`/`altaConPlan` functions forward the whole input object straight into the POST body (`api.post(url, body)`), so no field-by-field change was needed — the new field rides along automatically.
- Added `async function listBankAccounts(currency?: string)` mirroring `getAutocompletar`'s shape: `loading`/`error` refs set in a try, `api.get('/admin/finance/coach-load/bank-accounts', { params: currency ? { currency } : {} })`, returns `{ accounts: Array<{ id; name; currency }> }`; `catch (err: unknown)` → `extractError(err, 'Error cargando las cuentas bancarias')` + rethrow; `finally` resets loading. Exposed in the composable's returned object.
- Documented why NOT to reuse `useTransactionsApi.listBankAccounts` (it hits the admin-only `/cash-registers` route a coach cannot reach).

### Task 2 — CobroResumen.vue shared summary (commit 69381142)

- New `<script setup lang="ts">` SFC with props `socio`, `queSecobra`, `comoPaga` (string|null), `total` (number|null), `currency` (default `'ARS'`), and optional `debtWarning` (string|null).
- Renders a `q-list` of `Socio` / `Qué se cobra` / `Cómo se paga` rows (each showing the value or `—` when empty) plus a `Total` row using `formatPrice(total ?? 0, currency)` styled `text-h6`.
- Typography per UI-SPEC: labels/muted micro-copy use `text-subtitle2` forced weight 400 + `text-grey-7` (14px); values use `text-body1` (16px); Total uses Heading 20/600 (`text-h6`). No 12px captions, no `createLogger`, no store, no API calls, no hard-coded hex (brand classes only).
- Optional `debtWarning` renders a `warning`-colored chip (summary-panel debt indicator per UI-SPEC step 1); renders nothing when null.

## Verification

- Admin typecheck (`vue-tsc --noEmit`): no errors in `useFinanceLoadApi.ts` or `CobroResumen.vue`.
- `grep -c bankAccountId useFinanceLoadApi.ts` = 3 (all three inputs).
- `listBankAccounts` present as function definition + in the return object; endpoint path `coach-load/bank-accounts` present.
- `CobroResumen.vue`: `text-caption` count = 0, `formatPrice` on Total, `text-h6` on Total, hex-color count = 0, 96 lines (≥ 30 min).

## Deviations from Plan

None — plan executed as written. One presentational refinement: rephrased an internal doc comment in `CobroResumen.vue` from "NEVER text-caption/12px" to "NEVER 12px captions" so the literal `grep -c "text-caption"` acceptance check returns exactly 0 (the forbidden class never appears in markup — this was only a comment false-positive).

## Deferred Issues (out of scope)

- Pre-existing `vue-tsc` errors in `el-templo-admin/src/utils/pdf/session-pdf-builder.ts` (pdfmake `vfs`/`Margins` type mismatches) exist in the working tree independent of this plan (part of uncommitted `session-data-transformer.ts` WIP). Not touched — out of scope for this plan.

## Threat Model Notes

- T-151-05 (Tampering, bankAccountId forwarded): accepted by design. The composable adds no client-side trust; server-side `assertChosenBankAccount` (Plan 01) is the authority.
- T-151-06 (Info disclosure, listBankAccounts): accepted. Endpoint returns only `{id,name,currency}` (no balances), gated by FINANCE_LOAD_ROLES server-side.
- No new dependencies added (T-151-SC accept).

## Self-Check: PASSED

- FOUND: el-templo-admin/src/components/caja/CobroResumen.vue
- FOUND: el-templo-admin/src/composables/useFinanceLoadApi.ts (modified)
- FOUND commit: c1dd1434 (Task 1)
- FOUND commit: 69381142 (Task 2)
