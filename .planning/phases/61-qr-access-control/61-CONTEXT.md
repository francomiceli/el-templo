# Phase 61: Subscription & Attendance Rework - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Rework Phase 50's attendance model and Phase 60's fixed schedule system. Remove grace period entirely, auto-confirm QR check-ins (eliminating two-step model), and replace day-checkbox fixed schedules with specific class slot reservations that auto-generate bookings for the subscription period. Add attendance visibility inside the Horarios page per class slot.

Requirements reshaped from: ACCESS-01 through ACCESS-05 (original kiosk scope dissolved).
Also addresses rework of Phase 50 (attendance) and Phase 60 (plan configuration).

</domain>

<decisions>
## Implementation Decisions

### Grace Period Removal

- Remove ALL grace period code — zero tolerance on expired subscriptions
- Expired subscription = immediate hard block for check-in AND booking
- Remove: `graceCheckInsAfterExpiry` column on subscriptions, grace period system setting, `SettingsService` dependency in `AttendanceService`, grace period card on `PlanesPage`, `getSubscriptionWithGracePeriod` method
- Migration: drop column, remove setting row, update existing records if needed

### Fixed Schedules → Specific Class Slot Reservations

- Fixed plans no longer use day checkboxes (`fixedDays` JSON array) — admin picks **specific schedule slots** (e.g., "Calistenia Lun 18:00, Funcional Mié 20:00")
- Number of selected slots **must match exactly** `classesPerWeek` from the plan (validated)
- Only class slots with **available capacity** are offered during subscription creation
- System **auto-generates bookings** for the entire subscription period when subscription is created
- UI: Weekly schedule grid in subscription creation dialog showing the branch's schedule. Full slots hidden. Admin taps to select.
- Remove `fixedDays` JSON column, replace with slot references (schedule IDs stored on subscription or dedicated table)

### Fixed-Plan Booking Cancellation

- When subscription is cancelled or changed: cancel **future bookings only** (tomorrow onwards). Past bookings stay as historical records.

### Holiday Handling (Fixed Plans Only)

- When auto-generating bookings: **skip dates that fall on holidays**, give member a **replacement class credit** to book any other slot that week
- If a holiday is created **after** bookings were already generated: cancel the affected booking, **alert the member** they have a replacement class to use
- **Flexible plans**: holidays simply don't appear as bookable slots in the member app. No conflict handling needed.

### QR Auto-Confirm (Two-Step Model Eliminated)

- QR scan immediately creates attendance with status **"confirmado"** — no more registrado → coach confirms flow
- **AURA awarded immediately** on scan (10 AURA per check-in, from `aura_config` table)
- **Remove "registrado" status** from attendance enum entirely. Migration updates existing registrado records to confirmado.
- Eliminates: batch confirmation flow, `confirmedAt` as a separate step

### Coach Role in Attendance

- Coach can **undo/correct**: remove a check-in from Horarios page if someone scanned but didn't attend
- Coach can **manually check in** anyone from the Horarios page — this IS the force check-in (same action, one mechanism)
- Manual check-in searches **ALL members** with subscription status warnings displayed
- No separate "Asistencia Hoy" batch confirmation page

### Attendance Visibility in Horarios Page

- Each class slot in Horarios page shows **booking list with attendance status**
- Checked in (QR confirmed): green checkmark with scan time
- Booked but no show: empty checkbox
- **"+ Agregar alumno"** button for manual check-in (coach force check-in)
- This replaces the planned standalone "Asistencia Hoy" page

### One-Per-Day Constraint

- One check-in per day **total** (even for multi-branch plans)
- Multi-branch flag means member can choose WHICH branch on any given day, not attend multiple branches in one day

### No Kiosk Device

- No kiosk/tablet at branch entrance
- Physical banner with static QR per branch (Phase 50's approach) remains the check-in method
- No real-time access log page in admin
- No kiosk welcome screen

### Claude's Discretion

- Migration strategy for removing grace period (column drops, setting cleanup)
- How to implement replacement class credits for holiday conflicts
- How to alert members about holiday-created replacement credits
- Slot picker grid component implementation
- How to efficiently generate bookings for the full subscription period
- How to store fixed schedule slot references (column on subscriptions vs junction table)
- Force check-in reason field UX within the Horarios attendance view

</decisions>

<specifics>
## Specific Ideas

- Fixed-plan slot picker should look like the Horarios page grid — visual and intuitive, not a dropdown list
- "Clases seleccionadas: 2/2" counter enforcing exact match with classesPerWeek
- Holiday replacement: in the future, a WhatsApp bot will handle notifying members about replacement classes — for now, admin resolves manually
- Coach manual check-in from Horarios IS the force check-in — one unified mechanism, no separate admin override flow

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `attendance/service.ts`: Full check-in flow with all enforcement — needs rework (remove grace period, auto-confirm, simplify)
- `shared/qr-token.ts`: QR token generation/validation — stays as-is (static branch QR)
- `attendance` schema: Table structure with status enum, indexes — needs enum change (remove registrado)
- `subscriptions` schema: Has `fixedDays`, `classesRemaining`, `graceCheckInsAfterExpiry` — needs column changes
- `scheduling/booking-service.ts`: Booking creation/cancellation — extend for bulk fixed-plan booking generation
- `scheduling/holiday-service.ts`: Holiday detection — use for filtering during booking generation
- `SlotDetailDialog.vue`: Existing slot detail dialog in admin — extend with attendance status view
- `MemberAttendanceTab.vue`: Member attendance history — stays, but status display simplifies
- `HorariosPage.vue`: Schedule management — integration point for attendance view per slot

### Established Patterns

- Drizzle migrations for schema changes
- Constructor DI for services (AttendanceService, SubscriptionService)
- QTable with server-side pagination
- QStepper in dialogs for multi-step flows (subscription creation)
- Booking status enum pattern (`reservado`, `qr_escaneado`, etc.)

### Integration Points

- `attendance/service.ts`: Remove grace period logic, change status to always "confirmado", award AURA on check-in
- `subscriptions` schema: Remove `fixedDays` and `graceCheckInsAfterExpiry`, add fixed schedule slot references
- `settings/service.ts`: Remove grace period setting methods (may keep service for other settings)
- `PlanesPage.vue`: Remove grace period card
- `MemberFormDialog.vue` / subscription creation: Replace day checkboxes with schedule slot grid picker
- `booking-service.ts`: Add bulk booking generation for fixed-plan subscription period
- `holiday-service.ts`: Integrate with booking generation to skip holidays + create replacement credits
- `SlotDetailDialog.vue` or `HorariosPage.vue`: Add attendance status view per class slot

</code_context>

<deferred>
## Deferred Ideas

- WhatsApp bot for automatic holiday replacement class notifications — future phase
- Kiosk device at entrance — removed from scope, may revisit if branches request it
- Real-time access log dashboard — can be added in Reports phase (65) if needed

</deferred>

---

_Phase: 61-subscription-attendance-rework_
_Context gathered: 2026-03-17_
