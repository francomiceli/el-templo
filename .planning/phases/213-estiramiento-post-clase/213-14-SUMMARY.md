---
phase: 213-estiramiento-post-clase
plan: 14
subsystem: api
tags: [sessions, stretch, dose, aura, fastify, drizzle]
requires:
  - phase: 213-13
    provides: oferta de estiramiento con player de reloj por ejercicio
provides:
  - dosis por estiramiento congelada en stretch_offers.exercises
  - contrato nuevo de GET /today y POST /complete (sin lados, sin marcado)
  - AURA solo por 180 s medidos por el servidor
affects: [213-15]
tech-stack:
  added: []
  patterns: ["funcion pura de dosis + una sola consulta a exercises para la base ISO"]
key-files:
  created:
    - el-templo-api/src/modules/sessions/stretch-dose.ts
    - el-templo-api/test/sessions/stretch-dose.test.ts
  modified:
    - el-templo-api/src/db/schema/stretch.ts
    - el-templo-api/src/db/migrations/0340_stretch_tables.sql
    - el-templo-api/src/db/migrations/0342_aura_source_stretch.sql
    - el-templo-api/src/modules/sessions/stretch-service.ts
    - el-templo-api/src/modules/sessions/stretch-schemas.ts
    - el-templo-api/src/modules/sessions/stretch-routes.ts
    - el-templo-api/src/modules/sessions/pipeline/utils/mobility-selection.ts
    - el-templo-api/src/modules/notifications/types.ts
    - el-templo-api/test/sessions/_stretch-fixtures.ts
    - el-templo-api/test/sessions/stretch-today.test.ts
    - el-templo-api/test/sessions/stretch-complete.test.ts
    - el-templo-api/test/tenancy/iso-03-stretch.test.ts
key-decisions:
  - "La dosis es la de la plani del dia (primera coincidencia por nombre con dosis util), si no la base 20 s si hay copia ISO o 10 repeticiones"
  - "El marcado desaparece: complete recibe solo { offerId }"
  - "AURA = durationSeconds >= 180, tambien en el reintento de una oferta ya completada"
requirements-completed: [D-05, D-08, SC-2, SC-3]
duration: ~50min
completed: 2026-11-12
---

# Phase 213 Plan 14: Estiramiento con dosis y sin marcado (API) Summary

**Cada estiramiento sale con la dosis de la plani del dia (o la base 20 s ISO / 10 reps), congelada en la oferta, y el cierre es `{ offerId }` con AURA solo por los 3 minutos medidos por el servidor.**

## Commits

| Commit | Titulo |
| ------ | ------ |
| `ad9097b7f` | test(213-14): add failing test for stretch dose (RED) |
| `ebd837482` | feat(213-14): implement stretch dose from the day plan (GREEN) |
| `f4dbfe7b9` | feat(213-14): per-exercise dose in the stretch offer and full video url |
| `55b71e9c9` | fix(213-14): stretch followup push no longer promises 6 minutes |
| `44b21a150` | feat(213-14): close stretch without ticking, AURA only for 180 s |

## Contrato final de las 3 rutas (lo consume el plan 15)

Prefijo `/api/sessions/stretch`. Auth JWT como antes. Sin cambios de rutas ni de metodos.

### GET `/today`

Sin parametros. Respuesta 200:

```json
{
  "status": "none | available | done",
  "localDate": "YYYY-MM-DD",
  "offerId": 123,
  "exercises": [
    {
      "exerciseId": 4180,
      "name": "QUAD STANDING STRETCH",
      "family": "LS",
      "dose": { "unit": "seconds | reps", "value": 30, "max": 50 },
      "videoUrl": "https://<R2_PUBLIC_URL>/exercises/x.mp4"
    }
  ],
  "completedAt": "ISO | null",
  "auraAwarded": false
}
```

- `dose.unit` es `"seconds"` o `"reps"`. `dose.value` entero. `dose.max` entero o `null` (rango "30 a 50"; `null` = valor unico).
- `videoUrl` es URL completa (o `null` si no hay video o falta `R2_PUBLIC_URL`). Ya no es la key cruda de R2.
- Con `status: "none"`: `offerId: null`, `exercises: []`, `completedAt: null`, `auraAwarded: false`.
- YA NO existen: `minutes`, `plannedSeconds`, y por ejercicio `sides`, `secondsPerSide`, `transitionSeconds`. El esquema de respuesta es whitelist: aunque se agregue en el servicio, se poda si no esta declarado.
- Con `status: "done"` los ejercicios se devuelven igual (con dosis).
- 401 / 404 igual que antes.

### POST `/events`

Sin cambios. Body `{ type: "card_seen" | "started" | "push_opened", from?: "card" | "push" }`. `started` reescribe `started_at` en cada ingreso (la medicion de los 180 s cuenta desde el ULTIMO `started`). Respuesta `{ ok: true }`. 404 si no hay oferta del dia (`card_seen`/`started`).

### POST `/complete`

Body: `{ "offerId": <entero >= 1> }` (unica propiedad, requerida). Las propiedades de mas (incluido el viejo `exercisesCompleted`) se podan y NO dan 400; sin `offerId` da 400.

Respuesta 200:

```json
{
  "completedAt": "ISO",
  "durationSeconds": 240,
  "auraAwarded": true,
  "alreadyCompleted": false,
  "minutes": 4
}
```

- `allDone` YA NO existe.
- `durationSeconds`: segundos entre el ultimo `started` y ahora, medidos por el servidor. `null` si nunca hubo `started` (se completa igual, sin AURA).
- `auraAwarded`: `true` solo si `durationSeconds >= 180` y se acredito en esta llamada (o en el reintento de una oferta ya completada cuyo premio habia fallado). Una vez por dia local.
- `alreadyCompleted: true` si la oferta ya estaba cerrada (idempotente).
- `minutes`: `max(1, round(durationSeconds / 60))`. Si `durationSeconds` es `null` cae a `planned_seconds / 60` (dato interno de la regla de seleccion, ver riesgos).
- Errores: 404 `{ error: "No encontramos ese estiramiento" }` (oferta inexistente o de otro socio/gimnasio), 410 `{ error: "Este estiramiento ya venció" }` (oferta de otro dia local), 401.

## Que se hizo

- `stretch-dose.ts`: `dosisDeEstiramiento(nombre, prescripciones, baseEsIso)` y `dosisEnPlani(nombre, prescripciones)`, puras. Constantes base reusadas de `MOBILITY_DEFAULTS` (ahora exportada desde `mobility-selection.ts`).
- `buildRoutine`: la consulta de prescripciones suma `reps, repsMax, seconds, secondsMax` y desempata por `id` ademas de `sort_order`. Para los elegidos sin dosis en la plani hace UNA consulta a `exercises` (con `tenantWhere`, por `UPPER(TRIM(exercise))`, `effort = 'ISO'`); si todos tienen dosis de la plani no la hace.
- `StretchOfferExercise` pasa a `{ exerciseId, name, family, dose }` (se va `sides` del JSON congelado).
- `exercises_completed` fuera del schema Drizzle y del `CREATE TABLE` de la 0340. Comentario de la 0342 actualizado.
- Plantilla `stretch_followup`: "Unos minutos para aflojar lo que trabajaste hoy. Tocá y arrancamos."
- `consultas/20_medicion_4_semanas.sql` NO se toco: ya usa `completed_at` y `aura_awarded`.

## Decisiones del ejecutor

1. **Dosis base ISO por nombre**: la consulta cruza `exercises.exercise` con `UPPER(TRIM())` contra el nombre normalizado, igual que el fallback de video. Cualquier copia ISO del mismo gimnasio alcanza.
2. **Primera coincidencia con dosis util**: si el nombre aparece varias veces en el dia, gana la primera en orden de bloque y `sort_order` (empate por `id`, agregado por mi para que el orden sea determinista).
3. **Segundos antes que repeticiones** en una misma fila (como pide el plan). El rango solo se expone si `max > value`.
4. **Helper extra `dosisEnPlani`** (no estaba en el plan): permite al servicio saber que elegidos no tienen dosis en la plani sin duplicar la logica de coincidencia.
5. **`StretchOfferDose`** (tipo del JSON congelado) vive en `db/schema/stretch.ts` junto a `StretchOfferExercise`.
6. **`planned_seconds` y `stretch_catalog.sides` se quedan** (la regla los sigue usando); `minutes` del cierre sigue existiendo en la respuesta de `/complete`.
7. **Tests y la verificacion `grep` del plan**: la verificacion automatica de la tarea 2 pide que `exercisesCompleted|allDone` no aparezcan en `test/sessions/stretch-*.test.ts`, pero el mismo plan exige dos casos que los nombran a proposito (body viejo con `exercisesCompleted` que se poda, respuesta SIN `allDone`). Priorice los casos. El grep literal solo matchea esas afirmaciones negativas en `stretch-complete.test.ts` (lineas de `(a)`, `(n)`). El resto de los archivos queda limpio.
8. **Casos nuevos en `stretch-complete.test.ts` que no pedia el plan**: umbral exacto 180 s da AURA y 179 s no; contrato de claves de la respuesta; body sin `offerId` da 400.
9. **Fixtures**: `StretchSeedItem` acepta `seconds/secondsMax/reps/repsMax`. Sin ninguno queda el default de siempre (45 s), asi los demas tests no cambian.
10. **Prettier** reformateo los archivos que toque (hook de pre-commit); no hay ESLint en el API, el lint del API es `lint:tenant` (0 discrepancias).

## Verificacion

- Tests puros (`stretch-dose` 18 + `stretch-selection` 43): 61/61 verdes. Se corrieron con una config minima de Vitest en el scratchpad (sin `setupFiles` ni `globalSetup`, no hay MySQL), igual que en 213-02.
- `tsc --noEmit`: los mismos 3 errores de `src/app.ts` de la linea de base, ninguno nuevo.
- `typecheck:tests`: salida identica a la linea de base (20 discrepancias, `diff` vacio) antes de empezar, tras la tarea 1 y tras la tarea 2.
- `lint:tenant`: DISCREPANCIAS 0.
- `stretch-selection.ts` y su test sin diferencias contra `c972f7d7a`.
- Sin `;` en comentarios de las migraciones tocadas (grep del plan).

## Tests que NO se pudieron correr (sin MySQL local)

- `test/sessions/stretch-today.test.ts` (reescrito: casos `(o)` a `(t)` nuevos de dosis, dosis congelada y video con `R2_PUBLIC_URL`).
- `test/sessions/stretch-complete.test.ts` (reescrito).
- `test/tenancy/iso-03-stretch.test.ts` (helper ajustado).
- `test/migrations/0340-stretch.test.ts` (no se modifico; no menciona `exercises_completed`, revisado por grep) y `test/notifications/stretch-push-decisions.test.ts` (no afirman el texto del push, revisado por grep).

Todos validados solo por typecheck. El primer CI los va a correr por primera vez: ver riesgos.

## Deviations from Plan

None - plan executed as written, salvo el helper `dosisEnPlani` y la tension entre el grep y los casos de test (decisiones 4 y 7).

## Riesgos y cosas vistas

- **Tests de integracion sin correr.** Puntos donde mas probable que falle el primer CI: (1) `(q)`/`(r)` de today cambian `effort` de TODAS las copias del catalogo y asumen que los 3 no prescritos de la regla no son `QUAD`/`PIKE`; (2) `(d)` de complete crea un segundo socio con asistencia a la misma clase y mueve el reloj dos veces; (3) `(t)` depende de que `R2_PUBLIC_URL` sea leida por `assembleVideoUrl` en cada llamada (lo es: lee `process.env` en cada invocacion).
- **`minutes` del cierre sin duracion** cae a `planned_seconds / 60`, que sigue calculado con la regla vieja (45 s por lado + 10 s de transicion). Es un valor ficticio en un caso poco comun (complete sin `started`). El plan 15 deberia mostrar "Listo" sin cifra cuando `durationSeconds` sea `null`.
- **Tercera copia de las constantes 20 s / 10 reps**: ya existia una segunda copia local en `pipeline/utils/stretching-selection.ts` (no la toque, fuera de alcance). `stretch-dose.ts` reusa la de `mobility-selection.ts`. Conviene unificarla en otra pasada.
- `stretch-dose.ts` importa `mobility-selection.ts`, que arrastra el schema de Drizzle: el test puro igual corre sin base, solo es una importacion mas pesada.
- La plantilla `stretch_followup` solo se siembra, no se actualiza: si algun gimnasio ya la tuviera sembrada con el texto viejo, no cambiaria. Segun el plan nada llego a staging ni a prod, asi que no aplica.
- Los nombres de la lista curada (`stretch_catalog.exercise_name`) tienen que coincidir con `exercises.exercise` para que la dosis base detecte ISO; si no coinciden cae a 10 repeticiones. En la UAT con datos reales conviene mirar que los ISO de la lista salgan con 20 s.

## Self-Check: PASSED

- Archivos creados existen: `stretch-dose.ts`, `stretch-dose.test.ts`.
- Commits existen: `ad9097b7f`, `ebd837482`, `f4dbfe7b9`, `55b71e9c9`, `44b21a150`.
