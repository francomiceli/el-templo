# Phase 51: Scheduling - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Coaches manage class schedules with capacity limits, and members can browse available slots and reserve/cancel spots from the app. Covers SCHD-01 through SCHD-06.

Activities are simple (regular class + ROM). The weekly schedule is uniform across branches (same 8 time slots). Admin manages capacity, ROM availability, and holiday cancellations. Members book freely each week up to their plan's class limit.

Analytics are Phase 52. AURA no-show penalties are deferred to v5.0 (AURA-11). Push notifications are future work.

</domain>

<decisions>
## Implementation Decisions

### Activity Model

- Two activity types: regular class (Mon-Fri) and ROM — Range of Movement (Saturday)
- No categories, no color coding — keep it minimal
- Capacity is per-branch, not per-activity: 22 default, 12 for Jujuy and Alem
- Same capacity applies to both regular and ROM classes
- El Templo Park is excluded from scheduling — attendance-only via existing QR system (Phase 50)

### Weekly Schedule Structure

- Weekdays (Mon-Fri): 8 time slots — 7:00, 8:00, 9:00, 10:00, 17:00, 18:00, 19:00, 20:00
- All 1-hour classes
- Same slots at every branch — the schedule is uniform
- Saturday: 2 ROM slots — 8:00, 9:00 — only at branches with ROM enabled
- ROM is a persistent toggle per branch (on until admin changes it, not weekly)

### Admin — Weekly Calendar Grid

- Admin sees a weekly calendar grid: days (Mon-Sat) x time slots, showing occupancy (e.g., 18/22)
- Clicking a cell shows member list for that slot with actions: manually add/remove members
- Branch selector at top (coach sees their branch by default)

### Holiday Cancellations

- Admin can cancel a whole day for holidays
- Per-country holiday calendar (Argentina and Spain — Barcelona Eixample branch opening soon)
- Existing bookings for cancelled days are auto-cancelled silently (no notification)
- Cancelled days show greyed out in the calendar for both admin and members
- Country field needed on branches table for holiday grouping

### Member App — Reservas Tab

- New 4th bottom tab: "Reservas" (alongside Mi Camino, Entrenar, Conceptos)
- Weekly calendar view: compact grid showing Mon-Sat x time slots with occupancy
- Full slots show as "COMPLETO" with waitlist option
- Upcoming reservations card shown at top of the tab ("Tus proximas reservas" with cancel button per booking)

### Booking Flow

- Tap slot → confirm dialog ("Reservar Martes 8:00?" with Confirmar/Cancelar)
- Full slot → "Lista de espera" option instead of reserve
- Waitlist auto-promotes first person when a spot opens (silently — member sees it next app open)

### Booking Time Rules

- Reserve up to 5 minutes before class starts
- Cancel up to 20 minutes before class starts
- Book within current week only (Mon-Sat). New week opens on Monday
- Past slots within the current week are not bookable

### Booking Constraints

- classes_per_week from subscription plan is a hard block — member cannot book beyond limit
- Message when limit reached: "Alcanzaste tu limite semanal (X/X)"
- Overdue members (unpaid subscription) are blocked from booking — same as attendance (Phase 50)
- No active subscription = blocked from booking
- booking_mode field from Net is not used — one model: members pick any available class each week

### No-Show Handling

- No penalty system in this phase — booking stays as no-show status for records
- Coach confirmation (Phase 50 two-step model) naturally handles it: no QR scan = no confirmation = no AURA
- AURA deduction penalty deferred to v5.0 AURA economy (captured as AURA-11 in REQUIREMENTS.md)

### Claude's Discretion

- Weekly calendar grid component design and library choice (QTable-based or custom grid)
- Waitlist ordering and auto-promotion implementation (FIFO)
- Holiday management UI (inline in schedule page or separate settings section)
- How country field is added to branches (migration scope)
- Attendance table schedule_id FK migration (linking check-ins to booked slots)
- API route structure within the scheduling module
- Migration naming, indexes, and field types
- Error states and loading patterns
- Whether to seed the standard 8 weekday slots automatically per branch or require admin setup

</decisions>

<specifics>
## Specific Ideas

- El-Templo-Net's scheduling system (schedules, activities, bookings, plan_activities tables) used as reference — but simplified since El Templo has a uniform schedule (no per-branch custom slots, no activity categories)
- The weekly grid view was chosen for both admin and member app — coaches see occupancy at a glance, members see availability
- Fixed booking_mode from Net is irrelevant — El Templo uses one simple model where members freely pick slots each week
- Country-aware holidays are critical for the Argentina/Spain split — the Barcelona Eixample branch is opening soon, and this affects holidays system-wide

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `el-templo-api/src/modules/attendance/service.ts`: AttendanceService — will need schedule_id FK integration
- `el-templo-api/src/modules/payments/service.ts`: PaymentService.getMemberBalance().isOverdue — reuse for booking block
- `el-templo-api/src/modules/subscriptions/service.ts`: SubscriptionService — check classes_per_week for booking limit
- `el-templo-api/src/db/schema/subscription-plans.ts`: Has bookingMode and classesPerWeek fields already
- `el-templo-admin/src/pages/AsistenciaHoyPage.vue`: Reference for branch-scoped admin page pattern
- `el-templo-admin/src/composables/`: API composable pattern for useScheduleApi
- `El-Templo-Net/packages/db/src/schema/schedules.ts`: Reference schedule schema (day_of_week, start_time, end_time, max_capacity)
- `El-Templo-Net/packages/db/src/schema/bookings.ts`: Reference booking schema (member_id, schedule_id, booking_date, status)
- `El-Templo-Net/packages/db/src/schema/activities.ts`: Reference activity schema (simplified for El Templo)
- `El-Templo-Net/apps/api/src/routes/schedule-slots.ts`: Reference CRUD routes with enrollment count subqueries

### Established Patterns

- Fastify modules: routes.ts + service.ts + schemas.ts + types.ts with barrel export (Phase 45)
- QTable with server-side pagination (Phase 47)
- QDialog for forms and confirmations (Phase 47/48)
- Constructor DI for services (Phase 45 AuraService, Phase 48 SubscriptionService)
- Member app: Pinia stores with composition API, composables with cleanup()
- Bottom tab navigation in member app MainLayout.vue (currently 3 tabs, adding 4th)
- Admin sidebar navigation in AdminLayout.vue

### Integration Points

- `el-templo-api/src/db/schema/`: New files — activities.ts, schedules.ts, bookings.ts, holidays.ts
- `el-templo-api/src/db/schema/branches.ts`: Add country field for holiday grouping
- `el-templo-api/src/db/schema/attendance.ts`: Add schedule_id FK column
- `el-templo-api/src/modules/scheduling/`: New module (routes, service, schemas, types, index)
- `el-templo-admin/src/router/routes.ts`: Add /horarios route
- `el-templo-admin/src/layouts/AdminLayout.vue`: Add "Horarios" sidebar item (between Planes and Asistencia)
- `el-templo-admin/src/pages/HorariosPage.vue`: New weekly calendar grid page
- `el-templo-app/src/router/routes.ts`: Add /reservas route
- `el-templo-app/src/layouts/MainLayout.vue`: Add 4th bottom tab "Reservas"
- `el-templo-app/src/pages/ReservasPage.vue`: New weekly calendar + booking page
- Migrations: activities, schedules, bookings, holidays tables + branches.country + attendance.schedule_id

</code_context>

<deferred>
## Deferred Ideas

- **AURA no-show penalty** — Deduct AURA when member books but doesn't attend. Deferred to v5.0 AURA economy (captured as AURA-11 in REQUIREMENTS.md). Surfaced during Phase 51 discussion.
- **Push notifications for waitlist** — When auto-promoted from waitlist, notify member via push. Deferred until push notification infrastructure is built.
- **Park user benefits** — El Templo Park users track attendance via QR (Phase 50). Future benefits for frequent park users. Deferred to future phase.
- **Country-aware system beyond holidays** — Barcelona branch means timezone, locale, and currency considerations beyond just holidays. Note for broader architecture when relevant.

</deferred>

---

_Phase: 51-scheduling_
_Context gathered: 2026-03-10_
