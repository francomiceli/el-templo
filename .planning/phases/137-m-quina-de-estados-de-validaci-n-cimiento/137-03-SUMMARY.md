---
phase: 137-m-quina-de-estados-de-validaci-n-cimiento
plan: 03
subsystem: finance
tags: [validation, firm-money, blast-radius, regression, analytics, reports]
requires:
  - financial_transactions.validation_status (plan 01 — migration 0153)
  - firm-money.ts canonical predicate helper (plan 01)
  - TransactionService.validate/create role→status (plan 02)
provides:
  - 13 firm-money call sites routed through firm-money.ts (validation_status='validado')
  - firmMoneySqlFor(alias) for unambiguous aliased raw-SQL embeddings
  - subscriptions cancel guard (#14) documented as deliberate exception
  - validation-regression.test.ts R1-R4 (phase gate, VAL-05/VAL-07)
affects:
  - phase 138 (caja entity reads firm money via the now-centralized predicate)
  - phase 141 (pendientes inbox — pendientes are now excluded from firm cash)
tech-stack:
  added: []
  patterns:
    - "Single-source firm-money predicate: firmMoneyConditions() (Drizzle), FIRM_MONEY_SQL (unaliased raw), firmMoneySqlFor(alias) (aliased correlated subqueries)"
    - "Deliberate-exception documentation at an integrity guard so the plan-checker does not flag it as an omission"
    - "Regression-by-identity: validado fixtures cross-checked across two subsystem paths (finance summary + analytics caja) to prove the centralized predicate agrees"
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/finance/firm-money.ts
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/analytics/ticket-service.ts
    - el-templo-api/src/modules/analytics/ltv-service.ts
    - el-templo-api/src/modules/analytics/service.ts
    - el-templo-api/src/modules/analytics/advanced-finance-service.ts
    - el-templo-api/src/modules/reports/service.ts
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/test/finance/validation-regression.test.ts
decisions:
  - "Added firmMoneySqlFor(alias) to firm-money.ts (Rule 2): the 3 raw-SQL sites all reference financial_transactions through an alias (ft/ft/fx) inside correlated subqueries, where the unqualified FIRM_MONEY_SQL would be the project's known wrong-table-binding footgun. The qualified helper keeps a single source of truth AND guarantees unambiguous binding."
  - "Drizzle sites that mix kind IN(...)/direction get eq(validationStatus,'validado') added directly (consistent per-file); getSummary (the cleanest, voided+validated-only firm slice) spreads firmMoneyConditions() — per the plan's per-file consistency guidance."
  - "R3 exercises TWO representative metric paths directly (finance getSummary #1 + analytics getAdvancedFinance cashTrend #10) and asserts they agree on validado totals and both reject a pendiente. The full 6-metric cross-suite invariant is enforced by the EXISTING test/analytics/* and test/reports/* suites running unchanged (verified: 0 files touched)."
metrics:
  duration: ~18min
  completed: 2026-06-24
---

# Phase 137 Plan 03: Máquina de estados de validación (cimiento) Summary

The blast-radius refactor (VAL-05): all 13 firm-money read sites now route through the canonical `firm-money.ts` predicate and gain `validation_status='validado'`, the single integrity-guard exception (subscriptions cancel) is preserved and documented, and the R1-R4 regression suite — the phase gate — proves a PENDIENTE settles the member's debt yet never moves firm cash, while validados produce identical numbers across finance and analytics paths.

## What Was Built

**Task 1 — 10 finance + analytics call sites** (`f4aa5772`)

- `getSummary` (transaction-service, site #1): now spreads `firmMoneyConditions()` alongside its `direction='inflow'`; `isNull` import dropped (no longer used there).
- `ticket-service` linkedCharges (#2) + universeCountByCurrency (#3), `ltv-service` realPaymentsByMember (#4), `analytics/service` getRevenueTrend/byMethod/byBranch/sumRevenue (#5-#8), `advanced-finance` cashTrend (#10): each gains `eq(validationStatus,'validado') as unknown as SQL` next to its existing `isNull(voidedAt)` (these sites mix caller-specific `kind IN(...)`/`direction`, so the single new predicate is added directly — consistent within each file).
- `analytics/service` yaPagoExpr raw EXISTS (#9): the `ft.voided_at IS NULL` line replaced with `${sql.raw(firmMoneySqlFor("ft"))}` — a PENDIENTE no longer marks "ya pagó" as firm.
- Added `firmMoneySqlFor(alias)` to `firm-money.ts` for unambiguous aliased raw SQL.

**Task 2 — 3 reports sites + the #14 exception** (`eafa5b24`)

- `reports/service` charge-history listing (#11, alias `ft`) and trial→conversion subquery (#12, alias `fx`): both raw correlated subqueries now use `${sql.raw(firmMoneySqlFor("ft"|"fx"))}`. Note #12's outer `ft` is a trial-derived subquery alias — qualifying the inner predicate with `fx` (the real `financial_transactions`) is precisely what removes the ambiguity.
- `buildChargeConditions` (#13, Drizzle): gains `eq(validationStatus,'validado')`.
- `subscriptions/service` active-charges cancel guard (#14): **left as `voided_at IS NULL` only** with a multi-line comment marking it a deliberate phase-137 exception — a PENDIENTE is a live charge that MUST keep blocking cancellation, not firm income. Greppable markers (`excepcion`/`integridad`/`cobro vivo`) present so the plan-checker does not flag it.

**Task 3 — R1-R4 regression (phase gate)** (`53082c33`)

- Filled `validation-regression.test.ts` (replacing all `it.todo`):
  - **R1:** a validado 1000 sets firm saldo=1000; a coach-derived PENDIENTE of 5000 leaves it at 1000.
  - **R2:** a PENDIENTE 5000 → firm saldo=0; after `validate()` → firm saldo=5000 (delta == amount).
  - **R3:** three validado charges (1000+2000+3000) → both `getSummary.monthlyRevenue` (#1) and `getAdvancedFinance` `cashTrend` ARS sum (#10) report 6000 (the centralized predicate agrees cross-subsystem); a PENDIENTE 9999 changes NEITHER.
  - **R4:** a seeded 1000 debt + a PENDIENTE 1000 → `balances` → 0 (deuda saldada via unconditional `applyDelta`) yet firm saldo stays 0 (D-09).
- The existing `test/analytics/*` and `test/reports/*` (and `test/finance/summary-*`) suites are UNCHANGED — they are the real cross-suite regression guard for the 6 v5.0 metrics.

## Phase-Critical Constraints — Compliance

- 13 of 14 sites gain `validation_status='validado'` via the centralized helper — CONFIRMED (firmMoneyConditions at #1; direct `eq(validationStatus,'validado')` at #2-#8,#10,#13; firmMoneySqlFor at the 3 raw sites #9,#11,#12).
- subscriptions:#14 stays `voided_at IS NULL` only + documented exception — CONFIRMED (grep `excepcion|integridad|cobro vivo` = 2 hits).
- FIRM_MONEY_SQL / firmMoneySqlFor embeddings unambiguous — CONFIRMED (all 3 raw sites use the alias-qualified `firmMoneySqlFor`; none rely on bare unqualified columns inside a multi-table/correlated context).
- Regression R1-R4 implemented; existing analytics/reports test files unchanged — CONFIRMED (`git diff --name-only -- test/analytics test/reports` = 0; `git status` clean on those dirs and `summary-*`).
- typecheck passes — CONFIRMED (`pnpm tsc --noEmit` clean after each task).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical functionality] Aliased raw-SQL sites needed a qualified firm-money fragment**

- **Found during:** Tasks 1+2
- **Issue:** The plan's `FIRM_MONEY_SQL` constant uses UNqualified columns. All 3 raw-SQL sites (#9 `ft`, #11 `ft`, #12 `fx`) reference `financial_transactions` through a table alias inside correlated/multi-table subqueries — exactly the project's documented footgun where unqualified columns can silently bind to the wrong table. Embedding the bare constant would be ambiguous (a correctness/security risk per the phase constraints, which explicitly require verifying each raw embedding is unambiguous).
- **Fix:** Added `firmMoneySqlFor(alias: string)` to `firm-money.ts` — returns the same predicate with both columns alias-qualified. `alias` is a hard-coded internal alias (never user input), so it stays an injection-safe static fragment. Keeps a single source of truth while guaranteeing unambiguous binding.
- **Files modified:** `firm-money.ts` (additive — `firmMoneyConditions` and `FIRM_MONEY_SQL` untouched), and the 3 raw sites consume it.
- **Commit:** `f4aa5772` (helper + #9), `eafa5b24` (#11, #12).

**2. [Cosmetic] Task-1 commit header miscount**

- The `f4aa5772` commit subject says "8 finance+analytics call sites" but actually covers 10 (#1-#10). The commit body lists #1-#10 correctly; not amended (staging-first, nothing pushed; body is authoritative). No code impact.

## Known Stubs

None. All `it.todo` in `validation-regression.test.ts` are replaced with real integration cases (grep `it.todo` = 0).

## Threat Flags

None. No new network endpoints, auth paths, file access, or schema changes — this plan only refactors existing read-side predicates and adds a test. The 3 raw-SQL embeddings use a static, non-interpolated, alias-qualified fragment (T-137-10 mitigated).

## TDD Gate Compliance

This wave filled the plan-01 RED scaffold (`validation-regression.test.ts` shipped as `it.todo`). The behaviour it asserts (the 13-site predicate) was implemented in tasks 1+2 (`feat(...)`), then the tests were filled in task 3 (`test(...)`). The suite runs in CI on push (project rule: no local full-suite runs; typecheck local only, which passes clean). The cross-suite regression guard (existing analytics/reports suites unchanged) is the real GREEN gate for the 6 v5.0 metrics.

## Self-Check: PASSED

- `el-templo-api/src/modules/finance/firm-money.ts` — FOUND (`firmMoneyConditions`, `FIRM_MONEY_SQL`, `firmMoneySqlFor`)
- `el-templo-api/src/modules/finance/transaction-service.ts` — FOUND (getSummary spreads `firmMoneyConditions()`)
- `el-templo-api/src/modules/analytics/{ticket,ltv,service,advanced-finance}-service.ts` — FOUND (validado predicate)
- `el-templo-api/src/modules/reports/service.ts` — FOUND (3 sites via firmMoneySqlFor + Drizzle eq)
- `el-templo-api/src/modules/subscriptions/service.ts` — FOUND (#14 exception comment)
- `el-templo-api/test/finance/validation-regression.test.ts` — FOUND (no `it.todo`; R1-R4)
- Commits `f4aa5772`, `eafa5b24`, `53082c33` — all FOUND in git log
- `pnpm tsc --noEmit` — clean
- existing test/analytics/_ + test/reports/_ — unchanged (0 files)
