---
phase: 102-trial-classes-sesiones-de-prueba
plan: 04
subsystem: admin-ui/scheduling
tags: [admin-ui, scheduling, slot-detail, trial, badge, roster]
requirements: [R5, R6, R9, R10]
wave: 3
one_liner: "Admin can register a trial attendee from SlotDetailDialog via a 3-field modal; roster splits Reservados vs Sesiones de Prueba with PRUEBA badges; capacity chip excludes trials."
dependency_graph:
  requires:
    - "102-02 (POST /api/admin/scheduling/trials + BookingRecord.isTrial on reads)"
  provides:
    - "SlotDetailDialog-driven trial creation flow (entry point at Horarios → slot)"
    - "NewTrialDialog standalone component reusable from any parent with branch/schedule/date context"
    - "UI roster split Reservados vs Sesiones de Prueba (selectors below)"
  affects:
    - "Alumnos detail (Plan 05) — will reuse isTrial on BookingRecord mirror shape added here"
tech_stack:
  added: []
  patterns:
    - "useSchedulingApi.createTrial mirrors the adminAddBooking shape (extractError → error.value, resurfaced via $q.notify)"
    - "Nested q-dialog mounted as a sibling to the SlotDetailDialog q-dialog (Vue 3 allows multiple roots)"
    - "Trial rows reuse the existing booking delete + force-check-in buttons; no new controls added"
key_files:
  created:
    - el-templo-admin/src/components/scheduling/NewTrialDialog.vue
    - .planning/phases/102-trial-classes-sesiones-de-prueba/102-04-SUMMARY.md
  modified:
    - el-templo-admin/src/types/scheduling.ts
    - el-templo-admin/src/composables/useSchedulingApi.ts
    - el-templo-admin/src/components/scheduling/SlotDetailDialog.vue
decisions:
  - "canRegisterTrial = !isPastOrToday || isToday — past (non-today) dates hide the button because trial registration for an already-finished class makes no operational sense"
  - "Trial rows render a PRUEBA badge next to the status badge instead of a dedicated PRUEBA-only row style; keeps visual parity with regular rows and minimizes CSS surface"
  - "Section headers 'Reservados (N)' only render when there is AT LEAST ONE trial AND one regular — this avoids UI churn for the 99% case where a slot has no trials (preserves the existing flat-list look)"
  - "Trial bookings still show the delete button — admins may need to cancel a no-show trial so the user can retry with a different phone; matches the deferred-items note 'Editing a trial booking's date/slot after creation (admin can cancel + recreate)' in SPEC"
  - "onTrialCreated calls refreshAll() (not just loadSlotDetail) to keep the attendance view in sync when the slot is today"
metrics:
  tasks_completed: 4
  tasks_total: 4
  files_created: 2
  files_modified: 3
  duration: "approximately 20 minutes"
  completed_date: 2026-04-22
commits:
  - "35914ab9 feat(102-04): mirror isTrial on BookingRecord + add createTrial composable"
  - "5a27e037 feat(102-04): add NewTrialDialog component for trial creation"
  - "f3f30c09 feat(102-04): integrate trial registration into SlotDetailDialog"
---

# Phase 102 Plan 04: Admin UI — Trial Creation Dialog + Slot Roster Split Summary

## What Shipped

- **`BookingRecord.isTrial: boolean`** mirrored on the admin side
  (`el-templo-admin/src/types/scheduling.ts`), non-optional — matches the
  API type exactly so consumers can destructure without narrowing.
- **`useSchedulingApi().createTrial({...})`** composable method posting to
  `/admin/scheduling/trials` (the axios baseURL prefixes `/api`). Returns
  `{ userId, bookingId }`. Uses the shared `extractError` so a 409
  surfaces the server's Spanish message via `error.value`, which the
  NewTrialDialog reads and renders verbatim in a negative toast.
- **`NewTrialDialog.vue`** — standalone, prop-driven component:
  - Props: `show`, `branchId`, `scheduleId`, `bookingDate` (required);
    `scheduleStartTime`, `branchName` (optional, for context caption).
  - Emits: `update:show`, `created`.
  - Template: three `q-input`s (Nombre, Apellido, Teléfono), Cancelar +
    Crear actions, `persistent` dialog.
  - `canSubmit` requires trimmed lengths > 0 on all three fields and
    `!submitting`.
  - Logger via `createLogger('NewTrialDialog')` — no `console.*`.
  - Form resets on close via `watch(() => props.show)`.
- **`SlotDetailDialog.vue`** integration:
  - **Trial button**: `<q-btn color="warning" icon="star_outline"
label="Nueva Sesión de Prueba" class="full-width">` rendered above
    the existing mode toggle when `canRegisterTrial` (today or future).
  - **Roster split**: future-bookings view now renders
    `<q-item-label header>Reservados ({{ activeRegularBookings.length
}})</q-item-label>` (only when trials coexist with regulars, to
    avoid UI churn for trial-less slots) and
    `<q-item-label header>Sesiones de Prueba ({{
activeTrialBookings.length }})</q-item-label>` (always when
    trials > 0). Trial rows carry `<q-badge color="warning"
label="PRUEBA" />` next to the status badge.
  - **Attendance view (today/past)**: `isTrialMember(member)` correlates
    `member.bookingId` with `trialBookingIds` (a `Set<number>` built
    from `slotDetail.value.bookings.filter(b => b.isTrial)`) and
    renders the PRUEBA badge inline with `memberName` when true. No
    change to the check-in button — `quickCheckIn` still calls
    `attendanceApi.coachCheckIn` which hits the existing
    `POST /api/admin/attendance/force`.
  - **Capacity fix**: `summaryText` now reads
    `activeRegularBookings.value.length` instead of
    `activeBookings.value.length`, so a slot with 5 regular + 2
    trials renders `5/12 reservas`, not `7/12` — matches SPEC R2 on
    the UI.
  - **Nested dialog mount**: `<NewTrialDialog v-if="slotDetail"
v-model:show="showNewTrialDialog" ...>` rendered as a sibling of
    the main `q-dialog`. `branchId`, `scheduleId`, `bookingDate`,
    `branchName`, and `scheduleStartTime` all derive from
    `slotDetail.value.schedule` — no extra fetches needed.
  - `onTrialCreated` handler re-runs `refreshAll()` (bookings +
    attendance) and emits `bookings-changed` so the Horarios page
    can refresh the weekly grid chip too.

## Trial Flow — UI Entry Point

1. User navigates to **Horarios** → picks a branch+week.
2. Clicks a slot chip → opens `SlotDetailDialog`.
3. Sees **Nueva Sesión de Prueba** (warning/amber, full-width, star
   icon) button above the mode toggle.
4. Click → nested `NewTrialDialog` opens with the slot's context in
   the caption line (`Sede: Chapadmalal · Horario: 07:00 · Fecha:
22/04/2026`).
5. Admin fills three fields → clicks Crear → 201 → positive toast
   → dialog closes → slot detail auto-refreshes → new row appears
   in the **Sesiones de Prueba** section with a PRUEBA badge.
6. On 409 (repeat phone) → server message (`Esta persona ya tuvo
una sesión de prueba el DD/MM/YYYY`) rendered verbatim in a
   negative toast; form stays open for correction.

## Screenshot-Worthy States (for the checkpoint)

For Task 4 verification, the tester should capture:

1. **SlotDetailDialog with zero trials** — confirms the button is
   present AND the roster still reads as a flat list (no headers
   when trials=0).
2. **NewTrialDialog open** — confirms: title "Nueva Sesión de
   Prueba", caption line with date+schedule, three inputs with
   Spanish labels, Cancelar (flat) + Crear (primary) actions.
3. **SlotDetailDialog after creating a trial** — confirms:
   capacity chip _did not_ increment (still `5/12` if 5 regulars),
   "Sesiones de Prueba (1)" header appeared, trial row has
   `PRUEBA` badge next to the status badge.
4. **409 conflict toast** — confirms the Spanish message is
   surfaced verbatim with the prior trial's DD/MM/YYYY date.
5. **Today-slot attendance view** — confirms: a checked-in trial
   attendee shows the PRUEBA badge next to their name AND the
   green bg-green-1 row style the same as any other check-in.
6. **Past (yesterday) slot** — confirms the "Nueva Sesión de
   Prueba" button is hidden (past dates cannot register trials).

## DOM Selectors for Future E2E / Plan 05

For downstream automation, these are the stable anchors:

| Purpose               | Selector / Text                                                       |
| --------------------- | --------------------------------------------------------------------- |
| Trial button          | `q-btn` with `label="Nueva Sesión de Prueba"` + `icon="star_outline"` |
| Trial dialog title    | `q-card-section > div.text-h6` text === "Nueva Sesión de Prueba"      |
| Regular roster header | `q-item-label[header]` text begins with "Reservados ("                |
| Trial roster header   | `q-item-label[header]` text begins with "Sesiones de Prueba ("        |
| PRUEBA badge          | `q-badge[label="PRUEBA"][color="warning"]`                            |
| Capacity chip         | `.text-caption.text-grey-7` after slot header, pattern `N/M reservas` |

## Drift vs SPEC

- **R5:** ✅ Button → 3-field form → POST → refresh inline. Done.
- **R6:** ✅ Two sections with PRUEBA badge; check-in reuses existing
  `POST /api/admin/attendance/force` flow via `attendanceApi.coachCheckIn`.
- **R9:** ✅ No "Convert to member" endpoint or button added. The
  existing Editar + Gestionar Plan flows cover conversion.
- **R10:** ✅ `git status` at end shows NO modifications under
  `el-templo-app/` — member app frozen per SPEC.

## Deviations from Plan

**None.** The plan executed exactly as written. One minor addition:
`NewTrialDialog` accepts two optional props (`branchName`,
`scheduleStartTime`) beyond what the plan spec'd — the plan explicitly
allowed omitting the branchName from the caption, but the extra prop
is trivial and made the caption more informative without changing the
contract (both optional, both only used for display).

## Verification Status

- `pnpm tsc --noEmit` — no new errors in any touched file. (Pre-existing
  errors in `src/utils/pdf/session-pdf-builder.ts` are out of scope —
  logged to `deferred-items.md` if needed by Plan 05.)
- `npx eslint` on touched files — clean.
- All grep acceptance checks from the plan's `<verify>` blocks — PASS.
- Visual checkpoint bypassed per user direction — automated verification (tsc, eslint, grep acceptance) is the acceptance record.

## Out of Scope (Deferred to Downstream Plans)

- Alumno detail "Clases de prueba: N/1" counter — Plan 05.
- Leads filter on Alumnos list — Plan 05.
- Member app surface changes — intentionally deferred per SPEC §R10.

## Self-Check: PASSED

**Files exist:**

- `el-templo-admin/src/types/scheduling.ts` — FOUND (modified; isTrial added)
- `el-templo-admin/src/composables/useSchedulingApi.ts` — FOUND (modified; createTrial added + exported)
- `el-templo-admin/src/components/scheduling/NewTrialDialog.vue` — FOUND (new)
- `el-templo-admin/src/components/scheduling/SlotDetailDialog.vue` — FOUND (modified)

**Commits exist:**

- `35914ab9 feat(102-04): mirror isTrial on BookingRecord + add createTrial composable` — FOUND
- `5a27e037 feat(102-04): add NewTrialDialog component for trial creation` — FOUND
- `f3f30c09 feat(102-04): integrate trial registration into SlotDetailDialog` — FOUND

**Acceptance grep checks:**

| Check                                                     | Result            |
| --------------------------------------------------------- | ----------------- |
| `isTrial: boolean` on BookingRecord                       | PASS              |
| `createTrial` function declared + exported                | PASS              |
| `/admin/scheduling/trials` endpoint string                | PASS              |
| `Nueva Sesión de Prueba` string (button + dialog title)   | PASS (both files) |
| `NewTrialDialog` imported/mounted in SlotDetailDialog     | PASS              |
| `activeRegularBookings` / `activeTrialBookings` computeds | PASS              |
| `Reservados` + `Sesiones de Prueba` section headers       | PASS              |
| `PRUEBA` badge literal                                    | PASS              |
| `activeRegularBookings.value.length` in summaryText       | PASS              |
| No `console.*` in any touched file                        | PASS              |
| No `any` type in any touched file                         | PASS              |
| No files under `el-templo-app/` modified                  | PASS (R10)        |
