# Phase 165: Self-service y UX de gestión - Pattern Map

**Mapped:** 2026-07-16
**Files analyzed:** 17 (mostly MODIFY — the flow already exists from Phase 119; this phase verifies + hardens it)
**Analogs found:** 17 / 17 (every change has a same-module precedent — this is a "copy the sibling" phase, not greenfield)

> Working copy: `/home/franco/projects/el-templo-v58` (worktree, branch `feat/sp-automatizacion-v58`). All paths below are relative to that root.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `el-templo-api/test/self-service-trial-e2e.test.ts` (NEW, SELF-01/D-01) | test | request-response | `test/scheduling-reserve-trial.test.ts` + `test/scheduling-trial-eligibility.test.ts` + `test/reports-trial-sessions.test.ts` | exact |
| `el-templo-api/src/modules/shared/errors.ts` (MODIFY, D-04) | utility | — | `PassRequiredError` / `CoverageExpiredError` (same file, lines 49-74) | exact |
| `el-templo-api/src/modules/scheduling/trials-service.ts` (MODIFY, D-03/D-04) | service | CRUD/transform (tx) | its own `reserveTrialSelfService` / `bookTrial` / `getTrialEligibility` | exact (self) |
| `el-templo-api/src/modules/scheduling/schemas.ts` (MODIFY, D-04) | config/schema | — | `reserveTrialSchema` / `trialEligibilitySchema` (same file, 864-920) | exact (self) |
| `el-templo-api/src/modules/scheduling/routes.ts` (MODIFY, D-04) | route | request-response | `/reserve` handler `CoverageExpiredError`/`PassRequiredError` surface (846-883) | exact |
| `el-templo-api/src/modules/members/service.ts` (MODIFY, D-02) | service | CRUD (tx) | `createTrialMember` phone guard (816-846) applied to `convertFreemiumToTrial` (1010) | role+flow match |
| `el-templo-api/src/modules/members/schemas.ts` (MODIFY, D-02) | config/schema | — | `createTrialMemberSchema` phone-required (315-331) → `convertToTrialSchema` (342-362) | exact (self) |
| `el-templo-api/src/modules/reports/service.ts` (MODIFY, D-06) | service | transform (raw SQL) | 164 `reschedules` / `leadStatusSource` columns (1537-1928) | exact (self, same commit shape) |
| `el-templo-api/src/modules/reports/types.ts` (MODIFY, D-06) | model/type | — | `TrialSessionsRow.reschedules`/`leadStatusSource` (257-262) | exact (self) |
| `el-templo-api/src/modules/reports/schemas.ts` (MODIFY, D-06) | config/schema | — | `trialSessionsRowSchema.reschedules` (541-544) | exact (self) |
| `el-templo-api/test/reports-trial-sessions.test.ts` (MODIFY, D-06) | test | request-response | `insertTrialLead` helper already seeds `phone` (171,198); assertion pattern for `reschedules` (920-983) | exact (self) |
| `el-templo-app/src/composables/useSchedulingApi.ts` (MODIFY, D-04/D-05) | composable/api | request-response | `TrialEligibility` iface (39-52) + `reserveTrial` (110-121) | exact (self) |
| `el-templo-app/src/pages/ReservasPage.vue` (MODIFY, D-05) | component | request-response | trial confirm dialog (636-655) + `confirmTrialReserve` (1495) | exact (self) |
| `el-templo-admin/src/components/reports/TrialSessionsReport.vue` (MODIFY, D-06/D-07) | component | request-response | existing lead router-link (128-138) + columns array (592+) | exact (self) |
| `el-templo-admin/src/composables/useReportsApi.ts` (MODIFY, D-06) | composable/api | request-response | `TrialSessionsRowClient` (51-77) | exact (self) |
| `el-templo-admin/src/components/TrialMemberFormDialog.vue` (VERIFY, D-02) | component | request-response | phone `q-input` already `requiredRule('Teléfono')` (43-48) | already-satisfied |
| `el-templo-admin/src/components/scheduling/SlotDetailDialog.vue` (VERIFY, D-03) | component | request-response | `onBookTrial` extract-error surface (1287-1309) | already-satisfied (error display path) |

## Pattern Assignments

### `el-templo-api/src/modules/shared/errors.ts` (utility) — D-04 typed error

**Analog:** `PassRequiredError` (same file). Copy it verbatim, swap the code + message. It extends `BadRequestError` → HTTP 400, carries a machine-readable `code` (Claude's Discretion locked this to the `PASS_REQUIRED`/`COVERAGE_EXPIRED` family).

**Excerpt to copy (lines 66-74):**
```typescript
export class PassRequiredError extends BadRequestError {
  readonly code = "PASS_REQUIRED";
  constructor(
    message = "Necesitás el pase de actividades para reservar esta clase",
  ) {
    super(message);
  }
}
```
New class: `PhoneRequiredError` with `readonly code = "PHONE_REQUIRED"` and a message like `"Necesitamos tu teléfono para reservar la sesión de prueba"`. `AppError` base (8-23) already documents that the default handler does NOT serialize `code` — the route must surface it explicitly (see routes.ts below).

---

### `el-templo-api/src/modules/scheduling/trials-service.ts` (service, tx) — D-03 + D-04

**Analog:** its own three methods. Imports already include `ConflictError`, `NotFoundError`, `BadRequestError` from `../shared/errors` (line 29-33) — add `PhoneRequiredError` to that import.

**D-04 `reserveTrialSelfService` — new `phone` handling.** Input iface at 70-74 gains optional `phone?: string`. The guard block runs BEFORE the tx (285-303 region). Add a phone guard mirroring the existing branch/subscription guards:
```typescript
// existing guard shape to copy (lines 225-229):
if (user.status !== "freemium") {
  throw new ConflictError(
    "Solo un alumno freemium puede reservar una sesión de prueba",
  );
}
```
New logic: `select` also pulls `phone: schema.users.phone` (the select is at 214-222). If `!user.phone` and no `input.phone` → `throw new PhoneRequiredError()`. If provided, normalize with `normalizePhone` (from `../shared/phone`, see below) — laxo, "no inventar validador estricto" (D-04) — and write it inside the existing tx `users` UPDATE (306-316):
```typescript
await tx.update(schema.users).set({
  status: "prueba" as const,
  leadStatus: "en_seguimiento" as const,
  leadStatusSource: "auto" as const,
  createdBy: null,
  branchId: input.branchId,
  // NEW (D-04): persist captured phone in the same atomic op
  ...(phoneToPersist ? { phone: phoneToPersist } : {}),
}).where(eq(schema.users.id, userId));
```

**D-04 `getTrialEligibility` — new `phoneRequired` field.** `TrialEligibility` iface (80-93) gains `phoneRequired: boolean`. The user `select` (386-393) already pulls `status`/`deletedAt`; add `phone: schema.users.phone`. The eligible return (472-478) is:
```typescript
if (user.status !== "freemium") {
  return { eligible: false, alreadyBooked: false };
}
return { eligible: true, alreadyBooked: false };
```
Add `phoneRequired: !user.phone` to every return object (Claude's Discretion locked "prefer field in eligibility" over a separate endpoint).

**D-03 `bookTrial` — 409 when member lacks phone.** Analog is the status guard already at 627-631:
```typescript
if (userRow.status !== "prueba") {
  throw new ConflictError(
    "El alumno no está en estado 'prueba' — no se puede reservar una sesión de prueba",
  );
}
```
Pull `phone` into the `userRow` select (618-625) and add, right after the status/branch guards (before the tx at 672): if `!userRow.phone` → `throw new ConflictError("Cargale el teléfono al lead antes de agendar la prueba")`. This is a `ConflictError` (409), NOT `PhoneRequiredError` — D-03 wants a 409 shown via admin extract-error, and 409 is the admin's expected-client-error path. Message MUST say what to do (specifics: "ir a la ficha y cargar el teléfono"). Reprogramación (164) is exempt — that path doesn't call `bookTrial`.

---

### `el-templo-api/src/modules/scheduling/schemas.ts` (schema) — D-04

**Analog:** `reserveTrialSchema` (864-887) and `trialEligibilitySchema` (897-920), same file.

`reserveTrialSchema.body` gains an OPTIONAL `phone` (not in `required`) — keep `additionalProperties: false`:
```typescript
properties: {
  scheduleId: { type: "integer", minimum: 1 },
  date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
  branchId: { type: "integer", minimum: 1 },
  phone: { type: "string", minLength: 1, maxLength: 30 }, // NEW, optional
},
```
(`maxLength: 30` mirrors `createTrialMemberSchema.phone` at members/schemas.ts:323.)

`trialEligibilitySchema.response.200.properties` gains `phoneRequired: { type: "boolean" }` and adds it to `required` alongside `eligible`, `alreadyBooked` (901).

---

### `el-templo-api/src/modules/scheduling/routes.ts` (route) — D-04 surface

**Analog:** the `/reserve` handler's error surface (lines 857-882). The `/reserve-trial` handler (889-905) currently only calls `handleServiceError`. Add a `PhoneRequiredError` branch BEFORE it, copying the `PassRequiredError` branch verbatim:
```typescript
// analog (874-880):
if (err instanceof PassRequiredError) {
  return reply.code(400).send({
    error: "Solicitud invalida",
    message: err.message,
    code: "PASS_REQUIRED",
  });
}
```
New branch: `if (err instanceof PhoneRequiredError) { return reply.code(400).send({ error: "Solicitud invalida", message: err.message, code: "PHONE_REQUIRED" }); }`. Add `PhoneRequiredError` to the import from `../shared/errors` (currently imports `CoverageExpiredError`, `PassRequiredError` at 35-36). Also add `phone` to the handler's `Body` generic (890).

---

### `el-templo-api/src/modules/members/service.ts` (service) — D-02 convert-to-trial

**Analog:** `createTrialMember` already enforces phone (816-846) via `normalizePhone` + `ConflictError`. `convertFreemiumToTrial` (1010-1086) currently does NOT check phone. D-02: "convert-to-trial si el user no tiene teléfono" → require it.

The user select (1014-1022) pulls `status`/`deletedAt`; add `phone: schema.users.phone`. After the freemium guard (1027-1031), add:
```typescript
// mirror createTrialMember's phone gate (819-822), but only when the freemium
// has no phone yet AND none was supplied
if (!user.phone && !input.phone?.trim()) {
  throw new ConflictError(
    "Cargale el teléfono al lead antes de convertirlo a sesión de prueba",
  );
}
```
If `input.phone` provided, normalize + write it in the existing tx UPDATE (1058-1067) — same `...(phone ? { phone } : {})` spread as trials-service. `ConvertFreemiumToTrialServiceInput` gains optional `phone?: string`. `normalizePhone` is already imported in this file (used at 819).

---

### `el-templo-api/src/modules/members/schemas.ts` (schema) — D-02

**Analog:** `createTrialMemberSchema` (315-331) has `phone` as required with `{ type: "string", minLength: 1, maxLength: 30 }`. For `convertToTrialSchema` (342-362), add `phone` as OPTIONAL (leave `required: ["branchId"]` unchanged — the service decides based on the existing user's phone):
```typescript
properties: {
  branchId: { type: "integer" },
  phone: { type: "string", minLength: 1, maxLength: 30 }, // NEW, optional
},
```
Keep `additionalProperties: false`. Route handler (members/routes.ts:797-802) then passes `phone: request.body.phone` into `convertFreemiumToTrial`.

---

### `el-templo-api/src/modules/reports/service.ts` (report) — D-06 phone column + CSV

**Analog:** the exact shape added by 164 for `reschedules` / `lead_status_source`. Follow all four touch-points:

1. **Raw SQL SELECT** (1540-1585): add `u.phone AS phone` to both the row query and its result-type block (1518-1538, 1587-1608). `u` is the `users` join alias.
2. **Row typing**: add `phone: string | null` to the two inline result types AND to `mapTrialSessionRow`'s param type (1842-1863).
3. **`mapTrialSessionRow` return** (1906-1929): add `phone: r.phone` (mirrors `reschedules: Number(r.reschedules)` / `leadStatusSource: r.lead_status_source ?? null` at 1927-1928).
4. **CSV** (`exportTrialSessions`, 1633-1693): add `"Teléfono"` to the `headers` array (1642-1658) and `row.phone ?? ""` to the `cells` array (1671-1687) at the same ordinal position. Keep RFC-4180 `csvEscape`.

No count-query change needed (phone isn't filtered). Not filterable/sortable — it's a display+CSV column only.

---

### `el-templo-api/src/modules/reports/types.ts` + `schemas.ts` (D-06)

`types.ts` `TrialSessionsRow` (212-263): add `phone: string | null;` next to `reschedules`/`leadStatusSource` (255-262) with a doc comment.
`schemas.ts` `trialSessionsRowSchema.properties` (493-546): add `phone: { type: ["string", "null"] },` (mirrors `leadNotes` at 533).

---

### `el-templo-api/test/self-service-trial-e2e.test.ts` (NEW) — SELF-01 / D-01

**Analog:** stitch three existing tests into one funnel walk. This is the milestone regression test (validates 163 reset/source + 119 funnel coexist).

- **Setup/scaffold**: copy `beforeAll`/`beforeEach` from `test/scheduling-reserve-trial.test.ts` (43-95) verbatim — fake timers pinned to a Wednesday, `createTestApp()`, admin token via `getAuthToken(app, "admin@test.com", "adminpass123")`, resolve `TEST`/`ONLINE` branch ids, recreate activity+schedule each test. **Discretion note (CONTEXT)**: prefer LOCAL-date helpers over the UTC `thursdayOffset` if the 163/164 helpers expose one (CURDATE is ART); otherwise the `dateOffsetStr` helper in `test/helpers.ts` (37-41) is the canonical offset.
- **register → freemium**: D-01 says the funnel starts at `POST /register`. Use `registerUser(app, {...})` from `test/helpers.ts` (81-123) — it auto-generates unique dni/phone. `/register` forces `status='freemium'`. (Note: `createEligibleFreemium` at helpers 500-526 inserts directly with an old `createdAt` — use it only if a negative test needs the 3-day freshness bypass; the happy path should go through real `/register`.)
- **eligibility**: `GET /api/members/scheduling/trial-eligibility` → assert `eligible:true, alreadyBooked:false` and the NEW `phoneRequired` field. Copy assertion style from `test/scheduling-trial-eligibility.test.ts` (107-114).
- **reserve**: `POST /api/members/scheduling/reserve-trial` → 201, then DB-assert `users.status='prueba'`, `leadStatus='en_seguimiento'`, `leadStatusSource='auto'` (163 wiring), `userStatusHistory.source='self_service'`, `bookings.isTrial=1 source='self_service'`. Copy the multi-table assertion block from `scheduling-reserve-trial.test.ts` (136-185) exactly.
- **admin report**: `GET /api/admin/reports/trial-sessions` (owner/admin token via `createStaffUser`) → the lead appears. Copy report-call + row-find from `test/reports-trial-sessions.test.ts` (setup 255-297, `it` at 314). Assert the NEW `phone` field is present.
- **negatives (D-01)**: active-sub → not eligible (copy `scheduling-reserve-trial.test.ts` 323-357 sub-seeding), second trial → 409 (203-218), self-service cancel reverts prueba→freemium (copy `test/scheduling-cancel-trial.test.ts` pattern). Add a phone negative: freemium with no phone → reserve without `phone` in body → 400 `code:"PHONE_REQUIRED"`; with `phone` → 201 + `users.phone` persisted.

---

### `el-templo-app/src/composables/useSchedulingApi.ts` (app api) — D-04/D-05

**Analog:** `TrialEligibility` interface (39-52) and `reserveTrial` (110-121), same file.

- Add `phoneRequired: boolean` to `TrialEligibility` (after `alreadyBooked`, line 41).
- `reserveTrial` gains optional `phone?: string` param and includes it in the POST body only when present:
```typescript
async function reserveTrial(scheduleId: number, date: string, branchId: number, phone?: string) {
  const response = await api.post<BookingRecord>(
    '/members/scheduling/reserve-trial',
    { scheduleId, date, branchId, ...(phone ? { phone } : {}) },
    { signal: getSignal() },
  )
  return response.data
}
```

---

### `el-templo-app/src/pages/ReservasPage.vue` (app component) — D-05

**Analog:** the trial confirm dialog markup (636-655) and `confirmTrialReserve` (1495-1514), same file. The REGISTRO is untouched (D-05) — phone is captured only in this dialog.

- The dialog (636-655) currently shows only `trialDialog.message` + Confirm/Cancel. Add a `q-input` (tel keyboard, non-empty rule) shown when `trialEligibility?.phoneRequired`. `trialEligibility` ref already at 879; `phoneRequired` becomes available after the type change above.
- `trialDialog` state (915-921) gains `phone: ''`. Bind `v-model="trialDialog.phone"` with `type="tel"`, `inputmode="tel"`, and a non-empty validation rule. There is no existing profile phone `q-input` with rules in this file to mirror — use the admin `requiredRule` shape (TrialMemberFormDialog.vue:123-127) adapted, or a simple inline `:rules="[(v) => !!v?.trim() || 'Ingresá tu teléfono']"`.
- `confirmTrialReserve` (1499): pass `trialDialog.value.phone.trim() || undefined` as the 4th arg to `reserveTrial`. Keep the existing `extractError` catch (1504-1510) — it already surfaces the backend message.

---

### `el-templo-admin/src/components/reports/TrialSessionsReport.vue` (admin) — D-06 + D-07

**D-06 Teléfono column with wa.me.** The wa.me pattern is in `el-templo-admin/src/components/scheduling/SesionesDePruebaDialog.vue` (281-284):
```typescript
function openWhatsapp(phone: string): void {
  const cleaned = phone.replace(/[^0-9]/g, '');
  window.open(`https://wa.me/${cleaned}`, '_blank');
}
```
Add a `{ name: 'phone', label: 'Teléfono', field: 'phone', align: 'left' }` entry to the `columns` array (592+) and a `#body-cell-phone` slot rendering a wa.me link when `props.row.phone`, else `—` (empty cell for legacy leads with no phone — specifics say "celda vacía sin link"). The header/CSV of the client-side export (if any) mirrors the backend `"Teléfono"` header.

**D-07 "Ver ficha" row action.** PARTIAL ANALOG ALREADY PRESENT: the Lead-name cell (128-138) is already a `router-link :to="`/alumnos/${props.row.userId}`"`. D-07 asks for a dedicated row action too — add a `#body-cell-acciones` slot (or reuse the lead router-link) with a `q-btn`/icon `:to="`/alumnos/${row.userId}`"` labelled "Ver ficha". No new page — `/alumnos/:userId` already hosts state-edit + plan assignment.

**Type:** `useReportsApi.ts` `TrialSessionsRowClient` (51-77) gains `phone: string | null;` next to `reschedules`/`leadStatusSource` (72-76).

---

### `el-templo-admin/src/components/TrialMemberFormDialog.vue` (admin) — D-02 VERIFY

**Already satisfied.** The phone `q-input` (23-48) already has `:rules="[requiredRule('Teléfono')]"` and `onSubmit` (141-164) trims + sends it. The backend `createTrialMemberSchema` already requires `phone` (315-331). No change expected — verify the message is accionable and the required rule fires. If the analysis of D-02 finds the field satisfies the requirement, note it as done in the SUMMARY rather than editing.

---

### `el-templo-admin/src/components/scheduling/SlotDetailDialog.vue` (admin) — D-03 VERIFY (error display path)

**Already satisfied for surfacing.** `onBookTrial` (1287-1309) already wraps `bookTrial` in try/catch and shows `schedulingApi.error.value ?? fallback` via `$q.notify`. The NEW 409 from `bookTrial` (added in trials-service) will flow through `extractError` (SlotDetailDialog imports it at 633) automatically. No structural change needed — the new backend message is what the admin will see.

## Shared Patterns

### Typed error + route surface (`code` discriminator)
**Source:** `el-templo-api/src/modules/shared/errors.ts` (49-74) + `scheduling/routes.ts` (857-882).
**Apply to:** D-04 `PHONE_REQUIRED`. The base `AppError.code` is NEVER auto-serialized (errors.ts:10-16) — a route MUST echo it in an explicit `if (err instanceof XError)` branch. Frontend then branches on `err.response.data.code`.
```typescript
export class PhoneRequiredError extends BadRequestError {
  readonly code = "PHONE_REQUIRED";
  constructor(message = "Necesitamos tu teléfono para reservar la sesión de prueba") { super(message); }
}
// route:
if (err instanceof PhoneRequiredError) {
  return reply.code(400).send({ error: "Solicitud invalida", message: err.message, code: "PHONE_REQUIRED" });
}
```

### 409 ConflictError for admin-facing "do X first" guards
**Source:** `members/service.ts` `createTrialMember` (819-846), `trials-service.ts` `bookTrial` (627-638).
**Apply to:** D-02 convert-to-trial no-phone, D-03 bookTrial no-phone. Use `ConflictError` (409) — NOT the typed 400 — because the admin's `extractError`/`isExpectedClientError` treats 409 as an expected client error (no Sentry noise). Message must state the remedy ("cargale el teléfono al lead / andá a la ficha").

### phone normalization (laxo, no strict validator)
**Source:** `el-templo-api/src/modules/shared/phone.ts` `normalizePhone` (11-13) — strips non-digits, keeps last 10.
**Apply to:** every path that persists a captured phone (reserveTrialSelfService, convertFreemiumToTrial). D-04 explicitly forbids inventing a strict/E.164 validator. Already imported in members/service.ts; add the `../shared/phone` import to trials-service.ts.

### atomic write inside the existing tx
**Source:** `trials-service.ts` `reserveTrialSelfService` tx (306-362), `members/service.ts` `convertFreemiumToTrial` tx (1057-1079).
**Apply to:** persist the phone in the SAME `tx.update(users)` that flips the status — never a second round-trip (mirrors how `branchId`/`leadStatus`/`createdBy` are set together).

### wa.me link from a phone cell
**Source:** `SesionesDePruebaDialog.vue` `openWhatsapp` (281-284) — `phone.replace(/[^0-9]/g,'')` → `https://wa.me/${cleaned}`.
**Apply to:** D-06 report Teléfono column. (The member app uses a different helper — `buildWhatsAppUrl` from `src/utils/whatsapp`, ReservasPage 784/925 — country-aware; the admin report should use the admin `wa.me` pattern for consistency with SesionesDePruebaDialog.)

### 164-column extension shape (report)
**Source:** the `reschedules` + `lead_status_source` columns threaded through `reports/service.ts` (SQL 1559-1563, result-type ×2, mapper 1927-1928), `reports/types.ts` (257-262), `reports/schemas.ts` (541-544), `useReportsApi.ts` client type (72-76), CSV headers/cells (1656/1685).
**Apply to:** D-06 `phone` — same six touch-points, identical ordering discipline.

## No Analog Found

None. Every change in this phase extends an existing Phase-119/114/163/164 code path.

## Metadata

**Analog search scope:** `el-templo-api/src/modules/{scheduling,members,reports,shared}`, `el-templo-api/test/`, `el-templo-app/src/{pages,composables}`, `el-templo-admin/src/{components,composables}`.
**Files scanned:** ~22 read, ~30 grepped.
**Pattern extraction date:** 2026-07-16
