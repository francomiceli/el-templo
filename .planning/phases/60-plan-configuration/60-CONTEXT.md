# Phase 60: Plan Configuration - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Subscription plans support real-world variations — weekly class limits with monthly budgets, fixed vs flexible booking modes, multi-branch access, trial flags, grace periods — and the system tracks class usage with enforcement at both booking and check-in. Coach override available when hard blocks occur.

Requirements: PLANS-01, PLANS-02, PLANS-03, PLANS-04, PLANS-05, PLANS-06

</domain>

<decisions>
## Implementation Decisions

### Class Spending Model

- **Plans define classes per week** (e.g., Flex = 2x/week, Flex+ = 6x/week)
- **Monthly budget calculated at subscription start**: `ceil(durationDays / 7) × classesPerWeek` — e.g., 30-day Flex = ceil(30/7) × 2 = 10 classes
- **Two enforcement layers**:
  1. **Weekly limit** (Mon-Sun): Can't attend more than classesPerWeek times in a calendar week. Hard block at weekly limit.
  2. **Monthly budget**: Total classes for the subscription period. Hard block when budget exhausted.
- **All plans track class usage**, even "unlimited" plans (Performance caps at classesPerWeek = 6). No truly unlimited option.
- **One booking per day** — member cannot book two classes in the same day
- **Each confirmed check-in decrements from monthly budget**
- **No weekly reset** — unused weekly classes stay in the monthly pool for later weeks

### Hard Blocks & Coach Override

- **Hard blocks** occur when: weekly limit reached, monthly budget exhausted, or second check-in after subscription expiry
- **All hard blocks lead to coach discussion** — the member talks to the coach in class
- **Coach/admin can force a check-in** with a reason field (e.g., "member will pay tomorrow", "one-time exception")
- **Force check-in** is a manual override action in the admin panel, bypasses all limits

### Grace Period

- **Global setting** — one grace period for the whole system, configurable by superadmin only
- **Default value**: configurable (start with 5 days, admin can change)
- **Setting location**: Card/banner at the top of PlanesPage (no separate settings page)
- **Grace period is invisible to members** — they don't know it exists
- **Behavior after subscription expires**:
  1. During grace period days: Full access, no warning. Completely transparent.
  2. First class after grace period ends: Allowed with warning to coach/admin only (not member). "Suscripción vencida — renovar."
  3. Second class after grace period ends: Hard block. Coach override required.
- **Same rules apply to booking** — booking system follows identical grace period logic as check-in

### Turnos / Booking Restrictions

- **Fixed mode (bookingMode = 'fixed')**:
  - Reception assigns specific days (Lun-Sáb checkboxes) when creating the subscription
  - Member can only book and check in on assigned days
  - Assigned days stored on the subscription record (e.g., `fixedDays: [1, 3, 5]` for Mon/Wed/Fri)
  - Admin can change assigned days anytime — change takes effect immediately, existing bookings on old days get cancelled
- **Flexible mode (bookingMode = 'flexible')**:
  - Member books any available slot, any day
  - Weekly class limit (classesPerWeek) enforces how many per week
  - One booking per day maximum
- **Both booking and check-in enforce** all restrictions (fixed days, weekly limits, monthly budget, grace period)

### Admin UI

- **Plan form (PlanFormDialog)**: No new fields needed — classesPerWeek, multiBranch, isTrial, bookingMode already exist. Form stays as-is.
- **Grace period setting**: Card at the top of PlanesPage with input field and save button. Superadmin-only visibility.
- **Subscription creation dialog**: When assigning a fixed-mode plan, add a step with day checkboxes (Lun, Mar, Mié, Jue, Vie, Sáb). Only shows for fixed plans.
- **Class usage display**: Only in member profile subscription tab — plan name, classes used this week, total remaining, assigned days (if fixed), expiry date. No badges on AlumnosPage list.
- **Member app**: Minimal — just plan name and expiry date. No class tracking visible to members.

### Claude's Discretion

- Migration SQL details and column types
- Budget calculation edge cases (subscription shorter than 7 days, etc.)
- Force check-in UI implementation (button placement, reason field design)
- How to cancel bookings when fixed days change
- Grace period database storage (new table vs column on existing table)
- Class usage weekly reset detection (which day counts as week start)

</decisions>

<specifics>
## Specific Ideas

- Legacy system (El-Templo-Net) has very granular plan config (see `.docs/admin-docs/membresias.txt`) — multi-discipline plans, professor assignment, group memberships, cuota social, revisación médica. All of these are out of scope for this phase but the legacy reference is useful for understanding the business model.
- Real plan data from `.docs/admin-docs/datos-membresias-actuales-templo.txt` — Flex 2x/week $80K, Flex+ up to 6x/week $100K, Foundation 2x/week $250K (4 months), Foundation+ 6x/week $350K (multi-branch), Performance 6x/week $600K (8 months, multi-branch). Three price tiers: regular, zero (promotional), credit card.
- "Precio Zero" applies on first month (Boarding Pass) or when upgrading from monthly to long-term plan

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `subscription-plans.ts` schema: Already has classesPerWeek, bookingMode, multiBranch, isTrial, durationDays, isArchived
- `subscriptions.ts` schema: Has status, startDate, endDate, priceTypeApplied, price override fields
- `PlanFormDialog.vue`: Existing form with all current fields — no new plan fields needed
- `PlanesPage.vue`: QTable with tier badges, price formatting, status badges — add grace period card at top
- `attendance/service.ts`: Check-in flow (QR validation, subscription check, overdue check, branch enforcement) — extend with class limit checks

### Established Patterns

- Drizzle schema with mysqlEnum for enums, nullable int for optional fields
- Facade pattern for subscription service (wraps DB + AuraService)
- Constructor DI for services
- QStepper in dialogs for multi-step flows (used in MemberFormDialog)

### Integration Points

- `subscription-plans` table: No changes needed (classesPerWeek already exists)
- `subscriptions` table: Add classesRemaining (int), fixedDays (json nullable), graceCheckInsAfterExpiry (int default 0)
- `attendance/service.ts`: Add weekly limit check + monthly budget decrement after check-in
- `scheduling/service.ts` (BookingService): Add fixed-day enforcement + weekly limit check at booking time
- New global settings storage: grace period days (DB table or config)
- Admin subscription creation flow: Add fixed-day selector step for fixed-mode plans
- Member profile subscription tab: Add class usage breakdown display

</code_context>

<deferred>
## Deferred Ideas

- Multi-discipline plans (one plan covering multiple activities) — legacy feature, needs activity system rework
- Professor assignment per plan — not needed until coach management phase
- Group/family memberships — legacy feature, complex pricing, separate phase
- Cuota social / revisación médica requirements — club-specific, not applicable
- Time-window restrictions on plans (morning-only, specific hours) — could be added later
- Member app class tracking display — keep minimal for now, expand when member app gets more features

</deferred>

---

_Phase: 60-plan-configuration_
_Context gathered: 2026-03-16_
