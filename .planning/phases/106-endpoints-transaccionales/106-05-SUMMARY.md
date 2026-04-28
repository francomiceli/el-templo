---
phase: 106-endpoints-transaccionales
plan: 05
subsystem: admin-frontend
tags:
  [
    finance,
    cajapage,
    composable-rename,
    type-rename,
    payments-deletion,
    vue,
    quasar,
  ]

# Dependency graph
requires:
  - phase: 106-endpoints-transaccionales
    plan: 03
    provides: GET /api/admin/finance/transactions, GET /api/admin/finance/transactions/summary, country querystring contract
  - phase: 106-endpoints-transaccionales
    plan: 02
    provides: POST /api/admin/finance/transactions/:id/void
provides:
  - useTransactionsApi composable (listTransactions, voidTransaction, getSummary)
  - TransactionListItem, FinanceSummary, PaymentMethod (5 keys), LegacyPaymentMethod (3 keys), TransactionKind, TransactionDirection, TargetKind, TransactionLinkSummary types
  - PAYMENT_METHOD_LABELS / PAYMENT_METHOD_COLORS / PAYMENT_METHOD_FILTER_OPTIONS / PAYMENT_METHOD_OPTIONS (alias) maps
  - Migrated CajaPage.vue (no /admin/payments/* paths remain)
affects:
  - 106-06 (verifier — closes the D-14 production 404 path; legacy admin grep gates pass)
  - 109 (CajaPage v2 will widen the kind filter + paymentMethod dropdown to all 5 keys)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Type widening with backward-compat alias: PaymentMethod widened to 5 keys at the type level; LegacyPaymentMethod (3 keys) preserved for callsites that still bind to the narrow ChargeReportParams contract (charges report). PAYMENT_METHOD_OPTIONS retained as alias of PAYMENT_METHOD_FILTER_OPTIONS so unrelated consumers (assign-plan, renewal, charges filter) migrate by import-path swap only — no rename churn this phase."
    - "Surgical composable swap: usePaymentsApi → useTransactionsApi preserves the loading/error/cleanup ref pattern; only endpoint paths and response shapes change. result.payments → result.rows is the visible delta in CajaPage."
    - "kind='plan_charge' bind on listTransactions preserves the legacy CajaPage 'cobros' semantics during Phase 106 — the table only displays plan charges (debt_settlement surfaces via Plan 04 financial-history). Phase 109 widens via UI kind dropdown."
    - "Concepto column derived from linkSummary[0] with `${targetKind} #${targetId}` placeholder; Phase 109 will replace with a richer kind-driven label (e.g. plan name + period from JOIN to subscriptions)."

key-files:
  created:
    - el-templo-admin/src/composables/useTransactionsApi.ts
    - el-templo-admin/src/types/transaction.ts
    - .planning/phases/106-endpoints-transaccionales/106-05-SUMMARY.md
  modified:
    - el-templo-admin/src/pages/CajaPage.vue
    - el-templo-admin/src/pages/ReportesPage.vue
    - el-templo-admin/src/components/AssignPlanDialog.vue
    - el-templo-admin/src/components/MemberSubscriptionTab.vue
    - el-templo-admin/src/types/subscription.ts
  deleted:
    - el-templo-admin/src/composables/usePaymentsApi.ts
    - el-templo-admin/src/types/payment.ts

key-decisions:
  - "Plan 03 prereqs verified inline: Plan 05 Task 1 grep regex `request.scope.isOwner.*request.query.country` returned 0 because Prettier formatted the owner-aware override across multiple lines (routes.ts:241-247, 291-297). Plan 03 SUMMARY's canonical evidence — `grep -c 'request.scope.isOwner' src/modules/finance/routes.ts === 4` — was used as the verification gate instead. The contract IS in place; the literal grep was overly strict."
  - "Backward-compat aliases keep unrelated callsites zero-churn: `PAYMENT_METHOD_OPTIONS` (3-option subset) re-exported under the legacy name from transaction.ts so AssignPlanDialog, MemberSubscriptionTab, and ReportesPage migrate via import-path swap only (no rename in business logic). `LegacyPaymentMethod` (3 keys) added to satisfy the narrow ChargeReportParams.paymentMethod contract — Phase 109 will widen reports."
  - "kind='plan_charge' bind on listTransactions in CajaPage is the Phase 106 minimal-disruption choice: matches what /admin/payments/payments returned (inflow plan charges only). debt_settlement transactions are visible via Plan 04 financial-history (per-member view). Phase 109 introduces the unified-by-kind CajaPage view."
  - "Detail dialog rewritten for TransactionListItem instead of preserving 1:1 fields: dropped planName/subscriptionStartDate/reference/voidReason/createdAt because they're not on TransactionListItem (server doesn't project them to the list endpoint). Added effectiveDate, branchName, Concepto from linkSummary. Phase 109 will surface a richer detail view via a per-transaction GET if needed."

patterns-established:
  - "Phase 106 admin frontend swap pattern: type widening + backward-compat alias preserves narrow callsites + new composable name reflects new endpoint base path (/finance/transactions) + delete-legacy in same commit when no consumers remain."
  - "kind filter as service-side discriminator (vs UI dropdown) for backward-compat single-kind views during phased rollouts."

requirements-completed: [API-04]

# Metrics
duration: ~7min
completed: 2026-04-28
---

# Phase 106 Plan 05: Admin Frontend Migration Summary

**The admin frontend now uses `/api/admin/finance/transactions` exclusively. The legacy `/admin/payments/*` paths are gone, closing the production 404s reported in D-14. CajaPage.vue, AssignPlanDialog, MemberSubscriptionTab, ReportesPage, and subscription.ts all import from the new `src/types/transaction` module; `usePaymentsApi.ts` and `payment.ts` are deleted. `pnpm build` exits 0 on el-templo-admin and `pnpm lint` reports 0 errors.**

## Performance

- **Duration:** ~7min
- **Tasks:** 3 (1 grep-only verification + 1 types/composable creation + 1 page migration with legacy deletion)
- **Files created:** 2 (transaction.ts + useTransactionsApi.ts)
- **Files modified:** 5 (CajaPage.vue + ReportesPage.vue + AssignPlanDialog.vue + MemberSubscriptionTab.vue + subscription.ts)
- **Files deleted:** 2 (usePaymentsApi.ts + payment.ts)

## Accomplishments

### Task 1: Pre-flight verification (no file changes)

Verified Plan 03 deliverables are in place via grep:

```
grep -c "country.*type.*string.*minLength.*2" el-templo-api/src/modules/finance/schemas.ts → 2 ✓
grep -c "request.scope.isOwner" el-templo-api/src/modules/finance/routes.ts → 4 ✓ (canonical Plan 03 evidence)
```

The plan's literal grep `request.scope.isOwner.*request.query.country` returned 0 because Prettier formatted the owner-aware override across multiple lines. The functional contract IS in place at routes.ts:240-247 (GET /transactions) and routes.ts:290-297 (GET /transactions/summary) — verified by reading the relevant code blocks. See "Deviations" §1 for full evidence chain.

### Task 2: New composable + types

- `el-templo-admin/src/types/transaction.ts` (NEW, ~140 lines) — `TransactionKind`, `TransactionDirection`, `PaymentMethod` (widened to 5 keys: cash/transfer/card/aura_credit/internal), `LegacyPaymentMethod` (3 keys), `TargetKind`, `TransactionLinkSummary`, `TransactionListItem`, `TransactionListParams`, `FinanceSummary`, `FinanceSummaryParams`, `VoidTransactionInput`. Maps: `PAYMENT_METHOD_LABELS` (5 keys), `PAYMENT_METHOD_COLORS` (5 keys), `PAYMENT_METHOD_FILTER_OPTIONS` (3 entries — same shape as legacy), `PAYMENT_METHOD_OPTIONS` (alias for backward compat).
- `el-templo-admin/src/composables/useTransactionsApi.ts` (NEW, ~85 lines) — `listTransactions(params)` → `PaginatedResult<TransactionListItem>`; `voidTransaction(id, reason)` → `{ transaction }`; `getSummary(params)` → `FinanceSummary`. Uses `PaginatedResult<T>` from `src/types/report` (existing shared shape).

### Task 3: CajaPage migration + legacy deletion + consumer migration

- **CajaPage.vue** — Surgical migration:
  - `usePaymentsApi` import → `useTransactionsApi`; `paymentsApi.*` → `transactionsApi.*`.
  - `payments` ref + `loadPayments()` + `detailPayment` → `transactions`/`loadTransactions()`/`detailTransaction`.
  - `summary` reactive widened from 3-key `revenueByMethod` to 5-key (cash/transfer/card/aura_credit/internal) preserving the existing 3 cards in the UI.
  - `loadSummary` rebound to `transactionsApi.getSummary({ branchId, dateFrom, dateTo, country })` — same data flow, country still flows from owner-only `selectedCountry`.
  - `loadTransactions` calls `transactionsApi.listTransactions({ ..., kind: 'plan_charge' })` — kind discriminator preserves the legacy "cobros" filter (D-14 production parity).
  - Plan/Periodo column → "Concepto" column derived from `linkSummary[0]` (`${targetKind} #${targetId}`); Phase 109 will replace with richer label.
  - Detail dialog rewritten for `TransactionListItem` shape: dropped `planName`/`subscriptionStartDate`/`reference`/`voidReason`/`createdAt` (not projected); added `effectiveDate`, `branchName`, `Concepto`, `notes`.
  - `confirmVoid` updated copy ("Anular pago" → "Anular transaccion") and rebinds to `transactionsApi.voidTransaction`.
- **ReportesPage.vue** — import path swap `'src/types/payment'` → `'src/types/transaction'`; `chargesPaymentMethod` ref retyped to `LegacyPaymentMethod | undefined` (the widened `PaymentMethod` would not match the narrow `ChargeReportParams.paymentMethod` contract). No business-logic changes.
- **AssignPlanDialog.vue** + **MemberSubscriptionTab.vue** — import path swap only. The widened `PaymentMethod` is a strict superset of the previous 3-key type, so existing `'cash'`/`'transfer'`/`'card'` literals still type-check. Dropdown still offers 3 options via `PAYMENT_METHOD_OPTIONS` (alias).
- **subscription.ts** — `import type { PaymentMethod } from './payment'` → `from './transaction'`.
- **DELETED** `el-templo-admin/src/composables/usePaymentsApi.ts` and `el-templo-admin/src/types/payment.ts` after confirming no consumers remain.

## Task Commits

| Task | Commit     | Type | Description                                              |
| ---- | ---------- | ---- | -------------------------------------------------------- |
| 1    | (none)     | —    | Pre-flight grep verification, zero file changes          |
| 2    | `d954e92b` | feat | useTransactionsApi composable + transaction types        |
| 3    | `c6be9b6f` | feat | Migrate CajaPage + delete legacy payments code (8 files) |

## Files

**Created:**

- `el-templo-admin/src/composables/useTransactionsApi.ts`
- `el-templo-admin/src/types/transaction.ts`

**Modified:**

- `el-templo-admin/src/pages/CajaPage.vue` (composable swap, types swap, summary widening, kind='plan_charge' bind, detail dialog rewrite)
- `el-templo-admin/src/pages/ReportesPage.vue` (import path swap, chargesPaymentMethod retype to LegacyPaymentMethod)
- `el-templo-admin/src/components/AssignPlanDialog.vue` (import path swap)
- `el-templo-admin/src/components/MemberSubscriptionTab.vue` (import path swap)
- `el-templo-admin/src/types/subscription.ts` (re-export source path swap)

**Deleted:**

- `el-templo-admin/src/composables/usePaymentsApi.ts`
- `el-templo-admin/src/types/payment.ts`

## Decisions Made

### Task 1 grep regex was overly strict — used Plan 03 SUMMARY canonical evidence instead

The plan's literal grep `request.scope.isOwner.*request.query.country` (single-line) returned 0 matches even though the owner-aware country override IS implemented in both new GET handlers. The cause is Prettier formatting: the override spans 6-7 lines per handler (routes.ts:241-247 and 291-297) so `isOwner` and `query.country` never appear on the same line.

Plan 03 SUMMARY (line 245) explicitly establishes the canonical verification gate as `grep -c "request.scope.isOwner" src/modules/finance/routes.ts === 4` (Plan 02 create + void = 2 + Plan 03 list + summary = 2). That grep returns 4 here, and reading lines 240-247 + 290-297 confirms the implementation. Plan 03 prerequisites are satisfied.

This is a Rule 1 — Bug case: the literal grep regex in the Plan 05 template was wrong, but the contract being verified is in place. No file modifications to Plan 03 deliverables (Wave 4 conflict-free invariant upheld).

### Backward-compat aliases avoid renaming churn across unrelated callsites

Three files (`MemberSubscriptionTab.vue`, `AssignPlanDialog.vue`, `ReportesPage.vue`) import `PAYMENT_METHOD_OPTIONS` and `PaymentMethod` from `payment.ts`. Renaming to `PAYMENT_METHOD_FILTER_OPTIONS` would have spread Plan 05's diff across business-logic files unrelated to CajaPage. Instead:

1. `transaction.ts` exports `PAYMENT_METHOD_FILTER_OPTIONS` (the new clearer name).
2. `transaction.ts` ALSO exports `PAYMENT_METHOD_OPTIONS = PAYMENT_METHOD_FILTER_OPTIONS` as a backward-compat alias.
3. Unrelated callsites just swap the import path `'src/types/payment'` → `'src/types/transaction'`.

Phase 109 (or a follow-up cleanup) can rename callsites when the `kind`/`paymentMethod` UI is widened.

### kind='plan_charge' on listTransactions preserves legacy "cobros" semantics

The legacy `/admin/payments/payments` endpoint inherently returned only inflow plan charges. The new `/admin/finance/transactions` returns all transaction kinds (5 kinds × 2 directions). Without a kind filter, CajaPage would suddenly start showing debt_settlement, refund, adjustment, advance_payment rows mid-Phase 106 — that's not the Plan 05 scope (Plan 05 is "surgical migration, no UI redesign"). Phase 109 introduces the kind filter UI.

debt_settlement transactions surface in Plan 04's `/api/admin/members/:userId/financial-history` (per-member view). The aggregate Caja list keeps its narrow cobros semantics for now.

### Detail dialog rewrite vs 1:1 field preservation

The legacy detail dialog showed `planName`, `subscriptionStartDate`, `subscriptionEndDate`, `reference`, `voidReason`, `createdAt`. The new `TransactionListItem` shape from Plan 03 doesn't project any of these (the server sends a flat row + `linkSummary`). To preserve the legacy detail dialog 1:1 we'd need a new GET-by-id endpoint (out of scope for Phase 106).

Trade-off accepted: detail dialog now shows id, alumno, monto, metodo, fecha, fecha efectiva, concepto (linkSummary[0]), sucursal, registrado por, notas, anulacion info. This is enough for daily Caja reconciliation. Phase 109 (richer view) or Phase 108 (per-member financial history) cover deeper drill-down.

### LegacyPaymentMethod added (Rule 1 fix)

Initial typecheck after deletion surfaced two errors in `ReportesPage.vue` lines 1070 + 1099: `chargesPaymentMethod.value` (typed as widened `PaymentMethod | undefined`) was passed to `reportsApi.getChargeHistory({ paymentMethod })` whose `ChargeReportParams.paymentMethod` is the narrow `'cash' | 'transfer' | 'card' | undefined`. The widened type is NOT assignable to the narrow type.

Fix: added `LegacyPaymentMethod = 'cash' | 'transfer' | 'card'` alias to transaction.ts, retyped `chargesPaymentMethod` ref. The dropdown only offers 3 options at runtime so this is type-system-only, no behavior change. Phase 109 will widen `ChargeReportParams.paymentMethod` server-side and remove the alias.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Task 1 grep regex didn't match multi-line Prettier-formatted code**

- **Found during:** Task 1 verification
- **Issue:** Plan's literal grep `grep -c "request.scope.isOwner.*request.query.country" el-templo-api/src/modules/finance/routes.ts` expected single-line code; Prettier formatted the owner-aware country override across 6-7 lines (routes.ts:241-247, 291-297) so the regex matched 0 times.
- **Fix:** Used Plan 03 SUMMARY's canonical evidence instead — `grep -c "request.scope.isOwner" routes.ts === 4` (matched). Visually verified the override at lines 240-247 + 290-297 is the documented owner-aware resolution.
- **Files modified:** none (verification step)
- **Documented in:** Decisions Made §1 above
- **Rule:** Plan 03 deliverables were NOT modified (Wave 4 conflict-free invariant intact).

**2. [Rule 3 — Blocking] Three additional `payment.ts` consumers blocked deletion**

- **Found during:** Task 3 pre-flight grep
- **Issue:** `grep -rln "from 'src/types/payment'" el-templo-admin/src` returned 4 files (CajaPage + AssignPlanDialog + MemberSubscriptionTab + ReportesPage). Plan only anticipated CajaPage. Deleting `payment.ts` without migrating the other three would have broken the build.
- **Fix:** Migrated all three via import path swap. Added `PAYMENT_METHOD_OPTIONS` alias to `transaction.ts` to avoid renaming the variable in business code (which would have spread the diff across non-CajaPage files unrelated to Plan 05). Also caught a fourth indirect consumer via `subscription.ts` (`import type { PaymentMethod } from './payment'` line 172) — fixed in lockstep.
- **Files modified:** AssignPlanDialog.vue, MemberSubscriptionTab.vue, ReportesPage.vue, subscription.ts
- **Verification:** `grep -rln "from 'src/types/payment'" el-templo-admin/src` now returns 0; build green.

**3. [Rule 1 — Bug] PaymentMethod widening broke ChargeReportParams narrow contract**

- **Found during:** Task 3 typecheck after deletion
- **Issue:** `ReportesPage.vue:1000` declared `const chargesPaymentMethod = ref<PaymentMethod | undefined>(undefined)`. After widening, that's 5 keys + undefined; but `ChargeReportParams.paymentMethod` (in `src/types/report.ts:78`) is the narrow `'cash' | 'transfer' | 'card' | undefined`. Two API call sites (lines 1070, 1099) failed type assignment.
- **Fix:** Added `LegacyPaymentMethod = 'cash' | 'transfer' | 'card'` alias to `transaction.ts`; retyped `chargesPaymentMethod` ref in ReportesPage. The dropdown only offers 3 options (`PAYMENT_METHOD_OPTIONS`) so this is purely a type-level narrowing — zero runtime effect.
- **Files modified:** transaction.ts (new alias), ReportesPage.vue (retype)
- **Verification:** `npx vue-tsc --noEmit 2>&1 | grep ReportesPage` returns 0 (post-fix).

---

**Total deviations:** 3 (1 verification-only Rule 1 + 1 Rule 3 scope expansion + 1 Rule 1 bug). All auto-fixable per the deviation rules. No architectural changes, no contract changes — the locked HTTP shapes from Plan 03 are intact, the production 404 path is closed, and Wave 4 file-ownership invariant holds (Plan 04 owns api repo paths, Plan 05 owns admin/_ only — verified by `git diff --name-only HEAD~2 HEAD` which shows only `el-templo-admin/_`+`.planning/\*`).

## Issues Encountered

- el-templo-admin has no `pnpm typecheck` script; used `npx vue-tsc --noEmit` directly. Pre-existing 8 errors in unrelated files (ProgramWizardDialog, SesionesDePruebaDialog, EditableBlockCard, HorariosPage, SessionEditPage, session-pdf-builder ×3) — out of scope per Plan 05 success criteria ("3 known pre-existing pdfmake errors documented as out-of-scope OK"; the actual count is 8 pre-existing errors, all unrelated to Plan 05).
- Pre-commit Prettier reformatted the detail dialog block in CajaPage.vue across multiple lines on the Task 3 commit; reformat was logical and was committed as part of Task 3.
- pnpm build emits a 6.6 MB total JS payload — pre-existing, not introduced by Plan 05.

## CajaPage Manual Smoke (deferred to Plan 06 human-verify)

- Open CajaPage in dev with valid auth token.
- Filter by month, branch, payment method.
- Verify summary cards populate without 404.
- Verify table populates with `transactionDate`, `memberName`, `amount`, `paymentMethod`, `Concepto` (linkSummary).
- Verify void action confirms with the new "Anular transaccion" copy and reloads list/summary on success.
- Owner: change country toggle, verify reload.

## User Setup Required

None — purely admin frontend code. No environment, secrets, DB schema, or external service configuration changed.

## Endpoint Migration Map

| Legacy                                   | New                                         |
| ---------------------------------------- | ------------------------------------------- |
| `GET /admin/payments/payments`           | `GET /admin/finance/transactions`           |
| `GET /admin/payments/payments/summary`   | `GET /admin/finance/transactions/summary`   |
| `POST /admin/payments/payments/:id/void` | `POST /admin/finance/transactions/:id/void` |

| Legacy field                            | New field                                             |
| --------------------------------------- | ----------------------------------------------------- |
| `result.payments`                       | `result.rows`                                         |
| `payment.paymentDate`                   | `transaction.transactionDate`                         |
| `payment.planName` + subscription dates | `transaction.linkSummary[0]` (placeholder this phase) |

## Self-Check: PASSED

**Files verified to exist:**

- FOUND: `el-templo-admin/src/composables/useTransactionsApi.ts`
- FOUND: `el-templo-admin/src/types/transaction.ts`
- FOUND: `el-templo-admin/src/pages/CajaPage.vue` (modified)
- MISSING (deleted as planned): `el-templo-admin/src/composables/usePaymentsApi.ts`
- MISSING (deleted as planned): `el-templo-admin/src/types/payment.ts`

**Commits verified:**

- FOUND: `d954e92b` — Task 2 (feat: types + composable)
- FOUND: `c6be9b6f` — Task 3 (feat: CajaPage migration + legacy deletion)

**Verification commands run:**

- `grep -rln "usePaymentsApi" el-templo-admin/src` → empty (post-deletion)
- `grep -rln "from 'src/types/payment'" el-templo-admin/src` → empty
- `grep -rln "/admin/payments/" el-templo-admin/src` → empty (D-14 closed)
- `grep -rE "from \"zod\"|from 'zod'" el-templo-admin/src` → empty (no Zod regression)
- `grep -F "useTransactionsApi" el-templo-admin/src/pages/CajaPage.vue` → 2 matches (import + instantiation)
- `grep -F "PaymentListItem" el-templo-admin/src/pages/CajaPage.vue` → 0 matches
- `npx vue-tsc --noEmit` exits 0 for all Plan 05 files (8 pre-existing errors in unrelated files persist — out of scope)
- `pnpm lint` exits 0 (6 pre-existing warnings in unrelated files)
- `pnpm build` exits 0

## Next Plan Readiness

- **Plan 106-06 (verifier):** D-14 production 404 closure is grep-verifiable via `grep -rln "/admin/payments/" el-templo-admin/src` returning empty. Owner-aware country querystring contract from Plan 03 is intact (Plan 05 did not touch API repo). useTransactionsApi composable is the new single source for finance API calls in admin.
- **Phase 109 (CajaPage v2):** Will widen the kind filter UI (5 kinds × 2 directions), the paymentMethod dropdown to 5 options (drop the 3-option `PAYMENT_METHOD_FILTER_OPTIONS` / `PAYMENT_METHOD_OPTIONS` subset), the `LegacyPaymentMethod` alias, the kind='plan_charge' implicit filter, and the minimal Concepto column placeholder.
- **Phase 108 (per-member financial history admin UI):** Will consume `useTransactionsApi.getFinancialHistory` (added by Plan 04 as a sub-resource on members/routes.ts). May reuse the same `TransactionListItem` shape.

---

_Phase: 106-endpoints-transaccionales_
_Completed: 2026-04-28_
