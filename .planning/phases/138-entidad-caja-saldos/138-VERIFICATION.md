---
phase: 138-entidad-caja-saldos
verified: 2026-06-24T00:00:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: null
  previous_score: null
---

# Phase 138: Entidad caja + saldos Verification Report

**Phase Goal:** La caja es entidad de primera clase (`cash_registers`: efectivo×sucursal + efectivo central + banco por moneda ARS/EUR), cada pago se asocia a una caja (`cash_register_id`) distinta de su `branchId`, `getBalance` devuelve saldo firme derivado (opening + Σ validados desde el corte) + pendientes aparte, monedas nunca mezcladas. Backend-only. Depends on 137.

**Verified:** 2026-06-24
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth (Success Criterion)                                                                                                                                             | Status     | Evidence                                                                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | CAJA-01 — `cash_registers` con type efectivo/banco, `branch_id` nullable, `currency` NOT NULL fija; seed efectivo×sucursal + efectivo central + banco ARS + banco EUR | ✓ VERIFIED | `cash-registers.ts:29-54` (enum, nullable branchId, NOT NULL currency varchar(3), opening_balance default 0, cutoff_date, is_active); migration `0154` seed lines 53-74 (SELECT-driven efectivo per non-virtual active branch + Efectivo Central + Banco ARS + Banco EUR)                                                       |
| 2   | CAJA-02 — `financial_transactions.cash_register_id` desacoplado de `branchId`; pago se asocia a una caja server-derived                                               | ✓ VERIFIED | `financial-transactions.ts:54` nullable FK; `branchId` stays NOT NULL; `transaction-service.ts:215-245` single insert site stamps server-derived `cashRegisterId`; `createTransactionSchema` (`schemas.ts:49-89`) has `additionalProperties:false` and does NOT list `cashRegisterId` → body-supplied value stripped by Fastify |
| 3   | CAJA-03 — `getBalance` saldo firme derivado (Σ validados) + pendientes aparte, sin sumar al firme                                                                     | ✓ VERIFIED | `cash-register-service.ts:126-182`: firmeBalance = openingBalance + Σ(inflow, firmMoneyConditions(), gte cutoff); pendienteAmount is a SEPARATE SUM, never added; derived (not materialized)                                                                                                                                    |
| 4   | CAJA-04 — rechaza moneda distinta a la de la caja (espejo de applyDelta)                                                                                              | ✓ VERIFIED | `cash-register-service.ts:95-100` guard throws `BadRequestError("Moneda inconsistente...")` in the cash→efectivo branch; test `cash-register-service.test.ts:642-648` exercises it via a directly-inserted EUR efectivo caja (non-vacuous)                                                                                      |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact                                                      | Expected                                                     | Status     | Details                                                                                                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/db/schema/cash-registers.ts`               | cash_registers schema                                        | ✓ VERIFIED | Substantive (62 lines), wired via `schema/index.ts:2`, relations defined                                                                                   |
| `el-templo-api/src/db/migrations/0154_cash_registers.sql`     | hand-written additive migration                              | ✓ VERIFIED | CREATE→ALTER→seed→backfill ordering; no DROP/DELETE/TRUNCATE; no `;` in SQL comments (grep clean); enum `enum('efectivo','banco')` byte-for-byte vs schema |
| `el-templo-api/src/db/schema/financial-transactions.ts` (mod) | cash_register_id nullable FK + index                         | ✓ VERIFIED | Line 54 FK, lines 93-94 `idx_financial_tx_cash_register (cash_register_id, transaction_date)`, branchId stays NOT NULL                                     |
| `el-templo-api/src/modules/finance/cash-register-service.ts`  | resolveCashRegister + guard + getBalance                     | ✓ VERIFIED | All three present, no `any`, reuses `firmMoneyConditions()` (3 refs), `// TODO 139` forward marker                                                         |
| `el-templo-api/src/modules/finance/types.ts` (mod)            | CreateTransactionInput.cashRegisterId? + CashRegisterBalance | ✓ VERIFIED | Lines 89, 284 — documented SERVER-DERIVED                                                                                                                  |
| `el-templo-api/test/finance/cash-register-service.test.ts`    | full CAJA-01..04 suite                                       | ✓ VERIFIED | 18 real tests: seed shape, resolver, create-stamping, backfill derivation, getBalance arithmetic, cutoff/voided exclusion, EUR currency guard              |

### Key Link Verification

| From                                | To                                  | Via                     | Status              | Details                                                                                                                                                                                                                                 |
| ----------------------------------- | ----------------------------------- | ----------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TransactionService.create()`       | `resolveCashRegister`               | single insert-site call | ✓ WIRED             | `transaction-service.ts:223-230` resolves server-side, stamps at line 245 — covers all 9 create paths with one edit                                                                                                                     |
| 6 TransactionService instantiations | `CashRegisterService`               | DI 4th constructor arg  | ✓ WIRED             | All 6 `new TransactionService` sites (auth, programs, subscriptions, finance, members, auto-resume-pauses jobs) pass `cashRegisterService`; matched 1:1 by 6 `new CashRegisterService` sites; constructor arity enforced by tsc (clean) |
| `getBalance`                        | `firmMoneyConditions()` (phase 137) | spread into WHERE       | ✓ WIRED             | `cash-register-service.ts:152` — canonical filter reused verbatim, never inlined                                                                                                                                                        |
| request body                        | `cashRegisterId`                    | (must NOT flow)         | ✓ BLOCKED-BY-DESIGN | `createTransactionSchema` `additionalProperties:false`, field not listed → stripped before handler (T-138-04 mitigated)                                                                                                                 |

### Data-Flow Trace (Level 4)

| Artifact     | Data Variable     | Source                                                                                                | Produces Real Data                                           | Status    |
| ------------ | ----------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------- |
| `getBalance` | `firmeBalance`    | two DB SUMs over `financial_transactions` scoped to `cash_register_id` + cutoff + firmMoneyConditions | ✓ Yes — real aggregate query, opening_balance constant added | ✓ FLOWING |
| `getBalance` | `pendienteAmount` | separate DB SUM (`validation_status='pendiente'`, not voided, since cutoff)                           | ✓ Yes — separate query, never folded into firme              | ✓ FLOWING |
| `create()`   | `cashRegisterId`  | `resolveCashRegister()` DB lookup off `cash_registers`                                                | ✓ Yes — real SELECT, server-derived                          | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior                                                                            | Command                        | Result            | Status                     |
| ----------------------------------------------------------------------------------- | ------------------------------ | ----------------- | -------------------------- |
| Project typecheck gate (no `pnpm typecheck` script; `npx tsc --noEmit` is the gate) | `npx tsc --noEmit`             | exit 0, no errors | ✓ PASS                     |
| No `any` / `console.*` in 138 source                                                | grep over new+modified src     | no matches        | ✓ PASS                     |
| No frontend files in any 138 commit                                                 | git show --stat over 8 commits | none              | ✓ PASS                     |
| No REST endpoint added for getBalance/cajas                                         | grep finance/routes.ts         | none              | ✓ PASS (backend-only D-10) |

> Integration test suite is NOT run locally (project rule: CI runs it on push to staging). Test EXISTENCE + correctness verified by reading (18 tests, correct fixtures/assertions) and typecheck cleanliness, per the verification focus instruction.

### Requirements Coverage

| Requirement | Source Plan | Description                                                      | Status      | Evidence                                                                                                                         |
| ----------- | ----------- | ---------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| CAJA-01     | 01 / 03     | Cajas efectivo×sucursal + central + banco ARS/EUR, currency fija | ✓ SATISFIED | schema + migration seed + test "seed produces cajas with correct shape"                                                          |
| CAJA-02     | 01 / 02     | cash_register_id desacoplado de branchId, server-derived         | ✓ SATISFIED | nullable FK + resolver wired in create() + test "create stamps caja" + "backfill labels historical rows"                         |
| CAJA-03     | 03          | getBalance firme derivado + pendientes aparte                    | ✓ SATISFIED | getBalance impl + tests "firmeBalance = opening + Σ validados", "pendienteAmount reported separately", "cutoff excludes history" |
| CAJA-04     | 02 / 03     | guard de moneda, nunca mezcla                                    | ✓ SATISFIED | guard in resolveCashRegister + test "Moneda inconsistente" via EUR efectivo fixture                                              |

No orphaned requirements: all four CAJA IDs declared in plan frontmatter and mapped.

### Anti-Patterns Found

| File                       | Line | Pattern       | Severity | Impact                                                                                                                                                                                                                          |
| -------------------------- | ---- | ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cash-register-service.ts` | 121  | `// TODO 139` | ℹ️ Info  | Planned forward-extension to scheduled phase 139 (signed outflows). Inflow-only saldo is correct and complete for 138 scope (CAJA-03: "derivado en v1"). Not unresolved debt — references a concrete next phase. NOT a blocker. |

No TBD/FIXME/XXX markers in any 138-modified file. No stubs (the only initial-empty values are seeded/overwritten; getBalance returns real aggregates).

### Create()-Coupling Assessment (Verification Focus #8)

**Concern:** Wiring `resolveCashRegister` into `create()` makes a `cash` payment **hard-throw** `"No existe caja efectivo para la sucursal {X}"` if a branch has no efectivo caja.

**Assessment — latent operational risk, NOT a current blocker:**

- In production today this cannot be triggered by normal app operation: there is **no runtime REST endpoint that inserts `branches`** (verified — branches are created only by `seed.ts` / `seed-staging.ts` / `seed-production.ts` at provisioning time). The 0154 seed creates an efectivo caja for every active non-virtual branch, so all existing prod branches are covered.
- The failure mode surfaced honestly during execution (138-02 deviation #1/#2) and was correctly handled in the test environment (`test/setup.ts` + `ensureEfectivoCaja` helper seed cajas for runtime-created test branches).
- **Residual risk:** if a NEW physical branch is ever added to prod (via a future migration/seed) WITHOUT also seeding its efectivo caja, the FIRST cash payment to that branch breaks. This is a documented operational precondition, not a code defect — the same migration that adds a branch must add its caja (consistent with D-07: prod caja data via migration).

**Recommendation (non-blocking):** When phase 141/142 or any future branch-onboarding work lands, ensure branch creation co-provisions the efectivo caja (or `resolveCashRegister` could degrade to a clearer onboarding-time error). Flag carried forward for 139+ awareness; does not block 138 goal achievement.

### Human Verification Required

None. Phase 138 is backend-only (D-10) — no UI, no visual/real-time/external-service behavior. All four success criteria are exercised by automated integration tests whose existence and correctness were verified by reading, and the typecheck gate is clean. UI display is phases 141/142.

### Gaps Summary

No gaps. All four success criteria (CAJA-01..04) are observably achieved in the live codebase:

- `cash_registers` exists with the correct shape and an additive, comment-clean migration 0154 whose enum matches the schema byte-for-byte and whose SELECT-driven seed produces the canonical caja set on the prod baseline.
- `cash_register_id` is a nullable FK decoupled from the NOT-NULL `branchId`, stamped 100% server-side at the single `create()` insert site (covering all 9 paths via DI into all 6 TransactionService instantiations), and structurally unreachable from the request body.
- `getBalance` derives the firm balance from `opening_balance + Σ validados since cutoff` (reusing the phase-137 `firmMoneyConditions()` verbatim) and returns pendientes in a separate field never folded into the firm total.
- The currency guard mirrors `applyDelta` and is exercised non-vacuously by a directly-inserted EUR efectivo caja fixture.

The single `// TODO 139` is a planned forward-extension to a scheduled phase, not unresolved debt. The create()-coupling is a documented latent operational risk with no current trigger, surfaced explicitly above for downstream awareness.

---

_Verified: 2026-06-24_
_Verifier: Claude (gsd-verifier)_
