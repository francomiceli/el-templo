---
phase: 105-modelo-de-datos-drop-del-viejo
plan: 04
subsystem: analytics-reports
tags: [refactor, finance, analytics, reports, financial-transactions, d-01]

# Dependency graph
requires:
  - plan: 105-02
    provides: financialTransactions schema + transactionLinks schema (Drizzle exports + ts types)
provides:
  - analytics/service.ts revenue helpers consume financial_transactions with kind/direction/voidedAt filter (D-01)
  - reports/service.ts charge history (Drizzle count + raw SQL row fetch) consumes financial_transactions joined via transaction_links pivot
  - reports/service.ts trial conversion revenue subquery hits financial_transactions
affects: [105-05, 105-06, 105-07, 105-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-01 revenue filter as a 3-condition canonical: isNull(voidedAt) + inArray(kind, ['plan_charge','debt_settlement']) + eq(direction, 'inflow'). Applied identically across getRevenueTrend, getRevenueByMethod, getRevenueByBranch, sumRevenue, buildChargeConditions, the raw charge SQL, and the trial revenue subquery."
    - "transaction_links pivot join: queries that need subscription/plan info now go financial_transactions → transaction_links (target_kind='subscription') → subscriptions → subscription_plans, replacing the legacy direct payments.subscription_id column."
    - "Column alias preservation: raw SQL maps ft.transaction_date AS paymentDate so existing ChargeReportRow mapper at L204 stays untouched — consumer types unchanged."
    - "getRevenueByBranch now groups directly on financial_transactions.branch_id (first-class column per SPEC §1) — drops the users join previously needed to resolve the member's branch."

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/analytics/service.ts
    - el-templo-api/src/modules/reports/service.ts

key-decisions:
  - "Plan 105-04: getRevenueByMethod result shape preserved as { cash, transfer, card } — new payment_method enum values 'aura_credit' and 'internal' are excluded by the kind/direction filter (kind IN plan_charge/debt_settlement only emits cash/transfer/card in practice). Hardened the for-loop to type-guard on the literal union instead of `as` cast (T-105-17 defense-in-depth)."
  - "Plan 105-04: D-01 filter live in BOTH the Drizzle helper (buildChargeConditions) AND inline in the raw SQL block (`AND ft.kind IN (...) AND ft.direction = 'inflow' AND ft.voided_at IS NULL`). Reason: count() and row-fetch take different code paths; centralizing in the helper would force restructuring the raw template. Two sources is acceptable because the canonical 3 conditions are identical across both."
  - "Plan 105-04: Trial conversion revenue subquery uses alias `fx` to avoid colliding with the existing `ft` (firstTrial) alias in the outer query. Same kind/direction/voided_at filter as the rest of the plan."
  - "Plan 105-04: paymentDate alias intentionally PRESERVED (sourced from ft.transaction_date) in raw SQL row fetch to keep ChargeReportRow shape and frontend ReportesPage mappers untouched. Renaming to transactionDate is an admin/types change deferred to a future cleanup pass."
  - "Plan 105-04: getRevenueByBranch dropped the 3-table chain (payments → users → branches) for a 2-table chain (financial_transactions → branches) since branch_id is first-class on financial_transactions. Same response shape (branchId/branchName/revenue) — only query plan changes."

patterns-established:
  - "When migrating service queries from a parent-table-with-FK shape to a pivot-joined shape, prefer adding the canonical filter set once in the build*Conditions helper plus once inline in any raw SQL — over duplicating across N call sites."
  - "Drizzle inArray() over enum literals types cleanly when the literals appear directly inside the call (no const-array fallback needed for the kind values)."

requirements-completed:
  - TXN-03

# Metrics
duration: 6min
completed: 2026-04-28
tasks: 2
files-modified: 2
---

# Phase 105 Plan 04: Reescritura de Queries Analytics+Reports vs financial_transactions Summary

Replace every `schema.payments` / `FROM payments` query in `analytics/service.ts` and `reports/service.ts` with `schema.financialTransactions` queries that apply the D-01 canonical revenue filter (`kind IN ('plan_charge','debt_settlement') AND direction='inflow' AND voided_at IS NULL`). The change preserves all public method signatures and response shapes — only the underlying data source moves to the new transactional model.

## Method Names Rewritten (analytics/service.ts)

CONTEXT.md and PATTERNS.md gave slightly different names. Authoritative list per file inspection (lines 781-970):

| Method               | Lines   | Change kind                                                                                                             |
| -------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| `getRevenueTrend`    | 781-816 | swap table; D-01 filter; transactionDate replaces paymentDate in SELECT/GROUP/ORDER                                     |
| `getRevenueByMethod` | 818-855 | swap table; D-01 filter; tightened method type-guard from `as` cast to literal-union check                              |
| `getRevenueByBranch` | 856-892 | swap table; D-01 filter; **drops users join** (branch first-class on ft); branchId filter now on `ft.branchId` directly |
| `sumRevenue`         | 941-970 | swap table; D-01 filter                                                                                                 |

## Query Blocks Rewritten (reports/service.ts)

| Block | Lines   | Type           | Change                                                                                                                                                                                                                                                         |
| ----- | ------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1    | 167-193 | Drizzle        | `getChargeHistory` count: from financial_transactions + INNER JOIN transaction_links (target_kind='subscription') + subscriptions + users + branches                                                                                                           |
| A2    | 195-237 | Raw SQL        | `getChargeHistory` row fetch: `FROM financial_transactions ft INNER JOIN transaction_links tl ... INNER JOIN subscriptions s ON s.id = tl.target_id ...`; inline kind/direction/voided_at; alias `paymentDate`/`paymentMethod`/`voidedAt`/`memberId` preserved |
| B     | 432-437 | Raw SQL        | Trial conversion `revenue` subquery: from financial_transactions with kind/direction/voided_at filter; uses alias `fx` to avoid colliding with outer `ft` (firstTrial)                                                                                         |
| C     | 740-783 | Drizzle helper | `buildChargeConditions` adds the 3-condition D-01 filter (kind IN, direction='inflow', isNull voidedAt) and rewrites paymentDate→transactionDate, paymentMethod col                                                                                            |
| D     | 791-799 | Raw SQL helper | `buildChargeConditionsRaw` rewrites `p.payment_date`→`ft.transaction_date` and `p.payment_method`→`ft.payment_method`                                                                                                                                          |

## paymentDate Alias Decision (per <output> question)

**Preserved** in both Drizzle response and raw SQL — the column is sourced from `ft.transaction_date AS paymentDate`. Reason: `ChargeReportRow` (in reports/types.ts) keeps the field name `paymentDate`, and the admin frontend `ReportesPage` mappers consume it. Renaming would cascade into types + UI without functional benefit. A future cleanup pass can rename if there's value, but the v4.8 contract toward existing consumers stays identical.

## Consumer Code Path Impact

Zero. The 3 SELECT shapes that flow back to consumers:

1. `getMonthlyRevenueKpi` / `getRevenueTrend` → returns `{ month, revenue }[]` — identical shape, identical column types.
2. `getRevenueByMethod` → returns `{ cash, transfer, card }` — identical (the kind/direction filter ensures only those three method values appear).
3. `getRevenueByBranch` → returns `{ branchId, branchName, revenue }[]` — identical (only the underlying join changes from `users.branchId` to `ft.branchId`; the response field is the same).
4. `getChargeHistory` row → returns `ChargeReportRow` with field `paymentDate` — identical (alias preserved).
5. Trial conversion `revenuePerTrial` → returns the same number with the same definition (sum of inflow charges per converted user).

No types updated, no admin frontend touched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Dead variable removed in getChargeHistory**

- **Found during:** Task 2
- **Issue:** `const recorderAlias = sql\`recorder\`` was declared and never used.
- **Fix:** Removed declaration when refactoring the count query.
- **Files modified:** `el-templo-api/src/modules/reports/service.ts`
- **Commit:** c3b5024d

**2. [Rule 2 - Type safety] Hardened payment-method type guard**

- **Found during:** Task 1
- **Issue:** Original code used `row.method as "cash" | "transfer" | "card"` cast. With the broader `payment_method` enum on `financial_transactions` (now includes `aura_credit`, `internal`), an `as` cast would silently misroute any leaked row to `result.cash`. Even though the kind/direction filter already excludes those, defense in depth is cheap.
- **Fix:** Replaced `as` cast with an explicit literal-union type guard (`if (row.method === "cash" || ...)`). T-105-17 defense-in-depth.
- **Files modified:** `el-templo-api/src/modules/analytics/service.ts`
- **Commit:** 427bb67f

No Rule 3 or Rule 4 deviations.

## Auth Gates

None.

## Verification Results

- `grep -c "schema\.payments" src/modules/analytics/service.ts` → **0** (was 14)
- `grep -c "schema\.financialTransactions" src/modules/analytics/service.ts` → **40** (≥6 required)
- `grep -c "inArray(schema.financialTransactions.kind" src/modules/analytics/service.ts` → **4** (≥3 required)
- `grep -c "eq(schema.financialTransactions.direction" src/modules/analytics/service.ts` → **4** (≥3 required)
- `grep -c "isNull(schema.financialTransactions.voidedAt)" src/modules/analytics/service.ts` → **4** (≥3 required)
- `grep -nE "FROM\s+payments|schema\.payments|p\.payment_date" src/modules/reports/service.ts` → **NONE FOUND**
- `grep -c "schema\.financialTransactions\|financial_transactions" src/modules/reports/service.ts` → **14** (≥4 required)
- `grep -c "transaction_links\|schema\.transactionLinks" src/modules/reports/service.ts` → **6** (≥1 required)
- `pnpm tsc --noEmit | grep -E "analytics/service\.ts|reports/service\.ts" | wc -l` → **0** (both files clean)
- Total typecheck errors: **148 → 114** (only `payments/`, `members/service.ts`, `members/debts-service.ts` remain — Plans 05+06)
- `pnpm test test/finance` → **13/13 passing** (40s)

## Threat Model Compliance

- **T-105-15 (SQL Injection in raw SQL):** All `${var}` placeholders flow through Drizzle's `sql` template tag. Verified by inspection: no string concatenation in any of the 4 modified blocks. The `buildChargeConditionsRaw` helper builds an array of `sql\`...\``fragments and joins via`sql.join(parts, sql\` AND \`)` — fully parameterized.
- **T-105-17 (Inflated revenue from filter regression):** D-01 canonical filter applied uniformly across all 4 analytics methods + 2 reports query blocks + 1 helper. The `direction='inflow'` clause ensures refunds (which are `direction='outflow'` per SPEC §1) are excluded from revenue sums even if they share `kind='plan_charge'`. The `kind IN ('plan_charge','debt_settlement')` excludes `adjustment` (admin tweaks) and `advance_payment` (not yet earned).

## Self-Check: PASSED

- [x] Both modified files exist:
  - `el-templo-api/src/modules/analytics/service.ts` — FOUND
  - `el-templo-api/src/modules/reports/service.ts` — FOUND
- [x] Commits exist:
  - 427bb67f (Task 1) — FOUND
  - c3b5024d (Task 2) — FOUND
- [x] Self-check verification commands re-run after writing summary; all pass.
