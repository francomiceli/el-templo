---
phase: 174-adopci-n-3a-subscriptions-scheduling-adopci-n-de-c-digo
plan: 04
subsystem: scheduling
tags: [tenancy, multitenancy, scheduling, trials, holidays, activities]
dependency-graph:
  requires:
    [
      "174-01 (bulkMigratePlan marker :4756)",
      "174-03 (booking-service.ts, schedule-exceptions.ts template)",
      "173-07 (trials-service.ts ctx threading inicial)",
    ]
  provides:
    [
      "scheduling/service.ts, trials-service.ts, activity-service.ts, holiday-service.ts, schedule-exceptions.ts, routes.ts 100% ctx-threaded",
    ]
  affects:
    [
      "scheduling/booking-service.ts (validateTrialBookingDate, assertDateWithinWindow — fuera de files_modified, forzado por dependencia)",
    ]
tech-stack:
  added: []
  patterns:
    [
      "Pattern A (tenantWhere primer término)",
      "Pattern B (tenantValues en insert)",
      "ctx PRIMERO + db AL FINAL en helpers standalone (getScheduleException, mismo orden que assertBranchDelGimnasio)",
    ]
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/scheduling/service.ts
    - el-templo-api/src/modules/scheduling/trials-service.ts
    - el-templo-api/src/modules/scheduling/activity-service.ts
    - el-templo-api/src/modules/scheduling/holiday-service.ts
    - el-templo-api/src/modules/scheduling/schedule-exceptions.ts
    - el-templo-api/src/modules/scheduling/routes.ts
    - el-templo-api/src/modules/scheduling/booking-service.ts
decisions:
  - "getScheduleException(ctx, scheduleId, date, db): ctx PRIMERO y db AL FINAL, mismo orden que assertBranchDelGimnasio (shared/branch-consistency.ts) — no db PRIMERO como estaba."
  - "Deletes sobre tablas gym-owned (scheduleExceptions, bookings, schedules, holidays) se envolvieron con tenantWhere aunque el id ya viniera de un read tenant-scoped — defensa en profundidad, precedente subscriptions/service.ts:2127."
  - "Updates anclados por un id ya resuelto vía read ctx-filtrado en el mismo método (p. ej. toggleSchedule/updateScheduleActivity/deleteSchedule sobre schedules.id, trials-service.ts sobre bookings.id) se dejaron SIN tenantWhere adicional — mismo criterio que el resto del módulo ya migrado (trials-service.ts nunca re-agrega tenantWhere en updates de bookings.id ya resuelto)."
  - "booking-service.ts (fuera de files_modified): validateTrialBookingDate gana ctx PRIMERO y assertDateWithinWindow deja de aceptar ctx opcional — cierra el fallback isNotNull provisional que el propio comment de 174-03 documentaba como 'hasta la migración de trials-service.ts', que es esta fase."
metrics:
  duration: "~2h"
  completed: 2026-08-09
---

# Phase 174 Plan 04: Adopción de tenancy en scheduling (resto del módulo) Summary

Cierre de la deuda cruda de `scheduling`: `service.ts` (grilla/CRUD), `activity-service.ts` y `holiday-service.ts` (100% crudos antes de este plan), `schedule-exceptions.ts`, y remate de `trials-service.ts` (deuda explícitamente diferida por 173-07 a esta fase) + wiring completo en `routes.ts`.

## Qué se migró por archivo

**`schedule-exceptions.ts`** — `getScheduleException` gana `ctx: TenantContext` PRIMERO y `db` AL FINAL (mismo orden que `assertBranchDelGimnasio`), filtra `schedule_exceptions` con `tenantWhere`. Firma nueva rompe 6 call sites (4 en `service.ts`, 2 en `booking-service.ts`) — todos actualizados.

**`service.ts`** — `ctx` threaded en los 10 métodos públicos (`createSchedule`, `getWeeklyGrid`, `getSlotDetail` ya lo tenía de 173-07, `cancelScheduleDate`, `restoreScheduleDate`, `toggleSchedule`, `getDeactivatedAt`, `updateScheduleActivity`, `deleteSchedule`, `seedDefaultSchedules`) y en los 2 helpers privados (`findOverlappingSchedule`, `getScheduleSlot`). Pattern A a los 14 reads crudos (`branches`, `activities`, `schedules`, `scheduleExceptions`, `bookings`, `attendance`), Pattern B a los 6 inserts (`schedules` x3, `scheduleExceptions`, `activities` x2). `getWeeklyGrid` propaga `ctx` a `holidayService.getHolidaysForWeek`. Deletes de `scheduleExceptions`/`bookings`/`schedules` también scopeados.

**`trials-service.ts`** — Cierra la deuda que 173-07 dejó explícitamente diferida a esta fase (comentarios "`bookings` y `subscriptions` no se tocan (D-02, fase 174)" en 3 métodos). 21 reads / 21 `tenantWhere` (antes 21/11), 5 inserts / 5 `tenantValues` (antes 5/3). El único read que sigue sin `tenantWhere` directo en `bookings` (`listTrials`) está anclado por el join a `users` con `tenantWhere` — mismo patrón ya migrado que `booking-service.ts:getMyBookings`.

**`activity-service.ts`** (0% ctx antes) — `ctx` threaded en las 4 methods (`createActivity`, `listActivities`, `updateActivity`, `getActivity`). Pattern A a los 5 reads (colisión de nombre x2, cascade-block de schedules/branches afectados, `getActivity`), Pattern B al insert.

**`holiday-service.ts`** (0% ctx antes) — `ctx` threaded en las 4 methods (`addHoliday`, `removeHoliday`, `listHolidays`, `getHolidaysForWeek`). D-02: `tenantWhere(holidays, ctx)` como PRIMER término junto al filtro de country/fecha ya existente en `listHolidays` y `getHolidaysForWeek`. Pattern B al insert de `holidays`; lecturas de `branches`/`schedules` en `addHoliday` (auto-cancel de reservas por feriado) también scopeadas.

**`routes.ts`** — `assertTenant(request.scope, "scheduling.<handler>")` en cada handler cuyo service ganó `ctx`: activities (create/list/update), schedules (create/weekly/toggle/cancel-date/restore-date/delete-from-date/activity/seed), holidays (add/remove/list), member `/weekly`. `GET /activities` pasó a recibir `request` (antes `async () => {}`, sin acceso a `request.scope`). `GET /branches` (member): cerró la deuda que el propio comentario de 173-07 dejaba explícita ("branches no se toca (D-02, fase 174)") — `tenantWhere(branches, ctx)` en el join a `users` y en el filtro final de sedes activas.

## Deviación fuera de `files_modified`: `booking-service.ts`

**Rule 3 (auto-fix de blocking issue):** el cambio de firma de `getScheduleException` (Task 1/2) rompe 2 call sites en `booking-service.ts` (`adminAddBooking`, `assertDateWithinWindow`). Se actualizaron ambos. Adicionalmente, `assertDateWithinWindow` recibía `ctx?: TenantContext` OPCIONAL con fallback `isNotNull` — el propio comentario de 174-03 documentaba ese fallback como provisional "hasta la migración de trials-service.ts (fuera de 174-03)". Esa migración es exactamente este plan: `validateTrialBookingDate` (única llamadora sin ctx) ganó `ctx: TenantContext` PRIMERO, threading desde `trials-service.ts:reserveTrialSelfService` (que ya trae ctx real desde 173-07). Con las dos llamadas a `assertDateWithinWindow` trayendo ctx real, se cerró el fallback `isNotNull` provisional en las lecturas de `branches`/`holidays` de ese método — cumple la regla dura #7 del prompt ("no introduzcas guards provisionales nuevos si el método tiene actor con ctx real disponible").

Este archivo no está en `files_modified` del plan 174-04, pero el cambio era mecánicamente inevitable (compile-blocking) y cierra deuda explícitamente atribuida a esta fase por su propio código.

## Commits

| Task   | Commit     | Archivos                                                              |
| ------ | ---------- | --------------------------------------------------------------------- |
| Task 1 | `bcc93358` | `service.ts`, `trials-service.ts`, `booking-service.ts` (deviation)   |
| Task 2 | `4a3c8ae6` | `activity-service.ts`, `holiday-service.ts`, `schedule-exceptions.ts` |
| Task 3 | `369a5a26` | `routes.ts`                                                           |

Nota: `schedule-exceptions.ts` es prerequisito técnico de Task 1 (`service.ts`/`trials-service.ts` importan `getScheduleException`) pero por un descuido de staging quedó commiteado en el commit de Task 2 en vez del de Task 1 — el código funcional viajó correcto desde el principio (import resuelto), solo el agrupamiento del commit no calzó exacto con el plan.

## Verificación

```
cd el-templo-api && pnpm exec tsc --noEmit
# EXIT 0, limpio.

cd el-templo-api && pnpm exec vitest run --no-file-parallelism test/scheduling
# Test Files  11 passed (11)
#      Tests  170 passed (170)
#   Duration  203.67s
```

Suite verde sin ajustar ninguna expectativa (criterio #4). Ningún bug de negocio real encontrado — la migración fue puramente mecánica (Pattern A/B + threading de ctx), sin tocar lógica.

## Deuda residual

- `capacity.ts` (`getEffectiveCapacity`) sigue leyendo `branches`/`activities` sin `tenantWhere` — explícitamente fuera de `files_modified` de este plan (no listado en PATTERNS ni en la tabla "Explicitly OUT of scope", simplemente no fue asignado a ningún plan de la fase 174). Queda para una fase futura si se decide cerrarlo.
- Los updates anclados por un id ya resuelto vía read ctx-filtrado (ver decisión arriba) no llevan `tenantWhere` adicional — es el criterio que el propio módulo ya usaba antes de esta fase (p. ej. `trials-service.ts` nunca re-agrega `tenantWhere` en updates de `bookings.id` ya resuelto), no una regresión introducida acá.

## Threat Flags

Ninguno — el plan no introdujo superficie nueva (rutas/campos/JOIN) más allá de lo que el `threat_model` del propio 174-04-PLAN.md ya cubre (T-174-04-I/T/E, todos mitigados por Pattern A/B + `assertTenant` en `routes.ts`).

## Self-Check: PASSED

- `el-templo-api/src/modules/scheduling/service.ts` — FOUND
- `el-templo-api/src/modules/scheduling/trials-service.ts` — FOUND
- `el-templo-api/src/modules/scheduling/activity-service.ts` — FOUND
- `el-templo-api/src/modules/scheduling/holiday-service.ts` — FOUND
- `el-templo-api/src/modules/scheduling/schedule-exceptions.ts` — FOUND
- `el-templo-api/src/modules/scheduling/routes.ts` — FOUND
- `el-templo-api/src/modules/scheduling/booking-service.ts` — FOUND
- Commit `bcc93358` — FOUND en `git log --oneline`
- Commit `4a3c8ae6` — FOUND en `git log --oneline`
- Commit `369a5a26` — FOUND en `git log --oneline`
- `tsc --noEmit` — 0 errores
- `vitest run test/scheduling` — 170/170 tests, 11/11 archivos
