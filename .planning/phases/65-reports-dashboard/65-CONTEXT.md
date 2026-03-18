# Phase 65: Reports Dashboard - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin has a dedicated reports section with four operational reports (access log, charge history, expiring memberships, inactive members), all filterable by branch and report-specific criteria, with Excel export per report. REPORT-03 (debt report) is N/A — debt/morosos concept was removed in Phase 63.

Requirements: REPORT-01, REPORT-02, REPORT-04, REPORT-05
REPORT-03: N/A (debt concept removed in Phase 63)

</domain>

<decisions>
## Implementation Decisions

### Report Location & Navigation

- **New "Reportes" page** at route `/reportes` — separate from AnaliticasPage (which keeps its charts/KPIs role)
- Sidebar item "Reportes" placed **after Analiticas**, icon: `summarize`
- Sidebar order: ... Caja → Analiticas → Reportes → Configuracion
- Accessible to admin + superadmin + recepcionista (same as Caja)

### Page Structure — 4 Tabs

- **4 tabs**, one per report: Accesos, Cobros, Vencimientos, Inactivos
- (Deudas tab removed — no debt tracking in the system)
- **Global branch filter** above tabs — persists across tab switches, includes "Todas las sedes" default
- Each tab has its own report-specific filters below the tabs
- Each tab has its own **per-tab "Exportar Excel" button** within the tab content area
- Lazy data loading: only fetch when tab is activated (same pattern as AnaliticasPage)

### Accesos Tab (REPORT-01) — Access Log

- **Filters:** Date range picker (with presets: Este mes, Mes anterior, Ultimos 3 meses, Este año, Personalizado), member name/DNI search, source filter (QR / Manual / Todas)
- **Columns:** Fecha/Hora, Miembro, Sede, Fuente (QR/Manual), Turno (schedule slot if applicable, "-" if none)
- Server-side pagination (QTable @request pattern)

### Cobros Tab (REPORT-02) — Charge History

- **Filters:** Date range picker (same presets), payment method filter (Efectivo / Transferencia / Tarjeta / Todos), member name/DNI search
- **Columns:** Fecha, Miembro, Plan, Monto, Método, Registró (recorded by)
- Voided payments shown with visual indicator (strikethrough or [ANULADO] badge)
- Server-side pagination

### Vencimientos Tab (REPORT-04) — Expiring Memberships

- **Filters:** "Ventana de días" number input (default: 7) — shows members whose subscription expires within that many days from today. Toggle "Incluir vencidos" (default: Sí) to also show already-expired subscriptions.
- **Columns:** Miembro, Plan, Vence (end date), Días restantes (positive = days left, negative = "Vencido Xd"), Teléfono, WhatsApp button
- WhatsApp button opens `wa.me/{phone}` (same pattern as MiembrosTab "Contactar")
- No pagination needed — typically small result sets

### Inactivos Tab (REPORT-05) — Inactive Members

- **Filters:** "Días sin asistir" number input (default: 14) — shows members with active subscription who haven't checked in within that many days
- **Columns:** Miembro, Plan, Última asistencia (last check-in date), Días sin ir (days since last check-in), Teléfono, WhatsApp button
- WhatsApp button same pattern as Vencimientos
- No pagination needed — typically small result sets

### Export Behavior

- Same exceljs server-side pattern as Phase 64 member export
- All filtered results exported (no pagination limit on export endpoint)
- One API endpoint per report: `GET /admin/reports/{type}/export?filters`
- Response: `.xlsx` binary with Content-Disposition header
- Frontend: blob download (createElement('a') pattern from AlumnosPage)
- Filename convention: `reportes-{type}-{date}.xlsx` (e.g., `reportes-accesos-2026-03-18.xlsx`)
- Styled headers (bold, gray background — same as member export)

### Claude's Discretion

- API module structure (new `reports` module or extend existing modules)
- SQL query design for each report's data aggregation
- Date range picker implementation (reuse AnaliticasPage pattern or extract shared component)
- QTable column definitions, sorting, and row formatting
- Loading and empty state design per tab
- How "Incluir vencidos" toggle works in the query
- WhatsApp button styling (icon button vs text button)
- Export endpoint query optimization (indexes, limits)
- Whether to create shared report composable or separate composables per report

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above.

### Phase context

- `.planning/REQUIREMENTS.md` — REPORT-01, REPORT-02, REPORT-04, REPORT-05 requirements (v4.1 scope)
- `.planning/phases/52-analytics-dashboard/52-CONTEXT.md` — AnaliticasPage design: tabs, date range picker, branch filter, chart patterns
- `.planning/phases/63-cash-box/63-CONTEXT.md` — Morosos/debt removal, Caja page, payment recording patterns
- `.planning/phases/64-member-management-enhancements/64-CONTEXT.md` — Excel export pattern (exceljs, blob download)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `el-templo-admin/src/pages/AnaliticasPage.vue`: Date range picker with presets, branch filter, tab pattern — reuse patterns
- `el-templo-admin/src/components/analytics/MiembrosTab.vue`: WhatsApp "Contactar" button pattern (`wa.me/{cleaned_phone}`)
- `el-templo-admin/src/composables/useAnalyticsApi.ts`: API composable pattern for analytics data fetching
- `el-templo-admin/src/composables/useMembersApi.ts`: `exportMembers()` — blob download pattern for Excel export
- `el-templo-admin/src/pages/AlumnosPage.vue`: `onExport()` — createElement('a') download pattern for Excel files
- `el-templo-api/src/modules/members/routes.ts`: Excel export endpoint pattern (exceljs Workbook, styled headers, buffer response)
- `el-templo-api/src/modules/analytics/service.ts`: Aggregation query patterns (date range, branch filter, COUNT, SQL conditions)
- `el-templo-admin/src/types/payment.ts`: `PAYMENT_METHOD_LABELS`, `PAYMENT_METHOD_OPTIONS` — reuse for method filter

### Established Patterns

- Fastify modules: routes.ts + service.ts + schemas.ts + types.ts (Phase 45)
- Constructor DI for services (Phase 56)
- QTable with server-side pagination and @request handler
- QTabs + QTabPanels with lazy loading (watch activeTab → fetch)
- API composables: loading/error refs + async methods + cleanup()
- exceljs ^4.4.0 for server-side Excel generation
- chart.js ^4.5.1 + vue-chartjs ^5.3.3 (not needed for reports — data tables only)

### Integration Points

- `el-templo-api/src/modules/`: New reports module (or extend analytics module) for report data endpoints + export endpoints
- `el-templo-api/src/db/schema/attendance.ts`: attendance table — access log queries (checkedInAt, source, memberId, branchId, scheduleId)
- `el-templo-api/src/db/schema/payments.ts`: payments table — charge history queries (paymentDate, paymentMethod, amount, voidedAt, subscriptionId)
- `el-templo-api/src/db/schema/subscriptions.ts`: subscriptions table — expiry queries (status, endDate, userId)
- `el-templo-admin/src/router/routes.ts`: Add `/reportes` route
- `el-templo-admin/src/layouts/AdminLayout.vue`: Add "Reportes" sidebar item after "Analiticas"
- `el-templo-admin/src/pages/ReportesPage.vue`: New tabbed reports page with 4 tabs

</code_context>

<specifics>
## Specific Ideas

- Reports page is purely data tables + export — no charts or KPIs (that's AnaliticasPage's job)
- Vencimientos and Inactivos reports include WhatsApp shortcut for direct member contact — operational tool for recepcionistas following up
- Configurable windows (days input) are per-request on the page, not system settings — gives flexibility without admin overhead
- Voided payments should be visually distinct but still visible in Cobros report for audit trail

</specifics>

<deferred>
## Deferred Ideas

- **REPORT-03 (Debt report):** N/A — debt/morosos concept removed in Phase 63. If debt tracking is reintroduced in future, this report can be added.
- **Renewal rate statistic (tasa de renovación):** Noted as deferred from Phase 63 — could be added to AnaliticasPage or Reportes in a future phase.
- **Scheduled email reports:** Auto-send weekly/monthly report summaries — deferred from Phase 52.
- **PDF export:** Generate PDF versions of reports — not needed now, Excel is sufficient.

</deferred>

---

_Phase: 65-reports-dashboard_
_Context gathered: 2026-03-18_
