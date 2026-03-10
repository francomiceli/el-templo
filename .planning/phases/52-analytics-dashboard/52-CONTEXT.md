# Phase 52: Analytics Dashboard - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Coaches have a unified analytics view showing member, attendance, and financial metrics — all filterable by branch and date range. Covers ANLT-01 through ANLT-04. This is the last phase of v4.0.

No new data collection — analytics aggregate existing data from members (Phase 47), subscriptions (Phase 48), payments (Phase 49), attendance (Phase 50), and scheduling (Phase 51). Admin-only feature in el-templo-admin.

</domain>

<decisions>
## Implementation Decisions

### Dashboard Layout

- Single "/analiticas" page with tabs: Miembros, Asistencia, Finanzas
- 4 KPI summary cards at top (always visible above tabs): Activos, Ingresos, Asistencia/dia, Morosos
- Each KPI card shows the number + trend indicator (up/down arrow with percentage change vs previous period)
- Sidebar item "Analiticas" placed after Horarios/Asistencia, at the bottom of the core operations section
- Icon: analytics or trending_up

### Filters (Global — ANLT-04)

- Branch filter: "Todas las sedes" (default, global aggregate) + individual branch selection
- Date range: month picker as primary, with presets (Este mes, Mes anterior, Ultimos 3 meses, Este ano) plus custom date range option
- Filters persist across tab switches (branch + date apply to all three tabs)
- Note: Barcelona branch operates in EUR — for now all data is ARS. Multi-currency display deferred to when Barcelona goes live

### Member Analytics Tab (ANLT-01)

- Active member count with trend vs previous period
- New members vs churned members (bar chart, monthly comparison)
- Retention rate (percentage of members who renewed vs let subscription expire)
- Plan distribution (bar or pie chart: how many members per plan type — Foundation, Performance, Flex, etc.)
- "Miembros que requieren atencion" actionable list:
  - Members with subscriptions expiring in next 7 days
  - Overdue (morosos) members
  - Each row: name, plan, days until expiry or days overdue
  - Quick inline actions: "Extender" (extends subscription), "Contactar" (opens WhatsApp link with member's phone number)
  - Clicking member name navigates to AlumnoDetailPage

### Attendance Analytics Tab (ANLT-02)

- Daily check-in trend (line chart: check-ins per day over selected period)
- Peak hours heatmap (color-coded HTML table: days x time slots, intensity = average occupancy %)
  - Same grid style as HorariosPage but showing period averages instead of live data
  - Color scale: green (<50%), yellow (50-70%), orange (70-90%), red (>90%)
- Slot occupancy rates (average occupancy per time slot — e.g., "8:00 averages 85% full")
- No-show rate (percentage of bookings where member didn't attend, by slot or overall)
- Data combines both attendance module (QR check-ins) and scheduling module (bookings) for the most complete picture

### Financial Analytics Tab (ANLT-03)

- Leverages existing Phase 49 financial summary endpoint (revenue, outstanding, collection rate, breakdowns)
- Revenue trend (line or bar chart: revenue per month)
- Revenue by payment method breakdown (cash, transfer, card)
- Revenue by branch breakdown (bar chart)
- Outstanding balances total
- Collection rate percentage
- No new financial API endpoints needed — extend existing getFinancialSummary() if needed for trend data

### Chart & Visualization Style

- Clean and functional — not flashy. Professional, consistent with existing Quasar admin style
- Lightweight chart library (Chart.js or vue-chartjs) for bar charts, line charts, and pie/donut charts
- Color-coded HTML table for heatmap (no chart library needed — consistent with HorariosPage grid pattern)
- Quasar QCard components for KPI cards with q-icon for trend arrows
- Tables (QTable) for attention lists and detail breakdowns

### Claude's Discretion

- Chart library choice (Chart.js vs vue-chartjs vs alternative)
- Exact chart configurations, colors, and responsive behavior
- API endpoint structure for analytics aggregation queries
- SQL query optimization for aggregations (indexes, date ranges)
- How to calculate retention rate (which metric: renewal rate, 30-day retention, etc.)
- KPI card layout and styling
- Loading states and empty states for each tab
- Whether to cache analytics results or compute on every request
- How "Extender" quick action works (extend by how many days? Open dialog?)

</decisions>

<specifics>
## Specific Ideas

- El-Templo-Net's reports section (stats cards, revenue charts, occupancy heatmap, churn/retention charts, members-needs-attention list) used as design reference
- The heatmap should visually match the HorariosPage weekly grid — same day x slot structure, but with color intensity showing averages rather than live counts
- "Contactar" action should open WhatsApp deep link with the member's phone number (wa.me/{phone})
- The financial tab mostly reuses Phase 49's existing getFinancialSummary() — may need a new endpoint for monthly trend data across multiple months

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `el-templo-api/src/modules/payments/service.ts`: getFinancialSummary() already returns revenue, outstanding, collection rate, revenue by method/branch — direct reuse for financial tab
- `el-templo-api/src/modules/payments/routes.ts`: GET /payments/summary and GET /payments/morosos — existing endpoints
- `el-templo-api/src/modules/members/service.ts`: listMembers() with filters (branch, active, overdue) — extend for analytics counts
- `el-templo-api/src/modules/attendance/service.ts`: attendance records queryable — need new aggregation methods
- `el-templo-api/src/modules/scheduling/service.ts`: booking data for occupancy and no-show rates — need new aggregation methods
- `el-templo-api/src/modules/subscriptions/service.ts`: subscription lifecycle data for retention calculation
- `el-templo-admin/src/pages/HorariosPage.vue`: weekly grid pattern to reuse for heatmap
- `el-templo-admin/src/pages/AsistenciaHoyPage.vue`: branch selector pattern
- `el-templo-admin/src/composables/`: API composable pattern for useAnalyticsApi
- `El-Templo-Net/apps/web/src/app/(dashboard)/reportes/`: Full reference analytics UI components
- `El-Templo-Net/apps/api/src/routes/dashboard.ts`: Reference dashboard stats API
- `El-Templo-Net/apps/api/src/routes/reports.ts`: Reference reports API with revenue breakdowns
- `El-Templo-Net/apps/api/src/routes/reports-attendance.ts`: Reference attendance analytics API

### Established Patterns

- Fastify modules: routes.ts + service.ts + schemas.ts + types.ts with barrel export (Phase 45)
- QTable with server-side pagination (Phase 47)
- QDialog for forms (Phase 47/48)
- Admin sidebar navigation in AdminLayout.vue
- Quasar QCard for info display cards
- API composables: export loading/error refs + async methods + cleanup()

### Integration Points

- `el-templo-api/src/modules/analytics/`: New module for analytics aggregation routes and service
- `el-templo-api/src/modules/members/service.ts`: Extend with count/trend methods or query from analytics module
- `el-templo-api/src/modules/attendance/service.ts`: Extend with aggregation methods or query from analytics module
- `el-templo-api/src/modules/scheduling/service.ts`: Extend with occupancy/no-show methods or query from analytics module
- `el-templo-admin/src/router/routes.ts`: Add /analiticas route
- `el-templo-admin/src/layouts/AdminLayout.vue`: Add "Analiticas" sidebar item after Horarios
- `el-templo-admin/src/pages/AnaliticasPage.vue`: New tabbed analytics page
- `el-templo-admin/package.json`: Add chart library dependency

</code_context>

<deferred>
## Deferred Ideas

- **Multi-currency display** — Barcelona branch operates in EUR. When it goes live, financial analytics need to handle currency separation or conversion. Deferred to when Barcelona is operational.
- **Export/download** — Export analytics data as CSV or PDF reports. Not in scope for v4.0.
- **Scheduled email reports** — Auto-send weekly/monthly analytics summaries to coaches. Future feature.
- **Real-time updates** — Live-updating dashboard with WebSocket. Not needed — manual refresh is fine.

</deferred>

---

_Phase: 52-analytics-dashboard_
_Context gathered: 2026-03-10_
