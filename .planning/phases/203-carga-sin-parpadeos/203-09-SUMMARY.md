---
phase: 203-carga-sin-parpadeos
plan: 09
subsystem: app-training-weekly
status: complete
completed: 2026-10-28
requirements: [SC-3, D-05, D-09, D-17]
commits: [033e80c36, 02effb212]
key-files:
  created:
    - el-templo-app/src/modules/training/composables/__tests__/useWeekData.test.ts
  modified:
    - el-templo-app/src/modules/training/composables/useWeekData.ts
    - el-templo-api/test/sessions/sessions-gating.test.ts
---

# Phase 203 Plan 09: /sessions/weekly sin `view` (SUMMARY)

La app deja de mandar `view` a `/sessions/weekly`: el server resuelve la vista por defecto (`resolveSessionView`). El pedido de la semana depende solo de `weekStart` y, si hay, `level`; ya no espera suscripción, programa ni inscripciones. `useWeekData` expone `loaded`.

## Qué quedó

- `useWeekData.ts`: se eliminó el bloque que armaba `params.view` con `currentProgram.enrollmentId`, `hasPresencialPlan` y `allActiveEnrollments` (reemplazado por un comentario D-09). `params` = `{ weekStart, level? }`. Nuevo `loaded` (ref, en la interface y en el return): se pone en `true` en el `finally`, o sea tras éxito o error (fail-open), y nunca vuelve a `false`. `WeeklyResponse.view` se mantiene (el server lo sigue devolviendo). `useUserStore` queda solo para `selectedLevel`.
- Retrocompatibilidad: no se tocó `el-templo-api/src`. La app vieja de las tiendas sigue mandando `view` y el server la sigue aceptando igual.
- Tests de API: 3 casos nuevos en el bloque R8 de `sessions-gating.test.ts`, todos sin `view` en la URL: case 8 (online con inscripción activa sin puntero, `program`), case 9 (paquete, `templo`), case 10 (presencial con puntero a inscripción cancelada, `templo`, 200). Se verificó leyendo `session-view.ts:108-260` y `routes.ts:/weekly` que las expectativas coinciden con el comportamiento real (el puntero vencido cae a `templo` en el default); no hubo que ajustarlas. El case 8 agrega una suscripción `online_regular` activa para que sea el escenario "socio solo online" real (el resultado no depende de ella).

## Base para la comparación del verify

- SHA base del plan (`HEAD` al empezar): `5730c3e4cd84ad3008f1d1fbf641e5b9b0260595`.
- Primer commit del plan `B` = `033e80c3681727d1ae0c5a083b630b2a27625cdd`; `B^` = `5730c3e4c`. `git diff --quiet "$B^" -- el-templo-api/src` sale 0.

## Commits

- `033e80c36` fix(203-09): /sessions/weekly sin view, el server decide (D-09)
- `02effb212` test(203-09): fijar el default de vista de /sessions/weekly sin view

## Tests escritos, pendientes de correr (D-17)

- `el-templo-app/src/modules/training/composables/__tests__/useWeekData.test.ts` (6 casos): params sin `view` (con store vacío y con store con programa/presencial/inscripciones), `level` presente/ausente, `loaded` false -> true tras OK, true tras error (con `error` = mensaje), y no vuelve a false en un segundo fetch en vuelo. Mocks: logger, `src/boot/axios`, `src/stores/useUserStore` (objeto `vi.hoisted`). Solo lee de `useWeekData` lo que su `return` expone (`sessions`, `completedDates`, `loading`, `error`, `loaded`, `fetchWeekSessions`).
- `el-templo-api/test/sessions/sessions-gating.test.ts` R8 casos 8-10: corren en CI contra MySQL.
- Prettier y eslint pasaron sobre los archivos tocados de la app; prettier sobre el test de la API. `vue-tsc`/`tsc` no corridos.

## Deviations from Plan

Ninguna. Plan ejecutado como estaba escrito. (Nota de contexto: el plan 02 se canceló y no hay 203-02-SUMMARY; no afectó a este plan.)

## Riesgos antes del plan 10

- **`loaded` todavía no lo usa nadie.** Mi Templo y Entrenar lo van a consumir en los planes siguientes. Ojo: `loaded` es por instancia del composable (cada `useWeekData()` tiene el suyo) y arranca en `false` en cada montaje de página; en la card de hoy, "ya llegó la rutina" vale por visita, no entre visitas (para eso está el flag "tuvo contenido" del plan 07, que debe grabarse solo tras 2xx: `loaded` es `true` también tras error, así que NO sirve como señal de contenido).
- **Cambio de comportamiento sutil con el store desactualizado:** antes, un store con `currentProgram.enrollmentId` viejo mandaba `view=program` y el server respondía 403 si la inscripción ya no estaba activa; ahora el server cae a `templo`/primera inscripción. Es lo buscado (D-09), pero cambia qué ve un socio con puntero vencido (ve la rutina del Templo en vez de un error). Queda fijado por R8 case 10.
- **Consumidores no tocados:** `DayPlayer.vue`, `SessionSummaryPage.vue`, `useTrainingWeek.ts` y `MiTemplo.vue` llaman `fetchWeekSessions` igual que antes; ahora cualquiera puede pedirla apenas hay perfil. Si algún plan posterior espera a que haya `userStore.selectedLevel` antes de pedirla, el `level` solo viaja si ya está cargado; sin él el server usa `users.level` (mismo valor salvo override en memoria).
- **Test del composable depende de `extractError` real** (importa `axios`): para un `Error` común devuelve `err.message`; si cambia esa función, el caso del error se rompe.
- Sin `node_modules` propios: nada compilado ni corrido en la app.

## Known Stubs

Ninguno.
