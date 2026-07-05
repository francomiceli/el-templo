---
phase: 155-horarios
reviewed: 2026-07-04T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - el-templo-admin/src/components/scheduling/ActivitiesDialog.vue
  - el-templo-admin/src/components/scheduling/CreateSlotDialog.vue
  - el-templo-admin/src/composables/useSchedulingApi.ts
  - el-templo-admin/src/pages/HorariosPage.vue
  - el-templo-admin/src/types/scheduling.ts
  - el-templo-api/src/db/migrations/0167_activity_max_capacity.sql
  - el-templo-api/src/db/schema/activities.ts
  - el-templo-api/src/modules/scheduling/activity-service.ts
  - el-templo-api/src/modules/scheduling/booking-service.ts
  - el-templo-api/src/modules/scheduling/routes.ts
  - el-templo-api/src/modules/scheduling/schemas.ts
  - el-templo-api/src/modules/scheduling/service.ts
  - el-templo-api/src/modules/scheduling/types.ts
  - el-templo-api/test/scheduling/155-horarios.test.ts
findings:
  critical: 0
  warning: 4
  info: 6
  total: 10
status: warnings_resolved
resolution:
  fixed_at: 2026-07-04
  warnings_fixed: 4
  info_deferred: 6
  commits:
    WR-01: 418e0fe9
    WR-02: 7cb569ed
    WR-03: ed114a78
    WR-04: 398c2501
---

# Phase 155: Code Review Report

**Reviewed:** 2026-07-04
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Revisión adversarial de la fase 155 (Horarios: clases simultáneas HOR-01, crear-desde-slot HOR-02, cupo por actividad HOR-03). Se verificaron los invariantes bloqueados del CONTEXT contra el código real:

- **D-01 (overlap re-scopeado por actividad):** correcto. `findOverlappingSchedule` (service.ts:753-784) filtra por `branchId + dayOfWeek + activityId + isActive`, semántica `[start,end)` con `lt`/`gt` estrictos (back-to-back OK). Se aplica en `createSchedule` Y en `updateScheduleActivity` (con `excludeScheduleId` para no colisionar consigo mismo). Verificado por test de integración (mismo/distinta actividad, back-to-back, PATCH que colisiona → 409).
- **D-06/D-07 (cupo efectivo por slot):** los 4 call sites de reservas/waitlist en `booking-service.ts` (reserve ~278, adminAddBooking ~603, findNextAvailableDate ~1094, generateFixedBookings ~1266) migraron de `getBranchCapacity` a `getEffectiveCapacity(branchId, activityId)` con fallback `activity ?? branch ?? 22` (`branches.maxCapacity` es notNull default 22, así que el `?? 22` final es defensivo). Grilla (`isFull` per-slot) y detalle también resuelven el cupo efectivo — pero NO vía el helper único (ver WR-02).
- **D-02/D-03/D-04 (admin):** `slotMap` acumula N slots por celda (array, no `map.set` pisado); click desambiguado por slot concreto en desktop (chips con `@click.stop`) y mobile (`onMobileSlotClick(slot)` pasa el objeto directo, sin round-trip por time/day). Prefill de celda vacía y actividad inline con sentinel `-1` funcionan y el sentinel se limpia del select. Member app (ReservasPage) renderiza lista plana por día sin mapa por hora → N clases simultáneas aparecen como cards separadas, sin colisión.
- **Migración 0167:** sin `;` en comentarios (runner-safe), nullable sin backfill, numeración correcta (última 0166). No es literalmente re-ejecutable (ver IN-01).
- **Gates:** `tsc --noEmit` del API verde. Sin `any`, sin `console.*` en los archivos tocados.

No se encontraron blockers. 4 warnings (agujero de reactivación vs D-01, triplicación de la resolución de cupo vs el "helper único" de D-06, drift de analytics, gaps de cobertura) y 6 info.

## Warnings

### WR-01: `toggleSchedule` (reactivación) no re-corre el check de solape — D-01 violable por esa vía

**File:** `el-templo-api/src/modules/scheduling/service.ts:469-493`
**Issue:** `findOverlappingSchedule` excluye slots inactivos (correcto para no bloquear la reutilización de franjas), pero la reactivación no re-valida. Secuencia: (1) slot A "Calistenia" Lun 10-11 activo → desactivar A; (2) crear slot B "Calistenia" Lun 10-11 (pasa, A está inactivo); (3) reactivar A vía `PUT /schedules/:id/toggle` → dos slots ACTIVOS de la MISMA actividad solapados, violando el invariante que esta fase acaba de endurecer. El agujero pre-existe (fase 113 lo tenía con el scope por sucursal), pero la fase cerró el gap análogo en `updateScheduleActivity` ("hallazgo 5") y dejó este hermano abierto. Downstream: dos chips idénticos en la grilla, ambos reservables, y el mensaje de error de `createSchedule` deja de ser garantía del estado.
**Fix:** en `toggleSchedule`, cuando `isActive === true`, re-correr el mismo probe antes del UPDATE:

```ts
if (isActive && !existing.isActive) {
  const overlapping = await this.findOverlappingSchedule({
    branchId: existing.branchId,
    dayOfWeek: existing.dayOfWeek,
    activityId: existing.activityId,
    startTime: existing.startTime,
    endTime: existing.endTime,
    excludeScheduleId: scheduleId,
  });
  if (overlapping) {
    throw new ConflictError(
      `No se puede reactivar: se solapa con un horario de la misma actividad ${overlapping.startTime}-${overlapping.endTime}`,
    );
  }
}
```

(`getScheduleSlot` ya trae `activityId/startTime/endTime`, no requiere query extra.)

**Resolution:** fixed (`418e0fe9`). `toggleSchedule` re-corre `findOverlappingSchedule` (con `excludeScheduleId`) al reactivar; rechaza con 409 nombrando la actividad. Se agregó 409 al response schema del toggle y tests de integración (reactivación colisiona → 409, ventana libre → 200).

### WR-02: La resolución del cupo efectivo vive en 3 lugares — D-06 pedía "helper único (no triplicar la resolución)"

**File:** `el-templo-api/src/modules/scheduling/booking-service.ts:1775-1789`, `el-templo-api/src/modules/scheduling/service.ts:296-307`, `el-templo-api/src/modules/scheduling/service.ts:255-256`
**Issue:** `getEffectiveCapacity` es `private` de `BookingService`; `SchedulingService.getSlotDetail` duplica EXACTAMENTE la misma query (branches leftJoin activities + `activityCapacity ?? branchCapacity ?? 22`) inline, y `getWeeklyGrid` re-implementa el coalesce (`row.activityMaxCapacity ?? maxCapacity` — justificable por el batching de la grilla, un query por semana en vez de N). El detalle NO tiene esa justificación: es una copia 1:1 de la lógica del helper en otra clase. Riesgo concreto de drift: si mañana cambia la regla (p.ej. `min(activity, branch)` o techo agregado — el CONTEXT lo lista como fase futura), hay que acordarse de tocar 3 lugares; el que quede atrás produce cupos inconsistentes entre reservar (booking-service) y lo que el admin ve (detalle/grilla).
**Fix:** extraer `getEffectiveCapacity(db, branchId, activityId)` a un helper compartido del módulo (p.ej. `scheduling/capacity.ts` o función exportada usada por ambos services) y hacer que `getSlotDetail` lo consuma. Para la grilla, dejar el coalesce batched pero con un comentario que lo ancle al helper (o un `resolveEffectiveCapacity(activityCap, branchCap)` puro compartido que ambos paths llamen, eliminando el drift del coalesce).

**Resolution:** fixed (`7cb569ed`). Nuevo módulo `scheduling/capacity.ts` con `getEffectiveCapacity(db, branchId, activityId)` (query+resolve) y `resolveEffectiveCapacity(activityCap, branchCap)` (puro). `BookingService.getEffectiveCapacity` delega al helper; `getSlotDetail` lo consume; `getWeeklyGrid` usa el resolver puro sobre su coalesce batched. Sin cambio de semántica.

### WR-03: Analytics de ocupación sigue normalizando por `branches.maxCapacity` — denominador incorrecto para actividades con cupo propio

**File:** `el-templo-api/src/modules/analytics/service.ts:841-848,925-933` (fuera del diff, afectado por el cambio de invariante)
**Issue:** `getSlotOccupancy` y el heatmap usan un único `maxCapacity` por sucursal como denominador de `averageOccupancy`. Hasta esta fase eso era exacto; a partir de HOR-03, un slot de una actividad con `maxCapacity = 8` que llena sus 8 lugares reporta 36% de ocupación (8/22) en vez de 100%. La métrica se degrada silenciosamente apenas alguien configure un cupo por actividad — que es exactamente lo que la fase habilita. No rompe reservas (D-06 se limitó a los checks de booking), pero el reporte de gestión miente.
**Fix:** en `getSlotOccupancy`, joinear `activities.maxCapacity` (la query ya joinea `activities` para el nombre) y usar `COALESCE(activities.max_capacity, branches.max_capacity)` como denominador por slot. El heatmap por hora es agregado multi-slot y puede quedar como está con un comentario, o sumar capacidades efectivas por franja. Si se decide diferirlo, dejar constancia explícita (ROADMAP/fase futura), no silencio.

**Resolution:** fixed (`ed114a78`). `getSlotOccupancy` joinea `activities.maxCapacity` y normaliza por el cupo efectivo del slot vía `resolveEffectiveCapacity` (mismo helper de WR-02). El heatmap por hora (`getPeakHoursHeatmap`) queda normalizado por cupo de sucursal con un comentario explícito que documenta el diferimiento (métrica agregada multi-slot, denominador fiel = suma de cupos efectivos por franja, fase futura).

### WR-04: Gaps de cobertura en el test de integración — el path feliz del PATCH y el techo del cupo quedan sin red

**File:** `el-templo-api/test/scheduling/155-horarios.test.ts:283-416`
**Issue:** Los 4 casos núcleo del CONTEXT están (solape misma actividad 409, distinta 201, back-to-back 201, PATCH colisión 409; cupo 1 → lista_espera; NULL hereda; ABM persiste/limpia). Faltan:

1. **PATCH de actividad SIN colisión → 200.** El check nuevo usa `excludeScheduleId`; si esa exclusión se rompiera (p.ej. se pierde el `ne()`), TODO cambio de actividad daría 409 porque el slot colisiona con su propia ventana — y ningún test lo detectaría. Es el falso-positivo simétrico del 409 que sí se testea.
2. **Validación de bordes del cupo en el API:** `maxCapacity: 0`, negativo y `> 500` deben dar 400 (el schema lo declara, nadie lo verifica; el cliente NO valida el techo de 500 — ver IN-03 — así que el server es la única defensa).
3. **Grilla semanal con dos clases simultáneas:** que `GET /schedules/weekly` devuelva ambos slots en la misma franja con `maxCapacity`/`isFull` per-slot (el contrato que consume D-02 en admin y member app).
   **Fix:** agregar los 3 casos al describe existente (todos son inject + assert, sin infraestructura nueva). El proyecto declara "well-tested code is non-negotiable; err on the side of too many tests".

**Resolution:** fixed (`398c2501`). Agregados: PATCH sin colisión → 200 (+ PATCH a la misma actividad → 200, guarda de `excludeScheduleId`); `maxCapacity` 0/negativo/501 → 400 (`it.each`); grilla semanal con dos clases simultáneas devuelve ambos slots en la misma franja con `maxCapacity`/`isFull` per-slot. Tests escritos, no ejecutados (CI).

## Info

### IN-01: Migración 0167 no es re-ejecutable (ALTER sin guard)

**File:** `el-templo-api/src/db/migrations/0167_activity_max_capacity.sql:13-14`
**Issue:** `ADD COLUMN` plano falla con "Duplicate column" si se re-aplica. Es "idempotente" solo en el sentido del runner (la tabla `_migrations` garantiza una sola aplicación), igual que 0158/0161 — consistente con la convención del repo (MySQL 8 no soporta `ADD COLUMN IF NOT EXISTS`). Comentarios sin `;` verificados.
**Fix:** ninguno requerido; dejar constancia de que la idempotencia es a nivel runner, no a nivel SQL.

### IN-02: El prefill de celda vacía no precarga `endTime`

**File:** `el-templo-admin/src/pages/HorariosPage.vue:928-935`
**Issue:** `openCreateDialog` setea `startTime` pero no `endTime`, aunque `CreateSlotDialog.initial` lo soporta. El admin tiene que tipear el fin a mano en cada alta desde la grilla (el caso dominante es 1 hora).
**Fix:** precargar `endTime` = start + 1h (`String(h+1).padStart(2,'0') + ':' + mm`); sigue editable (D-03: prefill, no lock).

### IN-03: El cliente no valida el techo de 500 del cupo

**File:** `el-templo-admin/src/components/scheduling/CreateSlotDialog.vue:227-231`, `el-templo-admin/src/components/scheduling/ActivitiesDialog.vue:157-161`
**Issue:** `validateCapacity` solo exige entero positivo; el server capa en 500 (schemas.ts:142,179). Un cupo de 1000 pasa el form y vuelve como 400 con el mensaje crudo de AJV ("body/maxCapacity must be <= 500") vía `extractError`.
**Fix:** agregar `n <= 500` al validador con mensaje en español, espejando el schema.

### IN-04: `seedDefaultSchedules` dedupea sin actividad — puede saltear seeds legítimos bajo D-01

**File:** `el-templo-api/src/modules/scheduling/service.ts:663-675,711-723`
**Issue:** el skip-si-existe compara solo `(branchId, dayOfWeek, startTime)`. Con simultaneidad permitida, si la sucursal ya tiene "Yoga" Lun 07:00, el seed NO crea el slot de Calistenia 07:00 (lo saltea creyéndolo duplicado). Es conservador (nunca crea un solape ilegal), pero el conteo `created` sub-reporta. Pre-existente, ahora semánticamente desactualizado.
**Fix:** incluir `activityId` en el filtro del skip cuando se toque este código.

### IN-05: `(Number(maxPos?.maxPos) ?? 0) + 1` — el `??` nunca aplica sobre NaN

**File:** `el-templo-api/src/modules/scheduling/booking-service.ts:300,625,1288`
**Issue:** si `maxPos` fuera `undefined`, `Number(undefined)` es `NaN` y `NaN ?? 0` es `NaN` (el nullish no atrapa NaN) → `waitlistPosition = NaN`. Hoy inalcanzable (query agregada sin GROUP BY siempre devuelve una fila con `COALESCE(...,0)`), pero el paréntesis está mal puesto. Pre-existente, adyacente a las líneas tocadas por la fase.
**Fix:** `Number(maxPos?.maxPos ?? 0) + 1`.

### IN-06: Lectura de capacidad fuera de la transacción de `reserve()`

**File:** `el-templo-api/src/modules/scheduling/booking-service.ts:277-281`
**Issue:** dentro del `db.transaction`, `countActiveBookings` recibe `tx` pero `getEffectiveCapacity` usa `this.db`. Sin consecuencia práctica (el cupo es configuración estable y la transacción tampoco lockea el conteo — el TOCTOU de sobre-reserva concurrente es pre-existente), pero es una inconsistencia de estilo dentro del mismo bloque transaccional.
**Fix:** aceptar un parámetro opcional `db?: MySql2Database<typeof schema>` como ya hace `countActiveBookings`, y pasarle `tx`.

---

_Reviewed: 2026-07-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
