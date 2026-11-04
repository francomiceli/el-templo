---
phase: 206-tablero-semanal
plan: 07
subsystem: api
tags: [weekly-board, cron, snapshots, tenancy, integration-tests]
requires: [206-05, 206-06]
provides:
  - "WeeklyBoardService.closeDue(ctx, now): cierre principal (lunes) y tardio (viernes) con la misma calculadora del read path"
  - "jobs/weekly-board-close.ts: runWeeklyBoardClose(db, now) + startWeeklyBoardCloseJob(db), cron horario minuto 5 AR"
  - "CON-04: inventario de jobs 11 -> 12"
affects: [206-08, 206-09, 206-10]
key-files:
  created:
    - el-templo-api/src/jobs/weekly-board-close.ts
    - el-templo-api/test/jobs/weekly-board-close.test.ts
  modified:
    - el-templo-api/src/modules/weekly-board/service.ts
    - el-templo-api/src/index.ts
    - el-templo-api/test/tenancy/con-04-crons-per-tenant.test.ts
key-decisions:
  - "Un solo cron horario (5 * * * *) en lugar de dos (lunes y viernes): se recupera solo ante un deploy o reinicio a las 00:05"
  - "Semana cerrada = TODAS las sedes activas con sello; el UPDATE lleva WHERE sello IS NULL"
  - "Pasos INSERT de filas faltantes + UPDATE de cada (semana, bloque) en UNA transaccion; calculos antes de abrirla"
requirements-completed: [SC-6, SC-8, D-08, D-09, D-10, D-11, D-15, D-25]
completed: 2026-11-03
---

# Phase 206 Plan 07: Cierre semanal del Tablero Summary

Las semanas se congelan solas: la foto principal desde el lunes 00:05 AR y la tardia (embudo + renovaciones) desde el viernes 00:05 AR, con un job horario que barre gimnasio por gimnasio y cierra "lo vencido que falte".

## Commits

| Commit | Subject |
| --- | --- |
| 4d9ca5343 | feat(206-07): cierre semanal automatico del tablero |
| 2936300d6 | test(206-07): cierre semanal del tablero (lunes, viernes, idempotencia, tenants) |

## Que se hizo

- `closeDue(ctx, now = new Date())` en `WeeklyBoardService`: `dueClosures(todayInTz(BOARD_TZ, now))`; sedes ACTIVAS del tenant (fisicas y virtuales, `currency = currencyForCountry`); una query de fotos de las semanas debidas. Para cada semana principal no sellada: `computeWeekFlows` + `computePointInTime` en paralelo y `composeMain`; para cada tardia no sellada: `computeLate`. Los calculos corren ANTES de abrir la transaccion.
- Por (semana, bloque), UNA `db.transaction`: paso 1, INSERT de las filas `(tenant, semana, sede)` que faltan (`tenantValues`, `onDuplicateKeyUpdate` no-op sobre `branch_id`, sin ignorar conflictos); paso 2, UPDATE por sede con `tenantWhere` y `isNull(mainClosedAt | lateClosedAt)`. Los sellos usan el `now` inyectado.
- "Ya cerrada" = todas las sedes activas tienen el sello (fix del revisor): una semana sellada a medias se completa en la corrida siguiente sin pisar lo sellado.
- Devuelve las semanas cerradas en la corrida (`{ main, late }`) y loguea `Tablero: semana cerrada` con `tenantId`, `weekStart`, `block`, cantidad de sedes.
- `jobs/weekly-board-close.ts`: pino `weekly-board-close`, `forEachActiveTenant`, cron `5 * * * *` con timezone AR, `catch (err: unknown)` + `log.error`. El `WeeklyBoardService` recibe el logger de pino directamente (mismo idiom que `office-auto-topics.ts`; tsc lo acepta).
- `index.ts`: `startWeeklyBoardCloseJob(app.db)` antes de `startMarkNoShowsJob`.
- CON-04: `weekly-board-close.ts` en `JOBS_ESPERADOS` (antes de `wellhub-sync.ts`), comentario del historial y titulo "12 jobs".

## Tests (todos "pendiente de CI": regla del repo, no se corrio vitest local)

- `el-templo-api/test/jobs/weekly-board-close.test.ts` (8 `it(`): lunes (main [L], late [LL], una fila por sede activa incl. `virtualAr`, ausencia de `inactiveAr`, `cobrado` arA 1000 / arB 0, EUR en `es`, LL sin principal); idempotencia (filas identicas antes y despues); foto congelada (cobro posterior de 500, sigue 1000); jueves 23:59 sin tardio de L; viernes 00:05 con tardio (reservas/compraron >= 1, renovaron 1, principal sin cambios); recuperacion del miercoles + `GET` con `capturedLate` true; una sola sede sellada (777 intacto, restantes selladas, sin duplicar); barrido por tenant con `seedSecondTenant`.
- `el-templo-api/test/tenancy/con-04-crons-per-tenant.test.ts`: pendiente de CI (12 jobs).
- Sin fake timers, sin `todayStr()`, sin ids de `users` literales.

## Gates

| Gate | Resultado |
| --- | --- |
| `pnpm exec tsc --noEmit` | exit 0 |
| `pnpm lint:tenant` | exit 0 |
| `pnpm typecheck:tests` | exit 1 con 17 discrepancias preexistentes (attendance, subscriptions/lifecycle, etc.); ninguna linea menciona archivos de este plan |
| `prettier --check` | OK en los 5 archivos |

## Decisiones del ejecutor

- Los dos textos literales `INSERT IGNORE` / `affectedRows` aparecian en comentarios de `service.ts` (uno nuevo y uno de `upsertLeads`, de 206-05); se reformularon para que el grep de aceptacion (`= 0`) pase. Sin cambio de comportamiento.
- `insertMissing` calcula las filas faltantes con la lectura previa a la transaccion; si otra corrida inserto en el medio, el `ON DUPLICATE KEY UPDATE` no-op evita el error y el UPDATE condicionado mantiene la idempotencia.
- Las sedes que existan en la base de test por migraciones tambien reciben fila; los tests asertan solo sobre los ids del fixture.

## Deviations from Plan

None - plan executed exactly as written (mas el fix del revisor sobre transaccion y criterio "todas las sedes selladas", ya parte del encargo).

## Notas de merge contra `feat/oficina`

- `el-templo-api/src/index.ts`: ambas ramas agregan un `startXJob(app.db)` y un import en el mismo bloque (oficina: `startOfficeAutoTopicsJob` tras `startMarketingGoogleJob`; aca: `startWeeklyBoardCloseJob` tras el import de marketing-google y antes de `await startMarkNoShowsJob`). Conservar AMBAS lineas de import y AMBAS llamadas.
- `test/tenancy/con-04-crons-per-tenant.test.ts`: oficina tambien pasa 11 -> 12 (suma `office-auto-topics.ts`). Al mergear quedan 13: SUMAR deltas, no elegir un lado. `JOBS_ESPERADOS` alfabetico: `...notification-rules.ts, office-auto-topics.ts, reassign-multibranch.ts, tenure-milestones.ts, weekly-board-close.ts, wellhub-sync.ts`; titulo del Test 6 "exactamente los 13 jobs conocidos"; sumar ambas lineas al comentario del historial.

## Notas para los planes siguientes

- Jobs: `lint:tenant` y CON-04 ya reconocen `weekly-board-close.ts`; cualquier otro job nuevo en la fase vuelve a sumar al inventario.
- `closeDue` solo sella sedes ACTIVAS al momento del cierre: una sede dada de alta despues queda sin fila (el read path ya lo tolera con bloque null).
- El cierre tomado tarde (recuperacion) queda marcado por `capturedLate` en la respuesta de `GET`; la UI de 206-08/09 puede usarlo para el aviso.

## Known Stubs

None.

## Threat Flags

None. El job opera solo sobre `weekly_board_snapshots` y lee `branches` y las fuentes ya cubiertas por 206-05, todo con `tenantWhere`/`tenantValues` (T-206-23, T-206-24, T-206-26 mitigados; T-206-25 aceptado).

## Self-Check: PASSED

- Archivos creados verificados: `src/jobs/weekly-board-close.ts`, `test/jobs/weekly-board-close.test.ts`.
- Commits 4d9ca5343 y 2936300d6 presentes en la rama `feat/tablero-semanal`.
