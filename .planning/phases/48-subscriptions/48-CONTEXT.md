# Phase 48: Subscriptions - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Coaches can create and manage subscription plans, assign them to members with pricing calculations (including discounts), and track subscription lifecycle (active/paused/cancelled/expired). Members can view their current plan and status in the app. Covers SUBS-01 through SUBS-05.

Payments (recording, history, overdue tracking) are Phase 49. Attendance and scheduling are Phases 50-51.

</domain>

<decisions>
## Implementation Decisions

### Plan Model

- Full Net field set with tiers: name, description, plan_tier (flex/foundation/performance/other), booking_mode (fixed/flexible), price_regular, price_zero, price_credit_card, duration_days, classes_per_week, multi_branch, is_trial, is_group, group_max_members, is_active
- Plan tiers kept: flex, foundation, performance, other — same as Net
- Booking mode included: fixed vs flexible — feeds into Phase 51 scheduling enforcement
- Plans are global (not per-branch) — defined once, available at all branches
- Prices stored as integer whole pesos (no decimals in the economy, no centavos)
- Duration is flexible: admin sets any number of days (not restricted to presets)
- Admin Plans page with full CRUD (SUBS-01) — dedicated sidebar item "Planes", not nested under Alumnos

### Pricing Engine

- Boarding pass: admin-applied one-time discount (not automatic for all new members). Uses price_zero column. Tracked with boarding_pass_used flag on member so it can only be applied once
- Tier conversion discount: when member upgrades from flex to foundation/performance, system suggests price_zero for first month on new plan. Admin can accept or override
- AURA discounts: members SPEND AURA to get subscription discounts (not passive milestones). Fixed AURA-to-discount tiers (e.g., spend 500 AURA = 5% off, 1000 = 10%, 2000 = 20%). AURA is deducted from balance via AuraService
- Price override: admin can set any custom price with a required reason field (covers family discounts, staff pricing, special deals)
- Assign-plan flow: step-based QDialog — 1) Select plan (grouped by tier) 2) Pricing preview with discount options (boarding pass eligibility, tier conversion, AURA spend tiers) 3) Confirm. Mirrors Net's proven UX

### Subscription Lifecycle

- Full lifecycle: active → paused → resumed, active → cancelled, active → expired (auto)
- Auto-expire on read: when fetching subscriptions, auto-set status='expired' for any where end_date < today. No cron job
- One active/paused subscription max per member — enforced at DB level (unique constraint)
- Pause extends end_date: track paused_at, when resumed add paused duration to end_date so member doesn't lose paid time
- Subscription fields mirror Net: member_id, plan_id, branch_id, status, start_date, end_date, price_paid, price_type_applied (regular/zero/credit_card), discount info, paused_at, resumed_at, cancelled_at, price_override_reason, notes

### Admin UI — Plans Management

- Dedicated "Planes" sidebar item in admin app
- QTable with plan list: name, tier, price, duration, classes/week, status (active/inactive)
- Create/edit plan via QDialog (same modal pattern as member create/edit)
- Deactivate plans (soft delete) — don't delete, just hide from assignment

### Admin UI — Member Subscription Tab

- New "Suscripción" tab in AlumnoDetailPage (after Notas, before future Pagos/Asistencia tabs)
- Top: active subscription card — plan name, tier badge, status badge, dates (start/end with days remaining), price paid, price type, discount info, override reason if present
- Actions on active card: Pause (with optional notes), Cancel (with optional notes)
- Actions on paused card: Resume, Cancel
- "Asignar Plan" button when no active subscription — opens step-based assign dialog
- Below: subscription history timeline showing all past subscriptions (most recent first)

### Member App — Subscription View

- In member profile/account page: read-only card showing plan name, status badge (Activo/Pausado/Expirado/Cancelado), start/end dates, days remaining
- No actions — member can only view, not modify

### Claude's Discretion

- Plan-activity link: whether to include plan_activities join table now or defer to Phase 51
- AURA discount tier thresholds and percentages (exact values)
- Plan form field layout and grouping in QDialog
- Subscription history timeline component design
- API route structure within the subscriptions module
- Migration naming and field types (varchar lengths, etc.)
- Error states and loading patterns
- Member app card styling and placement within profile page
- Whether price_credit_card column is needed now or can wait for Phase 49 (payments)
- Pricing engine service architecture (standalone lib vs module service)

</decisions>

<specifics>
## Specific Ideas

- El-Templo-Net's subscription system (Hono/PostgreSQL) used as reference for data model, pricing engine, and UI patterns — features rebuilt in Fastify/MySQL + Vue/Quasar
- Net's pricing engine (boarding pass + tier conversion) adapted: boarding pass is admin-selective (not auto for all new members), tier conversion kept as-is
- AURA discounts are a spend mechanic (members spend AURA for price reduction), not passive milestones — uses existing AuraService.spend() from Phase 45
- Step-based assign dialog mirrors Net's proven UX: plan selection → pricing preview → confirmation
- Active subscription card mirrors Net's component: status badges, date countdown, action buttons contextual to status

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `el-templo-api/src/modules/aura/service.ts`: AuraService with award/spend/getBalance — AURA discount spending will use this
- `el-templo-api/src/db/schema/aura-config.ts`: Has `subscription_discount` source type pre-configured
- `el-templo-api/src/modules/members/`: Members CRUD module — establishes pattern for subscriptions module
- `el-templo-admin/src/pages/AlumnoDetailPage.vue`: Tabbed profile hub — add Suscripcion tab here
- `el-templo-admin/src/components/MemberFormDialog.vue`: Dialog pattern for CRUD — reuse for plan and assign dialogs
- `El-Templo-Net/apps/api/src/lib/pricing-engine.ts`: Reference pricing logic (boarding pass + tier conversion)
- `El-Templo-Net/packages/db/src/schema/subscriptions.ts`: Reference subscription data model
- `El-Templo-Net/packages/db/src/schema/plans.ts`: Reference plan data model with tiers

### Established Patterns

- Fastify modules: routes.ts + service.ts + schemas.ts + types.ts with barrel export (Phase 45)
- QTable with server-side pagination and @request handler (Phase 47 members list)
- QDialog for create/edit forms (Phase 47 MemberFormDialog)
- Vue 3 Composition API with `<script setup>` throughout admin app
- API composables: export loading/error refs + async methods + cleanup()
- Drizzle schema in `src/db/schema/` with module-prefix naming
- Integer prices (no decimals in the economy)

### Integration Points

- `el-templo-api/src/db/schema/`: New files: subscription-plans.ts, subscriptions.ts (possibly discount-rules.ts)
- `el-templo-api/src/modules/subscriptions/`: New module with plans and subscription management
- `el-templo-api/src/db/schema/users.ts`: Add boarding_pass_used, is_first_month flags
- `el-templo-admin/src/router/routes.ts`: Add /planes route for plans management
- `el-templo-admin/src/layouts/AdminLayout.vue`: Add "Planes" sidebar item
- `el-templo-admin/src/pages/AlumnoDetailPage.vue`: Add Suscripcion tab
- `el-templo-app/`: Add subscription card to member profile/account page
- Migration: plans table, subscriptions table, user fields (boarding_pass_used, is_first_month)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 48-subscriptions_
_Context gathered: 2026-03-09_
