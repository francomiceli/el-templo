---
phase: 213-estiramiento-post-clase
plan: 07
subsystem: api
tags: [notifications, cron, stretch, push, experiment, integration-tests]
requires:
  - phase: 213-03
    provides: computeStretchPushAt, isWithinPushWindow, decideFrequencyBlock, STRETCH_PUSH_OFFSET_MINUTES
  - phase: 213-04
    provides: StretchService.findEligibleAttendance / ensureOffer y los fixtures de test
  - phase: 213-05
    provides: marcas del embudo con escritor (card_seen, started, push_opened)
  - phase: 213-06
    provides: plantilla stretch_followup (nace apagada) y STRETCH_FOLLOWUP_TEMPLATE_KEY
provides:
  - runStretchPushForTenant(db, ctx, log, now) + stretchPushHadActivity
  - paso del tick de notification-cron.ts (sin cron.schedule nuevo)
  - 34 casos de integracion con reloj inyectado de SPEC 5.2 (no corridos localmente: los cubre CI)
  - helpers de push en _stretch-fixtures.ts
affects: [213-13 consulta de medicion y gates finales]
tech-stack:
  added: []
  patterns: [paso de tick con try/catch antes de processQueue, reclamo UPDATE ... WHERE push_decision IS NULL, motivo pre-chequeado en vez de deducido del -1]
key-files:
  created:
    - el-templo-api/src/modules/sessions/stretch-push.ts
    - el-templo-api/test/notifications/stretch-push-timing.test.ts
    - el-templo-api/test/notifications/stretch-push-decisions.test.ts
  modified:
    - el-templo-api/src/jobs/notification-cron.ts
    - el-templo-api/test/sessions/_stretch-fixtures.ts
key-decisions:
  - "El job NO arma EligibleAttendance a mano: el barrido SQL solo acota candidatos (socio + dia local + ventana) y la fila sale de StretchService.findEligibleAttendance + ensureOffer, los mismos de la card (D-15) y con la misma regla D-09 (fin mas temprano)"
  - "El log de contadores lo escribe solo el tick del cron (patron de novedades); el modulo no loguea para no duplicar la linea"
patterns-established:
  - "Tests del job: reloj inyectado con localClock(zona, fecha, 'HH:MM') sobre UNA fecha base comun; ticks de dos sedes derivados del mismo dia"
requirements-completed: [SC-5, SC-7, SC-8, SC-9, D-06, D-10, D-11, D-12, D-13, D-14, D-15, D-16]
duration: 45min
completed: 2026-11-11
---

# Phase 213 Plan 07: Push "¿Estiraste?" en el tick del cron Summary

**Paso del tick de notificaciones que crea la oferta del dia para todos los grupos, encola el push a fin de clase + 30/60 (tope 21:30 de la sede) con motivo pre-chequeado en `push_decision`, salta gimnasios sin `templo-training` y reconcilia `push_sent_at` antes de la purga de 24 h.**

## Performance

- **Tasks:** 3/3
- **Files:** 3 creados, 2 modificados

## Accomplishments

- `stretch-push.ts` con `runStretchPushForTenant`: D-13 como primera linea; reconciliacion (filas `queued` de las ultimas 23 h: `sent` guarda `push_sent_at`, `failed` pasa a `fallo_envio`, purgada o `pending` no cambia nada); barrido de asistencias de hoy en la zona de cada sede dentro de la ventana fin <= ahora < fin + 120; por candidato `findEligibleAttendance` + `ensureOffer`, y la cadena de decision `control` / `fuera_de_horario` / espera / `ya_empezo` / `plantilla_apagada` / `sin_token` / `categoria_apagada` / `tope_semanal` / `pausa_sin_abrir` / encolar.
- El encolado reclama la fila con `UPDATE ... WHERE push_decision IS NULL` (solo gana uno), llama a `queueNotification({ userId, templateKey, scheduledAt })` sin titulo, cuerpo ni ruta propios y sin `booking_id`; `-1` o excepcion dejan `error_encolado` con `push_queued_at` nulo.
- `notification-cron.ts`: bloque try/catch calcado del de novedades, antes de `processQueue`; la cantidad de `cron.schedule` no cambia (8) y `JOBS_ESPERADOS` no se toca.
- Un candidato que falla (excepcion) cuenta en `failed` y no frena a los demas; un fallo del paso lo contiene el try/catch del tick.

## Task Commits

1. **Task 1: stretch-push.ts + paso en el tick** - `e7ee1d051` (feat)
2. **Task 2: tests de momento y elegibilidad (16 casos)** - `0880df06f` (test)
3. **Task 3: tests de motivos, tope, segundo gimnasio y reconciliacion (18 casos)** - `3934a67b1` (test)

## Verificaciones

Corridas localmente:

- `cd el-templo-api && npx tsc --noEmit`: solo los 3 errores preexistentes de `src/app.ts` (`@fastify/rate-limit`); ninguno nuevo.
- `pnpm lint:tenant`: exit 0.
- `pnpm typecheck:tests`: 20 discrepancias, todas preexistentes (baseline); ninguna en `stretch-push-*`, `_stretch-fixtures` ni `notification-cron`.
- Verify automatizado de las tres tareas (grep de `runStretchPushForTenant` en el cron, `"templo-training"`, `STRETCH_FOLLOWUP_TEMPLATE_KEY`; ausencia fuera de comentarios de `titleOverride|bodyOverride|routeOverride|bookingId|cron.schedule|any|console.`; `cron.schedule` igual que en HEAD; conteo de `it(`; sin fechas de calendario fijas): OK.
- Prettier aplicado a todos los archivos.

NO corridas (no hay MySQL local): los 34 casos de integracion de `stretch-push-timing.test.ts` (16) y `stretch-push-decisions.test.ts` (18). Los cubre CI. Fueron revisados contra los helpers y fixtures reales y pasan `typecheck:tests`.

## Casos de los tests (SPEC 5.2)

Parte 1 (16): push_60 21:29/21:30/22:00; push_30 a las 21:30; clase 21-22 `fuera_de_horario` con la card `available`; dos sedes Madrid y Buenos Aires; `no_show`/`cancelado`; Wellhub sin horario; asistencia a fin + 40 (encola) y a fin + 3 h (el tick no crea fila, la card si); dos clases (fin mas temprano, un solo push tras 4 ticks); ROM sin fila; tecnica y combos encolan; Open Gym sin fila; `class_reminder` previo no interfiere; dos ticks un solo push; control.

Parte 2 (18): `sin_token`, `categoria_apagada`, `ya_empezo` (por `POST /stretch/events` y por `completed_at`), `plantilla_apagada`, texto editado por el staff (D-12), tope (3 dentro de 6 dias; 2 no bloquean; 3 de hace 7 dias o mas no cuentan), pausa exacta (hace 3/5/9/12 dias) y pausa vencida (15/17/20/23 -> `queued`), reconciliacion `sent` / `failed` / purgada o pending, gimnasio 2 sin modulo (con control positivo prendiendo el modulo), candidato que lanza excepcion, candidato sin rutina, una decision por dia.

Orden de los ticks de dos sedes: los tres instantes salen de UNA fecha base (`localClock(Madrid, D, "20:59")`, `localClock(Madrid, D, "21:00")`, `localClock(Buenos Aires, D, "21:00")`) y el test afirma `t1 < t2 < t3` antes de usarlos. Ningun test depende de la hora real de CI: el reloj va inyectado por parametro y las fechas salen de `lastWeekday` (con `Date.now()`) sin calendario fijo.

## Decisions Made / Decisiones del ejecutor

- El barrido SQL del paso 2 solo decide QUIEN es candidato; la asistencia concreta la elige `findEligibleAttendance` (D-09 y D-15 por construccion, sin duplicar su logica). La ventana se vuelve a chequear sobre esa asistencia: si la clase de fin mas temprano ya salio de la ventana, no se manda push aunque otra clase del dia este dentro (la card igual ofrece).
- Fila de oferta existente con `push_decision` nulo y `arm = control` (solo posible por carrera): se decide `control`.
- Categoria de preferencias: se usa la de la plantilla (`template.category`, hoy `entrenamiento`), igual que `queueNotification`, no un literal.
- `completed_at` en el caso (3b) se escribe por UPDATE directo y no por `POST /stretch/complete`, para no atar este test a `aura_config` (la parte de `started_at` si pasa por `POST /stretch/events`, como pide el plan).
- Sede de Madrid del caso de dos sedes: se crea con codigo unico y queda en la base (como en `notification-class-reminder.test.ts`; `branches` no esta en `TABLES_TO_CLEAN`).
- Los helpers compartidos de la parte 1 y la 2 (`prepareStretchTemplate`, `addDeviceToken`, `stretchPendingRows`, `readStretchOffers`, `insertOfferHistory`) se agregaron a `test/sessions/_stretch-fixtures.ts` en vez de copiarlos en cada archivo (DRY); ese archivo no figuraba en `files_modified` del plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Helpers compartidos en `_stretch-fixtures.ts`**
- **Found during:** Task 2
- **Issue:** las dos suites necesitan los mismos helpers (plantilla, token, cola, historia); copiarlos violaba DRY.
- **Fix:** movidos a `_stretch-fixtures.ts`.
- **Files modified:** `el-templo-api/test/sessions/_stretch-fixtures.ts`
- **Commit:** `0880df06f`

**2. [Alcance] Casos adicionales**
- El plan pedia 16 + 10; se escribieron 16 + 18 (3a/3b, 4b, 5b/5c, 6a/6b, 7a/7b/7c, 9a/9b). El mensaje del commit `3934a67b1` dice "19 casos": son 18 (no se amendo).

Fuera de eso: el plan se ejecuto como estaba escrito.

## Issues Encountered

Dos errores de tipo propios en el test de la parte 1 (llamadas a `seedAttendance`/`seedClass` sin `app`), detectados por `typecheck:tests` y corregidos antes del commit.

## Known Stubs

None.

## Threat Flags

None: no hay endpoint, ruta ni acceso a archivos nuevos; el paso corre dentro de `forEachActiveTenant` con `tenantWhere` en todas las consultas y `templo-training` como primera linea.

## Lecciones para los planes siguientes

- `stretch_offers` ya tiene escritor completo del push: el job escribe `push_decision`, `push_queued_at`, `pending_notification_id`, `push_sent_at`. La consulta de medicion del plan 13 puede tomar de `push_decision` los 11 valores de `StretchPushDecision`; `control`, `sin_token`, etc. no cuentan para el tope (sin `push_queued_at`).
- Los motivos de NO oferta (actividad, otro dia, fuera de ventana, sin rutina, esperando) no crean fila: solo viven en los contadores del resultado del paso.
- Gimnasio 2 en tests con `sessions.day_id` UNIQUE global: separar por nivel (`alfa`) como en `iso-03-stretch.test.ts`.
- Los casos de integracion siguen sin correrse localmente: antes de dar la fase por cerrada, mirar el verde de `stretch-push-timing` y `stretch-push-decisions` en CI.

## Self-Check: PASSED

- `stretch-push.ts`, `stretch-push-timing.test.ts`, `stretch-push-decisions.test.ts`, `_stretch-fixtures.ts`, `notification-cron.ts`: presentes.
- Commits `e7ee1d051`, `0880df06f`, `3934a67b1` presentes en `feat/estiramiento-post-clase`.
