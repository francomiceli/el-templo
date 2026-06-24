---
phase: 141-reportes-para-la-admin
verified: 2026-06-24T00:00:00Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: null
  previous_score: null
human_verification:
  - test: "Open /caja as owner/admin → lands on Pendientes, oldest-first; a pending older than thresholdDays shows a 'vencido' badge + warm tint and the '⚠ N pendientes superan los {N} días' banner; the Pendientes tab carries the floating vencido badge (visible from other tabs)."
    expected: "Bandeja lands first, oldest at top, overdue rows tinted + badged, counter banner present, floating tab badge reflects overdue count."
    why_human: "Visual layout, color/tint rendering, tab-badge propagation across tabs — not grep-verifiable."
  - test: "Pendientes/Observados/Todos filter switches rows (observados amber in the same list). Validar one-tap confirms + validates + refreshes. ⋮ → Observar (motivo) flips to amber; ⋮ → Corregir (amount/paymentMethod/memberId only); ⋮ → Anular opens the membership popup with 'Mantener la membresía activa' default ON."
    expected: "Filter toggles list, Validar/Observar/Corregir/Anular flows complete end-to-end against the 137 endpoints with correct UI prompts."
    why_human: "Interactive multi-step flows + real server round-trips; UX confirmation."
  - test: "Saldos: per-currency subtotals only (no ARS+EUR combined); firme large, pendiente small/gold."
    expected: "No cross-currency total anywhere; moneda badge beside each amount; subtotals grouped per currency."
    why_human: "Visual currency-isolation confirmation with real multi-currency caja data."
  - test: "Movimientos: old CajaPage view intact (summary, table, Excel); no egresos placeholder. Mov. y egresos: movimientos + egresos appear INCLUDING rows with no socio; filter by Caja and Período; Tipo toggle; egreso amounts show '−'; Exportar Excel downloads a .xlsx."
    expected: "Migrated Movimientos identical to prior, NULL-member rows visible in Mov-Egresos, filters + Excel download work."
    why_human: "Visual parity of verbatim migration + real download/render of NULL-member rows."
  - test: "No blue anywhere (warm palette); a coach account does NOT see /caja."
    expected: "Warm palette throughout; coach blocked from the hub (router + backend 403)."
    why_human: "Visual palette audit + live coach-session access check."
---

# Phase 141: Reportes para la admin — Verification Report

**Phase Goal:** La admin tiene la vista de control completa: bandeja de pendientes por antigüedad + observados + alerta por umbral (validar/observar/corregir/anular del 137); saldo firme/pendiente por caja (138); historial mov/egresos filtrable (139); todo exportable reusando exceljs. /caja reorganizada en pestañas. isCajaRole; coach no. NO migration.
**Verified:** 2026-06-24
**Status:** human_needed (all code VERIFIED; 1 deferred visual UAT outstanding)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                               | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **REP-01** — Admin ve bandeja de pendientes+observados ordenada por antigüedad con alerta por umbral                | ✓ VERIFIED | `listPendingTray` (transaction-service.ts:1012) own LEFT-JOIN query, `validation_status IN (pendiente,observado)` (1034), `voidedAt IS NULL` (1042), oldest-first `asc(transactionDate),asc(createdAt)` (1127-1130), TS aging clamp≥0 (1142), `isOverdue = ageInDays > OVERDUE_DAYS` (1162), returns `thresholdDays` (1166). UI: BandejaPendientesTab.vue — vencido banner driven by `thresholdDays` from response (line 11/420, ref 345 overwritten), Validar prominent (147) + ⋮ menu Observar/Corregir/Anular (156-171), Pendientes/Observados/Todos toggle (18/349-353), vencido tint+badge (116/134). |
| 2   | **REP-02** — Admin ve saldo firme y pendiente por caja (efectivo×sucursal/central/banco×moneda), sin cross-currency | ✓ VERIFIED | `listActiveCajasWithBalance` (cash-register-service.ts:233) iterates active cajas over 138 `getBalance` (261). Central/banco owner-only: `c.branchId === null continue` (258) + cross-country hide (259). UI: SaldosPorCajaTab.vue — grouped efectivo-sucursal/central/banco (125-145), per-currency subtotals via `Map` (114-121), firme dominant (42) + pendiente separate gold (50), NEVER cross-currency.                                                                                                                                                                                              |
| 3   | **REP-03** — Admin ve historial mov/egresos filtrable por caja/período (NULL-member rows survive — 139 flag)        | ✓ VERIFIED | `listMovEgresos` (transaction-service.ts:1185) own query, `leftJoin(users)` (1290) so member_id NULL rows survive, `kind IN (cash_transfer,expense,adjustment)` (1195-1199), caja/período filters (1202-1216), country-scope-by-caja sub-select avoiding the NULL-branch trap (1225-1236) + `1=0` sentinel for non-owner-no-country (1240). **Shared `list()` (866) + `exportRowsForExcel()` (1762) remain INNER JOIN, byte-for-byte untouched** (git: 141-01 +176/-0, 141-02 +171/-0). UI: MovEgresosTab.vue consumes it, Caja/Período/Tipo filters, recorderName "—" fallback (115).                     |
| 4   | **REP-04** — Reportes nuevos exportan reusando exceljs, sin mecanismo paralelo                                      | ✓ VERIFIED | 3 sibling `/export` endpoints (routes.ts pending-tray:988, balances:1102, movements-history:1225), all `new Workbook()` (exceljs) + shared `styleHeaderRow` (1342). No `?type=`, no pdfmake/PdfPrinter in finance routes. Frontend renders ONLY "Exportar Excel" — no dead PDF control in any new tab (grep confirms).                                                                                                                                                                                                                                                                                     |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact                                                | Expected                                                                   | Status     | Details                                                                                |
| ------------------------------------------------------- | -------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| `el-templo-api/src/modules/finance/constants.ts`        | OVERDUE_DAYS=3 (142 seam)                                                  | ✓ VERIFIED | `export const OVERDUE_DAYS = 3` with 142-swap doc                                      |
| `…/finance/transaction-service.ts`                      | listPendingTray + listMovEgresos own queries                               | ✓ VERIFIED | Both LEFT-JOIN own queries; shared list()/exportRowsForExcel() INNER JOIN untouched    |
| `…/finance/cash-register-service.ts`                    | listActiveCajasWithBalance over getBalance                                 | ✓ VERIFIED | Iterates active cajas; central/banco owner-only gate                                   |
| `…/finance/routes.ts`                                   | 3 reads + 3 sibling exports, FINANCE_READ_ROLES gated                      | ✓ VERIFIED | All 6 endpoints present; module onRequest guard (189-200)                              |
| `…/finance/schemas.ts`                                  | additionalProperties:false + status enum                                   | ✓ VERIFIED | Querystring schemas `additionalProperties:false`                                       |
| `test/finance/pending-tray.test.ts`                     | ordering/aging/overdue/coach 403                                           | ✓ VERIFIED | All assertions present + thresholdDays + status filter                                 |
| `test/finance/cash-balances.test.ts`                    | firme/pendiente + central/banco scope + coach 403                          | ✓ VERIFIED | gestion AR does NOT see branch-less banco; owner does                                  |
| `test/finance/mov-egresos-history.test.ts`              | NULL-member LEFT-JOIN proof + filters + coach 403                          | ✓ VERIFIED | Load-bearing: NULL-member cash_transfer + expense both returned (212-215)              |
| `el-templo-admin/src/composables/useTransactionsApi.ts` | 3 reads + validate/observe/correct + keepMembershipActive void + 3 exports | ✓ VERIFIED | All present in return block (455-477); cleanup() retained (446); NO onUnmounted inside |
| `el-templo-admin/src/constants/caja.ts`                 | tab names, threshold NOT hardcoded here                                    | ✓ VERIFIED | CAJA_TABS + default; threshold from server payload                                     |
| `el-templo-admin/src/pages/CajaPage.vue`                | q-tabs hub, 4 tabs, coach excluded                                         | ✓ VERIFIED | 4 tabs, Pendientes landing + floating vencido badge (31)                               |
| `…/components/caja/MovimientosTab.vue`                  | verbatim migration, egresos placeholder removed                            | ✓ VERIFIED | Summary+table+Excel migrated; no "Próximamente" placeholder                            |
| `…/components/caja/SaldosPorCajaTab.vue`                | cards by tipo, per-currency subtotals                                      | ✓ VERIFIED | Map-based per-currency, never cross-currency, Excel-only                               |
| `…/components/caja/BandejaPendientesTab.vue`            | Validar + ⋮ + overdue + membership popup                                   | ✓ VERIFIED | All actions + diff-only correctedFields + keepMembershipActive default ON              |
| `…/components/caja/MovEgresosTab.vue`                   | historial filterable, NULL-member rows, Excel                              | ✓ VERIFIED | Caja/Período/Tipo filters, egreso "−", recorderName fallback                           |

### Key Link Verification

| From                                | To                         | Via                                | Status  | Details                                                   |
| ----------------------------------- | -------------------------- | ---------------------------------- | ------- | --------------------------------------------------------- |
| routes GET /pending-tray            | listPendingTray            | service call                       | ✓ WIRED | Handler at routes.ts:947 calls service with country scope |
| routes GET /cash-registers/balances | listActiveCajasWithBalance | service call                       | ✓ WIRED | isOwner+country passed (1087)                             |
| routes GET /movements-history       | listMovEgresos             | caja/período/scope filters         | ✓ WIRED | Handler 1177, isOwner+country (1194)                      |
| listPendingTray isOverdue           | constants OVERDUE_DAYS     | import                             | ✓ WIRED | import (60), used (1162)                                  |
| listMovEgresos                      | leftJoin(users)            | LEFT JOIN survives NULL-member     | ✓ WIRED | leftJoin(users) on memberId (1290)                        |
| BandejaPendientesTab Anular         | voidTransaction            | { reason, keepMembershipActive }   | ✓ WIRED | Threaded only when memberId present (570-579)             |
| BandejaPendientesTab Validar        | validateTransaction        | POST validate then refresh         | ✓ WIRED | onValidar (447) → validate (456) → reload                 |
| MovEgresosTab                       | getMovEgresosHistory       | GET /movements-history             | ✓ WIRED | Consumed with caja/período filters                        |
| CajaPage hub                        | 4 tab components           | q-tab-panel render w/ shared props | ✓ WIRED | All 4 imported (73-76) + rendered (43-63)                 |
| SaldosPorCajaTab                    | getCashRegisterBalances    | composable → GET /balances         | ✓ WIRED | Called (158)                                              |

### Data-Flow Trace (Level 4)

| Artifact             | Data Variable      | Source                                                                                  | Produces Real Data | Status    |
| -------------------- | ------------------ | --------------------------------------------------------------------------------------- | ------------------ | --------- |
| BandejaPendientesTab | rows/thresholdDays | getPendingTray → /pending-tray → listPendingTray (real DB LEFT JOIN)                    | ✓ Yes              | ✓ FLOWING |
| SaldosPorCajaTab     | rows               | getCashRegisterBalances → /balances → listActiveCajasWithBalance → getBalance (real DB) | ✓ Yes              | ✓ FLOWING |
| MovEgresosTab        | rows               | getMovEgresosHistory → /movements-history → listMovEgresos (real DB LEFT JOIN)          | ✓ Yes              | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior                                     | Command                                                              | Result                                                                                    | Status              |
| -------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------- |
| API typecheck clean                          | `cd el-templo-api && npx tsc --noEmit`                               | exit 0                                                                                    | ✓ PASS              |
| Admin typecheck — no 141 file errors         | `cd el-templo-admin && npx tsc --noEmit` filtered for caja/141 files | only pre-existing axios-test + session-pdf-builder errors (out of scope, not 141-touched) | ✓ PASS              |
| Shared list()/exportRowsForExcel() untouched | `git show e2afa629/84ed167e --stat`                                  | +176/-0, +171/-0 (pure additions)                                                         | ✓ PASS              |
| No new migration                             | `git log b6f988bb..HEAD --name-only \| grep migrations/*.sql`        | none                                                                                      | ✓ PASS              |
| Integration tests (CI on push)               | per project policy — verified by reading + tsc                       | tests exist, correct, typecheck-clean                                                     | ? SKIP (runs in CI) |

### Requirements Coverage

| Requirement | Source Plan    | Description                                                                | Status      | Evidence                                                  |
| ----------- | -------------- | -------------------------------------------------------------------------- | ----------- | --------------------------------------------------------- |
| REP-01      | 141-01, 141-04 | Bandeja de pendientes ordenada por antigüedad + alerta umbral + observados | ✓ SATISFIED | listPendingTray + BandejaPendientesTab (truth #1)         |
| REP-02      | 141-01, 141-03 | Saldo firme/pendiente por caja, sin cross-currency                         | ✓ SATISFIED | listActiveCajasWithBalance + SaldosPorCajaTab (truth #2)  |
| REP-03      | 141-02, 141-04 | Historial mov/egresos por caja/período (NULL-member visible)               | ✓ SATISFIED | listMovEgresos LEFT JOIN + MovEgresosTab (truth #3)       |
| REP-04      | 141-01..04     | Export reusando exceljs sin mecanismo paralelo                             | ✓ SATISFIED | 3 sibling exceljs exports, Excel-only frontend (truth #4) |

### Anti-Patterns Found

| File               | Line | Pattern                           | Severity | Impact                                                                                                                           |
| ------------------ | ---- | --------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| MovimientosTab.vue | 28   | `color="blue"` Transferencia icon | ℹ️ Info  | Pre-existing token migrated verbatim (not newly introduced); no new blue anywhere else. Acceptable per verbatim-migration scope. |

No debt markers (TBD/FIXME/XXX). No console.\* (createLogger used). No TODO/placeholder/"Próximamente" in new files. No stubs. No empty returns flowing to render.

### Auth (coach 403)

- Backend authoritative gate: module-level `onRequest` hook (routes.ts:189-200) rejects any role not in `FINANCE_READ_ROLES` = owner/admin/gestion/recepcion (permissions.ts:126-131) — **coach excluded → 403** on all 4 new report endpoints (inherited, not per-handler). All 3 test files assert coach → 403 over HTTP.
- Frontend defense-in-depth: router meta excludes coach (unchanged); isCajaRole gate intact.

### Critical-Scrutiny Findings (REP-03 + REP-02)

**REP-03 (hardest):** PASS. `listMovEgresos` is a NEW sibling LEFT-JOIN query. The shared member-keyed `list()` (INNER JOIN, 882-929) and `exportRowsForExcel()` (INNER JOIN, 1791-1799) are confirmed byte-for-byte untouched (git diffstat: pure additions, 0 deletions across both 141 backend commits). Country scope uses a sub-select on cajas-by-branch-country (NOT `eq(branches.country)`), correctly preserving branch-less central/banco rows as owner-only and avoiding the NULL-branch trap. A non-owner with unresolved country gets `1=0` (zero rows, not full ledger). The test proves NULL-member cash_transfer AND expense rows are both returned (an INNER JOIN would drop both).

**REP-02 (hardest):** PASS. `listActiveCajasWithBalance` gates central/banco (branchId NULL) as owner-only (line 258) and hides cross-country branch cajas for non-owners (line 259), matching Franco-confirmed scope. The cash-balances test asserts gestion(AR) does NOT see the branch-less banco caja while owner does.

### Human Verification Required (DEFERRED — Franco)

Plan 141-04 Task 3 was a `checkpoint:human-verify` deliberately deferred to end-of-phase. All code is implemented and typecheck-clean; the visual/interactive confirmation is outstanding. See the `human_verification` frontmatter list above — 5 items covering: (1) bandeja landing + overdue alert + floating badge, (2) filter + Validar/Observar/Corregir/Anular flows + membership popup, (3) Saldos per-currency isolation, (4) Movimientos parity + Mov-Egresos NULL-member rows + filters + Excel download, (5) warm palette + coach exclusion.

### Gaps Summary

No gaps. All 4 must-have truths VERIFIED at all levels (exists, substantive, wired, data flowing). The two REP-03/REP-02 critical concerns held up under hardest scrutiny: shared list() untouched (byte-for-byte), and central/banco owner-only gated on both endpoint and tested. No new migration. No new dependencies. Coach 403 enforced backend-side. The only reason status is `human_needed` rather than `passed` is the deliberately deferred visual UAT (5 items) — these are expected pending items per the phase plan, NOT failures.

---

_Verified: 2026-06-24_
_Verifier: Claude (gsd-verifier)_
