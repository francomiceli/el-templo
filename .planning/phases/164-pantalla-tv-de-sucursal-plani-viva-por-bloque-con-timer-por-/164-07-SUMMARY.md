---
phase: 164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-
plan: 07
subsystem: ui
tags: [tv, kiosk, timer, es2015, selftest, golden-vectors, admin]

# Dependency graph
requires:
  - phase: 164-02
    provides: "phaseAt del API (implementacion de referencia cubierta por vitest) + timer-vectors.json"
  - phase: 164-04
    provides: "arbol src/tv/, tsconfig ES2015 y build-tv.mjs (que copia los vectores a /tv/)"
  - phase: 164-06
    provides: "scale.ts (pad2, tvWidth, scaleTv) y el patron de render con createElement/textContent de diag.ts"
provides:
  - "src/tv/timer.ts: phaseAt (port 1:1 del API), elapsedFrom (D-17) y formatDigits — el motor de tiempo del kiosco, puro y sin red"
  - "src/tv/selftest.ts: /tv/?selftest=1 corre los 28 samples de los 6 vectores dorados + 6 casos propios en el televisor real e imprime PASS/FAIL"
  - "TimerClock: el subconjunto de TvTimerState que necesita el calculo de elapsed (entra el objeto del poll sin adaptador)"
affects: [164-11, 164-12, 164-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Port 1:1 con dueño declarado: la implementacion vive en el API (con tests) y el kiosco la copia; la divergencia la detecta el selftest, no la lectura"
    - "Verificacion sobre hardware sin test runner: los vectores que emite vitest se sirven como archivo estatico y los corre la propia pagina"
    - "Funciones puras con el 'ahora' por parametro (nowCorrected): ningun modulo de calculo lee el reloj de pared"

key-files:
  created:
    - el-templo-admin/src/tv/timer.ts
  modified:
    - el-templo-admin/src/tv/selftest.ts

key-decisions:
  - "formatDigits redondea hacia ARRIBA (Math.ceil), igual que el fmt() del mockup v8 validado: en una cuenta regresiva el 00:01 se ve durante todo el ultimo segundo"
  - "pad2 se importa de scale.ts en vez de reimplementarse: su docblock ya se declaraba el unico helper de relleno de src/tv/ (reloj, timer, logger)"
  - "TimerSpec/TimerFrame/TvTimerStatus se duplican en timer.ts (el kiosco no puede importar del backend) y el docblock documenta la duplicacion deliberada"
  - "elapsedFrom nunca devuelve negativo y devuelve 0 ante un estado incompleto (paused sin pausedAt, startedAt null): 0 es el unico valor honesto en una pantalla publica"
  - "El selftest valida la FORMA del JSON bajado: un nginx que devuelva el index.html del SPA con 200 da un mensaje legible en pantalla en vez de un TypeError invisible"
  - "El PASS de la pantalla se verifico corriendo el bundle real de public/tv/index.html sobre un DOM minimo en node (no hay browser ni jsdom instalables sin gate humano)"

patterns-established:
  - "Todo archivo de src/tv/ que sea copia de codigo del API lleva 'port 1:1 de <ruta>' en el docblock: es el string que ata el archivo a su fuente de verdad"
  - "Los casos que el API no puede cubrir (los del consumidor: elapsedFrom, formatDigits) viven como literales dentro del selftest, no como vectores del backend"

requirements-completed: [D-16, D-17, D-18, D-20, D-24]

# Metrics
duration: 9min
completed: 2026-07-24
---

# Phase 164 Plan 07: Motor de timer del kiosco + selftest de vectores dorados Summary

**`timer.ts` como port 1:1 de `phaseAt` del API mas `elapsedFrom` (la pausa que congela y reanuda exacto, D-17) y `formatDigits`, verificados en el televisor real por `/tv/?selftest=1`, que baja los vectores dorados y pinta `PASS 34/34` sin devtools ni herramientas.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-24T22:33:20Z
- **Completed:** 2026-07-24T22:42:00Z
- **Tasks:** 2
- **Files created:** 1 · **modified:** 1

## Accomplishments

- **El tiempo dejo de necesitar la red.** `phaseAt` es la copia linea por linea de `modules/tv/timer-phase.ts`, con los tipos duplicados a proposito (un bundle ES2015 autonomo no puede importar del backend) y un docblock que fija el contrato de mantenimiento: **cualquier cambio va primero al API**, donde estan los tests. Verificado contra los **28 samples de los 6 vectores: 0 divergencias**.
- **La pausa quedo resuelta donde el plan 164-02 la habia dejado pendiente.** `elapsedFrom` implementa D-17: `running` = `nowCorrected - startedAt - pausedAccumMs`, `paused` congelado en `pausedAt - startedAt - pausedAccumMs` (avance el reloj lo que avance), `idle` = 0. Nunca negativo, y `nowCorrected` entra **por parametro** — `grep -c "Date.now()" timer.ts` = 0 no es casualidad: el reloj de pared de un TV de sede puede estar corrido y quien lo corrige es el runtime del poll (Pattern 6).
- **Hay una forma de probar el timer EN el televisor.** `/tv/?selftest=1` baja `timer-vectors.json` (ruta relativa, con cache-buster), corre los 28 samples contra el `phaseAt` del kiosco mas 6 casos propios del consumidor (3 de `elapsedFrom`, 3 de `formatDigits`) y pinta `PASS 34/34` en verde gigante, o `FAIL n/34` en rojo con las primeras 10 fallas en formato `nombre · elapsedMs · esperado vs obtenido`, mas la version del build y el user agent. Alguien en la sede abre la URL, saca una foto y eso es el diagnostico.
- **La ruta de FAIL tambien se probo,** no solo la feliz: con dos samples corrompidos a proposito la pantalla muestra `FAIL 2/34` y lista exactamente los dos casos con lo esperado y lo obtenido.
- **Todo con `textContent`** (T-164-30: por ahi entran el user agent y el contenido de un archivo bajado), sin cancelador de fetch (Chromium 66 > piso D-20) y sin un solo built-in posterior a ES2015 — el tsconfig del kiosco lo verifica en compilacion.

## Task Commits

1. **Task 1: timer.ts — port de phaseAt, elapsedFrom y formatDigits** — `2e0121d0` (feat)
2. **Task 2: selftest.ts — vectores dorados corriendo en el televisor** — `284770bf` (feat)

## Files Created/Modified

- `el-templo-admin/src/tv/timer.ts` — **Nuevo.** Contrato duplicado (`TimerSpec`, `TimerFrame`, `TvTimerStatus`, `TimerClock`) + `phaseAt` (port 1:1, incluido el guard de Pitfall 8 y el cierre exhaustivo `never`) + `elapsedFrom` + `formatDigits`.
- `el-templo-admin/src/tv/selftest.ts` — Stub del plan 164-04 reemplazado por `runSelfTest()`: validacion de la forma del JSON, ejecucion de vectores y casos locales, render PASS/FAIL y resumen por `createTvLogger('selftest')`.

## Decisions Made

- **`formatDigits` redondea hacia arriba.** El `fmt()` del mockup v8 validado hace `Math.ceil` sobre los segundos, asi que la cuenta regresiva muestra `00:01` durante todo el ultimo segundo y `00:00` recien cuando el bloque termino. La contracara conocida: un cronometro libre (ROM, for time) salta a `00:01` apenas arranca. Se prefirio la coherencia con la maqueta aprobada y con el caso dominante (los formatos que cuentan hacia atras); la firma del contrato (`formatDigits(displayMs)`) no lleva la fase, asi que no habia forma de aplicar dos criterios sin cambiarla.
- **`pad2` importado, no reimplementado.** El plan pedia "pad2 propio" (en oposicion al metodo nativo del string, que es ES2017). El helper ya existe en `scale.ts` y su docblock se declara "el reemplazo oficial para todo `src/tv/` (reloj, timer, logger)". Escribir una segunda copia habria contradicho una convencion establecida por el plan anterior — DRY (CLAUDE.md) gana.
- **Duplicacion deliberada de los tipos.** `TimerSpec`/`TimerFrame` se copian de `modules/tv/types.ts` porque el kiosco es un artefacto independiente. Es el mismo trade-off que el `phaseAt`: la red de contencion no es el compilador, es el selftest corriendo en la sede.
- **`TimerClock` como subconjunto estructural de `TvTimerState`.** El objeto `timer` del poll entra tal cual en `elapsedFrom` (sin adaptador) y el selftest puede armar estados a mano sin inventar `spec` ni `soundEnabled`.
- **El selftest valida la forma del JSON antes de correrlo.** Un `/tv/` servido por un nginx mal configurado devuelve el `index.html` del SPA con 200; sin validacion eso seria un `TypeError` invisible en un televisor. Con validacion, la pantalla dice "el archivo de vectores no es una lista".
- **Los casos del consumidor viven en el selftest, no en los vectores del API.** `elapsedFrom` y `formatDigits` no existen del lado del backend: sus 6 casos se afirman con literales dentro de `localCases()`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Los comandos `<verify>` del plan apuntaban al checkout compartido**

- **Found during:** Tasks 1 y 2
- **Issue:** Los bloques `<automated>` arrancan con `cd /home/franco/projects/el-templo/el-templo-admin`, que es el checkout principal (con WIP de otra sesion), no el worktree de la fase. Correrlos ahi habria typechequeado y buildeado codigo que no existe en ese arbol.
- **Fix:** Se ejecutaron los mismos comandos en `/home/franco/projects/et-164-tv/el-templo-admin`. Ademas se uso el `tsc` local (`node_modules/.bin/tsc`) en vez de `npx tsc`, para no darle a `npx` la chance de bajar nada de la red (C-08). Ningun cambio de codigo. (Misma correccion ya documentada en los planes 164-02 y 164-04.)
- **Files modified:** ninguno
- **Verification:** `tsc -p src/tv/tsconfig.tv.json --noEmit` y `node scripts/build-tv.mjs` verdes en el worktree; `git status --short` limpio.
- **Committed in:** n/a (correccion de procedimiento)

**2. [Rule 3 - Blocking] No hay browser para el ultimo criterio de aceptacion del task 2**

- **Found during:** Task 2 (verificacion)
- **Issue:** El criterio pedia abrir `public/tv/index.html?selftest=1` en un browser local. En esta maquina no hay chromium/chrome, ni playwright, ni puppeteer, ni jsdom en ningun `node_modules` del monorepo. Instalar cualquiera de esos es un gate humano bloqueante (C-08) y el plan lo prohibe explicitamente.
- **Fix:** Se escribio un harness efimero (en el scratchpad, **no commiteado**) que extrae el `<script>` inline del `public/tv/index.html` **generado** y lo corre con `node:vm` sobre un DOM minimo (`getElementById`/`createElement`/`appendChild`/`textContent`/`style`) con `location.search = '?selftest=1'` y un `fetch` que sirve el `timer-vectors.json` del build. No es un stub del codigo: corre el artefacto real, con el dispatcher de `main.ts` y el `scaleTv()` incluidos.
- **Files modified:** ninguno
- **Verification:** salida `PASS 34/34` + `HARNESS_OK`, con el fetch pedido a `timer-vectors.json?t=…` y el marco escalado a 1920x1080 / 19.2 px por rem. Variante con 2 samples corrompidos → `FAIL 2/34` con las dos lineas de detalle correctas.
- **Committed in:** n/a (verificacion, sin cambios de codigo)

**3. [Rule 1 - Bug] La palabra `AbortController` en un comentario rompia su propio criterio de aceptacion**

- **Found during:** Task 2
- **Issue:** El docblock explicaba "sin `AbortController` (Chromium 66)", pero el criterio del plan es `grep -c "AbortController" src/tv/selftest.ts` = 0 — que es un grep de texto, no de codigo. El comentario lo daba en 2.
- **Fix:** Se reescribio la explicacion como "el cancelador de fetch es Chromium 66": el motivo queda documentado y el grep da 0. Sin cambios de comportamiento.
- **Files modified:** `el-templo-admin/src/tv/selftest.ts`
- **Verification:** `grep -c "AbortController" src/tv/selftest.ts` → 0.
- **Committed in:** `284770bf`

---

**Total deviations:** 3 auto-fixed (2 blocking de procedimiento, 1 bug de criterio)
**Impact on plan:** Ninguna amplia el alcance ni cambia comportamiento. Dos son de entorno (rutas del worktree, ausencia de browser) y la tercera es cosmetica sobre un comentario.

## Issues Encountered

- **La verificacion en hardware sigue pendiente por definicion.** El harness de node prueba la aritmetica y el render, pero no prueba lo unico que el selftest existe para probar: que un Chromium 53/68 de sede ejecute ese bundle. Eso solo se sabe abriendo `/tv/?selftest=1` en el televisor (UAT de la fase, plan 164-13).
- El bundle inline paso de 13.6 KB a 31.1 KB con `timer.ts` + `selftest.ts` adentro. Sigue siendo un solo request de HTML y no cambia nada del pipeline.

## Known Stubs

Ninguno nuevo. `selftest.ts` deja de ser stub con este plan; los que quedan son los que la fase ya tenia asignados a planes posteriores (`boot.ts` → 164-11).

## Threat Flags

Ninguno. El plan no agrega endpoints, rutas ni acceso a datos. Las mitigaciones que el `<threat_model>` asignaba a estos archivos quedaron verificadas:

| Threat   | Estado                                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| T-164-28 | El selftest corre los 6 vectores del API en el TV: cualquier divergencia del port sale FAIL en pantalla                       |
| T-164-29 | `elapsedFrom` recibe `nowCorrected` por parametro (`grep -c "Date.now()" timer.ts` = 0) + guards de negativo y de mas de 24 h |
| T-164-30 | Render 100% con `textContent` (`grep -c innerHTML` = 0) + validacion de la forma del JSON bajado                              |
| T-164-SC | Cero paquetes instalados; el harness de verificacion usa `node:vm` de la stdlib                                               |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Para el plan 164-11 (runtime del kiosco):** el contrato quedo fijado — `elapsedFrom(timer, nowCorrected)` recibe el objeto `timer` del poll **tal cual** y un `nowCorrected` que el runtime tiene que armar como reloj local + offset del servidor (`serverNow` de cada poll, suavizado). Pasarle el reloj crudo es el bug que Pattern 6 previene; el guard de `phaseAt` lo tapa mostrando 0, o sea que se veria como "el timer no arranca", no como un error.
- **Para el plan 164-12 (control del profe):** `elapsedFrom` no persiste nada — el API sigue siendo el dueño de `pausedAccumMs` (al reanudar tiene que sumarle la pausa que termino, o los digitos saltan hacia adelante).
- **Para el UAT (plan 164-13):** el primer paso en cada televisor de sede deberia ser `/tv/?selftest=1` **antes** de `/tv/?diag=1` — si el PASS no aparece, no tiene sentido mirar nada mas.

## Self-Check: PASSED

- 1/1 archivo creado (`src/tv/timer.ts`) y 1/1 modificado (`src/tv/selftest.ts`) existen en disco con el contenido esperado.
- 2/2 commits de task encontrados en `git log` (`2e0121d0`, `284770bf`); ningun archivo borrado por los commits.
- `tsc -p src/tv/tsconfig.tv.json --noEmit` → exit 0. `eslint` y `prettier --check` limpios sobre los dos archivos.
- `node scripts/build-tv.mjs` → verde, `public/tv/timer-vectors.json` con **6** vectores y el bundle inline contiene la cadena `timer-vectors.json`.
- Greps de aceptacion: `padStart` en timer.ts = 0 · `Date.now()` en timer.ts = 0 · `port 1:1` en timer.ts = 2 · `innerHTML` en selftest.ts = 0 · `AbortController` en selftest.ts = 0 · los 3 exports (`phaseAt`, `elapsedFrom`, `formatDigits`) presentes.
- Bundle real corrido sobre DOM minimo con `?selftest=1` → `PASS 34/34` (28 samples de vectores + 6 casos locales); variante corrompida → `FAIL 2/34` con el detalle correcto.

---

_Phase: 164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-_
_Completed: 2026-07-24_
