---
phase: 197-entrenar-tabs-canasta-bloque-libre
plan: 06
subsystem: api-sessions
tags: [canasta, servicio, tenancy, bloque-libre]
requires: ["197-04", "197-05"]
provides:
  - FreeBlocksService (resolveMember, list, getOne, isAuraAvailableToday, todayContext)
  - FreeBlockItem, FreeBlocksMember, ResolveMemberResult, FreeBlocksListResult, FREE_BLOCK_AURA_MIN_SECONDS
affects: [197-07, 197-08]
key-files:
  created:
    - el-templo-api/src/modules/sessions/free-blocks-service.ts
requirements: [D-04, D-08, D-09, D-10, D-12, D-14]
---

# Fase 197 Plan 06: Servicio de la canasta — Summary

`FreeBlocksService` junta los candidatos del subnivel del socio, los rankea con las funciones puras de 197-05 y responde lista paginada, bloque suelto y estado de AURA; sin rutas todavía (se prueban por HTTP en 197-07).

## Qué se hizo

- `resolveMember`: gate = `resolveSessionView(db, ctx, userId, undefined)` (deny devuelto tal cual); `users.level`/`branchId` con `tenantWhere`; `basketLevel` (kairos -> alfa), `romLevel` (`effectiveLevelForDay(level, true)`); zona de la sede con `tenantWhere(branches)` y fallback `DEFAULT_TENANT_TIMEZONE`; `today = todayInTz(tz)`.
- `loadCandidates`: un SELECT de `sessions` (tenant, approved, `notLike GP-%`, semana <= hoy, nivel o ROM del `romLevel`), descarte en JS por `weekDayToDate` > hoy, `getSessionsByDayIds` (batch), roles de canasta sin `_ALT`. `title`/`subtitle`/`lastDate`/`sourceDayId`/`level`; `dedupeKey` con ids main en orden de sesión; `groupHits` con `ejerciciosPorGrupo`.
- `list`: dedupe -> `ordenarCanasta` -> `paginar`, más `auraAvailableToday`, `todayZones` y `weekWorkedZones` (las 4 cargas en `Promise.all`).
- `todayContext` (`loadTodayZones` + `loadWeekWorkedZones`), `isAuraAvailableToday` (flag `aura_awarded` de `extra_blocks_completed`), `getOne` (join `session_blocks` x `sessions`, columnas calificadas, `tenantWhere` de las dos tablas).

## Commits

- `aa971737f` feat(197-06): servicio de la canasta (candidatos, dedupe, orden, página)

## Verificación (estática)

- Los dos scripts `<verify>` del plan: todos los símbolos presentes (comprobados con el mismo listado), sin `console.`/`any`. Imports sin uso revisados a mano.
- Sin node_modules: nada de tipos ni tests corrido; CI confirma.

## Desvíos/decisiones

- **Un solo commit** para las dos tareas (ambas editan el mismo archivo y se escribió de una vez).
- **`like(dayId, "W%")` además de `notLike(dayId, "GP-%")`**: excluye también los formatos viejos `P-`/`J-` (que llevan nivel al final y entrarían por `%-nivel`). `getOne` aplica la misma regla.
- **`getSessionsByDayIds` no filtra tenant** (método preexistente, fuera de `files_modified`). Para `loadTodayZones`/`loadWeekWorkedZones` se agregó `dayIdsDelGimnasio` (SELECT con `tenantWhere(sessions)` + `inArray`) antes de pedir las sesiones; en `loadCandidates` y `getOne` el dayId ya sale de un SELECT con tenant.
- **Rol validado sobre el bloque reconstruido** en `getOne` (no sobre `session_blocks.role`): el servicio resuelve el `ATHLOS_EPIKOS` legado a ATHLOS/EPIKOS según la semana; validar el crudo lo habría rechazado.
- `levelOverride` inválido (no `isTrainingLevel`) se ignora y se usa el nivel del socio (el tipo de deny solo admite 403/404; además evita comodines en el `LIKE`).
- Mapeo ejercicio -> `EjercicioZonaInput` duplicado localmente (`aEjercicioZona`, 3 campos) porque `toZoneInput` es privado en `session-response.ts` (fuera del alcance del plan). Si se prefiere DRY, exportar esa función y borrar la copia.
- `loadTodayZones` lee `day_modes` con tenant (a diferencia de /weekly, que no lo scopea).
- Trailer de commit: `Claude Opus 5.5` según el orquestador.

## Bugs encontrados

Ninguno en código previo.

## Para el orquestador / planes siguientes

- 197-07 debe armar `ctx` con `attachCountryScope` + `assertTenant` y construir `new FreeBlocksService(fastify.db, sessionService, formatDescriptions)`; `limit`/`page` y `group` se validan en la ruta (el servicio no valida).
- `lint:tenant` en CI: el servicio llama `this.db.select` sobre 7 tablas gym-owned, todas con `tenantWhere`; si el linter pide algo más, avisar.
- `isAuraAvailableToday` solo mira `extra_blocks_completed.aura_awarded`; 197-08 debe escribir ese flag en la misma transacción que el alta de AURA.

## Self-Check: PASSED

Archivo creado presente y commit `aa971737f` en el log de `feat/197-entrenar`.
