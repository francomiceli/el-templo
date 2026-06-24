---
phase: 139-movimientos-inter-caja-y-egresos
plan: 01
subsystem: database
tags: [drizzle, mysql, finance, ledger, migration, enum, vitest]

# Dependency graph
requires:
  - phase: 137-validacion
    provides: void()/_void(tx) soft-void primitive, firmMoneyConditions(), AuditAction 'reconciliation'
  - phase: 138-entidad-caja-saldos
    provides: cash_registers, cash_register_id on the ledger, getBalance (// TODO 139), currency guard, resolveCashRegister
provides:
  - financial_transactions.kind extended with cash_transfer + expense (DB + mysqlEnum, byte-for-byte)
  - member_id + branch_id nullable (D-06, egresos/movimientos sin socio/sucursal)
  - CreateTransactionInput.memberId & branchId widened to number | null
  - KINDS_ALLOWED_WITHOUT_LINKS includes cash_transfer + expense (links [] OK)
  - create() skips member/branch-exists probe when null
  - public voidPair(ids, voidedBy, input) — voids N rows atomically in one db.transaction
  - getSummary excludes cash_transfer/expense (MUST-FIX A); applyDelta no-op on empty links (MUST-FIX B)
affects:
  [
    139-02,
    139-03,
    MovementService,
    getBalance outflow,
    void-the-pair,
    phase-141-caja-history,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Honest-model nullability (D-06 extended to branch_id): NULL over sentinel; INNER JOIN drops NULL rows from member/branch-keyed metrics"
    - "voidPair(ids[]) primitive wraps private _void for N rows in one tx (research Access note option a)"
    - "getSummary conds[] kind-exclusion as the second layer beneath INNER JOIN, keeping revenue member-only"

key-files:
  created:
    - el-templo-api/src/db/migrations/0155_movement_expense_kinds.sql
  modified:
    - el-templo-api/src/db/schema/financial-transactions.ts
    - el-templo-api/src/modules/finance/types.ts
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/finance/balance-service.ts
    - el-templo-api/src/modules/finance/cash-register-service.ts
    - el-templo-api/src/modules/finance/schemas.ts
    - el-templo-api/src/modules/finance/routes.ts
    - el-templo-api/src/modules/analytics/service.ts
    - el-templo-api/test/finance/summary-by-kind.test.ts

key-decisions:
  - "branch_id made NULLABLE (extends D-06): movimientos/egresos a cajas branch-less (central/banco) almacenan NULL; auditoría confirma que ningún metric branch-keyed se rompe (todos INNER JOIN branches)"
  - "Fastify response schema + KIND_ENUM ampliados a 7 kinds — la API stripeaba silenciosamente las 2 keys nuevas, rompiendo la regresión (Rule 3)"
  - "applyDelta usa early-return + narrow explícito de memberId null para filas con link (un length-guard solo no narrowa la propiedad)"

patterns-established:
  - "Pattern: link-bearing row always has a real member — narrow memberId !== null at the loop body, throw on violation"
  - "Pattern: flatMap-filter null branchId for response shapes that require branchId: number while DB column is nullable"

requirements-completed: [MOV-01, MOV-02, MOV-03, MOV-04]

# Metrics
duration: 13min
completed: 2026-06-24
---

# Phase 139 Plan 01: Ledger foundation for movements + expenses Summary

**Extended financial_transactions with cash_transfer + expense kinds, made member_id/branch_id nullable (migration 0155), and closed the two RESEARCH must-fix leaks (getSummary revenue inflation + applyDelta no-op) plus a public voidPair primitive — proven by 2 new regression tests.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-06-24T19:19:35Z
- **Completed:** 2026-06-24T19:32:21Z
- **Tasks:** 3
- **Files modified:** 9 (1 created, 8 modified)

## Accomplishments

- Migration 0155 (hand-written, additive/non-destructive): enum +2 values appended last, member_id + branch_id → NULL. Applied idempotently via `pnpm db:migrate`.
- Schema + types widened in sync ($inferSelect propagates TransactionKind/RevenueByKind; CreateTransactionInput.memberId & branchId now `number | null`).
- MUST-FIX A: getSummary conds[] now `notInArray(kind, ['cash_transfer','expense'])` — a movement inflow leg never inflates monthlyRevenue nor leaks a key into revenueByKind.
- MUST-FIX B: applyDelta early-returns on empty links (no-op) + explicit member-null narrow — a movement/expense never touches `balances`.
- Public `voidPair(ids[], voidedBy, input)` voids N rows atomically; private `_void` unchanged.
- branch_id blast-radius audit confirmed: every `financial_transactions.branchId` aggregation (getSummary revenueByBranch, analytics revenueByBranchByCurrency) is INNER-JOIN-protected; NULLABLE is safe.
- 2 new regression tests (MOV-A: NULL-branch movement leaves monthlyRevenue/byBranch/byKind untouched; MOV-B: movement/expense no-op on `balances`). Full `summary-by-kind.test.ts` = 10/10 green locally.

## Task Commits

1. **Task 1: Migration 0155 + schema + type widening** - `50d141d0` (feat)
2. **Task 2: KINDS_ALLOWED_WITHOUT_LINKS + create() null guards + voidPair** - `b98ae1e4` (feat)
3. **Task 3: MUST-FIX A/B + branch audit + regression tests** - `876ad0d8` (feat)

## Files Created/Modified

- `el-templo-api/src/db/migrations/0155_movement_expense_kinds.sql` - enum +2, member_id + branch_id NULL (hand-written)
- `el-templo-api/src/db/schema/financial-transactions.ts` - mysqlEnum kind +2 appended last; drop .notNull() on memberId + branchId
- `el-templo-api/src/modules/finance/types.ts` - CreateTransactionInput.memberId/branchId → number|null; TransactionListItem memberId/branchId → number|null
- `el-templo-api/src/modules/finance/transaction-service.ts` - 2 kinds in KINDS_ALLOWED_WITHOUT_LINKS; create() null guards; voidPair; getSummary kind-exclusion + revenueByKind +2 keys + revenueByBranch null-filter
- `el-templo-api/src/modules/finance/balance-service.ts` - applyDelta early-return on empty links + member-null narrow
- `el-templo-api/src/modules/finance/cash-register-service.ts` - resolveCashRegister branchId → number|null + cash-without-branch guard
- `el-templo-api/src/modules/finance/schemas.ts` - KIND_ENUM +2; summary revenueByKind response schema +2 keys
- `el-templo-api/src/modules/finance/routes.ts` - REST create null-branch guard; KIND_LABELS_ES +2
- `el-templo-api/src/modules/analytics/service.ts` - revenueByBranchByCurrency null-branch skip
- `el-templo-api/test/finance/summary-by-kind.test.ts` - 2 new regression cases + updated 5→7 key assertions

## Decisions Made

- **branch_id NULLABLE (extends D-06):** decided per RESEARCH branch-keyed audit. Movimientos/egresos a cajas branch-less (central efectivo, banco ARS/EUR) have no single sucursal; the honest model stores NULL. Audit confirmed every branchId aggregation INNER JOINs branches, so no metric breaks.
- **Fastify response schema widened:** the summary route declared only 5 revenueByKind keys; Fastify stripped the 2 new keys over the wire, making the regression test see `undefined`. Widening both KIND_ENUM and the response schema was required for the API to actually return the keys the service computes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] member_id/branch_id widening fallout across non-finance files**

- **Found during:** Task 2 (tsc after type widening)
- **Issue:** Widening memberId/branchId to `number | null` broke tsc at `analytics/service.ts` (revenueByBranchByCurrency Map key), `finance/routes.ts` (branch country check), and the create() INSERT path — sites the plan's `<interfaces>` did not enumerate.
- **Fix:** Null-branch `continue` in analytics (INNER-JOIN-dropped rows); REST create null-branch 400 guard + local non-null binding; resolveCashRegister branchId widened with explicit cash-without-branch guard.
- **Files modified:** analytics/service.ts, finance/routes.ts, finance/cash-register-service.ts, finance/transaction-service.ts
- **Verification:** `npx tsc --noEmit` green.
- **Committed in:** b98ae1e4 (Task 2)

**2. [Rule 3 - Blocking] Fastify summary response schema + KIND_ENUM stripped the 2 new kinds**

- **Found during:** Task 3 (test execution — `after.revenueByKind.cash_transfer` was `undefined` over the wire)
- **Issue:** The `/transactions/summary` response schema declared only 5 revenueByKind keys; Fastify's response serialization dropped cash_transfer/expense even though the service returned them. RBK1/RBK7/RBK8 (5-key exact-match) and the new MOV-A also failed.
- **Fix:** Added cash_transfer + expense to the summary response schema and to KIND_ENUM (also makes them filterable for the phase-141 caja history); updated the 3 existing exact-match assertions to the 7-key shape.
- **Files modified:** finance/schemas.ts, test/finance/summary-by-kind.test.ts
- **Verification:** `summary-by-kind.test.ts` 10/10 green; tsc green.
- **Committed in:** 876ad0d8 (Task 3)

**3. [Rule 1 - Bug] KIND_LABELS_ES + analytics Record missing the 2 new kinds**

- **Found during:** Task 2 (tsc)
- **Issue:** `Record<TransactionKind, string>` label map (routes.ts) and the revenueByKind fixed record (transaction-service.ts) were missing the 2 newly-added enum keys → tsc TS2739.
- **Fix:** Added "Movimiento entre cajas" / "Egreso" labels and cash_transfer/expense: 0 to the revenueByKind record (always 0 by the conds exclusion).
- **Files modified:** finance/routes.ts, finance/transaction-service.ts
- **Verification:** tsc green; MOV-A asserts the keys are present and 0.
- **Committed in:** b98ae1e4, 876ad0d8

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug)
**Impact on plan:** All auto-fixes were necessary type-widening/serialization fallout from the planned schema change. The schema/KIND_ENUM widening slightly enlarges the surface (REST create body now accepts the 2 kinds), but create()'s existing guards make that safe; no architectural change. No scope creep beyond the plan's intent.

## Issues Encountered

- The plan claimed `if (links.length === 0) return;` would narrow `transaction.memberId`. It does not — a length guard does not narrow a sibling property. Added an explicit `if (transaction.memberId === null) throw` inside the loop body (a link-bearing row always has a member) to satisfy tsc. Resolved within Task 3.

## Known Stubs

None. cash_transfer/expense revenueByKind keys are intentionally always 0 (excluded by getSummary conds, MUST-FIX A) — documented, not a stub.

## Threat Flags

None beyond the plan's threat_model. The schema/KIND_ENUM widening lets the REST create endpoint accept the 2 new kinds, but the existing create() guards (links, member/branch existence, role checks at the route) bound it; dedicated movement/expense routes land in Plan 03.

## User Setup Required

None - no external service configuration required. Migration 0155 applied locally; production applies it on deploy (additive/non-destructive).

## Next Phase Readiness

- Schema + type foundation ready for 139-02 (getBalance outflow extension) and 139-03 (MovementService 2-row asiento + reconciliation, using voidPair for atomic pair-void).
- **Flag for phase 141 (caja history):** every current finance list/export uses INNER JOIN users → NULL-member egresos/movimientos are DROPPED. Phase 141 must use a LEFT JOIN (or kind-aware query) to render them. (RESEARCH Open Question 1.)
- **Flag for 139-02 (getBalance outflow / Pitfall 4):** once getBalance subtracts ALL outflows since cutoff, pre-existing refund outflow rows carrying a cash_register_id would also be subtracted — confirm intended behavior + add a test.

---

_Phase: 139-movimientos-inter-caja-y-egresos_
_Completed: 2026-06-24_

## Self-Check: PASSED

- FOUND: el-templo-api/src/db/migrations/0155_movement_expense_kinds.sql
- FOUND: .planning/phases/139-movimientos-inter-caja-y-egresos/139-01-SUMMARY.md
- FOUND commits: 50d141d0, b98ae1e4, 876ad0d8
