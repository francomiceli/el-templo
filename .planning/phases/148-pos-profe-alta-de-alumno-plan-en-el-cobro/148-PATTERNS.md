# Phase 148: PoS profe — alta de alumno + plan en el cobro - Pattern Map

**Mapped:** 2026-06-26
**Files analyzed:** 11 (6 backend, 3 frontend, 2 test/schema)
**Analogs found:** 11 / 11 (all in-repo, exact or role-match)

> Every file in this phase EXTENDS shipped code (Fase 137/140/141/146). There are
> no greenfield files — even the "new" backend endpoint lives inside the existing
> `coach-load-routes.ts` plugin and reuses its module guard, its idempotency
> pattern, and the same `transactionService.create` primitive. Copy aggressively
> from the listed analogs; do NOT invent new structure.

---

## File Classification

| New/Modified File                                                                                     | Role             | Data Flow                        | Closest Analog                                                  | Match Quality |
| ----------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------- | --------------------------------------------------------------- | ------------- |
| `el-templo-api/src/modules/finance/coach-load-routes.ts` (MODIFY — add `POST /alta`)                  | route            | request-response / orchestration | `POST /pay-plan` + `POST /misc` in the SAME file                | exact         |
| `el-templo-api/src/modules/subscriptions/service.ts` — `assignPlan` (MODIFY) + `AssignPlanInput` type | service          | CRUD / transform                 | `renewSubscription` path + `recordAssignmentCharge` (same file) | exact         |
| `el-templo-api/src/modules/members/service.ts` — new `createMinimalMember` (or extend)                | service          | CRUD                             | `createTrialMember` (same file, L724)                           | exact         |
| `el-templo-api/src/modules/finance/transaction-service.ts` — `void()` / `_void()` (MODIFY: cascade)   | service          | event-driven (cascade)           | existing `keepMembershipActive=false` cancel branch in `_void`  | exact         |
| `el-templo-api/src/db/schema/financial-transactions.ts` (MODIFY: "creó alumno" flag)                  | model            | —                                | sibling nullable columns (`miscReason`, `idempotencyKey`)       | role-match    |
| `el-templo-api/test/coach-load-alta.test.ts` (NEW)                                                    | test             | —                                | existing coach-load tests in `test/`                            | role-match    |
| `el-templo-admin/src/pages/CargarPagoPage.vue` (MODIFY: 3rd mode)                                     | component (page) | request-response                 | the page itself (renew/misc modes)                              | exact         |
| `el-templo-admin/src/composables/useFinanceLoadApi.ts` (MODIFY: `altaConPlan`)                        | composable       | request-response                 | `payPlan` / `miscCharge` (same file)                            | exact         |
| New-student mini-form + plan grid (inline in `CargarPagoPage.vue`)                                    | component        | —                                | `AssignPlanDialog.vue` plan grid + `plansByTier`                | role-match    |
| Turnos picker (reused as-is)                                                                          | component        | —                                | `FixedSchedulePicker.vue` (no changes)                          | exact (reuse) |
| `el-templo-api/src/modules/finance/schemas.ts` — `voidTransactionSchema` (maybe MODIFY)               | config           | —                                | existing `voidTransactionSchema`                                | exact         |

---

## Pattern Assignments

### `coach-load-routes.ts` — new `POST /alta` (route, orchestration)

**Analog:** the two existing handlers `POST /pay-plan` (L247-391) and `POST /misc` (L398-466) in the same file.

**Module guard — REUSE VERBATIM, do NOT add a new one** (L148-159). The plugin already
authenticates + gates `FINANCE_LOAD_ROLES` (coach ∈) + `attachCountryScope`. The new
endpoint inherits it automatically:

```typescript
fastify.addHook("onRequest", async (request, reply) => {
  await fastify.authenticate(request, reply);
  if (!(FINANCE_LOAD_ROLES as readonly string[]).includes(request.user.role)) {
    return reply
      .code(403)
      .send({ error: "Acceso denegado", message: "Sin permiso de carga" });
  }
  await attachCountryScope(request, fastify.db);
});
```

**Inline JSON schema pattern** (L76-114) — `additionalProperties:false`, enumerated
payment method, idempotencyKey `minLength:1 maxLength:64`, and **NEVER** a
`cashRegisterId`/`validationStatus` field (server-derived). For `/alta` the body adds:
a member-or-new branch (`userId?` XOR `{firstName,lastName,dni}`), `planId`,
`priceType`/`zero` toggle, `paymentMethod`, `amountReceived?`, `scheduleIds?`,
`branchId` (the chosen sede — NEW: this endpoint DOES accept branchId, unlike pay-plan).
Copy the `coachPayPlanSchema`/`coachMiscLoadSchema` shape:

```typescript
const coachPayPlanSchema = {
  body: {
    type: "object",
    required: ["userId", "paymentMethod", "idempotencyKey"],
    additionalProperties: false,
    properties: {
      userId: { type: "integer", minimum: 1 },
      amountReceived: { type: "integer", minimum: 0 },
      paymentMethod: { type: "string", enum: PAYMENT_METHOD_ENUM },
      idempotencyKey: { type: "string", minLength: 1, maxLength: 64 },
    },
  },
} as const;
```

**Branch resolution + caja sugerida (CAJA-01, Fase 146)** — REUSE the existing
`resolveSuggestedCaja` / `resolveRecorderBranchId` helpers (L194-233). For `/alta` the
sede comes from `body.branchId` (the chosen sede), gated by `requireBranchAccess`
(see Shared Patterns). The caja is still suggested from the **profe's** sede via
`request.user.userId`, identical to pay-plan/misc.

**Server-derived birth status** (L301-306, repeated L414-419) — copy exactly:

```typescript
const initialStatus = (["coach"] as readonly string[]).includes(
  request.user.role,
)
  ? "pendiente"
  : "validado";
```

**Idempotency no-op on duplicate key** (L373-389 in pay-plan, L453-462 in misc) —
copy verbatim. A double-submit catches `isDuplicateKeyError`, re-reads
`findByIdempotencyKey`, returns 200 with the existing charge. CRITICAL: the whole
orchestration (create member + assignPlan + charge) must roll back wholesale on the
dup so a replay never leaves a half-created member:

```typescript
} catch (err: unknown) {
  if (isDuplicateKeyError(err).isDuplicate) {
    const existing = await transactionService.findByIdempotencyKey(idempotencyKey);
    if (existing) return reply.code(200).send({ transaction: existing });
  }
  handleServiceError(err, reply, request.log, "coach alta-con-plan");
}
```

**Service wiring** — the plugin already instantiates `subscriptionService`,
`transactionService`, `memberService` is NOT yet wired here (only members/routes.ts
has it). The orchestrator must instantiate `MemberService` in the plugin closure
(mirror L82-91 of members/routes.ts) OR add a minimal-create method that
`subscriptionService` can reach. Recommend instantiating `MemberService` in the
coach-load plugin alongside the existing services (L124-142).

**Orchestration order** (from CONTEXT decision + BRIEF L42-46):

1. Resolve member: `userId` → use it; else dedup by DNI (`memberService.checkDuplicates({dni})`) → existing match → use it; else `createMinimalMember`.
2. `assignPlan(memberId, {planId, branchId, scheduleIds, priceTypeApplied, paymentMethod, amountReceived, recorderRole, idempotencyKey, recorderBranchId})`.
3. assignPlan internally creates the `plan_charge` via `recordAssignmentCharge` born `pendiente` (coach) + idempotent — see next section. **No separate `transactionService.create` call needed** if `AssignPlanInput` is extended to thread these (preferred — single source of the charge).

---

### `subscriptions/service.ts` — `assignPlan` + `AssignPlanInput` (service, CRUD)

**Analog:** `renewSubscription` already threads `recorderRole` + `idempotencyKey` +
`recorderBranchId` into `recordAssignmentCharge` (L3658-3675). `assignPlan` calls
`recordAssignmentCharge` too but its input type lacks these fields.

**GAP TO CLOSE (load-bearing):** `AssignPlanInput` (types.ts L226-268) has
`amountReceived`, `appliedMiscChargeId` but **NOT** `recorderRole` / `idempotencyKey`
/ `recorderBranchId`. `RenewSubscriptionInput` (L270-309) HAS all three with full
doc comments. Copy those three fields into `AssignPlanInput` verbatim:

```typescript
recorderRole?: AdminRole;       // coach → charge born 'pendiente'
idempotencyKey?: string;        // nullable UNIQUE → double-tap dedup
recorderBranchId?: number;      // CAJA-01 — caja sugerida = sede del profe
```

Then forward them in `assignPlan`'s `recordAssignmentCharge` call (the charge sink is
L1349/L1366 inside the tx). `recordAssignmentCharge` (L285-333) ALREADY accepts all
three params and derives `validationStatus = recorderRole === "coach" ? "pendiente" :
"validado"` (L332-333) — no change needed there.

**Price selection (Zero / medio de pago)** — `getBasePrice(plan, priceTypeApplied)` is
called at L1074. The route maps the PoS toggle to `priceTypeApplied`:
`card → "credit_card"`, else `zero ? "zero" : "regular"`. The admin frontend already
does this mapping in `getBasePrice()` (AssignPlanDialog L1428-1438) — mirror it.
Schema columns confirmed in `subscription-plans.ts` L37-39: `priceRegular`,
`priceZero`, `priceCreditCard` (nullable).

**Partial → deuda** — pass `amountReceived` (< pricePaid). assignPlan already supports
this (`amountReceived?` L258, validated `0 <= amountReceived <= pricePaid`). The
`recordAssignmentCharge` seeds a positive balance row (debt) — no new logic.

**Fixed-plan schedule validation** (L1107-1142) — already enforces `scheduleIds.length
=== plan.classesPerWeek` for `bookingMode==='fixed'`, and rejects schedules on online
plans. `generateFixedBookings` runs inside the same tx (L1200-1214). REUSE AS-IS; the
PoS just passes `scheduleIds` from `FixedSchedulePicker`.

---

### `members/service.ts` — minimal-create (service, CRUD)

**Analog:** `createTrialMember` (L724-804) — the closest pattern (creates a member with
a SUBSET of fields, status `'prueba'`, in a tx that also writes `userStatusHistory`).

**Why a NEW method, not reuse:** `createMember` (L632-703) REQUIRES email + dni;
`createTrialMember` requires phone, sets dni=NULL. The PoS path is **nombre + DNI +
sucursal**, no email/phone (CONTEXT L70-74). Build `createMinimalMember` by copying
`createTrialMember`'s tx structure (L762-795) but: set `dni` (not phone), `email=null`,
`status='prueba'`, `level='kairos'`, write the `userStatusHistory` row
(`fromStatus:null, toStatus:'prueba', source:'admin'`):

```typescript
const userId = await this.db.transaction(async (tx) => {
  const result = await tx.insert(schema.users).values({
    passwordHash,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    dni: input.dni,
    branchId: input.branchId,
    role: "member",
    level: "kairos",
    status: "prueba" as const,
    createdBy: input.createdBy, // JWT-sourced, per D-31 spoof guard
  });
  const newUserId = Number(result[0].insertId);
  await tx.insert(schema.userStatusHistory).values({
    userId: newUserId,
    fromStatus: null,
    toStatus: "prueba",
    source: "admin",
  });
  return newUserId;
});
```

**Dedup BEFORE create** — `checkDuplicates` (L1360-1428) already returns DNI/phone
matches with `matchedField`. The route calls it with `{dni}`; a `matchedField:'dni'`
hit (non-deleted) → load against `match.id`, skip create. The frontend ALSO calls
`GET /admin/members/check-duplicates?dni=` on DNI blur for the live banner — server is
the authority on Confirmar.

**DNI uniqueness race** — `users.dni` UNIQUE; wrap create in the same
`isDuplicateKeyError` catch the orchestrator uses, and on a `dni` dup re-run dedup to
load the existing member (defensive, mirrors createMember L562-581).

---

### `transaction-service.ts` — `void()` cascade (service, event-driven)

**Analog:** the existing `keepMembershipActive=false` branch in `_void` (L469-507+).
`void()` (L385-404) already wraps `_void` in a tx; `_void` already cancels the linked
subscription via the `SubscriptionCanceller` when `keepMembershipActive=false`
(documented L464-467).

**What ALTA-06 adds:** when the voided charge **created a new member**, also flip that
member to inactive (do NOT delete — FK safety, CONTEXT L48-50). Pattern for the
status-flip-with-history already exists in members/routes.ts L848-870 (UPDATE
`status:'inactivo'` + insert `userStatusHistory` `source:'admin'` in one tx). Apply the
SAME write inside `_void`'s tx, gated on a "this charge created member X" flag:

```typescript
// inside _void tx, after the soft-void + (optional) sub cancel:
if (existing.createdMemberId) {  // new column, see schema below
  await tx.update(schema.users).set({ status: "inactivo" })
    .where(eq(schema.users.id, existing.createdMemberId));
  await tx.insert(schema.userStatusHistory).values({
    userId: existing.createdMemberId, fromStatus: <read-before>, toStatus: "inactivo", source: "admin",
  });
}
```

**Note:** the `SubscriptionCanceller` cascade (cancel sub + future bookings) is ALREADY
the right behavior for the membership. The member-inactive flip is the only genuinely
new step. For PREEXISTING members (`createdMemberId` null) the void behaves exactly as
today (CONTEXT L50).

**Void route handler** (`finance/routes.ts` L338-406) — needs NO change to its guard
(`FINANCE_VOID_ROLES`, coach excluded — correct: gestión voids in the bandeja). The
cascade is server-side in the service. The bandeja copy distinction (UI-SPEC L268-273)
is driven by surfacing `createdMemberId`/`createdMemberName` on the transaction detail.

---

### `financial-transactions.ts` — "creó alumno" flag (model)

**Analog:** sibling nullable columns added in prior phases — `miscReason` (Fase 145),
`idempotencyKey` (Fase 140, mig 0156). Add `createdMemberId int` (nullable FK to
`users.id`) so void can find the member to inactivate AND the bandeja can render the
enhanced confirmation copy. Follow the project migration rules in CLAUDE.md:
`pnpm db:generate` then commit the SQL (MEMORY: always commit migration SQL; the repo's
`db:generate` is known-flaky → hand-written migration may be required, like 0158).
Next migration number is **0162** (last applied: 0161, v5.3).

---

### `el-templo-api/test/coach-load-alta.test.ts` (NEW, test)

**Analog:** existing coach-load route tests in `el-templo-api/test/` (see `test/helpers.ts`
for auth/request utilities, per CLAUDE.md). Required cases (CONTEXT ALTA-08):
crear-nuevo, dedup-contra-existente, parcial→deuda, fixed-con-scheduleIds,
void→cascade (member inactivo + sub cancelada), idempotencia (doble-submit = 1 member +
1 charge). Tests run against real MySQL `eltemplo_test` in CI (do NOT run locally per
MEMORY — typecheck locally only).

---

### `CargarPagoPage.vue` — 3rd mode (component/page)

**Analog:** the page itself. Add `'alta'` to the `Mode` type (L240) and a 3rd
`q-btn-toggle` option (L14-17):

```vue
:options="[ { label: 'Pago de plan', value: 'renew' }, { label: 'Cobro suelto',
value: 'misc' }, { label: 'Alta + plan', value: 'alta' }, ]"
```

**Reuse verbatim:** the socio typeahead (L25-56, `onMemberSearch` L321-367), the
payment-method buttons (L141-161), the sticky Confirmar (L208-221), the idempotency
lifecycle (`currentIdempotencyKey` L283, regen-on-success L427-430 + L457), the
`resetChargeFields`/`onModeChange` philosophy (L370-395), and the "Mis cargas" list
(L180-202). The Alta panel is an inline `<template v-if="mode === 'alta'">` block (A1 —
NOT a dialog).

**New surface only:** sucursal chip (`q-select dense`), `+ Nuevo alumno` action in the
typeahead `#no-option` (L39-45), the 3-field mini-form, DNI-dedup banner (copy the
deuda-banner pattern L60-71 → `bg-warning text-dark`), the plan grid (see next), and
the conditional `FixedSchedulePicker`.

**Confirmar gate** — extend `canConfirm` (L302-310): (member selected OR
nombre+DNI present) AND sucursal AND plan AND method AND amount>0 AND (fixed ⇒
scheduleIds.length === classesPerWeek). Mirror UI-SPEC L202.

---

### `useFinanceLoadApi.ts` — `altaConPlan` (composable)

**Analog:** `payPlan` (L114-129) / `miscCharge` (L135-150) in the same file — identical
shape (`loading`/`error` refs, `api.post`, `extractError`, re-throw). Add:

```typescript
async function altaConPlan(body: CoachAltaInput): Promise<CoachAltaResponse> {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await api.post<CoachAltaResponse>(
      "/admin/finance/coach-load/alta",
      body,
    );
    return data;
  } catch (err: unknown) {
    error.value = extractError(err, "No se pudo cargar. Reintentá.");
    throw err;
  } finally {
    loading.value = false;
  }
}
```

Add `CoachAltaInput` mirroring `CoachPayPlanInput` (L28-35) plus the new-student +
plan + scheduleIds fields. Export it from the returned object (L179-187). The
typeahead `searchMembers` + `check-duplicates` come from `useMembersApi` (already
imported in the page, L237).

---

### Plan grid (inline in `CargarPagoPage.vue`)

**Analog:** `AssignPlanDialog.vue` plan grid (L54-83) + `plansByTier` (L1192-1204) +
`tierColor`/`tierLabel` (L1414-1426). Reuse the tier-grouped `q-list`/`q-item` with the
tier badge; each row ≥56px `clickable v-ripple`, selected row highlighted `$primary`.
Plans loaded via `useSubscriptionsApi().getPlans(true, { branchId })` (the dialog uses
exactly this, L1447) filtered to the chosen sucursal. Price toggle = a single
`q-toggle` "Precio Zero" (A6 — simpler than the dialog's 3-way `q-btn-toggle`);
`card` payment method overrides to `priceCreditCard`. Partial banner: copy
`isPartialCharge` (L1276-1279) + the yellow banner template (L783-794).

---

### Turnos picker — `FixedSchedulePicker.vue` (REUSE, no edit)

**Analog:** AssignPlanDialog usage (L376-387). Props contract (FixedSchedulePicker
L172-199): `v-model` (number[]), `:branch-id` (the chosen sucursalId, drives slot
load), `:required-count="plan.classesPerWeek"`, `:allow-partial="false"` (fixed exact),
`:multi-branch` only if `plan.multiBranch`. Renders ONLY when
`plan.bookingMode === 'fixed'` (CONTEXT L66-67). Flexible plans show a caption, no
picker. No changes to the component.

---

## Shared Patterns

### Authentication / role gate

**Source:** `coach-load-routes.ts` L148-159 (`FINANCE_LOAD_ROLES`, coach ∈) +
`shared/permissions.ts` L143 (`FINANCE_LOAD_ROLES = [...FINANCE_WRITE_ROLES, "coach"]`).
**Apply to:** the new `/alta` endpoint (inherited from the plugin's module hook — add
NO new guard). Void stays `FINANCE_VOID_ROLES` (L149, coach excluded) on the gestión side.

### Branch access (the chosen sede)

**Source:** `shared/branch-access.ts` `requireBranchAccess({ from: "body.branchId" })`,
used at members/routes.ts L489/L600/L642.
**Apply to:** `/alta` as a `preHandler` so the profe can only load for sedes in scope
(CONTEXT L55). NOTE: the coach-load plugin's other endpoints do NOT accept branchId —
`/alta` is the first to, so this preHandler is genuinely new for this plugin.

### Idempotency (atomic + no-op replay)

**Source:** `coach-load-routes.ts` L373-389 (catch `isDuplicateKeyError` → re-read
`findByIdempotencyKey` → 200) + page lifecycle `CargarPagoPage.vue` L283/L427-430.
**Apply to:** `/alta` — the WHOLE orchestration in ONE conceptual idempotent unit; a
replay returns the existing charge and creates neither a 2nd member nor a 2nd charge.

### Server-derived birth status

**Source:** `recordAssignmentCharge` L332-333 + `coach-load-routes.ts` L301-306.
**Apply to:** the alta charge — born `pendiente` because `recorderRole==='coach'`. Never
from the body.

### Error handling

**Source:** `handleServiceError(err, reply, request.log, "...")` (coach-load L388/L463)

- `isDuplicateKeyError` (members L563-581). `catch (err: unknown)` + `instanceof`
  narrowing per CLAUDE.md (no `any`).
  **Apply to:** all backend handlers/services in this phase.

### Caja sugerida (CAJA-01, Fase 146)

**Source:** `resolveSuggestedCaja` (coach-load L204-233) — caja from the profe's sede
via `request.user.userId`; ledger `branch_id` stays the socio's.
**Apply to:** `/alta` (thread `recorderBranchId` into the extended `AssignPlanInput`).

### Status flip + history (member → inactivo)

**Source:** members/routes.ts L848-870 (UPDATE status + insert `userStatusHistory`
`source:'admin'` in one tx, dedupe on from==to).
**Apply to:** the void cascade in `_void` for created members.

---

## No Analog Found

| File   | Role | Data Flow | Reason                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------ | ---- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (none) | —    | —         | Every surface has a strong in-repo analog. The only genuinely new sub-patterns are (a) `AssignPlanInput` gaining the 3 recorder fields — copied field-for-field from `RenewSubscriptionInput`; (b) `createdMemberId` column — modeled on sibling nullable columns; (c) `requireBranchAccess` on a coach-load endpoint — the preHandler exists, just not yet wired in this plugin. None require RESEARCH.md fallback patterns. |

---

## Metadata

**Analog search scope:** `el-templo-api/src/modules/{finance,members,subscriptions,scheduling,shared}`, `el-templo-api/src/db/schema`, `el-templo-admin/src/{pages,composables,components,components/scheduling}`.
**Files scanned:** 11 read in full or in targeted ranges; ~6 grepped for symbol locations.
**Pattern extraction date:** 2026-06-26
