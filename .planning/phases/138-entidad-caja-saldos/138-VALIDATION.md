---
phase: 138
slug: entidad-caja-saldos
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-24
---

# Phase 138 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| **Framework**          | vitest (already configured)                                                                    |
| **Config file**        | per-worker test MySQL (`eltemplo_test_<POOL_ID>`) via `el-templo-api/test/setup.ts`            |
| **Quick run command**  | `cd el-templo-api && pnpm test test/finance/cash-register-service.test.ts`                     |
| **Full suite command** | `cd el-templo-api && pnpm test` (runs in CI on push to staging — NOT locally per project rule) |
| **Estimated runtime**  | ~30 seconds (single file)                                                                      |

---

## Sampling Rate

- **After every task commit:** Run the quick command (`pnpm test test/finance/cash-register-service.test.ts`) + `pnpm typecheck`
- **After every plan wave:** Run the quick command + `pnpm typecheck`; for the migration wave also `pnpm db:migrate`
- **Before `/gsd:verify-work`:** Full suite green in CI on push to staging
- **Max feedback latency:** ~30 seconds (local single-file)

> Project rule (MEMORY): do NOT run the full local suite — CI runs it on push to staging. Local typecheck + the single new test file are the local sampling loop.

---

## Per-Task Verification Map

| Task ID   | Plan | Wave | Requirement                        | Threat Ref                     | Secure Behavior                                                                                      | Test Type   | Automated Command                                                                                  | File Exists | Status     |
| --------- | ---- | ---- | ---------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| 138-01-01 | 01   | 1    | CAJA-01, CAJA-02                   | T-138-03                       | cash_registers schema + nullable cash_register_id FK; enum drift caught                              | typecheck   | `cd el-templo-api && pnpm typecheck`                                                               | ❌ W0       | ⬜ pending |
| 138-01-02 | 01   | 1    | CAJA-01, CAJA-02                   | T-138-01 / T-138-02            | migration 0154 applies; 8 cajas seeded; backfill labels-only; no `;` in SQL comments                 | integration | `cd el-templo-api && pnpm db:migrate`                                                              | ❌ W0       | ⬜ pending |
| 138-01-03 | 01   | 1    | CAJA-01..04                        | —                              | Wave 0 test scaffold runnable (6 todo groups)                                                        | integration | `cd el-templo-api && pnpm test test/finance/cash-register-service.test.ts`                         | ❌ W0       | ⬜ pending |
| 138-02-01 | 02   | 2    | CAJA-02, CAJA-04                   | T-138-05                       | resolveCashRegister maps method→caja; efectivo currency mismatch throws "Moneda inconsistente"       | integration | `cd el-templo-api && pnpm test test/finance/cash-register-service.test.ts -t "resolver"`           | ✅          | ⬜ pending |
| 138-02-02 | 02   | 2    | CAJA-02                            | T-138-04 / T-138-06            | create() stamps cash_register_id server-side at the single insert site; not from body                | integration | `cd el-templo-api && pnpm test test/finance/cash-register-service.test.ts -t "create stamps caja"` | ✅          | ⬜ pending |
| 138-02-03 | 02   | 2    | CAJA-02                            | T-138-06                       | all 6 TransactionService sites inject CashRegisterService; app compiles                              | typecheck   | `cd el-templo-api && pnpm typecheck`                                                               | ✅          | ⬜ pending |
| 138-03-01 | 03   | 3    | CAJA-01..04                        | T-138-07 / T-138-08            | RED: failing tests encode seed, resolver, EUR guard, backfill labels, getBalance, cutoff, pendientes | integration | `cd el-templo-api && pnpm test test/finance/cash-register-service.test.ts` (expect RED)            | ✅          | ⬜ pending |
| 138-03-02 | 03   | 3    | CAJA-01, CAJA-02, CAJA-03, CAJA-04 | T-138-07 / T-138-08 / T-138-09 | GREEN: getBalance = opening + Σ validados since cutoff; pendientes apart; reuses firmMoneyConditions | integration | `cd el-templo-api && pnpm test test/finance/cash-register-service.test.ts`                         | ✅          | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Requirement → Validating Test Map

> Every phase requirement maps to at least one concrete test case in
> `el-templo-api/test/finance/cash-register-service.test.ts` (source: 138-RESEARCH.md § "Validation Architecture → Phase Requirements → Test Map").

| Req     | Behavior under test                                                                                                                                            | Test group / case                                        | Plan                                                    |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| CAJA-01 | Seed produces 8 cajas with correct type/currency/branch_id; no efectivo for the virtual ONLINE branch                                                          | "seed produces 8 cajas"                                  | 03 (asserts) / 01 (migration produces)                  |
| CAJA-02 | Resolver: `cash`→efectivo(branch), `transfer`/`card`→banco(currency), `aura_credit`/`internal`→NULL                                                            | "resolver maps paymentMethod to caja"                    | 02 (impl) / 03 (asserts)                                |
| CAJA-02 | A `cash` charge via `create()` (not REST, e.g. recordAssignmentCharge-style path) stamps a non-null cash_register_id                                           | "create stamps caja"                                     | 02 (impl) / 03 (asserts)                                |
| CAJA-02 | Backfill (0154): a pre-cutoff `cash` row got its branch's efectivo id, a `transfer` row got the banco caja, an `aura_credit` row stayed NULL (D-01 derivation) | "backfill labels historical rows" (in seed/cutoff group) | 03                                                      |
| CAJA-03 | getBalance firme = opening_balance + Σ validados since cutoff                                                                                                  | "getBalance firme = opening + Σ validados since cutoff"  | 03                                                      |
| CAJA-03 | Pendientes (validation_status='pendiente') returned separately, NOT added to firme                                                                             | "getBalance" (pendientes-don't-sum assertion)            | 03                                                      |
| CAJA-03 | A pre-cutoff validado tx is labeled but excluded from firmeBalance (cutoff gate)                                                                               | "cutoff excludes history"                                | 03                                                      |
| CAJA-03 | A voided validado inflow after cutoff is excluded from firmeBalance (firmMoneyConditions)                                                                      | "getBalance" (voided exclusion)                          | 03                                                      |
| CAJA-04 | Resolving a non-ARS (EUR) efectivo caja against a `cash` tx of a differing currency throws "Moneda inconsistente"                                              | "currency guard rejects mismatch"                        | 02 (impl) / 03 (asserts, EUR fixture inserted directly) |

---

## Wave 0 Requirements

- [ ] `el-templo-api/test/finance/cash-register-service.test.ts` — scaffold with 6 named `describe` groups + `it.todo` placeholders (created in plan 138-01, Task 3). Reuses `createTestApp`/`seedSubscription` from `test/finance/transaction-service.test.ts`.
- [ ] No new fixtures beyond seeding cajas in `beforeAll` + the directly-inserted EUR efectivo caja for the guard case.
- [ ] Framework already installed (vitest) — no install step.

---

## Manual-Only Verifications

_All phase behaviors have automated verification._ (Phase 138 is backend-only, D-10 — display/UI is phases 141/142. No manual verification in 138.)

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (the test scaffold)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
