---
phase: 164-reprogramaci-n-y-reporte
reviewed: 2026-07-15T00:00:00Z
depth: deep
files_reviewed: 12
files_reviewed_list:
  - el-templo-api/src/modules/scheduling/trials-service.ts
  - el-templo-api/src/modules/scheduling/schemas.ts
  - el-templo-api/src/modules/scheduling/routes.ts
  - el-templo-api/src/modules/reports/service.ts
  - el-templo-api/src/modules/reports/routes.ts
  - el-templo-api/src/modules/reports/schemas.ts
  - el-templo-api/src/modules/reports/types.ts
  - el-templo-api/test/scheduling/reschedule-trial.test.ts
  - el-templo-api/test/reports-trial-sessions.test.ts
  - el-templo-admin/src/composables/useSchedulingApi.ts
  - el-templo-admin/src/components/scheduling/RescheduleTrialDialog.vue
  - el-templo-admin/src/components/scheduling/SesionesDePruebaDialog.vue
  - el-templo-admin/src/composables/useReportsApi.ts
  - el-templo-admin/src/components/reports/TrialSessionsReport.vue
findings:
  critical: 1
  warning: 4
  info: 1
  total: 6
status: resolved
resolved: 2026-07-16
resolution:
  CR-01: fixed (00378351)
  WR-01: fixed (e260afde)
  WR-02: fixed (39e1b153)
  WR-03: fixed (10bc4520)
  WR-04: fixed (b4220d30)
  IN-01: fixed (daf071da)
---

# Phase 164: Code Review Report

**Reviewed:** 2026-07-15
**Depth:** deep
**Files Reviewed:** 12 source + 2 test
**Status:** issues_found

## Summary

Phase 164 adds a transactional "Reprogramar" action for trial sessions (`rescheduleTrial` +
route + admin dialog) and extends the Sesiones de Prueba report with a `reschedules` count,
`leadStatusSource`, an origin filter, and CSV columns.

The transactionality is genuinely atomic (single `db.transaction` for cancel-old + reset-lead +
create-new; a failed insert rolls back and leaves the old booking intact). The correlated `COUNT`
subquery uses fully-qualified columns (safe vs the Drizzle unqualified-column gotcha), the origin
filter binds with `${...}` (no SQL injection surface), the `auto`-includes-`NULL` semantics match
D-05/D-06, and the same `${conds}` block is applied to both the count and page queries so
pagination stays consistent. The waitlist-promotion omission is correct: `countActiveBookings`
excludes `is_trial=1` (Phase 102), so a cancelled trial frees no capacity and promotion is a true
no-op. Frontend uses `createLogger`/`extractError`/`$q.notify` (no `console.*`) and types are clean.

One **BLOCKER** stands out: `rescheduleTrial` omits the `status === 'prueba'` guard that its
sibling `bookTrial` has, so the D-02 lead reset can clobber a converted (`ganado`) member back to
`en_seguimiento`/`auto` — and this is reachable through the normal admin UI, not just direct API.
Four warnings (a missing branch-scope preHandler, a missing test for the `ganado` case, absent
server-side date/weekday validation, and a stale weekly-grid in the dialog) plus one info item.

## Critical Issues

### CR-01: `rescheduleTrial` can revert a converted (`ganado`) member to `en_seguimiento`

**File:** `el-templo-api/src/modules/scheduling/trials-service.ts:764-899` (reset at 813-819)
**Issue:**
`bookTrial` guards its lead reset behind a `status === 'prueba'` check (`trials-service.ts:627-631`)
— only leads still in `prueba` ever reach the unconditional
`set({ leadStatus: 'en_seguimiento', leadStatusSource: 'auto' })`. `rescheduleTrial` copied the
reset **verbatim (D-02) but dropped the status guard**: it only selects `id, branchId` from the
user (steps 3-4) and never checks `status`. So the reset fires for **any** user whose trial booking
is rescheduled, including one who already converted (`status='activo'`, `leadStatus='ganado'`,
`purchased_plan_id NOT NULL`). That silently breaks the documented invariant in
`db/schema/users.ts:74` — `lead_status='ganado' ⇔ purchased_plan_id IS NOT NULL` — and can later
cause the `expire-lost-leads` cron to mark a **paying member** as `perdido`.

This is **reachable through the UI**, not a theoretical direct-API case: `listTrials`
(`trials-service.ts:971-976`) filters only on `isTrial=true`, `bookingDate`, and
`status != 'cancelado'` — it does **not** filter on user `status`. A member who books a future trial
and then buys a plan before attending still shows in `SesionesDePruebaDialog`, and clicking
"Reprogramar" reverts their `ganado`.

Aggravating factor: the reactivate-or-insert query (step (c), lines ~858-874) matches on
`member_id + schedule_id + booking_date` **without** an `isTrial` filter, so for a converted member
who already has a *regular* booking on the target slot+date, the reactivate branch would flip that
booking to `status='reservado', isTrial=true` — corrupting a legitimate reservation into a trial.

No test covers this (see WR-02); the only reset test seeds `perdido/manual` and asserts the
overwrite, which is the *intended* Perdido path.

**Fix:** Mirror `bookTrial` — reject non-`prueba` users before the transaction:
```ts
const [userRow] = await this.db
  .select({ id: schema.users.id, status: schema.users.status, branchId: schema.users.branchId })
  .from(schema.users)
  .where(eq(schema.users.id, userId));
if (!userRow) throw new NotFoundError("Alumno no encontrado");
if (userRow.status !== "prueba") {
  throw new ConflictError(
    "El alumno ya no está en estado 'prueba' — no se puede reprogramar su sesión de prueba",
  );
}
```
Also scope the reactivate lookup to trials (`and(..., eq(schema.bookings.isTrial, true))`) so a
regular booking can never be reactivated as a trial.

**✅ FIXED (00378351):** Added the `status !== 'prueba'` guard (409 accionable en español) before
the transaction and scoped the reactivate lookup to `isTrial=1`. Covered by the new WR-02 test.

## Warnings

### WR-01: Reschedule route does not enforce branch/country scope (no `requireBranchAccess`)

**File:** `el-templo-api/src/modules/scheduling/routes.ts:620-635`
**Issue:** The new `POST /trials/:bookingId/reschedule` route registers only `{ schema: ... }`, with
no `preHandler`. The module `onRequest` hook (routes.ts:117-126) enforces `ALL_STAFF_ROLES` and
*attaches* `request.scope` but does not enforce any branch. Sibling mutation routes do enforce it —
`adminAddBooking` (routes.ts:224), `schedules/seed` (routes.ts:499) both use
`requireBranchAccess({ from: "body.branchId" })`. The service validates
`schedule.branchId === body.branchId === user.branchId` but never checks that `body.branchId` is
inside the caller's `request.scope.country`. A staff member scoped to one country could reschedule a
trial belonging to another country's branch if they know the `bookingId`. The normal UI path is
scoped (via `listTrials` country filter), so this is defense-in-depth, and `bookTrial` shares the
same gap — but the inconsistency with the other trial-mutation routes should be closed.
**Fix:** Add `preHandler: [requireBranchAccess({ from: "body.branchId" })]` to the route (and,
ideally, do the same for `POST /trials` to remove the pre-existing gap).

**✅ FIXED (e260afde):** Added `preHandler: [requireBranchAccess({ from: "body.branchId" })]` to
the reschedule route. **Nota:** el gap de `POST /trials` (bookTrial) es **preexistente** a esta
fase — se deja como está (fuera del scope de 164) y queda documentado aquí para un follow-up.

### WR-02: No test for the `ganado`/converted-member reset case (CR-01)

**File:** `el-templo-api/test/scheduling/reschedule-trial.test.ts`
**Issue:** All test users are created via `createPruebaUser` (`status='prueba'`). The reset test
(lines 254-276) seeds only `perdido/manual` and asserts the overwrite. There is no test seeding a
converted member (`status='activo'`, `leadStatus='ganado'`) to prove the reschedule does **not**
clobber a won conversion. Given CLAUDE.md's "well-tested code is non-negotiable" and CR-01 being
reachable, this coverage gap let the bug through.
**Fix:** After fixing CR-01, add a case: seed `status='activo'`/`leadStatus='ganado'`, attempt a
reschedule, assert `409` and that `leadStatus` stays `ganado`.

**✅ FIXED (39e1b153):** Added "rechaza (409) reprogramar la prueba de un convertido y deja
'ganado' intacto" — siembra `status='activo'`/`leadStatus='ganado'`/`source='manual'`, afirma 409,
lead intacto y booking vieja sin cancelar. Suite `reschedule-trial.test.ts` 6/6 verde.

### WR-03: Backend accepts past dates and weekday-mismatched schedules

**File:** `el-templo-api/src/modules/scheduling/trials-service.ts:764-899`
**Issue:** `rescheduleTrial` does no date-window validation and no check that `input.date`'s weekday
matches `schedule.dayOfWeek`. The dialog filters both client-side (`isSelectableDate` blocks the
past; `slotOptions` only offers matching-weekday slots), but the API is authoritative and a direct
call can create a trial booking on a past date or on a date whose weekday has no session — an
"orphan" booking that check-in/attendance can't reconcile. `bookTrial` has the same looseness
(parity was the stated decision), but per the project's "explicit over clever / handle more edge
cases" preference this should be validated server-side.
**Fix:** Validate `input.date >= todayInTz(branchTz)` and that the schedule's `dayOfWeek` matches the
date's weekday before opening the transaction.

**✅ FIXED (10bc4520):** Se agregó validación not-past (`input.date >= todayInTz(branchTz)`) +
coincidencia de `dayOfWeek` (patrón de `assertDateWithinWindow`), con 400 accionable en español,
antes de abrir la transacción. `bookTrial` mantiene la misma laxitud (paridad, fuera de scope).

### WR-04: RescheduleTrialDialog loads only the current week's grid but allows any future date

**File:** `el-templo-admin/src/components/scheduling/RescheduleTrialDialog.vue:203-216` (`loadSlots`)
**Issue:** `loadSlots` always fetches `getWeeklyGrid(branchId, getMonday(new Date()))` — the
*current* week — while the date picker allows selecting arbitrary future dates. `slotOptions` filters
by `dayOfWeek` and the current week's `isActive`. If the target future week has a holiday/cancellation
on the chosen date (or a slot that differs from this week), the UI won't reflect it and can offer a
slot that won't actually run that day. The recurring templates are week-agnostic, so it usually works,
but the `isActive`/holiday state is week-specific.
**Fix:** Load the weekly grid for the Monday of the **selected** date (refetch when the date changes),
so `isActive`/holiday state matches the target week.

**✅ FIXED (b4220d30):** `loadSlots` ahora toma una fecha de referencia y usa el lunes de esa
semana; `onDatePicked` refetchea la grilla al cambiar la fecha, reflejando isActive/feriados de la
semana destino. ESLint limpio sobre el archivo (vue-tsc no instalado, no se corrió).

## Info

### IN-01: `TrialSessionsQuery` route generic type omits `leadStatusSource`

**File:** `el-templo-api/src/modules/reports/routes.ts:750-760`
**Issue:** The `TrialSessionsQuery` type used for the `/trial-sessions` and `/export` route generics
was not updated with `leadStatusSource`, even though the AJV schema, `buildTrialSessionsFilters`
(routes.ts:898), and `TrialSessionsFilters` all include it. It works at runtime (AJV keeps the
validated field and `buildTrialSessionsFilters` re-types the query) and compiles (the field is
optional), but the route-level type is now inaccurate.
**Fix:** Add `leadStatusSource?: "auto" | "manual";` to `TrialSessionsQuery` for accuracy.

**✅ FIXED (daf071da):** Se agregó `leadStatusSource?: "auto" | "manual";` al type
`TrialSessionsQuery` usado en los generics de `/trial-sessions` y `/export`.

---

_Reviewed: 2026-07-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
