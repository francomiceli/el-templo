---
phase: 164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-
plan: 03
subsystem: auth
tags:
  [tv, rfc8628, device-code, pairing, rbac, fastify, drizzle, vitest, security]

# Dependency graph
requires:
  - phase: 164-01
    provides: "Tablas tv_devices / tv_pairings (user_code, device_code_hash, token_hash, is_active, revoked_at, last_seen_at)"
  - phase: 164-02
    provides: "Modulo tv ya existente (types/timer-spec/timer-phase) donde se cuelgan schemas, pairing y rutas"
  - phase: 116-refresh-tokens-auth
    provides: "Patron de secreto opaco: randomBytes(32).base64url + sha256 persistido + DI por constructor + warn en caminos invalidos"
provides:
  - "TV_CONTROL_ROLES (Dueño + coach, D-01) vigilado byte a byte por rbac-sets.test.ts"
  - "TvPairingService: start / claim one-shot / consume one-shot (RFC 8628)"
  - "makeDeviceAuth: hook onRequest que resuelve `Authorization: Device <token>` a { id, branchId } y sella last_seen_at"
  - "request.tvDevice (declaration merging sobre FastifyRequest) para todo plan que cuelgue rutas de device"
  - "Rutas publicas /api/tv/pair/start y /pair/status + scope anidado autenticado por dispositivo con GET /api/tv/me"
  - "Rutas de staff /api/admin/tv: pair/claim, devices, devices/:id/revoke"
  - "schemas.ts: validacion de las 5 rutas + TV_USER_CODE_ALPHABET como fuente unica del alfabeto"
affects:
  [
    164-05 poll del estado,
    164-08 control del profe,
    164-09,
    164-10 panel de dispositivos,
    164-11 kiosco,
    164-12,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern 2: pairing RFC 8628 con split user_code publico / device_code secreto"
    - "Guard por encapsulacion: register anidado con el hook de device auth, en vez de excluir rutas una por una"
    - "Filtro de scope fail-closed: sin sedes visibles se devuelve [], nunca una query sin WHERE"
    - "Alfabeto + pattern del codigo derivados de una unica constante (generador y validador no pueden divergir)"

key-files:
  created:
    - el-templo-api/src/modules/tv/schemas.ts
    - el-templo-api/src/modules/tv/pairing.ts
    - el-templo-api/src/modules/tv/device-auth.ts
    - el-templo-api/src/modules/tv/device-routes.ts
    - el-templo-api/src/modules/tv/control-routes.ts
    - el-templo-api/src/modules/tv/index.ts
    - el-templo-api/test/tv/tv-pairing.test.ts
  modified:
    - el-templo-api/src/modules/shared/permissions.ts
    - el-templo-api/test/rbac-sets.test.ts
    - el-templo-api/src/app.ts

key-decisions:
  - "El consumo del pairing tambien se sella con un UPDATE condicional (WHERE device_id IS NULL): el plan solo pedia el one-shot en el claim, pero dos polls del TV que se pisan podian emitir dos tokens"
  - "GET /api/tv/me: hacia falta al menos UNA ruta autenticada por dispositivo para poder verificar el criterio de exito del propio plan (un TV revocado recibe 401)"
  - "El guard de device se aplica por register anidado y no por preHandler ruta a ruta: /pair/* queda fuera del guard estructuralmente"
  - "El scope del listado de dispositivos es fail-closed: un scope.country nulo por corrupcion de datos devuelve lista vacia, no todos los televisores del sistema"
  - "revoke lee la sede de la FILA del dispositivo, nunca del payload: requireBranchAccess no aplica cuando el id es de un device y no de una sede"
  - "GET /devices lleva response schema: fast-json-stringify como red de contencion contra una fuga futura de token_hash"

patterns-established:
  - "Rutas de dispositivo y rutas de staff en plugins separados por guards incompatibles (mismo criterio que coachRoutes / coachLoadRoutes)"
  - "Los comentarios no pueden contener las cadenas que vigilan los gates de grep (Math.random, log.error, attachCountryScope): se reformulan en prosa"

requirements-completed: [D-01, D-02, D-03, D-04, D-05]

# Metrics
duration: 19min
completed: 2026-07-24
---

# Phase 164 Plan 03: Vinculacion y autenticacion del TV Summary

**Pairing RFC 8628 completo (user_code visible de 6 chars con CSPRNG / device_code secreto de 256 bits), device token opaco sin expiracion pero revocable por fila, y las tres rutas de staff para vincular, listar y revocar — con 17 tests de integracion contra MySQL real que prueban, entre otras cosas, que el codigo de la pantalla nunca entrega un token.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-07-24T21:14:45Z
- **Completed:** 2026-07-24T21:33:30Z
- **Tasks:** 3
- **Files modified:** 10 (7 creados, 3 modificados)

## Accomplishments

- **El codigo que se ve en la pantalla no sirve para robar nada.** Es la razon de ser del plan: D-02 fija un `user_code` que no expira, y el repo no tiene rate limiting. El split RFC 8628 hace que `GET /pair/status` exija el `device_code` de 256 bits que solo conoce el TV. Dos tests atacan el mismo agujero desde dos angulos — mandar el `user_code` tal cual (lo frena el `minLength` del schema) y estirado a 43 chars para esquivar la validacion (lo frena el lookup por sha256).
- **Ningun secreto vive en claro.** Ni el `device_code` ni el device token se persisten: se guarda su sha256 hex, se re-deriva en cada lookup, se emite el plaintext exactamente una vez y no entra en ningun log. Un test lo verifica leyendo la fila y comparandola contra el valor que devolvio el endpoint.
- **Consumo one-shot en los dos extremos.** El claim usa un unico `UPDATE ... WHERE claimed_at IS NULL` (nunca SELECT + UPDATE) y el consumo sella con `UPDATE ... WHERE device_id IS NULL`: dos profes tipeando el mismo codigo a la vez, o dos polls del TV que se pisan, no pueden producir dos tokens vivos.
- **Autorizacion en dos capas independientes.** El rol (`TV_CONTROL_ROLES` = Dueño + coach, D-01) y la sede (`requireBranchAccess` / `canAccessBranch` sobre `request.scope`) se validan por separado. Cuatro tests cubren la segunda: un coach de la sede A no puede reclamar, listar ni revocar un TV de la sede B, y el 403 no deja efectos en la DB.
- **La revocacion corta de verdad.** `POST /devices/:id/revoke` apaga `is_active` y el mismo device token que funcionaba en `GET /api/tv/me` pasa a devolver 401 en la request siguiente — que es lo unico que puede cortar un token que por diseño no expira (D-03).
- **`TV_CONTROL_ROLES` queda bajo custodia.** El set esta fijado byte a byte en `rbac-sets.test.ts` (`["admin","owner","coach"]`) y ademas se afirma explicitamente que NO contiene `gestion` ni `recepcion`: si alguien lo ensancha para reusarlo en otro modulo, el test lo frena.

## Task Commits

1. **Task 1: TV_CONTROL_ROLES + JSON Schemas del modulo** — `44075eb7` (feat)
2. **Task 2: TvPairingService (RFC 8628) + hook device-auth** — `c3bc7b78` (feat)
3. **Task 3: Rutas de vinculacion, wiring en app.ts y tests de integracion** — `84a6d4d7` (feat)

## Files Created/Modified

- `el-templo-api/src/modules/shared/permissions.ts` — `TV_CONTROL_ROLES = [...ADMIN_ROLES, "coach"]`, compuesto override → core igual que `FINANCE_LOAD_ROLES`, con el alcance acotado por docblock (gatea solo `/api/admin/tv`; el acceso por sede lo impone `requireBranchAccess`, no este set).
- `el-templo-api/test/rbac-sets.test.ts` — Caso nuevo que fija el valor efectivo y excluye `gestion`/`recepcion`.
- `el-templo-api/src/modules/tv/schemas.ts` — JSON Schema + interfaz de las 5 rutas. `TV_USER_CODE_ALPHABET` es la fuente unica: el `pattern` del `user_code` se deriva de el y `pairing.ts` genera con el mismo array. `deviceCode` con `minLength: 22` rechaza sintacticamente el ataque del Pitfall 10.
- `el-templo-api/src/modules/tv/pairing.ts` — `TvPairingService`: `start()` (CSPRNG + retry ante colision del UNIQUE), `claim()` (one-shot + 404/409 distinguidos por un SELECT que solo elige el mensaje) y `consume()` (emision unica del token + limpieza del device huerfano si pierde la carrera).
- `el-templo-api/src/modules/tv/device-auth.ts` — `makeDeviceAuth(db)`: hook `onRequest` que resuelve el token opaco contra `is_active = true`, responde 401 (no 403) para que el kiosco vuelva solo a la pantalla de pairing, y sella `last_seen_at` fire-and-forget para no cobrarle latencia al poll (D-05).
- `el-templo-api/src/modules/tv/device-routes.ts` — Plugin `/api/tv`. `/pair/*` publicas; el resto en un `register` anidado con el guard de dispositivo. `GET /me` devuelve `{ deviceId, branchId, branchName }` y ni un dato de socio.
- `el-templo-api/src/modules/tv/control-routes.ts` — Plugin `/api/admin/tv` con hook JWT + `TV_CONTROL_ROLES` + `attachCountryScope`, mas `buildScopeFilter()` (traduce el scope a un filtro de sedes, fail-closed).
- `el-templo-api/src/modules/tv/index.ts` — Barrel de dos lineas.
- `el-templo-api/src/app.ts` — Dos registros separados con el comentario que explica por que (guards incompatibles).
- `el-templo-api/test/tv/tv-pairing.test.ts` — 17 tests de integracion contra MySQL real.

## Decisions Made

- **El consumo tambien se sella condicionalmente.** El plan pedia el `UPDATE ... WHERE claimed_at IS NULL` solo para el claim. Pero el TV pollea cada 3 s: si un poll tarda, el siguiente entra antes de que el primero haya escrito `device_id` y se crean dos dispositivos con dos tokens vivos para un mismo pairing. Se resolvio con `UPDATE ... WHERE device_id IS NULL` + borrado del device huerfano del perdedor (su token nunca salio del proceso), que devuelve `consumed`.
- **Guard por encapsulacion, no por lista de excepciones.** El plan ofrecia `preHandler` por ruta o `register` anidado. Se eligio el anidado: con `preHandler` la seguridad depende de que cada ruta futura se acuerde de incluirlo, y `/pair/*` de recordar excluirlo. Con el `register`, todo lo que se agregue adentro nace autenticado y `/pair/*` esta afuera por construccion.
- **`revoke` no usa `requireBranchAccess`.** El helper lee el `branchId` del payload, y aca el `:id` es de un dispositivo — leer una sede del request seria dejar que el atacante elija contra que sede se valida. Se lee la sede de la fila y recien ahi se evalua `canAccessBranch`.
- **Listado fail-closed.** `buildScopeFilter` devuelve `"none"` (lista vacia) cuando el usuario no tiene sedes visibles — por ejemplo un admin con `scope.country` en null por corrupcion de datos. Sin eso, ese caso degradaria a una query sin `WHERE`, es decir todos los televisores del sistema.
- **Response schema en `GET /devices`.** No es decorativo: fast-json-stringify solo serializa lo declarado, asi que si alguien cambia el `select({...})` explicito por un `select()`, `token_hash` sigue sin poder salir por esa ruta (T-164-11).
- **401 y no 403 en device-auth.** El kiosco no tiene a nadie que lea un error: el 401 es la señal de "volvé a la pantalla de pairing".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Se agrego `GET /api/tv/me` (ruta autenticada por dispositivo)**

- **Found during:** Task 3
- **Issue:** El bloque `<interfaces>` del plan solo define rutas de pairing, ninguna autenticada por device token. Pero el propio plan declara como criterio de exito "un dispositivo revocado recibe 401 en las rutas de device" y como `must_have` "cada request del TV actualiza last_seen_at (D-05) y un dispositivo revocado recibe 401". Sin una sola ruta detras del guard, `makeDeviceAuth` quedaba escrito pero nunca ejercitado — codigo de seguridad sin un solo test de comportamiento.
- **Fix:** `GET /api/tv/me` dentro del `register` anidado, devolviendo `{ deviceId, branchId, branchName }` (cero datos de socio). Ademas le deja armado al plan 164-05 el scope donde cuelga el poll del estado.
- **Files modified:** `el-templo-api/src/modules/tv/device-routes.ts`, `el-templo-api/test/tv/tv-pairing.test.ts`
- **Verification:** 3 tests — token valido resuelve la sede; sin header / token inventado / JWT Bearer dan 401; y post-revoke el mismo token que funcionaba da 401.
- **Committed in:** `84a6d4d7`

**2. [Rule 2 - Missing Critical] Sellado condicional del consumo (TOCTOU en `consume()`)**

- **Found during:** Task 2
- **Issue:** El plan exigia el one-shot TOCTOU-safe para el `claim`, pero describia el `consume` como "genera el token, inserta la fila, setea `device_id`". Esa secuencia es un TOCTOU igual de real: el TV pollea cada 3 s y dos polls solapados producirian dos filas en `tv_devices` con dos tokens validos para el mismo pairing — exactamente lo que D-03 pretende evitar al no poner expiracion.
- **Fix:** `UPDATE tv_pairings SET device_id = ? WHERE id = ? AND device_id IS NULL` con chequeo de `affectedRows`; el perdedor borra el device que acababa de crear (su token nunca se devolvio) y responde `consumed`.
- **Files modified:** `el-templo-api/src/modules/tv/pairing.ts`
- **Verification:** test "el device token se emite exactamente una vez (paired -> consumed)" afirma ademas que queda UN solo dispositivo en la tabla.
- **Committed in:** `c3bc7b78`

**3. [Rule 1 - Bug] Menciones en prosa rompian tres gates de grep**

- **Found during:** Tasks 2 y 3
- **Issue:** Los criterios exigen `grep -c "Math.random" pairing.ts` = 0, `grep -cE "log\.(error)" pairing.ts` = 0 y `grep -c "attachCountryScope" device-routes.ts` = 0. Los docblocks explicaban justamente por que NO se usan esas tres cosas, y al nombrarlas daban 1 / 1 / 1. El gate es correcto: sirve para que quien grepee `attachCountryScope` no crea que la superficie publica del TV lo usa. Mismo tropiezo que la desviacion #4 del plan 164-01.
- **Fix:** Reformulados los comentarios sin perder la explicacion ("jamas el PRNG de `Math`", "a ningun nivel mas alto", "el hook de scope de pais").
- **Files modified:** `el-templo-api/src/modules/tv/pairing.ts`, `el-templo-api/src/modules/tv/device-routes.ts`
- **Verification:** los tres greps dan 0, re-verificados despues de que prettier reescribiera los archivos en el pre-commit.
- **Committed in:** `c3bc7b78`, `84a6d4d7`

**4. [Rule 3 - Blocking] Los comandos `<verify>` del plan apuntaban al checkout compartido**

- **Found during:** los 3 tasks
- **Issue:** Los bloques `<automated>` arrancan con `cd /home/franco/projects/el-templo/el-templo-api`, que es el checkout principal (135 commits atras y con WIP de otra sesion), no el worktree de la fase. Identico a la desviacion #1 del plan 164-02.
- **Fix:** Se corrieron los mismos comandos contra `/home/franco/projects/et-164-tv/el-templo-api`. Ningun cambio de codigo.
- **Files modified:** ninguno
- **Verification:** `tsc --noEmit` y `vitest run` verdes en el worktree; el checkout principal quedo intacto.
- **Committed in:** n/a (correccion de procedimiento)

---

**Total deviations:** 4 auto-fixed (2 missing critical, 1 bug, 1 blocking)
**Impact on plan:** Ninguna amplia el alcance funcional. Las dos de Rule 2 son mitigaciones que el propio `<threat_model>` del plan asignaba a estos archivos (T-164-10 / T-164-11) o requisitos que sus criterios de exito ya exigian verificar.

## Issues Encountered

- `pnpm lint` no existe en `el-templo-api` (el binario `lint` que resuelve el shell es el de Android SDK). CI solo lintea los tres frontends, y con `continue-on-error: true`. El formateo del API lo garantiza prettier via lint-staged en el pre-commit, que reescribio los archivos en los tres commits — por eso los gates de grep se re-verificaron DESPUES de commitear.
- Los tests de este plan tardan ~100 s por el provisioning de MySQL del setup global de vitest, no por los 25 casos (que suman ~1 s cada uno). Conviene saberlo antes de dudar de una corrida "lenta".

## Known Stubs

Ninguno. Las tres rutas de staff y las tres de dispositivo estan completas y ejercitadas. Lo unico deliberadamente minimo es `GET /api/tv/me`, que existe como chequeo de vinculacion del kiosco y como superficie de verificacion del 401; el poll del estado de clase lo agrega el plan 164-05 en el mismo scope autenticado.

## Threat Flags

| Flag                  | File                              | Description                                                                                                                                                                                                            |
| --------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| threat_flag: endpoint | `src/modules/tv/device-routes.ts` | `GET /api/tv/me` no estaba en el `<threat_model>` del plan. Autenticada por device token, devuelve solo `{ deviceId, branchId, branchName }` — sin datos de socio (T-164-08) y sin poder leer otra sede que la propia. |

El resto de la superficie (`/pair/start`, `/pair/status`, las tres de `/api/admin/tv`) ya estaba modelada en T-164-09..T-164-14. T-164-15 (sin rate limiting en el poll de `/pair/status`) sigue **aceptado**: agregarlo implicaria instalar un paquete, que es gate humano bloqueante (C-08). Cero dependencias nuevas en este plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **El plan 164-05 (poll del estado) puede colgar sus rutas del `register` anidado de `device-routes.ts`** y usar `request.tvDevice.branchId` como unica fuente de la sede: no necesita ni JWT ni `scope`.
- **El plan 164-10 (panel de dispositivos en el admin)** tiene el contrato cerrado: `GET /devices` (con `lastSeenAt` para el "visto hace X") y `POST /devices/:id/revoke`.
- **El plan 164-11 (kiosco)** tiene el flujo completo: `POST /pair/start` → guardar `deviceCode` en localStorage → pollear `/pair/status` → guardar el `deviceToken` → mandarlo como `Authorization: Device <token>`, y tratar cualquier 401 como "me revocaron, volver a la pantalla de pairing".
- **Sin push.** La rama `feat/164-tv-sucursal` sigue siendo local (staging-first estricto).

## Self-Check: PASSED

- 7/7 archivos declarados como creados existen en disco; 3/3 modificados verificados.
- 3/3 commits de task encontrados en `git log` (`44075eb7`, `c3bc7b78`, `84a6d4d7`).
- Verificacion a nivel plan re-corrida despues de los commits (post-prettier):
  - `npx tsc --noEmit` en `el-templo-api`: limpio.
  - `pnpm vitest run test/tv/tv-pairing.test.ts test/rbac-sets.test.ts`: **25/25 verdes** (17 + 8).
  - `grep -rn 'console\.' src/modules/tv/` → 0 (C-01); `grep -rnE ': any\b|<any>' src/modules/tv/` → 0.
  - Gates de grep del plan: `Math.random` 0, `log.error` 0, `attachCountryScope` en device-routes 0, `createHash("sha256")` 1+1, `isNull(...claimedAt)` 1, `tvDeviceRoutes`/`tvControlRoutes` en `app.ts` 3/3, `fastify.authenticate` en control-routes 1, `requireBranchAccess` en control-routes 8, alfabeto en `schemas.ts` 1.

---

_Phase: 164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-_
_Completed: 2026-07-24_
