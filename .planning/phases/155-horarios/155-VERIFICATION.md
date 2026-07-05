---
phase: 155-horarios
verified: 2026-07-05T00:00:00Z
status: human_needed
score: 3/3 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Admin -> Horarios: crear dos clases de actividades DISTINTAS a la misma hora/sucursal (ej. Musculacion 10-11 y Funcional 10-11)"
    expected: "Ambas aparecen apiladas en la misma celda; ninguna desaparece."
    why_human: "Render visual de la grilla (layout apilado, chips) no verificable por grep; requiere confirmar en navegador."
  - test: "Intentar crear una segunda clase de la MISMA actividad solapada"
    expected: "Se rechaza con mensaje que nombra la actividad (409 visible en el form)."
    why_human: "Confirmar que el mensaje de error se muestra correctamente en la UI, no solo que el backend lo produce."
  - test: "Click en una celda VACIA"
    expected: "Se abre 'Crear horario' con sucursal/dia/hora ya precargados y editables; permite crear una actividad inline con Cupo (ej. 8)."
    why_human: "Flujo interactivo del dialog (affordance, prefill visible, mini-form inline) requiere interaccion real."
  - test: "Click en una de las clases apiladas"
    expected: "Abre el detalle/borrado de ESA clase especifica, no de la otra simultanea."
    why_human: "Desambiguacion visual de click sobre elementos apilados; el codigo pasa el slot concreto pero la confirmacion de que el usuario ve/toca el chip correcto es visual."
  - test: "Tab Actividades: editar una actividad y setear/limpiar el campo Cupo"
    expected: "Vacio = hereda la sucursal; el valor persiste al reabrir."
    why_human: "UX del formulario (hint visible, comportamiento al guardar) requiere inspeccion visual."
  - test: "Member app -> Reservas: dia con dos clases a la misma hora"
    expected: "Se ven las dos cards; el cupo mostrado refleja el cupo de la actividad (menor al de la sucursal si se configuro)."
    why_human: "Verify-only sobre app cliente (Capacitor/web); requiere confirmar render real, no solo el codigo fuente sin cambios."
  - test: "Vista MOBILE del admin (ancho de telefono / device toolbar) con dos clases simultaneas en el listado por dia"
    expected: "Tocar cada una abre el detalle de ESA clase; el modo 'Eliminar horario' desde mobile selecciona el slot correcto."
    why_human: "Comportamiento responsive y de touch no verificable estáticamente; requiere probar en viewport móvil real."
---

# Phase 155: Horarios Verification Report

**Phase Goal:** El sistema de horarios soporta clases simultáneas en la misma sucursal, crear una clase/actividad directamente desde el slot y capacidad por actividad. End state: musculación convive con otras actividades a la misma hora; el "test de profe" se generaliza a "crear clase/actividad" desde el slot; cada actividad define su propio cupo en vez de heredar solo el de la sucursal.
**Verified:** 2026-07-05
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                   | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | El sistema permite dos clases simultáneas en la misma sucursal (HOR-01)                 | ✓ VERIFIED | `findOverlappingSchedule` (service.ts:776-807) filtra por `branchId+dayOfWeek+activityId+isActive`; se aplica en `createSchedule` (:98-110), `updateScheduleActivity` (:564-577, gap cerrado) y `toggleSchedule` (:485-498, WR-01 fix). Admin `HorariosPage.vue`: `slotMap` es `Map<string, WeeklySlotView[]>` (línea 577), renderiza N chips apilados por celda (:312-318). Tests: `155-horarios.test.ts` cubre solape misma-actividad (409), distinta-actividad (201), back-to-back (201), reactivación colisión (409) y sin colisión (200).                                                                                                                                                      |
| 2   | Se puede crear una clase/actividad directamente desde el slot (HOR-02)                  | ✓ VERIFIED | `HorariosPage.vue` `onEmptyCellClick`→`openCreateDialog` (:919-935) abre `CreateSlotDialog` con `:initial` (branchId/día/hora precargados y editables). `CreateSlotDialog.vue` tiene sentinel "＋ Crear nueva actividad" (`CREATE_NEW_ACTIVITY = -1`, línea 182) que despliega mini-form (nombre+descripción+cupo) y llama `createActivity` real (:279-291), dejando `form.activityId` seteado. El flujo Templo de test de profe no fue tocado (no aparece en el diff de archivos de la fase).                                                                                                                                                                                                      |
| 3   | Cada actividad define su capacidad, en lugar de heredar solo la de la sucursal (HOR-03) | ✓ VERIFIED | Columna `activities.max_capacity` nullable (schema + migración 0167 aplicada, sin backfill). Helper único `scheduling/capacity.ts` (`getEffectiveCapacity`/`resolveEffectiveCapacity` = `activity ?? branch ?? 22`) consumido por `booking-service.ts` (4 call sites), `service.ts getWeeklyGrid`/`getSlotDetail`, y `analytics/service.ts getSlotOccupancy` (WR-02/WR-03 fixes). ABM completo: API (`activity-service.ts`, `schemas.ts` con validación 1-500, `routes.ts`) + admin (`ActivitiesDialog.vue` campo Cupo con hint de herencia, `CreateSlotDialog.vue` cupo en el alta inline). Tests cubren cupo<sucursal→lista_espera, NULL hereda, ABM persist/limpia, y bordes 0/negativo/501→400. |

**Score:** 3/3 truths verified programmatically. All 3 are also gated by the phase's `checkpoint:human-verify` (155-04 Task 2), which was auto-approved in autonomous mode — visual confirmation is still pending (see Human Verification Required).

### Required Artifacts

| Artifact                                                                                          | Expected                                            | Status     | Details                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/db/schema/activities.ts`                                                       | Columna `maxCapacity` int nullable                  | ✓ VERIFIED | Línea 20: `maxCapacity: int("max_capacity")`, sin `.notNull()`/`.default()`.                                                                                                                                                                                                                         |
| `el-templo-api/src/db/migrations/0167_activity_max_capacity.sql`                                  | `ALTER activities ADD max_capacity NULL`            | ✓ VERIFIED | Presente, sin `;` en comentarios, aplicada localmente (commit `e4f6c841`).                                                                                                                                                                                                                           |
| `el-templo-api/src/modules/scheduling/service.ts`                                                 | Overlap re-scopeado + cupo efectivo en grid/detail  | ✓ VERIFIED | `findOverlappingSchedule` compartido por createSchedule/updateScheduleActivity/toggleSchedule; `getWeeklyGrid`/`getSlotDetail` usan `capacity.ts`.                                                                                                                                                   |
| `el-templo-api/src/modules/scheduling/booking-service.ts`                                         | `getEffectiveCapacity` en los 4 call sites          | ✓ VERIFIED | `getBranchCapacity` eliminado; 4 call sites (líneas 279, 604, 1095, 1267) usan el helper delegando a `capacity.ts`.                                                                                                                                                                                  |
| `el-templo-api/src/modules/scheduling/capacity.ts` (no en el PLAN original, surgido de WR-02)     | Helper único compartido                             | ✓ VERIFIED | Módulo nuevo con `getEffectiveCapacity`/`resolveEffectiveCapacity`; consumido por booking-service, service.ts y analytics/service.ts.                                                                                                                                                                |
| `el-templo-api/src/modules/scheduling/activity-service.ts`, `schemas.ts`, `types.ts`, `routes.ts` | ABM de cupo con validación                          | ✓ VERIFIED | `maxCapacity` presente end-to-end; validación `integer\|null, 1-500`.                                                                                                                                                                                                                                |
| `el-templo-api/test/scheduling/155-horarios.test.ts`                                              | Cobertura de overlap, cupo, ABM                     | ✓ VERIFIED | 18 casos en 5 describes (simultaneidad+reactivación, validación cupo, grilla, cupo efectivo, ABM). Incluye los 3 casos que WR-04 señaló como faltantes (PATCH sin colisión, bordes 0/neg/501, grilla con 2 clases). No ejecutado localmente (corre en CI), consistente con la política del proyecto. |
| `el-templo-admin/src/types/scheduling.ts`, `useSchedulingApi.ts`                                  | `maxCapacity` espejado del API                      | ✓ VERIFIED | Presente en ambos.                                                                                                                                                                                                                                                                                   |
| `el-templo-admin/src/components/scheduling/ActivitiesDialog.vue`                                  | Campo Cupo con hint de herencia                     | ✓ VERIFIED | q-input "Cupo" (línea 86-93) con hint "vacío = hereda el cupo de la sucursal"; carga/guarda con normalización.                                                                                                                                                                                       |
| `el-templo-admin/src/components/scheduling/CreateSlotDialog.vue`                                  | Prop `initial` + actividad inline + cupo            | ✓ VERIFIED | Prop `initial` (línea 145) consumido en resetForm; sentinel de actividad inline con cupo.                                                                                                                                                                                                            |
| `el-templo-admin/src/pages/HorariosPage.vue`                                                      | N slots por celda, click por slot, click-para-crear | ✓ VERIFIED | `slotMap: Map<string, WeeklySlotView[]>`, `onSlotClick`/`onMobileSlotClick` slot-aware, `onEmptyCellClick`→`openCreateDialog` con `initial`.                                                                                                                                                         |

### Key Link Verification

| From                                                              | To                                               | Via                                        | Status  | Details                                                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------- |
| `service.ts createSchedule/updateScheduleActivity/toggleSchedule` | `schema.schedules.activityId`                    | filtro extra en overlap probe              | ✓ WIRED | `findOverlappingSchedule` usado en las 3 rutas (incl. toggleSchedule, agregado post-review WR-01). |
| `booking-service.ts` 4 call sites                                 | `activities.maxCapacity`/`branches.maxCapacity`  | `capacity.ts` helper                       | ✓ WIRED | Sin `getBranchCapacity` remanente (`grep` = 0 matches).                                            |
| `routes.ts POST/PUT /activities`                                  | `activityService.createActivity/updateActivity`  | `request.body.maxCapacity`                 | ✓ WIRED | Confirmado en routes.ts líneas 125-160.                                                            |
| `schemas.ts activityRecordSchema`                                 | response del cliente                             | fast-json-stringify declara `maxCapacity`  | ✓ WIRED | Línea 31, 60, 142, 179, 275.                                                                       |
| `CreateSlotDialog actividad inline`                               | `useSchedulingApi.createActivity`                | opción sentinel en el q-select             | ✓ WIRED | `onCreateActivity` llama `schedulingApi.createActivity` con `maxCapacity` normalizado.             |
| `ActivitiesDialog form`                                           | `useSchedulingApi.updateActivity/createActivity` | campo `maxCapacity`                        | ✓ WIRED | `onSaveActivity` pasa `maxCapacity` normalizado.                                                   |
| `HorariosPage celda vacía onEmptyCellClick`                       | `CreateSlotDialog prop initial`                  | prefill `{branchId, dayOfWeek, startTime}` | ✓ WIRED | `openCreateDialog` setea `createSlotInitial`, pasado como `:initial` al dialog (línea 370).        |
| `HorariosPage render de celda`                                    | `slotMap` por franja                             | iteración sobre `WeeklySlotView[]`         | ✓ WIRED | `v-for="slot in getCellSlots(...)"` (línea 314) con `@click.stop="onSlotClick(slot, ...)"`.        |
| `analytics/service.ts getSlotOccupancy`                           | `resolveEffectiveCapacity`                       | join a `activities.maxCapacity`            | ✓ WIRED | WR-03 fix confirmado: línea 16 import, línea 982 uso.                                              |

### Data-Flow Trace (Level 4)

| Artifact                                          | Data Variable                                              | Source                                                                                   | Produces Real Data                                                  | Status    |
| ------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------- |
| `HorariosPage.vue` `gridSlots`/`slotMap`          | `WeeklySlotView[]`                                         | `GET /schedules/weekly` (getWeeklyGrid, real DB query con `activities.maxCapacity` join) | Sí                                                                  | ✓ FLOWING |
| `ReservasPage.vue` `selectedDaySlots`             | `slot.maxCapacity`/`slot.bookedCount`                      | Misma API de scheduling, ahora sirviendo cupo efectivo                                   | Sí (verify-only, sin cambio de código, cupo corregido aguas arriba) | ✓ FLOWING |
| `ActivitiesDialog.vue` `activityForm.maxCapacity` | GET actividades → `createActivity`/`updateActivity` reales | Sí (no hay stub, `onSaveActivity` llama al composable real)                              | ✓ FLOWING                                                           |

### Behavioral Spot-Checks

Skip — no hay servidor corriendo en este entorno de verificación; los checks se hicieron vía gates estáticos (tsc, lint) y grep de wiring end-to-end (Step 7b constraint: no iniciar servicios).

### Probe Execution

No aplica — la fase no declara probes (`scripts/*/tests/probe-*.sh`); no es una fase de migración/tooling con ese patrón.

### Requirements Coverage

| Requirement | Source Plan            | Description                                      | Status      | Evidence                                                                                                                                       |
| ----------- | ---------------------- | ------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| HOR-01      | 155-01, 155-02, 155-04 | Dos clases simultáneas en la misma sucursal      | ✓ SATISFIED | Overlap re-scopeado por actividad (backend) + grilla N-slots (admin), con tests de integración. Marcado `[x]` y "Complete" en REQUIREMENTS.md. |
| HOR-02      | 155-03, 155-04         | Crear clase/actividad directamente desde el slot | ✓ SATISFIED | Prefill de CreateSlotDialog + creación de actividad inline, disparado desde celda vacía de la grilla. Marcado `[x]`/"Complete".                |
| HOR-03      | 155-01, 155-02, 155-03 | Cada actividad define su capacidad               | ✓ SATISFIED | Columna nullable + helper único + ABM + validación server-side + analytics corregido (WR-03). Marcado `[x]`/"Complete".                        |

No hay requisitos huérfanos: los 3 IDs de REQUIREMENTS.md para esta fase (líneas 127-129) están cubiertos por los 4 planes ejecutados.

### Anti-Patterns Found

Ninguno. Grep de `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER|console\.(log|warn|error)|: any\b` sobre los 14 archivos tocados por la fase (según 155-REVIEW.md `files_reviewed_list`) no arrojó matches. `tsc --noEmit` (API) y `pnpm lint` (admin) verdes; los 9 warnings de lint preexisten en archivos NO tocados por esta fase (BandejaPendientesTab, CobrosPage, session-pdf-builder, env.d.ts).

### Post-Review Fixes (155-REVIEW.md)

El code review post-ejecución encontró 0 blockers y 4 warnings, los 4 resueltos y verificados en el código actual:

- **WR-01** (`418e0fe9`): `toggleSchedule` ahora re-corre el check de solape al reactivar — confirmado en service.ts:484-498.
- **WR-02** (`7cb569ed`): helper único `scheduling/capacity.ts` extraído y consumido por los 3 puntos que antes triplicaban la lógica — confirmado.
- **WR-03** (`ed114a78`): `analytics/service.ts getSlotOccupancy` normaliza por cupo efectivo (`resolveEffectiveCapacity`) — confirmado; heatmap por hora queda diferido con comentario explícito (decisión documentada, no gap silencioso).
- **WR-04** (`398c2501`): 3 casos de test agregados (PATCH sin colisión, bordes de validación del cupo, grilla semanal con 2 clases) — confirmados en `155-horarios.test.ts`.

Los 6 ítems `info` del review (IN-01..IN-06) son de severidad informativa, ninguno bloquea el goal de la fase (p.ej. IN-02 prefill de `endTime` faltante es una mejora de UX menor, no un must-have de HOR-02).

### Human Verification Required

El plan 155-04 incluía un `checkpoint:human-verify` (gate="blocking") que fue **auto-aprobado** por ejecutarse en modo autónomo. Sus 7 ítems de verificación visual siguen pendientes de confirmación humana real y se listan en el frontmatter (`human_verification`). Resumen:

1. Dos clases DISTINTAS a la misma hora aparecen apiladas en la grilla (ninguna desaparece).
2. Solape de la MISMA actividad se rechaza visualmente con mensaje que nombra la actividad.
3. Click en celda vacía abre "Crear horario" prefilleado y editable; crear actividad inline con cupo funciona en el flujo real.
4. Click en una clase apilada abre el detalle de ESA clase específica.
5. Tab Actividades: editar/limpiar el campo Cupo funciona visualmente (hint, persistencia).
6. Member app → Reservas: dos clases a la misma hora se ven como dos cards con cupo correcto.
7. Vista mobile del admin: tocar cada clase simultánea abre la correcta; el modo "Eliminar horario" selecciona el slot correcto.

### Gaps Summary

No hay gaps de código. Los 3 truths del roadmap (HOR-01/02/03) están verificados a nivel de código: schema, API, validación server-side, wiring del admin y tests de integración que cubren los invariantes centrales (incluidos los 4 warnings que el review encontró y ya están resueltos con commits verificables). El único ítem pendiente es la confirmación visual humana del checkpoint que el modo autónomo auto-aprobó — no es un gap de implementación sino de verificación manual diferida, tal como lo señala la nota de la fase.

---

_Verified: 2026-07-05_
_Verifier: Claude (gsd-verifier)_
