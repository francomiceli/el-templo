# Phase 49: Payments - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Coaches can record payments, view payment history per member and globally, identify overdue members at a glance, and see financial summary metrics. Covers PAY-01 through PAY-04.

Online payment gateway (Mercado Pago/Stripe) is v6.0+. Charts/trends/deep analytics are Phase 52 (Analytics Dashboard). Attendance enforcement of overdue status is Phase 50.

</domain>

<decisions>
## Implementation Decisions

### Payment Recording Model

- Flat payments only — no installment/cuota tracking. Installments are a gateway concern (v6.0+)
- Payment methods: cash, transfer, card (3 methods, same as Net)
- Payments linked to subscription via subscription_id FK. Null subscription_id allowed for one-off payments (merch, events)
- Integer pesos (consistent with subscriptions — no decimals)
- Void with reason: admin can void a payment (voided_at, voided_by, void_reason). Voided payments excluded from balance calculations but kept in history
- Schema: id, member_id, subscription_id (nullable), amount, payment_method (enum: cash/transfer/card), payment_date, reference (optional receipt/transfer ID), notes, recorded_by (FK to users), voided_at, voided_by, void_reason, created_at

### Overdue Detection & Flagging

- Overdue definition: subscription.end_date < today AND SUM(non-voided payments for subscription) < subscription.price_paid
- Derived status — computed on read, not stored as a column
- Partial payments do NOT clear overdue — any remaining balance after end_date = overdue
- Overdue flag prepared for Phase 50 enforcement (QR check-in will check overdue status and reject)

### Overdue Visibility in Admin

- Red "Deuda" badge on member rows in Alumnos list
- Morosos count badge on "Alumnos" sidebar item in the drawer
- Quick filter in Alumnos list to show only overdue members ("Morosos" filter)
- Balance summary on member's Pagos tab (see below)

### Global Pagos Page

- New sidebar item "Pagos" in admin app
- Summary cards at top: Ingresos del mes (monthly revenue), Deudas pendientes (total outstanding), Tasa de cobro (collection rate %) — all scoped by branch filter
- QTable with all payments across all members, server-side pagination
- Filters: branch, payment method, date range (from/to), search by member name
- Columns: fecha, alumno (clickable to profile), monto, metodo, plan, estado (Completado/Anulado), registrado por
- "Registrar Pago" button (pick member via search, then same form dialog)
- Void action in row dropdown

### Member Payment Tab (Pagos tab in AlumnoDetailPage)

- New "Pagos" tab in AlumnoDetailPage (after Suscripcion tab)
- Top: balance summary card — active subscription plan name, price owed (debe), total paid (pagado), remaining balance (restante). Red "DEUDA" badge if overdue, green "AL DIA" badge if fully paid. Only shown if member has/had subscription
- "Registrar Pago" button on balance card
- Below: payment history table — columns: fecha, monto, metodo, estado (Completado/Anulado badge), registrado por. Void action in row dropdown. Voided rows shown muted/strikethrough
- Reference and notes visible on row expand or tooltip (not as table columns)

### Register Payment Dialog

- Simple one-step QDialog (not wizard): amount (pre-filled with remaining balance), payment method dropdown (cash/transfer/card), date (defaults to today), reference (optional), notes (optional)
- Same dialog used from member Pagos tab (member pre-filled) and from global Pagos page (member search field added)

### Claude's Discretion

- Exact overdue computation implementation (API endpoint vs service method vs computed in query)
- How to surface morosos count in sidebar (polling interval, SSE, or computed on page load)
- Payment history sort order and pagination defaults
- Error states and loading patterns
- Migration naming and field types (varchar lengths, etc.)
- Whether to add a payment_status enum (completed/voided) or derive from voided_at presence
- Global Pagos page layout and filter component design
- How to integrate the "Morosos" filter into existing Alumnos list filters

</decisions>

<specifics>
## Specific Ideas

- El-Templo-Net's payments system (Hono/PostgreSQL) used as reference for data model and UI patterns — features rebuilt in Fastify/MySQL + Vue/Quasar
- Net uses centavos (integer cents); El Templo uses whole pesos (integer, no decimals) — simpler
- Net has installments for credit card (3 cuotas); El Templo defers installments to v6.0+ payment gateway phase
- Net's balance calculation: totalOwed = subscription.pricePaid, totalPaid = SUM(payments), remaining = MAX(0, owed - paid) — same approach here
- Net does NOT enforce overdue (no access blocking); El Templo will enforce via Phase 50 QR check-in
- Overdue members can't use facilities — enforcement deferred to Phase 50 (Attendance), but the flag/computation lives in Phase 49

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `el-templo-api/src/modules/subscriptions/service.ts`: SubscriptionService with lifecycle management — payments service follows same pattern (constructor DI, custom error classes, row mappers)
- `el-templo-api/src/modules/subscriptions/schemas.ts`: Fastify JSON schema pattern for request/response validation
- `el-templo-api/src/db/schema/subscriptions.ts`: Subscription schema with pricePaid, priceTypeApplied — payments FK to this
- `el-templo-admin/src/components/MemberSubscriptionTab.vue`: Tab component pattern with balance card, action buttons, history list — template for MemberPaymentTab
- `el-templo-admin/src/pages/AlumnoDetailPage.vue`: Tabbed profile hub — add "Pagos" tab after "Suscripcion"
- `el-templo-admin/src/composables/useSubscriptionsApi.ts`: API composable pattern — template for usePaymentsApi
- `El-Templo-Net/packages/db/src/schema/payments.ts`: Reference payment schema (adapt for MySQL/Drizzle)
- `El-Templo-Net/apps/api/src/routes/payments.ts`: Reference payment routes (register, void, member history, global list, balance calc)
- `El-Templo-Net/apps/web/src/app/(dashboard)/pagos/`: Reference global payments page UI

### Established Patterns

- Fastify modules: routes.ts + service.ts + schemas.ts + types.ts with barrel export (Phase 45)
- QTable with server-side pagination and @request handler (Phase 47 members list)
- QDialog for forms (Phase 47 MemberFormDialog, Phase 48 AssignPlanDialog)
- Auto-expire on read pattern (Phase 48 subscriptions) — similar derived-status approach for overdue
- Integer prices, no decimals (Phase 48)
- Vue 3 Composition API with `<script setup>` throughout admin app
- API composables: export loading/error refs + async methods + cleanup()

### Integration Points

- `el-templo-api/src/db/schema/`: New `payments.ts` schema file
- `el-templo-api/src/modules/payments/`: New module (routes, service, schemas, types, index)
- `el-templo-api/src/modules/members/`: Extend to include overdue status in member list queries
- `el-templo-admin/src/pages/AlumnoDetailPage.vue`: Add "Pagos" tab
- `el-templo-admin/src/components/MemberPaymentTab.vue`: New tab component
- `el-templo-admin/src/pages/PagosPage.vue`: New global payments page
- `el-templo-admin/src/composables/usePaymentsApi.ts`: New API composable
- `el-templo-admin/src/router/routes.ts`: Add /pagos route
- `el-templo-admin/src/layouts/AdminLayout.vue`: Add "Pagos" sidebar item + morosos badge on "Alumnos" item
- Migration: payments table

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 49-payments_
_Context gathered: 2026-03-09_
