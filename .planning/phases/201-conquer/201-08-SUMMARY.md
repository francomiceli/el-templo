---
phase: 201-conquer
plan: 08
subsystem: api
tags: [conquer, progress, subir, calibration, alerts, tope]
requires: ["201-07"]
provides:
  - "progress-service.ts: buildProgress (reusable desde la ficha del admin, recibe userId)"
  - "calibration-service.ts: calibrationProposals, resolveCalibration, planExercises"
  - "alerts-service.ts: upsertEventAlert, autoResolveEventAlert"
  - "step-service.ts: findSubir, subirStep, emitTopeAlert, topeDedupeKey, lockStep (exportado), COUNTED_STEPS"
  - "catalog-service.ts: neighborRung (peldaño activo más difícil / más fácil)"
  - "GET /api/members/conquer/progress"
  - "POST /api/members/conquer/steps/:exerciseId/:step/subir"
  - "POST /api/members/conquer/calibration/:exerciseId"
  - "PUT /sessions: calibration en la respuesta + alerta de tope + cierre de calibración"
  - "test/conquer/_helpers.ts: fetchToday, saveTodaySession, putSessionRaw, fetchProgress, getProgressRaw, postSubir, postCalibration, weeksAgo, readConquerAlerts"
affects: [201-09, 201-11, 201-17, 201-19]
tech-stack:
  added: []
  patterns: ["upsert idempotente con ON DUPLICATE KEY UPDATE", "historial en memoria + marcas de hoy dentro de la tx"]
key-files:
  created:
    - el-templo-api/src/modules/conquer/alerts-service.ts
    - el-templo-api/src/modules/conquer/calibration-service.ts
    - el-templo-api/src/modules/conquer/progress-service.ts
    - el-templo-api/test/conquer/subir.test.ts
    - el-templo-api/test/conquer/calibration.test.ts
    - el-templo-api/test/conquer/progress.test.ts
  modified:
    - el-templo-api/src/modules/conquer/catalog-service.ts
    - el-templo-api/src/modules/conquer/step-service.ts
    - el-templo-api/src/modules/conquer/session-service.ts
    - el-templo-api/src/modules/conquer/schemas.ts
    - el-templo-api/src/modules/conquer/member-routes.ts
    - el-templo-api/test/conquer/_helpers.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
decisions:
  - "Manifiesto y ENTRADAS_BASELINE: 487 -> 490 (+3, templo-module)."
  - "subirStep y resolveCalibration devuelven void; la ruta responde con buildProgress (evita imports circulares)."
metrics:
  tasks: 3
  commits: 4
---

# Phase 201 Plan 08: Subir, calibración y Progreso Summary

Progreso del alumno con "Hoy toca subir" (A3), botón Subir sin aprobación del coach (S12-5), calibración de la semana 1 que mueve el ejercicio entero (S12-4, A5), figura de la semana (D-13 b) y alerta de tope de escalera con dedupe y auto-resolución (A2, T-201-28).

## Commits

- `feat(201-08): progreso, calibración y alertas por evento de Conquer`
- `feat(201-08): botón Subir, calibración de la semana 1 y Progreso (S12-4, S12-5)`
- `fix(201-08): el upsert de alertas no puede leer el status ya reabierto`
- `test(201-08): Subir con 6-7-8-8, tope, calibración y Progreso`
- `docs(201-08): summary del plan 08` (este archivo)

## Contratos JSON (los usan 201-17/19 y la ficha 201-11)

### `ProgressResponse` (`GET /progress`, y respuesta de los dos POST)

```json
{
  "sessionsCount": 4,
  "accuracy": { "n": 3, "hits": 2, "pct": 67, "delta": -0.7 },
  "weekLighting": { "primary": ["chest", "deltoids"], "secondary": ["forearm"] },
  "subir": [
    { "exerciseId": 2, "exerciseName": "Planche press", "step": "e1",
      "fromRungName": "tuck", "toRungName": "adv tuck | null (tope)" }
  ],
  "calibrations": [
    { "exerciseId": 4, "exerciseName": "Front lever hold", "proposal": "subir | quedarse | bajar",
      "fromRungName": "full", "toRungName": "half lay | null" }
  ],
  "days": [
    { "dayKey": "plancha", "label": "Plancha", "sessionsCount": 2,
      "exercises": [
        { "exerciseId": 1, "name": "Planche hold", "unit": "reps | s", "e1Curve": [4, 5, 6],
          "steps": [
            { "step": "e1 | e2 | e3 | hold", "rungId": 1, "rungName": "tuck", "mode": "completa | negativa | hold",
              "last": 6, "target": 7, "estado": "sin_datos | rango | techo1 | bajo | subir | null" }
          ] }
      ] }
  ]
}
```

- `accuracy`: sobre TODAS las marcas con `prev_target` (A8), sin importar el cambio de peldaño; `pct`/`delta` `null` si `n = 0`. `delta` con 1 decimal.
- `weekLighting`: lunes-domingo de la semana en curso en la sede; cada sesión-ejercicio con E1-E3 > 0 cuenta como 3 series; sin números.
- `subir`: uno por ejercicio del plan (el primer escalón en `subir`, e1 > e2 > e3). `toRungName: null` = tope: sin botón, el coach ya está avisado.
- `calibrations`: ejercicios del plan con E1 `pendiente` y una sola marca desde el último cambio. Las `quedarse` se marcan `resuelta` al guardar la sesión, así que solo aparecen en la respuesta del PUT.
- `days`: solo días del plan; `steps` siempre en orden e1, e2, e3, hold. `last` y `e1Curve` cuentan desde el último cambio de peldaño. El hold trae `target: null`, `estado: null`.

### `PUT /sessions` (agrega `calibration`)

`{ sessionId, date, dayKey, lighting, calibration: CalibrationProposal[] }`. `calibration` trae solo los ejercicios del día (incluye las `quedarse`). Orden = orden del plan.

### `POST /steps/:exerciseId/:step/subir` (step `e1|e2|e3`, sin body) -> `ProgressResponse`

| Código | Status | Cuándo |
|---|---|---|
| (sin code) | 404 | el alumno no tiene ese escalón (fuera de su plan, inexistente, otro gimnasio) |
| `CONQUER_NO_TOCA_SUBIR` | 409 | el escalón no es el que `pickSubir` elige o no está en `subir` |
| `CONQUER_TOPE_ESCALERA` | 409 | no hay peldaño más difícil activo (además deja la alerta `tope_escalera`) |
| `CONQUER_NO_ACTIVO` | 409 | alumno sin Conquer activo |
| (sin code) | 400 | `hold` o id inválido |

### `POST /calibration/:exerciseId` body `{ "accept": boolean }` -> `ProgressResponse`

| Código | Status | Cuándo |
|---|---|---|
| (sin code) | 404 | el alumno no tiene el ejercicio |
| `CONQUER_SIN_CALIBRACION` | 409 | no hay propuesta `subir`/`bajar` pendiente (incluye "quedarse" y el segundo POST) |
| `CONQUER_TOPE_ESCALERA` | 409 | aceptar y el E1 no se puede mover en esa dirección |
| (sin code) | 400 | body inválido |

Aceptar: los 4 escalones (e1, e2, e3, hold) se mueven un peldaño ACTIVO en la dirección propuesta, `since_date = hoy`; los que ya están en el extremo de su escalera no se mueven. El E1 queda `pendiente`. Rechazar: E1 `resuelta`, nada se mueve.

## Alertas de tope (`tope_escalera`)

`dedupe_key = tope:<exerciseId>:<step>:<rungId>`, `detail = { exerciseId, exerciseName, step, rungName }`. Se emite desde `POST .../subir` (fuera de transacción, para sobrevivir al 409) y desde `PUT /sessions` (cada escalón e1-e3 en `subir` sin peldaño más difícil). Si el escalón está en el tope y deja de estar en `subir`, el guardado la auto-resuelve (`resuelta`, `resolved_by NULL`). El upsert reabre solo las auto-resueltas; una cerrada por el coach (`resolved_by` no nulo) no se reabre.

## Gates corridos

- Pre-flight `node_modules`: OK.
- `npx tsc --noEmit`: OK tras cada tarea.
- `pnpm lint:tenant`: `DISCREPANCIAS: 0` tras cada tarea.
- `pnpm typecheck:tests | grep -E "test/(conquer|unit/conquer|migrations/0290)"`: vacío.
- `node --no-warnings test/conquer/oracle-check.mjs`: SEMILLA OK, MOTOR OK (14785 casos), REGLAS OK.
- `prettier --check` sobre todo lo tocado: OK.
- Higiene (`console.*`, `any`, fechas literales, ids de `users` literales) y los `verify` automáticos de las 3 tareas: OK.
- SQL del upsert de alertas inspeccionado con `toSQL()` de Drizzle (sin base): el SET sale `detail`, `status`, `resolved_at`.
- Vitest NO se corrió (regla de la fase): `subir.test.ts`, `calibration.test.ts`, `progress.test.ts` y el manifiesto corren en CI.

## Mutantes razonados

Cada mutante se aplicó, se vio el diff, compiló (`tsc`) y se revirtió con `git checkout -- <ruta>`; los archivos de producción quedaron limpios.

1. `findSubir` con `"easier"` en vez de `"harder"` (el plan decía `subirStep` con `easierPosition`; ambos comparten `findSubir`): falla `subir.test.ts:129` (`toRungName: "adv tuck"` daría `lean`) y `:157` (`rungCode: "adv_tuck"`).
2. `findSubir` que elige el ÚLTIMO escalón en `subir` en vez del primero (equivalente a listar mal el A3): falla `subir.test.ts:195` (`[pressId, "e1"]` daría `e2`) y `:200` (subir e2 respondería 200, no 409).
3. `planMoves` que mueve solo el E1: falla `calibration.test.ts:238` (`planche_press:e2` tiene que quedar en `adv_tuck`, `e3` y `hold` en `tuck`) y, en las dos filas de "aceptar bajar", el mismo `toMatchObject` por escalón.
4. `buildAccuracy` sobre marcas desde el último cambio (`selectReales` por escalón): el test cambia el peldaño DESPUÉS de las marcas, así que `n` daría 0 y `pct` `null`: falla `progress.test.ts:131` (`{ n: 3, hits: 2, pct: 67, delta: -0.7 }`).
5. `upsertEventAlert` reabriendo también las cerradas por el coach (sin `resolved_by IS NULL`): falla `subir.test.ts:370` (la alerta del coach tiene que seguir `resuelta` con `resolvedBy: admin.id`).
6. `loadWeekLighting` sin el filtro lunes-domingo: la sesión de front de la semana pasada enciende `upper-back`; falla `progress.test.ts:284` y el `toEqual` anterior de `weekLighting`.
7. `syncTopeAlerts` sin la rama de auto-resolución: falla `subir.test.ts:340` (`status: "resuelta"` tras re-guardar con 5 s).

## Desvíos del plan

- [Rule 1 - Bug] `upsertEventAlert`: Drizzle arma el `SET` del `ON DUPLICATE KEY UPDATE` en el ORDEN DE LAS COLUMNAS DE LA TABLA (no el del objeto), así que `status` se asignaba antes que `resolved_at` y MySQL deja que la segunda asignación vea la primera: `resolved_at` nunca se limpiaba al reabrir. Corregido para que `resolved_at` dependa solo de `resolved_by` (commit `fix(201-08)`).
- `subirStep` y `resolveCalibration` devuelven `void` y las rutas responden con `buildProgress` (el contrato decía `Promise<ProgressResponse>`). Devolver `ProgressResponse` desde esos servicios obligaba a un import circular (`progress-service` -> `calibration-service` -> `progress-service`). El contrato HTTP no cambia.
- `neighborRung` (peldaño activo más difícil/fácil) vive en `catalog-service.ts` (no estaba en `files_modified`): lo usan `step-service`, `calibration-service` y `session-service`, y ponerlo en cualquiera de los dos primeros generaba ciclos.
- `findSubir`, `emitTopeAlert`, `topeDedupeKey` y `lockStep` (ahora exportado) en `step-service.ts`; `planExercises` en `calibration-service.ts`: helpers compartidos por progreso, guardado y rutas.
- `test/conquer/_helpers.ts` ampliado (no estaba en `files_modified`) para no repetir en 3 archivos los wrappers de `today`/`PUT sessions`/`progress`/`subir`/`calibration`.
- `progress-service.ts` no importa `pickSubir` directamente: lo hace `findSubir` en `step-service.ts` (hay un comentario con el nombre para el `grep` del plan).
- Las altas de la alerta de tope y el cierre de calibración van dentro de la misma transacción del guardado, usando las marcas del servidor en memoria (`withSessionMarks`) en vez de volver a leer la base.

Ambigüedades nuevas (opción más simple):

- `sessionsCount` (total) cuenta TODAS las sesiones del alumno, incluso las de días que ya no están en su plan; `days[].sessionsCount` solo las de cada día del plan.
- `calibration` en la respuesta del PUT incluye las propuestas `quedarse` (el app las puede mostrar como "te quedás en X"), pero al re-guardar el mismo día ya no aparecen porque el E1 quedó `resuelta`.
- El ejercicio fuera del plan (o inexistente) en `POST /calibration` es 404; un ejercicio del plan sin propuesta es 409 `CONQUER_SIN_CALIBRACION`.
- Bajar sin peldaño más fácil en el E1 también responde `CONQUER_TOPE_ESCALERA` (mensaje distinto).
- `GET /progress` y los POST no crean escalones nuevos: ya lo hace `loadMemberContext`.
- Fastify con `removeAdditional` descarta claves extra del body (`{ accept: true, rungId: 1 }` no es 400): no hay test de "campo extra".

## Trampas / notas para los planes siguientes

- Drizzle `onDuplicateKeyUpdate({ set })`: el orden del SET sale del orden de columnas de la tabla. Ninguna asignación puede depender del valor ya actualizado de otra columna.
- `lint:tenant` pasó con el `sql` del upsert (INSERT con `tenantValues`) sin necesidad de comentario `tenant-safe`.
- 201-09: `alerts-service.ts` ya tiene `upsertEventAlert`/`autoResolveEventAlert` (tipos `molestia | caida | tope_escalera | paso_nivel`); ampliarlo ahí. La evaluación de alertas del guardado se engancha DESPUÉS de la tx como pedía 201-07, pero el tope ya se emite DENTRO de la tx (`syncTopeAlerts`).
- 201-11: `buildProgress(db, ctx, userId)` es reusable tal cual para la ficha; hace 1 `loadMemberContext` + 3 queries fijas.
- 201-17/19: el app pinta `subir`/`calibrations`/`days` sin recalcular; el botón Subir va solo si `toRungName !== null`.
- `saveTodaySession(app, token, { day, edits })` en `_helpers.ts` es el atajo para "guardar hoy" en tests; `weeksAgo(hoy, n)` da lunes de hace n semanas (siempre < hoy con n >= 1).
- Manifiesto: 490 entradas tras 201-08.

## Known Stubs

Ninguno.

## Self-Check: PASSED

Archivos creados existen (alerts-service, calibration-service, progress-service, subir.test, calibration.test, progress.test); commits de las tareas en `git log`.
