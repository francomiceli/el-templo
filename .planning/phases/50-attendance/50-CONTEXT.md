# Phase 50: Attendance - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Members check in at branches by scanning a static QR code, coaches batch-confirm attendance after class, confirmed check-ins award AURA, and coaches can view/manage attendance records. Covers ATTN-01 through ATTN-05.

Class scheduling (activities, recurring slots, reservations, capacity) is Phase 51. Schedule linking to attendance is Phase 51. Analytics are Phase 52. Templo Online members are excluded from attendance (no physical branch).

</domain>

<decisions>
## Implementation Decisions

### Two-Step Check-in Model (Anti-fraud)

- Step 1 — Member scans static QR at branch → attendance record created with status "registrado"
- Step 2 — Coach batch-confirms after class → status changes to "confirmado", AURA awarded
- This prevents QR photo sharing fraud — coach is the validation layer, not technology
- Manual check-ins by coach are auto-confirmed (no two-step for fallback)

### QR Code System

- Static QR per branch — printed poster at the door, generated once by admin
- QR encodes a signed token (HMAC with API secret) containing branchId and type "checkin"
- Server validates signature before accepting check-in — prevents forged QR codes
- Admin generates/downloads QR from admin app (one-time per branch)
- Templo Online branch has no QR (virtual branch, no physical attendance)

### Member App — QR Scanner

- Floating "Registrar asistencia" button/FAB on home screen
- Hidden for members assigned to Templo Online branch (no physical attendance)
- Tapping opens camera scanner, reads QR, sends check-in request
- On success: show "Asistencia registrada" (instant success, no mention of pending/coach confirmation)
- On overdue/blocked: show error message (see overdue enforcement below)
- Requires adding a barcode/QR scanning plugin to Capacitor app

### Overdue Enforcement

- Overdue members are BLOCKED from checking in (Phase 49 decision: overdue = can't use facilities)
- Check-in API calls PaymentService.getMemberBalance() — if isOverdue, reject with "Tu suscripción tiene un pago pendiente. Acercate a recepción."
- Also blocked: no active subscription, expired subscription
- No attendance record created for blocked members

### AURA Awards

- 10 AURA per confirmed check-in (stored in aura_config table, adjustable)
- AURA awarded ONLY on coach confirmation (not on QR scan)
- Uses existing AuraService.award() with sourceType "attendance", referenceId = attendance record ID
- One check-in per member per day — prevents duplicate scans and double AURA

### Check-in Constraints

- Max 1 check-in per member per day
- Branch enforcement: single-branch plan members can ONLY check in at their assigned branch. Multi-branch plan members can check in at any branch
- No schedule/class linking — Phase 50 records branch-level attendance only. schedule_id column deferred to Phase 51
- Attendance table: member_id, branch_id, checked_in_at, confirmed_at, status (registrado/confirmado), source (qr/manual)

### Admin — Batch Confirmation Page

- "Asistencia Hoy" page in admin app showing today's check-ins for coach's branch
- List of members who scanned QR: checkboxes (all checked by default), name, scan time, source indicator (QR/manual)
- Coach unchecks anyone who didn't actually attend
- "Confirmar Asistencia" button confirms all checked members, awards AURA
- "+ Agregar alumno" button for manual fallback — search by name/DNI, add to today's list as auto-confirmed

### Admin — Attendance Records (ATTN-05)

- "Asistencia" tab on member profile (AlumnoDetailPage) — member's attendance history with date, branch, status
- The "Asistencia Hoy" page serves as today's records view and batch confirm
- No separate global attendance history page — Phase 52 Analytics covers aggregate views

### Claude's Discretion

- QR scanning plugin choice (Capacitor plugin or web-based library)
- QR generation approach (server-side or client-side in admin app)
- Attendance table indexes and migration details
- Batch confirmation UI layout and component design
- How "Asistencia Hoy" page filters by branch (coach's branch auto-selected or dropdown)
- Member app scanner UI design and camera permissions flow
- Error states and loading patterns
- Whether to add a sidebar item for "Asistencia Hoy" or nest it differently

</decisions>

<specifics>
## Specific Ideas

- El-Templo-Net's attendance system (Hono/PostgreSQL) used as reference — but Net doesn't have two-step confirmation or AURA awards. Net's check-in is single-step with subscription status warnings
- The two-step model (registrado → confirmado) is El Templo's anti-fraud innovation — coach validates physical presence
- Member sees instant success on scan ("Asistencia registrada") without knowing about the pending confirmation step — clean UX
- Manual check-ins skip the two-step process — coach adding someone manually IS the confirmation

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `el-templo-api/src/modules/aura/service.ts`: AuraService.award() with sourceType "attendance" pre-configured — direct integration
- `el-templo-api/src/modules/payments/service.ts`: PaymentService.getMemberBalance().isOverdue — call before allowing check-in
- `el-templo-api/src/modules/subscriptions/service.ts`: SubscriptionService for checking active subscription status
- `el-templo-admin/src/pages/AlumnoDetailPage.vue`: Tabbed profile hub — add "Asistencia" tab
- `el-templo-admin/src/composables/`: API composable pattern for useAttendanceApi
- `El-Templo-Net/packages/db/src/schema/attendance.ts`: Reference attendance schema
- `El-Templo-Net/apps/api/src/routes/attendance.ts`: Reference check-in routes
- `El-Templo-Net/apps/web/src/app/(dashboard)/asistencia/`: Reference admin attendance UI

### Established Patterns

- Fastify modules: routes.ts + service.ts + schemas.ts + types.ts with barrel export (Phase 45)
- QTable with server-side pagination (Phase 47)
- QDialog for forms (Phase 47/48)
- Constructor DI for services (Phase 45 AuraService, Phase 48 SubscriptionService)
- Member app: Pinia stores with composition API, composables with cleanup()

### Integration Points

- `el-templo-api/src/db/schema/`: New `attendance.ts` schema file
- `el-templo-api/src/modules/attendance/`: New module (routes, service, schemas, types, index)
- `el-templo-api/src/modules/payments/service.ts`: Import for overdue check
- `el-templo-api/src/modules/aura/service.ts`: Import for AURA award on confirmation
- `el-templo-admin/src/pages/AlumnoDetailPage.vue`: Add "Asistencia" tab
- `el-templo-admin/src/pages/AsistenciaHoyPage.vue`: New batch confirmation page
- `el-templo-app/src/`: New check-in screen/composable + QR scanner plugin
- `el-templo-app/package.json`: Add barcode scanner Capacitor plugin
- Migration: attendance table

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Schedule linking (schedule_id on attendance) explicitly deferred to Phase 51.

</deferred>

---

_Phase: 50-attendance_
_Context gathered: 2026-03-09_
