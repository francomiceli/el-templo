# Phase 63: Cash Box - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Rename PagosPage to "Caja", add per-payment-method revenue summary, integrate payment recording into plan assignment/renewal flows, build subscription renewal, remove dead debt/morosos concepts, and open the page to recepcionista role. Cash box tracks subscription-linked payments only — no expenses, no general cash flow.

Requirements: CASH-02, CASH-03

</domain>

<decisions>
## Implementation Decisions

### Cash Box = Enhanced PagosPage (Renamed to Caja)

- PagosPage renamed to CajaPage at route `/caja`
- Sidebar item: "Pagos" → "Caja", same position, open to recepcionista + admin + superadmin (no coaches)
- Single page layout: summary cards on top, transaction list below (no tabs)
- Cash box is a **read-only view** over existing payments table — no separate cash box entity or recording mechanism
- Only shows payments with `subscriptionId IS NOT NULL` (subscription-linked payments only)
- Voided payments **excluded entirely** from the cash box view

### Summary Cards (Per-Method Breakdown)

- Replace old 3 summary cards (Ingresos del mes, Deudas pendientes, Tasa de cobro) with per-method cards:
  - **Efectivo** ($X), **Transferencia** ($Y), **Tarjeta** ($Z), **Total** ($sum)
- Branch filter affects both summary and transaction list (includes "all branches" option)
- **Month picker** for period selection (defaults to current month)
- Reuse existing `getFinancialSummary` API with subscription-only filter added

### "Egresos" Placeholder

- Section below transaction list with "Próximamente" badge
- No functionality — just a visual placeholder hinting at future expense tracking (CASH-01, CASH-04 in v4.2+)

### Payment Recording Integrated into Plan Operations

- Remove standalone `RegisterPaymentDialog` entirely (delete component and all references)
- Remove "Registrar Pago" button from Caja page and member profile
- Payment method selector added to **AssignPlanDialog confirm step** (field, not new step): Efectivo / Transferencia / Tarjeta — required field
- When plan is assigned or changed, payment is auto-recorded with the selected method
- Amount locked to subscription's final price (no partial payments, no manual amount entry)

### Subscription Renewal Flow

- "Renovar" button on `MemberSubscriptionTab` (next to existing "Cambiar Plan" action)
- Only visible when member has an existing subscription (active or recently expired)
- **Simple QDialog** (not stepper): shows plan name, current end date → new end date, price, payment method selector, confirm button
- Renewal = **extend existing subscription's endDate** by plan's durationDays (same record, not new subscription)
- Same plan only — changing to a different plan uses the existing "Cambiar Plan" flow (Phase 64: MEMBER-02)
- Payment auto-recorded with selected method on renewal confirmation
- **Fixed plans**: keep same schedule slot assignments, auto-generate new bookings for the extended period
- Admin can change fixed slots separately via an edit action (not during renewal)

### Member Profile Cleanup

- **Remove MemberPaymentTab** (Pagos tab) entirely from AlumnoDetailPage
- Payment info (method, date, amount) merged into the subscription card on MemberSubscriptionTab
- No balance card, no deuda/al-día badges
- Void payment action **only from Caja page** (member profile is read-only for payments)

### Morosos / Debt Concept Removal

- Remove morosos count badge from sidebar Alumnos item
- Remove "Morosos" filter from Alumnos list
- Remove API endpoints: `getOverdueMembers`, `getMorososCount`, `getMemberBalance`
- Remove overdue computation logic from PaymentService
- Remove balance card component and related frontend code

### Schema Changes

- `payments.subscriptionId`: change from nullable to **NOT NULL** (no real production data yet)
- No new tables needed — cash box reads from existing payments table

### Claude's Discretion

- Financial summary API filter implementation for subscription-only payments
- Month picker component implementation
- "Egresos" placeholder section design
- Payment method field placement within AssignPlanDialog confirm step
- Renewal dialog layout and field arrangement
- How payment info displays within the subscription card (inline fields, expandable section, etc.)
- Migration strategy for subscriptionId NOT NULL change
- How to regenerate fixed-plan bookings on renewal (extend existing bulk generation logic)
- Transaction list columns and filters for the renamed Caja page
- Order of cleanup operations (frontend first vs backend first)

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above.

### Phase context

- `.planning/REQUIREMENTS.md` — CASH-02, CASH-03 requirements (v4.1 scope)
- `.planning/phases/49-payments/49-CONTEXT.md` — Original payment infrastructure decisions (payment methods, recording, voiding)
- `.planning/phases/61-qr-access-control/61-CONTEXT.md` — Fixed schedule slots, auto-booking generation patterns

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `el-templo-api/src/modules/payments/service.ts`: PaymentService with `getFinancialSummary` (revenue by method/branch) — extend with subscription-only filter
- `el-templo-api/src/modules/payments/routes.ts`: Existing payment list and summary endpoints — modify for Caja needs
- `el-templo-admin/src/pages/PagosPage.vue`: Rename to CajaPage, replace summary cards with per-method breakdown, add month picker
- `el-templo-admin/src/components/AssignPlanDialog.vue`: Add paymentMethod field to confirm step, wire payment recording into assign/change flows
- `el-templo-admin/src/components/MemberSubscriptionTab.vue`: Add "Renovar" button, add payment info display, host renewal dialog
- `el-templo-admin/src/types/payment.ts`: `PAYMENT_METHOD_LABELS`, `PAYMENT_METHOD_COLORS`, `PAYMENT_METHOD_OPTIONS` — reuse in all new method selectors
- `el-templo-admin/src/composables/usePaymentsApi.ts`: API composable for payment operations
- `el-templo-api/src/modules/subscriptions/service.ts`: SubscriptionService — extend with renewal logic (extend endDate + regenerate bookings)
- `el-templo-api/src/modules/scheduling/booking-service.ts`: Bulk booking generation for fixed plans — reuse for renewal booking extension

### Established Patterns

- Fastify modules: routes.ts + service.ts + schemas.ts + types.ts (Phase 45)
- Constructor DI for services (Phase 56)
- QTable with server-side pagination and @request handler
- QDialog for simple forms, QStepper for multi-step flows
- Vue 3 Composition API with `<script setup>` throughout admin
- API composables: loading/error refs + async methods + cleanup()
- Integer pesos, no decimals (Phase 48)

### Integration Points

- `el-templo-api/src/db/schema/payments.ts`: Change subscriptionId to NOT NULL
- `el-templo-api/src/modules/payments/service.ts`: Remove overdue/morosos methods, add subscription-only filter to summary
- `el-templo-api/src/modules/payments/routes.ts`: Remove morosos/balance endpoints, update summary endpoint
- `el-templo-api/src/modules/subscriptions/service.ts`: Add renewSubscription method (extend endDate + record payment + regenerate bookings)
- `el-templo-api/src/modules/subscriptions/routes.ts`: Add renewal endpoint
- `el-templo-admin/src/pages/PagosPage.vue` → `CajaPage.vue`: Rename, new summary cards, month picker, branch filter
- `el-templo-admin/src/router/routes.ts`: `/pagos` → `/caja`, update allowedRoles to include recepcionista
- `el-templo-admin/src/layouts/AdminLayout.vue`: Rename sidebar item, update role check
- `el-templo-admin/src/components/AssignPlanDialog.vue`: Add paymentMethod to confirm step + wire to API
- `el-templo-admin/src/components/MemberSubscriptionTab.vue`: Add "Renovar" button + payment info display
- Delete: `RegisterPaymentDialog.vue`, `MemberPaymentTab.vue`
- `el-templo-admin/src/pages/AlumnoDetailPage.vue`: Remove Pagos tab

</code_context>

<specifics>
## Specific Ideas

- Caja summary should match current PagosPage layout style but with the 4 per-method cards instead of the old 3
- Month picker is simpler than from/to date pickers — better UX for monthly reconciliation workflow
- Renewal dialog should be as simple as possible — recepcionistas process many renewals, minimize clicks
- "Egresos — Próximamente" section gives staff confidence the system will grow without overwhelming them now
- Renewal percentage statistic (tasa de renovación) is a valuable metric — defer to Reports phase (65)

</specifics>

<deferred>
## Deferred Ideas

- Expense/cash-flow tracking (CASH-01: fondo de caja, CASH-04: difference tracking) — v4.2+
- Renewal percentage statistic (tasa de renovación) — Phase 65 (Reports)
- Plan change on renewal (different plan) — Phase 64 (MEMBER-02: subscription change workflow)
- Edit fixed schedule slots independently of renewal — could be added to Phase 64 or as separate enhancement

</deferred>

---

_Phase: 63-cash-box_
_Context gathered: 2026-03-17_
