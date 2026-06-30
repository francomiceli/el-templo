---
phase: 139
slug: movimientos-inter-caja-y-egresos
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-24
---

# Phase 139 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Backend-only (D-10). All verification is integration tests vs real MySQL.

---

## Test Infrastructure

| Property               | Value                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Framework**          | vitest (integration vs real MySQL `eltemplo_test`, per `el-templo-api/test/helpers.ts`)                       |
| **Config file**        | repo vitest config (booted via `createTestApp` in `test/helpers.ts`)                                          |
| **Quick run command**  | `cd el-templo-api && npx tsc --noEmit` (local — NO `pnpm typecheck` script; full suite is CI-only per MEMORY) |
| **Full suite command** | `cd el-templo-api && pnpm test` (runs in CI on push to staging — do NOT run locally)                          |
| **Estimated runtime**  | tsc ~20-40s local; full suite minutes in CI                                                                   |

---

## Sampling Rate

- **After every task commit:** Run `cd el-templo-api && npx tsc --noEmit` (local feedback; type errors caught immediately).
- **After every plan wave:** Push to staging → CI runs `pnpm test` (the integration suite against real MySQL).
- **Before `/gsd:verify-work`:** CI green on staging (full suite).
- **Max feedback latency:** ~40s local (tsc); CI on push for behavioral tests.

> NOTE (MEMORY: feedback_tests_run_in_ci_not_local): the integration suite runs against real MySQL and
> is executed in CI on push to staging, NOT locally. Local sampling is `npx tsc --noEmit`.

---

## Per-Task Verification Map

| Task ID   | Plan | Wave | Requirement      | Threat Ref                      | Secure Behavior                                                                                                                                      | Test Type             | Automated Command                                                                                                                                                                                          | File Exists                               | Status     |
| --------- | ---- | ---- | ---------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------- |
| 139-01-01 | 01   | 1    | MOV-01..04       | T-139-03                        | Migration 0155 additive: enum +cash_transfer/+expense, member_id NULL, branch_id NULL; FKs preserved                                                 | integration/migration | `cd el-templo-api && pnpm db:migrate && grep -qi 'branch_id.*null' src/db/migrations/0155_movement_expense_kinds.sql && ! grep -nE '^[[:space:]]*--.*;' src/db/migrations/0155_movement_expense_kinds.sql` | ✅ (Wave 0 writes 0155)                   | ⬜ pending |
| 139-01-02 | 01   | 1    | MOV-01,03,04     | T-139-06                        | create() tolerates memberId+branchId null; voidPair atomic; new kinds link-less                                                                      | source/integration    | `cd el-templo-api && grep -q 'voidPair' src/modules/finance/transaction-service.ts && grep -q '"cash_transfer"' src/modules/finance/transaction-service.ts && npx tsc --noEmit`                            | ✅ extend `transaction-service.test.ts`   | ⬜ pending |
| 139-01-03 | 01   | 1    | MOV-03 (D-07)    | T-139-01 / T-139-02 / T-139-02b | getSummary excludes new kinds (revenue + revenueByBranch unaffected by NULL-branch movement); applyDelta no-op on link-less rows                     | integration           | `cd el-templo-api && pnpm test test/finance/summary-by-kind.test.ts`                                                                                                                                       | ✅ extend `summary-by-kind.test.ts`       | ⬜ pending |
| 139-02-01 | 02   | 2    | MOV-01,03 (D-09) | T-139-04                        | getBalance = opening + Σinflow − Σoutflow via firmMoneyConditions() + cutoff                                                                         | source/integration    | `cd el-templo-api && grep -q '"outflow"' src/modules/finance/cash-register-service.ts && npx tsc --noEmit`                                                                                                 | ✅ extend `cash-register-service.test.ts` | ⬜ pending |
| 139-02-02 | 02   | 2    | MOV-01,03 (D-09) | T-139-04 / T-139-05             | net-0 invariant (Σ same-currency cajas unchanged); expense subtracts; refund-outflow pinned; 138 tests green                                         | integration           | `cd el-templo-api && pnpm test test/finance/cash-register-service.test.ts`                                                                                                                                 | ✅ extend `cash-register-service.test.ts` | ⬜ pending |
| 139-03-01 | 03   | 2    | MOV-01,02,03     | T-139-08 / T-139-09 / T-139-10  | registerMovement 2-row net-0 + same-currency guard + reconciliation trail; registerExpense 1-row; branch-less caja → branch_id NULL                  | integration           | `cd el-templo-api && pnpm test test/finance/movement-service.test.ts`                                                                                                                                      | ❌ Wave 0 → `movement-service.test.ts`    | ⬜ pending |
| 139-03-02 | 03   | 2    | MOV-04           | T-139-06 / T-139-07 / T-139-11  | void-the-pair atomic (both legs + adjustment); routes admin-only (FINANCE_VOID_ROLES) + country scope + schema validation                            | integration           | `cd el-templo-api && pnpm test test/finance/movement-service.test.ts`                                                                                                                                      | ❌ Wave 0 → `movement-service.test.ts`    | ⬜ pending |
| 139-03-03 | 03   | 2    | MOV-01..04       | T-139-06..11                    | Full MOV-01..04 suite: net-0, same-currency rejection, reconciliation saldo+trail, expense subtract + applyDelta no-op, void restore saldo, RBAC 403 | integration           | `cd el-templo-api && pnpm test test/finance/movement-service.test.ts`                                                                                                                                      | ❌ Wave 0 → `movement-service.test.ts`    | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

### Requirement → Test Case Index

| Req ID              | Behavior                                                                                                          | Test File                                                                 | Case                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------- |
| MOV-01              | movement = 2 linked cash_transfer rows, net 0, atomic                                                             | `test/finance/movement-service.test.ts`                                   | "movement creates 2 linked rows, net 0"                  |
| MOV-01              | same-currency guard rejects cross-currency (no rows written)                                                      | `test/finance/movement-service.test.ts`                                   | "ARS→EUR movement rejected"                              |
| MOV-01              | net-0 invariant: Σ same-currency cajas firmeBalance unchanged                                                     | `test/finance/cash-register-service.test.ts`                              | "net-0 invariant after movement"                         |
| MOV-01              | branch-less caja (Jujuy→central / efectivo→banco) → branch_id NULL                                                | `test/finance/movement-service.test.ts`                                   | "movement to branch-less caja stores NULL branch"        |
| MOV-02              | reconciliation: saldo reflects counted, adjustment row + 'reconciliation' audit on diff                           | `test/finance/movement-service.test.ts`                                   | "reconciliation adjusts origen to counted + audit trail" |
| MOV-02              | counted == expected → no adjustment row (expected/counted still in audit payload)                                 | `test/finance/movement-service.test.ts`                                   | "no-diff reconciliation emits no adjustment"             |
| MOV-03              | expense = 1 row, subtracts from caja saldo                                                                        | `test/finance/cash-register-service.test.ts` + `movement-service.test.ts` | "expense subtracts from caja firmeBalance"               |
| MOV-03 (D-07)       | applyDelta no-op: cash_transfer/expense leave `balances` untouched                                                | `test/finance/summary-by-kind.test.ts` + `movement-service.test.ts`       | "balances row count unchanged after movement/expense"    |
| MOV-03 / MUST-FIX A | cash_transfer inflow does NOT inflate getSummary monthlyRevenue/revenueByKind/revenueByBranch (incl. NULL-branch) | `test/finance/summary-by-kind.test.ts`                                    | "movement does not change revenue or branch breakdown"   |
| MOV-04              | void movement voids BOTH legs (+ adjustment) atomically; saldo restored                                           | `test/finance/movement-service.test.ts`                                   | "voidMovement voids pair + restores saldos"              |
| MOV-04              | void expense = single row; saldo restored                                                                         | `test/finance/movement-service.test.ts`                                   | "voidExpense voids single row"                           |
| Security            | coach/recepcion gets 403 on POST /movements,/expenses                                                             | `test/finance/movement-service.test.ts`                                   | "RBAC: non-privileged role 403"                          |
| Regression (D-09)   | refund-outflow with cash_register_id reduces caja saldo (behavior pinned)                                         | `test/finance/cash-register-service.test.ts`                              | "refund outflow reduces caja"                            |
| Regression          | 138 inflow-only balance tests stay green after outflow extension                                                  | `test/finance/cash-register-service.test.ts`                              | (existing 138 cases)                                     |

---

## Wave 0 Requirements

- [ ] `el-templo-api/test/finance/movement-service.test.ts` — NEW file; stubs for MOV-01..04 + applyDelta no-op + RBAC 403 (created in Plan 03 Task 3, drives Tasks 1-2 behavior).
- [ ] `el-templo-api/test/finance/cash-register-service.test.ts` — EXTEND (exists): getBalance outflow + net-0 invariant + expense-subtracts + refund-outflow (Plan 02 Task 2).
- [ ] `el-templo-api/test/finance/summary-by-kind.test.ts` — EXTEND (exists): cash_transfer-inflow revenue/branch exclusion + applyDelta no-op regression (Plan 01 Task 3).
- [ ] `el-templo-api/src/db/migrations/0155_movement_expense_kinds.sql` — NEW hand-written migration (Plan 01 Task 1).

_Framework already present (vitest + real MySQL). No install needed._

---

## Manual-Only Verifications

_All phase behaviors have automated integration verification. Backend-only (D-10) — no UI, no human-verify checkpoints. UI verification belongs to phases 140 (carga) / 141 (reportes)._

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task has tsc or pnpm test)
- [x] Wave 0 covers all MISSING references (`movement-service.test.ts` is the only ❌; created in Plan 03)
- [x] No watch-mode flags (all commands are one-shot: `npx tsc --noEmit`, `pnpm test <file>`)
- [x] Feedback latency < 40s local (tsc); behavioral tests in CI on push
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
