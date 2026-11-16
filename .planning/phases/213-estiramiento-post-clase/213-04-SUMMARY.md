---
phase: 213-estiramiento-post-clase
plan: 04
subsystem: api
tags: [sessions, stretch, service, route, tenancy, iso-01, integration-tests]
requires:
  - phase: 213-01
    provides: tablas stretch_catalog y stretch_offers, tipos del schema stretch.ts
  - phase: 213-02
    provides: seleccionarEstiramientos, modoOfreceEstiramiento, STRETCH_SECONDS_PER_SIDE, STRETCH_TRANSITION_SECONDS
  - phase: 213-03
    provides: stretchArm (grupo fijo del experimento)
provides:
  - StretchService (resolveToday, findEligibleAttendance, buildRoutine, ensureOffer, getToday)
  - GET /api/sessions/stretch/today (plugin de sesiones, moduleScope templo-training)
  - isGenericClassActivity (criterio unico de actividad General)
  - fixtures de test reutilizables (_stretch-fixtures.ts)
affects: [213-05 aislamiento, 213-07 job del push, 213-08 completado, 213-09 app card y player]
tech-stack:
  added: []
  patterns:
    - "oferta = fila congelada creada por el primero que llega (insert ... onDuplicateKeyUpdate set id = id)"
    - "reloj del servicio por parametro now; hoy = todayInTz(tz de la sede)"
key-files:
  created:
    - el-templo-api/src/modules/sessions/stretch-service.ts
    - el-templo-api/src/modules/sessions/stretch-schemas.ts
    - el-templo-api/src/modules/sessions/stretch-routes.ts
    - el-templo-api/test/sessions/_stretch-fixtures.ts
    - el-templo-api/test/sessions/stretch-today.test.ts
  modified:
    - el-templo-api/src/modules/scheduling/derived-label.ts
    - el-templo-api/src/modules/sessions/routes.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
key-decisions:
  - "La resolucion de la sesion replica los pasos 4-8 de /daily (vista templo) en vez de refactorizar /daily (fuera de alcance)"
  - "ENTRADAS_BASELINE de ISO-01: 554 -> 555 (verificado cargando TENANT_MANIFEST: 555 claves)"
requirements-completed: [SC-2, SC-7, SC-9, D-01, D-05, D-06, D-09, D-13, D-15, D-16]
duration: ~50min
completed: 2026-11-11
---

# Phase 213 Plan 04: Oferta del dia (servicio y ruta) Summary

`GET /api/sessions/stretch/today` devuelve la rutina de estiramiento del dia solo con asistencia a una clase General no especial ya terminada (hora de la sede) y nunca en dia ROM; la rutina se arma con la regla pura y se congela en `stretch_offers` con el grupo del experimento fijo.

## Tareas

| Tarea | Resultado | Commit |
| ----- | --------- | ------ |
| 1. StretchService | `derived-label.ts` (extrae `isGenericClassActivity`), `stretch-service.ts` | `d44712729` |
| 2a. Ruta + manifiesto | `stretch-schemas.ts`, `stretch-routes.ts`, `routes.ts`, `tenant-manifest.ts`, `iso-01-manifiesto.test.ts` | `cf6cf2a61` |
| 2b. Fixtures + test | `_stretch-fixtures.ts`, `stretch-today.test.ts` | `386b2822b` |

## Que hace el servicio

- `resolveToday`: zona de la sede del socio (`users.branch_id`) y `todayInTz(tz, now)`.
- `findEligibleAttendance`: `attendance` de hoy con `schedule_id` no nulo, join `schedules`/`activities`/`branches` (todos con `tenantWhere`), filtro `isGenericClassActivity`, `classEndAt = buildClassDateTime(...)` con la zona de la sede de la asistencia, solo las ya terminadas (`classEndAt <= now`); con dos devuelve la de fin mas temprano (D-09).
- `buildRoutine`: nivel = `completed_sessions.session_level` de `presencial-<fecha>` si existe, si no `users.level`; domingo -> null; `day_modes` ROM -> `effectiveLevelForDay`; `buildDayIdCandidates(true, null, ...)`; primera sesion `approved` con `goal_plan_type IS NULL` por orden de candidata; `!modoOfreceEstiramiento` -> null (D-06); prescritos = `mobility` o cualquier prescripcion de un bloque `STRETCHING`, con `exercises.mobility_related` (join con tenant en la condicion); catalogo activo del tenant (vacio -> null + `log.warn`); `seleccionarEstiramientos`.
- `ensureOffer`: devuelve la fila existente tal cual (rutina congelada) o inserta con `tenantValues` + `onDuplicateKeyUpdate({ set: { id: sql\`id\` } })` y relee. `arm = stretchArm(userId)`; `push_decision = 'control'` solo si es el grupo control.
- `getToday`: fila de hoy -> `done`/`available`; sin fila -> elegibilidad -> `ensureOffer` -> `available` o `none`. Una oferta de otro dia nunca se devuelve (se busca por el `localDate` de hoy). `videoUrl` con `buildVideoResolver` (opcional, D-01).

## Verificaciones

Corridas:
- `pnpm exec tsc --noEmit`: solo los 3 errores preexistentes de `src/app.ts` (`@fastify/rate-limit`).
- `pnpm lint:tenant`: exit 0.
- `pnpm typecheck:tests`: 20 discrepancias, todas preexistentes y de archivos ajenos (la unica que menciona "stretching" es `test/unit/stretching-selection.test.ts`, del pipeline viejo). Ningun archivo de este plan aparece. No se regenero el baseline.
- Carga real de `TENANT_MANIFEST` con tsx: 555 claves (coincide con `ENTRADAS_BASELINE = 555`).
- Greps de aceptacion: `isGenericClassActivity` exportada, `onDuplicateKeyUpdate`, `seleccionarEstiramientos`, sin `toISOString().slice`/`any`/`console`/`Date.now()` en el servicio, sin escritura a `completed_sessions`, sin fechas de calendario fijas en el test.
- Prettier sobre todos los archivos tocados.

No corridas localmente (las cubre CI): `test/sessions/stretch-today.test.ts` (19 `it`, 14 casos a-n con a2 y e1/e2 extra, mas 401) y el test de ISO-01 (necesitan MySQL, que no hay local). Como no se pudieron ejecutar, se revisaron a mano contra `cleanAllTestData` (limpia `stretch_offers`, `stretch_catalog`, `attendance`, `bookings`, `schedules`, `activities`, `sessions`, `exercises`, `completed_sessions`), `createPresencialMember` y el modelo `free-blocks-complete.test.ts`.

## Deviations from Plan

None - plan executed as written. Ajustes menores de fidelidad al plan:
- El caso (e) se partio en dos `it` (e1 especial, e2 Yoga) y se agrego (a2) (los tres grupos) y un caso de 401 sin token.
- El caso (c) usa una reserva real (`bookings`) sin check-in, como pide el plan.

## Decisiones del ejecutor

- `ensureOffer(ctx, att, now)` recibe `now` por la firma del plan pero no lo usa (el fin de clase ya viene en `att`); el parametro se llama `_now` para dejar a mano un uso futuro sin romper la firma que usara el job del plan 07.
- En el servicio todas las consultas a `sessions`, `session_blocks`, `session_prescriptions`, `exercises` y `day_modes` llevan `tenantWhere` (el `/daily` existente no lo hace en `day_modes`/`getSessionsByDayIds`; no se toco).
- `stretch_catalog` se lee ordenado por familia y `sort_order`; la regla no depende del orden de entrada (reordena por `orden`), asi que solo es por estabilidad.
- Si la regla devuelve 0 estiramientos (catalogo sin coincidencias), tampoco se crea fila.
- En los fixtures las prescripciones `mobility` llevan `sort_order = 900 + indice` (en prod es 999 para todas) para que el orden sea determinista en el test.
- El caso de Madrid cambia la zona de la sede 1 y `afterAll` la restaura a Buenos Aires; cada caso la fuerza de nuevo en `arrange`.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-213-08 (`userId` del JWT, `assertTenant`, `tenantWhere` en tablas y joins, sin parametros), T-213-09 (ruta dentro del plugin con `moduleScope("templo-training")` + manifiesto `templo-module`; la bateria de aislamiento va en el plan 05), T-213-10 (grupo y rutina calculados en servidor y congelados). Sin nuevas superficies fuera del plan.

## Lecciones para los planes siguientes

- Fixtures reutilizables en `test/sessions/_stretch-fixtures.ts`: `CATALOGO_SPEC`, `NOMBRES_CATALOGO`, `seedStretchCatalog(app, ctx?)` (devuelve `Map<nombre, exerciseId>`), `seedMobilityExercise`, `seedClass({ branchId, dayOfWeek, startTime, endTime, activityName?, isSpecial?, ctx? })`, `seedAttendance({ memberId, branchId, scheduleId|null, sessionDate, source?, ctx? })`, `seedStretchSession({ date, level, mode, blocks, ctx? })` (devuelve `{ sessionId, dayId }`), `createMemberWithArm(app, arm, opts?)`, `localClock(tz, date, "HH:MM")`.
- El patron de escenario completo (reloj antes de loguear, zona de la sede, `day_modes` del dia, catalogo, socio, sesion, clase, asistencia) esta en `arrange()` dentro de `stretch-today.test.ts`; copiarlo en los tests de los planes 05, 07 y 08 (no esta exportado).
- Fechas: `lastWeekday(dia)` (ultimo dia de la semana segun Buenos Aires, acotado a la semana 51) esta en el test, tambien local. La oferta se identifica por `(tenant, user, local_date)`; `getToday` solo mira la del dia local de hoy.
- `StretchService.ensureOffer(ctx, att, now)` es lo que debe llamar el job del plan 07 (con la asistencia elegible de `findEligibleAttendance`) para que la fila sea identica sea quien sea el que la cree.
- `sessions.day_id` es UNIQUE global: los fixtures borran por `(tenant, day_id)` antes de insertar. `sessions.status` debe ser `approved` y `goal_plan_type` nulo para que la oferta la vea.
- La respuesta usa `["integer","null"]` etc. en el esquema; el campo `completedAt` sale como ISO string.
- Un `completed_sessions` presencial (`presencial-<fecha>`) cambia el nivel con que se arma la rutina; el `source_day_id` de la fila refleja ese nivel.

## Self-Check: PASSED

- Existen: `stretch-service.ts`, `stretch-schemas.ts`, `stretch-routes.ts`, `_stretch-fixtures.ts`, `stretch-today.test.ts`.
- Commits `d44712729`, `cf6cf2a61` y `386b2822b` existen en `feat/estiramiento-post-clase`.
