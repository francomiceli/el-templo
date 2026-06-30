---
phase: 139-movimientos-inter-caja-y-egresos
verified: 2026-06-24T20:15:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 139: Movimientos inter-caja y egresos Verification Report

**Phase Goal:** El admin mueve plata entre cajas (movimiento = asiento doble entrada 2 filas linkeadas, neto 0, esperado-vs-contado con rastro) y registra egresos (1 fila, nota libre, sin categoría) que restan del saldo; ambos se anulan con soft-void ortogonal (anular un movimiento anula ambas filas) y ninguno toca los balances del socio. Backend-only. Depends on 137+138.
**Verified:** 2026-06-24T20:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria → MOV-01..04)

| #   | Truth (Success Criterion)                                                                                                                                                                                            | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **MOV-01:** Movimiento = asiento de doble entrada, 2 filas `cash_transfer` linkeadas (outflow origen + inflow destino) en una `db.transaction`, neto 0, suma de cajas de igual moneda invariante; solo igual moneda. | ✓ VERIFIED | `movement-service.ts:120-180` — ONE `db.transaction`, 2 `create(...,tx)` calls (outflow origen + inflow destino), both `memberId:null` `paymentMethod:'internal'`, `branchId=caja.branchId`, linked both-ways via `transaction_links` (`targetKind:'transaction'`). Same-currency guard `origen.currency !== destino.currency` throws `BadRequestError` at lines 107-111 BEFORE the tx opens. Net-0 + zero-rows-on-reject proven by `movement-service.test.ts:120-233` and `cash-register-service.test.ts` net-0 invariant.                                                   |
| 2   | **MOV-02:** Captura `expected_amount` (saldo derivado origen) vs `counted_amount` (físico), persiste la diferencia con rastro, sin ajustar en silencio.                                                              | ✓ VERIFIED | `movement-service.ts:116-118` snapshots `expected = getBalance(origen).firmeBalance` before the tx; `188-218` inserts ONE `kind='adjustment'` row at origen (direction by sign of diff, amount=`                                                                                                                                                                                                                                                                                                                                                                              | diff | `) ONLY when `countedAmount !== undefined && !== expected`; `223-237`ALWAYS writes a`'reconciliation'`audit row (expected/counted/diff). Saldo auto-corrects via the signed getBalance. Tested`movement-service.test.ts:238-325` (counted<expected → adj+audit, saldo 700; counted==expected → no adj, audit still written). |
| 3   | **MOV-03:** Egreso (`kind='expense'`, destino NULL) resta del saldo con monto+nota libre, sin categoría; `cash_transfer`/`expense` en `KINDS_ALLOWED_WITHOUT_LINKS` y NO tocan `balances` (test).                    | ✓ VERIFIED | `movement-service.ts:271-305` — 1 `kind='expense'` outflow row, `memberId:null`, `links:[]`, free-text notes, no category. `transaction-service.ts:58-66` adds both kinds to `KINDS_ALLOWED_WITHOUT_LINKS`. `balance-service.ts:92` `if (links.length === 0) return;` = applyDelta no-op. Tested: expense subtracts (`movement-service.test.ts:330-356`), balances untouched (`:358-379` + `summary-by-kind.test.ts:689-731` MOV-B).                                                                                                                                          |
| 4   | **MOV-04:** Movimientos y egresos se anulan con el soft-void ortogonal (motivo+autor+fecha), nunca delete; anular un movimiento anula AMBAS filas.                                                                   | ✓ VERIFIED | `movement-service.ts:321-364` `voidMovement` discovers BOTH legs + adjustment by querying `transaction_links` in BOTH directions (transaction_id=id OR target_id=id) from EITHER leg id, de-dups into a Set, then `voidPair([...ids])`. `transaction-service.ts:360-375` `voidPair` wraps `_void` per id in ONE `db.transaction` (atomic). `_void` soft-voids (`voidedAt/voidedBy/voidReason`) + reverses `applyDelta` + audit row, never deletes. Tested `movement-service.test.ts:384-457` (all 3 rows voided + both saldos restored; voidExpense single + saldo restored). |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact                                        | Expected                                                        | Status     | Details                                                                                                                                                                                          |
| ----------------------------------------------- | --------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `finance/movement-service.ts`                   | MovementService facade (4 ops)                                  | ✓ VERIFIED | 390 lines; registerMovement/registerExpense/voidMovement/voidExpense all substantive + wired into routes.                                                                                        |
| `db/migrations/0155_movement_expense_kinds.sql` | enum +2, member_id NULL, branch_id NULL, hand-written           | ✓ VERIFIED | enum appended last (`...,'cash_transfer','expense'`) byte-for-byte matches schema; member_id+branch_id MODIFY NULL; no `;` in comments.                                                          |
| `db/schema/financial-transactions.ts`           | enum +2 (order match), memberId+branchId nullable               | ✓ VERIFIED | enum lines 32-40 match migration order; `.notNull()` dropped on memberId (27) + branchId (57).                                                                                                   |
| `finance/transaction-service.ts`                | KINDS_ALLOWED_WITHOUT_LINKS +2, voidPair, getSummary MUST-FIX A | ✓ VERIFIED | `cash_transfer`+`expense` at lines 64-65; `voidPair` 360-375; `getSummary` `notInArray(kind,['cash_transfer','expense'])` 1236-1239.                                                             |
| `finance/cash-register-service.ts`              | getBalance signed (opening + Σinflow − Σoutflow)                | ✓ VERIFIED | Outflow SUM 174-186 mirrors inflow, `firmMoneyConditions()` + cutoff gate, no kind filter (D-09). `firmeBalance` 188-191.                                                                        |
| `finance/balance-service.ts`                    | applyDelta no-op for link-less rows                             | ✓ VERIFIED | Line 92 early return on `links.length === 0`.                                                                                                                                                    |
| `finance/routes.ts` + `schemas.ts`              | 4 admin-only routes + JSON schemas                              | ✓ VERIFIED | 4 routes (`/movements`, `/expenses`, `/movements/:id/void`, `/expenses/:id/void`), all gated `FINANCE_VOID_ROLES` server-side; schemas `additionalProperties:false`, no currency/member in body. |
| `test/finance/movement-service.test.ts`         | MOV-01..04 + RBAC 403                                           | ✓ VERIFIED | 512 lines, 10 integration tests covering all four requirements + applyDelta no-op + RBAC.                                                                                                        |
| `test/finance/cash-register-service.test.ts`    | net-0 invariant + expense subtracts + refund-outflow pinned     | ✓ VERIFIED | 4 new tests added (per 139-02-SUMMARY 22/22).                                                                                                                                                    |
| `test/finance/summary-by-kind.test.ts`          | MUST-FIX A + applyDelta no-op regressions                       | ✓ VERIFIED | MOV-A (NULL-branch cash_transfer inflow leaves revenue/byBranch/byKind untouched) `:638-685`; MOV-B (no balances move) `:689-731`.                                                               |

### Key Link Verification

| From               | To                 | Via                                           | Status  | Details                                                               |
| ------------------ | ------------------ | --------------------------------------------- | ------- | --------------------------------------------------------------------- |
| Route `/movements` | MovementService    | `movementService.registerMovement(...)`       | ✓ WIRED | routes.ts:536 inside FINANCE_VOID_ROLES guard + country scope.        |
| registerMovement   | TransactionService | `txnService.create(...,tx)` ×2 + adjustment   | ✓ WIRED | Both legs + adjustment thread the same tx handle.                     |
| 2 legs             | transaction_links  | both-ways `targetKind:'transaction'`          | ✓ WIRED | movement-service.ts:167-180.                                          |
| voidMovement       | voidPair           | walk links both directions → Set → `voidPair` | ✓ WIRED | movement-service.ts:335-358; voidPair atomic in one db.transaction.   |
| getBalance outflow | adjustment/expense | signed SUM (direction='outflow')              | ✓ WIRED | Adjustment row auto-corrects saldo to counted; expense subtracts.     |
| getSummary         | revenue exclusion  | `notInArray(kind, [cash_transfer, expense])`  | ✓ WIRED | transaction-service.ts:1236-1239 in conds[] (covers all 4 summaries). |

### Data-Flow Trace (Level 4)

N/A — backend-only phase (D-10), no rendering artifacts. Saldo/revenue data flow verified via the signed getBalance + getSummary exclusion above and proven by integration tests (net-0 invariant, MOV-A revenue isolation).

### Behavioral Spot-Checks

| Behavior                         | Command                                               | Result                                    | Status |
| -------------------------------- | ----------------------------------------------------- | ----------------------------------------- | ------ |
| API typechecks clean (CLAUDE.md) | `cd el-templo-api && npx tsc --noEmit`                | exit 0, no errors                         | ✓ PASS |
| Migration enum matches schema    | grep enum order in .sql vs schema                     | byte-for-byte identical, +2 appended last | ✓ PASS |
| No frontend files touched (D-10) | `git show --stat` ×8 commits → grep app/admin/vue/tsx | none                                      | ✓ PASS |
| No `;` inside SQL comments       | `grep -nE '^[[:space:]]*--.*;' 0155.sql`              | none (exit 1)                             | ✓ PASS |

Integration suite (`pnpm test`) intentionally NOT run locally — project rule (MEMORY: feedback_tests_run_in_ci_not_local). Test existence + correctness verified by reading; tsc verified locally.

### Probe Execution

No probes declared for this phase (no `scripts/*/tests/probe-*.sh`). N/A.

### Requirements Coverage

| Requirement | Source Plan  | Description                                         | Status      | Evidence                                                     |
| ----------- | ------------ | --------------------------------------------------- | ----------- | ------------------------------------------------------------ |
| MOV-01      | 139-01/02/03 | Movimiento inter-caja origen+destino, neto 0        | ✓ SATISFIED | Truth #1 — 2-row asiento + same-currency guard + net-0 test. |
| MOV-02      | 139-03       | Saldo esperado vs contado, rastro de diferencias    | ✓ SATISFIED | Truth #2 — adjustment row + 'reconciliation' audit.          |
| MOV-03      | 139-01/02/03 | Egreso resta del saldo, monto+nota, sin categoría   | ✓ SATISFIED | Truth #3 — 1 expense row + applyDelta no-op.                 |
| MOV-04      | 139-01/03    | Anular con rastro (void ortogonal), igual que pagos | ✓ SATISFIED | Truth #4 — voidMovement (pair) + voidExpense via voidPair.   |

No orphaned requirements: REQUIREMENTS.md maps exactly MOV-01..04 to Phase 139, all claimed by plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact                                                                                                                                                                                                                         |
| ---- | ---- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| —    | —    | none    | —        | No `any` type annotations, no `console.log`, no TBD/FIXME/XXX/TODO debt markers in any new/modified finance file. The single "any" grep hit (`balance-service.ts:233`) is the English word inside a JSDoc comment, not a type. |

### Human Verification Required

None. Backend-only (D-10) — no UI, no visual/real-time/external-service behavior. All four MOV requirements have automated integration coverage. UI verification belongs to phases 140 (carga) / 141 (reportes).

### Scrutiny Notes (focused per verification_focus)

- **MOV-04 void-the-pair atomicity (hardest):** `voidMovement` discovers the full row set from EITHER leg by querying `transaction_links` in BOTH directions (source AND target) — so it works whether the caller passes the outflow or inflow leg, and it picks up the adjustment (which links adjustment→outflow). De-duped into a Set, then `voidPair([...ids])` runs every `_void` inside ONE `db.transaction` (transaction-service.ts:370-374) — a second/failed void rolls back the whole pair (net-0 never half-breaks, Pitfall 3). Test `:384-430` asserts all 3 rows voided + both saldos restored. ✓
- **Reconciliation math:** counted<expected inserts an `outflow` adjustment of `|diff|` at origen; the signed getBalance then computes `1000 (opening) − 200 (movement out) − 100 (adjustment) = 700`, which equals `counted(900) − 200`. Audit `diff = -100`. Verified by test assertions `:270-289`. The adjustment direction logic (`diff > 0 ? inflow : outflow`, amount `Math.abs(diff)`) is correct for both signs. ✓
- **MUST-FIX A (hardest):** `getSummary` conds[] includes `notInArray(kind, ['cash_transfer','expense'])` (1236-1239), applied to ALL four sub-queries (monthlyRevenue, revenueByMethod, revenueByBranch, revenueByKind) since they share `conds`. Test MOV-A inserts a 999999 NULL-branch `cash_transfer` inflow and asserts monthlyRevenue, revenueByKind.cash_transfer (0), and revenueByBranch are all unchanged. The Fastify response schema + KIND_ENUM were widened to 7 keys (auto-fix #2 in 139-01) so the keys actually serialize over the wire. ✓
- **member_id + branch_id NULLABLE blast-radius:** migration 0155 MODIFY both to NULL (additive, FKs preserved). The `list()`/`exportRowsForExcel()`/`getSummary` reads all `innerJoin(schema.users,...)` / `innerJoin(schema.branches,...)` → NULL-member/NULL-branch rows are DROPPED, so no member/branch-keyed report breaks. analytics `revenueByBranchByCurrency` null-branch `continue` added (139-01 auto-fix #1). The 141-scope caja-history LEFT JOIN is correctly NOT implemented here (list/export still INNER JOIN users) — flagged for 141 in all three SUMMARYs. ✓

### Gaps Summary

No gaps. All 4 ROADMAP success criteria (MOV-01..04) are observably true in the live codebase: the MovementService composes the 137/138 primitives into a 2-row net-0 movement with esperado-vs-contado reconciliation, a single-row expense, and an atomic void-the-pair, with member `balances` provably untouched (applyDelta no-op) and revenue provably uninflated (getSummary kind exclusion). Migration is additive/hand-written and applied. tsc is clean, no anti-patterns, no debt markers, backend-only confirmed. Integration tests exist and are correct (CI runs them on push per project rule).

---

_Verified: 2026-06-24T20:15:00Z_
_Verifier: Claude (gsd-verifier)_
