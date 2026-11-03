---
phase: 205-oficina
plan: 03
subsystem: api
tags: [office, cron, jobs, wellhub, staff-shifts, roster, tenancy]
requires: [205-02]
provides:
  - "modules/office/auto-topics.ts: syncWellhubErrors, syncStaleShifts, syncClassesWithoutCoach, runOfficeAutoTopicsForTenant"
  - "jobs/office-auto-topics.ts: runOfficeAutoTopics(db, now) + startOfficeAutoTopicsJob (cron */30)"
affects: [205-04, 205-05]
key-files:
  created:
    - el-templo-api/src/modules/office/auto-topics.ts
    - el-templo-api/src/jobs/office-auto-topics.ts
    - el-templo-api/test/jobs/office-auto-topics.test.ts
  modified:
    - el-templo-api/src/index.ts
    - el-templo-api/test/tenancy/con-04-crons-per-tenant.test.ts
key-decisions:
  - "Los tres detectores comparten un unico reconcile(): crear lo detectado (createSystemTopic ignora los que ya existian) y cerrar los abiertos del prefijo que ya no estan en el set vigente"
  - "Un fallo en un detector se loguea (Sentry) y no frena a los otros dos ni al despertar de dormidos"
requirements-completed: [D-04, D-09, D-11, D-12, D-13, D-14]
duration: ~50 min
completed: 2026-11-03
---

# Phase 205 Plan 03: Temas automáticos de Oficina Summary

Job cada 30 min (por gimnasio activo) que abre y cierra solo los temas del sistema para Wellhub con error, jornadas sin cerrar y clases de mañana sin profe, y despierta los dormidos vencidos.

## Commits

| Tarea | Commit | Qué |
| --- | --- | --- |
| 1 | `cff8d9b56` | `feat(205-03)` detectores en `modules/office/auto-topics.ts` |
| 2 | `ad7102227` | `feat(205-03)` job + registro en `index.ts` + gate CON-04 11 a 12 |
| 3 | `eb80e4d5d` | `test(205-03)` tests del job |

## Cómo quedó

- **Wellhub (D-11):** `wellhub_events.status='error'` de los últimos 7 días (`tenantWhere`). Se cierra con "Wellhub lo reprocesó bien" cuando el evento deja de estar en error.
- **Jornadas (D-12):** `staff_shifts` abiertos, join a `branches` y `users` (ambos con `tenantWhere`), `shiftDate < todayInTz(tz de la sede, now)`. Cierra con "Se cerró la jornada". Hora de entrada formateada en la tz de la sede.
- **Clase sin profe (D-13):** por sede activa, mañana en su tz; schedules activos de ese día con `deletedFrom` nulo o posterior, sin `schedule_exceptions` para esa fecha. Profe resuelto como `RatingsService.resolveRosterCoachId`: `coach_user_id` del horario gana; si no, change-point del roster (`RosterAttributionIndex` + `isoDayOfWeek`/`isoWeekStart`/`slotFromStartTime` de `ratings/roster-attribution.ts`). Una query de change-points por sede y día, resuelta en memoria. Domingo se saltea.
- **Runner:** `runOfficeAutoTopicsForTenant(db, service, ctx, now, log)` devuelve `{ opened, closed, woken }`. Cada paso va en su propio try/catch.
- `service.ts` y `routes.ts` NO se tocaron: no hizo falta nada que faltara.

## Desvíos del plan

1. **Firma del runner:** el plan decía `runOfficeAutoTopicsForTenant(db, ctx, now, log)` en la tarea 1 y `(db, service, ctx, now, log)` en la tarea 2. Se implementó la segunda (el job crea el `OfficeService` y se lo pasa).
2. **[Rule 1 - Bug previsto] Tema de "hoy" no debe cerrarse como "Se asignó profe":** si el detector mirara solo mañana, el tema abierto ayer para una clase de hoy dejaría de detectarse y se cerraría aunque siga sin profe. `syncClassesWithoutCoach` evalúa HOY y MAÑANA para decidir qué sigue vigente, pero solo ABRE temas para mañana. Cubierto por test.
3. **[Rule 1 - Bug previsto] Wellhub fuera de ventana:** un evento que envejece más de 7 días sin resolverse dejaría de aparecer en la detección y se cerraría con "Wellhub lo reprocesó bien", que sería falso. Si al cerrar el evento sigue en `error`, el motivo es "El error tiene más de 7 días: se cierra solo". Cubierto por test.
4. **"Pasó la fecha":** se compara contra la fecha de "hoy" más temprana entre las sedes activas (conservador: solo es pasada si lo es en todas). Si no hay sedes activas, tz por defecto del tenant.
5. **Tests sin fake timers:** el job recibe `now`; `NOW` es el reloj real corrido hasta que mañana no sea domingo. El caso de despertar usa el reloj real porque `wakeDueTopics` no recibe `now`.
6. **Prettier:** los hooks no corren acá; se corrió `npx prettier --write` a mano sobre los archivos nuevos.

## Verificación

- `npx tsc --noEmit` (API): verde.
- `pnpm lint:tenant`: `DISCREPANCIAS: 0`.
- Los tests NO se corrieron (no hay MySQL local). `tsc` no cubre `test/`, así que se tipó el archivo de test con un tsconfig temporal fuera del repo: sin errores en `office-auto-topics.test.ts` (los únicos errores que salieron son preexistentes, en `campaigns/templates.ts` y `test/helpers.ts`).
- Gate CON-04: `office-auto-topics.ts` agregado a `JOBS_ESPERADOS` (orden alfabético, entre `notification-rules.ts` y `reassign-multibranch.ts`), título y docblock en 12. Nota: el gate descarta las líneas que empiezan con `*`, `//` o `/*`; el job tiene `forEachActiveTenant` en código, no solo en el docblock.

## Bugs encontrados

Ninguno en código preexistente. Observación sin tocar: `RatingsService.resolveRosterCoachId` lee `class_coach_assignments` sin `tenantWhere` (anclado por `branch_id`); el detector nuevo sí lo lleva.

## Dudas para Franco (opción conservadora tomada)

1. **Primera corrida en prod:** `staff_shifts` abiertas no tiene ventana (igual que `staleOpen` del dashboard, que no limita el rango). Si hay jornadas viejas que nunca se cerraron, el primer tick abre un tema por cada una. Se dejó así por coherencia con el dashboard. Si molesta, se limita a los últimos N días o se las cierra a mano antes de desplegar.
2. **Título "mañana" el día de la clase:** un tema abierto ayer para una clase de hoy sigue diciendo "Clase sin profe mañana: ..." (el título es texto congelado). Aceptable en v1; el vínculo al horario y el body dan el contexto.
3. **Eventos Wellhub sin tenant derivado** quedan con `tenant_id = 1` por diseño (ver comentario en `schema/wellhub.ts`), así que aparecen en los temas de El Templo aunque fueran de otro gimnasio. No es nuevo; se documenta por si algún día se suma un 2.º gimnasio con Wellhub.
4. **STATE.md / ROADMAP.md:** no se tocaron (los actualiza el orquestador, según las reglas de ejecución de la fase).

## Known Stubs

Ninguno.

## Self-Check: PASSED

Archivos creados presentes y commits `cff8d9b56`, `ad7102227`, `eb80e4d5d` en el log.
