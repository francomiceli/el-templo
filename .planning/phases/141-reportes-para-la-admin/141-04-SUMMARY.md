---
phase: 141-reportes-para-la-admin
plan: 04
subsystem: finance (admin frontend)
tags:
  [
    reports,
    finance,
    caja-hub,
    bandeja,
    validacion,
    movimientos,
    egresos,
    currency-isolation,
  ]
requires:
  - "141-03: useTransactionsApi extended (getPendingTray/getMovEgresosHistory + validate/observe/correct/void + Excel exports), CajaPage q-tabs hub shell with pendientes/movEgresos placeholders"
  - "141-01: GET /pending-tray (thresholdDays, PendingTrayItem shape)"
  - "141-02: GET /movements-history (MovEgresoItem, LEFT JOIN keeps NULL-member rows)"
  - "137: validate/observe/correct/void endpoints + keepMembershipActive"
provides:
  - "BandejaPendientesTab.vue — daily-control surface: oldest-first list, Validar one-tap + ⋮ (Observar/Corregir/Anular), vencido alert (badge+tint+counter banner from thresholdDays), membership 1-a-1 popup, Excel export"
  - "MovEgresosTab.vue — historial filterable by caja/período/tipo, renders NULL-member rows (cash_transfer/expense/adjustment), egreso − warm-red, no cross-currency total, Excel export"
  - "CajaPage placeholders replaced; Pendientes tab floating vencido badge wired (visible from any tab)"
affects:
  - "Closes the 141 caja-control hub (all 4 tabs live); 142 will swap thresholdDays from constant→finance_settings without UI change (data-driven seam already honored)"
tech-stack:
  added: []
  patterns:
    - "vencido alert driven by response.thresholdDays (never hardcoded) — D-08 seam for 142"
    - "Corregir form scoped to amount/paymentMethod/memberId only (137 correct endpoint contract); diff-only correctedFields payload"
    - "membership 1-a-1 popup: keepMembershipActive default ON, threaded only when row has a member link; plain void otherwise"
    - "client-side Tipo filter (Movimientos/Egresos/Todos) over the server page; caja options rebuilt from rows"
    - "Excel-only export (no dead PDF control); blob-download (createObjectURL + anchor)"
    - "composable cleanup() kept; onUnmounted only in SFCs (never inside the composable)"
key-files:
  created:
    - el-templo-admin/src/components/caja/BandejaPendientesTab.vue
    - el-templo-admin/src/components/caja/MovEgresosTab.vue
  modified:
    - el-templo-admin/src/pages/CajaPage.vue
decisions:
  - "Vencido count emitted up from the bandeja tab → CajaPage floating q-badge on Pendientes (visible from other tabs, D-08)"
  - "Corregir sends only changed fields (diff against the row); no-op shows an info notify instead of a pointless void+recreate"
  - "Anular toggle shown whenever the row carries a memberId (safer per UI-SPEC); plain void path for member-less rows"
  - "Tipo filter is client-side over the loaded page (endpoint returns all three kinds); caja filter is server-side"
  - "conceptoText: transfer renders notes (origen→destino narrative) as one logical row; egreso renders notes/concepto"
metrics:
  duration: ~9min
  completed: 2026-06-24
---

# Phase 141 Plan 04: Reportes para la admin (Caja hub frontend, part 2 — bandeja + mov/egresos) Summary

Filled the two remaining `/caja` hub placeholders: the **Bandeja de Pendientes** daily-control surface (oldest-first list with one-tap Validar, the ⋮ Observar/Corregir/Anular menu, the vencido alert driven by the server `thresholdDays`, the Pendientes/Observados/Todos filter, and the membership 1-a-1 Anular popup) and the **Mov. y egresos** historial (filterable by caja/período/tipo, rendering the NULL-member `cash_transfer`/`expense`/`adjustment` rows from the LEFT-JOIN endpoint, egreso amounts shown with a warm-red `−`, no cross-currency total). Both export Excel-only via the Plan-01/02 sibling endpoints. The full hub is now live; the human-verify checkpoint is deferred to Franco as a pending UAT item.

## What Was Built

- **`BandejaPendientesTab.vue` (Task 1):** consumes `getPendingTray({ status, country, page, limit })`; stores `thresholdDays` from the response (D-08 — never hardcoded). Renders:
  - A vencido counter `q-banner` (warm-red `bg-red-1 text-negative`) shown only when `vencidoCount > 0`: "⚠ {N} pendientes superan los {thresholdDays} días" (count = rows where `isOverdue`).
  - A `q-btn-toggle` filter Pendientes (default) / Observados / Todos mapping to the `status` param; observados live in the same list with an amber "Observado" badge.
  - A server-side `q-table` (column sorting disabled — oldest-first server-enforced) with body-cell slots: socio (Terracotta clickable link → `/alumnos/:id`, or plain text when member-less), monto + moneda badge beside, medio (`methodColor`/`methodLabel` badge), caja, cargado por (`text-caption`), antigüedad ("hace N días" — gold ≤ threshold, warm-red > threshold), estado (Pendiente gold / Observado amber + a `negative` "vencido" badge when `isOverdue`).
  - A prominent primary **Validar** `q-btn` (one-tap → lightweight `$q.dialog` confirm "¿Validar el pago de {monto} de {socio}?" → `validateTransaction` → notify "Pago validado" → reload + emit updated vencido count).
  - A "⋮" `q-menu`: **Observar** (dialog, required "Motivo de observación \*" → `observeTransaction`), **Corregir** (form prefilled with ONLY amount/paymentMethod/memberId — the 137 `correct` body accepts no cashRegister/notes; sends a diff-only `correctedFields` → `correctTransaction`), **Anular** (membership popup).
  - **Anular membership popup** (~480px): toggle "Mantener la membresía activa" default ON (`keepMembershipActive: true`) + helper, required "Motivo de anulación \*", `[Cancelar][Anular negative]` → `voidTransaction(id, reason, keepMembershipActive)`; member-less rows hide the toggle and do a plain void.
  - Empty states per UI-SPEC, error notifies, per-action `:loading`. Excel-only export (`exportPendingTrayToExcel` + blob-download); no PDF control. `createLogger('BandejaPendientesTab')`; warm palette; `cleanup()` via the SFC `onUnmounted`.
- **`MovEgresosTab.vue` (Task 2):** consumes `getMovEgresosHistory({ cashRegisterId, dateFrom, dateTo, country, page, limit })`. Filter bar: Caja `q-select` (options rebuilt from the loaded rows + "Todas"), Período (`q-input type=month` → `dateFrom`/`dateTo`), Tipo toggle Movimientos/Egresos/Todos (client-side over the page: `cash_transfer`/`expense`/all), + Exportar Excel. Server-side `q-table` columns Fecha · Tipo (badge: grey "Movimiento" / negative "Egreso" / warning "Ajuste") · Concepto (transfer notes as one logical row / egreso concepto) · Monto (+ moneda badge; egreso shows leading "−" warm-red) · Caja · Registrado por ("—" when absent) · ⋮ Detalles. Renders NULL-member rows (the LEFT-JOIN endpoint, flag 139) — never assumes a memberName. NO cross-currency total. Detail dialog reuses the `q-list` label/value pattern (tipo/monto/concepto/caja/sucursal/fecha/registrado por/notas/anulado). Empty/error states per UI-SPEC. Excel-only; `createLogger('MovEgresosTab')`; warm palette; `cleanup()` via SFC `onUnmounted`.
- **`CajaPage.vue` (Tasks 1+2):** replaced both placeholder panels with `<BandejaPendientesTab>` and `<MovEgresosTab>` (both passed `selectedCountry`/`isOwner`). Added a `vencidoCount` ref wired to `@update:vencido-count` from the bandeja, driving a floating `q-badge color="negative"` on the Pendientes tab so the overdue count is visible from any tab (D-08).

## Deviations from Plan

**1. [Rule 2 — correctness] Corregir sends a diff-only `correctedFields` payload (with a no-op guard).**

- **Found during:** Task 1.
- **Issue:** The plan prefills amount/paymentMethod/memberId, but blindly sending all three on submit would force a void+recreate even when nothing changed, and would re-send unchanged fields the endpoint doesn't need.
- **Fix:** `submitCorregir` compares each field against the row and only includes changed ones; if nothing changed it shows an info notify ("No hay cambios para corregir") instead of calling the endpoint.
- **Files modified:** `BandejaPendientesTab.vue`.
- **Commit:** 9037a0e5

**2. [Rule 3 — blocking] Caja filter options derived client-side from the loaded rows.**

- **Found during:** Task 2.
- **Issue:** The plan suggests "reuse the saldos data if convenient, else fetch active cajas", but the mov/egresos rows include central/banco cajas not in the saldos branch list, and there is no dedicated active-cajas list endpoint surfaced in the composable.
- **Fix:** Built the Caja `q-select` options from the distinct `cashRegisterId`/`cashRegisterName` pairs present in the loaded rows (+ "Todas"), preserving an already-selected caja that isn't on the current page. Keeps the filter functional without a new endpoint (zero new deps).
- **Files modified:** `MovEgresosTab.vue`.
- **Commit:** 6a62285a

Otherwise the plan executed as written.

## Checkpoint — Human-verify DEFERRED

Task 3 is a `type="checkpoint:human-verify"` (the reorganized `/caja` visual + bandeja flow). All code for every task is fully implemented and typecheck-clean. Per the execution directive, the visual human-verify is **DEFERRED to Franco as a pending UAT item** — it was NOT performed inline. The plan is marked complete with this checkpoint outstanding.

**Pending UAT (Franco):** verify on el-templo-admin as owner/admin → `/caja`:

1. Lands on **Pendientes**; oldest-first; a pending older than `thresholdDays` shows a "vencido" badge + warm tint and the "⚠ N pendientes superan los {N} días" banner appears; the Pendientes tab carries the floating vencido badge.
2. Pendientes/Observados/Todos filter switches rows (observados amber in the same list). **Validar** one-tap confirms + validates + refreshes. ⋮ → Observar (motivo) flips to amber; ⋮ → Corregir (amount/paymentMethod/memberId only); ⋮ → Anular opens the membership popup with "Mantener la membresía activa" default ON.
3. **Saldos:** per-currency subtotals only (no ARS+EUR combined).
4. **Movimientos:** old CajaPage view intact (summary, table, Excel); no egresos placeholder.
5. **Mov. y egresos:** movimientos + egresos appear INCLUDING rows with no socio; filter by Caja and Período; Tipo toggle; egreso amounts show "−"; Exportar Excel downloads a `.xlsx`.
6. No blue anywhere (warm palette); a **coach** account does NOT see `/caja`.

## Verification

- `cd el-templo-admin && npx tsc --noEmit` — no errors in any Plan-04 file (BandejaPendientesTab, MovEgresosTab, CajaPage). The only `tsc` errors are pre-existing and out of scope: `boot/__tests__/axios-refresh-lock.test.ts` (missing vitest types) and `utils/pdf/session-pdf-builder.ts` (pdfmake `vfs`/`Margins` typings) — both untouched by this plan (same as 141-03).
- Warm palette honored: no new blue introduced (medio badges reuse existing tokens; the lone pre-existing "Transferencia" blue lives in MovimientosTab, untouched here).
- Only Excel export buttons rendered on both tabs; no "Exportar PDF" dead control (REP-04, Excel-only v1).
- `cleanup()` retained in the composable; `onUnmounted` appears only in the two new SFCs, never inside the composable.

## Requirements

- **REP-01 (bandeja de pendientes):** complete end-to-end — backend `/pending-tray` (141-01) + composable (141-03) + BandejaPendientesTab UI (this plan) with Validar/Observar/Corregir/Anular, vencido alert, filter, membership popup.
- **REP-03 (historial mov/egresos):** complete end-to-end — backend `/movements-history` LEFT-JOIN (141-02) + composable (141-03) + MovEgresosTab UI (this plan), NULL-member rows visible, caja/período/tipo filter.
- **REP-04 (Excel export):** wired for both new tabs (Excel-only v1).

## Threat Model Compliance

- **T-141-11** (Validar/Observar/Corregir/Anular from UI): actions hit the 137 endpoints which enforce `FINANCE_VOID_ROLES` server-side (coach 403). The bandeja only surfaces them; router meta excludes coach (defense-in-depth).
- **T-141-12** (Anular membership decision dropped): the popup wires the `keepMembershipActive` toggle (default ON) into `voidTransaction`; the flag is threaded only when the row has a member link.
- **T-141-13** (NULL-member historial / cross-currency): MovEgresosTab renders `recorderName`/"—" and never assumes a member; there is no cross-currency total path; egreso amounts use a `−` sign per-row with the moneda badge beside (per-currency only).
- **T-141-SC** (npm installs): zero new packages.

## Self-Check: PASSED

- el-templo-admin/src/components/caja/BandejaPendientesTab.vue: FOUND
- el-templo-admin/src/components/caja/MovEgresosTab.vue: FOUND
- el-templo-admin/src/pages/CajaPage.vue: FOUND (modified)
- Commit 9037a0e5 (BandejaPendientesTab): FOUND
- Commit 6a62285a (MovEgresosTab): FOUND
