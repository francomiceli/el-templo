---
phase: 206-tablero-semanal
plan: 03
subsystem: api
tags: [weekly-board, trial-sessions, renewals, refactor, by-branch]
requires: [206-02]
provides:
  - "reports/service.ts: kpisFromTally (exportada), tallyTrialSessions, ReportsService.getTrialSessionTalliesByBranch"
  - "reports/types.ts: TrialSessionTally"
  - "renewals/service.ts: renewalRateFrom (exportada), ExpiringRow.memberBranchId, RenewalsService.computeKpisByMemberBranch"
  - "test/fixtures/weekly-board.ts: boardWeeks, seedBoardBranches, cleanupBoardBranches, seedTrialBooking, seedRescheduledTrial, seedExpiringMembership"
affects: [206-04, 206-05, 206-06, 206-07]
key-files:
  created:
    - el-templo-api/test/fixtures/weekly-board.ts
    - el-templo-api/test/weekly-board/by-branch-embudo-renovaciones.test.ts
  modified:
    - el-templo-api/src/modules/reports/types.ts
    - el-templo-api/src/modules/reports/service.ts
    - el-templo-api/src/modules/renewals/service.ts
key-decisions:
  - "El mapa de cada metodo omite las sedes sin datos en el rango; el Tablero debe tratar la clave ausente como ceros"
  - "computeKpisByMemberBranch no valida el tope de 93 dias de listRenewals: el Tablero consulta rangos de 7 dias"
requirements-completed: [SC-4, SC-5, D-12, D-13, D-17, D-18, D-23, D-26, D-29]
completed: 2026-11-03
---

# Phase 206 Plan 03: Embudo y Renovaciones por sede Summary

Dos metodos publicos "por sede" dentro de los servicios de origen (Embudo por sede de la clase, Renovaciones por sede del alumno), mas dos extracciones sin cambio de comportamiento (`kpisFromTally`, `renewalRateFrom`) para que el Tablero recalcule porcentajes desde conteos crudos.

## Commits

| Commit | Subject |
| --- | --- |
| f7168f804 | feat(206-03): embudo y renovaciones por sede para el tablero |
| 6eaec983c | test(206-03): coincidencia por sede de embudo y renovaciones |

## Que se hizo

- `TrialSessionTally` (conteos crudos: `pendingThisShift, reservations, occurred, attended, purchased, purchasedOccurred, purchasedAttended`).
- `computeTrialSessionKpis(rows)` = `kpisFromTally(tallyTrialSessions(rows))`.
- `ReportsService.getTrialSessionTalliesByBranch(ctx, {dateFrom, dateTo})`: una sola pasada con `buildTrialSessionsConditions({dateFrom, dateTo})` (sin `branchId`/`country`), el mismo `log.warn` de tope (`TRIAL_SESSIONS_FETCH_CAP`, con `tenantId`, `cap` y el rango), `buildTrialSessionRows`, agrupado por `row.branchId` (= `br.id`, sede de la clase) y `tallyTrialSessions` por grupo.
- `ExpiringRow.memberBranchId` (`schema.users.branchId`, NOT NULL, columna plana del SELECT con `users` ya joineado por INNER JOIN con `tenantWhere`). `deriveRow` no lo copia: `RenewalRow` publica no cambia.
- `renewalRateFrom({renovo, noRenovo, volvioTarde})` exportada; `computeKpis` la usa.
- `RenewalsService.computeKpisByMemberBranch(ctx, {dateFrom, dateTo})`: `BadRequestError` con el mismo mensaje si `dateFrom > dateTo`; `fetchExpiringRows(... activityType: "membresia")` sin `branchId`/`country`; `fetchNextSubCandidates` una vez; por fila `deriveRow(e, pickNextSubscription(...), null, 5)`; agrupa por `e.memberBranchId`; `computeKpis` por grupo.

## Argumento de equivalencia del refactor (comportamiento preservado)

Se comparo el diff linea por linea. Las unicas lineas ELIMINADAS de codigo existente son las movidas:

1. `computeTrialSessionKpis`: el bucle de conteo paso literalmente a `tallyTrialSessions` (mismo codigo, mismas 7 variables, mismos `continue`). El cierre (`pct` y las 3 formulas) paso literalmente a `kpisFromTally`: `pct(attended, occurred)`, `pct(purchasedAttended, attended)`, `pct(purchasedOccurred, occurred)`, con la misma firma `den === 0 ? null : (num/den)*100`. Entre ambas piezas solo viaja el objeto de 7 enteros, sin transformacion. `pendingThisShift`, `reservations`, `attended` y `purchased` se copian tal cual al resultado. El unico llamador (`getTrialSessionsReport`) sigue llamando `computeTrialSessionKpis(allRows)` con la misma firma y devuelve el mismo `TrialSessionKpis` (mismas claves, mismo orden).
2. `computeKpis` (Renovaciones): `gestionados = renovo + noRenovo + volvioTarde; gestionados === 0 ? null : (renovo / gestionados) * 100` paso a `renewalRateFrom` con las mismas operaciones y el mismo orden de suma (no cambia el punto flotante). `computeKpis` la llama con los mismos tres contadores.
3. `fetchExpiringRows` solo agrega UNA columna al SELECT (`memberBranchId`). No toca joins, condiciones ni orden; el `...r` del map final la propaga a `ExpiringRow`. Todos los consumidores de `ExpiringRow` (`pickNextSubscription` usa `Pick` de 4 campos, `deriveRow` arma `RenewalRow` campo por campo, `fetchSingleRow` pasa por `deriveRow`) ignoran el campo nuevo, asi que ninguna respuesta HTTP cambia.
4. `listRenewals` y `getTrialSessionsReport` no se editaron.

Los tests existentes (`test/reports-trial-sessions.test.ts`, `test/renewals/renewals.test.ts`) no se tocaron; quedan como red de seguridad en CI.

Equivalencia por sede de los metodos nuevos: las filas del reporte se derivan una a una con datos globales del tenant (cadena de reagendas desde `trial_followups`, settings, `now`), no dependen del conjunto filtrado, asi que derivar sobre todo el tenant y agrupar da lo mismo que derivar filtrando por `br.id = ?`. En Renovaciones, `pickNextSubscription` trabaja por `userId`, independiente del filtro de sede. La unica diferencia con la pantalla es la excepcion D-29 (agrupa por `users.branch_id`).

## Tests

Todos "pendiente de CI" (regla del repo: no se corre vitest local, no hay corrida local):

- `el-templo-api/test/weekly-board/by-branch-embudo-renovaciones.test.ts` (12 `it(`): coincidencia contra `getTrialSessionsReport({branchId})` y `listRenewals({branchId, activityType:"membresia"})`, numeros explicitos (arA: reservas 3, asistieron 2, compraron 1, cierre 50; renovaciones: total 3, renovo 1, sinContactar 1, % 50), corte de rango, D-13 (sede de la clase vs del alumno), reagenda con ambas sesiones en rango, sedes sin datos ausentes del mapa, `kpisFromTally` con denominador 0, D-29, rango invertido, aislamiento con el gimnasio 2 (ambos sentidos).
- Regresion del refactor: `test/reports-trial-sessions.test.ts` y `test/renewals/renewals.test.ts` (sin editar), pendiente de CI.

## Gates

| Gate | Resultado |
| --- | --- |
| `pnpm exec tsc --noEmit` | exit 0 (tras cada tarea) |
| `pnpm lint:tenant` | exit 0 |
| `pnpm typecheck:tests` | exit 1 (preexistente, 17 discrepancias); ninguna linea menciona archivos de esta fase |
| Prettier sobre archivos tocados | OK |

## Decisiones del ejecutor

- La reagendada del escenario principal tiene la sesion ORIGINAL en la semana pasada y la NUEVA en la semana en curso. Asi los numeros del plan (reservas 3 para arA) se cumplen exactamente: el patron del repo (`rescheduleTrial` crea una booking nueva vinculada en `trial_followups`) hace que la nueva SI cuente, pero en otro rango. Un test aparte cubre la cadena con las dos sesiones dentro del rango (cuenta una vez).
- `seedTrialBooking`/`seedExpiringMembership` aceptan `tenantId` (default El Templo) para poder sembrar el gimnasio 2 en el test de aislamiento; `seedTrialBooking` acepta ademas `userBranchId` para probar D-13.
- Los socios del fixture se insertan directo con `tenantValues` (no `createTestMember`): hace falta controlar `users.branch_id`, `status` y `lead_status`, y es el patron de los tests de origen.
- El aislamiento no necesito editar `limpiarSegundoGimnasio`: `cleanAllTestData` (global) vacia bookings/subs/followups del gimnasio 2 antes, y el `afterAll` corre `cleanAllTestData` y luego `limpiarSegundoGimnasio`.
- `cleanupBoardBranches` se exporta y se usa en `afterAll` porque `cleanAllTestData` no borra `branches`.
- `computeKpisByMemberBranch` no aplica el tope de 93 dias (`RENEWAL_MAX_RANGE_DAYS`) de `listRenewals`; el Tablero consulta semanas.

## Deviations from Plan

None - plan ejecutado tal como estaba escrito (las decisiones de arriba son elecciones dentro de lo que el plan dejaba abierto).

## Notas para los planes siguientes

- Ambos metodos devuelven `Map<number, ...>` SIN las sedes sin datos: 206-05 debe tratar la clave ausente como ceros (Embudo) o como `total: 0` (Renovaciones) y filtrar por las sedes activas/no virtuales/de alcance. Las sedes virtuales aparecen en el mapa si tienen datos (el Embudo cuenta en la sede de la clase, incluidas las de Online); la columna informativa "Online" (D-25) puede leer de ahi.
- Para sumar al Total por pais: sumar los `TrialSessionTally` (campos crudos) y aplicar `kpisFromTally`; para Renovaciones sumar `renovo/noRenovo/volvioTarde` y aplicar `renewalRateFrom`, nunca promediar porcentajes (D-26).
- "Vencen la semana que viene" = `computeKpisByMemberBranch(ctx, weekRange(next)).total`.
- El tally lleva `occurred`, `purchasedOccurred` y `purchasedAttended`: si 206-04 persiste fotos con columnas crudas, guardar esos 7 enteros y no los porcentajes.
- `test/fixtures/weekly-board.ts` esta pensado para extenderse (Caja, Deuda, Alumnos activos): reusar `boardWeeks` y `seedBoardBranches`.
- Los seeds usan la semana pasada; el reporte usa `new Date()` interno para "clase ocurrida", por eso no se siembra la semana en curso en asserts de asistencia.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. Los metodos nuevos reusan helpers que ya filtran por `ctx` (T-206-06), la extraccion no cambia formulas (T-206-07) y se mantiene el tope con `log.warn` (T-206-08).

## Self-Check: PASSED

Archivos creados verificados en disco; commits f7168f804 y 6eaec983c presentes en `git log`.
