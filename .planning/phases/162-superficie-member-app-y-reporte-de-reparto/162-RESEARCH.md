# Phase 162: Superficie — member app y reporte de reparto - Research

**Researched:** 2026-07-14
**Domain:** Member app (Quasar + Vue 3, `el-templo-app`) — grilla de reservas, gate de página, contador de pase, mensaje informativo; + Admin analytics (Quasar, `el-templo-admin`) tab de reporte; + API (Fastify + Drizzle) — exponer `isSpecial` en la grilla, endpoint del pase del member, y el reporte de asistencias socio/externo.
**Confidence:** HIGH (todo verificado leyendo el código de esta rama; el núcleo 161 ya está mergeado y leído; cero dependencias nuevas)

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions (heredadas de 161, aplican a la superficie)

- **D-01 (naming):** en toda superficie visible el término es **"Especiales" / "Planes especiales"**; la marca del producto es **"Actividades con Aura"**. NUNCA "pases" en UI (jerga interna de docs).
- **D-02 (APP-03):** el usuario sin pase que intenta reservar una especial recibe un mensaje claro de qué es y cómo conseguirlo — **informativo, sin pago in-app** (la venta es por gestión/PoS).
- **D-03 (contador):** el usuario con pase ve cuántas clases especiales le quedan del período (2/2, 1/2, 0/2). Fuente: `classesRemaining` de la suscripción de categoría `especial`.
- **D-04 (REP-01):** reporte admin de asistencias por actividad especial por mes, separando origen **socio** (plan `requiresPresencial` / tenía presencial activo) vs **externo**, SIN montos calculados — la regla de reparto es de Nacho.
- **D-05 (contador "Especiales" en analíticas):** línea/solapa propia con las suscripciones especiales activas separadas socio/externo — residual de D-11 de fase 161 (la exclusión de métricas ya se implementó en 161-04).
- **D-06 (externo en la app):** el externo con solo pase tiene `userStatus='activo'` y debe poder usar la app para reservar especiales. El gate todo-o-nada de la grilla (`hasPresencialReservationAccess`) debe refinarse: externo-solo-pase ve la grilla habilitada a especiales (backend rechaza regulares — GATE-04); socio presencial sin pase ve las especiales con estado "requiere plan especial" y NO pierde nada de su vista actual.
- **D-07 (bypass staff):** ya implementado en 161 (API + admin). El member NUNCA bypasea — no duplicar en el app.

### Claude's Discretion

- Diseño exacto del distintivo/badge en la grilla y el estado visual (usar patrones de `ReservasPage.vue` y la paleta de marca — cálida, SIN azul, `quasar.variables.scss` fuente de verdad).
- Ubicación del contador x/2 (chip en la grilla, card en Mi Templo, o ambos).
- Ubicación del reporte REP-01 (tab en Analíticas vs Reportes — el nav v5.4 tiene Analíticas/Reportes en Finanzas) y si lleva export (los reportes existentes reusan export Excel — seguí el patrón si es barato).
- Forma de exponer los datos: endpoints nuevos vs extender `WeeklySlotView`.
- Copy exacto de los mensajes (español rioplatense, consistente con la app).

### Deferred Ideas (OUT OF SCOPE)

- Reparto con montos por profe (REP-F1), compra in-app con gateway (APP-F1), notificaciones push de lanzamiento.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID     | Description                                                                                             | Research Support                                                                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| APP-01 | La grilla muestra las actividades especiales con distintivo y estado según acceso (con pase / sin pase) | `getWeeklyGrid` NO expone `isSpecial` todavía → extender (service.ts + WeeklySlotView type + schema + frontend type). Badge en `ReservasPage.vue` slot-cards + `slotCardClass`       |
| APP-02 | El usuario con pase ve cuántas clases especiales le quedan (2/2, 1/2, 0/2)                              | El app carga UNA sola sub sin `classesRemaining` (`/me/subscription` singular). Nuevo endpoint del pase + refs en `useUserStore` + contador en grilla y/o Mi Templo                  |
| APP-03 | El usuario sin pase recibe mensaje claro de qué es el pase y cómo conseguirlo (informativo)             | Backend ya devuelve `code=PASS_REQUIRED` (161-06). Handler de reserve (`confirmReserve`) ya tiene el patrón `COVERAGE_EXPIRED` → dialog informativo con precios $10.000/$20.000      |
| REP-01 | El admin ve asistencias por actividad especial por mes, separando socio/externo (sin montos)            | `attendance` NO guarda subscription_id → derivar socio/externo por el plan `requires_presencial` de la sub especial que cubre `session_date`. Nuevo service + endpoint + export XLSX |

</phase_requirements>

## Summary

Fase 100% brownfield de **superficie** sobre el núcleo 161 (ya mergeado en esta rama, verificado leyendo el código). El backend ya enforcea todo (gating, consumo por actividad, error tipado `PASS_REQUIRED`, exclusión de métricas). El trabajo de 162 es **hacer visible** ese estado y **reportarlo** — cero dependencias nuevas, cero migraciones nuevas.

Se descompone en tres frentes: (1) **grilla del member app** — exponer `isSpecial` por slot (que hoy NO viaja en `getWeeklyGrid`) y pintar distintivo + estado; (2) **contador + gate del member** — el app hoy sólo conoce UNA suscripción (singular, sin `classesRemaining`), así que hay que exponer el pase especial al app (endpoint nuevo o extensión) y refinar las capabilities de `useUserStore` para que el externo-solo-pase entre a la grilla y el socio no se rompa; (3) **reporte REP-01 + contador D-05 en admin** — derivar asistencias por actividad especial por mes clasificando socio/externo, con endpoint JSON + export XLSX y un tab en Analíticas (análogo exacto del tab "Referidos A/B" de v5.5).

El riesgo dominante NO es de librería sino de **modelo de datos del cliente**: `useUserStore` guarda `subscription` como **una** sub (`getMemberSubscription()` singular). Con presencial + pase en paralelo, el singular puede devolver cualquiera de los dos, y si devuelve el pase, `hasPresencialReservationAccess` cae a `false` y el socio queda **injustamente bloqueado** de toda la grilla. La superficie del pase obliga a que el app conozca sus subs por categoría, igual que el backend ya lo hace con `getMemberSubscriptions()` plural.

**Primary recommendation:** Un endpoint member nuevo y chico (`GET /me/especial-pass`, derivado de `getMemberSubscriptions` filtrando `categoryGroup==='especial'`) que devuelva `{ hasPass, classesRemaining, classesBudget, endDate, isSocio }`, más una extensión de `getWeeklyGrid` para incluir `isSpecial` por slot. En el app, agregar capabilities `hasEspecialPass`/`hasOnlyEspecialPass` a `useUserStore` sin tocar la semántica del `subscription` singular (que media app consume), y refinar el gate de `ReservasPage` a `canAccessGrid = hasPresencialReservationAccess || hasEspecialPass`. En admin, un `especial-report-service.ts` en el módulo analytics + tab `EspecialesTab.vue`. NO cambiar `/me/subscription` a array (regresión de superficie amplia).

## Architectural Responsibility Map

| Capability                            | Primary Tier               | Secondary Tier       | Rationale                                                                                 |
| ------------------------------------- | -------------------------- | -------------------- | ----------------------------------------------------------------------------------------- |
| `isSpecial` por slot en la grilla     | API (`scheduling/service`) | App (render)         | Dato de dominio resuelto server-side; el cliente sólo lo pinta (nunca lo infiere)         |
| Distintivo/badge + estado de slot     | App (`ReservasPage.vue`)   | —                    | Presentación pura; el gating real es del backend (GATE-01/03/04 ya en 161)                |
| Contador x/2 (clases restantes)       | API (endpoint del pase)    | App (store + render) | `classesRemaining` es server-side; el app lo muestra                                      |
| Capabilities del pase (has/only pase) | App (`useUserStore`)       | —                    | Derivadas de las subs; gate de página client-side (UX), backend sigue siendo la autoridad |
| Mensaje informativo APP-03            | App (`ReservasPage.vue`)   | —                    | Reacciona a `code=PASS_REQUIRED` que el backend ya devuelve; copy + precios en el cliente |
| Reporte de asistencias socio/externo  | API (`analytics/*`)        | Admin (tab + export) | Query de dominio (attendance→schedules→activities→sub); admin sólo consulta/exporta       |
| Contador "Especiales" activas (D-05)  | API (`analytics/*`)        | Admin (tab)          | Conteo de subs especiales por origen; misma capa que las demás métricas                   |

**Por qué importa:** el error clásico de esta clase de fase es meter lógica de autorización en el cliente (ej. "el app decide si puede reservar la especial"). Acá el backend YA es la autoridad (161-06); el app sólo refleja estado y muestra mensajes. La única lógica client-side legítima es la **UX del gate de página** (qué pantalla mostrar), que degrada a un rechazo del backend si se elude.

## Standard Stack

Sin librerías nuevas. Todo verificado presente en esta rama.

### Core

| Componente                       | Ubicación                                                        | Propósito                                             |
| -------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------- |
| Quasar + Vue 3 (Composition API) | `el-templo-app/src/`                                             | Grilla de reservas, store Pinia, dialogs              |
| Pinia (`defineStore` setup)      | `el-templo-app/src/stores/useUserStore.ts`                       | Capabilities del pase + carga de subs                 |
| Axios (`src/boot/axios`)         | `el-templo-app/src/boot/axios.ts`                                | Cliente HTTP; `axios.isAxiosError` para el code       |
| Fastify + Drizzle (MySQL)        | `el-templo-api/src/modules/{scheduling,subscriptions,analytics}` | Grid, endpoint del pase, reporte                      |
| exceljs                          | `el-templo-api/src/modules/shared/excel.ts`                      | Export XLSX del reporte (helper compartido existente) |
| Vitest (integración real MySQL)  | `el-templo-api/test/`                                            | Tests de los endpoints nuevos                         |
| Quasar admin                     | `el-templo-admin/src/pages/AnaliticasPage.vue`                   | Tab del reporte (patrón "Referidos A/B")              |

**Installation:** N/A — no se instalan paquetes. **(Regla de memoria: nunca instalar/actualizar deps sin preguntar.)**

## Package Legitimacy Audit

No aplica — esta fase **no instala paquetes externos**. Todo usa dependencias ya presentes en el monorepo (Quasar, Pinia, axios, exceljs, Drizzle, Fastify, Vitest). `slopcheck` no corrió (no hay paquetes que auditar).

## Architecture Patterns

### System Data Flow

```
   ┌─────────────────── API (ya enforceado en 161) ────────────────────┐
   │  activities.is_special ─┐                                          │
   │  getScheduleSlotRaw.isSpecial (161-05)  reserve() gating (161-06)  │
   │  pickSubscriptionForActivity (161-01)   PASS_REQUIRED code         │
   └───────────────────────────┬───────────────────────────────────────┘
                               │  NUEVO EN 162 (superficie):
   ┌───────────────────────────┼───────────────────────────────────────┐
   │  getWeeklyGrid()  ── + isSpecial por slot (falta; JOIN ya existe)  │
   │  GET /me/especial-pass ── classesRemaining/budget/endDate/isSocio  │
   │  GET /admin/analytics/especiales ── attendance→schedules→          │
   │        activities(is_special)→sub especial(requires_presencial)     │
   │  GET /admin/analytics/especiales/export ── XLSX (sendExcelReply)    │
   └───────────────────────────┬───────────────────────────────────────┘
                               │
   ┌─── Member app ────────────┼───────────────────────────────────────┐
   │  useUserStore: + hasEspecialPass / hasOnlyEspecialPass /           │
   │        especialClassesRemaining (loadEspecialPass)                 │
   │  ReservasPage:                                                     │
   │    gate ── canAccessGrid = presencialAccess || hasEspecialPass     │
   │    slot ── badge "Especial" si slot.isSpecial (APP-01)             │
   │    slot ── estado por capability (socio-sin-pase → "requiere       │
   │            plan especial"; externo → regulares bloqueadas)          │
   │    contador ── chip x/2 en slots especiales + card Mi Templo (D-03)│
   │    reserve error ── code PASS_REQUIRED → dialog informativo        │
   │                     (qué es + $10.000 socios / $20.000 externos)   │
   └───────────────────────────────────────────────────────────────────┘
   ┌─── Admin ─────────────────────────────────────────────────────────┐
   │  AnaliticasPage: nuevo tab "Especiales" (patrón Referidos A/B)     │
   │  EspecialesTab.vue: tabla socio/externo por actividad/mes + export │
   │  useAnalyticsApi: getEspecialesReport() / exportEspeciales()       │
   └───────────────────────────────────────────────────────────────────┘
```

### Pattern 1: Exponer `isSpecial` en la grilla (recorrido de `maxCapacity`, espejo de 161-05)

`getWeeklyGrid` (`scheduling/service.ts:168-194`) YA joinea `activities` (para `activityName` y `activityMaxCapacity`). Falta seleccionar `isSpecial` y propagarlo al `slots.push` (`:299-319`). Recorrido completo (idéntico al de `maxCapacity` en 161-05, y al que ya recorre `activityMaxCapacity`):

```typescript
// 1. scheduling/service.ts — en el .select() de scheduleRows (:168-194):
isSpecial: schema.activities.isSpecial,
// 2. scheduling/service.ts — en slots.push({...}) (:299-319):
isSpecial: row.isSpecial,
// 3. scheduling/types.ts:54 — WeeklySlotView:
isSpecial: boolean;
// 4. scheduling/schemas.ts:57-71 — weeklySlotViewSchema (SIN esto fast-json-stringify lo strippea):
isSpecial: { type: "boolean" },
// 5. el-templo-app/src/types/scheduling.ts:15-29 — WeeklySlotView (mirror del frontend):
isSpecial: boolean
```

**Cobertura doble gratis:** `weeklySlotViewSchema` es el `items` tanto del grid admin (`schemas.ts:256`) como del grid member (`:769`). Un solo cambio de schema cubre ambas superficies.

### Pattern 2: Endpoint del pase del member (nuevo, chico, derivado del plural)

El app hoy sólo conoce UNA sub: `useUserStore.loadSubscription()` (`:248-270`) pega a `/members/subscription/me/subscription` (`subscriptions/member-routes.ts:56-110`), que usa `getMemberSubscription()` **singular** y **NO** devuelve `classesRemaining`. Para el contador x/2 hace falta el pase especial y su saldo.

**Recomendado:** endpoint nuevo `GET /me/especial-pass` en `member-routes.ts` (mismo plugin, mismo guard). Usa `getMemberSubscriptions()` **plural** (`service.ts:963`, ya trae `planCategory`, `classesRemaining`, `classesBudget`, `endDate`) y filtra por `categoryGroup(planCategory)==='especial'`:

```typescript
// Source: subscriptions/member-routes.ts (patrón GET /me/subscription + getMemberSubscriptions plural)
fastify.get("/me/especial-pass", async (request) => {
  const subs = await subscriptionService.getMemberSubscriptions(
    request.user.userId,
  );
  const pass = subs.find(
    (s) =>
      s.planCategory === "especial" &&
      (s.status === "active" || s.status === "paused"),
  );
  if (!pass) return { hasPass: false };
  // requiresPresencial del plan distingue Socio↔Externo (columna de 161-01).
  const plan = await subscriptionService.getPlanById(pass.planId);
  return {
    hasPass: true,
    classesRemaining: pass.classesRemaining ?? 0,
    classesBudget: pass.classesBudget ?? 0,
    endDate: pass.endDate,
    isSocio: plan?.requiresPresencial ?? false,
  };
});
```

**Por qué NO extender `/me/subscription` a array:** ese endpoint y el `subscription` singular del store los consume media app (gating de entrenamiento, multiBranch, program selector, etc.). Cambiar su forma es superficie de regresión enorme. Un endpoint aditivo es aislado y testeable. **(Decisión del planner — ver Open Questions.)**

### Pattern 3: Capabilities del pase en `useUserStore` (sin romper el singular)

`useUserStore` (`:180-201`) deriva `hasPresencialPlan`/`hasPresencialReservationAccess` del `subscription` singular. Agregar refs + capabilities del pase **sin tocar** esas (que sostienen el resto del app):

```typescript
// Nuevo ref + action (paralelo a loadSubscription):
const especialPass = ref<{
  hasPass: boolean;
  classesRemaining: number;
  classesBudget: number;
  endDate: string | null;
  isSocio: boolean;
} | null>(null);
async function loadEspecialPass() {
  /* GET /me/especial-pass */
}
// Nuevas capabilities:
const hasEspecialPass = computed(() => especialPass.value?.hasPass === true);
const especialClassesRemaining = computed(
  () => especialPass.value?.classesRemaining ?? 0,
);
// "solo pase" = tiene especial y NO tiene presencial (para el gate y el estado de slots regulares del externo)
const hasOnlyEspecialPass = computed(
  () => hasEspecialPass.value && !userStore.hasPresencialReservationAccess,
);
```

### Pattern 4: Gate de página refinado (D-06)

`ReservasPage.vue:707` — `canReservePresencial = userStore.hasPresencialReservationAccess`. El bloque "blocked" (`:55`) usa `!canReservePresencial && !trialEligible`. Refinar para que el externo-solo-pase entre:

```typescript
// El gate de PÁGINA se amplía; el gate por SLOT lo maneja el render + el backend.
const canAccessGrid = computed(
  () => userStore.hasPresencialReservationAccess || userStore.hasEspecialPass,
);
// Usar canAccessGrid en el v-else-if del empty-state (:55) en lugar de canReservePresencial.
```

Para el **externo-solo-pase** dentro de la grilla, los slots **regulares** deben mostrarse no-reservables (el backend ya los rechaza — GATE-04). **Opción más simple y robusta (recomendada): grilla completa, gating por slot** — cada slot decide su estado con `slot.isSpecial` + capabilities, y los regulares del externo renderizan un estado "requiere plan presencial" en vez del botón Reservar. Evita una segunda grilla filtrada y espeja el backend (nunca confiar en el cliente). Alternativa (filtrar a sólo especiales) esconde contexto y agrega ramas de estado. **(Decisión del planner — ver Open Questions.)**

### Pattern 5: Mensaje informativo APP-03 (patrón COVERAGE_EXPIRED)

`ReservasPage.vue:1265-1281` (`confirmReserve` catch) ya ramifica por `err.response?.data?.code === 'COVERAGE_EXPIRED'` → abre `showCoverageDialog`. Agregar rama espejo para `PASS_REQUIRED` (que el backend ya devuelve, 161-06 `routes.ts`):

```typescript
// Source: ReservasPage.vue:1270 (patrón exacto de COVERAGE_EXPIRED)
if (axios.isAxiosError(err) && err.response?.data?.code === "PASS_REQUIRED") {
  reserveDialog.value.show = false;
  showPassRequiredDialog.value = true; // nuevo dialog informativo (qué es + precios)
  return;
}
```

El dialog (nuevo `q-dialog`, espejo de `showCoverageDialog` en `:610`) explica qué es "Actividades con Aura", los precios ($10.000 socios / $20.000 externos) y que se compra en recepción/con el profe (D-02, sin pago in-app). CTA a WhatsApp reusando `buildWhatsAppUrl` (`:805-808`).

### Pattern 6: Reporte REP-01 socio/externo (attendance no guarda subscription_id)

**Hallazgo crítico:** `attendance` (`db/schema/attendance.ts`) NO tiene `subscription_id` — sólo `memberId`, `scheduleId`, `sessionDate`, `branchId`, `checkedInAt`. No se puede saber "de qué sub se descontó" ex-post. La clasificación socio/externo se deriva del plan `requires_presencial` de la **sub especial que cubre la `session_date`** del member:

```typescript
// Source: patrón de attendance-metrics-service.ts + churned export (analytics/routes.ts:539)
// attendance (mes) ── INNER JOIN schedules ── INNER JOIN activities (is_special=true)
//                  ── LEFT JOIN subscriptions (userId, planCategory='especial',
//                        startDate <= session_date <= endDate)   [la sub que cubre esa fecha]
//                  ── JOIN subscription_plans (requires_presencial)
// GROUP BY activity_id, (requires_presencial → 'socio' | 'externo')
```

- `requires_presencial=1` → **socio**; `=0` → **externo**.
- **Edge:** asistencia sin sub especial que cubra la fecha (renovación con hueco, borde de período) → clasificar por la sub especial más reciente del member, o marcar "sin clasificar". **(Open Question — el planner decide la regla de fallback.)**
- Ubicación: nuevo `analytics/especial-report-service.ts` + rutas en `analytics/routes.ts`:
  - `GET /admin/analytics/especiales?month=YYYY-MM` → JSON (filas por actividad × origen).
  - `GET /admin/analytics/especiales/export?month=YYYY-MM` → XLSX via `sendExcelReply` (`shared/excel.ts`), espejo de `/churned-members/export` (`routes.ts:539-604`).

### Pattern 7: Tab "Especiales" en Analíticas (espejo exacto de "Referidos A/B", commit de95b69a)

El patrón de agregar un tab está probado y es de bajo riesgo. Los 4 archivos del commit `de95b69a`:

1. `AnaliticasPage.vue`: `<q-tab name="especiales" label="Especiales" icon="star" />` (junto a `:171-180`), un `<q-tab-panel name="especiales">` (junto a `:299`), un `fetchEspeciales()` en el `switch` de `fetchTabData` (`:851`), refs `especialesData`/`loadingEspeciales`.
2. `useAnalyticsApi.ts`: `getEspecialesReport(month)` + `exportEspeciales(month)` (patrón `getReferralAbResults` `:387` y `exportChurnedMembers`).
3. `types/analytics.ts`: interfaces del response (espejo del type del API).
4. Nuevo `components/analytics/EspecialesTab.vue` (props `data`/`loading`; tabla socio/externo + botón export — patrón `MiembrosTab.vue` `onExportChurned` `:477-498`).

### Anti-Patterns to Avoid

- **NO cambiar `/me/subscription` a array** ni la semántica del `subscription` singular del store — superficie de regresión enorme (gating de entrenamiento, multiBranch, program selector).
- **NO inferir `isSpecial` en el cliente** (por nombre de actividad, etc.). Viene del backend por JOIN (T-161-11 lo resolvió server-side).
- **NO usar el gate de página como autorización.** El backend es la autoridad (161-06). El gate client-side es sólo UX de pantalla.
- **NO clasificar socio/externo por el `userStatus`** ni por "tiene presencial hoy" — usar `requires_presencial` del plan del pase (D-04, la distinción fue diseñada así en 161-01).
- **NO tocar caja/cobros/advanced-finance** — la plata del pase SÍ cuenta (D-11, ya resuelto en 161-04). El reporte REP-01 es de **asistencias**, no de plata.

## Don't Hand-Roll

| Problema                       | No construir                 | Usar en su lugar                                               | Por qué                                                       |
| ------------------------------ | ---------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| Export a Excel                 | Streaming/XLSX a mano        | `sendExcelReply` + `styleHeaderRow` (`shared/excel.ts`)        | Ya resuelve headers, estilo, content-type, filename fechado   |
| Manejo del error de reserva    | Parseo ad-hoc del error      | Patrón `code` + `axios.isAxiosError` (`ReservasPage.vue:1270`) | El backend ya devuelve `code=PASS_REQUIRED`; espejar COVERAGE |
| Selección de sub por categoría | Query nueva de subs          | `getMemberSubscriptions()` plural + `categoryGroup` (161-01)   | Ya trae planCategory/classesRemaining/status/endDate          |
| Distinción Socio↔Externo       | Heurística por precio/nombre | `subscription_plans.requires_presencial` (161-01)              | Columna diseñada para esto; sobrevive renames de Nacho        |
| Tab de analytics + fetch lazy  | Estructura nueva             | Patrón "Referidos A/B" (commit `de95b69a`, `AnaliticasPage`)   | 4 archivos, watch(activeTab) → fetchTabData ya wireado        |
| Card en la home del member     | Layout nuevo                 | `ReferralCtaCard` / `ReservaCtaCard` en `MiTemplo.vue:22,104`  | Estética premium y orden de cards ya resueltos                |

**Key insight:** toda la maquinaria (export, error-code, routing de sub, distinción socio/externo, tab de analytics, card de home) ya existe. 162 es **cablear estado existente a superficie existente**, no construir mecanismos.

## Runtime State Inventory

Esta fase es superficie: **no renombra ni migra estado, no agrega migraciones**. Sin embargo hay un ítem de **estado del cliente** que la fase debe corregir (no es dato persistido, es una latencia de modelo):

| Categoría                       | Items                                                                                                                                                                            | Acción                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Stored data                     | Ninguna — no hay migración ni dato nuevo. Los 2 planes especiales ya existen (0179, aplicada)                                                                                    | None — verificado (`ls migrations` termina en 0179; columnas presentes en schema)        |
| Live service config             | Ninguna — sin servicios externos                                                                                                                                                 | None — verificado                                                                        |
| OS-registered state             | Ninguna                                                                                                                                                                          | None                                                                                     |
| Secrets/env vars                | Ninguna                                                                                                                                                                          | None — no se agregan env vars                                                            |
| Build artifacts                 | Ninguna — sin renames de paquete                                                                                                                                                 | None                                                                                     |
| **Estado del cliente (código)** | `useUserStore.subscription` guarda UNA sola sub. Con presencial+pase, el singular puede devolver el pase → `hasPresencialReservationAccess=false` → socio bloqueado de la grilla | **Refinar capabilities** (Pattern 3) — no es data migration, es corrección de derivación |

**El punto crítico:** después de que 161 permita subs especiales en paralelo, el store del app tiene una **latencia de modelo** — asume "una sub cubre al member". La fase 162 debe agregar el conocimiento del pase al store para que el socio no se rompa y el externo entre. Es lo análogo cliente del Pitfall 1 de 161 (`getMemberSubscription` singular elige la sub equivocada).

## Common Pitfalls

### Pitfall 1: El socio presencial+pase queda bloqueado de la grilla

**Qué sale mal:** `useUserStore` carga `subscription` con `getMemberSubscription()` singular (`service.ts:947-952`: orden covers-today → active → startDate). Un socio con presencial + pase tiene ambas active y cubriendo hoy; el desempate por `startDate` puede devolver el **pase**. Entonces `hasPresencialReservationAccess` (`useUserStore:193-200`, exige `planCategory==='presencial'`) da `false` y `ReservasPage` muestra el empty-state "Reservas presenciales… tu plan no las incluye" (`:55,716-719`) — el socio no puede reservar NADA.
**Por qué pasa:** el store fue diseñado para "una sub". El pase especial es la primera categoría que compite en paralelo con presencial por la misma superficie de grilla.
**Cómo evitar:** cargar el pase por separado (`loadEspecialPass`, Pattern 2/3) y ampliar el gate a `canAccessGrid = hasPresencialReservationAccess || hasEspecialPass`. Idealmente `hasPresencialReservationAccess` no debería depender de cuál sub devolvió el singular — pero mientras `/me/subscription` siga singular, el gate ampliado lo cubre. **Señal temprana:** test manual (UAT) de un socio con presencial+pase que abre Reservas y ve la grilla, no el empty-state.

### Pitfall 2: `isSpecial` no viaja al frontend (schema lo strippea)

**Qué sale mal:** agregar `isSpecial` al `.select()` y al `slots.push` del service, pero olvidar `weeklySlotViewSchema` (`scheduling/schemas.ts:57-71`). fast-json-stringify **strippea** cualquier prop no declarada en el response schema — el slot llega sin `isSpecial`, el badge nunca aparece, y no hay error (tsc verde, endpoint 200).
**Cómo evitar:** checklist de 5 puntos del Pattern 1 (service select + push + type API + **schema** + type frontend). **Señal temprana:** `curl` del grid member y grep de `isSpecial` en la respuesta; o test de integración del grid que asierta `slots[0].isSpecial`.

### Pitfall 3: Contador x/2 desincronizado tras check-in

**Qué sale mal:** el `classesRemaining` se decrementa **al check-in** (D-04, no a la reserva). Si el app cachea `especialPass` y no lo recarga tras acciones, el contador miente (muestra 2/2 cuando ya asistió a una).
**Cómo evitar:** `loadEspecialPass()` en el mismo lugar que `loadSubscription()`/`loadGrid()` (al montar Reservas y tras cada reserva/cancelación). Aceptar que el número es "al último fetch" — el check-in ocurre en el gym (QR), no en esta pantalla, así que un refresh al entrar alcanza. **Señal temprana:** UAT — asistir a una especial, reabrir la app, ver 1/2.

### Pitfall 4: REP-01 clasifica mal por sub ambigua

**Qué sale mal:** un member con historial de renovaciones del pase tiene varias subs `especial`. Si la query no ancla por `session_date ∈ [startDate, endDate]`, un JOIN puede fanout o tomar la sub equivocada (ej. una vieja Externo cuando ya es Socio).
**Cómo evitar:** LEFT JOIN de la sub especial acotado por período que cubre `session_date`; definir el fallback para asistencias huérfanas (sub más reciente o "sin clasificar"). Test con un member que renovó cambiando de origen. **Señal temprana:** test de integración con socio y externo asistiendo a la misma actividad el mismo mes → 1 y 1.

### Pitfall 5: CI no typechequea los frontends (bug conocido)

**Qué sale mal:** CI corre `tsc` sólo en `api` y `web`, NO en `el-templo-app` ni `el-templo-admin` (ver memoria `reference_ci_no_typecheck_frontends`). Un error de tipo en el app (ej. `isSpecial` faltante en el type mirror) pasa CI y rompe el build de la app.
**Cómo evitar:** correr `vue-tsc --noEmit` **local** en `el-templo-app` y `el-templo-admin` antes de dar por cerrada la fase. **Señal temprana:** parte del gate de la fase (ver Validation Architecture).

## Code Examples

### Grid del member: badge de actividad especial (APP-01)

```vue
<!-- Source: ReservasPage.vue slot-card (:359-414 bloque regular member). Agregar junto a activityName (:368) -->
<span class="slot-card__activity">{{ slot.activityName }}</span>
<q-badge
  v-if="slot.isSpecial"
  class="slot-card__special-badge"
  label="Especial"
/>
<!-- Estado por capability para socio-sin-pase: en el bloque de acciones (:397-412),
     si slot.isSpecial && !userStore.hasEspecialPass && userStore.hasPresencialReservationAccess:
     mostrar chip "Requiere plan especial" en vez del botón Reservar (tap → dialog informativo). -->
```

### Contador x/2 (APP-02, D-03 — chip en grilla y/o card Mi Templo)

```vue
<!-- Chip en slots especiales (grilla): -->
<span
  v-if="slot.isSpecial && userStore.hasEspecialPass"
  class="slot-card__pass-counter"
>
  Te quedan {{ userStore.especialClassesRemaining }}/{{ especialPassBudget }}
</span>
<!-- O card en Mi Templo (MiTemplo.vue:22, junto a ReferralCtaCard) — patrón de card premium. -->
```

### Reporte REP-01: fila del export XLSX (patrón churned)

```typescript
// Source: analytics/routes.ts:566-601 (patrón exacto sendExcelReply)
const sheet = workbook.addWorksheet("Especiales");
sheet.columns = [
  { header: "Actividad", key: "activityName", width: 28 },
  { header: "Origen", key: "origin", width: 12 }, // 'Socio' | 'Externo'
  { header: "Asistencias", key: "count", width: 14 },
  { header: "Mes", key: "month", width: 12 },
];
styleHeaderRow(sheet);
for (const r of rows) sheet.addRow(r);
return sendExcelReply(workbook, reply, "especiales");
```

## State of the Art

| Enfoque previo (161)                                  | Superficie 162                                        | Impacto                                             |
| ----------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------- |
| Backend enforcea, grilla ciega al `isSpecial`         | `getWeeklyGrid` expone `isSpecial` por slot           | Badge + estado por slot en el app                   |
| App conoce UNA sub (singular, sin saldo)              | Endpoint del pase + capabilities del pase en el store | Contador x/2 + gate del externo-solo-pase           |
| Error de reserva genérico                             | `code=PASS_REQUIRED` → dialog informativo con precios | Mensaje de marketing interno (APP-03)               |
| Métricas excluyen especial (161-04), sin línea propia | Reporte de asistencias socio/externo + contador D-05  | Insumo del reparto manual + visibilidad de la línea |

## Assumptions Log

| #   | Claim                                                                                                    | Section           | Risk if Wrong                                                                        |
| --- | -------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------ |
| A1  | Endpoint nuevo `GET /me/especial-pass` es preferible a extender `/me/subscription` a array               | Pattern 2 / OpenQ | Bajo — el aislamiento reduce regresión; el planner puede elegir extender si prefiere |
| A2  | La clasificación socio/externo de REP-01 se deriva de `requires_presencial` de la sub que cubre la fecha | Pattern 6         | Medio — si un member cambió de origen, la regla de fallback importa (OpenQ)          |
| A3  | El singular `getMemberSubscription` puede devolver el pase y romper el gate del socio                    | Pitfall 1         | Alto si no se mitiga — el socio queda sin grilla. Mitigado por `canAccessGrid`       |
| A4  | Grilla completa con gating por slot es más simple que una grilla filtrada para el externo                | Pattern 4 / OpenQ | Bajo — decisión de UX; ambas son viables                                             |
| A5  | El reporte va como tab en Analíticas (no en Reportes), consistente con "Referidos A/B" y "Clases"        | Pattern 7         | Bajo — decisión de ubicación; el patrón es idéntico en ambos módulos                 |
| A6  | `getPlanById` expone `requiresPresencial` (161-02 lo agregó a PlanListItem/mapPlanRow)                   | Pattern 2         | Bajo — verificado en 161-02-SUMMARY (getPlanById devuelve requiresPresencial)        |

## Open Questions (RESOLVED)

> Las 4 preguntas quedaron resueltas durante la planificacion de la fase. Marcador inline por pregunta citando donde se resolvio.

1. **Endpoint del pase nuevo o extender `/me/subscription`?** - **(RESOLVED -> 162-02)**: se creo el endpoint aditivo `GET /me/especial-pass` (aislado, testeable, cero regresion sobre el `subscription` singular). Ver 162-02-PLAN.md.
   - Que sabemos: el store depende del `subscription` singular en toda la app; `getMemberSubscriptions` plural ya existe y trae todo.
   - Recomendacion: endpoint aditivo `GET /me/especial-pass` (aislado, testeable, cero regresion). **El planner decide.**

2. **Externo-solo-pase: grilla completa con regulares bloqueadas, o grilla filtrada a solo especiales?** - **(RESOLVED -> UI-SPEC E5)**: la matriz de estados del UI-SPEC define E5 = las regulares se OCULTAN client-side para el externo-solo-pase (grilla filtrada por `isSpecial`), implementado en 162-05. Ver 162-UI-SPEC.md (matriz E1-E5) y 162-05-PLAN.md Task 1.
   - Que sabemos: el backend ya rechaza regulares para especial-only (GATE-04). La grilla es semanal Lun-Sab; las especiales son sabado.
   - Recomendacion: grilla completa + gating por slot (espeja backend, menos ramas). **El planner decide (D-06 lo deja a discrecion).**

3. **REP-01: regla de fallback para asistencias sin sub especial que cubra la fecha.** - **(RESOLVED -> 162-03)**: 162-03 fija la regla: asistencia a especial sin sub especial que cubra la `session_date` -> clasificar 'socio' si el member tenia una sub presencial active/paused cubriendo esa fecha, si no 'externo' (mejor evidencia disponible; caso raro, solo por bypass staff D-07). Documentada en codigo y fijada por test. Ver 162-03-PLAN.md Task 1 y Task 3.
   - Que sabemos: `attendance` no guarda subscription_id; la mayoria de asistencias caeran dentro de un periodo de pase.
   - Recomendacion: clasificar por la sub especial mas reciente del member; si no tiene ninguna, "sin clasificar" (raro - implicaria asistencia a especial sin pase, solo posible por bypass staff D-07). **El planner define la regla y el test la fija.**

4. **Contador x/2: chip en grilla, card en Mi Templo, o ambos? (D-03 discrecion)** - **(RESOLVED -> UI-SPEC, ambos)**: se implementan AMBOS - chip "Especiales - x/2" en el header de la grilla + card en Mi Templo. Definido en el UI-SPEC e implementado en 162-05. Ver 162-UI-SPEC.md y 162-05-PLAN.md Task 1/Task 2.
   - Recomendacion: chip en los slots especiales (contexto donde se usa) + opcionalmente card en Mi Templo (visibilidad pasiva, analogo `ReferralCtaCard`). **El planner/UI-spec decide.**

## Environment Availability

| Dependencia              | Requerida por           | Disponible                    | Versión | Fallback |
| ------------------------ | ----------------------- | ----------------------------- | ------- | -------- |
| MySQL local (`eltemplo`) | tests de integración    | ✓ (entorno estándar del repo) | 8.0     | —        |
| pnpm                     | build/test/typecheck    | ✓                             | —       | —        |
| exceljs                  | export XLSX del reporte | ✓ (ya en `el-templo-api`)     | —       | —        |
| vue-tsc                  | typecheck de frontends  | ✓ (dev dep de app/admin)      | —       | —        |

Sin dependencias externas nuevas. Sin migraciones nuevas (0179 ya aplicada; la fase no toca el schema).

## Validation Architecture

### Test Framework

| Propiedad           | Valor                                                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework           | Vitest (integración contra MySQL real `eltemplo_test`) para la API                                                                                   |
| Config              | `el-templo-api/vitest.config.ts`                                                                                                                     |
| Quick run           | `cd el-templo-api && pnpm test <archivo>` (solo el archivo nuevo, local)                                                                             |
| Full suite          | corre en **CI** (regla del repo: no correr el suite completo local)                                                                                  |
| Typecheck API       | `cd el-templo-api && pnpm tsc --noEmit`                                                                                                              |
| Typecheck frontends | `cd el-templo-app && pnpm vue-tsc --noEmit` y `cd el-templo-admin && pnpm vue-tsc --noEmit` — **OBLIGATORIO LOCAL: CI NO typechequea los frontends** |

### Phase Requirements → Test Map

| Req     | Comportamiento                                                                     | Tipo           | Archivo sugerido / verificación                                                              |
| ------- | ---------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------- |
| APP-01  | `getWeeklyGrid` devuelve `isSpecial` por slot (especial vs regular)                | integ (API)    | `test/scheduling/*.test.ts` (extender un test del grid member) — asierta `slots[].isSpecial` |
| APP-01  | Badge/estado se renderiza según `isSpecial` + capability                           | manual/vue-tsc | UAT visual; `vue-tsc` para el type mirror                                                    |
| APP-02  | `GET /me/especial-pass` devuelve `classesRemaining`/`isSocio` para socio y externo | integ (API)    | nuevo `test/subscriptions/especial-pass-member.test.ts`                                      |
| APP-02  | Contador x/2 refleja `classesRemaining`; se recarga tras reserva                   | manual/vue-tsc | UAT (asistir → reabrir → 1/2)                                                                |
| APP-03  | Reserva de especial sin pase → dialog informativo (no notify genérico)             | manual         | UAT (member sin pase intenta reservar especial). Backend ya testeado (161-06)                |
| D-06    | Externo-solo-pase entra a la grilla; socio presencial+pase no se bloquea           | manual         | UAT — Pitfall 1 (crítico)                                                                    |
| REP-01  | Asistencias por actividad × socio/externo por mes                                  | integ (API)    | nuevo `test/analytics/especial-report.test.ts` (socio+externo misma actividad → 1 y 1)       |
| REP-01  | Export XLSX del reporte                                                            | integ (API)    | idem (asierta content-type + filas)                                                          |
| D-05    | Contador de subs especiales activas separadas socio/externo                        | integ (API)    | idem                                                                                         |
| Regres. | Grid admin/member existente sigue verde con `isSpecial` aditivo                    | integ (API)    | tests de scheduling existentes (CI)                                                          |

### Sampling Rate

- **Por commit:** `pnpm test <archivo tocado>` (API) + `tsc --noEmit` (API) + `vue-tsc --noEmit` (frontend tocado).
- **Por wave/merge:** CI corre el suite completo de la API (real MySQL). **CI NO cubre los frontends** — el gate de typecheck de app/admin es manual.
- **Phase gate:** CI verde + `vue-tsc` verde en app y admin + UAT visual (badge, contador, dialog, gate del externo/socio) antes del tren a master.

### Wave 0 Gaps

- [ ] `test/subscriptions/especial-pass-member.test.ts` — cubre `GET /me/especial-pass` (socio con `isSocio=true`, externo con `isSocio=false`, sin pase → `hasPass:false`).
- [ ] `test/analytics/especial-report.test.ts` — cubre REP-01 (clasificación socio/externo, agregación por actividad/mes, export) y D-05 (conteo de subs activas).
- [ ] Extender un test del grid member para asertar `isSpecial` en `slots[]`.
- [ ] Helpers ya reutilizables: `createTestPlan` (acepta `planCategory`/`monthlyClassBudget`/`requiresPresencial`), seed directo de subs especiales por Drizzle (patrón de `especial-pass.test.ts`), `assignTestPlan`, attendance helpers de `especial-consumption.test.ts`.

## Security Domain

`security_enforcement` no está seteado en config → tratar como **habilitado**.

### Applicable ASVS Categories

| ASVS Category         | Applies | Standard Control                                                                                                                                                                                                                         |
| --------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication     | yes     | Rutas member bajo `fastify.authenticate` (hook onRequest, `member-routes.ts:50-53`); admin bajo `requireAdminAnalytics`                                                                                                                  |
| V3 Session Management | no      | Sin cambios de sesión                                                                                                                                                                                                                    |
| V4 Access Control     | yes     | **IDOR:** `GET /me/especial-pass` deriva el userId de `request.user` — NUNCA acepta un userId param (espejo de `/coverage`, `member-routes.ts:112-135`). Reporte admin: `requireAdminAnalytics` + `requireBranchAccess` (patrón churned) |
| V5 Input Validation   | yes     | `month` del reporte validado por JSON-schema (formato `YYYY-MM`); querystring tipada                                                                                                                                                     |
| V6 Cryptography       | no      | Sin cripto nueva                                                                                                                                                                                                                         |

### Known Threat Patterns for esta superficie

| Pattern                                          | STRIDE                 | Standard Mitigation                                                                                    |
| ------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------ |
| Member lee el pase de otro (IDOR)                | Information Disclosure | userId server-derived de `request.user`, sin param (espejo `/coverage`)                                |
| Cliente falsea `isSpecial` para saltar el gating | Tampering              | El gating real es server-side (161-06); `isSpecial` en la grilla es sólo display. El backend re-valida |
| Admin no-autorizado ve el reporte                | Elevation of Privilege | `requireAdminAnalytics` + `requireBranchAccess` en la ruta del reporte (patrón analytics existente)    |
| Reporte filtra plata (fuera de scope)            | Information Disclosure | REP-01 es de asistencias, SIN montos (D-04). No joinear transactions/caja                              |

## Project Constraints (from CLAUDE.md + skills)

- **Logging:** `createLogger()` en el app/admin, `request.log`/`app.log` (Pino) en la API. Nunca `console.log`.
- **TypeScript:** sin `any`; `catch (err: unknown)` + `instanceof Error` / `axios.isAxiosError`.
- **Tests:** rutas nuevas → tests de integración en `el-templo-api/test/` contra MySQL real.
- **CI NO typechequea los frontends** (`reference_ci_no_typecheck_frontends`): correr `vue-tsc --noEmit` local en app y admin. Es un gate manual de la fase.
- **Sin migraciones nuevas** en esta fase (0179 ya aplicada). Si por algún motivo hiciera falta una, sería 0180 y por migración hand-written (nunca `drizzle-kit migrate`; sin `;` en comentarios).
- **Staging-first estricto:** feature branch → staging → tren a master. Nunca feature directo a master. **Preguntar antes de pushear.**
- **git add explícito** por ruta, nunca `git add -A`.
- **No instalar/actualizar deps sin preguntar** (no aplica: cero deps nuevas).
- **Frontend stores:** Pinia composition API; composables exponen `cleanup()`, sin `onUnmounted` interno.
- **Paleta de marca:** cálida, SIN azul; `quasar.variables.scss` fuente de verdad para el badge/estado.
- **Sentry:** `createLogger().error()` va a Sentry automáticamente.

## Sources

### Primary (HIGH confidence — código de esta rama, leído directamente)

- `el-templo-app/src/pages/ReservasPage.vue` (gate `:707`, empty-state `:55`, slot-cards `:359-469`, `slotCardClass :1053`, `confirmReserve` catch `:1265-1281`, `showCoverageDialog :610,803`)
- `el-templo-app/src/stores/useUserStore.ts` (`loadSubscription :248`, `hasPresencialPlan :180`, `hasPresencialReservationAccess :193`, `MemberSubscription` type `:49`)
- `el-templo-app/src/types/scheduling.ts` (`WeeklySlotView :15-29` — sin `isSpecial`)
- `el-templo-app/src/modules/progression/pages/MiTemplo.vue` (`ReferralCtaCard :22`, `showReservaCta :104,250`)
- `el-templo-api/src/modules/scheduling/service.ts` (`getWeeklyGrid :134-327` — JOIN activities `:189`, select `:168-194`, `slots.push :299-319`; NO expone `isSpecial`)
- `el-templo-api/src/modules/scheduling/types.ts` (`WeeklySlotView :54`), `schemas.ts` (`weeklySlotViewSchema :57-71`, usado por grid admin `:256` y member `:769`)
- `el-templo-api/src/modules/scheduling/routes.ts` (grid member `:769-808`)
- `el-templo-api/src/modules/subscriptions/member-routes.ts` (`GET /me/subscription :56-110` singular sin classesRemaining; `/coverage :112-135` patrón IDOR; `/plans :144`)
- `el-templo-api/src/modules/subscriptions/service.ts` (`getMemberSubscription :885-957` singular; `getMemberSubscriptions :963` plural con classesRemaining/planCategory)
- `el-templo-api/src/db/schema/attendance.ts` (columnas — NO subscription_id)
- `el-templo-api/src/modules/shared/excel.ts` (`sendExcelReply`, `styleHeaderRow`)
- `el-templo-api/src/modules/analytics/routes.ts` (`/churned-members/export :539-604` patrón XLSX)
- `el-templo-api/src/modules/analytics/attendance-metrics-service.ts` (patrón de query sobre `attendance`)
- `el-templo-admin/src/pages/AnaliticasPage.vue` (tabs `:161-181`, panels `:299`, `fetchTabData switch :821-855`, `watch(activeTab) :870`), `useAnalyticsApi.ts` (`getReferralAbResults :387`), `types/analytics.ts`, `components/analytics/{ReferidosAbTab,MiembrosTab}.vue`
- Commit `de95b69a` (patrón completo "tab nuevo en Analíticas")
- `.planning/phases/161-*/161-0{1..6}-SUMMARY.md` (contratos del núcleo), `161-RESEARCH.md`, `161-CONTEXT.md`
- `db/schema/subscription-plans.ts` (`monthlyClassBudget :46`, `requiresPresencial :50`)
- `.planning/REQUIREMENTS.md`, `.planning/phases/162-*/162-CONTEXT.md`

### Secondary / Tertiary

- N/A — sin búsquedas web; dominio 100% interno.

## Metadata

**Confidence breakdown:**

- Grilla `isSpecial` (APP-01): HIGH — recorrido verificado; `getWeeklyGrid` no lo expone, JOIN ya existe, schema strippea si falta.
- Contador + endpoint del pase (APP-02): HIGH (diagnóstico) — el app carga singular sin classesRemaining confirmado; `getMemberSubscriptions` plural ya trae todo. MEDIUM en la forma exacta (endpoint nuevo vs extensión — OpenQ 1).
- Gate del member (D-06): HIGH — el riesgo del singular (Pitfall 1) verificado leyendo el orden del `getMemberSubscription`.
- Mensaje APP-03: HIGH — patrón `COVERAGE_EXPIRED` verificado; backend ya devuelve `PASS_REQUIRED`.
- Reporte REP-01: HIGH (mecánica) — `attendance` sin subscription_id confirmado, patrón de export verificado. MEDIUM en la clasificación (fallback de sub — OpenQ 3).
- Admin tab (D-05): HIGH — patrón "Referidos A/B" idéntico y de bajo riesgo.

**Research date:** 2026-07-14
**Valid until:** ~2026-08-14 (código interno estable; re-verificar que 161 no cambió contratos si pasa mucho tiempo antes de planificar).
