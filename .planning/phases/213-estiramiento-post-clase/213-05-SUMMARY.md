---
phase: 213-estiramiento-post-clase
plan: 05
subsystem: api
tags: [sessions, stretch, aura, migration, events, complete, tenancy, iso-03, integration-tests]
requires:
  - phase: 213-04
    provides: StretchService (resolveToday, ensureOffer, getToday), stretch-routes, fixtures _stretch-fixtures
  - phase: 213-01
    provides: tabla stretch_offers (marcas del embudo, completed_at, duration_seconds, aura_awarded)
provides:
  - fuente de AURA `stretch` (migracion 0342, enum en aura_transactions y aura_config, seed de 5)
  - POST /api/sessions/stretch/events (card_seen, started, push_opened) idempotentes
  - POST /api/sessions/stretch/complete (duracion medida por el servidor, +5 AURA una vez por dia)
  - arrangeStretchScenario y helpers compartidos en _stretch-fixtures.ts
affects: [213-07 job del push (push_opened_at, started_from), 213-09 app (store y completado), 213-11 card (card_seen)]
tech-stack:
  added: []
  patterns:
    - "marcas del embudo con UPDATE ... WHERE <marca> IS NULL (idempotencia sin lectura previa de la marca)"
    - "duracion = now - started_at, ambas del servidor; el body no acepta tiempos"
    - "AURA via awardOncePerLocalDay (unique unique_user_source_ref con YYYYMMDD local)"
key-files:
  created:
    - el-templo-api/src/db/migrations/0342_aura_source_stretch.sql
    - el-templo-api/test/migrations/0342-aura-source-stretch.test.ts
    - el-templo-api/test/sessions/stretch-complete.test.ts
    - el-templo-api/test/tenancy/iso-03-stretch.test.ts
  modified:
    - el-templo-api/src/db/schema/aura-config.ts
    - el-templo-api/src/db/schema/aura-transactions.ts
    - el-templo-api/src/modules/aura/types.ts
    - el-templo-api/src/modules/sessions/stretch-service.ts
    - el-templo-api/src/modules/sessions/stretch-schemas.ts
    - el-templo-api/src/modules/sessions/stretch-routes.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/sessions/_stretch-fixtures.ts
    - el-templo-api/test/sessions/stretch-today.test.ts
key-decisions:
  - "Migracion 0342 (no 0332): master ya usa 0330 y la fase ocupa 0340/0341; verificado en origin/master, origin/staging, feat/egresos-rendiciones y feat/v6.1-gimnasio (max 0330)"
  - "ENTRADAS_BASELINE de ISO-01: 555 -> 557"
  - "complete sin started_at se registra sin duracion ni AURA, con log.warn"
requirements-completed: [SC-3, SC-7, SC-8, SC-9, D-08, D-12, D-13, D-15]
duration: ~55min
completed: 2026-11-11
---

# Phase 213 Plan 05: Eventos y completado del estiramiento (AURA stretch) Summary

El lado servidor del player queda cerrado: `POST /stretch/events` escribe las marcas del embudo una sola vez, y `POST /stretch/complete` guarda la duracion medida por el servidor y acredita +5 AURA (fuente nueva `stretch`, migracion 0342) una vez por dia local solo con todos los estiramientos marcados y al menos 3 minutos.

## Tareas

| Tarea | Resultado | Commit |
| ----- | --------- | ------ |
| 1. Fuente AURA `stretch` | migracion 0342, dos `mysqlEnum`, `AuraSourceType`, test de migracion | `6a6b6537c` |
| 2. Servicio, rutas, schemas y manifiesto | `recordEvent`, `complete`, 2 rutas, `ENTRADAS_BASELINE` 557 | `5aaa522e5` |
| 3. Tests | `stretch-complete` (17 casos), `iso-03-stretch` (8 casos), fixtures compartidos | `81c4fc7ec` |

## Que hace

- **Migracion 0342** (`0342_aura_source_stretch.sql`): `stretch` al final del enum de `aura_transactions.source_type` y `aura_config.aura_config_source_type` (lista copiada de la definicion actual, 14 valores previos + `stretch`), `INSERT IGNORE ... ('stretch', 5, ...)`. Sin `;` en comentarios. No habia mapas exhaustivos por fuente (`Record<AuraSourceType, ...>`) ni etiquetas en app/admin que completar.
- **`recordEvent`**: `card_seen` y `started` operan sobre la fila de hoy (`resolveToday`), sin fila -> `not_found` (404). `started` es no-op si ya esta completada y guarda `started_from` (`card` por defecto). `push_opened` toma la fila mas reciente con `push_decision = 'queued'`, `push_opened_at IS NULL` y `push_queued_at >= now - 36 h` (`STRETCH_PUSH_OPEN_LOOKBACK_HOURS`); sin candidata es no-op y siempre responde ok.
- **`complete`**: 404 si la oferta no es del socio/tenant; 410 si `local_date` no es el de hoy en la sede; ya completada -> `alreadyCompleted: true` sin reacreditar; ids filtrados contra la rutina congelada (unicos, en orden de rutina); `allDone` = todos los de la rutina; duracion = `now - started_at`; `UPDATE ... WHERE completed_at IS NULL` y, con `affectedRows = 0` (carrera), se relee y se devuelve como ya completada; AURA solo con `allDone && duracion >= 180 s` (`STRETCH_AURA_MIN_SECONDS`) via `awardOncePerLocalDay`, y luego `aura_awarded = true`.
- **Schemas**: body de events y de complete con `additionalProperties: false`, enums cerrados, `exercisesCompleted` con `maxItems: 20`; respuestas 200/401/404/410.
- **Manifiesto**: `POST /api/sessions/stretch/events` y `.../complete` como `templo-module`/`templo-training`; `ENTRADAS_BASELINE` 555 -> 557.

## Decisiones tomadas en ejecucion

1. **Numero de migracion 0342** (indicado por el orquestador; el chequeo de ramas confirma maximo 0330 fuera de la fase, y la rama tiene 0340/0341).
2. **`StretchService` recibe `AuraService` como tercer parametro del constructor**; la ruta lo construye con `new AuraService(fastify.db)`, igual que `free-blocks-routes.ts`. El job del plan 07 que instancie el servicio tendra que pasarlo (o no, si solo usa `findEligibleAttendance`/`ensureOffer`: el parametro es obligatorio, asi que lo necesitara igual).
3. **Orden de chequeos de `complete`**: 404 (no es suyo) antes que 410 (otro dia), y "ya completada" despues del 410: una oferta vencida y completada responde 410, no `alreadyCompleted`.
4. **`exercisesCompleted` se guarda en orden de rutina**, no en el orden del body, para que sea determinista.
5. **`allDone` en el reintento** se recalcula desde `exercises_completed` guardado contra la rutina.
6. **ISO-03 no asevera AURA del gimnasio 2**: `aura_config` es global y el fixture del segundo gimnasio no la siembra; el control positivo cierra sin `started` (sin AURA) para no depender de ella.
7. **Nivel del gimnasio 2 = `alfa`** (El Templo `sigma`) porque `sessions.day_id` es UNIQUE global y las dos sesiones son del mismo dia.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `arrange()` y `lastWeekday()` movidos a `_stretch-fixtures.ts`**
- **Found during:** Task 3
- **Issue:** `stretch-complete` e `iso-03-stretch` necesitan el escenario completo (reloj, zona, day_modes, catalogo, socio, sesion, clase, asistencia) que vivia dentro de `stretch-today.test.ts`; la leccion del plan 04 pide moverlo y no copiarlo.
- **Fix:** `arrangeStretchScenario(app, opts)`, `lastWeekday`, `DOW`, `AR_TZ`, `LEVEL`, `BRANCH_ID`, `BLOQUES_REGULAR`, `BLOQUES_TECNICA` y los tipos `ArrangeOpts`/`Arranged` ahora se exportan desde `_stretch-fixtures.ts`; `stretch-today.test.ts` los importa y su `arrange` delega. Los imports que quedaron sin uso se quitaron. Sin cambios de comportamiento.
- **Files modified:** `test/sessions/_stretch-fixtures.ts`, `test/sessions/stretch-today.test.ts`
- **Commit:** `81c4fc7ec`

Tambien se agregaron casos no pedidos por el plan en `stretch-complete`: (n) ids ajenos/duplicados ignorados, (o) un id ajeno no reemplaza a uno faltante, (p) card_seen/started sin oferta -> 404 sin crear filas, (q) 401 sin token.

## Verificaciones

Corridas localmente:
- `pnpm exec tsc --noEmit`: solo los 3 errores preexistentes de `src/app.ts` (`@fastify/rate-limit`).
- `pnpm lint:tenant`: DISCREPANCIAS 0.
- `pnpm typecheck:tests`: 20 discrepancias, identicas al baseline preexistente (ninguna en archivos tocados por este plan).
- Chequeos estaticos del plan: sin `;` en comentarios SQL, `'stretch')` al final del enum, `"stretch"` en los dos schemas y en el tipo, `additionalProperties: false` en los 2 body, `sourceType: "stretch"` en el servicio, sin `completedSessions`/`post_session_soreness`/`any`/`console` fuera de comentarios.

No corridas localmente (sin MySQL, las cubre CI): `pnpm db:migrate`, `0342-aura-source-stretch.test.ts`, `stretch-complete.test.ts`, `iso-03-stretch.test.ts`, `stretch-today.test.ts` (refactorizado) e `iso-01-manifiesto.test.ts` (conteo 557 no verificado cargando el manifiesto en esta corrida: 555 + 2 entradas agregadas).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno: las dos rutas nuevas estan en el manifiesto y bajo el guard del modulo; no hay superficie fuera del threat model del plan.

## Self-Check: PASSED

- 0342_aura_source_stretch.sql, 0342-aura-source-stretch.test.ts, stretch-complete.test.ts, iso-03-stretch.test.ts: presentes.
- Commits `6a6b6537c`, `5aaa522e5`, `81c4fc7ec`: presentes en la rama.
