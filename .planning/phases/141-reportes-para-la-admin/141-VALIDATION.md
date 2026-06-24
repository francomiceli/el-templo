---
phase: 141
slug: reportes-para-la-admin
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-24
---

# Phase 141 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 141-RESEARCH.md § "Validation Architecture" (Test Map + Wave 0 Gaps).

---

## Test Infrastructure

| Property               | Value                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**          | Vitest (integration, real MySQL `eltemplo_test_<POOL_ID>`) — backend; frontend has no test infra (Quasar pages verified by tsc + human-verify) |
| **Config file**        | existing (`el-templo-api` vitest setup; helpers at `test/helpers.ts`)                                                                          |
| **Quick run command**  | `cd el-templo-api && npx tsc --noEmit` (API) · `cd el-templo-admin && npx tsc --noEmit` (admin) — typecheck only                               |
| **Full suite command** | runs in **CI** on push to staging (NOT local — per project MEMORY)                                                                             |
| **Estimated runtime**  | tsc ~20-40s local; full integration suite ~minutes in CI                                                                                       |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit` in the touched app.
- **After every plan wave:** push to staging → CI runs the full integration suite.
- **Before `/gsd:verify-work`:** CI green on staging.
- **Max feedback latency:** ~40s local (tsc); CI suite on push.

---

## Per-Task Verification Map

| Task ID   | Plan | Wave | Requirement              | Threat Ref          | Secure Behavior                                                                                                                                                                    | Test Type                | Automated Command                                                                        | File Exists          | Status     |
| --------- | ---- | ---- | ------------------------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------- | -------------------- | ---------- |
| 141-01-00 | 01   | 1    | REP-01 / REP-02          | T-141-01            | Wave-0 scaffolds: bandeja oldest-first+aging+overdue+status-filter+coach403; saldos per-caja firme/pendiente+coach403+central/banco owner-only                                     | integration (CI)         | `vitest test/finance/pending-tray.test.ts` · `vitest test/finance/cash-balances.test.ts` | ❌ W0                | ⬜ pending |
| 141-01-01 | 01   | 1    | REP-01 / REP-02          | T-141-02            | `listPendingTray` own LEFT-JOIN query, asc order, TS aging, isOverdue from `OVERDUE_DAYS`; `listActiveCajasWithBalance` non-owner scoped by caja country, central/banco owner-only | integration (CI)         | `vitest test/finance/pending-tray.test.ts test/finance/cash-balances.test.ts`            | ✅ (after 141-01-00) | ⬜ pending |
| 141-01-02 | 01   | 1    | REP-01 / REP-02 / REP-04 | T-141-01 / T-141-03 | GET /pending-tray + GET /cash-registers/balances (coach 403 via FINANCE_READ_ROLES) + sibling Excel exports reuse exceljs; export reuses list scope                                | integration (CI)         | `vitest test/finance/pending-tray.test.ts test/finance/cash-balances.test.ts`            | ✅                   | ⬜ pending |
| 141-02-00 | 02   | 2    | REP-03                   | T-141-05            | Wave-0 scaffold: historial includes NULL-member expense AND cash_transfer (LEFT JOIN proof); caja/período filter; adjustment included, member cobros excluded; coach 403           | integration (CI)         | `vitest test/finance/mov-egresos-history.test.ts`                                        | ❌ W0                | ⬜ pending |
| 141-02-01 | 02   | 2    | REP-03 / REP-04          | T-141-06            | `listMovEgresos` own LEFT-JOIN query (NULL-member rows survive); non-owner scoped by caja country (no NULL-branch trap), central/banco owner-only; sibling Excel export            | integration (CI)         | `vitest test/finance/mov-egresos-history.test.ts`                                        | ✅ (after 141-02-00) | ⬜ pending |
| 141-03-01 | 03   | 3    | REP-02 / REP-04          | T-141-10            | `useTransactionsApi` extended (reads + validate/observe/correct + keepMembershipActive + 3 exports), cleanup() kept, no onUnmounted inside; FE types                               | typecheck                | `cd el-templo-admin && npx tsc --noEmit`                                                 | ✅ existing          | ⬜ pending |
| 141-03-02 | 03   | 3    | REP-02                   | T-141-09            | CajaPage q-tabs hub shell (coach-excluded gating unchanged) + MovimientosTab verbatim migration (egresos placeholder removed)                                                      | typecheck + human-verify | `cd el-templo-admin && npx tsc --noEmit`                                                 | ✅ existing          | ⬜ pending |
| 141-03-03 | 03   | 3    | REP-02 / REP-04          | T-141-10            | SaldosPorCajaTab cards by tipo, per-currency subtotals only (no cross-currency total), Excel export                                                                                | typecheck + human-check  | `cd el-templo-admin && npx tsc --noEmit`                                                 | ✅ existing          | ⬜ pending |
| 141-04-01 | 04   | 4    | REP-01 / REP-04          | T-141-11 / T-141-12 | BandejaPendientesTab: oldest-first, overdue alert (thresholdDays from payload), filter, Validar one-tap, ⋮ Observar/Corregir/Anular, membership popup wires keepMembershipActive   | typecheck + human-check  | `cd el-templo-admin && npx tsc --noEmit`                                                 | ✅ existing          | ⬜ pending |
| 141-04-02 | 04   | 4    | REP-03 / REP-04          | T-141-13            | MovEgresosTab: NULL-member rows visible, caja/período filter, no cross-currency total, Excel export                                                                                | typecheck + human-check  | `cd el-templo-admin && npx tsc --noEmit`                                                 | ✅ existing          | ⬜ pending |
| 141-04-03 | 04   | 4    | REP-01..04               | T-141-09            | Human-verify checkpoint: full hub end-to-end (bandeja actions, overdue, saldos currency isolation, historial NULL-member rows, coach exclusion, warm palette)                      | manual (blocking)        | human-verify                                                                             | n/a                  | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `el-templo-api/test/finance/pending-tray.test.ts` — REP-01 (oldest-first ordering, aging, isOverdue>3 via OVERDUE_DAYS, status filter, recorder/caja name, coach 403)
- [ ] `el-templo-api/test/finance/cash-balances.test.ts` — REP-02 (per-caja firme/pendiente, coach 403, central/banco owner-only scope)
- [ ] `el-templo-api/test/finance/mov-egresos-history.test.ts` — REP-03 (**LEFT JOIN includes NULL-member expense AND cash_transfer rows**, caja/período filter, adjustment included / member cobros excluded, coach 403)
- [ ] `el-templo-api/src/modules/finance/constants.ts` — `OVERDUE_DAYS = 3` shared constant (142 swaps to config)
- [ ] Export assertions (REP-04) — extend the above files or assert the sibling `.xlsx` column shape per report
- [ ] Seed helper check: `ensureEfectivoCaja` exists; confirm/add a banco caja + movimiento/egreso (member_id NULL) seed for the REP-03 LEFT-JOIN test

_Frontend (plans 03/04) has no Quasar test infra — verified by `npx tsc --noEmit` + the blocking human-verify checkpoint (141-04-03)._

---

## Manual-Only Verifications

| Behavior                                                                                                | Requirement | Why Manual                      | Test Instructions                                                                     |
| ------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------- | ------------------------------------------------------------------------------------- |
| /caja hub lands on Pendientes; tabs render                                                              | REP-01      | No FE test infra (Quasar pages) | Open /caja as owner/admin → lands on Pendientes; 4 tabs present                       |
| Bandeja: Validar one-tap, ⋮ Observar/Corregir/Anular, overdue badge+banner, membership popup default ON | REP-01      | Visual + interactive flow       | See 141-04 checkpoint how-to-verify steps 1-2                                         |
| Saldos: per-currency subtotals, no cross-currency total, currency badge beside                          | REP-02      | Visual layout                   | Saldos tab → groups by tipo; a group with ARS+EUR shows two subtotal chips, never one |
| Mov/egresos: NULL-member rows visible, caja/período filter, egreso "−", no cross-currency total         | REP-03      | Visual + data                   | Mov. y egresos tab → rows without socio appear; filter by caja + período              |
| Coach cannot reach /caja                                                                                | REP-01..03  | Role-gated UI                   | Log in as coach → /caja not accessible (router meta + backend 403)                    |
| Warm palette, NO blue                                                                                   | (UI-SPEC)   | Visual                          | Inspect hub — no blue tokens                                                          |

---

## Validation Sign-Off

- [x] All backend tasks have `<automated>` verify (tsc) + Wave 0 integration tests (CI)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task has tsc; backend has CI integration tests)
- [x] Wave 0 covers all MISSING references (3 new test files + constants)
- [x] No watch-mode flags (tsc --noEmit; CI runs suite once)
- [x] Feedback latency < 40s local (tsc)
- [x] `nyquist_compliant: true` set in frontmatter
- Frontend lacks automated runtime tests by design (no Quasar test infra) — covered by tsc + blocking human-verify checkpoint.

**Approval:** pending
