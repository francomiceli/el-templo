# Phase 155: Horarios - Pattern Map

**Mapped:** 2026-07-04
**Files analyzed:** 15 (14 a modificar + 1 migración nueva; 1 verify-only)
**Analogs found:** 15 / 15 (todo es modificación de superficies existentes — los "analogs" son los archivos mismos + patrones hermanos del módulo)

## Respuestas a los hallazgos no obvios (para el planner)

1. **La grilla del admin ASUME 1 slot por celda — HARD.** `HorariosPage.vue:557-563` construye `slotMap = Map<string, WeeklySlotView>` keyeada por `` `${startTime}-${dayOfWeek}` `` (`slotKey`, línea 552). Con dos clases simultáneas, la segunda **pisa** a la primera en el `map.set` y desaparece de la UI. Consumidores single-slot: `getCellSlot` (574), `cellClass` (582), render de celda (310-335), `onCellClick` (855-883). Todo esto debe pasar a `Map<string, WeeklySlotView[]>`.
2. **La member app NO rompe con N clases por franja.** `ReservasPage.vue:967-976` renderiza una **lista** de cards por día (`selectedDaySlots` sorted + split morning/afternoon por `startTime`), sin keying por celda: dos clases a la misma hora aparecen como dos cards. El cupo mostrado viene de `slot.maxCapacity` de la API (línea 1084: `slot.maxCapacity - slot.bookedCount`) → se corrige solo al servir cupo efectivo desde `getWeeklyGrid`. **Verify-only, sin cambios de diseño.**
3. **No hay colisión por (branch, day, time) en los dialogs.** `SlotDetailDialog` y `DeleteSlotDialog` reciben `scheduleId` (HorariosPage.vue:350-368) — keyean por id de slot, no por franja. El único punto de desambiguación es `onCellClick` (855): hoy hace `getCellSlot(time, day)` y abre ese único slot; con N slots por celda hay que elegir CUÁL se clickeó (el render apilado debe propagar el slot puntual al click, no la celda).
4. **El ABM de actividades YA existe completo — no crear endpoints nuevos.** API: `POST/GET/PUT /activities` en `scheduling/routes.ts:123-185`, guard módulo-level `ALL_STAFF_ROLES` (routes.ts:110-119) — mismo guard que ve el profe (Horarios es categoría libre, 149 D-04). Frontend: tab "Actividades" = `ActivitiesDialog.vue` (alias `ActivitiesPanel`) embebido en HorariosPage (343); composable `useSchedulingApi.createActivity` ya existe (`useSchedulingApi.ts:26-41`). D-04 (creación inline) = reusar `createActivity` desde `CreateSlotDialog`, cero backend nuevo salvo el campo `maxCapacity`.
5. **Overlap-checks: hay UNO solo (createSchedule) + un agujero.** El único check de solape es `service.ts:93-116`. PERO `updateScheduleActivity` (`service.ts:513-545`) cambia la actividad de un slot **sin chequear solape** — con D-01, cambiar la actividad de un slot para que coincida con otra clase simultánea de la misma actividad crearía un solape misma-actividad silencioso. El planner debe decidir: agregar el mismo check re-scopeado ahí (recomendado, reusa el helper/query) o documentarlo como gap aceptado. `seedDefaultSchedules` (632-663) dedupea por branch+day+startTime — es seed-only, no bloquea. No existe duplicación semanal ni check en holidays.
6. **Consumidores de branch capacity fuera de booking-service:** (a) `service.ts getWeeklyGrid` — línea 158 lee `branch.maxCapacity` UNA vez y lo aplica a TODOS los slots (274-275, incluye `isFull`) → debe pasar a cupo efectivo por slot (la query ya joinea `activities`, línea 189-192: agregar `activities.maxCapacity` al select es gratis); (b) `service.ts getSlotDetail` — líneas 299-304 (`branch?.maxCapacity ?? 22`) → ídem; (c) `analytics/service.ts:841-885 y 927-969` — % de ocupación **agregado por sucursal** (avgPerWeek / branch.maxCapacity): es métrica agregada, con cupo por actividad queda aproximada; NO tocar en esta fase (dejar nota, no requirement).
7. **Próxima migración: `0167`.** Última en `src/db/migrations/`: `0166_seed_pricing_card_surcharge.sql`.
8. **`getBranchCapacity` tiene 4 call sites, no 3:** `booking-service.ts:278` (reserve member), `:600` (admin add booking), `:1088` (findNextAvailableDate), `:1255` (generación de bookings de plan fijo); definición privada en `:1757-1764`. Todos tienen a mano `scheduleRow`/`sched` con `activityId` (`getScheduleSlotRaw` ya devuelve `activityId`, línea 1775) → el helper único puede ser `getEffectiveCapacity(branchId, activityId)` reemplazando 1:1.

**Extra relevante:** la regla "una reserva por día" (`booking-service.ts:256-273`) impide que un socio reserve dos clases simultáneas — sin cambios. El índice `idx_schedules_branch_day_time` (schedules.ts:36-40) sigue sirviendo como prefijo para la query de overlap con el filtro extra por `activityId`.

## File Classification

| File                                                             | Role                        | Data Flow        | Analog / patrón fuente                                                           | Match |
| ---------------------------------------------------------------- | --------------------------- | ---------------- | -------------------------------------------------------------------------------- | ----- |
| `el-templo-api/src/db/schema/activities.ts`                      | model (modify)              | CRUD             | `src/db/schema/branches.ts:24` (`maxCapacity` int) — pero nullable               | exact |
| `el-templo-api/src/db/migrations/0167_*.sql`                     | migration (new)             | batch            | `src/db/migrations/0162_created_member_id.sql`                                   | exact |
| `el-templo-api/src/modules/scheduling/service.ts`                | service (modify)            | CRUD             | self — `createSchedule:93-116`, `getWeeklyGrid:147-286`, `getSlotDetail:299-304` | exact |
| `el-templo-api/src/modules/scheduling/booking-service.ts`        | service (modify)            | request-response | self — `getBranchCapacity:1757` + 4 call sites                                   | exact |
| `el-templo-api/src/modules/scheduling/activity-service.ts`       | service (modify)            | CRUD             | self — `createActivity:24-56`, `updateActivity:75-160`                           | exact |
| `el-templo-api/src/modules/scheduling/schemas.ts`                | config (modify)             | request-response | self — `createActivitySchema:130`, `weeklySlotViewSchema:51`                     | exact |
| `el-templo-api/src/modules/scheduling/types.ts`                  | model (modify)              | —                | self — `ActivityRecord:20-27`                                                    | exact |
| `el-templo-api/src/modules/scheduling/routes.ts`                 | route (modify, mínimo)      | request-response | self — `POST /activities:124-138` (body types)                                   | exact |
| `el-templo-api/test/scheduling/155-*.test.ts` (new)              | test                        | request-response | `test/scheduling/schedule-activity-crud.test.ts`                                 | exact |
| `el-templo-admin/src/pages/HorariosPage.vue`                     | component (modify)          | request-response | self — `slotMap:557`, `onCellClick:855`, celda desktop:301-336                   | exact |
| `el-templo-admin/src/components/scheduling/CreateSlotDialog.vue` | component (modify)          | request-response | self + `ActivitiesDialog.vue:161-189` (create inline)                            | exact |
| `el-templo-admin/src/components/scheduling/ActivitiesDialog.vue` | component (modify)          | CRUD             | self — form:72-94                                                                | exact |
| `el-templo-admin/src/composables/useSchedulingApi.ts`            | composable (modify)         | request-response | self — `createActivity:26-41`                                                    | exact |
| `el-templo-admin/src/types/scheduling.ts`                        | model (modify)              | —                | mirror de API `types.ts` (ActivityRecord:15)                                     | exact |
| `el-templo-app/src/pages/ReservasPage.vue`                       | component (**verify-only**) | request-response | self — `selectedDaySlots:967-976`, cupo:1084                                     | n/a   |

## Pattern Assignments

### `activities.ts` schema + migración 0167 (D-05)

**Analog columna:** `branches.ts:24` — `maxCapacity: int("max_capacity").default(22).notNull()`. La nueva es igual pero **nullable y sin default** (NULL = hereda sucursal):

```typescript
// activities.ts — agregar tras isActive (patrón mysql-core int nullable)
maxCapacity: int("max_capacity"),
```

**Analog migración:** `0162_created_member_id.sql` — hand-written, header explicando por qué (db:generate roto por drift, `_migrations` es la fuente de verdad), **sin `;` en comentarios** (el runner splitea por `;` antes de strippear `--`):

```sql
-- Phase 155 (HOR-03 / D-05) -- cupo por actividad
-- Hand-written (db:generate roto por drift pre-existente, igual que 0154/0158/0161/0162)
-- NULL = hereda branch.max_capacity -- sin backfill, cero cambio para datos existentes

ALTER TABLE `activities`
  ADD COLUMN `max_capacity` int NULL AFTER `is_active`;
```

Recordar (memoria de proyecto): commitear el SQL junto al schema, aplicar con `pnpm db:migrate`, nunca `drizzle-kit migrate`.

### `scheduling/service.ts` — re-scope del overlap (D-01)

**Patrón actual** (`service.ts:93-116`) — la query a extender agregando `eq(schema.schedules.activityId, activityId)` al `and(...)`, y el mensaje nombra la actividad:

```typescript
const overlapping = await this.db
  .select({
    id: schema.schedules.id,
    startTime: schema.schedules.startTime,
    endTime: schema.schedules.endTime,
  })
  .from(schema.schedules)
  .where(
    and(
      eq(schema.schedules.branchId, branchId),
      eq(schema.schedules.dayOfWeek, dayOfWeek),
      eq(schema.schedules.isActive, true),
      lt(schema.schedules.startTime, endTime), // [start,end) — conservar tal cual
      gt(schema.schedules.endTime, startTime),
    ),
  )
  .limit(1);

if (overlapping.length > 0) {
  const ex = overlapping[0];
  throw new ConflictError(
    `Ya existe un horario activo ${ex.startTime}-${ex.endTime} que se solapa en esta sede y dia`,
  );
}
```

La validación de actividad previa (`service.ts:72-78`) ya trae el activity row — puede traer también `name` y `maxCapacity` en el mismo select. **No olvidar el mismo check en `updateScheduleActivity` (513-545)** — ver hallazgo 5.

### `scheduling/service.ts` — cupo efectivo en getWeeklyGrid y getSlotDetail (D-06)

`getWeeklyGrid` ya joinea activities (189-192); agregar `activityMaxCapacity: schema.activities.maxCapacity` al select (171-183) y por slot:

```typescript
// hoy (274-275): un solo maxCapacity de branch para todos los slots
maxCapacity,
isFull: counts.bookedCount >= maxCapacity,
// pasa a: (row.activityMaxCapacity ?? branch.maxCapacity) por slot
```

`getSlotDetail:299-304` hace la misma resolución (hoy `branch?.maxCapacity ?? 22`).

### `booking-service.ts` — helper único de cupo efectivo (D-06/D-07)

**Patrón actual a envolver** (`booking-service.ts:1757-1764`):

```typescript
private async getBranchCapacity(branchId: number): Promise<number> {
  const [branch] = await this.db
    .select({ maxCapacity: schema.branches.maxCapacity })
    .from(schema.branches)
    .where(eq(schema.branches.id, branchId));
  return branch?.maxCapacity ?? 22;
}
```

Nuevo helper (naming a discreción, sugerido `getEffectiveCapacity(branchId, activityId)`): `activity.maxCapacity ?? branch.maxCapacity ?? 22`. Reemplazo 1:1 en los **4** call sites — todos ya tienen `activityId` a mano vía `scheduleRow`/`sched`:

| Call site | Contexto                      | Fuente de activityId                                                   |
| --------- | ----------------------------- | ---------------------------------------------------------------------- |
| `:278`    | reserve() dentro de tx        | `scheduleRow` (getScheduleSlotRaw, incluye `activityId:1775`)          |
| `:600`    | adminAddBooking               | `scheduleRow`                                                          |
| `:1088`   | findNextAvailableDate         | `scheduleRow`                                                          |
| `:1255`   | generación bookings plan fijo | `sched` (verificar que el select incluya activityId; si no, agregarlo) |

El check es **por slot** (`activeCount >= maxCapacity` con `countActiveBookings(scheduleId, date)`) — ya es per-clase, D-07 se cumple solo con cambiar la fuente del número. **Duplicación conocida:** `service.ts` y `booking-service.ts` resolverán cupo efectivo cada uno (getWeeklyGrid lo necesita batch vía join; booking-service puntual vía helper) — el planner decide si extrae una función compartida o acepta las dos formas (batch join + helper puntual) documentadas.

### `activity-service.ts` + `schemas.ts` + `types.ts` + `routes.ts` — maxCapacity en el ABM (D-08)

**createActivity** (`activity-service.ts:24-56`): agregar param/campo `maxCapacity?: number | null` al insert (values:47-50). **updateActivity** (75-160): el patrón de update parcial ya existe (144-155):

```typescript
const updateData: Partial<typeof schema.activities.$inferInsert> = {};
if (data.name !== undefined) updateData.name = data.name;
if (data.description !== undefined) updateData.description = data.description;
if (data.isActive !== undefined) updateData.isActive = data.isActive;
// + if (data.maxCapacity !== undefined) updateData.maxCapacity = data.maxCapacity;
```

**Ojo semántica null-vs-undefined:** para PODER limpiar el cupo (volver a heredar), el body debe aceptar `maxCapacity: null` explícito — patrón `!== undefined` lo soporta si el JSON schema declara `{ type: ["integer", "null"] }`.

**schemas.ts** — `createActivitySchema:130-145` y `updateActivitySchema:158-202` suman `maxCapacity: { type: ["integer", "null"], minimum: 1 }` (validación D-08: entero positivo; techo razonable a discreción, ej. `maximum: 500`); `activityRecordSchema` (~línea 20-32) y `ActivityRecord` en `types.ts:20-27` suman `maxCapacity: number | null`. **Fastify fast-json-stringify strippea propiedades no declaradas en el response schema** (comentario en schemas.ts:177-180) — si falta en `activityRecordSchema`, el campo llega vacío al cliente aunque el service lo devuelva.

**routes.ts** — solo actualizar los generics del body (`routes.ts:124, 147-149`), el handler ya pasa `request.body` completo al service en PUT.

### `HorariosPage.vue` — N clases por celda + click-para-crear (D-02/D-03)

**Patrón a romper** (`HorariosPage.vue:552-576`):

```typescript
function slotKey(startTime: string, dayOfWeek: number): string {
  return `${startTime}-${dayOfWeek}`;
}
const slotMap = computed(() => {
  const map = new Map<string, WeeklySlotView>(); // → Map<string, WeeklySlotView[]>
  for (const s of gridSlots.value) {
    map.set(slotKey(s.startTime, s.dayOfWeek), s); // → push al array
  }
  return map;
});
function getCellSlot(
  time: string,
  dayOfWeek: DayOfWeek,
): WeeklySlotView | undefined {
  return slotMap.value.get(slotKey(time, dayOfWeek)); // → getCellSlots(): WeeklySlotView[]
}
```

Consumidores a migrar: template desktop (310-335: activityName/ocupación/FERIADO/CANCELADA por slot), `cellClass:582-595` (color por slot apilado o agregado de celda — discreción), `onCellClick:855-883` (con N slots, el click debe venir del sub-elemento del slot, no de la celda; el modo delete-selection en 862-874 también elige por slot). Vista mobile (`selectedDaySlots:609-613`) ya es lista → no rompe, igual que la member app.

**Click-para-crear (D-03):** hoy `onCellClick` corta en `if (!slot) return` (857) y `.grid-cell--empty` tiene `cursor: default` (1003-1010). Celda vacía pasa a abrir `CreateSlotDialog` con prefill `{ branchId: selectedBranchId, dayOfWeek: day, startTime: row.time }` (la celda conoce `row.time!`, `day.dayOfWeek`, `day.date` — línea 308). Affordance visual a discreción.

### `CreateSlotDialog.vue` — prefill + actividad inline + cupo (D-03/D-04/D-08)

**Patrón de props/reset actual** (`CreateSlotDialog.vue:94-121, 173-182, 223-231`): props tipadas + `resetForm()` al abrir vía `watch(() => props.show)`. El prefill entra como prop opcional (ej. `initial?: { dayOfWeek, startTime, endTime? }`) consumida en `resetForm` — hoy ya prefillea `branchId: props.defaultBranchId` (175), extender ese mismo patrón. Los campos quedan editables (prefill, no lock — discreción ya resuelta en CONTEXT).

**Actividad inline (D-04):** patrón de creación ya escrito en `ActivitiesDialog.vue:171-176`:

```typescript
await schedulingApi.createActivity({
  name: activityForm.value.name,
  description: activityForm.value.description || undefined,
});
$q.notify({ type: "positive", message: "Actividad creada" });
```

En el dialog: opción "crear nueva actividad" en el `q-select` de actividad (54-63) que despliega nombre (+description opcional, + cupo D-08), llama `createActivity`, y setea `form.activityId` con el id devuelto. Manejo de error 409 inline con `extractError` — patrón ya en `onSubmit:208-215` (mensaje en el form, no toast, para no perder contexto).

**Campo Cupo:** en `ActivitiesPanel` (form `ActivitiesDialog.vue:76-94`, agregar `q-input type="number"` con hint "vacío = hereda el cupo de la sucursal") y en la creación inline del CreateSlotDialog. `startEditActivity:151-154` debe cargar `maxCapacity` al form.

### `useSchedulingApi.ts` + `types/scheduling.ts` (admin)

`createActivity:26-41` / `updateActivity:59-77`: sumar `maxCapacity?: number | null` a los data types. `ActivityRecord` en `src/types/scheduling.ts:15` espeja el de la API. Patrón del composable (loading/error/extractError) se conserva tal cual.

### Test de integración nuevo — analog `test/scheduling/schedule-activity-crud.test.ts`

Estructura a copiar entera (es el test de la MISMA superficie): `createTestApp` + `getAuthToken("admin@test.com", "adminpass123")` + `cleanAllTestData` en beforeEach + fake timers pinneados (74-77) + branch seeded no-virtual (84-88) + helpers `createActivity`/`postSchedule` (105-138). Casos nuevos según CONTEXT:

- Solape misma actividad → 409 (adaptar test "rechaza overlap activo" :141-163 — hoy usa la misma actividad, sigue pasando).
- **Solape actividades distintas → 201** (el caso nuevo D-01; espejo del anterior con segunda actividad).
- Back-to-back misma actividad sigue 201 (:166-174, sin cambios).
- Cupo actividad < cupo sucursal → reserva N+1 cae a `lista_espera` en el menor (fixture: activity.maxCapacity=1, reservar 2 — ver seeding de bookings en `scheduling.test.ts`).
- Actividad sin cupo (NULL) hereda `branch.maxCapacity`.
- `POST /activities` con `maxCapacity` lo persiste y lo devuelve; `PUT` con `null` lo limpia.

## Shared Patterns

### Guard del módulo (no tocar)

**Source:** `scheduling/routes.ts:110-119` — hook `onRequest` módulo-level: `authenticate` + `ALL_STAFF_ROLES` + `attachCountryScope`. `POST /schedules` suma `requireBranchAccess({ from: "body.branchId" })` (202). Las rutas nuevas/modificadas NO agregan guards distintos (Horarios es categoría libre, 149 D-04).

### Error handling API

**Source:** `scheduling/routes.ts:127-137` — `try/catch (err: unknown)` + `handleServiceError(err, reply, request.log, "context")`; services lanzan `BadRequestError/NotFoundError/ConflictError` de `../shared/errors`. Mensajes de usuario en español sin tildes en API (ej. "se solapa en esta sede y dia").

### Error handling admin frontend

**Source:** `CreateSlotDialog.vue:208-215` (error inline en form con `extractError`) y `ActivitiesDialog.vue:180-188` (toast negativo con `extractError`). Logging con `createLogger('ComponentName')`, nunca console.

### Migraciones hand-written

**Source:** `0162_created_member_id.sql` — header con fase+decision, justificación de hand-written, **jamás `;` dentro de comentarios SQL**, `ALTER TABLE ... ADD COLUMN ... NULL AFTER ...`.

## No Analog Found

Ninguno — todos los cambios son sobre superficies existentes con patrón directo en el mismo módulo.

## Metadata

**Analog search scope:** `el-templo-api/src/modules/scheduling/`, `el-templo-api/src/db/{schema,migrations}/`, `el-templo-api/test/scheduling/`, `el-templo-admin/src/{pages,components/scheduling,composables,types}/`, `el-templo-app/src/pages/`, `el-templo-api/src/modules/analytics/`
**Files scanned:** ~25 (12 leídos en profundidad)
**Pattern extraction date:** 2026-07-04
