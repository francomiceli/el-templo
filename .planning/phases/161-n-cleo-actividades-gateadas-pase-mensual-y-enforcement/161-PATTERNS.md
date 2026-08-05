# Phase 161: Núcleo — actividades gateadas, pase mensual y enforcement - Pattern Map

**Mapped:** 2026-07-14
**Files analyzed:** 20 (create/modify)
**Analogs found:** 20 / 20 (100% — brownfield, cero código nuevo sin precedente)

> Todo el andamiaje (cobro, cupo, ventana, budget, multi-sub, error tipado, seed por migración) ya existe en el repo. El trabajo real es **extender criterios de 2 categorías a 3** y **rutear el consumo por actividad**. Cada archivo nuevo/modificado tiene un análogo directo con líneas exactas abajo.

---

## File Classification

| New/Modified File                                                           | Role              | Data Flow        | Closest Analog                                                 | Match Quality |
| --------------------------------------------------------------------------- | ----------------- | ---------------- | -------------------------------------------------------------- | ------------- |
| `el-templo-api/src/db/migrations/0179_*.sql`                                | migration         | batch/seed       | `db/migrations/0091_multi_currency_and_country_scope.sql`      | exact         |
| `el-templo-api/src/db/schema/subscription-plans.ts`                         | model/schema      | —                | (self, in-place edit)                                          | self          |
| `el-templo-api/src/db/schema/activities.ts`                                 | model/schema      | —                | (self, in-place edit — `maxCapacity` col is the precedent)     | self          |
| `el-templo-api/src/modules/subscriptions/types.ts`                          | model/types       | transform        | `isOnlinePlan` helper (self, lines 31-39)                      | self          |
| `el-templo-api/src/modules/subscriptions/schemas.ts`                        | config/validation | request-response | 3 `planCategory` enum whitelists (self, :35,:181,:223)         | self          |
| `el-templo-api/src/modules/shared/errors.ts`                                | utility           | —                | `CoverageExpiredError` (self, :49-57)                          | exact         |
| `el-templo-api/src/modules/scheduling/booking-service.ts`                   | service           | request-response | `reserve()` coverage block (self, :85-160)                     | self          |
| `el-templo-api/src/modules/scheduling/routes.ts`                            | route             | request-response | `/reserve` COVERAGE_EXPIRED catch (self, :813-825)             | self          |
| `el-templo-api/src/modules/subscriptions/service.ts`                        | service           | CRUD             | `assignPlan` :1244-1400, `renewSubscription` :3791-3912 (self) | self          |
| `el-templo-api/src/modules/attendance/service.ts`                           | service           | event-driven     | classesRemaining decrement (self, :240-256 + 3 more)           | self          |
| `el-templo-api/src/jobs/mark-no-shows.ts`                                   | job               | batch            | `getMemberSubscription` decrement (self, :83)                  | self          |
| `el-templo-api/src/modules/analytics/member-flows-service.ts`               | service           | transform/read   | innerJoin subscriptionPlans (self, :193,296,379)               | self          |
| `el-templo-api/src/modules/analytics/{churn,renewal,ltv,ticket}-service.ts` | service           | transform/read   | innerJoin subscriptionPlans sin filtro                         | role-match    |
| referral guard (núcleo fase 157)                                            | service           | CRUD             | `qualifyReferralOnCharge` callsites (self, :1377,3627,3966)    | self          |
| `el-templo-admin/src/components/scheduling/ActivitiesDialog.vue`            | component         | request-response | maxCapacity q-input (self, :85-95 + form iface :146-150)       | self          |
| `el-templo-admin/src/types/scheduling.ts`                                   | model/types       | —                | `ActivityRecord` (self)                                        | self          |
| `el-templo-admin/src/components/AssignPlanDialog.vue`                       | component         | request-response | `filteredPlans` categoryFilter (self, :1250-1259)              | self          |
| `el-templo-admin/src/components/MemberSubscriptionTab.vue`                  | component         | request-response | (self — sección de venta por categoría)                        | role-match    |
| `el-templo-admin/src/types/subscription.ts`                                 | model/types       | —                | admin `PlanCategory` union                                     | self          |
| `test/subscriptions/especial-pass.test.ts` (nuevo)                          | test              | integration      | `test/subscriptions/dual-subscription.test.ts`                 | exact         |
| `test/scheduling/especial-gating.test.ts` (nuevo)                           | test              | integration      | `test/subscriptions/class-tracking.test.ts` + `_helpers.ts`    | role-match    |
| `test/analytics/especial-exclusion.test.ts` (nuevo)                         | test              | integration      | dual-subscription structure + analytics fixtures               | role-match    |

**Migration number confirmed:** `ls migrations/*.sql | sort | tail` → max aplicado = `0178_referrals_ab_copy_test.sql`. Next free = **0179**. Re-verificar justo antes de generar (otra rama v5.6/v5.7 podría tomarlo).

---

## Pattern Assignments

### `0179_*.sql` (migration, batch/seed) — enum modify + column add + seed 2 planes

**Analog:** `el-templo-api/src/db/migrations/0091_multi_currency_and_country_scope.sql`

**Seed pattern** (0091 lines 69-80) — copiar la forma exacta del INSERT IGNORE. El índice único `ux_subscription_plans_name_country` que la 0091 creó (líneas 52-53) YA existe en prod, así que `INSERT IGNORE` dedupe por `(name, country)` sin recrearlo:

```sql
INSERT IGNORE INTO subscription_plans
  (name, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, multi_branch, is_trial, is_group,
   group_max_members, is_active, is_archived, country, currency,
   created_at, updated_at)
VALUES
  ('Flex', 'flex', 'fixed', 'presencial', 3,
   7000, 7000, NULL,
   30, 2, 0, 0, 0,
   NULL, 1, 0, 'ES', 'EUR',
   NOW(), NOW());
```

**Adaptación para los 2 pases** (D-12, D-03, D-14): `plan_category='especial'`, `classes_per_week=NULL`, **nueva col `monthly_class_budget=2`**, `duration_days=30`, `country='AR'`, `currency='ARS'`, precios exactos (Socio 10000, Externo 20000). Si se agrega discriminador `requires_presencial` (Open Q 1), setearlo `1` solo en el Socio.

**Enum MODIFY** (patrón: la migración debe reflejar byte-for-byte el `mysqlEnum` del schema):

```sql
ALTER TABLE subscription_plans
  MODIFY plan_category enum('presencial','online_regular','online_goal','online_coach','especial') NOT NULL;
```

**Column add** (patrón ALTER de 0091 líneas 22-27, nullable sin default → planes online quedan NULL):

```sql
ALTER TABLE subscription_plans ADD COLUMN monthly_class_budget INT NULL;
ALTER TABLE activities ADD COLUMN is_special BOOLEAN NOT NULL DEFAULT 0;
```

**Header/comment discipline** (0091 lines 1-16): docstring que enumera secciones + explica idempotencia. **CRÍTICO (Pitfall 6, skill Hard Rule 2): NUNCA un `;` dentro de un comentario `--`** — el runner splitea por `;` antes de stripear comentarios (incidente 0119). Usar `--> statement-breakpoint` si hace falta prosa entre statements.

---

### `subscription-plans.ts` + `activities.ts` (schema) — enum value + columnas

**Analog:** self (in-place). Referencia de forma en `subscription-plans.ts:22-27` y `activities.ts:18-22` (col `maxCapacity` nullable-sin-default es el precedente exacto de "agregar col sin cambio de comportamiento").

**Enum append-last** (`subscription-plans.ts:22-27`) — agregar `"especial"` **al final** (skill Hard Rule 6, orden byte-for-byte con el SQL):

```typescript
export const planCategoryEnum = mysqlEnum("plan_category", [
  "presencial",
  "online_regular",
  "online_goal",
  "online_coach",
  "especial", // ← append last
]);
```

**Columna nueva** (patrón `activities.ts:18-22` — nullable, sin default, comentario que documenta el "cero cambio de comportamiento"):

```typescript
// subscription-plans.ts, dentro de mysqlTable:
monthlyClassBudget: int("monthly_class_budget"), // NULL para planes no-especiales
// activities.ts:
isSpecial: boolean("is_special").default(false).notNull(),
```

---

### `types.ts` (model/types) — grupo de categoría de 3 valores

**Analog:** self, `isOnlinePlan` en `types.ts:31-33` (el binario a reemplazar) y `PlanCategory` en `:25-29`.

**Problema** (Research Pattern 3): `isOnlinePlan('especial')` devolvería `true`, lumpeando el pase con online y disparando el conflicto "ya tiene online" en `assignPlan`. Agregar `especial` a la union y un helper de grupo:

```typescript
export type PlanCategory =
  | "presencial"
  | "online_regular"
  | "online_goal"
  | "online_coach"
  | "especial"; // ← nuevo

export type CategoryGroup = "presencial" | "online" | "especial";
export function categoryGroup(c: PlanCategory): CategoryGroup {
  if (c === "presencial") return "presencial";
  if (c === "especial") return "especial";
  return "online";
}
```

Auditar TODOS los usos: `grep -rn isOnlinePlan src/` y `grep -rn online_coach src/` (cada match probablemente necesita `especial`).

---

### `schemas.ts` (config/validation) — 3 whitelists JSON-schema

**Analog:** self, `schemas.ts:35, :181, :223`. Los 3 son `enum: ["presencial","online_regular","online_goal","online_coach"]` — agregar `"especial"` a los tres. **Pitfall 3:** olvidar esto pasa tsc (tipos vienen del TS) pero rompe CI contra MySQL real.

---

### `errors.ts` (utility) — PassRequiredError

**Analog:** self, `CoverageExpiredError` en `errors.ts:49-57` (exact — mismo patrón, misma jerarquía `BadRequestError` con `code` legible).

**Copiar la forma** (errors.ts:49-57):

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

El `AppError.code` (errors.ts:16) NO se serializa por defecto — el handler de la ruta debe surfacearlo (ver routes.ts abajo).

---

### `booking-service.ts` (service, request-response) — gating en reserve()

**Analog:** self, `reserve()` en `booking-service.ts:85-160`.

**Orden actual de validación** (booking-service.ts:85-160): `slot → ventana (:79) → sub singular (:86) → coverage (:98-102) → cross-country (:138-150) → budget (:153-160) → semanal (:215) → dup (:235) → capacidad`. El gating nuevo entra **entre sub y budget**.

**Patrón sub singular a REEMPLAZAR** (booking-service.ts:86-90) — hoy usa el singular sin criterio de actividad:

```typescript
const subscription =
  await this.subscriptionService.getMemberSubscription(memberId);
if (!subscription) {
  throw new BadRequestError("No tenes una suscripcion activa");
}
```

**Patrón de error tipado en el flujo** (copiar de coverage block, booking-service.ts:98-102):

```typescript
const coveredUntil = await this.subscriptionService.getCoveredUntil(memberId);
if (coveredUntil !== null && date > coveredUntil) {
  throw new CoverageExpiredError();
}
```

**Patrón staff-bypass por rol** (booking-service.ts:118-130, 142-150, 184-192) — el gating duro es solo para `actorRole === "member"` (D-07). El actor se resuelve server-side:

```typescript
const [actor] = await this.db
  .select({ role: schema.users.role })
  .from(schema.users)
  .where(eq(schema.users.id, memberId)).limit(1);
const actorRole: string = actor?.role ?? "member";
// ...
if (actorRole === "member" && /* regla */) throw new BadRequestError(...);
```

**Nuevo (GATE-01/03/04, D-06):** extender `getScheduleSlotRaw` (:1899, ya trae `activityId`) con JOIN a `activities` para traer `isSpecial`; usar `pickSubscriptionForActivity` (nuevo en subscriptions/service) en lugar del singular; lanzar `PassRequiredError` si member+especial sin pase; bloquear especial-only en actividades regulares; y para D-06 pasar un `windowDays` extendido a `assertDateWithinWindow` (:79, ya parametriza `MEMBER_BOOKING_WINDOW_DAYS`).

**adminAddBooking (~:528, D-07):** variante con aviso confirmable — mismo patrón staff-bypass por rol.

---

### `routes.ts` (route, request-response) — surface PASS_REQUIRED

**Analog:** self, `/reserve` catch en `scheduling/routes.ts:813-825` (exact).

**Copiar el branch** (routes.ts:818-824 — `handleServiceError` no emite `code`, hay que agregarlo explícito):

```typescript
} catch (err: unknown) {
  if (err instanceof CoverageExpiredError) {
    return reply.code(400).send({
      error: "Solicitud invalida",
      message: err.message,
      code: "COVERAGE_EXPIRED",
    });
  }
  handleServiceError(err, reply, request.log, "member reserve");
}
```

Agregar un `if (err instanceof PassRequiredError)` idéntico con `code: "PASS_REQUIRED"`.

---

### `subscriptions/service.ts` (service, CRUD) — assign/renew guards, budget, routing

**Analog:** self. Cuatro sub-patrones:

**1. Conflicto por grupo de categoría** (assignPlan, `service.ts:1244-1277`) — reescribir el binario `planIsOnline` a comparar por `categoryGroup`:

```typescript
// Patrón actual (binario a extender):
const planIsOnline = isOnlinePlan(plan.planCategory);
// ... .where(and(..., planIsOnline
//        ? ne(schema.subscriptionPlans.planCategory, "presencial")
//        : eq(schema.subscriptionPlans.planCategory, "presencial")))
```

Reemplazar por: una sub active/paused/scheduled **por grupo** (presencial / online / especial), de modo que especial no choque con presencial ni online.

**2. Budget explícito** (assignPlan, `service.ts:1396-1400`; renew `:3908-3912`) — extender el derivado para usar la columna cuando `classesPerWeek` es NULL:

```typescript
// Patrón actual:
const classesRemaining =
  plan.classesPerWeek !== null
    ? Math.ceil(plan.durationDays / 7) * plan.classesPerWeek
    : null;
// Extender (PASE-01): : (plan.monthlyClassBudget ?? null)
// classesBudget: classesRemaining (mismo patrón :1475, :3683, :4099)
```

**3. Referral guard** (Pitfall 4) — envolver los 3 callsites `qualifyReferralOnCharge` + `computePriceWithReferralDiscount` (assign `:1377-1381`, changePlan `:3626-3627`, renew `:3966-3967`) con `if (plan.planCategory !== 'especial')` (D-09):

```typescript
// Patrón actual (:1377-1384):
await this.qualifyReferralOnCharge(userId, pricePaid);
const referral = await this.computePriceWithReferralDiscount(userId, pricePaid);
pricePaid = referral.pricePaid;
// ...
// Guard: solo si plan.planCategory !== 'especial'
```

**4. Validación "presencial activo" para el pase Socio** (D-01, assign + renew) — usar `getMemberSubscriptions` plural (`service.ts:963`, ya trae `planCategory`) para verificar presencial activo/paused. Requiere discriminador Socio↔Externo (Open Q 1 — recomendación: columna `requires_presencial` en el plan, seteada en la migración solo para el Socio):

```typescript
if (plan.requiresPresencial /* o plan.planCategory==='especial' && esSocio */) {
  const subs = await this.getMemberSubscriptions(userId);
  const hasPresencial = subs.some(
    (s) =>
      s.planCategory === "presencial" &&
      (s.status === "active" || s.status === "paused"),
  );
  if (!hasPresencial)
    throw new BadRequestError(
      "El pase Socio requiere un plan presencial activo. Ofrecé el pase Externo.",
    );
}
```

**5. NUEVO helper `pickSubscriptionForActivity(userId, isSpecialActivity)`** — base en `getMemberSubscriptions` (`service.ts:963-991`, plural, ya trae `planCategory`/`status`/`classesRemaining`), filtra por `categoryGroup`. Reemplaza `getMemberSubscription` singular (`:885-957`, `.limit(1)` ordena por fecha SIN criterio de actividad — anti-pattern Pitfall 1) en booking + attendance cuando la actividad importa.

**6. renewSubscription qué sub renovar** (Pitfall 2 / Open Q 2) — `renewSubscription` (`service.ts:3791-3844`) elige `currentSub` con `.limit(1)` active-first SIN filtro de categoría. Con presencial+pase ambos activos es ambiguo. **Decisión del planner:** pasar `subscriptionId` o `planCategory` explícito al endpoint, o correr D-01 solo cuando el sub renovado es `especial`. Confirmar con cómo el admin dispara la renovación (`MemberSubscriptionTab.vue` probablemente ya tiene el sub id en mano).

**NO tocar `recomputeUserStatus`** (`service.ts:~5455`, D-08).

---

### `attendance/service.ts` (service, event-driven) — routing de decremento

**Analog:** self, decremento en `attendance/service.ts:240-256` (QR) + los otros 3 puntos (self :412, :659, :772 según research).

**Patrón de decremento** (attendance/service.ts:240-256 — dentro de la tx del check-in):

```typescript
if (
  subscription.classesRemaining !== null &&
  subscription.classesRemaining > 0
) {
  await tx
    .update(schema.subscriptions)
    .set({
      classesRemaining: sql`${schema.subscriptions.classesRemaining} - 1`,
    })
    .where(
      and(
        eq(schema.subscriptions.id, subscription.id),
        sql`${schema.subscriptions.classesRemaining} > 0`,
      ),
    );
}
```

**Cambio (GATE-02):** en los 4 puntos, obtener `subscription` vía `pickSubscriptionForActivity(userId, isSpecialActivity)` en lugar de `getMemberSubscription` singular, para decrementar la sub correcta (pase vs presencial) según la actividad. Test-señal: check-in a especial NO baja `classesRemaining` del presencial.

---

### `mark-no-shows.ts` (job, batch) — routing de decremento

**Analog:** self, `jobs/mark-no-shows.ts:83` (usa `getMemberSubscription` singular). Mismo cambio: agrupar por (member, categoría) y decrementar la sub correcta vía el helper de routing.

---

### analytics `*-service.ts` (service, read) — exclusión de métricas (D-11)

**Analog:** self, cada uno hace `.from(subscriptions).innerJoin(subscriptionPlans, ...)` SIN filtro de categoría. Agregar `ne(subscriptionPlans.planCategory, 'especial')`:

| Servicio                            | Líneas           | Métrica                       |
| ----------------------------------- | ---------------- | ----------------------------- |
| `analytics/member-flows-service.ts` | :193, :296, :379 | altas/bajas, miembros activos |
| `analytics/churn-service.ts`        | :183, :251, :306 | churn / no-renovación         |
| `analytics/renewal-service.ts`      | :156, :231       | renovación                    |
| `analytics/ltv-service.ts`          | :235             | LTV                           |
| `analytics/ticket-service.ts`       | :487             | ticket promedio               |

**Auditar además** (no confirmados): `engagement-service`, `cohorts`, `retention-service`, `expiry-cohort`, `frequency-service` — grep `innerJoin(schema.subscriptionPlans` en `analytics/`. **NO tocar** cobros/caja/`advanced-finance` — la plata del pase SÍ cuenta (D-11, Pitfall 5).

---

### Admin Vue — ActivitiesDialog, AssignPlanDialog, MemberSubscriptionTab

**`ActivitiesDialog.vue`** (component). Analog: self, el q-input de `maxCapacity` (`ActivitiesDialog.vue:85-95`) y la interfaz `activityForm` (`:146-150`). Agregar un `q-toggle` "Actividad especial (requiere pase)" con el mismo layout `row q-gutter-sm`, y `isSpecial: boolean` al form ref + a `ActivityRecord` (`src/types/scheduling.ts`). El CRUD route/schema del API debe aceptar y persistir el flag.

```vue
<!-- Patrón del campo existente (ActivitiesDialog.vue:85-95) -->
<q-input
  v-model="activityForm.maxCapacity"
  label="Cupo"
  type="number"
  dense
  outlined
  class="col"
  min="1"
  hint="vacío = hereda el cupo de la sucursal"
  :rules="[validateCapacity]"
/>
```

**`AssignPlanDialog.vue`** (component). Analog: self, `filteredPlans` en `:1250-1259`. Hoy `categoryFilter` es `'presencial' | 'online'` y el filtro `'online'` = `p.planCategory !== 'presencial'` → **incluiría especiales**. Agregar tercer valor `'especial'` y refinar `'online'` para excluir especial:

```typescript
// Patrón actual (:1253-1258):
if (!props.categoryFilter) return list;
if (props.categoryFilter === "presencial") {
  return list.filter((p) => p.planCategory === "presencial");
}
// 'online' filter: show all non-presencial categories  ← incluye especial hoy
return list.filter((p) => p.planCategory !== "presencial");
```

**`MemberSubscriptionTab.vue`** (component). Sección/CTA para vender el pase (`categoryFilter='especial'`) + probablemente pasar `subscriptionId` a renew (Open Q 2).

**`src/types/subscription.ts`** (admin): agregar `especial` a la union `PlanCategory`.

---

## Shared Patterns

### Error tipado con `code` legible

**Source:** `el-templo-api/src/modules/shared/errors.ts:49-57` (`CoverageExpiredError`)
**Apply to:** `PassRequiredError` + su surface en `scheduling/routes.ts:818-824`.
El `code` NO se serializa por el handler default — surfacearlo explícito en el catch de la ruta.

### Staff bypass por rol server-derived

**Source:** `booking-service.ts:118-130` (resolución de `actorRole`) + checks `if (actorRole === "member" && ...)` (:142, :184)
**Apply to:** gating de reserve (D-07), adminAddBooking. El gating duro es solo para members; staff ve advertencia confirmable.

### Selección de sub por actividad (reemplaza el singular)

**Source:** `getMemberSubscriptions` plural (`subscriptions/service.ts:963-991`, ya trae planCategory)
**Apply to:** booking `reserve()`, los 4 puntos de attendance, el job de no-shows. NUNCA usar `getMemberSubscription` singular (`:885-957`) para decidir de qué sub descontar (Pitfall 1).

### Seed de prod-data por migración

**Source:** `db/migrations/0091_*.sql:69-80` (INSERT IGNORE + índice único dedup)
**Apply to:** los 2 planes AR. Regla de repo: prod data por migración, nunca seeds. SQL commiteado en el MISMO commit que el schema.

### Budget derivado con override explícito

**Source:** `subscriptions/service.ts:1396-1400` (derivado `ceil(durationDays/7)*classesPerWeek`)
**Apply to:** assign + renew + changePlan. Cuando `classesPerWeek` NULL usar `monthlyClassBudget`; planes online quedan NULL.

### Tests de integración contra MySQL real

**Source:** `test/subscriptions/dual-subscription.test.ts:1-77` (estructura beforeAll/afterAll/beforeEach + `cleanAllTestData`) y `test/subscriptions/_helpers.ts:36-94` (`createPlan`/`createMember`/`assignPlan` con overrides)
**Apply to:** los 3 tests nuevos. `createPlan` acepta overrides (`planCategory`, `monthlyClassBudget`) sin gap; `assignPlan` devuelve `{statusCode, body}` para asertar 400/409. Run local: `pnpm test <archivo>`; suite completo en CI.

---

## No Analog Found

Ninguno. Los 20 archivos tienen análogo directo (mayoría in-place sobre patrones self-documentados). El único "concepto nuevo" es el helper `pickSubscriptionForActivity`, pero su base (`getMemberSubscriptions` plural + `categoryGroup`) ya existe.

---

## Metadata

**Analog search scope:** `el-templo-api/src/{db,modules/{subscriptions,scheduling,attendance,analytics,shared},jobs}`, `el-templo-api/test/subscriptions`, `el-templo-admin/src/components`, `el-templo-admin/src/types`
**Files scanned:** ~15 leídos directamente + grep de line-map de research
**Migration number verified:** max aplicado 0178 → next free 0179 (re-verificar antes de generar)
**Pattern extraction date:** 2026-07-14
</content>
</invoke>
