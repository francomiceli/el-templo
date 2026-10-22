---
phase: 201-conquer
plan: 07
subsystem: api
tags: [conquer, today, session, steps, history-loader, home]
requires: ["201-06"]
provides:
  - "history-loader.ts: loadMemberContext, loadMarks, loadSessionsBetween, markKey (única puerta de historiales)"
  - "today-service.ts: buildPlanWeek, buildToday, buildHome, computeTodayStep"
  - "session-service.ts: saveSession"
  - "step-service.ts: applyRungChange, changeStep"
  - "GET /api/members/conquer/today, PUT /api/members/conquer/sessions, PUT /api/members/conquer/steps/:exerciseId/:step"
  - "GET /state: member.home (HomeView)"
  - "errors.ts: sendConquerError compartido; timezone.ts: resolveMemberTimezone"
  - "test/conquer/_helpers.ts: insertConquerSession, memberToday, conquerExerciseIds, conquerRungId, readSessionSteps, readConquerSessions, sessionBodyFromToday"
affects: [201-08, 201-09, 201-10, 201-12, 201-17, 201-18]
tech-stack:
  added: []
  patterns: ["upsert + reemplazo de marcas en una tx", "prev_target recalculado sin la sesión que se sobrescribe"]
key-files:
  created:
    - el-templo-api/src/modules/conquer/history-loader.ts
    - el-templo-api/src/modules/conquer/today-service.ts
    - el-templo-api/src/modules/conquer/session-service.ts
    - el-templo-api/src/modules/conquer/step-service.ts
    - el-templo-api/src/modules/conquer/errors.ts
    - el-templo-api/src/modules/conquer/timezone.ts
    - el-templo-api/test/conquer/today-session.test.ts
    - el-templo-api/test/conquer/steps-change.test.ts
    - el-templo-api/test/unit/conquer-today-week.test.ts
  modified:
    - el-templo-api/src/modules/conquer/member-service.ts
    - el-templo-api/src/modules/conquer/activation-service.ts
    - el-templo-api/src/modules/conquer/admin-routes.ts
    - el-templo-api/src/modules/conquer/member-routes.ts
    - el-templo-api/src/modules/conquer/schemas.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/conquer/_helpers.ts
decisions:
  - "Manifiesto y ENTRADAS_BASELINE: 484 -> 487 (+3, templo-module)."
  - "Un día fuera del plan es 400 CONQUER_DIA_INVALIDO tanto en GET /today como en PUT /sessions."
metrics:
  tasks: 3
  commits: 4
---

# Phase 201 Plan 07: Hoy, guardado de sesión y cambio de progresión Summary

Hoy del alumno en el API: día que toca por semana calendario de la sede (D-16), contadores precargados con el objetivo del motor (S12-2, D-18), guardado transaccional con fecha y `prev_target` del servidor (§4.6, §9), cambio de peldaño de un escalón (§4.5) y `member.home` en `/state`.

## Commits

- `feat(201-07): historial único, semana del plan y vista de Hoy (D-16, D-18)`
- `feat(201-07): guardar sesión de Conquer y cambiar progresión (§4.1, §4.5, §9)`
- `test(201-07): Hoy, guardado con prev del servidor y cambio de progresión`
- `docs(201-07): summary del plan 07` (este archivo)

## Contratos JSON (los usa el app en 201-17/18)

### `GET /api/members/conquer/today?day=<dayKey>` -> `TodayResponse`

`day` opcional, patrón `^[a-z_]{1,20}$`. Sin `day`: `nextDayKey`, o el primer día del plan si la semana está completa. Día fuera del plan: 400 `CONQUER_DIA_INVALIDO`.

```json
{
  "weekMonday": "YYYY-MM-DD",
  "plan": [{ "dayKey": "plancha", "label": "Plancha", "done": false }],
  "nextDayKey": "plancha | null",
  "weekComplete": false,
  "date": "YYYY-MM-DD (hoy en la sede)",
  "dayKey": "plancha",
  "label": "Plancha",
  "alreadySaved": false,
  "pain": 0,
  "finisher": "texto",
  "level": "ternero | novillo | toro",
  "exercises": [
    {
      "exerciseId": 1, "code": "planche_press", "name": "Planche press", "unit": "reps | s",
      "rungs": [{ "id": 1, "code": "full", "name": "full", "position": 0, "brazosRectos": true, "unilateral": false }],
      "steps": [
        { "step": "e1 | e2 | e3 | hold", "rungId": 1, "rungName": "tuck", "mode": "completa | negativa | hold",
          "target": 3, "estado": "sin_datos | rango | techo1 | bajo | subir", "value": 3,
          "brazosRectos": true, "unilateral": false }
      ]
    }
  ]
}
```

- `steps` siempre en orden e1, e2, e3, hold. El hold trae `target: null` y `estado: null`; `value` = última marca del hold o 8 (A10).
- `rungs` = peldaños activos de la escalera, por `position` (0 = más difícil), más el peldaño actual de cada escalón si quedó inactivo.
- `alreadySaved: true` -> `value` y `pain` son lo guardado; `target`/`estado` se calculan SIN esa sesión (son los que se mostraron antes de guardar).
- `estado: "subir"` ya viene del motor; el botón Subir lo ofrece 201-08 (aún no existe la ruta).

### `PUT /api/members/conquer/sessions` -> `{ sessionId, date, dayKey, lighting }`

Body (`additionalProperties: false`; claves extra como `date`/`prevTarget` se descartan):

```json
{ "dayKey": "plancha", "pain": 0,
  "exercises": [{ "exerciseId": 1, "e1": 3, "e2": 3, "e3": 3, "hold": 8 }] }
```

`pain` 0-10; valores enteros 0-600 en el schema y, por unidad, 0-100 en e1-e3 de ejercicios de `reps`. Los ejercicios tienen que ser EXACTAMENTE los del día.
Respuesta 200: `{ "sessionId": 9, "date": "YYYY-MM-DD", "dayKey": "plancha", "lighting": { "primary": ["chest", ...], "secondary": ["triceps", ...] } }`.

| Código | Status | Cuándo |
|---|---|---|
| `CONQUER_NO_ACTIVO` | 409 | alumno bloqueado, con pedido o sin nivel/días |
| `CONQUER_DIA_INVALIDO` | 400 | `dayKey` fuera del plan (p. ej. `sabado` en Novillo) |
| `CONQUER_EJERCICIOS_INVALIDOS` | 400 | faltan, sobran, se repiten o son de otro día |
| `CONQUER_VALOR_INVALIDO` | 400 | e1-e3 > 100 en ejercicios de reps (los demás topes los corta el JSON-schema sin `code`) |
| `CONQUER_ESCALON_FALTANTE` | 409 | el alumno no tiene un escalón del plan y no se pudo crear |

### `PUT /api/members/conquer/steps/:exerciseId/:step` -> `TodayStep`

Body `{ "rungId": integer, "mode": "completa | negativa | hold" }`. Devuelve el `TodayStep` recalculado (mismo contrato que arriba).

| Código | Status | Cuándo |
|---|---|---|
| (sin code) | 404 | el alumno no tiene ese escalón (ejercicio fuera de su plan, inexistente o de otro gimnasio) |
| `CONQUER_PELDANO_INVALIDO` | 400 | peldaño de otra escalera, inexistente o inactivo (se tolera si es el que el escalón ya tiene) |
| `CONQUER_MODO_INVALIDO` | 400 | `step === "hold"` con `mode !== "hold"` |

### `GET /api/members/conquer/state` -> `member.home` (solo `activo`)

```json
{ "weekMonday": "YYYY-MM-DD", "plan": [{ "dayKey": "plancha", "label": "Plancha", "done": true }],
  "nextDayKey": "front | null", "weekComplete": false,
  "lastByDay": [{ "dayKey": "plancha", "label": "Plancha", "date": "YYYY-MM-DD | null",
                  "e1": [{ "exerciseName": "Planche hold", "value": 9, "unit": "s" }] }] }
```

`lastByDay` en el orden del plan; `date: null` y `e1: []` si ese día nunca se guardó; `e1` en el orden de los ejercicios del día y solo con los que tienen marca.

## Comportamiento clave

- "Hoy" = `todayInTz(tz de la sede)` calculado en `loadMemberContext` (nunca UTC ni del cliente). `buildPlanWeek` recibe `today` ya resuelto y filtra las sesiones a lunes-domingo de esa semana.
- `loadMarks` ordena por `session_date, created_at, id` (lo que `selectReales` necesita) y acepta `excludeSessionId`. Es la única query de marcas.
- `saveSession`: valida día y ejercicios, calcula `prev_target` de e1-e3 con `nextTarget(selectReales(...))` sobre el historial SIN la sesión que se sobrescribe, copia `rung_id`/`mode` del escalón actual (A1) y escribe en una tx (upsert por UNIQUE tenant+user+fecha+día -> SELECT del id -> DELETE + INSERT de marcas). El upsert toma el lock de la fila: dos guardados simultáneos se serializan (T-201-25).
- `changeStep`: `FOR UPDATE` del escalón primero; si cambia el peldaño llama `applyRungChange` (`since_date = hoy`, E1 -> `calibration = 'pendiente'`); si cambia el modo lo actualiza aparte sin tocar `since_date`.
- `loadMemberContext` crea los escalones faltantes del plan (`ensureStepsForPlan`) en una tx y relee: creación perezosa si cambia la plantilla. Un `GET /state` de un `activo` también puede disparar esa escritura.

## Gates corridos

- Pre-flight `node_modules`: OK.
- `npx tsc --noEmit`: OK tras cada tarea.
- `pnpm lint:tenant`: `DISCREPANCIAS: 0` (el primer intento de Task 1 falló: ver trampas).
- `pnpm typecheck:tests | grep -E "test/(conquer|unit/conquer|migrations/0290)"`: vacío.
- `prettier --check` sobre todos los archivos tocados: OK.
- Higiene (`console.*`, `any`, ids de `users` literales, fechas literales fuera del unitario puro): sin hallazgos.
- Vitest NO se corrió (regla de la fase): los 3 archivos de test y el manifiesto corren en CI.

## Mutantes razonados

Cada mutante se aplicó, se vio el diff y se revirtió con `git checkout -- <ruta>` (`git status` limpio sobre el archivo de producción).

1. `saveSession` sin `excludeSessionId` (pasa `{}`): con historial 5, 5 el motor da 6, y con la marca ya guardada (5, 5, 6) da 7 (verificado con `node` sobre `engine.ts`). Falla `today-session.test.ts:588` (`prevTarget: 6` en el re-guardado). Además mata la variante de edición (el prev cambiaría en cada re-guardado).
2. Precarga del hold = objetivo del motor en vez de `holdPreload` (`preload = nextTarget(...).target` en `computeTodayStep`): falla `today-session.test.ts:225` (`value: 8`, el mutante daría 4/3) y `:318` (`value: 15`, última marca del hold).
3. `today` del contexto = fecha UTC (`new Date().toISOString().slice(0, 10)`): en integración normal pasa desapercibido (la misma fecha UTC y de sede salvo de noche), por eso se agregó el test con reloj en las 23:30 ART (02:30 UTC): falla `today-session.test.ts:811` (`expect(vista.date).toBe(hoy)`) y el `toEqual([hoy])` de sesiones. Más el unitario `conquer-today-week.test.ts` ("de noche en Buenos Aires aún es domingo") para el borde de la semana con `today` inyectado.
4. `applyRungChange` sin `sinceDate: today`: falla `steps-change.test.ts:199` (`expect(fila?.sinceDate).toBe(hoy)`) y el `target 3` tras el cambio con historial 7, 6 (sin el reinicio el objetivo sería 7).
5. (Extra) Calibración siempre `pendiente` en `applyRungChange`: falla `steps-change.test.ts:227` (cambiar E2 deja `resuelta`).
6. (Extra) Sin el chequeo de peldaño inactivo en `changeStep`: falla `steps-change.test.ts:291` (`CONQUER_PELDANO_INVALIDO` hacia un peldaño desactivado).

## Desvíos del plan

- [Rule 3 - bloqueo] Import circular: `member-service` (que ahora llama a `buildHome`) -> `today-service` -> `history-loader` -> `activation-service` -> `member-service` (por `resolveMemberTimezone`). Se movió `resolveMemberTimezone` a `timezone.ts` (nuevo) y `member-service.ts` la re-exporta (`export { ... } from "./timezone"`), así los tests existentes siguen importándola desde `member-service`. `activation-service.ts` ahora importa de `./timezone`.
- [Lección 201-06] `sendConquerError` se movió de `admin-routes.ts` a `errors.ts` (nuevo) y lo usan las rutas del alumno y del admin.
- `home` en `GET /state` se agregó al schema de respuesta en el commit de la Task 1 (no en la Task 2) para que el serializador no lo borre entre commits.
- Se agregó `test/unit/conquer-today-week.test.ts` (el plan lo pedía solo condicionalmente) y un test de integración con reloj corrido (`vi.useFakeTimers({ toFake: ["Date"] })` a las 23:30 ART, fijado antes de loguear).
- Helpers extra en `_helpers.ts` más allá de `insertConquerSession`: `memberToday`, `conquerExerciseIds`, `conquerRungId`, `readSessionSteps`, `readConquerSessions`, `sessionBodyFromToday` y los tipos `TodayBody`/`TodayExerciseBody`/`TodayStepBody`.

Ambigüedades nuevas (opción más simple):

- Alumno sin fila, con `pedido` o con nivel/días nulos: 409 `CONQUER_NO_ACTIVO` en las 3 rutas (no 404/403).
- `changeStep` acepta un peldaño inactivo si es el que el escalón ya tiene (solo cambia el modo); si no, un inactivo es 400.
- E1-E3 de un ejercicio de segundos admiten hasta 600; de reps, hasta 100. El hold siempre hasta 600 (segundos).
- `weekComplete` es `false` si el plan no tiene días (nunca "Semana completa" con plan vacío).
- `PUT /steps` recalcula el `TodayStep` con el historial completo; `value` es siempre el objetivo/precarga (no mira si hay sesión guardada hoy).

## Trampas / notas para los planes siguientes

- `lint:tenant` es por statement: armar las condiciones de un `.where` en un array (`const conditions = [tenantWhere(...)]` + `and(...conditions)`) NO pasa. Poner `tenantWhere(...)` inline dentro de `and(...)`; para una condición opcional usar `cond ? ne(...) : undefined` (`and` descarta `undefined`).
- `loadMemberContext` ya hace `ensureStepsForPlan`: 201-08/09/10 no tienen que crear escalones. `MemberContext` expone `steps` (Map por `markKey`), `catalog`, `settings`, `today`, `member`, `level`, `daysCount`.
- Para recalcular un escalón usar `computeTodayStep(mctx, exercise, stepRow, marks, saved?)` (exportado desde `today-service.ts`) y `applyRungChange(tx, ctx, stepRow, newRungId, today)` de `step-service.ts` para SUBIR/bajar (201-08/09).
- `saveSession` hoy no resuelve calibración ni evalúa alertas: 201-08 agrega `calibration` a la respuesta y 201-09 la evaluación de alertas; deben engancharse DESPUÉS de la tx (con la sesión ya guardada y `mctx` fresco). 201-10 suma los combos al body y a `conquer_sessions` (columnas `combo_*`, `push_*`, `pull_*` ya existen).
- `loadMarks` devuelve TODAS las marcas del alumno (sin filtrar por plan): si el historial crece, el filtro/paginado va en este archivo y en ningún otro.
- `GET /state` ahora es más pesado (contexto + 3 queries de home): si 201-12 le suma `bodyCheck`, hacerlo con una query más, no con otro `loadMemberContext`.
- Test de reloj corrido: `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime` ANTES de `createActiveConquerMember`; `afterEach(vi.useRealTimers)`.
- Manifiesto: 487 entradas tras 201-07.
- Test que desactiva un peldaño: restaurar `isActive` en `afterEach` (lista `desactivados` en `steps-change.test.ts`).

## Known Stubs

Ninguno.

## Self-Check: PASSED

Archivos creados existen (history-loader, today-service, session-service, step-service, errors, timezone, today-session.test, steps-change.test, conquer-today-week.test); commits de las tareas en `git log`.
