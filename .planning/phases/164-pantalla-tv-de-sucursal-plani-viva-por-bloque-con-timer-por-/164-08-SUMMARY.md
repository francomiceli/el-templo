---
phase: 164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-
plan: 08
subsystem: api
tags: [tv, poll, fastify, json-schema, device-auth, telemetry, vitest, security]

# Dependency graph
requires:
  - phase: 164-03
    provides: "Scope autenticado por device (register anidado + makeDeviceAuth) y request.tvDevice"
  - phase: 164-05
    provides: "TvService.buildPollPayload / readState (expire-on-read) / clampState"
  - phase: 164-02
    provides: "Contrato TvPollResponse que el response schema declara campo por campo"
provides:
  - "GET /api/tv/state: el unico endpoint que el kiosco consume en operacion normal"
  - "POST /api/tv/client-log: canal de diagnostico de un televisor sin devtools"
  - "tvStateSchema / tvClientLogSchema: contrato serializado del poll y superficie acotada del log"
  - "sanitizeClientLogText: corte de largo + descarte de < y > para texto de origen kiosco"
  - "19 tests de integracion que congelan D-03/04/05/07/09/17/23 contra MySQL real"
affects: [164-11 kiosco, 164-12, 164-10 panel de dispositivos]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reloj congelado con fake timers en tests de rutas que no aceptan `now` inyectado"
    - "Response schema como red de contencion de D-09 (fast-json-stringify solo serializa lo declarado)"
    - "Telemetria de cliente siempre en nivel warn, con el nivel reportado como campo estructurado"

key-files:
  created:
    - el-templo-api/test/tv/tv-device-poll.test.ts
  modified:
    - el-templo-api/src/modules/tv/device-routes.ts
    - el-templo-api/src/modules/tv/schemas.ts

key-decisions:
  - "El response schema declara `class` con `anyOf: [null, objeto]` y el `spec` del timer como UN objeto con la union de campos de las 4 variantes: fast-json-stringify omite lo ausente, asi que no hace falta repetir variantes para que ningun campo no declarado pueda salir"
  - "`Cache-Control: no-store` en el poll: es estado vivo, un intermediario que cachee 2.5 s deja el televisor congelado en un bloque viejo"
  - "`client-log` escribe SIEMPRE en warn, cualquiera sea el `level` reportado; el nivel del kiosco viaja como campo estructurado"
  - "Los tests crean el dispositivo por insert directo (sha256 del token) en vez de correr el pairing completo: el flujo RFC 8628 ya esta cubierto extremo a extremo en tv-pairing.test.ts y este archivo se enfoca en el payload"
  - "Un campo no declarado en el body de client-log se DESCARTA (ajv removeAdditional de Fastify) en vez de devolver 400: la mitigacion se cumple igual y un kiosco no entra en loop de reintentos"

patterns-established:
  - "Los tests de rutas del TV congelan el reloj con `vi.useFakeTimers({ shouldAdvanceTime: true })`: sin eso el resultado depende del dia de la corrida (un domingo no hay clase) y el borde AR/ES solo existe unas horas por dia"
  - "El reposo se verifica por el CONJUNTO de claves del body a cualquier profundidad, no por la ausencia de un campo `error` puntual"

requirements-completed: [D-03, D-04, D-05, D-07, D-09, D-17, D-23]

# Metrics
duration: 22min
completed: 2026-07-24
---

# Phase 164 Plan 08: El poll del televisor Summary

**`GET /api/tv/state` y `POST /api/tv/client-log` colgados del scope autenticado por dispositivo, con el response schema que hace estructuralmente imposible que un campo de diagnostico llegue a la pared de la sede — y 19 tests de integracion contra MySQL real que congelan una decision por caso, incluido el borde del dia entre Mar del Plata y Barcelona resuelto con el reloj congelado.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-07-24T22:43:00Z
- **Completed:** 2026-07-24T23:05:00Z
- **Tasks:** 3
- **Files modified:** 3 (1 creado, 2 modificados)

## Accomplishments

- **La sede no se puede elegir desde el request.** El handler lee `request.tvDevice.branchId` y la ruta no declara ni querystring ni params. Hay un test que manda `?branchId=<sede ajena>` con clase iniciada en las DOS sedes y verifica que el televisor sigue viendo la suya: el parametro es ruido, no una entrada (T-164-31).
- **El reposo es silencioso por construccion, no por disciplina.** El response schema declara exactamente cuatro claves de primer nivel, asi que aunque alguien agregue mañana un campo de diagnostico al payload, fast-json-stringify lo borra antes de que salga. El test no busca un campo `error`: recolecta TODAS las claves del body a cualquier profundidad y afirma que ninguna matchea `/error|message/i` (D-09).
- **El borde del dia quedo probado como corresponde.** Con el reloj congelado en 23:30 UTC del martes, el mismo estado del martes esta VIVO en Mogotes (20:30, `MARTES · SEMANA 1`, offset -180) y VENCIDO en Barcelona (00:30 del miercoles, `MIÉRCOLES · SEMANA 1`, offset +60), en la misma corrida y contra la misma DB. Si la fecha se calculara en UTC o con la TZ del server, las dos sedes verian lo mismo y una estaria mostrando la plani equivocada (D-07).
- **Dos televisores de la misma sede son indistinguibles.** El test compara los dos payloads completos con `toEqual` despues de sacar `serverNow` — no una lista de campos elegidos a mano, el objeto entero (D-04).
- **El heartbeat es del que llamo y solo de ese.** `last_seen_at` se sella fire-and-forget, asi que el test lo espera con reintentos y ademas verifica que el segundo televisor de la misma sede sigue en `null` (D-05).
- **Los milisegundos del timer sobreviven el viaje completo.** Se escribe `14:58:12.345`, se lee por HTTP y se afirma `startedAt % 1000 === 345`. Con un timestamp a segundos MySQL redondearia y el timer arrancaria hasta 1 s corrido: sobre un tabata de 20 s es 5% de error, visible contra el cronometro del profe (Pitfall 9).
- **El sabado ROM esta cubierto de verdad, no por el nombre del dia.** El reloj se mueve al sabado, `day_modes` dice `rom`, y el payload devuelve `mode: "rom"`, `levels: ["alfa","delta"]`, roster por zona del cuerpo y `levelLabel` `BÁSICO` / `AVANZADO` en las dos pasadas (D-23).
- **Un televisor colgado a 3 metros del piso ya puede contar por que fallo.** `client-log` acepta un enum cerrado y dos strings con techo, y escribe siempre en `warn` con el id del dispositivo y su sede — un kiosco en loop de fallo no puede disparar una cascada de alertas ni inflar el log con estructuras arbitrarias.

## Task Commits

1. **Task 1: GET /api/tv/state — el poll del televisor** — `b99e8396` (feat)
2. **Task 2: POST /api/tv/client-log — telemetria minima del kiosco** — `a7b2dfdc` (feat)
3. **Task 3: 19 tests de integracion del poll** — `c8634eba` (test)

## Files Created/Modified

- `el-templo-api/src/modules/tv/schemas.ts` — `tvStateSchema` (response 200 completo: `serverNow`, `branch`, `screen` con enum, y `class` como `anyOf: [null, TvClassPayload]` con blocks/exercises/timer declarados campo por campo) y `tvClientLogSchema` (`level` enum cerrado, `message` 1..500, `context` 1..100, `additionalProperties: false`) + la interfaz `TvClientLogBody`.
- `el-templo-api/src/modules/tv/device-routes.ts` — `GET /state` y `POST /client-log` dentro del `register` anidado del plan 164-03 (nacen autenticados por device token, sin JWT ni scope de pais). El poll instancia `TvService` por request con `request.log`, responde con `Cache-Control: no-store` y envuelve en `handleServiceError`. `sanitizeClientLogText` exportada.
- `el-templo-api/test/tv/tv-device-poll.test.ts` — 19 tests de integracion contra MySQL real, agrupados por decision.

## Decisions Made

- **`anyOf` para `class` y un solo objeto para `spec`.** `TimerSpec` es una union de 4 formas; declararla con `anyOf` de 4 variantes no agrega seguridad porque lo que importa es que ningun campo NO declarado salga. Se verifico empiricamente contra `fast-json-stringify@6.2.0` antes de commitear que `class: null` se serializa como `null`, que las propiedades ausentes de la variante se omiten y que un campo extra en el objeto fuente desaparece.
- **`Cache-Control: no-store` (agregado, no estaba en el plan).** El poll es estado vivo a 2.5 s. Cualquier intermediario que decida cachear un GET deja al televisor pintando un bloque que ya termino — el sintoma seria "el profe cambio de bloque y la pared no se entero", indistinguible de un bug del kiosco.
- **Siempre `warn`, nunca escalar.** El `level` que reporta el kiosco viaja como campo estructurado (`reportedLevel`) pero la escritura es siempre `warn`. Un televisor en loop de fallo pollea sin descanso: elevar la severidad convertiria un aparato roto en una tormenta de alertas.
- **Saneo ademas del schema.** El `maxLength` del JSON Schema ya acota, pero el handler vuelve a cortar a 500 y descarta `<`/`>`. Es la segunda linea: si mañana alguien afloja el schema, el techo del log no se mueve, y un agregador que renderice sin escapar no puede recibir un tag desde una pantalla colgada en una pared (T-164-34).
- **Dispositivos por insert directo en los tests.** El plan sugeria reusar el flujo de pairing del 164-03. Se opto por insertar la fila con el sha256 del token (exactamente lo que hace el pairing real): el flujo RFC 8628 ya tiene 17 tests propios en `tv-pairing.test.ts`, y acoplar este archivo a el habria metido JWT de staff y tres round-trips por cada uno de los 19 casos sin cubrir nada nuevo.
- **El reloj se congela.** La ruta no acepta un `now` inyectado (es justamente la superficie que T-164-31 mantiene cerrada), asi que los tests usan `vi.useFakeTimers({ shouldAdvanceTime: true })`, patron ya establecido en 18 archivos del repo. Sin eso, el archivo entero seria rojo los domingos y el caso de Barcelona solo pasaria en una franja de pocas horas.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `Cache-Control: no-store` en el poll**

- **Found during:** Task 1
- **Issue:** El plan describe el poll sin ninguna directiva de cache. `GET` sin `no-store` es cacheable por cualquier proxy o CDN que se interponga entre la sede y el API; con un poll de 2.5 s, una cache de pocos segundos deja el televisor congelado en un bloque viejo y el sintoma se lee como un bug del kiosco.
- **Fix:** `reply.header("Cache-Control", "no-store")` antes de enviar el payload.
- **Files modified:** `el-templo-api/src/modules/tv/device-routes.ts`
- **Verification:** el test del bloque en vivo afirma `res.headers["cache-control"] === "no-store"`.
- **Committed in:** `b99e8396`

**2. [Rule 2 - Missing Critical] Test de que un `branchId` en la query no cambia la sede**

- **Found during:** Task 3
- **Issue:** El plan gatea T-164-31 con un grep (`query.branchId|params.branchId|body.branchId` = 0). El grep prueba que hoy nadie lee el parametro, pero no prueba el comportamiento: un refactor que agregue un querystring schema con `branchId` pasaria el grep si usa otra sintaxis. La lectura cross-sede es la amenaza de mayor severidad del plan.
- **Fix:** Test que inicia clase en las DOS sedes con bloques distintos y pollea con `?branchId=<sede ajena>`, afirmando que el payload sigue siendo el de la sede del dispositivo.
- **Files modified:** `el-templo-api/test/tv/tv-device-poll.test.ts`
- **Verification:** `branch.name === "MOGOTES"` y `class.blockRole === "NUCLEUS"` (Barcelona tenia EPIKOS).
- **Committed in:** `c8634eba`

**3. [Rule 1 - Bug] `additionalProperties: false` no devuelve 400 en Fastify**

- **Found during:** Task 3
- **Issue:** El test escrito asumia que un campo no declarado en el body de `client-log` produciria 400. El ajv de Fastify corre con `removeAdditional`, asi que el campo se BORRA antes de llegar al handler y la respuesta es 204. La suposicion estaba en el test, no en el codigo.
- **Fix:** El test afirma el comportamiento real (204 con el campo descartado) y documenta por que es aceptable: la mitigacion de T-164-34 se cumple igual —nada no declarado se loguea— y un 400 haria que un kiosco con un campo de mas entrara en loop de reintentos.
- **Files modified:** `el-templo-api/test/tv/tv-device-poll.test.ts`
- **Verification:** 19/19 verdes; el caso de `level` fuera del enum sigue devolviendo 400 (ese si es rechazo).
- **Committed in:** `c8634eba`

**4. [Rule 2 - Missing Critical] `sanitizeClientLogText` exportada para poder fijarla**

- **Found during:** Task 3
- **Issue:** El saneo (corte + descarte de `<`/`>`) es la mitigacion de T-164-34, pero vivia como funcion privada del modulo de rutas y desde HTTP no es observable: el endpoint responde 204 sin cuerpo. Espiar `request.log.warn` no sirve — es un child logger de pino, no `app.log`. La mitigacion quedaba afirmada y no verificada.
- **Fix:** Se exporto la funcion y se la afirma por unidad en el mismo archivo, ademas del caso de integracion que verifica que un mensaje con HTML se acepta (204).
- **Files modified:** `el-templo-api/src/modules/tv/device-routes.ts`, `el-templo-api/test/tv/tv-device-poll.test.ts`
- **Verification:** `sanitizeClientLogText("<script>alert(1)</script> fallo", 500) === "scriptalert(1)/script fallo"` y el corte a 500 sobre 900 chars.
- **Committed in:** `c8634eba`

**5. [Rule 3 - Blocking] Los comandos `<verify>` del plan apuntaban al checkout compartido**

- **Found during:** los 3 tasks
- **Issue:** Los bloques `<automated>` arrancan con `cd /home/franco/projects/el-templo/el-templo-api`, que es el checkout principal (con WIP de otra sesion), no el worktree de la fase. Identico a la desviacion #4 del plan 164-03 y a la #4 del 164-05.
- **Fix:** Se corrieron los mismos comandos contra `/home/franco/projects/et-164-tv/el-templo-api`. Ningun cambio de codigo.
- **Files modified:** ninguno
- **Verification:** `tsc` y `vitest` verdes en el worktree; el checkout principal intacto.
- **Committed in:** n/a (correccion de procedimiento)

---

**Total deviations:** 5 auto-fixed (3 missing critical, 1 bug, 1 blocking)
**Impact on plan:** Ninguna amplia el alcance funcional. Las tres de Rule 2 verifican o endurecen mitigaciones que el propio `<threat_model>` del plan asignaba a estos archivos (T-164-31, T-164-34).

## Issues Encountered

- **Los 19 tests tardan ~65 s, casi todo en el provisioning de MySQL del setup global** (los casos suman ~0.5 s cada uno). La corrida completa de `test/tv/` son 110 tests en ~92 s. Conviene saberlo antes de dudar de una corrida "lenta".
- **Correr `test/tv/` con 4 workers puede dar un falso rojo de infraestructura** (`Table ... doesn't exist`, ver Issues del plan 164-05). Con `MAX_TEST_WORKERS=1` los 8 archivos corren verdes juntos; en CI cada runner tiene su propia DB.
- **`request.log` es un child logger de pino, no `app.log`:** espiar `app.log.warn` con vitest NO intercepta lo que escribe un handler. Es lo que llevo a exportar el saneo en vez de testearlo por el stream.

## Known Stubs

Ninguno. Las dos rutas estan completas y ejercitadas. Lo que falta son los consumidores: el kiosco que pintara el payload y llamara a `client-log` es el plan 164-11, y las rutas de escritura del control del profe son de otro plan de la fase.

## Threat Flags

Ninguno. Las dos rutas nuevas estaban modeladas en el `<threat_model>` del plan (T-164-31..T-164-35) y las cuatro con disposicion `mitigate` quedaron cubiertas por tests. T-164-35 (spam de `client-log` desde un kiosco en loop) sigue **aceptado**: exige device token valido, el volumen esta acotado por `maxLength` y la respuesta es un `warn` estructurado; agregar rate limiting implicaria instalar un paquete, que es gate humano bloqueante (C-08). Cero dependencias nuevas (T-164-SC).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **El plan 164-11 (kiosco) tiene su contrato de red cerrado:** `GET /api/tv/state` con `Authorization: Device <token>` cada 2.5 s, cualquier 401 significa "me revocaron, volver a la pantalla de pairing", y `POST /api/tv/client-log` con `{ level, message, context }` para reportar sus propios fallos sin devtools.
- **El payload viene preformateado:** `dateLabel`, `levelLabel`, `listHeader`, `title`, `mobilityLine` y `rx` se pintan tal cual; el reloj se arma con `utcOffsetMinutes` y `getUTC*`, y el transcurrido sale de `serverNow` + `startedAt`/`pausedAt`/`pausedAccumMs`.
- **Verificacion manual pendiente (no bloqueante):** `curl -H "Authorization: Device <token>" localhost:3000/api/tv/state` contra la DB local, que en este plan se cubrio por tests de integracion contra el mismo stack (Fastify + MySQL) en vez de levantar el server.
- **Sin push.** La rama `feat/164-tv-sucursal` sigue local (staging-first estricto).

## Self-Check: PASSED

- 1/1 archivo declarado como creado existe en disco; 2/2 modificados verificados.
- 3/3 commits de task encontrados en `git log` (`b99e8396`, `a7b2dfdc`, `c8634eba`).
- Verificacion a nivel plan re-corrida DESPUES de los commits (post-prettier):
  - `npx tsc --noEmit` en `el-templo-api`: limpio.
  - `MAX_TEST_WORKERS=1 npx vitest run test/tv/tv-device-poll.test.ts`: **19/19 verdes** (>= 13 exigidos).
  - `MAX_TEST_WORKERS=1 npx vitest run test/tv/`: **110/110 verdes** (sin regresiones en pairing, service, class-day, roster ni timer).
  - Gates de grep: `buildPollPayload` en device-routes = 1; `query.branchId|params.branchId|body.branchId` = 0; `handleServiceError` = 5; `client-log` = 2; `log.error` = 0; `attachCountryScope` = 0; `maxLength` en schemas = 4; `tvStateSchema` declarado = 1; `: any` y `console.` en todo `src/modules/tv/` = 0.

---

_Phase: 164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-_
_Completed: 2026-07-24_
