# Phase 164: Reprogramación y reporte - Pattern Map

**Mapped:** 2026-07-15
**Files analyzed:** 14 (7 API + 5 admin + 2 test) — all MODIFY except optional new reschedule dialog/test
**Analogs found:** 14 / 14 (all exact — this is a pure extend-existing-surface phase)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `el-templo-api/src/modules/scheduling/trials-service.ts` (MOD: add `rescheduleTrial`) | service | transactional CRUD | `bookTrial` + `reserveTrialSelfService` (same file), `adminRemoveBooking` (booking-service) | exact |
| `el-templo-api/src/modules/scheduling/routes.ts` (MOD: add reschedule route) | route | request-response | `POST /trials` (~597) + `DELETE /bookings/:id` (~577) | exact |
| `el-templo-api/src/modules/scheduling/schemas.ts` (MOD: add `rescheduleTrialSchema`) | config/validation | request-response | `bookTrialSchema` (548) + `adminRemoveBookingSchema` (682) | exact |
| `el-templo-api/src/modules/reports/service.ts` (MOD: count col + source) | service | CRUD/aggregate-read | `getTrialSessionsReport` (1475) attended LEFT JOIN + `buildTrialSessionsConditions` (1690) | exact |
| `el-templo-api/src/modules/reports/types.ts` (MOD: row + filter fields) | model | — | `TrialSessionsRow` (207) / `TrialSessionsFilters` (179) | exact |
| `el-templo-api/src/modules/reports/routes.ts` (MOD: filter passthrough) | route | request-response | `buildTrialSessionsFilters` (882) + `gestionaUserId` strip | exact |
| `el-templo-api/src/modules/reports/schemas.ts` (MOD: querystring + row props) | config/validation | — | `trialSessionsQuerystringProps` (468) + `trialSessionsRowSchema` (492) | exact |
| `el-templo-admin/src/composables/useSchedulingApi.ts` (MOD: add `rescheduleTrial`) | service (client) | request-response | `bookTrial` (382) + `adminRemoveBooking` (369) | exact |
| `el-templo-admin/src/components/scheduling/SesionesDePruebaDialog.vue` (MOD: add action) | component | event-driven | existing "quitar" action (124-138 / `confirmRemoveTrial` 268) | exact |
| `el-templo-admin/src/components/scheduling/RescheduleTrialDialog.vue` (NEW, optional) | component | request-response | slot/trial picker in `SlotDetailDialog.vue` (459-500 / `onBookTrial` 1287) | role-match |
| `el-templo-admin/src/composables/useReportsApi.ts` (MOD: row + filter fields) | model (client) | — | `TrialSessionsRowClient` (48) / `TrialSessionsFiltersClient` (31) | exact |
| `el-templo-admin/src/components/reports/TrialSessionsReport.vue` (MOD: col + chip + filter) | component | CRUD-read | existing columns (545) + `leadStatus` chip slot (148) + filter selects (45) | exact |
| `el-templo-api/test/scheduling/reschedule-trial.test.ts` (NEW) | test | integration | `test/scheduling/trials.test.ts` (POST /trials, 181) + `expire-lost-leads.test.ts` seed helpers | exact |
| `el-templo-api/test/reports-trial-sessions.test.ts` (MOD: reschedules + source) | test | integration | same file (`seedLead` 169, `seedBooking` 225) | exact |

---

## Pattern Assignments

### `trials-service.ts` → new `rescheduleTrial(input)` (service, transactional CRUD)

**Analog:** `bookTrial` (585-730) is the primary template — it already does "close stale + reset lead + reactivate-or-insert" inside ONE `db.transaction`. The reschedule adds a soft-cancel of the OLD booking in the same tx (semantics from `adminRemoveBooking`, booking-service.ts 753-795).

**Imports (trials-service.ts 25-36)** — reuse as-is; all needed symbols already imported (`and, desc, eq, inArray, ne, sql`, error classes, `todayInTz`, `BookingService`):
```typescript
import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { BadRequestError, ConflictError, NotFoundError } from "../shared/errors";
import { buildClassDateTime, todayInTz } from "../shared/date-utils";
import type { BookingService } from "./booking-service";
```

**Validation to REUSE (from `bookTrial` 586-651):** schedule exists (590-602), branch coherence via `userRow.branchId !== scheduleRow.branchId` (620-625). D-01 says apply the SAME validations as `bookTrial`. NOTE: the one-trial-per-life PENDING guard (627-651) must be SKIPPED/scoped for reschedule because the old booking is cancelled in-tx (per D-01) — either cancel first inside the tx then run the insert, or exclude the booking being rescheduled from the pending check.

**Soft-cancel semantics to REUSE (adminRemoveBooking, booking-service.ts 777-791):**
```typescript
await this.db.update(schema.bookings)
  .set({ status: "cancelado", cancelledAt: new Date(), waitlistPosition: null })
  .where(eq(schema.bookings.id, bookingId));
if (wasOccupying) {
  await this.promoteWaitlist(bookingRow.scheduleId, bookingRow.bookingDate);
}
```
`promoteWaitlist` is PRIVATE on `BookingService` and opens its OWN `db.transaction` (1698). Calling it from inside a `TrialService` tx would nest transactions. Two clean options for the planner: (a) run promotion AFTER the reschedule tx commits (trials are `is_trial=1` and don't occupy capacity anyway — see trials-service.ts header 20-22, so `wasOccupying` is typically false for the old trial booking and promotion is a no-op); or (b) expose a tx-aware promotion helper. Prefer (a): trial bookings bypass capacity, so waitlist promotion on a cancelled trial is almost always a no-op — keep it simple and match `bookTrial`'s single-tx shape.

**The reset-lead code to REUSE verbatim (bookTrial 676-682, D-02):**
```typescript
// Phase 163 (D-03/D-07): re-booking resets a Perdido lead → en_seguimiento, source 'auto'.
await tx.update(schema.users)
  .set({ leadStatus: "en_seguimiento" as const, leadStatusSource: "auto" as const })
  .where(eq(schema.users.id, input.userId));
```

**Transaction skeleton to COPY (bookTrial 659-717):** open `this.db.transaction(async (tx) => {...})`, do cancel-old + reset-lead + reactivate-or-insert-new. The reactivate-vs-insert branch (684-716) handles the UNIQUE `(member_id, schedule_id, booking_date)` constraint — copy it wholesale for the NEW booking. Return `bookingId`, then `this.log.info(...)`.

**Date-window validation:** `bookTrial` does NOT re-validate the date window (it trusts the slot); `reserveTrialSelfService` DOES via `this.bookingService.validateTrialBookingDate(scheduleId, date)` (booking-service 1560-1580, returns branchId for coherence check). For an admin reschedule, follow `bookTrial`'s lighter validation OR add `validateTrialBookingDate` for parity — Claude's Discretion (D-01 says "MISMAS validaciones que bookTrial").

---

### `scheduling/routes.ts` → new `POST /trials/:bookingId/reschedule` (route, request-response)

**Analog:** `POST /trials` (597-610) for the handler shape; `DELETE /bookings/:bookingId` (577-588) for the `:id` param + `adminRemoveBookingSchema` pairing.

**Guard:** module-level `onRequest` hook (116-125) already enforces `ALL_STAFF_ROLES` + `attachCountryScope` for EVERY route in this plugin — no per-route guard needed (D-01 "guard ALL_STAFF_ROLES como el resto de las rutas de trials"):
```typescript
fastify.addHook("onRequest", async (request, reply) => {
  await fastify.authenticate(request, reply);
  if (!(ALL_STAFF_ROLES as readonly string[]).includes(request.user.role)) {
    return reply.code(403).send({ error: "Acceso denegado", message: "Acceso de administrador requerido" });
  }
  await attachCountryScope(request, fastify.db);
});
```

**Handler pattern to COPY (POST /trials 597-610):**
```typescript
fastify.post<{ Params: { bookingId: number }; Body: { scheduleId: number; date: string; branchId: number } }>(
  "/trials/:bookingId/reschedule",
  { schema: rescheduleTrialSchema },
  async (request, reply) => {
    try {
      const result = await trialService.rescheduleTrial({ bookingId: request.params.bookingId, ...request.body });
      return reply.code(200).send(result);   // 200, not 201: mutating an existing lead's trial
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "reschedule trial");
    }
  },
);
```
`handleServiceError` is the shared error mapper used by every route here — do NOT hand-roll try/catch responses.

---

### `scheduling/schemas.ts` → new `rescheduleTrialSchema` (validation)

**Analog:** `bookTrialSchema` (548-571) for the body (`scheduleId`/`bookingDate` integer+pattern) + `adminRemoveBookingSchema` (682-699) for the `params.bookingId`. Compose them:
```typescript
export const rescheduleTrialSchema = {
  params: { type: "object", required: ["bookingId"], properties: { bookingId: { type: "integer" } } },
  body: {
    type: "object",
    required: ["scheduleId", "date", "branchId"],
    properties: {
      scheduleId: { type: "integer", minimum: 1 },
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      branchId: { type: "integer", minimum: 1 },
    },
    additionalProperties: false,
  },
  response: { 200: { type: "object", required: ["bookingId"], properties: { bookingId: { type: "integer" } } }, 400: errorSchema, 404: errorSchema, 409: errorSchema },
} as const;
```
NOTE the D-01 body is `{scheduleId, date, branchId}` — matches `ReserveTrialSelfServiceInput` shape (trials-service.ts 70-74), not `bookTrial`'s `bookingDate`. Keep field name `date` to match the CONTEXT body.

---

### `reports/service.ts` → reschedule count + `leadStatusSource` (service, aggregate-read)

**Analog:** `getTrialSessionsReport` (1475-1606). This method uses RAW `this.db.execute<T>(sql\`...\`)` with explicit table aliases (`b, u, s, br, a, creator, pp`) and a `latest_trial` derived table — NOT the drizzle query builder. **This means the Drizzle "unqualified columns in correlated subquery" gotcha does NOT bite here** (that gotcha is about `.select()` builder emitting bare `users.first_name`). Here you write the SQL yourself with aliases, so a correlated subquery is safe and idiomatic.

**Existing derived column to MIRROR — `attended` via LEFT JOIN (1503-1507, 1567-1571):**
```sql
LEFT JOIN attendance AS a
  ON a.member_id = b.member_id AND a.schedule_id = b.schedule_id
 AND a.session_date = b.booking_date AND a.attendance_status = 'confirmado'
```

**Reschedule count (D-04) — add a correlated COUNT subquery in the SELECT list (after line ~1556), counts ALL cancelled trials of the member (specific idea: proxy for lead noise, incl. self-service cancels):**
```sql
(SELECT COUNT(*) FROM bookings AS rc
   WHERE rc.member_id = u.id AND rc.is_trial = 1 AND rc.booking_status = 'cancelado') AS reschedules
```
Add BOTH to the page query (1537-1578) AND keep the count query (1491-1511) unchanged (COUNT of leads is unaffected). Also add `u.lead_status_source AS lead_status_source` to the SELECT list (D-05). Add both fields to the two inline row-type generics (1518-1536 and 1580-1599) — they are duplicated literals, update both.

**`mapTrialSessionRow` (1813-1897):** add `reschedules: Number(r.reschedules)` and `leadStatusSource: r.lead_status_source ?? null` to the input type (1813-1832) and the returned object (1875-1896). Follow the existing `createdBy` null-coalescing style (1867-1873).

**`buildTrialSessionsConditions` (1690-1804) → add `leadStatusSource` filter (D-06)** — mirror the simple `gestionaUserId` predicate (1754-1759):
```typescript
if (filters.leadStatusSource !== undefined) {
  // 'auto' must also match NULL (histórico/desconocido = automático per D-05 / users.ts 155-157)
  if (filters.leadStatusSource === "auto") {
    preds.push(sql`(u.lead_status_source = 'auto' OR u.lead_status_source IS NULL)`);
  } else {
    preds.push(sql`u.lead_status_source = ${filters.leadStatusSource}`);
  }
}
```
All predicates bound via `${...}` template — never `sql.raw`/concat (matches the SQL-injection note at 1468-1473).

**`exportTrialSessions` (1624-1678):** add `"Reprogramaciones"` and `"Origen estado"` to the `headers` array (1633-1647, D-04/D-05 say new columns at the END) and the matching `cells` array (1658-1672). Reschedules → `String(row.reschedules)`; origen → map `leadStatusSource` to ES label (`manual` → "Manual", else "Automático"). Follow the existing `asistidoLabel`/`estadoLabel` local-const style (1653-1657).

---

### `reports/types.ts` → `TrialSessionsRow` + `TrialSessionsFilters`

**Analog:** the interfaces at 179-247. Add to `TrialSessionsRow` (207): `reschedules: number;` and `leadStatusSource: "auto" | "manual" | null;`. Add to `TrialSessionsFilters` (179): `leadStatusSource?: "auto" | "manual";`. Follow the existing JSDoc-per-field convention.

---

### `reports/routes.ts` → filter passthrough (route)

**Analog:** `buildTrialSessionsFilters` (882-942) + the `TrialSessionsQuery` inline type (762-ish, referenced at 750-760). Add `leadStatusSource` to: (1) the querystring type in `buildTrialSessionsFilters`'s request generic (884-901), (2) the returned filters object (928-941, one line: `leadStatusSource: q.leadStatusSource`). NO owner-strip needed (unlike `gestionaUserId` 907-918) — this filter is available to all report-viewers. `country` continues to come from `request.scope.country` (930).

---

### `reports/schemas.ts` → querystring + row props

**Analog:** `trialSessionsQuerystringProps` (468-490) + `trialSessionsRowSchema` (492-541). Both are shared by report + export schemas. Add to querystring props: `leadStatusSource: { type: "string", enum: ["auto", "manual"] }` (mirror `shift`/`attended` enum style, 485-486). Add to row schema: `reschedules: { type: "integer" }` and `leadStatusSource: { anyOf: [{ type: "string", enum: ["auto", "manual"] }, { type: "null" }] }` (mirror `leadStatus` nullable-enum style, 506-514).

---

### `useSchedulingApi.ts` → new `rescheduleTrial` (client service)

**Analog:** `bookTrial` (382-401). Copy the loading/error/try-finally envelope verbatim; swap the endpoint + payload. Register in the `return {}` block (512-533):
```typescript
async function rescheduleTrial(bookingId: number, data: { scheduleId: number; date: string; branchId: number }): Promise<{ bookingId: number }> {
  loading.value = true; error.value = null;
  try {
    const { data: result } = await api.post<{ bookingId: number }>(`/admin/scheduling/trials/${bookingId}/reschedule`, data);
    return result;
  } catch (err: unknown) {
    error.value = extractError(err, 'Error reprogramando sesión de prueba');
    throw err;
  } finally { loading.value = false; }
}
```

---

### `SesionesDePruebaDialog.vue` → add "Reprogramar" action (component, event-driven)

**Analog:** the existing "quitar" action button (124-138) + `confirmRemoveTrial`/`removeTrial` (268-294). D-03: add a per-row button NEXT TO "quitar" (do NOT remove the old flow). Copy the `q-btn` side-section shape (124-138) with a new icon (e.g. `event_repeat`/`edit_calendar`), a `reschedulingBookingId` ref mirroring `removingBookingId` (266), and a handler that opens the picker. Feedback via `$q.notify` + `extractError` (285-290) — same as `removeTrial`. The trial row type is `TrialListItem` (imported 153) which exposes `bookingId`, `userId`, `scheduleId`, `startTime`, names, `phone`.

**Slot picker:** D-03 says "reusar el patrón de selección de slots del flujo de agendar trial / SlotDetailDialog.vue". Cleanest: a small NEW `RescheduleTrialDialog.vue` (see below) opened from the row, seeded with `trial.bookingId` + branch. On success, call `load()` to refresh (matches `removeTrial` 286).

---

### `RescheduleTrialDialog.vue` (NEW, optional) → slot picker (component)

**Analog:** the trial-booking sub-flow in `SlotDetailDialog.vue` — the eligible-select block (459-500) and `onBookTrial` (1287-1309). For reschedule you pick a **date + slot** rather than an eligible user. Reuse: (a) a `q-select` of available slots for the branch (the weekly-grid / `getWeeklyGrid` + `getSlotDetail` clients already exist in `useSchedulingApi`), and (b) the `onBookTrial` success/error shape:
```typescript
$q.notify({ type: 'positive', message: 'Sesión de prueba reprogramada' });
// on error: const msg = schedulingApi.error.value ?? fallback; $q.notify({ type: 'negative', message: msg, timeout: 5000 });
```
Date picker UX: copy the `q-date` + `q-popup-proxy` pattern already in SesionesDePruebaDialog.vue (28-42) and its `onDatePicked` normalizer (228-234, `q-date` emits `YYYY/MM/DD` → normalize to `-`). Details = Claude's Discretion (D-03), no new colors (paleta terracotta, see MEMORY reference_brand_palette).

---

### `TrialSessionsReport.vue` → column + source indicator + filter (component, CRUD-read)

**Analog:** columns array (545-639), the `leadStatus` chip body-slot (148-179), the filter selects (45-74), `buildServerFilters` (643-659).

**New "Reprogramaciones" column (D-04):** append to `columns` (after 638) mirroring the `period` plain-field column (625-631): `{ name: 'reschedules', label: 'Reprogramaciones', field: 'reschedules', align: 'center', sortable: false }`. Add a header tooltip documenting "cuenta TODAS las pruebas canceladas del lead (incl. self-service)" (specific idea 67) — use a `#header-cell-reschedules` slot or a column `headerClasses` + `q-tooltip`.

**Source indicator (D-05):** extend the `#body-cell-leadStatus` slot (148-179) — after the existing `q-chip`, conditionally render a small icon (e.g. `edit`/`person`) with `<q-tooltip>Estado puesto a mano</q-tooltip>` when `props.row.leadStatusSource === 'manual'`. `null`/`'auto'` → nothing (histórico = automático). Discreet, matches D-05.

**Source filter (D-06):** add a `q-select` in the filters row mirroring the `shift` select (45-54): options `[{label:'Automático',value:'auto'},{label:'Manual',value:'manual'}]`, `clearable`, `emit-value`, `map-options`. Add `leadStatusSource` to the `filters` reactive (376-ish) and to `buildServerFilters` (643-659) — one line: `leadStatusSource: filters.leadStatusSource ?? undefined`.

**Client types:** in `useReportsApi.ts` add `reschedules: number;` + `leadStatusSource: 'auto' | 'manual' | null;` to `TrialSessionsRowClient` (48-69) and `leadStatusSource?: 'auto' | 'manual';` to `TrialSessionsFiltersClient` (31-46). `buildTrialSessionsParams` (297-306) already strips undefined/null generically — no change needed there. CSV export goes through the same param builder + backend, so no client CSV mapping to touch.

---

### `test/scheduling/reschedule-trial.test.ts` (NEW) → integration tests

**Analog:** `test/scheduling/trials.test.ts` (POST /trials happy path 181-229; helpers `createActivity`, `createScheduleSlot`, `createPruebaUser`, `getFutureSlot`, `app.inject` with `adminToken` from `getAuthToken` 57-58). Reschedule-specific seeding of the OLD booking + lead-reset assertions: borrow from `expire-lost-leads.test.ts` — `seedLead({leadStatus:'perdido', leadStatusSource:'manual'|null})` (76-100), `seedTrialBooking(userId, daysAgo, status)` (102-118), and CRITICALLY the LOCAL-date `dateDaysAgo` (53-59) NOT a UTC version (comment 47-52 documents the ART/CURDATE bug). `leadStatusOf(userId)` (136-147) reads back `{leadStatus, leadStatusSource}` for the reset assertion.

**Cases to cover (specifics 68):** (1) reschedule cancels old booking + creates new active one in one tx (assert old `status='cancelado'`, new `status='reservado'`, both is_trial); (2) fires reset Perdido→En seguimiento with source `auto`; (3) respects slot validations (bad slot → 404, cross-branch → 409); (4) does NOT trip one-trial-per-life (old cancelled in-tx). Standard: new API routes need integration tests (CLAUDE.md). Do NOT run the suite locally — CI runs it (MEMORY: feedback_tests_run_in_ci_not_local).

---

### `test/reports-trial-sessions.test.ts` (MOD) → reschedules + source + filter

**Analog:** same file — `seedLead` (169-207, add `leadStatusSource` to `SeedLeadOpts`), `seedBooking` (225-238, already supports `status:'cancelado'` + `isTrial`). Cases: seed a lead with N cancelled trial bookings + 1 active → assert `row.reschedules === N`; seed `leadStatusSource:'manual'` vs `null` → assert `row.leadStatusSource`; hit `?leadStatusSource=manual` and `?leadStatusSource=auto` (auto must include NULL rows) → assert filtered set. Reuse `ctx.app.inject` with `ctx.ownerToken`/`ctx.adminArToken` (252-294) + `${REPORTS_URL}/trial-sessions`.

---

## Shared Patterns

### Route error handling
**Source:** `handleServiceError(err, reply, request.log, "<label>")` — used by EVERY handler in `scheduling/routes.ts` (572, 608, 669...) and `reports/routes.ts` (774, 809).
**Apply to:** the new reschedule route. Never hand-roll status/JSON; the service throws typed errors (`NotFoundError`→404, `ConflictError`→409, `BadRequestError`→400 from `../shared/errors`).

### Single-transaction mutation
**Source:** `bookTrial` (trials-service.ts 659-717), `reserveTrialSelfService` (293-349): `await this.db.transaction(async (tx) => { ... return id })`. Reactivate-or-insert branch handles the UNIQUE `(member_id, schedule_id, booking_date)` constraint (684-716).
**Apply to:** `rescheduleTrial`. Cancel-old + reset-lead + create-new all inside ONE tx (D-01).

### Lead-reset on trial (re)booking (Phase 163)
**Source:** bookTrial 676-682 — set `leadStatus:'en_seguimiento', leadStatusSource:'auto'`. D-02: REUSE this exact snippet in reschedule, do not duplicate the logic elsewhere.
**Apply to:** `rescheduleTrial` service.

### Drizzle unqualified-column gotcha (repo reference, OBLIGATORIO)
**Source:** MEMORY `reference_drizzle_select_unqualified_columns.md` + skill `el-templo-db-migrations`. The gotcha bites the `.select()` QUERY BUILDER (bare `schema.users.firstName` becomes ambiguous `users.first_name` under aliasing — see the inline-search workaround comment at service.ts 1774-1800). **The trial-sessions report uses RAW `sql\`...\`` with explicit aliases**, so the reschedule COUNT is written as an explicitly-aliased correlated subquery (`rc.member_id = u.id`) and is SAFE. Bind every value via `${...}`, never `sql.raw`.

### CSV export shape
**Source:** `exportTrialSessions` (service.ts 1624-1678): parallel `headers` + `cells` arrays, `csvEscape` per cell, CRLF join, UTF-8 BOM prepended at the ROUTE layer (routes.ts 799-808). New columns append to the END of both arrays (D-04/D-05).
**Apply to:** reschedules + origen columns.

### Client API composable envelope
**Source:** every method in `useSchedulingApi.ts` / `useReportsApi.ts`: `loading.value=true; error.value=null; try {...} catch(err:unknown){ error.value = extractError(err, '<es fallback>'); throw err } finally { loading.value=false }`. Frontend logging via `createLogger()` (CLAUDE.md), never `console.*`.
**Apply to:** `rescheduleTrial` client + any new report calls.

### Frontend gate
**Source:** MEMORY reference_ci_no_typecheck_frontends — CI does NOT typecheck the admin. Run `cd el-templo-admin && vue-tsc` locally after touching Vue files (specific idea 69). No new colors outside the terracotta paleta (`quasar.variables.scss`).

---

## No Analog Found

None. Every file is an extension of an existing, well-established surface (trials CRUD, trial-sessions report, its admin UI). The only genuinely NEW file — `RescheduleTrialDialog.vue` — has a strong role-match analog in `SlotDetailDialog.vue`'s trial-picker sub-flow, and may even be built inline in `SesionesDePruebaDialog.vue` at the planner's discretion.

## Metadata

**Analog search scope:** `el-templo-api/src/modules/{scheduling,reports}`, `el-templo-api/src/db/schema/users.ts`, `el-templo-api/test/{scheduling,}`, `el-templo-admin/src/{components/{scheduling,reports},composables}`.
**Files scanned:** ~16 (7 API src, 5 admin, 4 test/schema).
**Pattern extraction date:** 2026-07-15
