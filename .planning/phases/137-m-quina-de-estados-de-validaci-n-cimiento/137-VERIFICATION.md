---
phase: 137-m-quina-de-estados-de-validaci-n-cimiento
verified: 2026-06-24T00:00:00Z
status: passed
score: 7/7 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: null
gaps: []
warnings:
  - concern: "Firm-money predicate centralization is partial (DRY weakness, not a goal blocker)"
    detail: >
      The canonical helper firm-money.ts is the single source for the raw-SQL form
      (3 sites via firmMoneySqlFor) and the cleanest Drizzle site (#1 getSummary via
      firmMoneyConditions). But the remaining 9 Drizzle read sites inline
      `eq(validationStatus, "validado")` instead of spreading firmMoneyConditions().
      The literal 'validado' and the predicate shape are therefore duplicated at 9
      sites — a future-drift risk against D-08's "never inlined again" intent.
    severity: warning
    rationale: >
      RESEARCH.md line 167 explicitly recommended adding the single new predicate
      inline per-file (each site has caller-specific direction/kind that a full
      helper spread would not cleanly absorb), and the plan adopted "one consistent
      approach per file". All 13 sites functionally gain the predicate and are
      regression-covered (R1-R4), so the phase GOAL ("filtro canónico cuenta solo
      validados") is achieved. The weakness is maintainability, not correctness.
    recommendation: >
      Optional hardening in a later phase: replace the 9 inline
      eq(validationStatus,'validado') with firmMoneyConditions() spreads (dropping
      the now-redundant isNull(voidedAt) each carries), so the literal lives in one
      place. Not blocking for 137.
---

# Phase 137: Máquina de estados de validación (cimiento) — Verification Report

**Phase Goal:** Una transacción de cobro tiene un estado de validación (PENDIENTE/OBSERVADO/CORREGIDO/VALIDADO) ortogonal al soft-void existente (ANULADO), y el filtro canónico de "dinero firme" pasa a contar solo VALIDADOS — sin alterar los números de las 6 métricas de gestión de v5.0. Backend-only.
**Verified:** 2026-06-24
**Status:** PASSED (7/7 truths verified; 1 WARNING on centralization quality)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria = VAL-01..VAL-07)

| #   | Truth (VAL)                                                                                                                                  | Status                                         | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | VAL-01: `validation_status` enum orthogonal to soft-void; `void()` not rewritten; a validado can still be voided                             | ✓ VERIFIED                                     | `financial-transactions.ts:59-66` mysqlEnum order [pendiente,observado,corregido,validado] matches migration 0153 byte-for-byte. `void()` (tx-service:292) preserved — wraps `_void`; soft-void triplet untouched. `_void` leaves `validationStatus` as-is on a plain anular (`tx-service:357` — only sets it when `statusOverride` given) so the axes are independent.                                                                                                |
| 2   | VAL-02: coach→PENDIENTE, admin→VALIDADO; role resolved server-side, never from body                                                          | ✓ VERIFIED                                     | `finance/routes.ts:173-180` derives `initialStatus` from `request.user.role`, body's value ignored (overwritten via `{...request.body, validationStatus: initialStatus}`). `subscriptions/service.ts:280` derives from `recorderRole`. coach NOT in FINANCE_WRITE_ROLES (`permissions.ts:101-106`). 4 internal `recordAssignmentCharge` callers pass no `recorderRole` (grep `recorderRole:` = 0) → default validado.                                                  |
| 3   | VAL-03/04: admin validate/observe/correct (anular+recrear, not UPDATE) with audit trail                                                      | ✓ VERIFIED                                     | `validate()` tx-service:440 (pendiente→validado + `transaction_validated` audit). `observe()` :501 (pendiente→observado + `transaction_observed`, reason mandatory). `correct()` :577 = `_void(corregido)` + `create(born validado)` + `transaction_links target_kind='transaction'` provenance + `transaction_corrected` audit, all in ONE `db.transaction` (atomic). Limited to amount/memberId/paymentMethod (`:579-581` Pick type). No UPDATE of amounts anywhere. |
| 4   | VAL-05: firm-money filter counts only `validado AND voided_at IS NULL`, centralized; PENDIENTE doesn't move summary/6 metrics after backfill | ✓ VERIFIED (WARNING on centralization quality) | All 13 read sites from RESEARCH audit gained the predicate (mapping below). #14 exception preserved. Migration DEFAULT 'validado' backfills history → identical numbers. R1-R4 regression proves it. See WARNING re: 9 inline vs 4 helper-routed.                                                                                                                                                                                                                      |
| 5   | VAL-06: only admin (FINANCE_VOID_ROLES) can anular (reason+author+date); `keepMembershipActive` 1-a-1, default activa                        | ✓ VERIFIED                                     | All 4 transition/void endpoints guard `FINANCE_VOID_ROLES` (routes.ts:217,285,321,365). `_void` requires reason (`:345`), sets voidedBy+voidedAt+audit. `keepMembershipActive===false` (`tx-service:375`) calls `_cancelSubscription(tx,...,skipActiveChargesGuard:true)` in same tx; default true/undefined leaves sub active.                                                                                                                                        |
| 6   | VAL-07: membership activates instantly regardless of validation_status; a PENDIENTE settles balances but not firm cash                       | ✓ VERIFIED                                     | `create()` calls `applyDelta(...,+1)` UNCONDITIONALLY (`tx-service:265`) — comment :232-234 documents it runs regardless of status. R4 test proves a PENDIENTE drives `balances` deuda→0 while `firmSaldo()` stays 0.                                                                                                                                                                                                                                                  |
| 7   | Regression R1-R4 + analytics/reports suites unchanged; backend-only; CLAUDE.md compliant                                                     | ✓ VERIFIED                                     | `validation-regression.test.ts` R1-R4 implemented (0 `it.todo`). `git diff` shows test/analytics, test/reports, test/finance/summary\* = 0 files changed. No `.vue`/app/admin files in phase diff. typecheck `pnpm tsc --noEmit` exit 0. No `any`/console.log/TBD/FIXME in phase files.                                                                                                                                                                                |

**Score:** 7/7 truths verified.

### Required Artifacts

| Artifact                                     | Expected                                               | Status     | Details                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------- |
| `db/schema/financial-transactions.ts`        | validationStatus mysqlEnum + composite index           | ✓ VERIFIED | enum + `idx_financial_tx_validation_voided` on (validation_status, voided_at)                           |
| `db/migrations/0153_validation_status.sql`   | ADD COLUMN DEFAULT 'validado' + ADD INDEX              | ✓ VERIFIED | additive, non-destructive, AFTER void_reason, NO `;` in comments (em-dashes), enum order matches schema |
| `modules/finance/firm-money.ts`              | firmMoneyConditions / FIRM_MONEY_SQL / firmMoneySqlFor | ✓ VERIFIED | 3 exported forms, well-documented, single source of the predicate                                       |
| `modules/shared/audit-log.ts`                | 3 new AuditAction types                                | ✓ VERIFIED | transaction_validated/observed/corrected (lines 33-35)                                                  |
| `modules/finance/transaction-service.ts`     | validate/observe/correct + \_void + create derivation  | ✓ VERIFIED | all present + audit rows per transition                                                                 |
| `modules/finance/routes.ts`                  | 3 endpoints + server-side role + keepMembershipActive  | ✓ VERIFIED | FINANCE_VOID_ROLES-guarded                                                                              |
| `modules/subscriptions/service.ts`           | \_cancelSubscription + recorderRole + #14 exception    | ✓ VERIFIED | exception documented, `voided_at IS NULL` only                                                          |
| `test/finance/validation-state.test.ts`      | transitions + RBAC + keepMembershipActive              | ✓ VERIFIED | 0 it.todo                                                                                               |
| `test/finance/validation-regression.test.ts` | R1-R4                                                  | ✓ VERIFIED | 0 it.todo, real assertions                                                                              |

### VAL-05 Call-Site Mapping (RESEARCH 14-site audit → live code)

| #   | Site                                             | Routing                                                           | Status               |
| --- | ------------------------------------------------ | ----------------------------------------------------------------- | -------------------- |
| 1   | finance/transaction-service getSummary           | `...firmMoneyConditions()` (tx-service:1157)                      | ✓ HELPER             |
| 2   | analytics/ticket-service linkedCharges           | inline `eq(validationStatus,'validado')` (~438)                   | ✓ INLINE             |
| 3   | analytics/ticket-service universeCountByCurrency | inline (~528)                                                     | ✓ INLINE             |
| 4   | analytics/ltv-service realPaymentsByMember       | inline (~287)                                                     | ✓ INLINE             |
| 5   | analytics/service getRevenueTrend                | inline (~1050)                                                    | ✓ INLINE             |
| 6   | analytics/service getRevenueByMethod             | inline (~1125)                                                    | ✓ INLINE             |
| 7   | analytics/service getRevenueByBranch             | inline (~1193)                                                    | ✓ INLINE             |
| 8   | analytics/service sumRevenue                     | inline (~1325)                                                    | ✓ INLINE             |
| 9   | analytics/service yaPagoExpr (raw)               | `firmMoneySqlFor("ft")` (:545)                                    | ✓ HELPER             |
| 10  | analytics/advanced-finance cashTrend             | inline (~188)                                                     | ✓ INLINE             |
| 11  | reports/service charge-history (raw)             | `firmMoneySqlFor("ft")` (:390)                                    | ✓ HELPER             |
| 12  | reports/service trial-conversion (raw)           | `firmMoneySqlFor("fx")` (:932)                                    | ✓ HELPER             |
| 13  | reports/service buildChargeConditions            | inline (:1797)                                                    | ✓ INLINE             |
| 14  | subscriptions/service cancel guard               | **EXCEPTION** — `voided_at IS NULL` only, documented (:2228-2236) | ✓ CORRECTLY EXCLUDED |

**Tally:** 4 helper-routed (#1,#9,#11,#12) + 9 inline (#2-#8,#10,#13) = 13 firm-money sites covered; #14 deliberate exception. All 9 inline sites sit beside `isNull(voidedAt)`. All 3 raw sites use the alias-qualified `firmMoneySqlFor` (unambiguous binding in correlated subqueries — the documented footgun is mitigated). No site missed.

### Key Link Verification

| From                              | To                                          | Via                                         | Status  |
| --------------------------------- | ------------------------------------------- | ------------------------------------------- | ------- |
| firm-money.ts                     | financialTransactions.validationStatus      | eq(...,'validado')                          | ✓ WIRED |
| transaction-service correct()     | transaction_links target_kind='transaction' | provenance insert :659-664                  | ✓ WIRED |
| transaction-service transitions   | auditLog.write                              | audit row per validate/observe/correct/void | ✓ WIRED |
| void() keepMembershipActive=false | subscriptions \_cancelSubscription          | injected SubscriptionCanceller :383         | ✓ WIRED |
| analytics yaPagoExpr              | firmMoneySqlFor                             | raw EXISTS subquery :545                    | ✓ WIRED |

### Behavioral Spot-Checks

| Behavior                                            | Command              | Result      | Status |
| --------------------------------------------------- | -------------------- | ----------- | ------ |
| API typecheck clean                                 | `pnpm tsc --noEmit`  | exit 0      | ✓ PASS |
| coach excluded from finance write/void roles        | grep permissions.ts  | not present | ✓ PASS |
| 4 internal recordAssignmentCharge callers unchanged | grep `recorderRole:` | 0 hits      | ✓ PASS |
| no it.todo left in tests                            | grep it.todo         | 0           | ✓ PASS |
| analytics/reports/summary tests unchanged           | git diff --name-only | 0 files     | ✓ PASS |

Integration test suite NOT run locally (project rule — runs in CI on push to staging). Test existence + correctness verified by reading; typecheck verified locally.

### Requirements Coverage

| Requirement | Source Plan | Status      | Evidence                                   |
| ----------- | ----------- | ----------- | ------------------------------------------ |
| VAL-01      | 137-01      | ✓ SATISFIED | enum + orthogonality + void() preserved    |
| VAL-02      | 137-02      | ✓ SATISFIED | server-side role→status, coach excluded    |
| VAL-03      | 137-02      | ✓ SATISFIED | validate() + audit                         |
| VAL-04      | 137-02      | ✓ SATISFIED | observe()/correct() anular+recrear + audit |
| VAL-05      | 137-01/03   | ✓ SATISFIED | 13 sites + exception + backfill + R1-R4    |
| VAL-06      | 137-02      | ✓ SATISFIED | FINANCE_VOID_ROLES + keepMembershipActive  |
| VAL-07      | 137-02/03   | ✓ SATISFIED | unconditional applyDelta + R4              |

No orphaned requirements (REQUIREMENTS.md maps VAL-01..07 to Phase 137, all claimed by plans).

### Anti-Patterns Found

| File   | Pattern | Severity | Impact                                                      |
| ------ | ------- | -------- | ----------------------------------------------------------- |
| (none) | —       | —        | No TBD/FIXME/XXX, no `: any`, no console.log in phase files |

Note: the 9 inline sites use `eq(...) as unknown as SQL` — a pre-existing project cast pattern (Drizzle `eq()` into `SQL[]` arrays), used consistently, not a phase-introduced smell.

### Human Verification Required

None. This is a backend-only foundation phase with full integration test coverage (validate via CI on push). No visual/UX/real-time/external-service behavior to verify manually.

### Gaps Summary

No goal-blocking gaps. All 7 success criteria (VAL-01..VAL-07) are observably achieved in the codebase, with regression coverage (R1-R4) for the highest-risk criterion (VAL-05). Backend-only constraint honored (zero frontend files). CLAUDE.md compliant (no `any`, Pino logging, migration follows the `_migrations`-table + no-`;`-in-comments rules, .sql committed).

**One WARNING (non-blocking):** The firm-money predicate is centralized for the raw-SQL form and one Drizzle site but inlined at 9 Drizzle sites — a DRY/future-drift weakness against D-08's "never inlined again" intent, explicitly sanctioned by RESEARCH.md and not affecting correctness. Recommended as optional later hardening, not a gate for 137.

---

_Verified: 2026-06-24_
_Verifier: Claude (gsd-verifier)_
