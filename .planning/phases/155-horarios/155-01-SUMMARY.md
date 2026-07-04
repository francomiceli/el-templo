---
phase: 155-horarios
plan: 01
subsystem: api
tags: [scheduling, drizzle, mysql, capacity, overlap, fastify]

# Dependency graph
requires:
  - phase: 113-scheduling
    provides: "validacion de solape de slots [start,end) por sucursal+dia (fase 113 D-10/11/12)"
provides:
  - "Columna activities.max_capacity nullable + migracion 0167 (cupo por actividad, NULL = hereda sucursal)"
  - "Overlap re-scopeado por actividad en createSchedule (HOR-01): dos actividades distintas conviven en la misma sucursal/dia/hora"
  - "Gap de updateScheduleActivity cerrado: check de solape re-scopeado excluyendo el propio slot"
  - "Helper unico getEffectiveCapacity(branchId, activityId) = activity ?? branch ?? 22 en los 4 call sites de reservas"
  - "getWeeklyGrid + getSlotDetail resuelven cupo efectivo por slot"
affects: [155-02, 155-04, horarios, capacidad, reservas]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "findOverlappingSchedule: probe de solape [start,end) compartido y re-scopeado por actividad, con excludeScheduleId opcional"
    - "getEffectiveCapacity: cupo efectivo por slot via leftJoin activity sobre branch"

key-files:
  created:
    - el-templo-api/src/db/migrations/0167_activity_max_capacity.sql
  modified:
    - el-templo-api/src/db/schema/activities.ts
    - el-templo-api/src/modules/scheduling/service.ts
    - el-templo-api/src/modules/scheduling/booking-service.ts

key-decisions:
  - "Helper compartido findOverlappingSchedule reusado por createSchedule y updateScheduleActivity (DRY, cierra el hallazgo 5 de PATTERNS)"
  - "getEffectiveCapacity resuelve activity ?? branch ?? 22 en una sola query (leftJoin activity sobre branch); en service.ts el grid lo trae batch via el join existente"
  - "param dayOfWeek del helper tipado como number (ScheduleSlot.dayOfWeek es number, no DayOfWeek)"

patterns-established:
  - "Solape de horarios re-scopeado por actividad: la invariante 'no dos slots de la misma actividad solapados' se conserva; actividades distintas conviven"
  - "Cupo efectivo por slot (per-clase), sin techo agregado por sucursal"

requirements-completed: [HOR-01, HOR-03]

# Metrics
duration: 5min
completed: 2026-07-04
---

# Phase 155 Plan 01: Backend scheduling — clases simultaneas + cupo por actividad Summary

**Overlap de horarios re-scopeado por actividad (musculacion convive con actividades especiales) + columna activities.max_capacity nullable con cupo efectivo por slot resuelto en un helper unico.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-04T20:52:06Z
- **Completed:** 2026-07-04T20:57:16Z
- **Tasks:** 3
- **Files modified:** 4 (1 creado, 3 modificados)

## Accomplishments

- Columna `activities.max_capacity` nullable (D-05) + migracion 0167 hand-written, aplicada limpio local con `pnpm db:migrate` (1 statement).
- Overlap de `createSchedule` distingue actividad (D-01, HOR-01): dos slots de actividades DISTINTAS conviven en la misma sucursal/dia/hora; dos de la MISMA siguen siendo 409 con mensaje que nombra la actividad.
- Gap de `updateScheduleActivity` cerrado (hallazgo 5 de PATTERNS): antes del update corre el mismo check re-scopeado por la actividad destino, excluyendo el propio slot (`ne(...id, scheduleId)`).
- Helper unico `getEffectiveCapacity(branchId, activityId)` = `activity.maxCapacity ?? branch.maxCapacity ?? 22`, reemplazando `getBranchCapacity` en los 4 call sites de reservas (reserve, adminAddBooking, findNextAvailableDate, generacion de plan fijo).
- `getWeeklyGrid` (con `isFull`) y `getSlotDetail` computan el cupo efectivo por slot; el check sigue per-slot, sin techo agregado por sucursal (D-07).

## Task Commits

1. **Task 1: Columna activities.max_capacity nullable + migracion 0167** - `e4f6c841` (feat)
2. **Task 2: Overlap re-scopeado por actividad (createSchedule + updateScheduleActivity)** - `bf7aaf36` (feat)
3. **Task 3: Cupo efectivo — helper unico (booking-service) + grilla/detalle (service)** - `65ff2847` (feat)

## Files Created/Modified

- `el-templo-api/src/db/schema/activities.ts` - Columna `maxCapacity: int("max_capacity")` nullable tras `isActive`.
- `el-templo-api/src/db/migrations/0167_activity_max_capacity.sql` - `ALTER activities ADD COLUMN max_capacity int NULL AFTER is_active`, hand-written, sin `;` en comentarios.
- `el-templo-api/src/modules/scheduling/service.ts` - Import `ne`; helper `findOverlappingSchedule`; overlap re-scopeado en `createSchedule`; check nuevo en `updateScheduleActivity`; cupo efectivo por slot en `getWeeklyGrid` (`maxCapacity`/`isFull`) y `getSlotDetail`.
- `el-templo-api/src/modules/scheduling/booking-service.ts` - `getBranchCapacity` reemplazado por `getEffectiveCapacity(branchId, activityId)`; 4 call sites migrados; `sched` suma `activityId` al select de generacion de plan fijo.

## Decisions Made

- **Helper compartido de solape:** `findOverlappingSchedule` se extrajo para no duplicar la query entre `createSchedule` y `updateScheduleActivity` (DRY, alineado con la discrecion del plan).
- **Cupo efectivo en dos formas documentadas:** `booking-service.ts` resuelve puntual via `getEffectiveCapacity` (helper); `service.ts getWeeklyGrid` lo trae batch via el `innerJoin` a activities ya existente (`activityMaxCapacity ?? branch.maxCapacity`). No se comparte una funcion entre servicios porque una es puntual y la otra batch (aceptado en PATTERNS).
- **`dayOfWeek: number` en el helper:** `ScheduleSlot.dayOfWeek` es `number`, no `DayOfWeek`; el param del helper se tipo como `number` para aceptar tanto `createSchedule` (DayOfWeek) como `updateScheduleActivity` (number).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- tsc inicial fallo con `TS2322: Type 'number' is not assignable to type 'DayOfWeek'` al pasar `existing.dayOfWeek` (typo `number`) al helper tipado `DayOfWeek`. Resuelto tipando el param del helper como `number` (`DayOfWeek` es subtipo de `number`, ambos call sites compilan).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend listo para 155-02 (ABM de actividades con campo cupo + tests de integracion) y 155-04 (grilla admin con N clases por celda + member app verify-only): el schema, el overlap por actividad y el cupo efectivo por slot ya estan servidos por la API.
- Los tests de integracion de este comportamiento se crean en 155-02 (suite corre en CI, no localmente).
- Migracion 0167 lista para el tren (aplicada local; viaja a prod con el merge staging->master del milestone v5.4).

## Self-Check: PASSED

- Archivos creados/modificados presentes en disco (migracion 0167, schema activities, SUMMARY).
- Commits e4f6c841, bf7aaf36, 65ff2847 verificados en git log.

---

_Phase: 155-horarios_
_Completed: 2026-07-04_
