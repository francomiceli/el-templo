---
phase: 164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-
plan: 10
subsystem: api
tags: [tv, control, idempotencia, timer, drizzle, upsert, vitest, security]

# Dependency graph
requires:
  - phase: 164-03
    provides: "Plugin /api/admin/tv con JWT + TV_CONTROL_ROLES + attachCountryScope y requireBranchAccess por ruta"
  - phase: 164-05
    provides: "TvService (readState expire-on-read, clampState, resolveClassDay, buildRoster)"
  - phase: 164-08
    provides: "GET /api/tv/state — el poll contra el que se verifica que lo escrito llega al televisor"
provides:
  - "GET /api/admin/tv/control/context: todo lo que la botonera ciega necesita en una llamada (bloques, niveles, exerciseCountByLevel, sessionApproved, estado)"
  - "POST /api/admin/tv/control/state: la unica escritura del profe — absoluta, idempotente y clampeada, devuelve el contexto completo"
  - "POST /api/admin/tv/control/end-class: reposo manual del televisor (D-07), idempotente"
  - "TvService.writeState / endClass / buildControlContext"
  - "25 tests de integracion que congelan D-07/08/10/11/12/15/16/17/18/19/23"
affects: [164-11 kiosco, 164-12 control del profe en el admin, 164-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Escritura ABSOLUTA e idempotente en vez de comandos relativos: el doble tap con red mala no puede adelantar dos bloques ni reiniciar el timer"
    - "La escritura devuelve el estado nuevo COMPLETO (el cliente es ciego, no puede inferirlo)"
    - "Valor semanticamente invalido (rol/nivel que hoy no existe) se descarta, no se aplica-y-clampea"
    - "Upsert por sede con onDuplicateKeyUpdate sobre el UNIQUE de branch_id (D-04) + updated_by en cada escritura"

key-files:
  created:
    - el-templo-api/test/tv/tv-control.test.ts
  modified:
    - el-templo-api/src/modules/tv/service.ts
    - el-templo-api/src/modules/tv/control-routes.ts
    - el-templo-api/src/modules/tv/schemas.ts
    - el-templo-api/src/modules/tv/types.ts

key-decisions:
  - "Escribir sin sesion aprobada devuelve 409 en vez de crear la fila: sin roster no hay rol al que apuntar y la fila quedaria corrupta (TV en blanco)"
  - "Un blockRole o level que no existe HOY se descarta con warn en vez de aplicarse: aplicarlo haria que el clamp lo baje al primer bloque, o sea que un valor invalido moveria al profe de bloque y le mataria el timer"
  - "endClass BORRA la fila en vez de vencerle la fecha: 'sin fila' es exactamente el mismo reposo que ya produce el expire-on-read"
  - "Sin response schema en las rutas de control: el payload lleva un mapa de claves dinamicas (exerciseCountByLevel) y lo construye el servicio campo por campo desde interfaces tipadas, sin serializar ninguna fila de la DB"
  - "additionalProperties: false en las dos rutas de escritura es la mitigacion de T-164-43: el contrato no declara ningun timestamp, asi que un sello del cliente se descarta antes del handler"

patterns-established:
  - "Los comandos de timer con estado (start/pause/resume) son NO-OP cuando ya estan en ese estado; solo reset es incondicional"
  - "El orden de aplicacion de una escritura parcial es parte del contrato y se testea (bloque resetea, nivel no)"

requirements-completed:
  [D-07, D-08, D-10, D-11, D-12, D-15, D-16, D-17, D-18, D-19, D-23]

# Metrics
duration: 17min
completed: 2026-07-24
---

# Phase 164 Plan 10: Las escrituras del profe Summary

**Las tres rutas de control del profe con una sola escritura absoluta, idempotente y clampeada que devuelve el estado nuevo completo — 25 tests de integracion contra MySQL real que prueban, entre otras cosas, que dos `start` seguidos no reinician el bloque, que cambiar de nivel en el medio de un tabata no le mata el cronometro al profe y que lo que se escribe desde el celular es exactamente lo que pinta el televisor.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-07-24T23:08:00Z
- **Completed:** 2026-07-24T23:25:01Z
- **Tasks:** 3
- **Files modified:** 5 (1 creado, 4 modificados)

## Accomplishments

- **El doble tap no puede romper una clase.** Es la razon de ser del diseño absoluto: el profe maneja esto desde un celular con la red de la sede, en el medio de un bloque. `start` sobre un timer que ya corre es NO-OP, reescribir el bloque en el que ya estas no resetea nada, y `pause`/`resume` fuera de estado tampoco. Cuatro tests atacan el mismo agujero desde angulos distintos (doble `start`, doble `pause`, doble `resume`, re-escritura del mismo bloque), y el de la doble pausa es el que mas importa: si la segunda pausa reescribiera `pausedAt`, al reanudar se perderian los milisegundos del medio.
- **Cambiar de nivel no toca el cronometro; cambiar de bloque si (D-15).** El orden de aplicacion es parte del contrato y esta testeado con listas de largo distinto por nivel: DEUTEROS_2 tiene 5 ejercicios en alfa y 2 en sigma, asi que el test de cambio de nivel prueba a la vez que el bloque no se mueve, que el timer sigue corriendo con el MISMO sello de arranque y que el indice 4 se clampa a 1.
- **Un valor invalido no saca al profe de donde esta.** Aplicar un rol inexistente y dejar que el clamp lo resuelva lo habria bajado al primer bloque del dia con el timer en cero. Se descarta con `warn` y el control —que recibe el estado real en la respuesta— se auto-corrige solo. El test lo verifica en el peor momento posible: en DEUTEROS_2, ejercicio 3, con el timer corriendo.
- **D-17 verificado por el elapsed, no por el campo.** El test no se conforma con `pausedAccumMs > 0`: calcula el transcurrido efectivo (`now - startedAt - pausedAccumMs`) y afirma que quedo por debajo del tiempo de pared. Es la unica forma de probar que el bloque no se comio la pausa.
- **Tres tests cruzan control → poll del televisor.** Lo que importa no es que la fila quede escrita: es que el TV lo vea. El sonido encendido desde el celular aparece en el payload del kiosco (D-19), la pantalla de cierre deja al televisor con `class: null` (D-08), y terminar la clase lo devuelve a `idle` (D-07). El sello del timer se compara byte a byte entre lo que devolvio la escritura y lo que sirvio el poll (Pitfall 9).
- **La sede se autoriza en CADA llamada, en lectura y en escritura.** El test del coach ajeno no se conforma con el 403 del GET: manda tambien un `POST /control/state` sobre la sede de otro y verifica que no quedo ninguna fila en `tv_class_state` (T-164-40). Y un `recepcion` de la propia sede tampoco pasa: lo frena la capa de rol, antes de la de sede.
- **El cliente no puede mentir sobre el tiempo (T-164-43).** El contrato no declara ningun timestamp, y el test manda `timerStartedAt: 0` + `pausedAccumMs: 999999` para comprobar que ajv los borra antes del handler: un celular con el reloj corrido no puede mover el arranque de un cronometro que se proyecta en una pared.
- **Queda registrado quien dejo el estado como esta.** `updated_by` sale del JWT en cada escritura y el test de concurrencia (D-12) lo afirma sobre la fila: el owner escribe encima del coach sin error, sin lock y sin 409, y la fila queda a nombre del owner (T-164-44).

## Task Commits

1. **Task 1: buildControlContext + GET /control/context** — `b9d09215` (feat)
2. **Task 2: writeState idempotente + POST /control/state y /control/end-class** — `7bcd5960` (feat)
3. **Task 3: 25 tests de integracion del control del profe** — `bbd776ae` (test)

## Files Created/Modified

- `el-templo-api/src/modules/tv/service.ts` — `buildControlContext` (sede + dia + estado clampeado en una llamada), `writeState` (semantica completa del `<interfaces>` del plan: orden de aplicacion, idempotencia, sellos del server, upsert), `endClass`, y los helpers privados `loadBranch`, `toControlContext`, `exerciseCountByLevel`, `applyBlockRole`, `applyLevel`, `applyTimerCommand`, `persistState`. Constante `IDLE_TIMER` compartida por "cambiar de bloque" y `reset`.
- `el-templo-api/src/modules/tv/control-routes.ts` — Las tres rutas nuevas, todas con `requireBranchAccess` (`query.branchId` en la lectura, `body.branchId` en las dos escrituras) y `handleServiceError`. `TvService` se instancia por request con `request.log`.
- `el-templo-api/src/modules/tv/schemas.ts` — `tvControlContextSchema`, `tvControlStateSchema` (todos los campos opcionales salvo `branchId`, `timer` como enum de exactamente 4 valores, `screen` sin `idle`, `additionalProperties: false`) y `tvControlEndClassSchema`. `TV_STATE_TOKEN_MAX_LENGTH` documenta por que `blockRole`/`level` son strings con techo y no enums estaticos.
- `el-templo-api/src/modules/tv/types.ts` — Solo docblock: se reformulo el ejemplo de comando relativo (ver Deviations #3).
- `el-templo-api/test/tv/tv-control.test.ts` — 25 tests de integracion contra MySQL real, agrupados por decision.

## Decisions Made

- **409 si la sesion del dia no esta aprobada.** El plan describe la primera escritura como "crea la fila con `blockRole` = primer rol del roster", pero sin sesion aprobada no hay roster: el primer rol no existe. Crear la fila igual dejaria un estado apuntando a la nada, que es exactamente el TV en blanco que el clamp existe para evitar. El control ya sabe que no puede escribir (`sessionApproved: false`, D-10) y tiene la botonera deshabilitada, asi que una escritura solo puede venir de una carrera —aprobaron o desaprobaron la sesion con la pantalla abierta— y merece una respuesta explicita.
- **Los valores desconocidos se descartan, no se clampean.** El plan dejaba elegir ("lo rechaza o lo clampea, comportamiento explicito y testeado"). Descartar es lo unico que no tiene efecto colateral: aplicar un rol invalido y dejar que el clamp lo baje al primer bloque convierte un typo del cliente en "el profe salta al bloque 1 con el timer en cero". Un 400 tampoco sirve del todo: el control es ciego y ya recibe el estado real en cada respuesta, con lo cual se auto-corrige sin necesidad de manejar un error. Vale igual para el `sigma` de un sabado ROM (D-23).
- **`endClass` borra la fila.** La alternativa del plan (dejarla con `class_date` vencido) requiere elegir una fecha falsa y confia en que ningun lector futuro mire la fila cruda. Borrar produce exactamente el mismo estado que el TV ya sabe manejar todas las mañanas.
- **Sin response schema en las rutas de control.** Los dos schemas de respuesta del modulo (`/devices`, `/tv/state`) existen porque serializan filas de la DB o alimentan una pared publica. Aca el payload lo construye el servicio campo por campo desde `TvControlContext` y lleva un mapa de claves dinamicas (`exerciseCountByLevel`, una por nivel del dia) que fast-json-stringify solo dejaria pasar con `additionalProperties`. No hay nada que contener y si algo que romper.
- **`level` por defecto sigue siendo `"alfa"` literal (D-15).** Si un dia no tuviera alfa, el clamp final lo baja al primer nivel que exista — no hace falta una segunda regla de fallback en el default.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] 409 explicito cuando la sesion del dia no esta aprobada**

- **Found during:** Task 2
- **Issue:** El bloque `<interfaces>` define la primera escritura del dia con `blockRole` = primer rol del roster, pero no dice que pasa cuando no hay roster (sesion en draft, o sin sesion). Sin un corte explicito, `roster[0].role` es `undefined` y la fila se creaba con un rol vacio: sesion aprobada mas tarde ese mismo dia + estado apuntando a un rol inexistente = el clamp cae al primer bloque, o peor, `blockRole` vacio persistido en una columna `notNull`.
- **Fix:** `writeState` valida `classDay.approved` y el largo del roster ANTES de tocar nada y lanza `ConflictError`. El contexto ya expone `sessionApproved` para que el control no llegue nunca a ese punto en uso normal.
- **Files modified:** `el-templo-api/src/modules/tv/service.ts`
- **Verification:** test "sin sesion aprobada la escritura se rechaza con 409 y no crea estado" — afirma el 409 Y que `tv_class_state` sigue vacia.
- **Committed in:** `7bcd5960`

**2. [Rule 2 - Missing Critical] Test de T-164-43 (sello de tiempo mandado por el cliente)**

- **Found during:** Task 3
- **Issue:** El `<threat_model>` asigna `mitigate` a T-164-43 ("cliente mandando su propio `timerStartedAt`") con el argumento de que "el schema no acepta timestamps". Eso es cierto por omision —el contrato no los declara— pero una mitigacion por omision es justo la que se rompe sola: alcanza con que alguien agregue un campo al schema para que deje de valer, y no habia nada que lo detectara. La lista de tests del plan no incluia este caso.
- **Fix:** Test que manda `timerStartedAt: 0` y `pausedAccumMs: 999999` junto con `timer: "start"` y verifica que el sello es del server (`> 0`) y el acumulado quedo en 0.
- **Files modified:** `el-templo-api/test/tv/tv-control.test.ts`
- **Verification:** verde; el `additionalProperties: false` del schema hace que ajv (removeAdditional) borre ambos campos antes del handler.
- **Committed in:** `bbd776ae`

**3. [Rule 1 - Bug] Una mencion en prosa rompia el gate de grep del propio plan**

- **Found during:** Task 2
- **Issue:** El criterio de aceptacion exige `grep -ci "next-block" src/modules/tv/` = 0, y daba 1: el docblock de `TvStateWrite` en `types.ts` (escrito en el plan 164-02) usaba exactamente esa cadena como EJEMPLO de comando relativo que no hay que implementar. El gate es correcto y util —sirve para que quien grepee la cadena confirme de una que no existe esa superficie—, y ademas es el tercer tropiezo identico de la fase (desviacion #4 del 164-01, #3 del 164-03).
- **Fix:** Se reformulo el ejemplo en prosa ("the block after this one", "one more round") sin perder el sentido. Cero cambios de comportamiento.
- **Files modified:** `el-templo-api/src/modules/tv/types.ts`
- **Verification:** `grep -rn "next-block" src/modules/tv/` = 0, re-verificado despues del commit (post-prettier).
- **Committed in:** `7bcd5960`

**4. [Rule 3 - Blocking] Los comandos `<verify>` del plan apuntaban al checkout compartido**

- **Found during:** los 3 tasks
- **Issue:** Los bloques `<automated>` arrancan con `cd /home/franco/projects/el-templo/el-templo-api`, que es el checkout principal (con WIP de otra sesion), no el worktree de la fase. Identico a la desviacion #4 del 164-03, #4 del 164-05 y #5 del 164-08.
- **Fix:** Se corrieron los mismos comandos contra `/home/franco/projects/et-164-tv/el-templo-api`. Ningun cambio de codigo.
- **Files modified:** ninguno
- **Verification:** `tsc` y `vitest` verdes en el worktree; el checkout principal intacto.
- **Committed in:** n/a (correccion de procedimiento)

---

**Total deviations:** 4 auto-fixed (2 missing critical, 1 bug, 1 blocking)
**Impact on plan:** Ninguna amplia el alcance funcional. La #1 cierra un hueco del contrato que habria producido filas invalidas y la #2 verifica una mitigacion que el propio `<threat_model>` del plan asignaba a estos archivos.

## Issues Encountered

- **Los 25 tests tardan ~86 s, casi todo en el provisioning de MySQL del setup global** (los casos suman ~1.2 s cada uno, con 2 usuarios de staff creados y logueados por test — argon2 es lo que domina). La corrida completa de `test/tv/` son 135 tests en ~125 s.
- **Correr `test/tv/` con varios workers puede dar un falso rojo de infraestructura** (`Table ... doesn't exist`, ver Issues del plan 164-05). Con `MAX_TEST_WORKERS=1` los 9 archivos corren verdes juntos; en CI cada runner tiene su propia DB.
- **Los fake timers con `shouldAdvanceTime: true` avanzan en pasos de ~20 ms**, asi que dos escrituras consecutivas sin espera pueden compartir el mismo sello. Los tests de idempotencia meten un `sleep` real entre llamadas para que la afirmacion "el sello NO cambio" sea fuerte y no un empate por resolucion del reloj.

## Known Stubs

Ninguno. Las tres rutas estan completas y ejercitadas. Lo que falta son sus consumidores: la pagina de control del profe en el admin (plan 164-12) y el kiosco que pinta el resultado (164-11).

## Threat Flags

Ninguno. Las tres rutas nuevas estaban modeladas en el `<threat_model>` del plan (T-164-40..T-164-45) y las cinco con disposicion `mitigate` quedaron cubiertas por tests. T-164-45 (escrituras concurrentes de dos profes) sigue **aceptado** por decision explicita del usuario (D-12: ultima escritura gana, sin locks ni avisos) y ademas testeado como comportamiento esperado, no como falla. Cero paquetes nuevos (T-164-SC).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **El plan 164-12 (control del profe en el admin) tiene el contrato cerrado:** `GET /control/context?branchId=NN` para dibujar la botonera (bloques con `exerciseCountByLevel`, `levels`, `sessionApproved`, `state`), `POST /control/state` con campos absolutos para cada boton, y `POST /control/end-class`. Toda escritura devuelve el contexto nuevo COMPLETO, asi que la pagina puede reemplazar su estado local con la respuesta y no necesita re-consultar ni inferir nada.
- **Reglas que el control NO tiene que implementar** (ya viven en el server): el reset de ejercicio y timer al cambiar de bloque, la persistencia del nivel entre bloques, el clamp del indice, y la idempotencia de los comandos de timer. El cliente puede mandar el mismo comando dos veces sin defenderse.
- **Verificacion manual pendiente (no bloqueante):** el flujo `POST /control/state` con `timer: "start"` seguido de `GET /api/tv/state` contra el server local, que aca se cubrio por tests de integracion sobre el mismo stack (Fastify + MySQL) en vez de levantar el proceso.
- **Sin push.** La rama `feat/164-tv-sucursal` sigue local (staging-first estricto).

## Self-Check: PASSED

- 1/1 archivo declarado como creado existe en disco; 4/4 modificados verificados.
- 3/3 commits de task encontrados en `git log` (`b9d09215`, `7bcd5960`, `bbd776ae`).
- Verificacion a nivel plan re-corrida DESPUES de los commits (post-prettier):
  - `npx tsc --noEmit` en `el-templo-api`: limpio.
  - `MAX_TEST_WORKERS=1 npx vitest run test/tv/tv-control.test.ts`: **25/25 verdes** (>= 14 exigidos).
  - `MAX_TEST_WORKERS=1 npx vitest run test/tv/`: **135/135 verdes** (sin regresiones en pairing, poll, service, class-day, roster ni timer).
  - Gates de grep: `buildControlContext` en control-routes = 1; `sessionApproved` en service = 2; `exerciseCountByLevel` en service = 2; `requireBranchAccess` en control-routes = 9 (>= 2); enum de `timer` con exactamente 4 valores; `onDuplicateKeyUpdate` en service = 1; `todayInTz` en service = 5; `next-block` en todo `src/modules/tv/` = 0; `: any` y `console.` en todo `src/modules/tv/` = 0.

---

_Phase: 164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-_
_Completed: 2026-07-24_
