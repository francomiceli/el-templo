---
phase: 139-movimientos-inter-caja-y-egresos
plan: 02
subsystem: finance
tags: [drizzle, mysql, finance, ledger, cash-register, balance, vitest]

# Dependency graph
requires:
  - phase: 138-entidad-caja-saldos
    provides: getBalance (// TODO 139), firmMoneyConditions(), cutoff gate, opening_balance
  - phase: 139-01
    provides: cash_transfer + expense kinds, member_id/branch_id nullable, getBalance inflow body
provides:
  - getBalance signed (firmeBalance = opening + Σinflow − Σoutflow) since cutoff, reusing firmMoneyConditions()
  - net-0 invariant proven by test (a cash_transfer pair leaves same-currency total unchanged)
  - refund-outflow behavior pinned (D-09 resolved — a cash refund reduces its caja)
affects: [139-03, MovementService, phase-140-carga, phase-141-caja-history]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Signed derived balance: symmetric inflow/outflow SUMs, each gated by firmMoneyConditions() + cutoff, no kind filter on the outflow term (direction is the whole predicate)"
    - "NULL-member ledger cleanup: delete financial_transactions by cash_register_id before dropping cajas (member-keyed cleanup misses egresos/movimientos/refunds)"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/finance/cash-register-service.ts
    - el-templo-api/test/finance/cash-register-service.test.ts

key-decisions:
  - "Outflow SUM has NO kind filter (D-09): expense, cash_transfer-out, AND refund outflows all subtract — direction='outflow' + firm + cutoff is the whole predicate"
  - "Refund-outflow behavior PINNED by an explicit test so a future regression that filters refund out is loud (T-139-05 accept disposition)"
  - "Outflow tests insert NULL-member rows via app.db.insert (not create()): deterministic + sidesteps create()'s link guard, which rejects kind='refund' with links:[]"

patterns-established:
  - "Pattern: signed getBalance = opening + Σ(direction='inflow' firm) − Σ(direction='outflow' firm), both gated by gte(transactionDate, cutoffDate)"

requirements-completed: [MOV-01, MOV-03]

# Metrics
duration: 4min
completed: 2026-06-24
---

# Phase 139 Plan 02: getBalance outflow extension Summary

**Completed the `// TODO 139` phase 138 left in `getBalance` — a symmetric validado-outflow SUM (no kind filter) so expenses, the cash_transfer outflow leg, and refund outflows all subtract from a caja's firm saldo — and pinned the double-entry net-0 invariant + the resolved refund-outflow behavior with 4 new integration tests (22/22 green).**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-24T19:35:38Z
- **Completed:** 2026-06-24T19:39:27Z
- **Tasks:** 2
- **Files modified:** 2 (0 created, 2 modified)

## Accomplishments

- `getBalance` is now signed (D-09): added a second SUM mirroring the firm inflow SUM but with `direction='outflow'`, the same `firmMoneyConditions()` spread, the same `gte(transactionDate, cutoffDate)` gate, and the same `cash_register_id` scope. `firmeBalance = opening + Number(inflowTotal) − Number(outflowTotal)`.
- NO kind filter on the outflow SUM (D-09): `expense`, the `cash_transfer` outflow leg, AND `refund` outflows all subtract. The cutoff gate excludes historical noise.
- `pendienteAmount` SUM left exactly as-is (separate axis, never nets against firme). Signature unchanged (D-08) — callers untouched.
- `firmMoneyConditions()` reused, never inlined (D-08/T-138-09).
- 4 new integration tests: net-0 invariant (a cash_transfer pair leaves the sum of origen+destino firmeBalance unchanged, and actually moves the money), expense-subtracts-only-its-caja, refund-outflow-pinned, and a signed inflow+outflow regression confirming the 138 inflow math is intact.
- Full `cash-register-service.test.ts` = 22/22 green locally (the pre-existing 18 + 4 new). `npx tsc --noEmit` green.

## Task Commits

1. **Task 1: getBalance outflow extension (the // TODO 139)** - `3415cf46` (feat)
2. **Task 2: net-0 invariant + expense-subtracts + refund-outflow tests** - `209d5049` (test)

## Files Created/Modified

- `el-templo-api/src/modules/finance/cash-register-service.ts` - getBalance gains the outflow SUM; firmeBalance arithmetic now opening + inflow − outflow; doc updated from `// TODO 139` to the signed-body note
- `el-templo-api/test/finance/cash-register-service.test.ts` - new describe block (net-0 invariant, expense subtracts, refund pinned, signed regression) + afterAll cleanup fix for NULL-member rows

## Decisions Made

- **No kind filter on the outflow SUM (D-09):** the outflow term subtracts every validado outflow row of the caja since cutoff. This is direction-generic — an `adjustment` reconciliation row is summed with the correct sign by its own `direction`, and a `refund` outflow correctly reduces the caja (a cash refund genuinely leaves the till).
- **Refund-outflow behavior pinned by test:** T-139-05's disposition is `accept` (refund SHOULD subtract), so an explicit test asserts a `kind='refund'` outflow reduces the saldo — a future change that filters refund out is caught loudly.
- **Direct `app.db.insert` for the outflow tests:** mirrors the 138 getBalance suite's helper. Deterministic, and avoids `create()`'s link guard (`refund` is not in `KINDS_ALLOWED_WITHOUT_LINKS`, so `create({ kind:'refund', links:[] })` would throw).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] afterAll cleanup left NULL-member ledger rows, tripping the cajas FK delete**

- **Found during:** Task 2 (first test run — all 22 tests passed, but the suite teardown threw `ER_ROW_IS_REFERENCED_2`)
- **Issue:** The file's `afterAll` deletes `financial_transactions` only by `memberId`. The new outflow rows are `memberId: null` (egresos/movimientos/refunds), so they survived, and the subsequent `delete cash_registers` failed the `financial_transactions_cash_register_id_cash_registers_id_fk` constraint.
- **Fix:** Before dropping the seeded cajas, delete every `financial_transactions` row referencing them by `cash_register_id` (covers NULL-member rows the member-keyed delete misses).
- **Files modified:** test/finance/cash-register-service.test.ts (afterAll)
- **Verification:** Re-run → 22/22 pass, suite teardown clean; tsc green.
- **Committed in:** 209d5049 (Task 2)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Test-only teardown fix introduced by the plan's own NULL-member outflow rows. No production-code deviation; getBalance was implemented exactly as the plan specified.

## Issues Encountered

- The plan's `<action>` suggested inserting rows via `TransactionService.create()` with a `cashRegisterId` override. For `kind='refund'` that path throws (`refund` is not in `KINDS_ALLOWED_WITHOUT_LINKS`, so `links: []` fails the link guard). Used direct `app.db.insert` instead — consistent with the file's established 138 balance-test pattern and the plan's allowance to "use the existing createTestApp + branch/caja setup pattern already in the file."

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat_model. T-139-04 (net-0) is now mitigated by the invariant test; T-139-05 (refund subtract) is the accepted-and-pinned behavior.

## TDD Gate Compliance

The implementation (GREEN) was the plan's Task 1 (`3415cf46`, feat), committed before the test (`209d5049`, test), per the plan's task ordering. The 4 new behavior tests pass against the signed getBalance; the pre-existing 18 (incl. the 138 inflow-only cases) stay green — proving the inflow math is unchanged.

## User Setup Required

None - no external service configuration. No schema/migration changes in this plan (getBalance is a read-side derivation; the enum/nullable schema landed in 139-01).

## Next Phase Readiness

- getBalance now reflects outflows, so 139-03 (MovementService 2-row asiento + reconciliation) and the egreso path will see their saldo effects immediately.
- The net-0 invariant test is the contract MovementService must keep: any movement it writes must leave the sum of same-currency cajas unchanged.

---

_Phase: 139-movimientos-inter-caja-y-egresos_
_Completed: 2026-06-24_

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/finance/cash-register-service.ts
- FOUND: el-templo-api/test/finance/cash-register-service.test.ts
- FOUND: .planning/phases/139-movimientos-inter-caja-y-egresos/139-02-SUMMARY.md
- FOUND commits: 3415cf46, 209d5049
