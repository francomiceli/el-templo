# Phase 161: Núcleo — actividades gateadas, pase mensual y enforcement - Research

**Researched:** 2026-07-14
**Domain:** Backend (Fastify + Drizzle + MySQL) — schema/migración, booking gating, multi-sub por categoría, consumo de budget; + Admin (Quasar) ABM/venta.
**Confidence:** HIGH (todo verificado leyendo el código de este repo; cero dependencias externas nuevas)

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Condición "presencial activo" del pase Socio se valida **al asignar Y en cada renovación**. Sin presencial → no renueva Socio; gestión ofrece Externo.
- **D-02:** Si el presencial vence a mitad del pase, el pase sigue usable hasta su vencimiento. Re-evaluación de socio solo al renovar. Cero lógica extra en reserve/check-in.
- **D-03:** Período **rolling de 30 días** (`durationDays=30`), no mes calendario.
- **D-04:** Descuento de clase ocurre **al check-in** (patrón `classesRemaining`, incl. no-show). La reserva valida saldo **contando reservas futuras pendientes**: con 2 reservadas no se compromete una 3ª; cancelar libera.
- **D-05:** Las 2 clases son **mezclables sin restricción** entre actividades especiales (2 de la misma vale).
- **D-06:** **Ventana de anticipación extendida** para especiales: reservable dentro del período del pase (no los +2 días estándar). Lista de espera igual que en regulares.
- **D-07:** **Staff bypass con aviso**: admin/gestión puede reservar manualmente una especial para alguien sin pase, con advertencia confirmable (consistente con bypass staff existente). Gating duro solo para members.
- **D-08:** Externo con pase queda `userStatus = activo` — `recomputeUserStatus` **NO se toca**. Distinguible por `planCategory='especial'`.
- **D-09:** **Referidos (v5.5) excluidos**: `planCategory='especial'` no cualifica vínculos ni recibe descuento de referidos.
- **D-10:** Alta del externo = alta normal de alumno (o freemium self-register) + asignación del pase Externo como única suscripción. Sin flujo nuevo.
- **D-11:** **Métricas de membresía excluyen `planCategory='especial'`**: miembros activos, altas/bajas, renovación/churn, LTV, ticket promedio. La plata SÍ cuenta en caja/cobros. Línea propia en analíticas ("Especiales"/"Planes especiales"); el contador puede aterrizar en 162, la **exclusión de métricas va en 161**.
- **D-12:** **Planes por migración** con precios exactos (patrón fase 98). **Actividades y slots de sábado los carga Nacho por el ABM existente**.
- **D-13:** La 3ª actividad se llama **"Open Gym"**.
- **D-14:** **Solo AR/ARS.** Barcelona afuera.

### Claude's Discretion

- Nombre del flag en `activities` (`requiresPass` / `isSpecial` / etc.) y del código de error tipado (estilo `PASS_REQUIRED`, patrón `COVERAGE_EXPIRED`).
- Cómo expresar el budget mensual explícito en el schema de planes (columna nueva vs convención), sin romper el derivado `ceil(durationDays/7) × classesPerWeek`.
- Nombres exactos de los 2 planes ("Actividades con Aura — Socio" / "— Externo"; Nacho puede renombrar).
- Ubicación del contador "Especiales" en analíticas (161 vs 162; la exclusión de métricas va en 161).

### Deferred Ideas (OUT OF SCOPE)

- Reparto con montos calculados por profe (REP-F1) → fase 162 entrega solo conteo.
- Compra del pase in-app con gateway (APP-F1) → v6.0+.
- Pases para España → planes ES cuando exista la operación (D-14).
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                                     | Research Support                                                                                                                    |
| ------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| ACT-01  | Admin marca actividad como "especial" (gateada) al crear/editar                                 | Flag booleano en `activities` (schema + migración 0179); toggle en `ActivitiesDialog.vue` + route/schema del CRUD de actividades    |
| ACT-02  | Las 3 actividades especiales existen con slots de sábado por sede/hora, cupo propio             | Modelo `activities`+`schedules`+`activities.maxCapacity` ya existe (D-12: las carga Nacho por ABM). Solo requiere el flag           |
| PASE-01 | Planes `especial` con budget mensual explícito de 2, independiente de `classesPerWeek`          | Nueva columna `monthly_class_budget` en `subscription_plans`; nuevo valor de enum `plan_category='especial'`; `classesPerWeek` NULL |
| PASE-02 | Socio activo tiene pase Socio ($10k) en paralelo al presencial; assign valida presencial activo | Tercer grupo de categoría en `assignPlan` (~:1244-1277); nueva validación "presencial activo" (D-01)                                |
| PASE-03 | Externo (sin presencial) tiene pase Externo ($20k) como única sub                               | `especial` como categoría paralela; sin presencial requerido                                                                        |
| PASE-04 | El pase entra al ciclo de renovación/cobro/deuda sin regresiones                                | `renewSubscription`, budget explícito, referral guard, snapshot de precio                                                           |
| GATE-01 | Backend rechaza reserva de especial sin pase con saldo — error tipado                           | Nueva `PassRequiredError` (patrón `CoverageExpiredError`), insertada en `reserve()`                                                 |
| GATE-02 | Cada asistencia a especial consume 1 clase del pase, no del presencial                          | Routing por actividad en los 4 puntos de decremento de attendance + no-shows job                                                    |
| GATE-03 | Socio presencial sin pase no puede reservar especiales; su acceso regular no cambia             | Gating duro por actividad especial + selección de sub por categoría                                                                 |
| GATE-04 | Externo con pase solo reserva especiales, no regulares                                          | Bloqueo de actividades regulares para subs categoría especial-only                                                                  |

</phase_requirements>

## Summary

Esta fase es 100% brownfield sobre patrones ya establecidos en el repo — **cero dependencias nuevas**. El trabajo se descompone en: (1) schema + migración hand-written 0179 (flag en `activities`, valor de enum `especial`, columna de budget explícito, seed de 2 planes AR), (2) enforcement en `BookingService.reserve()` con error tipado nuevo, (3) el problema arquitectónico central — **`especial` debe ser una TERCERA categoría paralela** en el modelo multi-sub, que hoy es binario `presencial` vs `online`, y booking/attendance hoy asumen **UNA** suscripción vía `getMemberSubscription()` singular, (4) routing de consumo por actividad en los 4 puntos de decremento + el job de no-shows, (5) guards de referidos y exclusión de métricas de analytics, (6) admin (toggle en ABM + tercer valor de `categoryFilter` en `AssignPlanDialog`).

El riesgo dominante NO es técnico-de-librería sino de **selección de suscripción**: `getMemberSubscription()` devuelve una sola sub (ordenada, `.limit(1)`), y con presencial+especial en paralelo hay que elegir explícitamente de cuál validar saldo y decrementar según si la actividad es especial. Hay `getMemberSubscriptions()` (plural, ya devuelve `planCategory`) que es la base para el routing.

**Primary recommendation:** Introducir el concepto de "grupo de categoría" de 3 valores (presencial / online / especial) en un solo helper compartido (`categoryGroup(planCategory)` en `types.ts`), reemplazar el binario `isOnlinePlan` en el check de conflicto de `assignPlan`, y agregar un helper de routing `pickSubscriptionForActivity(userId, isSpecialActivity)` que booking y attendance usan en lugar de `getMemberSubscription()` cuando la actividad importa. Budget explícito vía columna nueva `monthly_class_budget` (nullable) usada como override del derivado cuando `classesPerWeek` es NULL.

## Architectural Responsibility Map

| Capability                      | Primary Tier                               | Secondary Tier             | Rationale                                         |
| ------------------------------- | ------------------------------------------ | -------------------------- | ------------------------------------------------- |
| Flag de gating en actividad     | API (schema/CRUD)                          | Admin (toggle ABM)         | Dato de dominio; el admin solo lo edita           |
| Budget mensual explícito        | API (schema/service)                       | —                          | Derivación de `classesRemaining` al assign/renew  |
| Enforcement de reserva (gating) | API (`BookingService`)                     | —                          | Regla de negocio server-side; NUNCA cliente       |
| Selección de sub por actividad  | API (subscriptions + attendance + booking) | —                          | Es la lógica crítica de esta fase                 |
| Consumo de budget (check-in)    | API (`attendance/service`) + job           | —                          | Patrón existente `classesRemaining`               |
| Validación "presencial activo"  | API (`subscriptions/service`)              | —                          | assign + renew (D-01)                             |
| Exclusión de métricas           | API (`analytics/*`)                        | —                          | Filtro por planCategory en cada consumidor        |
| Venta/renovación del pase       | API (`assignPlan`/`renew`)                 | Admin (`AssignPlanDialog`) | Reusa flujo existente; admin filtra por categoría |
| Alta de actividades/slots       | Admin (ABM existente)                      | —                          | D-12: los carga Nacho, no es código nuevo         |

## Standard Stack

Sin librerías nuevas. Stack existente confirmado:

### Core

| Componente                      | Ubicación                               | Propósito                               |
| ------------------------------- | --------------------------------------- | --------------------------------------- |
| Drizzle ORM (MySQL)             | `el-templo-api/src/db/`                 | Schema + queries. mysqlEnum, mysqlTable |
| Fastify                         | `el-templo-api/src/modules/*/routes.ts` | Rutas + JSON schema validation          |
| Vitest (integración real MySQL) | `el-templo-api/test/`                   | Tests contra `eltemplo_test`            |
| Quasar + Vue 3                  | `el-templo-admin/src/`                  | ABM y diálogos de venta                 |

**Installation:** N/A — no se instalan paquetes. **(Regla de memoria: nunca instalar/actualizar deps sin preguntar.)**

## Package Legitimacy Audit

No aplica — esta fase **no instala paquetes externos**. Todo el trabajo usa dependencias ya presentes en el monorepo. `slopcheck` no corrió (no hay paquetes que auditar).

## Architecture Patterns

### System Data Flow

```
                    ┌─────────────────────────────────────────┐
   Admin ABM ──────▶│ activities.isSpecial (flag nuevo)       │
   (Nacho carga)    │ schedules (sábado, sede, hora, cupo)    │
                    └───────────────┬─────────────────────────┘
                                    │ activityId → isSpecial?
   Migración 0179 ─────────────────┤
   seed 2 planes especial          │
                                    ▼
   Member reserva ──▶ BookingService.reserve()
                       1 slot activo?
                       2 ventana  ── D-06: si actividad especial → ventana = período del pase
                       3 sub activa ── ¡ELEGIR sub por categoría! (especial vs presencial)
                       3.5 GATING NUEVO ── actividad especial + no hay pase con saldo → PassRequiredError (GATE-01)
                                        ── categoría especial-only + actividad regular → bloquear (GATE-04)
                       4 coverage / cross-country
                       5 budget (contar reservas futuras pendientes de ESA sub) ── D-04
                       6 semanal (skip si classesPerWeek NULL)
                       7 duplicados / 8 capacidad / lista de espera
                                    │
                                    ▼
   Check-in (QR/manual/coach) ──▶ attendance/service
                       elegir sub por actividad (especial→pase, regular→presencial) ── GATE-02
                       decrementar classesRemaining de ESA sub
                                    │
   Cron no-shows ─────────────────▶ mark-no-shows: agrupar por (member, categoría) y decrementar la sub correcta

   assignPlan / renewSubscription ─▶ pase especial:
                       - grupo de categoría paralelo (no choca con presencial/online)
                       - D-01: validar "presencial activo" para Socio (assign + renew)
                       - budget = plan.monthlyClassBudget (2), classesRemaining=2
                       - D-09: saltear qualifyReferralOnCharge/computeReferralDiscount
                                    │
   Analytics ─────────────────────▶ excluir planCategory='especial' en: member-flows, churn,
                                     renewal, ltv, ticket (D-11)
```

### Pattern 1: Enum mysqlEnum + valor nuevo appended last

`plan_category` es un `mysqlEnum("plan_category", [...])` (schema `subscription-plans.ts:22`). Agregar `"especial"` **al final** del array y en la migración `ALTER TABLE subscription_plans MODIFY plan_category enum('presencial','online_regular','online_goal','online_coach','especial') NOT NULL;` — la lista y el orden deben ser byte-for-byte iguales (skill Hard Rule 6). También hay que actualizar el type `PlanCategory` (`types.ts:25`) y **3 whitelists JSON-schema** en `schemas.ts` (líneas 35, 181, 223).

### Pattern 2: Error tipado (patrón COVERAGE_EXPIRED)

Verificado en `src/modules/shared/errors.ts:44-58`. Crear:

```typescript
// Source: src/modules/shared/errors.ts (patrón CoverageExpiredError)
export class PassRequiredError extends BadRequestError {
  readonly code = "PASS_REQUIRED";
  constructor(
    message = "Necesitás el pase de actividades para reservar esta clase",
  ) {
    super(message);
  }
}
```

Y surfacearlo explícitamente en el handler de `/reserve` (`scheduling/routes.ts:818-824`), porque `handleServiceError` **no serializa `code`** por defecto — hay que agregar un `if (err instanceof PassRequiredError)` en el catch (mirror del `CoverageExpiredError`).

### Pattern 3: Grupo de categoría de 3 valores

Hoy `isOnlinePlan(category)` = `category !== "presencial"` (`types.ts:31`). Esto es un **binario que rompe con especial**: `isOnlinePlan('especial')` devolvería `true`, lumpeando el pase con online y disparando el conflicto "ya tiene una online activa" en `assignPlan` (`service.ts:1249-1277`). Introducir:

```typescript
export type CategoryGroup = "presencial" | "online" | "especial";
export function categoryGroup(c: PlanCategory): CategoryGroup {
  if (c === "presencial") return "presencial";
  if (c === "especial") return "especial";
  return "online";
}
```

y reescribir el check de conflicto de `assignPlan` para comparar por grupo (una sub activa/paused/scheduled por grupo). Auditar TODOS los usos de `isOnlinePlan` (`grep -rn isOnlinePlan src/`).

### Pattern 4: Seed de planes por migración (fase 98)

Verificado en `0091_multi_currency_and_country_scope.sql`. Patrón: `INSERT IGNORE INTO subscription_plans (name, plan_tier, booking_mode, plan_category, linked_program_id, price_regular, price_zero, price_credit_card, duration_days, classes_per_week, multi_branch, is_trial, is_group, group_max_members, is_active, is_archived, country, currency, created_at, updated_at) VALUES (...)`. Para los pases: `plan_category='especial'`, `classes_per_week=NULL`, nueva col `monthly_class_budget=2`, `duration_days=30`, `country='AR'`, `currency='ARS'`, precios exactos (Socio 10000, Externo 20000). Requiere el índice único `(name, country)` que la 0091 ya creó para que `INSERT IGNORE` dedupe.

### Anti-Patterns to Avoid

- **NO usar `getMemberSubscription()` (singular) para decidir de qué sub descontar** cuando la actividad puede ser especial — devuelve una sola sub sin criterio de categoría (`service.ts:947-952` ordena por fecha, no por actividad). Usar routing explícito.
- **NO tocar `recomputeUserStatus`** (D-08, `service.ts:~5455`).
- **NO derivar el budget de especial desde `classesPerWeek`** — quedaría NULL. Usar la columna explícita.
- **NO reusar un número de migración < 0179** — 0176-0178 tomadas por v5.5 (ya en master/prod).
- **NO poner `;` dentro de comentarios `--`** en la migración (skill Hard Rule 2).

## Don't Hand-Roll

| Problema                  | No construir         | Usar en su lugar                                                           | Por qué                                                      |
| ------------------------- | -------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Cupo de slot              | Cálculo ad-hoc       | `resolveSlotCapacity` / `getEffectiveCapacity` (`booking-service.ts:1883`) | Single source of truth WR-02 (activity.maxCapacity → branch) |
| Cobro/caja del pase       | Lógica de pago nueva | `recordAssignmentCharge` (existente en assign/renew)                       | Ya resuelve caja, moneda, deuda, idempotencia                |
| Descuento de clase        | Contador nuevo       | `classesRemaining`/`classesBudget` (patrón existente)                      | Ya cubre QR/manual/coach/no-show/undo                        |
| Ventana/feriado/excepción | Validación nueva     | `assertDateWithinWindow` (`booking-service.ts:1508`)                       | Ya cubre feriados, día de semana, excepciones                |
| Multi-sub                 | Nueva tabla/relación | 2 filas en `subscriptions` (patrón dual presencial+online)                 | Ya soportado; especial es una categoría más                  |

**Key insight:** Todo el andamiaje (cobro, cupo, ventana, budget, multi-sub) ya existe. El trabajo real es **extender criterios de 2 categorías a 3** y **rutear el consumo por actividad**, no construir mecanismos.

## Runtime State Inventory

Esta fase agrega datos (planes por migración) pero **no renombra ni migra estado existente**. Categorías:

| Categoría           | Items                                                                                                                        | Acción                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Stored data         | Ninguna sub `especial` existe aún; la migración crea 2 **planes**, no subs. Actividades/slots los carga Nacho por ABM (D-12) | Migración 0179 (data de planes)                                                                    |
| Live service config | Ninguna — sin servicios externos con estado                                                                                  | None — verificado (no hay integraciones externas en este dominio)                                  |
| OS-registered state | Ninguna                                                                                                                      | None — sin cron/tasks nuevos que registrar (el job de no-shows ya existe, solo se edita su lógica) |
| Secrets/env vars    | Ninguna                                                                                                                      | None — no se agregan env vars                                                                      |
| Build artifacts     | Ninguno                                                                                                                      | None — sin renames de paquete                                                                      |

**Nota de numeración de migración (CRÍTICO):** máximo aplicado = **0178** (`0178_referrals_ab_copy_test.sql`, v5.5, ya en prod). El siguiente libre es **0179**. Verificar con `ls el-templo-api/src/db/migrations/*.sql | sort | tail -3` antes de generar. Como esta fase corre en su propia rama (`feat/...`), confirmar que ninguna otra rama de v5.6/v5.7 en vuelo ya tomó 0179; si sí, tomar el siguiente libre (skill "Shipping out of order").

## Common Pitfalls

### Pitfall 1: `getMemberSubscription()` singular elige la sub equivocada

**Qué sale mal:** Con presencial+especial activos, `getMemberSubscription()` (`service.ts:885`, `.limit(1)`, orden por fecha) devuelve una sola sub sin criterio de actividad. Booking (`booking-service.ts:86`) y los 4 puntos de attendance (QR :89, self :412, coach :659, undo :772) y el job de no-shows (`mark-no-shows.ts:83`) usan esta función singular. Un check-in a una actividad especial podría decrementar el presencial (y viceversa), y romper el gating.
**Por qué pasa:** El modelo se diseñó para "una sub que cubre hoy". El dual presencial+online funciona porque nunca compiten por el mismo consumo (online no tiene check-in presencial). Especial SÍ compite.
**Cómo evitar:** Helper `pickSubscriptionForActivity(userId, isSpecialActivity)` que usa `getMemberSubscriptions()` (plural, `service.ts:963`, ya trae `planCategory`) y filtra por `categoryGroup`. Booking valida saldo y attendance decrementa contra la sub elegida.
**Señal temprana:** Test de check-in a especial que verifica que `classesRemaining` del presencial NO baja.

### Pitfall 2: `renewSubscription` no sabe qué sub renovar

**Qué sale mal:** La ruta es `POST /members/:userId/subscription/renew` (sin subscriptionId). `renewSubscription` (`service.ts:3820-3844`) elige `currentSub` con `.limit(1)` (active-first, luego createdAt desc), **sin filtro de categoría**. Con presencial+especial ambos activos, renovar es ambiguo — podría renovar el presencial cuando gestión quería renovar el pase.
**Por qué pasa:** El endpoint asume una sola sub renovable por usuario.
**Cómo evitar:** **DECISIÓN DE DISEÑO PARA EL PLANNER** (ver Open Questions): la renovación del pase probablemente necesita un parámetro que discrimine cuál sub renovar (p.ej. `subscriptionId` o `planCategory` en el body/URL) O la validación D-01 debe correr específicamente cuando el sub renovado es `especial`. Sin esto, D-01 ("validar presencial activo al renovar el pase Socio") no tiene dónde engancharse de forma inequívoca.
**Señal temprana:** Test de renovación de un socio con presencial+pase que verifica cuál sub se extendió.

### Pitfall 3: Enum/whitelists desincronizados (CI rojo, tsc verde)

**Qué sale mal:** Agregar `especial` al `mysqlEnum` y al type pero olvidar (a) el `MODIFY COLUMN` en la migración o (b) las 3 whitelists JSON-schema (`schemas.ts:35,181,223`). tsc pasa (tipos vienen del TS), CI falla contra MySQL real.
**Cómo evitar:** Checklist: schema `.ts` + migración SQL (mismo orden byte-for-byte) + `types.ts` PlanCategory + 3 `enum` en `schemas.ts` + admin `src/types/subscription.ts`.
**Señal temprana:** `grep -rn online_coach src/` — cada match es un lugar que probablemente necesita `especial`.

### Pitfall 4: Referidos contaminados por el pase

**Qué sale mal:** `assignPlan` (:1377), el changePlan (~:3626) y `renewSubscription` (:3966) llaman `qualifyReferralOnCharge` + `computePriceWithReferralDiscount` incondicionalmente. Un pase especial pagado cualificaría un vínculo o recibiría descuento de referido (viola D-09).
**Cómo evitar:** Guard `if (plan.planCategory !== 'especial')` alrededor de esas 2 llamadas en cada uno de los 3 callsites (assign, changePlan, renew).
**Señal temprana:** Test: pagar un pase no flippea vínculo pending→qualified ni aplica descuento.

### Pitfall 5: Métricas de membresía infladas por especiales

**Qué sale mal:** analytics/\* cuentan subs join subscription_plans sin filtro de categoría → especiales aparecen como altas/miembros activos/renovaciones/LTV/ticket (viola D-11).
**Cómo evitar:** Agregar `ne(subscriptionPlans.planCategory, 'especial')` en cada consumidor (mapeados abajo). La plata SÍ cuenta en caja/cobros — NO tocar esos.
**Señal temprana:** Test de "miembros activos" con un externo-solo-pase que verifica que NO cuenta.

### Pitfall 6: Semicolon en comentario SQL parte la migración

**Qué sale mal:** El runner splitea por `;` antes de stripear comentarios; un `;` en un `--` rompe la migración entera (y el test suite). Incidente histórico 0119.
**Cómo evitar:** Nada de `;` en comentarios; usar `--> statement-breakpoint` si hace falta prosa.

## Code Examples

### Insertar el gating en reserve() (entre sub y capacidad)

```typescript
// Source: booking-service.ts:85-160 (orden existente slot→ventana→sub→coverage→cross-country→budget→semanal→dup→capacidad)
// getScheduleSlotRaw YA trae activityId (booking-service.ts:1899) pero NO el flag isSpecial:
//   → extender getScheduleSlotRaw para JOIN activities y traer isSpecial.
const isSpecialActivity = scheduleRow.isSpecial;

// Elegir sub por actividad (reemplaza el getMemberSubscription singular cuando importa):
const sub = await this.subscriptionService.pickSubscriptionForActivity(
  memberId,
  isSpecialActivity,
);

// GATE-01 / GATE-03: actividad especial sin pase con saldo
if (isSpecialActivity && actorRole === "member" && !sub) {
  throw new PassRequiredError();
}
// GATE-04: categoría especial-only intentando reservar una regular
if (!isSpecialActivity && actorRole === "member" && subIsEspecialOnly) {
  throw new BadRequestError("Tu pase solo habilita las actividades especiales");
}
// D-06: ventana extendida — si isSpecialActivity, usar el período del pase en vez de MEMBER_BOOKING_WINDOW_DAYS
```

### Budget explícito en assignPlan (respeta el derivado existente)

```typescript
// Source: service.ts:1396-1400 (derivado actual)
// Extender: cuando classesPerWeek es NULL pero el plan tiene monthlyClassBudget, usar el explícito.
const classesRemaining =
  plan.classesPerWeek !== null
    ? Math.ceil(plan.durationDays / 7) * plan.classesPerWeek
    : (plan.monthlyClassBudget ?? null); // ← columna nueva; NULL para planes online (sin budget)
// classesBudget: classesRemaining (mismo patrón línea :1475)
```

### Validación "presencial activo" para el pase Socio (D-01)

```typescript
// En assignPlan, tras validar el plan y antes de insertar la sub:
if (plan.planCategory === "especial" && plan.name.includes("Socio")) {
  // o un flag/campo que distinga Socio vs Externo
  const groups = await this.getMemberSubscriptions(userId);
  const hasPresencial = groups.some(
    (s) =>
      s.planCategory === "presencial" &&
      (s.status === "active" || s.status === "paused"),
  );
  if (!hasPresencial)
    throw new BadRequestError(
      "El pase Socio requiere un plan presencial activo. Ofrecé el pase Externo.",
    );
}
// Mismo bloque en renewSubscription cuando el sub renovado es el pase Socio.
```

> **Nota:** distinguir "Socio" de "Externo" a nivel plan requiere un discriminador. Opciones: (a) por `pricePaid`/plan concreto, (b) un flag/columna en el plan (p.ej. `requiresPresencial boolean`). Ver Open Questions — es una decisión del planner (la discreción de CONTEXT menciona el nombre pero no el mecanismo de distinción).

## State of the Art

| Enfoque viejo                                        | Enfoque de esta fase                    | Impacto                                              |
| ---------------------------------------------------- | --------------------------------------- | ---------------------------------------------------- |
| Categoría binaria presencial/online (`isOnlinePlan`) | 3 grupos: presencial/online/especial    | Toca conflicto de assign, filtro de admin, y routing |
| Una sub por consumo (`getMemberSubscription`)        | Selección por actividad                 | Routing en booking + 4 pts attendance + no-shows     |
| Budget derivado de `classesPerWeek`                  | Budget explícito `monthly_class_budget` | Nueva columna; planes online quedan NULL             |

## Assumptions Log

| #   | Claim                                                                                              | Section                 | Risk if Wrong                                                                      |
| --- | -------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------- |
| A1  | El siguiente número de migración libre es 0179                                                     | Runtime State Inventory | Colisión con otra rama v5.6/v5.7 en vuelo → renumerar (bajo, verificable con `ls`) |
| A2  | Distinguir pase Socio de Externo necesita un discriminador nuevo a nivel plan (no basta el nombre) | Code Examples / Open Q  | Si se usa solo el nombre, es frágil ante rename de Nacho (medio)                   |
| A3  | La renovación del pase necesita un parámetro para saber qué sub renovar                            | Pitfall 2 / Open Q      | Si no, D-01 en renew no tiene enganche inequívoco (alto)                           |
| A4  | `getMemberSubscriptions()` (plural) es suficiente base para el routing por categoría               | Pitfalls 1              | Bajo — ya devuelve planCategory y status                                           |
| A5  | La ventana extendida D-06 se implementa condicionando `windowDays` por `isSpecialActivity`         | Code Examples           | Bajo — `assertDateWithinWindow` ya parametriza windowDays                          |
| A6  | Los consumidores de métricas a excluir son member-flows/churn/renewal/ltv/ticket                   | Métricas mapping        | Puede faltar alguno (engagement, cohorts) — auditar (medio)                        |

## Open Questions

1. **¿Cómo distinguir el pase Socio del Externo a nivel de datos?** (para D-01)
   - Qué sabemos: son 2 planes `especial` distintos (precio 10k vs 20k). El Socio exige presencial activo; el Externo no.
   - Qué falta: un discriminador confiable. Nombre es frágil (Nacho renombra).
   - Recomendación: agregar una columna booleana al plan (p.ej. `requires_presencial`) seteada en la migración solo para el plan Socio. Cero ambigüedad, sobrevive renames. **El planner decide.**

2. **¿Cómo sabe `renewSubscription` qué sub renovar cuando el socio tiene presencial + pase?** (Pitfall 2)
   - Qué sabemos: la ruta actual toma solo `userId` y elige `.limit(1)` sin categoría.
   - Qué falta: un parámetro (`subscriptionId` en la URL, o `planCategory`/`planId` en el body).
   - Recomendación: pasar `subscriptionId` explícito a renew (cambio de ruta/input), o al menos permitir discriminar por categoría. Ver cómo el admin dispara la renovación (`MemberSubscriptionTab.vue`) — probablemente ya tiene el sub en mano y puede pasar su id. **El planner decide y confirma con el flujo admin.**

3. **¿La ventana extendida D-06 desactiva la lista de espera o solo la anticipación?**
   - CONTEXT D-06 dice "lista de espera aplica igual". Confirmado: solo se extiende `windowDays`, el resto de `assertDateWithinWindow` (feriado, día, excepción) y la capacidad/lista de espera quedan iguales.

## Environment Availability

| Dependencia              | Requerida por      | Disponible                             | Versión | Fallback |
| ------------------------ | ------------------ | -------------------------------------- | ------- | -------- |
| MySQL local (`eltemplo`) | migración + tests  | ✓ (asumido, entorno estándar del repo) | 8.0     | —        |
| pnpm                     | build/test/migrate | ✓                                      | —       | —        |

Sin dependencias externas nuevas. La migración se aplica con `cd el-templo-api && pnpm db:migrate` (runner custom, NUNCA `drizzle-kit migrate`).

## Validation Architecture

### Test Framework

| Propiedad  | Valor                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| Framework  | Vitest (integración contra MySQL real `eltemplo_test`)                                                        |
| Config     | `el-templo-api/vitest.config.ts` (workers provisionan `eltemplo_test_<POOL_ID>` vía el runner de migraciones) |
| Quick run  | `cd el-templo-api && pnpm test <archivo>` (solo el archivo nuevo, local)                                      |
| Full suite | corre en **CI** (regla de repo: no correr suite completo local; sí typecheck local)                           |
| Typecheck  | `cd el-templo-api && pnpm tsc --noEmit`                                                                       |

### Phase Requirements → Test Map

| Req       | Comportamiento                                                | Tipo  | Archivo sugerido                                            |
| --------- | ------------------------------------------------------------- | ----- | ----------------------------------------------------------- |
| ACT-01    | Toggle isSpecial persiste en CRUD de actividad                | integ | `test/scheduling/schedule-activity-crud.test.ts` (extender) |
| PASE-01   | Plan especial con budget explícito de 2                       | integ | `test/subscriptions/class-tracking.test.ts` (extender)      |
| PASE-02   | Assign Socio valida presencial activo; permite paralelo       | integ | nuevo `test/subscriptions/especial-pass.test.ts`            |
| PASE-03   | Externo con pase como única sub                               | integ | idem                                                        |
| PASE-04   | Renovación/cobro sin regresión (dual + referidos excluidos)   | integ | idem + `test/subscriptions/renewal.test.ts`                 |
| GATE-01   | Reserva de especial sin pase → 400 code=PASS_REQUIRED         | integ | nuevo `test/scheduling/especial-gating.test.ts`             |
| GATE-02   | Check-in a especial decrementa el pase, no el presencial      | integ | idem attendance                                             |
| GATE-03   | Socio sin pase no reserva especial; su acceso regular intacto | integ | idem                                                        |
| GATE-04   | Externo-solo-pase no reserva regulares                        | integ | idem                                                        |
| D-04      | 2 reservas futuras bloquean la 3ª; cancelar libera            | integ | especial-gating                                             |
| D-09      | Pagar pase no cualifica ni descuenta referido                 | integ | especial-pass                                               |
| D-11      | Especial excluido de miembros activos/altas/churn/ltv/ticket  | integ | nuevo `test/analytics/especial-exclusion.test.ts`           |
| Regresión | dual-subscription y class-tracking siguen verdes              | integ | tests existentes                                            |

### Sampling Rate

- **Por commit:** `pnpm test <archivo tocado>` + `pnpm tsc --noEmit`.
- **Por wave/merge:** CI corre el suite completo (real MySQL).
- **Phase gate:** CI verde en la rama antes de UAT en staging.

### Wave 0 Gaps

- [ ] `test/subscriptions/especial-pass.test.ts` — cubre PASE-02/03/04, D-01, D-09
- [ ] `test/scheduling/especial-gating.test.ts` — cubre GATE-01/03/04, D-04, D-06
- [ ] `test/analytics/especial-exclusion.test.ts` — cubre D-11
- [ ] Helper: `createTestPlan` ya acepta overrides (`planCategory`, `monthlyClassBudget`) — sin gap. `assignTestPlan`/`createTestMember` reutilizables.
- [ ] Extender `getScheduleSlotRaw` en tests para verificar routing de check-in a especial vs presencial.

## Analytics Consumers to Exclude (D-11 mapping)

Cada uno hace `.from(schema.subscriptions).innerJoin(subscriptionPlans, ...)` sin filtro de categoría — agregar `ne(subscriptionPlans.planCategory, 'especial')`:

| Servicio             | Ubicación                                       | Métrica                       |
| -------------------- | ----------------------------------------------- | ----------------------------- |
| member-flows-service | `analytics/member-flows-service.ts:193,296,379` | Altas/bajas, miembros activos |
| churn-service        | `analytics/churn-service.ts:183,251,306`        | Churn / no-renovación         |
| renewal-service      | `analytics/renewal-service.ts:156,231`          | Tasa de renovación            |
| ltv-service          | `analytics/ltv-service.ts:235`                  | LTV                           |
| ticket-service       | `analytics/ticket-service.ts:487`               | Ticket promedio               |

**Auditar también** (posibles consumidores no confirmados en este research): `engagement-service`, `cohorts`, `retention-service`, `expiry-cohort`, `frequency-service`. El planner debe grep-ear `innerJoin(schema.subscriptionPlans` en `analytics/` y decidir caso por caso. **NO tocar** cobros/caja/`advanced-finance` — la plata del pase SÍ cuenta (D-11).

## Admin Changes

| Componente                  | Cambio                                                                                                                                                                                                                               | Ubicación                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `ActivitiesDialog.vue`      | Agregar `q-toggle` "Actividad especial (requiere pase)" al `activityForm` (~:77-90) y a la interfaz `activityForm` (~:147-150)                                                                                                       | `el-templo-admin/src/components/scheduling/ActivitiesDialog.vue` |
| `ActivityRecord` type       | Agregar `isSpecial: boolean`                                                                                                                                                                                                         | `el-templo-admin/src/types/scheduling.ts`                        |
| CRUD actividad (API)        | route/schema de create/update acepta y persiste el flag                                                                                                                                                                              | `el-templo-api` scheduling routes de actividades                 |
| `AssignPlanDialog.vue`      | `categoryFilter` hoy es `'presencial' \| 'online'`; el filtro `'online'` incluye no-presencial → **incluiría especiales**. Agregar tercer valor `'especial'` y refinar `'online'` para excluir especial (`filteredPlans` :1253-1258) | `el-templo-admin/src/components/AssignPlanDialog.vue`            |
| `MemberSubscriptionTab.vue` | Sección/CTA para vender el pase (categoryFilter='especial')                                                                                                                                                                          | `el-templo-admin/src/components/MemberSubscriptionTab.vue`       |
| Booking manual admin (D-07) | Advertencia confirmable al reservar especial sin pase                                                                                                                                                                                | donde el admin dispara `adminAddBooking`                         |
| `src/types/subscription.ts` | `PlanCategory` incluye `especial`                                                                                                                                                                                                    | admin types                                                      |

## Project Constraints (from CLAUDE.md + skills)

- **Logging:** `request.log`/`app.log` (Pino) en API; `createLogger()` en frontends. Nunca `console.log`.
- **TypeScript:** sin `any`; `catch (err: unknown)` + `instanceof Error`.
- **Tests:** rutas nuevas → tests de integración en `el-templo-api/test/` contra MySQL real.
- **Migraciones:** hand-written (db:generate roto por drift); numeración = máx+1 (0179); SQL commiteado en el MISMO commit que el schema; nunca `;` en comentarios `--`; enum values appended last; `mysqlEnum` 1er-arg = nombre de columna byte-for-byte; **prod data por migración, nunca seeds** (planes AR van por migración); nunca `drizzle-kit migrate`.
- **Staging-first estricto:** feature branch → staging → tren a master. Nunca feature directo a master. **Preguntar antes de pushear.**
- **git add explícito** por ruta, nunca `git add -A`.
- **No instalar/actualizar deps sin preguntar** (no aplica: cero deps nuevas).
- **`.env.example`** si se agrega env var (no aplica).
- **Facade pattern** para services complejos; Pinia composition API; composables con `cleanup()`.
- **Sentry:** `createLogger().error()` va a Sentry automáticamente.

## Sources

### Primary (HIGH confidence — código de este repo, leído directamente)

- `el-templo-api/src/db/schema/{activities,subscription-plans,subscriptions}.ts`
- `el-templo-api/src/modules/scheduling/booking-service.ts` (reserve, getScheduleSlotRaw, assertDateWithinWindow, adminAddBooking)
- `el-templo-api/src/modules/subscriptions/service.ts` (assignPlan, renewSubscription, getMemberSubscription/s, referral guards, budget calc)
- `el-templo-api/src/modules/subscriptions/types.ts` (isOnlinePlan, PlanCategory) y `schemas.ts` (whitelists)
- `el-templo-api/src/modules/attendance/service.ts` (4 puntos de decremento) y `src/jobs/mark-no-shows.ts`
- `el-templo-api/src/modules/shared/errors.ts` (CoverageExpiredError) y `scheduling/routes.ts:814-826`
- `el-templo-api/src/db/migrations/0091_multi_currency_and_country_scope.sql` (patrón fase 98)
- `el-templo-api/src/modules/analytics/{member-flows,churn,renewal,ltv,ticket}-service.ts`
- `el-templo-admin/src/components/{scheduling/ActivitiesDialog,AssignPlanDialog}.vue`
- `el-templo-api/test/{helpers.ts, subscriptions/dual-subscription.test.ts}`
- `.claude/skills/el-templo-db-migrations/SKILL.md`, `.claude/skills/el-templo-change-control/SKILL.md`
- `.planning/phases/161-*/161-CONTEXT.md`, `.planning/REQUIREMENTS.md`

### Secondary / Tertiary

- N/A — sin búsquedas web; dominio 100% interno.

## Metadata

**Confidence breakdown:**

- Schema/migración: HIGH — verificado enum, columnas, patrón 0091, número libre 0179.
- Booking/gating: HIGH — leído el orden completo de `reserve()` y el patrón de error tipado.
- Multi-sub/routing: HIGH (diagnóstico) — `getMemberSubscription` singular confirmado como el punto crítico; MEDIUM en el mecanismo exacto de renovación (Open Q 2).
- Distinción Socio/Externo: MEDIUM — requiere decisión de diseño (Open Q 1).
- Métricas: MEDIUM — 5 consumidores confirmados, otros por auditar.
- Admin: HIGH — componentes y filtro binario identificados.

**Research date:** 2026-07-14
**Valid until:** ~2026-08-14 (código interno estable; revalidar el número de migración libre justo antes de generar SQL)
