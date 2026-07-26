---
phase: 164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-
plan: 11
subsystem: ui
tags: [tv, kiosk, poll, pairing, render, timer, video, webaudio, es2015, admin]

# Dependency graph
requires:
  - phase: 164-04
    provides: "arbol src/tv/, build-tv.mjs, tsconfig es2015, boot(quotes) e ids del esqueleto"
  - phase: 164-06
    provides: "CSS Chromium-53, scaleTv/pad2, tvApiBase() y el markup de pairing/reposo/cierre"
  - phase: 164-07
    provides: "timer.ts (phaseAt / elapsedFrom / formatDigits) y el selftest de vectores dorados"
  - phase: 164-08
    provides: "GET /api/tv/state (no-store) + POST /api/tv/client-log"
  - phase: 164-03
    provides: "POST /pair/start + GET /pair/status (RFC 8628) y el 401 del device token revocado"
provides:
  - "src/tv/poll.ts: vinculacion, ciclo de poll, reloj corregido, telemetria y actualizacion por version"
  - "src/tv/render.ts: render idempotente de las 4 pantallas + tick de reloj y de timer"
  - "src/tv/audio.ts: beeps WebAudio opcionales con un unico AudioContext perezoso"
  - "src/tv/boot.ts: los tres unicos temporizadores del kiosco + window.onerror -> client-log"
  - "El kiosco /tv/ COMPLETO: es la pantalla que ven los socios"
affects: [164-12, 164-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Render idempotente por firma: se compara contra lo ultimo pintado y solo se escribe lo que cambio"
    - "Runtime de red sin DOM (poll.ts) + render sin red (render.ts), cableados por boot.ts"
    - "Tres setInterval fijos y ningun setTimeout encadenado: la forma de sobrevivir 14 h prendido"
    - "El poll fallido NO toca el estado en memoria: la pantalla no parpadea y el timer sigue local"
    - "Verificacion del artefacto real (bundle inline) sobre un DOM stub con node:vm, sin browser"

key-files:
  created:
    - el-templo-admin/src/tv/poll.ts
    - el-templo-admin/src/tv/render.ts
    - el-templo-admin/src/tv/audio.ts
  modified:
    - el-templo-admin/src/tv/boot.ts
    - el-templo-admin/src/tv/index.html
    - el-templo-admin/src/tv/styles.css

key-decisions:
  - "El poll REUSA tvApiBase() de diag.ts en vez de escribir una segunda resolucion de la base del API (nota explicita del plan 164-06)"
  - "Tercera clave de localStorage (tv.userCode): sin ella, un corte de luz antes de que el staff reclame el TV deja la pantalla de vinculacion en blanco"
  - "El pairing pollea sobre el MISMO intervalo de 2.5 s del estado en vez de crear un cuarto temporizador de 3 s"
  - "El offset de reloj es media movil de 5 muestras, con realineado inmediato si el salto supera 5 s (NTP / horario de verano)"
  - "Un solo pedido de red en vuelo: con wifi lento los polls se apilarian y el ultimo en llegar mandaria"
  - "Los simbolos de nivel que vienen dentro de listHeader se re-envuelven en span.glyph (y el de kairos en el span que dibuja el CSS): pintarlos como texto plano da tofu"
  - "El header del timer se deriva del ` · ` del title: el payload no publica el formato como campo aparte"
  - "countdown (amrap / time cap / death by) se rotula TRABAJO + 'TIEMPO RESTANTE': el spec normalizado no distingue cual de los tres es"
  - "La frase de reposo/cierre se elige por el reloj corregido (no al azar): todos los TVs de la sede muestran la misma"
  - "El primer frame de una fase nunca suena: un TV que se reconecta en medio de una ronda no tiene que pegar un grito"

patterns-established:
  - "Todo nodo que el render actualiza vive en index.html; el render solo crea items de lista, dots y tramos de frase, y solo cuando su contenido cambia"
  - "byId() devuelve un nodo suelto si el id falta: en un televisor es preferible un dato de menos que una excepcion que corta el render entero"
  - "Las funciones que dibujan reciben el frame ya calculado: phaseAt se llama UNA vez por tick"

requirements-completed: [D-04, D-06, D-08, D-09, D-16, D-17, D-19, D-20, D-22]

# Metrics
duration: 31min
completed: 2026-07-24
---

# Phase 164 Plan 11: El kiosco funcionando Summary

**El televisor de una sede ya se vincula solo con un codigo estilo Netflix, pollea su estado cada 2.5 s con el reloj corregido contra el servidor, dibuja la plani viva del bloque con el timer contando localmente —aunque se caiga el wifi—, muestra reloj gigante y frase del PDF fuera de clase, y se actualiza solo cuando nadie esta entrenando.**

## Performance

- **Duration:** 31 min
- **Started:** 2026-07-24T23:20:00Z
- **Completed:** 2026-07-24T23:51:00Z
- **Tasks:** 3
- **Files created:** 3 · **modified:** 3

## Accomplishments

- **Las cuatro pantallas existen y se probaron corriendo.** No sobre stubs del codigo: sobre el `public/tv/index.html` **generado**, ejecutado con `node:vm` sobre un DOM minimo — **64 verificaciones, todas en verde**, cubriendo vinculacion → clase → wifi caido → version nueva → reposo → cierre → ejercicio sin video → revocacion (401) → payload roto → pausa/LISTOS/lista compacta/glifo de kairos.
- **La vinculacion es la de un aparato sin teclado.** Sin token, el TV pide el par RFC 8628, muestra `K7M 2QX` (agrupado de a 3 para leerlo desde el mostrador) y pollea el estado del pairing; cuando el staff lo reclama desde el admin, guarda el token y entra en operacion sin que nadie toque el televisor. Un `401` posterior significa "me revocaron" (D-03): borra el token y vuelve solo a la pantalla del codigo.
- **El wifi caido dejo de ser un problema de pantalla.** Un poll fallido no toca el estado en memoria: el timer sigue corriendo con el ultimo estado conocido, la pantalla no parpadea y el primer poll bueno realinea todo (T-164-49). Verificado: con la red cortada la pantalla sigue siendo la de clase y los digitos siguen bajando.
- **El tiempo no viaja por la red y ademas no depende del reloj del TV.** `serverNow` de cada poll alimenta un offset **suavizado** (media movil de 5 muestras, con realineado inmediato si el salto supera 5 s): sin ese suavizado la latencia variable haria saltar los digitos hacia adelante y hacia atras varias veces por minuto. Todo el kiosco lee la hora por `nowCorrected()`.
- **El reloj de la sede se arma sin la ICU del televisor.** `ahora + utcOffsetMinutes` leido con `getUTCHours/Minutes/Seconds`: el segundero en oro —el pedido #1 de los socios, 6 de 42 sugerencias— corre en Mar del Plata y en Barcelona con la misma linea de codigo y sin depender del formateo por zona horaria, que en un webOS puede venir recortado.
- **El render no reconstruye el DOM.** Cada bloque compara contra lo ultimo pintado (por rol de bloque, nivel, indice de ejercicio y firma de la lista) y sale temprano. Probado explicitamente: tras un tick de 250 ms **el nodo del primer item de la lista es el mismo objeto** y el `<video>` no se recargo. Es la diferencia entre un televisor que aguanta 14 horas y uno que se pone lento a media tarde (Pitfall 13).
- **La actualizacion llega sola pero nunca en el peor momento.** Con una version nueva publicada durante un bloque, el kiosco la detecta y **no** recarga; al pasar a reposo, recarga. Mismo momento seguro para el reciclado preventivo por uptime de 12 h (D-22).
- **El bundle sigue siendo apto para un motor de 2016.** `tsc` con `lib: es2015` limpio, y el HTML generado (43.9 KB, un solo request) no contiene `padStart(`, `Object.entries(`, `Object.fromEntries(`, `new ResizeObserver` ni `new AbortController`. `/tv/?selftest=1` sigue en **PASS 34/34** con el bundle nuevo.

## Task Commits

1. **Task 1: poll.ts — vinculacion, ciclo de poll, offset de reloj y auto-actualizacion** — `807b0262` (feat)
2. **Task 2: render.ts + audio.ts — pantalla de clase, tick del timer, video y beeps** — `1a4dc277` (feat)
3. **Task 3: boot.ts — los tres tiempos del kiosco y el reporte de errores** — `174e63a9` (feat)

## Files Created/Modified

- `el-templo-admin/src/tv/poll.ts` — **Nuevo.** Contrato duplicado de `TvPollResponse` (armado sobre `TimerClock` de `timer.ts` para no escribir por tercera vez los campos de la pausa), `ensureDevice`/pairing, `pollTick`, `nowCorrected`, `currentScreen`, `checkVersion`, `reportClientError` y `startPolling`. No toca el DOM.
- `el-templo-admin/src/tv/render.ts` — **Nuevo.** `renderState` (idempotente), `renderPairing`, `tickClock`, `tickTimer`, `setQuotes`. Todo con `textContent`/`createElement`; cache de nodos resuelta una sola vez.
- `el-templo-admin/src/tv/audio.ts` — **Nuevo.** `beep(kind, enabled)` con un `AudioContext` unico y perezoso (o el prefijado `webkitAudioContext`), todo envuelto en try/catch: sin audio el kiosco funciona igual.
- `el-templo-admin/src/tv/boot.ts` — Stub reemplazado: cablea el runtime con el render, crea los **tres** intervalos y engancha `window.onerror` al `client-log`.
- `el-templo-admin/src/tv/index.html` — Se agrego el placeholder del video (`#videoVacio`) dentro de la caja de la columna derecha.
- `el-templo-admin/src/tv/styles.css` — Estilos de ese placeholder (tapa el `<video>`, no lo reemplaza: el elemento sigue siendo uno solo).

## Decisions Made

- **`tvApiBase()` se importa de `diag.ts`.** El plan pedia "resolver la base del API y documentar la eleccion"; el plan 164-06 ya la habia escrito y dejo la nota de reusarla. Dos criterios distintos para armar la URL es como se rompe un kiosco en una sede y no en la maquina del que programa.
- **Tercera clave de `localStorage`: `tv.userCode`.** `GET /pair/status` no devuelve el codigo visible, asi que persistirlo es la unica forma de que un TV que se reinicia antes de ser reclamado siga mostrando **el mismo** codigo (ver desviacion 2). No es un secreto: es lo que se ve en la pared.
- **El pairing corre sobre el intervalo del poll.** 2.5 s en vez de los 3 s del plan, a cambio de no crear un cuarto temporizador. El criterio de aceptacion del task 3 exige exactamente tres, y Pitfall 13 empuja en la misma direccion.
- **Un solo pedido en vuelo.** Con el wifi de una sede lento, dos polls superpuestos hacen que mande el que llega ultimo, que puede ser el mas viejo. `inFlight` lo evita sin cancelador de fetch (Chromium 66 > piso).
- **`countdown` se rotula `TRABAJO` + `TIEMPO RESTANTE`.** El spec normalizado colapsa amrap, time cap, death by y for_tech en una sola forma: el kiosco no puede saber cual es, y el titulo del bloque (`DEUTEROS II · AMRAP 12'`) ya lo dice arriba.
- **El header del timer se deriva del titulo.** El payload manda `title = "ROL · FORMATO"` y no publica el formato aparte; se corta por el ultimo `·`. Un INITIUM con titulo propio de juego cae al titulo entero, que es lo correcto para ese caso.
- **La frase rota por reloj, no al azar.** `floor(nowCorrected / 60000) % quotes.length`: dos televisores de la misma sede muestran siempre la misma frase (D-04), y ninguna cambia a mitad de tick.
- **El primer frame de una fase nunca suena.** La cadena de beeps se arranca recien en el segundo cambio y se reinicia al cambiar de bloque o al detener el timer: un TV que se reconecta en medio de una ronda no tiene que pegar un grito.
- **`byId()` degrada a un nodo suelto** si un id falta (con `warn` en el buffer del logger). En un televisor colgado en la pared, un dato de menos es mejor que una excepcion que corta el render entero.
- **Los nodos del reloj se construyen una vez** (nodo de texto + span del segundero) en vez de reusar los de la plantilla: asi el render no depende de como quede el espaciado del HTML al formatearlo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Los comandos `<verify>` del plan apuntaban al checkout compartido**

- **Found during:** los 3 tasks
- **Issue:** Los bloques `<automated>` arrancan con `cd /home/franco/projects/el-templo/el-templo-admin`, que es el checkout principal (con WIP de otra sesion), no el worktree de la fase. Identico a lo ya documentado en 164-02/04/06/07/08.
- **Fix:** Los mismos comandos corridos en `/home/franco/projects/et-164-tv/el-templo-admin`, y con el `tsc` local (`./node_modules/.bin/tsc`) en vez de `npx` para no darle a `npx` la chance de bajar nada (C-08).
- **Files modified:** ninguno
- **Verification:** typecheck, build, gates, lint y prettier verdes en el worktree; el checkout principal intacto.
- **Committed in:** n/a (correccion de procedimiento)

**2. [Rule 1 - Bug] Sin persistir el `userCode`, un reinicio dejaba la pantalla de vinculacion en blanco**

- **Found during:** Task 1
- **Issue:** El plan fija dos claves de `localStorage` (`tv.deviceToken`, `tv.deviceCode`). Pero `GET /pair/status` devuelve `pending` **sin** el `userCode`: si el TV se reinicia (corte de luz, alguien lo apaga) mientras el pairing sigue sin reclamar, el kiosco conserva el secreto pero **no tiene que mostrar** — pantalla de vinculacion vacia, y el codigo que el staff ya habia anotado deja de existir.
- **Fix:** Tercera clave `tv.userCode`. La alternativa (pedir un pairing nuevo en cada arranque) cambia el codigo de la pantalla en cada reinicio y deja filas de pairing colgadas para siempre (los `user_code` no expiran, D-02).
- **Files modified:** `el-templo-admin/src/tv/poll.ts`
- **Verification:** el harness afirma `tv.userCode === 'K7M2QX'` tras el `pair/start`, y que se borra al vincular y al revocar.
- **Committed in:** `807b0262`

**3. [Rule 2 - Missing Critical] Los simbolos de nivel del `listHeader` habrian salido tofu**

- **Found during:** Task 2
- **Issue:** El API manda el header ya formateado (`NIVEL Δ | Tracción 70%`). Pintarlo con `textContent` plano deja el simbolo griego bajo la fuente del kiosco (Pitfall 6, que el plan 164-06 resolvio con `.glyph`) y —peor— el de kairos (U+2609) **no existe en ninguna fuente**: el CSS lo dibuja, asi que como texto siempre seria un cuadradito.
- **Fix:** `paintGlyphText` recorre el string y envuelve cada simbolo en su `<span class="glyph">` (vacio y con `.kairos` para el de kairos), dejando el resto como nodos de texto. Sigue sin haber HTML crudo.
- **Files modified:** `el-templo-admin/src/tv/render.ts`
- **Verification:** el harness afirma que el header contiene un `span.glyph` con `Δ` y, en el caso de kairos, un `span.glyph kairos` **vacio**.
- **Committed in:** `1a4dc277`

**4. [Rule 2 - Missing Critical] El placeholder del video no tenia donde vivir**

- **Found during:** Task 2
- **Issue:** El plan pide el placeholder "Video proximamente" (criterio de `VideoPlaceholder.vue`), pero la plantilla solo tenia el `<video>`. Crearlo desde el render contradice la convencion que fijo el plan 164-06 (esqueleto en `index.html`, el render solo actualiza) y Pitfall 13.
- **Fix:** `#videoVacio` en `index.html` + sus estilos en `styles.css` (dos archivos fuera de `files_modified`, misma decision que tomo 164-06 con las tres pantallas). Tapa el `<video>` en vez de reemplazarlo: el elemento sigue siendo **uno solo**, como exige el plan.
- **Files modified:** `el-templo-admin/src/tv/index.html`, `el-templo-admin/src/tv/styles.css`
- **Verification:** el harness afirma placeholder oculto con video y visible en el ejercicio sin `videoUrl`; el gate de compatibilidad del CSS sigue verde.
- **Committed in:** `1a4dc277`

**5. [Rule 3 - Blocking] El gate del bundle del task 3 era insatisfacible tal como estaba escrito**

- **Found during:** Task 3 (verificacion)
- **Issue:** Dos partes fallaban **antes** de escribir una sola linea de este plan: (a) busca la cadena `ResizeObserver` en el HTML generado, pero `?diag=1` (plan 164-06) **imprime ese feature-detect** a proposito, asi que el identificador esta en el bundle desde entonces; (b) busca `CADENAS DE LA DISCIPLINA` / `Jim Rohn` / `QUOTES` para probar que las frases quedaron inlineadas, pero las dos primeras son de `RETIRED_QUOTES` (que el bundle descarta por tree-shaking) y `QUOTES` es un identificador que la minificacion renombra.
- **Fix:** El gate pasa a buscar **construcciones**, no menciones (`new ResizeObserver`, `new AbortController`, `padStart(`, `Object.entries(`, `Object.fromEntries(`) y a verificar las frases con texto de la tanda **vigente** (`Virgilio`, `LA FORTUNA FAVORECE`). Ademas se gatea el codigo fuente de los cuatro archivos de este plan con los identificadores pelados, que es donde ese criterio si aplica. Mismo tipo de correccion que la desviacion 3 del plan 164-07 (grep de texto vs. grep de codigo).
- **Files modified:** ninguno
- **Verification:** `BUNDLE_OK 43.9 KB`; los cuatro archivos nuevos no contienen `AbortController`, `ResizeObserver`, `padStart`, `Object.entries`, `innerHTML`, `Intl.` ni la API de mantener la pantalla encendida.
- **Committed in:** n/a (correccion de criterio)

**6. [Rule 3 - Blocking] No hay browser para el ultimo criterio de aceptacion del task 3**

- **Found during:** Task 3 (verificacion)
- **Issue:** El criterio pide abrir el `public/tv/index.html` servido localmente contra la API local. En esta maquina no hay chromium, ni playwright, ni jsdom, y instalarlos es gate humano bloqueante (C-08).
- **Fix:** Harness efimero (en el scratchpad, **no commiteado**) que corre el bundle real con `node:vm` sobre un DOM minimo, con reloj, `fetch` e intervalos controlados: 64 verificaciones sobre los 10 escenarios del ciclo de vida del kiosco. Se re-corrio ademas el harness del selftest del plan 164-07 (`PASS 34/34`) y el del diag.
- **Files modified:** ninguno
- **Verification:** `HARNESS_OK` (64/64) y `HARNESS_OK` del selftest, los dos sobre el bundle generado despues de los commits.
- **Committed in:** n/a (verificacion, sin cambios de codigo)

**7. [Rule 3 - Blocking] `audio.ts` viajo en el commit del task 2**

- **Found during:** Task 3
- **Issue:** El plan asigna `audio.ts` al task 3, pero `render.ts` (task 2) lo importa para los beeps del cambio de fase. Commitear `render.ts` sin `audio.ts` deja un commit que **no compila**.
- **Fix:** `audio.ts` entro en `1a4dc277` junto a `render.ts`. Un archivo en el commit "de al lado" es mucho menos grave que un commit roto en el medio del historial.
- **Files modified:** ninguno (solo agrupacion de commits)
- **Verification:** los tres commits typechequean en su propio arbol.
- **Committed in:** `1a4dc277`

---

**Total deviations:** 7 auto-fixed (2 missing critical, 1 bug, 4 blocking de procedimiento/criterio)
**Impact on plan:** Ninguna amplia el alcance. Las dos de Rule 2 cubren agujeros de render que el propio UI-SPEC exige (glifos y placeholder), la de Rule 1 tapa un modo de falla real de la vinculacion, y las cuatro restantes son de entorno o de criterios de verificacion mal calibrados por el plan.

## Issues Encountered

- **El plan pedia `boot()` con `scaleTv()` adentro, y `main.ts` ya la llamaba.** Se dejo la llamada igual (es idempotente y barata): asi `boot()` se sostiene solo si mañana lo invoca otro entry.
- **El harness de smoke del plan 164-06 (`tv-smoke.mjs`) quedo obsoleto:** no stubea `setInterval`, y ahora `boot()` crea tres. No se toco (vive en el scratchpad); el harness nuevo cubre el mismo terreno y mas.
- **Lo unico que no se puede verificar sin hardware sigue siendo lo mismo de siempre:** que un Chromium 53/68 de sede ejecute este bundle y que el layout se vea como el mockup. Es el checkpoint humano del plan 164-13.
- **La pausa y el arranque dependen de que el API no re-selle los timestamps.** Al escribir el harness aparecio dos veces el mismo error de fixture (mover `startedAt`/`pausedAt` en cada poll): del lado del kiosco eso se ve como "el timer no avanza" o "los digitos se mueven en pausa". El plan 164-10 ya escribe esos campos una sola vez; vale como recordatorio para el control del profe (164-12).

## Known Stubs

Ninguno. Con este plan `src/tv/` queda sin stubs: `scale`, `diag`, `selftest`, `timer`, `poll`, `render`, `audio` y `boot` estan implementados.

## Threat Flags

Ninguno nuevo. Las cinco mitigaciones que el `<threat_model>` asigna a este plan quedaron implementadas y verificadas:

| Threat   | Estado                                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| T-164-46 | `innerHTML` = 0 en los cuatro archivos; los nombres de ejercicios entran por `textContent` y los simbolos por `createElement`                  |
| T-164-47 | El token nunca se pinta: en pantalla solo va el `user_code`; el harness afirma que el secreto del pairing no aparece en el DOM                 |
| T-164-48 | Un solo `<video>`, render idempotente (verificado: el nodo de la lista sobrevive los ticks), 3 intervalos y reciclado a las 12 h **en reposo** |
| T-164-49 | El poll fallido no altera el estado en memoria — probado cortando la red en el harness: sigue la pantalla de clase y el timer sigue contando   |
| T-164-50 | `version.txt` con parametro anti-cache y `location.reload()` bajo guarda de `screen === "idle"` (probado: no recarga en clase, si en reposo)   |
| T-164-SC | Cero paquetes instalados; el harness usa `node:vm` de la stdlib                                                                                |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Para el plan 164-12 (botonera del profe):** el kiosco ya reacciona a todo lo que el control escribe. Dos contratos que conviene no romper — el API debe sellar `startedAt` y `pausedAt` **una sola vez** (moverlos en cada respuesta hace que el timer del TV no avance o que los digitos se muevan estando en pausa), y `soundEnabled` es la unica fuente del sonido: el kiosco no guarda una segunda copia.
- **Para el plan 164-13 (runbook + UAT):** el orden de diagnostico en la sede es `/tv/?selftest=1` → `/tv/?diag=1` → `/tv/`. La pantalla encendida se resuelve por configuracion del televisor (el kiosco no usa la API del navegador para eso: en webOS la promesa se cuelga) y va al runbook. El primer arranque real muestra un codigo de 6 caracteres que hay que cargar en el admin → Televisores.
- **Pendiente de hardware:** que el bundle corra en el Chromium del televisor y que el layout se vea como el mockup. Ningun test automatico de este plan puede responder eso.
- **Sin push.** La rama `feat/164-tv-sucursal` sigue local (staging-first estricto).

## Self-Check: PASSED

- 3/3 archivos declarados como creados existen en disco; 3/3 modificados verificados.
- 3/3 commits de task encontrados en `git log` (`807b0262`, `1a4dc277`, `174e63a9`); ningun archivo borrado por los commits (`git diff --diff-filter=D HEAD~3 HEAD` vacio).
- Verificacion re-corrida DESPUES de los commits (post-prettier):
  - `tsc -p src/tv/tsconfig.tv.json --noEmit` → exit 0.
  - `tsc -p tsconfig.json --noEmit` → identico al baseline de 164-04 (32 lineas preexistentes, 0 en `src/tv/`).
  - `node scripts/build-tv.mjs` → verde, `public/tv/index.html` 43.9 KB, version `cedf126b`.
  - Harness del kiosco sobre el bundle generado → **64/64 checks, `HARNESS_OK`**.
  - Harness del selftest (plan 164-07) sobre el bundle nuevo → **`PASS 34/34`**.
  - Gates de grep: `tv.deviceToken` en poll.ts = 2 · `clockOffset` = 12 · `reload` = 1 (dentro de la guarda de `idle`) · `setInterval` en boot.ts = **3** · `getUTCHours` en render.ts = 2 · `createElement('video')` = 0 · `webkitAudioContext` en audio.ts = 1 · `wakeLock` en `src/tv/*.ts` = 0.
  - Bundle sin APIs prohibidas y con las quotes inlineadas (`BUNDLE_OK`).
  - `eslint` y `prettier --check` limpios sobre los archivos tocados. `git status --short` limpio.

---

_Phase: 164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-_
_Completed: 2026-07-24_
