---
phase: 109-caja-v2-reportes
plan: "01"
subsystem: finance/summary
tags: [phase-109, finance, backend, summary, revenue-by-kind, additive]
requires:
  - el-templo-api/src/modules/finance/transaction-service.ts (Phase 106 getSummary)
  - el-templo-api/src/modules/finance/balance-service.ts:76-77 (refund=outflow convention)
provides:
  - FinanceSummary.revenueByKind (Record<TransactionKind, number>) on GET /api/admin/finance/transactions/summary
  - RevenueByKind type alias exported from finance/types.ts
affects:
  - el-templo-admin CajaPage (Plan 109-03 will consume revenueByKind for the new "Por tipo de transacción" block)
tech-stack:
  added: []
  patterns:
    - Drizzle GROUP BY column (kind) aggregation reusing shared conds[] array
    - Loose-passthrough Fastify response schema (defaults populated by service)
key-files:
  created:
    - el-templo-api/test/finance/summary-by-kind.test.ts (569 LOC)
  modified:
    - el-templo-api/src/modules/finance/types.ts (+13 LOC, RevenueByKind type + FinanceSummary field)
    - el-templo-api/src/modules/finance/schemas.ts (+15 LOC, response.revenueByKind block)
    - el-templo-api/src/modules/finance/transaction-service.ts (+33 LOC, GROUP BY kind aggregation + import)
decisions:
  - D-11 (CONTEXT): extend existing summary endpoint additively, no new endpoint
  - W4 (PLAN): refund is outflow-only per balance-service.ts:76-77; revenueByKind.refund always 0 by design (documented inline + asserted in RBK3 test)
  - Task 1 placeholder zero defaults committed first so the type-system stays clean before Task 2 wires the real aggregation (Rule 3 — blocking issue)
metrics:
  duration: ~22min
  completed: 2026-04-29
  tasks: 2
  files_touched: 4
  tests_added: 8
  tests_passing: "8/8 (new) + 59/59 (existing transactions-api regression guard)"
---

# Phase 109 Plan 01: revenueByKind summary extension Summary

Additive extension of `GET /api/admin/finance/transactions/summary` adding a `revenueByKind: Record<TransactionKind, number>` field grouped from inflow non-voided rows, sharing the existing branchId/country/dateFrom/dateTo conds. Backward-compat preserved across all 59 existing summary tests; refund-excluded negative assertion (W4) covered.

## What was built

Three file edits and one new test file, two atomic commits.

### Type + schema layer (Task 1, commit `0c02ce2e`)

- `el-templo-api/src/modules/finance/types.ts`: exported `RevenueByKind = Record<TransactionKind, number>` next to the existing `TransactionKind` declaration. Added `revenueByKind: RevenueByKind` to the `FinanceSummary` interface (non-optional in source-of-truth so the service always returns all 5 keys).
- `el-templo-api/src/modules/finance/schemas.ts`: extended `transactionsSummarySchema.response[200].properties` with a `revenueByKind` object whose 5 named integer properties (`plan_charge`, `debt_settlement`, `refund`, `adjustment`, `advance_payment`) match the type. Loose-passthrough rationale documented inline (matches the schema's existing pattern at line 218-220).
- `el-templo-api/src/modules/finance/transaction-service.ts`: added `RevenueByKind` to the existing `import type` block. Initial commit included a placeholder zero-default object so the type-system stayed clean during Task 1 (Rule 3 blocking-issue fix); Task 2 replaced it with the real aggregation.

### Service aggregation (Task 2, commit `a65e4ff1`)

- `el-templo-api/src/modules/finance/transaction-service.ts` `getSummary()`: added a 4th aggregation block after `revenueByBranch`. Reuses the same `conds[]` array (inflow + voidedAt IS NULL + filters) as the rest of the summary; performs a Drizzle GROUP BY `financialTransactions.kind` + `COALESCE(SUM(amount), 0)` query; spreads the rows into a defaulted-zero `RevenueByKind` map; threads it through the return statement. W4 documented inline as a multi-line comment referencing the balance-service convention.

### Tests (Task 2)

`el-templo-api/test/finance/summary-by-kind.test.ts` (569 LOC, 8 cases):

| Case | What it asserts                                                                                      |
| ---- | ---------------------------------------------------------------------------------------------------- |
| RBK1 | plan_charge / debt_settlement / advance_payment inflow rows produce correct buckets                  |
| RBK2 | adjustment inflow=15000 + adjustment outflow=7000 → revenueByKind.adjustment === 15000 (inflow only) |
| RBK3 | **W4** — refund row inserted at outflow direction → revenueByKind.refund === 0 (negative assertion)  |
| RBK4 | voided plan_charge row not included; only the non-voided inflow row counted                          |
| RBK5 | branchId filter restricts the buckets to that branch only                                            |
| RBK6 | dateFrom/dateTo filter restricts the buckets to that date range only                                 |
| RBK7 | empty period (future dates) returns all 5 keys === 0                                                 |
| RBK8 | response retains monthlyRevenue + revenueByMethod + revenueByBranch shape (backward compat)          |

All 8 PASS. All 59 existing transactions-api tests (which include 9 SU/SUD/SUS/SUV summary cases) continue to PASS — backward-compat preserved end-to-end.

## Verification grep outputs

```
$ grep -nc "RevenueByKind" el-templo-api/src/modules/finance/types.ts
2
$ grep -nc "revenueByKind" el-templo-api/src/modules/finance/schemas.ts
2
$ grep -nc "revenueByKind" el-templo-api/src/modules/finance/transaction-service.ts
3
$ grep -nc "groupBy.*kind" el-templo-api/src/modules/finance/transaction-service.ts
1
$ pnpm exec tsc --noEmit -p tsconfig.json
(clean — 0 errors)
$ pnpm exec vitest run test/finance/summary-by-kind.test.ts
Test Files 1 passed (1)
Tests       8 passed (8)
$ pnpm exec vitest run test/finance/transactions-api.test.ts
Test Files 1 passed (1)
Tests      59 passed (59)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] Task 1 service stub to keep tsc clean**

- **Found during:** Task 1 verification (`pnpm exec tsc --noEmit`)
- **Issue:** Adding `revenueByKind: RevenueByKind` as required on `FinanceSummary` immediately broke the `getSummary` return statement, so Task 1's `<done>` criterion "tsc clean" could not be met by editing types + schema alone.
- **Fix:** Added a placeholder zero-default `revenueByKind` to the service return inside the Task 1 commit. Task 2 then replaced the placeholder with the real Drizzle GROUP BY aggregation. Net effect: each commit is individually type-clean and the working tree is never broken.
- **Files modified:** `transaction-service.ts` (in both commits)
- **Commits:** `0c02ce2e` (placeholder), `a65e4ff1` (real aggregation)

No other deviations. No CLAUDE.md rule violations: no `any`, no `console.*`, no Zod (Fastify JSON Schema as const), integration tests against real `eltemplo_test` MySQL via `test/helpers.ts`.

## Threat surface scan

No new threat surface introduced. T-109-01 (information disclosure) per the plan's `<threat_model>` is mitigated: the new field reuses `FINANCE_READ_ROLES` + `attachCountryScope` (no route changes). Test SUD1 (existing) continues to enforce coach denial; non-owner-AR scoping is enforced by SUS1 + SU6.

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/finance/types.ts (RevenueByKind exported, FinanceSummary extended)
- FOUND: el-templo-api/src/modules/finance/schemas.ts (revenueByKind block in transactionsSummarySchema)
- FOUND: el-templo-api/src/modules/finance/transaction-service.ts (GROUP BY kind aggregation + import)
- FOUND: el-templo-api/test/finance/summary-by-kind.test.ts (8 cases, all PASS)
- FOUND: commit 0c02ce2e (Task 1)
- FOUND: commit a65e4ff1 (Task 2)
