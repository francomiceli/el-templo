---
phase: 164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-
plan: 02
subsystem: api
tags: [tv, timer, format-params, contract, vitest, types]

# Dependency graph
requires:
  - phase: 164-01
    provides: "Schema tv (tv_devices, tv_pairings, tv_class_state) + migracion 0189"
provides:
  - "Contrato tipado unico del TV: TimerSpec, TimerFrame, TvPollResponse, TvControlContext, TvStateWrite (15 simbolos)"
  - "toTimerSpec(params): normaliza las ~50 variantes de FormatParams a 4 formas, con cierre exhaustivo never"
  - "phaseAt(elapsedMs, spec): aritmetica pura de fase/ronda/digitos con guard de reloj corrido"
  - "test/tv/__fixtures__/timer-vectors.json: 6 vectores dorados que el kiosco replica en el TV real"
affects:
  [
    164-04 kiosco,
    164-05 poll,
    164-07 selftest,
    164-08 control,
    164-10,
    164-11,
    164-12,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern 5: FormatParams -> TimerSpec normalizado server-side"
    - "Contrato puro sin drizzle/fastify compartido por API, kiosco ES2015 y admin"
    - "Vectores dorados emitidos por el propio test (fixture y codigo no pueden divergir)"

key-files:
  created:
    - el-templo-api/src/modules/tv/types.ts
    - el-templo-api/src/modules/tv/timer-spec.ts
    - el-templo-api/src/modules/tv/timer-phase.ts
    - el-templo-api/test/tv/tv-timer-spec.test.ts
    - el-templo-api/test/tv/tv-timer-phase.test.ts
    - el-templo-api/test/tv/__fixtures__/timer-vectors.json
  modified: []

key-decisions:
  - "La quote NO viaja en el poll: la inlinea el kiosco en build (evita una tercera copia de las frases del PDF)"
  - "El reloj del TV se publica como serverNow + utcOffsetMinutes + dateLabel preformateado (nunca Intl.DateTimeFormat con timeZone: ICU reducida en TVs)"
  - "rom se modela como work_rest con workMs=0 (fase TRABAJO contando hacia adelante), no como countup: conserva descanso pautado y contador de rondas"
  - "Todo spec cuya duracion sanitizada colapsa a cero degrada a countup, lo que ademas impide que phaseAt divida por un ciclo de largo 0"
  - "for_tech, emom_for_time y open_style se mapean segun el RESEARCH (countdown / interval / countdown-o-countup) aunque el plan no los enumeraba"
  - "El frame terminal es identico para todos los kinds que pueden terminar (phase=done, displayMs=0, progress=1), replicando el BLOQUE COMPLETO del mockup"

patterns-established:
  - "Cierre exhaustivo con const _exhaustive: never en toda funcion que consuma FormatParams o TimerSpec"
  - "Muestra por variante tipada como Record<FormatParams['type'], FormatParams> en el test: agregar un formato rompe tambien el test, no solo la implementacion"

requirements-completed: [D-16, D-17, D-18, D-23, D-24]

# Metrics
duration: 11min
completed: 2026-07-24
---

# Phase 164 Plan 02: Contrato del TV + aritmetica del timer Summary

**Contrato tipado del modulo tv (15 simbolos) + `toTimerSpec` exhaustivo sobre las ~50 variantes de `FormatParams` + `phaseAt` puro con guard de reloj corrido, todo cubierto por 43 tests unitarios y exportado como 6 vectores dorados para el selftest del kiosco.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-07-24T21:03:45Z
- **Completed:** 2026-07-24T21:14:41Z
- **Tasks:** 3
- **Files created:** 6

## Accomplishments

- `modules/tv/types.ts`: el contrato que compilan los planes 04/05/08/10/11/12, sin `any`, sin imports de drizzle ni fastify (lo comparte el bundle ES2015 del kiosco) y sin un solo dato de socio (T-164-08 revisado campo por campo).
- `toTimerSpec`: las ~50 variantes del catalogo colapsan a 4 formas con cierre `never` — agregar un formato rompe el build en vez de degradar en silencio un TV de sede. Ademas sanitiza params corruptos escritos por staff: nunca NaN, nunca ms negativos, nunca menos de 1 ronda (T-164-06).
- `phaseAt`: fase/ronda/digitos/progreso para los 4 kinds, con la semantica de display del mockup v8 validado, sin `Date.now()` adentro (el tiempo no viaja por la red) y con el guard de Pitfall 8 (negativo, NaN, Infinity o >24 h colapsan al frame de t=0).
- `timer-vectors.json`: 6 vectores (tabata, emom, on_the_x, amrap, for_time sin cap, rom) con 4-6 samples cada uno, emitidos por el propio test desde las mismas expectativas que acaba de afirmar — el fixture commiteado y el codigo no pueden divergir. Es la unica verificacion automatica que va a correr sobre el hardware del TV (plan 164-07, `?selftest=1`).

## Task Commits

1. **Task 1: Contrato tipado del modulo tv (types.ts)** - `e66645b3` (feat)
2. **Task 2: toTimerSpec — normalizar las ~50 variantes de FormatParams** - `d0d6bd2d` (feat)
3. **Task 3: phaseAt + emision de vectores dorados** - `649fea38` (feat)

## Files Created/Modified

- `el-templo-api/src/modules/tv/types.ts` — Contrato del poll y del control (15 simbolos), con docblocks que citan la decision que justifica cada campo (D-06/D-08/D-09, D-15 + Pitfall 1, D-17, D-18, D-19, D-23, Pattern 6).
- `el-templo-api/src/modules/tv/timer-spec.ts` — `toTimerSpec(params)`: normalizacion Pattern 5 con `switch` exhaustivo y sanitizacion.
- `el-templo-api/src/modules/tv/timer-phase.ts` — `phaseAt(elapsedMs, spec)`: aritmetica pura del timer.
- `el-templo-api/test/tv/tv-timer-spec.test.ts` — 23 tests unitarios puros (sin MySQL), incluida una muestra por variante de la union.
- `el-templo-api/test/tv/tv-timer-phase.test.ts` — 20 tests de bordes exactos + guards + emision del fixture.
- `el-templo-api/test/tv/__fixtures__/timer-vectors.json` — Vectores dorados para el kiosco.

## Decisions Made

- **La quote fuera del poll.** D-06/D-08 piden las frases del PDF, que viven en `session-pdf-builder.ts` (admin). El kiosco las inlinea en build (164-04); publicarlas en el API seria una tercera copia. `grep -ci quote types.ts` = 0 es criterio de aceptacion, no casualidad.
- **`rom` = `work_rest` con `workMs = 0`.** Era el unico mapeo ambiguo del RESEARCH. Con `countup` se perderian el descanso pautado y el contador de rondas, que es justo lo que hace util un sabado ROM (D-23). `phaseAt` interpreta `workMs === 0` como "fase TRABAJO con los digitos contando hacia adelante".
- **Degradar a `countup` cuando la duracion sanitizada da 0.** Un `countdown` de 0 ms mostraria BLOQUE COMPLETO apenas arranca, y un `work_rest` de ciclo 0 haria dividir por cero en `phaseAt`. La degradacion cubre las dos cosas de una.
- **Frame terminal unico.** `phase: "done"`, `displayMs: 0`, `progress: 1`, `finished: true` para work_rest, interval y countdown — es la regla global del mockup (`elapsed >= total` → BLOQUE COMPLETO) y evita 3 estados terminales distintos en el kiosco.
- **`TvTimerStatus` no tiene `"finished"`.** Terminar se deriva del tiempo transcurrido contra el spec (`TimerFrame.finished`), nunca se persiste: un TV que reconecta a mitad de bloque tiene que llegar solo a la misma conclusion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Los comandos `<verify>` del plan apuntaban al checkout compartido**

- **Found during:** Task 1 (y los 3 tasks)
- **Issue:** Los bloques `<automated>` empiezan con `cd /home/franco/projects/el-templo/el-templo-api`, que es el checkout principal (con WIP de otra sesion) y no el worktree de la fase. Correrlos ahi habria typechequeado codigo que no existe en ese arbol y podria haber tocado archivos ajenos.
- **Fix:** Se ejecutaron los mismos comandos con la ruta del worktree (`/home/franco/projects/et-164-tv/el-templo-api`). Ningun cambio de codigo.
- **Files modified:** ninguno
- **Verification:** `npx tsc --noEmit` + `vitest run` verdes en el worktree; `git status --short` limpio.
- **Committed in:** n/a (correccion de procedimiento)

**2. [Rule 2 - Missing Critical] Mapeo explicito de `for_tech`, `emom_for_time` y `open_style`**

- **Found during:** Task 2
- **Issue:** El plan enumeraba las familias pero no estos tres tipos; caer al `countup` por defecto habria dejado sin timer a formatos que SI tienen estructura temporal declarada (`for_tech.minutes`, `emom_for_time.emomMinutes/intervalSeconds`, `open_style.minutes?`).
- **Fix:** `for_tech` → `countdown`, `emom_for_time` → `interval` (misma derivacion que `emom`), `open_style` → `countdown` con minutos u `countup` sin ellos. Es exactamente lo que declara el comentario del `TimerSpec` en el RESEARCH (Pattern 5).
- **Files modified:** `el-templo-api/src/modules/tv/timer-spec.ts`, `el-templo-api/test/tv/tv-timer-spec.test.ts`
- **Verification:** test `maps emom_for_time using emomMinutes as the total` + la muestra por variante.
- **Committed in:** `d0d6bd2d`

**3. [Rule 2 - Missing Critical] Sanitizacion de params corruptos y de specs de duracion cero**

- **Found during:** Task 2
- **Issue:** `format_params` es una columna JSON escrita por staff: un `minutes: null` o un `workSeconds: -20` habrian producido `NaN`/ms negativos en pantalla, y un ciclo de largo 0 habria hecho dividir por cero a `phaseAt` (T-164-06 pide explicitamente que ningun input produzca eso).
- **Fix:** Helpers `sanitizeMs`/`sanitizeRounds` (no finito → 0, nunca negativo, rondas ≥ 1) + degradacion a `countup` cuando la duracion colapsa. `phaseAt` conserva ademas su propio guard defensivo para specs armados a mano.
- **Files modified:** `el-templo-api/src/modules/tv/timer-spec.ts`, `el-templo-api/src/modules/tv/timer-phase.ts`, ambos tests
- **Verification:** test `never produces NaN, negative milliseconds or fewer than 1 round` (6 payloads corruptos) + `degrades to a stopwatch instead of dividing by a zero-length cycle`.
- **Committed in:** `d0d6bd2d`, `649fea38`

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 missing critical)
**Impact on plan:** Ninguna amplia el alcance. Las dos de Rule 2 son mitigaciones que el propio `<threat_model>` del plan asignaba a estos archivos (T-164-06); la de Rule 3 fue de procedimiento (rutas del worktree).

## Issues Encountered

- El `vitest` del API arrastra el setup global que provisiona MySQL, asi que un test unitario puro igual tarda ~60 s en arrancar. No afecta el resultado (43/43 verdes) pero conviene saberlo antes de dudar de una corrida "lenta".

## Known Stubs

Ninguno. Las tres funciones estan completas; lo que falta son sus consumidores (poll, control y kiosco), que son planes posteriores de la fase.

## Threat Flags

Ninguno. El plan no agrega endpoints, rutas ni acceso a datos: son tres archivos puros sin superficie de red. `TvPollResponse` se reviso campo por campo y no expone ningun dato de socio (T-164-08).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- El contrato esta publicado: los planes 04/05/08/10/11/12 pueden compilar contra `modules/tv/types.ts` sin cazar nombres.
- `timer-vectors.json` esta commiteado y listo para que el plan 164-07 lo sirva al kiosco en `?selftest=1`.
- Pendiente de waves siguientes: el calculo de `elapsedMs` a partir de `startedAt`/`pausedAt`/`pausedAccumMs` (D-17) vive en el consumidor, no en `phaseAt` — el plan del poll tiene que implementarlo y testearlo aparte.

## Self-Check: PASSED

- 6/6 archivos declarados existen en disco.
- 3/3 commits de task encontrados en `git log`.
- `npx tsc --noEmit` limpio; `vitest run test/tv/tv-timer-spec.test.ts test/tv/tv-timer-phase.test.ts` → 43 tests verdes.
- `node -e` sobre el fixture → `VECTORS_OK 6`; `grep -c "Date.now()" timer-phase.ts` → 0; `grep -c "_exhaustive: never" timer-spec.ts` → 1.

---

_Phase: 164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-_
_Completed: 2026-07-24_
