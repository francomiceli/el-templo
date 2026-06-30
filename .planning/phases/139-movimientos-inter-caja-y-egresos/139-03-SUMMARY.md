---
phase: 139-movimientos-inter-caja-y-egresos
plan: 03
subsystem: finance
tags:
  [
    drizzle,
    mysql,
    finance,
    ledger,
    movement,
    expense,
    reconciliation,
    void,
    fastify,
    vitest,
  ]

# Dependency graph
requires:
  - phase: 137-validacion
    provides: void()/_void(tx) soft-void, AuditAction 'reconciliation', firm-money
  - phase: 138-entidad-caja-saldos
    provides: cash_registers, getBalance, currency guard pattern
  - phase: 139-01
    provides: cash_transfer + expense kinds, member_id/branch_id nullable, create(tx?) cashRegisterId override, voidPair, KINDS_ALLOWED_WITHOUT_LINKS
  - phase: 139-02
    provides: signed getBalance (firmeBalance subtracts validado outflows since cutoff)
provides:
  - MovementService facade (registerMovement, registerExpense, voidMovement, voidExpense)
  - 2-row cash_transfer asiento (net 0) linked both-ways via transaction_links, one db.transaction (MOV-01)
  - same-currency guard rejects cross-currency before any write (MOV-01 / D-03)
  - reconciliation (D-04): adjustment row at origen only on diff + 'reconciliation' audit always recording expected/counted/diff (MOV-02)
  - expense = 1 outflow row subtracting from caja saldo, applyDelta no-op (MOV-03)
  - void-the-pair atomic (both legs + adjustment via voidPair); void expense single (MOV-04)
  - 4 admin-only REST routes (FINANCE_VOID_ROLES server-side) + country scope + JSON schema
affects: [phase-140-carga, phase-141-caja-history, CajaPage, FinanzasTab]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Facade composing 137/138 primitives: registerMovement opens one db.transaction and threads the tx handle into both create(tx?) calls + the link inserts + the reconciliation adjustment + the audit row (all-or-nothing)"
    - "Both-ways tx-to-tx links (target_kind='transaction', allocatedAmount 0) as the provenance graph voidMovement walks to discover the sibling leg + adjustment from either leg id"
    - "Route country-scope for branch-less cajas: resolve country via caja→branch LEFT JOIN; NULL branch (central/banco) = owner-only; 404 for unknown/cross-country (no existence leak)"

key-files:
  created:
    - el-templo-api/src/modules/finance/movement-service.ts
    - el-templo-api/test/finance/movement-service.test.ts
  modified:
    - el-templo-api/src/modules/finance/types.ts
    - el-templo-api/src/modules/finance/schemas.ts
    - el-templo-api/src/modules/finance/routes.ts
    - el-templo-api/src/modules/finance/index.ts

key-decisions:
  - "Reconciliation modeled as a SEPARATE kind='adjustment' row linked to the origen leg (vs a discrepancy column on the movement row) — reuses the signed getBalance so the saldo auto-corrects to counted, and the void-the-pair walk picks it up via the same transaction_links graph"
  - "The 'reconciliation' audit row is ALWAYS written (even when counted==expected or omitted) — cheap clean trail recording the expected saldo at the moment of every movement; only the adjustment ledger row is conditional (on diff)"
  - "registerMovement/registerExpense always pass paymentMethod:'internal' + an explicit cashRegisterId override, bypassing the 138 paymentMethod→caja resolver (cajas are explicit in a movement/expense, not derived)"
  - "Equal-caja guard (origen===destino) + amount>0 guard added in the service on top of the JSON schema (defense-in-depth for direct service callers like tests)"

patterns-established:
  - "Pattern: discover a movement's full row set from ANY leg id by querying transaction_links in BOTH directions (transaction_id=id OR target_id=id), de-dup into a Set, hand to voidPair"

requirements-completed: [MOV-01, MOV-02, MOV-03, MOV-04]

# Metrics
duration: 7min
completed: 2026-06-24
---

# Phase 139 Plan 03: MovementService (movimiento 2-filas + reconciliación + egreso + void-the-pair + rutas) Summary

**Built the only genuinely-new code in phase 139 — the `MovementService` facade composing the 137/138 primitives into inter-caja movements (2-row net-0 asiento with esperado-vs-contado reconciliation + same-currency guard), expenses (1 outflow row), and their orthogonal void (void-the-pair for a movement, single void for an expense) — wired 4 admin-only REST routes with server-side RBAC + branch-less-caja-aware country scope, and proved all four requirements end to end with a 10-test integration suite (10/10 green).**

## Performance

- **Duration:** 7 min
- **Started:** 2026-06-24T19:42:39Z
- **Completed:** 2026-06-24T19:49:54Z
- **Tasks:** 3
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- `MovementService.registerMovement` (MOV-01): in ONE `db.transaction`, inserts 2 `kind='cash_transfer'` rows (outflow at origen + inflow at destino), both born `validado`, `memberId` null, `paymentMethod 'internal'`, each stamped `branchId = caja.branchId` (NULL for central/banco), linked both-ways via `transaction_links` (`target_kind='transaction'`, allocatedAmount 0). System net = 0.
- Same-currency guard (D-03): loads both cajas' currency and rejects cross-currency with `BadRequestError "Moneda inconsistente: ..."` BEFORE any write — no partial state.
- Reconciliation (MOV-02 / D-04): snapshots `expected = getBalance(origen).firmeBalance` before the tx; when `counted !== expected`, inserts ONE `kind='adjustment'` row at origen (direction inflow if counted>expected else outflow, amount=|diff|) linked to the origen leg so the signed getBalance auto-corrects the saldo to the physical count, plus a `'reconciliation'` audit row. When counted==expected (or omitted) no adjustment row, but the audit trail (expected/counted/diff) is always written.
- `registerExpense` (MOV-03 / D-05): 1 `kind='expense'` outflow row, `memberId` null, `links: []`, subtracting from its caja saldo via the Plan 02 signed getBalance.
- Void-the-pair (MOV-04 / D-08): `voidMovement` discovers both legs + the reconciliation adjustment from EITHER leg id (walks `transaction_links` in both directions, de-dups), then `voidPair([...ids])` voids them all atomically; `voidExpense` is a single `voidPair([id])`. Saldos restored.
- 4 admin-only REST routes — `POST /movements`, `POST /expenses`, `POST /movements/:id/void`, `POST /expenses/:id/void` — each gated server-side to `FINANCE_VOID_ROLES` (role NEVER read from body), with non-owner country scope via the caja's branch (branch-less cajas owner-only; 404 cross-country/unknown to avoid existence leak), and Fastify JSON schemas (amount>0, reason non-empty, no currency/member in body).
- 10-test integration suite (10/10 green locally, ~42s): MOV-01 (2-row net-0, branch-less leg branch_id NULL, cross-currency rejected with zero rows), MOV-02 (counted<expected adjustment + audit; counted==expected no adjustment but trail written), MOV-03 (expense subtracts + balances-table-untouched D-07), MOV-04 (void-the-pair voids all 3 + restores saldos; void expense restores saldo), RBAC (coach 403 on both create routes, no rows written).
- `npx tsc --noEmit` green across the whole API after each task.

## Task Commits

1. **Task 1: registerMovement + registerExpense + reconciliation + same-currency guard** - `c04763ce` (feat)
2. **Task 2: void-the-pair + 4 admin-only routes** - `febeb787` (feat)
3. **Task 3: MOV-01..04 integration suite + RBAC 403** - `494deff0` (test)

## Files Created/Modified

- `el-templo-api/src/modules/finance/movement-service.ts` (created) - the MovementService facade: registerMovement (2-row asiento + reconciliation + currency guard), registerExpense, voidMovement (pair walk + voidPair), voidExpense
- `el-templo-api/test/finance/movement-service.test.ts` (created) - 10 integration tests MOV-01..04 + applyDelta no-op + RBAC 403
- `el-templo-api/src/modules/finance/types.ts` - RegisterMovementInput / RegisterExpenseInput / MovementDetail
- `el-templo-api/src/modules/finance/schemas.ts` - registerMovementSchema / registerExpenseSchema / voidMovementSchema (Fastify JSON schemas)
- `el-templo-api/src/modules/finance/routes.ts` - MovementService DI; resolveCajaCountry + enforceCajaScope + enforceRowScope helpers; 4 routes
- `el-templo-api/src/modules/finance/index.ts` - export MovementService + the 3 new types

## Decisions Made

- **Reconciliation = separate adjustment row (not a discrepancy column):** an explicit `kind='adjustment'` row linked to the origen leg lets the signed getBalance (Plan 02) auto-correct origen to the counted money without bespoke saldo math, and the void-the-pair walk picks it up through the same `transaction_links` graph that links the two legs. The audit payload carries expected/counted/diff for the named trail (D-04 "con nombre y apellido").
- **Audit always, adjustment conditionally:** the `'reconciliation'` audit row is written on every movement (recording the expected saldo at the moment), while the adjustment ledger row only materializes on a real diff — so there is a clean rastro even for an exact count, with zero noise rows.
- **Explicit caja + internal method:** movements/expenses pass `paymentMethod:'internal'` + an explicit `cashRegisterId` override, bypassing the 138 paymentMethod→caja resolver (the 138 resolver does NOT apply — cajas are explicit, per the phase constraints).
- **Branch-less country scope:** the route guard resolves a caja's country via a caja→branch LEFT JOIN; a NULL-branch caja (central efectivo / banco ARS/EUR) is country-agnostic and therefore owner-only for non-owners, returning 404 (not 403) to avoid leaking existence — mirroring the 137 void route precedent.

## Deviations from Plan

None - plan executed exactly as written. The plan's `<interfaces>` matched the codebase; no type-widening fallout or blocking issues surfaced.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat_model. All seven STRIDE rows are mitigated as planned: T-139-06 (server-side FINANCE_VOID_ROLES, role not from body), T-139-07 (caja-branch country scope, 404 cross-country/branch-less), T-139-08 (both legs + adjustment in one db.transaction; voidPair atomic — asserted by the void-the-pair test), T-139-09 (same-currency guard before any write — asserted), T-139-10 (reconciliation audit trail — asserted), T-139-11 (links:[] + tx-to-tx links → applyDelta no-op — asserted by the balances-untouched test).

## TDD Gate Compliance

The plan's tasks are `tdd="true"` but ordered implementation-first with a dedicated test-suite task (Task 3) — matching the established 139-01/139-02 ordering. The GREEN implementation (Tasks 1-2, `c04763ce`/`febeb787`, feat) precedes the test commit (Task 3, `494deff0`, test); the 10 behavior tests pass against the implementation and prove every MOV-01..04 truth.

## User Setup Required

None - no external service configuration, no schema/migration changes in this plan (the enum/nullable foundation landed in 139-01; getBalance is a read-side derivation from 139-02). Backend-only — no UI (D-10).

## Next Phase Readiness

- All four MOV requirements (MOV-01..04) are delivered end to end; the finance ledger now supports inter-caja movements + egresos with reconciliation and atomic void, without touching member balances.
- **Flag for phase 141 (caja history):** every current finance list/export (`TransactionService.list`, `exportRowsForExcel`) uses INNER JOIN users → NULL-member egresos/movimientos are DROPPED. Phase 141's caja history MUST LEFT JOIN users to render the new NULL-member movement/expense/adjustment rows. (Carried forward from 139-01; re-confirmed — this plan adds exactly those NULL-member rows.)
- Phase 140 (carga única del profe) and 141 (reportes/UI) can now surface and drive these operations; the REST routes (`/movements`, `/expenses`, and their `/void`) are the integration points.

---

_Phase: 139-movimientos-inter-caja-y-egresos_
_Completed: 2026-06-24_

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/finance/movement-service.ts
- FOUND: el-templo-api/test/finance/movement-service.test.ts
- FOUND: .planning/phases/139-movimientos-inter-caja-y-egresos/139-03-SUMMARY.md
- FOUND commits: c04763ce, febeb787, 494deff0
