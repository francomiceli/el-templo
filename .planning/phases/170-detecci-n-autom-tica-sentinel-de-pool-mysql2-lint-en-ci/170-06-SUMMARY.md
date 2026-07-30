---
phase: 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci
plan: 06
subsystem: database
tags:
  [
    multi-tenancy,
    tenant-id,
    sentinel,
    fastify-plugin,
    drizzle,
    integracion,
    guards,
    fail-closed,
    vitest,
  ]

# Dependency graph
requires:
  - phase: 170-04
    provides: "installSentinel / TenantSentinelError / SentinelHandle — el mecanismo que este plan cablea"
  - phase: 170-02
    provides: "analyzeSql — el recorte de la proyección que este plan prueba contra SQL real"
provides:
  - "El sentinel INSTALADO sobre el único pool de la aplicación, por debajo de Drizzle, con stop() en el onClose"
  - "fastify.dbSentinel — el handle expuesto para los guards y para el volcado del inventario (D-04)"
  - "SENTINEL_INVENTORY documentado en .env.example (D-08)"
  - "test/tenancy/con-05-sentinel.test.ts — 12 tests: 4 guards de cableado + 8 de integración contra SQL real de Drizzle"
  - "Contrato descubierto: el TenantSentinelError llega ENVUELTO en DrizzleQueryError y viaja en la cadena de cause"
  - "Inventario congelado de los consumidores de createDbConnection (5 scripts de desarrollo)"
affects: [170-07, 170-08, 172-adopcion-finance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Guard de orden por lectura del fuente cuando el runtime no puede distinguir: invertir installSentinel y drizzle deja la suite entera en verde, así que lo que se protege es la intención escrita"
    - "Recorrer la cadena de `cause` para identificar un error propio a través de un ORM que lo envuelve"
    - "Greps de guard sobre `src/` con comentarios removidos: si no, el propio docblock que explica el peligro pone el guard en rojo"

key-files:
  created:
    - el-templo-api/test/tenancy/con-05-sentinel.test.ts
  modified:
    - el-templo-api/src/plugins/database.ts
    - el-templo-api/src/db/index.ts
    - el-templo-api/.env.example

key-decisions:
  - "El TenantSentinelError se busca recorriendo `cause` y no con un instanceof directo: a través de Drizzle lo que se atrapa es un DrizzleQueryError. Se decidió NO tocar el sentinel para 'arreglarlo' — el mensaje accionable llega igual porque Node imprime el [cause], y desenvolver errores del ORM no es trabajo del vigilante"
  - "El guard de createDbConnection congela el INVENTARIO de consumidores en vez de exigir cero: la función sí tiene consumidores (5 scripts de desarrollo), y un guard que exige una falsedad se borra en el primer PR que lo toca"
  - "El pool del describe de integración es propio y con strictTables inyectado (D-07): la lista strict real sigue vacía y `src/db/tenant-tables.ts` no se tocó en este plan"

patterns-established:
  - "Dos pruebas negativas registradas y revertidas sin commitear: sacar el wrap de getConnection deja rojo SOLO el it de la transacción; invertir el orden del cableado deja rojo SOLO el guard de orden"

requirements-completed: [CON-05]

# Metrics
duration: 75min
completed: 2026-07-28
---

# Phase 170 Plan 06: Cableado del sentinel e integración contra SQL real Summary

**El sentinel dejó de ser código con tests de laboratorio: está instalado sobre el único pool de la app, por debajo de Drizzle, y hay 12 tests que prueban contra el SQL que el ORM emite de verdad —incluida una transacción— que ve lo que tiene que ver.**

## Performance

- **Duration:** ~75 min
- **Tasks:** 3/3
- **Archivos:** 1 creado (464 líneas), 3 modificados; +541/-8

## Accomplishments

- **El cableado quedó donde tenía que quedar.** `installSentinel(pool, { log: fastify.log })` corre entre `mysql.createPool` y la construcción del ORM, o sea **por debajo de Drizzle**: ve el SQL final del query builder, del `sql` crudo y de cualquier join. Cero `new Proxy` — el pool sigue siendo la MISMA instancia que reciben `dbPool`, el `pool.end()` del `onClose` y 18 sitios de test.
- **`stop()` antes de `pool.end()`.** El resumen periódico es el primer `setInterval` del repo y la suite crea y destruye apps: sin esa línea el timer se acumula app tras app.
- **El trap de la proyección está probado contra SQL real, no contra un string escrito a mano.** `db.select().from(schema.users)` sin `where` —el scan que devolvería los socios de TODOS los gimnasios— llega al driver como `select \`id\`, \`tenant_id\`, … from \`users\``: el literal `tenant_id`ESTÁ en el texto. La aserción verifica las dos cosas a la vez: que el sentinel lanza **y** que el texto que lo disparó contenía`tenant_id`. Ningún pool falso podía producir esa evidencia.
- **Pitfall 1 cerrado con evidencia.** Un `it` ejecuta la query violadora **dentro de `db.transaction()`** y exige el throw. Es el único test del repo que se pone rojo si alguien saca el wrap de `getConnection` — demostrado en vivo (ver Pruebas negativas). Representa los 65 call sites de `.transaction(` de 25 archivos, o sea prácticamente todas las escrituras del sistema.
- **Pitfall 3 cerrado:** una transacción que solo hace queries cumplidoras commitea sin ruido. Drizzle emite `begin`/`commit` por el mismo canal que las queries; si el skiplist de no-DML fallara, el sentinel reventaría toda transacción legítima.
- **Los caminos sin vigilar quedaron declarados y guardados.** `.iterator(` (cero usos hoy; toma la conexión core de callbacks y esquiva el wrap de la capa promise) y `createDbConnection` (segundo pool, sin sentinel) tienen guard propio con mensaje de "qué hacer" escrito para leerse en el CI.
- **`SENTINEL_INVENTORY` documentado** en `.env.example` con el estilo del bloque de Wellhub y la aclaración explícita de que apagado no cambia ningún comportamiento.

## Task Commits

1. **Task 1: Cableado + flag + desmentido de `src/db/index.ts`** — `d04065ba` (feat)
2. **Corrección del desmentido** (ver Desvío 1) — `0efd19dc` (fix)
3. **Task 2: Batería de integración contra SQL real de Drizzle** — `0bc8e838` (test)
4. **Task 3: Guards de cableado y de caminos sin vigilar** — `1ce71b83` (test)

## Files Created/Modified

- `el-templo-api/src/plugins/database.ts` — **modificado** (+32). `installSentinel` entre el pool y el ORM, `dbSentinel` declarado en `FastifyInstance` y decorado, `sentinel.stop()` en el `onClose`. El comentario del bloque evita nombrar la llamada al ORM tal cual: el guard de orden compara posiciones de texto y una mención en prosa lo rompería (queda escrito ahí mismo para que nadie lo "arregle").
- `el-templo-api/src/db/index.ts` — **modificado** (+34/-8). `createDbConnection` ya no dice que la usa la aplicación; dice quién la usa de verdad, que crea un segundo pool sin vigilancia y qué hacer si hace falta uno. `createSingleConnection` suma la nota de alcance (devuelve `Connection`, no `Pool`; la cubre la regla `--tenant` de la 169). Prettier reformateó el archivo entero (comillas simples → dobles): nunca había pasado por el hook, y lint-staged lo habría hecho igual en el checkout principal.
- `el-templo-api/.env.example` — **modificado** (+11). Bloque de `SENTINEL_INVENTORY`, comentado por opcional.
- `el-templo-api/test/tenancy/con-05-sentinel.test.ts` — **nuevo**, 464 líneas, **12 tests** en 2 `describe` (el plan pide ≥ 7 en el de integración y que el de guards corra primero).

## Decisions Made

- **El error se busca por la cadena de `cause`, y el sentinel no se toca.** Ver el hallazgo abajo. La alternativa era hacer que el sentinel lanzara algo que Drizzle no envolviera (imposible: envuelve todo lo que sale del driver) o desenvolver desde el llamador. Se eligió documentar el contrato y dar un helper en el test: el mensaje accionable llega igual porque Node y Vitest imprimen el `[cause]`, y el `it` dedicado avisa si un upgrade de Drizzle cambia el comportamiento.
- **El guard de segundo pool congela un inventario, no exige cero.** El plan pedía afirmar que `createDbConnection` no tiene consumidores. Tiene 5. Un guard que afirma algo falso no sobrevive al primer PR; uno que congela la lista conocida se pone rojo exactamente cuando importa (un consumidor NUEVO, sobre todo si es código de la aplicación) y trae escrito qué hacer.
- **Los greps de guard corren sobre el código sin comentarios.** Es el hallazgo de la 169 aplicado: el grep crudo de `tenant-safe:` daba 11 archivos y solo 9 eran exenciones. Acá pasaba lo mismo con `createDbConnection`, cuyo docblock la nombra seis veces para explicar por qué no usarla.
- **El `it` del INSERT limpia con un DELETE filtrado por `tenantWhere`**, así que de paso ejercita una escritura cumplidora sobre la misma tabla strict.

## Deviations from Plan

### 1. [Rule 1 - Bug] `createDbConnection` SÍ tiene consumidores: el plan (y el 170-04-SUMMARY) afirmaban cero

- **Found during:** Task 1 → Task 3
- **Issue:** El plan pedía escribir en `src/db/index.ts` que la función tiene **CERO** consumidores y afirmarlo con un guard. El grep dice otra cosa: la llaman 5 archivos de `src/modules/sessions/validation/` (`generate-10-clean`, `generate-10-sessions`, `run-validation`, `test-initium-variety`, `verify-formats`). El Task 1 alcanzó a commitear la afirmación falsa.
- **Fix:** Se verificó qué son esos archivos: scripts de desarrollo del algoritmo de sesiones (`console.log`, `process.exit`, `dotenv/config`), que **nadie importa desde el runtime del server** y que no tienen script de `package.json`. O sea que la conclusión de fondo del plan se sostiene —el único pool de la APLICACIÓN sigue siendo el de `plugins/database.ts`— pero la redacción no. Comentario corregido y guard reformulado a "inventario congelado". De paso se corrigió el "~8 scripts CLI" de `createSingleConnection`: son 14.
- **Files modified:** `el-templo-api/src/db/index.ts`, `el-templo-api/test/tenancy/con-05-sentinel.test.ts`
- **Verification:** `grep -rl createDbConnection src/` da exactamente esos 5 + la definición; el guard lo afirma.
- **Committed in:** `0efd19dc` (corrección) y `1ce71b83` (guard)
- **Nota:** el mensaje del commit `0efd19dc` dice "6 scripts" — son 5. El código y el guard dicen 5.

### 2. [Rule 2 - Missing critical] El `TenantSentinelError` llega ENVUELTO a través de Drizzle

- **Found during:** Task 2 (primera corrida: 2 tests rojos)
- **Issue:** Los dos `it` que exigían el throw fallaron con `expected Error: Failed query: select \`id\`, \`tenant… to be an instance of TenantSentinelError`. **Drizzle no propaga el error del driver tal cual**: lo envuelve en un `DrizzleQueryError`y deja el original en`cause`. Los tests unitarios del plan 04 llaman a `pool.query`derecho y ven el error pelado, así que este contrato solo podía aparecer acá. Es importante más allá del test: cualquier`catch (e) { if (e instanceof TenantSentinelError) … }` escrito sobre una llamada al ORM **no entra nunca**.
- **Fix:** No se cambió el sentinel para acomodar el test. Se agregó el helper `sentinelErrorDe()` que recorre la cadena de `cause`, un `it` dedicado que congela el contrato (`el error atrapado NO es instanceof TenantSentinelError, pero su cause SÍ`) y una sección del docblock del archivo. Si un upgrade de Drizzle deja de envolver o pierde el `cause`, ese `it` lo dice.
- **Files modified:** `el-templo-api/test/tenancy/con-05-sentinel.test.ts`
- **Verification:** 12/12 en verde; el `it` del contrato afirma las tres cosas (envoltura, `cause`, y que el mensaje accionable sigue adentro).
- **Committed in:** `0bc8e838`

### 3. [Rule 3 - Blocking] El worktree es `et-170-sentinel`, no `et-170-deteccion`

- **Found during:** arranque
- **Issue:** El `<context>` del plan y sus tres bloques `<verify>` referencian `/home/franco/projects/et-170-deteccion`, que no existe.
- **Fix:** Se trabajó en `/home/franco/projects/et-170-sentinel` (rama `feat/170-sentinel-lint`) — mismo desvío ya registrado en los SUMMARY 01 a 05. Cero worktrees nuevos.
- **Files modified:** ninguno
- **Committed in:** n/a

### 4. [Rule 3 - Blocking] Task 2 y Task 3 escriben el MISMO archivo: se commitearon en dos estados verdes reales

- **Found during:** Task 3
- **Issue:** El plan asigna a los dos tasks el mismo `test/tenancy/con-05-sentinel.test.ts`, y el contrato de ejecución pide un commit por task.
- **Fix:** El commit del Task 2 contiene el archivo SIN el `describe` de guards (303 líneas, 8 tests) y se corrió verde en ese estado antes de commitear; el Task 3 lo agrega (464 líneas, 12 tests) y se volvió a correr. Ningún commit quedó "verde por casualidad" ni contiene código que no se ejecutó.
- **Files modified:** ninguno más allá de lo listado
- **Committed in:** `0bc8e838` y `1ce71b83`

---

**Total deviations:** 4 (1 × Rule 1 — afirmación falsa heredada del plan; 1 × Rule 2 — contrato de error que el plan no contemplaba; 2 × Rule 3 — entorno y proceso)
**Impact on plan:** Ninguno sobre lo entregado. El cableado, el flag, la batería y los cuatro guards salieron como los especifica el plan; lo único que cambió de forma es el guard de `createDbConnection` (inventario congelado en vez de "cero consumidores"), porque el plan partía de un dato equivocado. Cero dependencias, cero migraciones, cero `any`, cero `console.`, `src/db/tenant-tables.ts` intacto.

## Pruebas negativas (fail-closed demostrado en vivo)

### 1. Sin el wrap de `getConnection`, solo cae el `it` de la transacción

Sonda temporal en `src/db/sentinel/install.ts` (`if ((false as boolean) && conn[SENTINEL_MARK] !== true) {`): la conexión devuelta por el pool deja de decorarse.

Resultado: **1 failed | 11 passed**. El único rojo es
`REGRESIÓN PITFALL 1: una query sin filtro de tenant DENTRO de db.transaction() también se ve`.
Los otros 11 —incluido el trap de la proyección, que va por `pool.query`— siguieron verdes: el rojo señala la causa exacta y nada más. Sonda **revertida sin commitear**.

### 2. Con el cableado invertido, solo cae el guard de orden

Sonda temporal en `src/plugins/database.ts`: `installSentinel(...)` movido DEBAJO de la construcción del ORM.

Resultado: **1 failed | 11 passed**. El único rojo es el guard de orden. **Y ese resultado es el argumento del guard:** en runtime el orden da igual (el sentinel muta el mismo objeto `pool` y el ORM lo lee recién al ejecutar una query), así que ningún test de comportamiento —tampoco el guard de runtime, que quedó verde— puede ver la diferencia. Lo que protege la comparación de posiciones es la **intención escrita**: el día que alguien decida envolver el ORM en vez del pool (eso sí cambia el resultado y deja afuera el SQL crudo), es lo único que se pone rojo. Quedó escrito en el `it`. Sonda **revertida sin commitear**.

## Issues Encountered

- **`test/finance/cash-balances.test.ts` falló a nivel ARCHIVO en la corrida de humo en paralelo** (26 archivos, 4 workers): `1 failed | 25 passed` de archivos con **423 tests pasados y cero tests fallados**. Corrido solo, pasa en 100 s con sus 3 tests en verde. Es el hallazgo 169-07 otra vez (el `setupFiles` provisiona MySQL para todo archivo y bajo contención se roza el `hookTimeout`), no una regresión del sentinel.
- **Los hooks de husky no corren en este worktree** (`core.hooksPath` apunta a `.husky/_`, que no existe en el checkout linkeado). Se corrió `prettier --write` a mano sobre los archivos tocados antes de cada commit.
- El provisioning del worker cuesta ~75-95 s por corrida de este archivo; los 12 tests corren en milisegundos. Reconfirma D-09.

## Verification Results

| Verificación                                                    | Resultado                                                                    |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm exec tsc --noEmit`                                        | ✅ exit 0 (después de cada task y al cierre)                                 |
| `pnpm exec vitest run test/tenancy/con-05-sentinel.test.ts`     | ✅ **12 tests passed** y TERMINA solo (sin cuelgue)                          |
| Guard de cableado: `installSentinel(` antes de `drizzle(pool`   | ✅ líneas 55 y 57 de `src/plugins/database.ts`                               |
| `new Proxy` en `src/plugins/database.ts`                        | ✅ 0                                                                         |
| `dbSentinel` declarado en `declare module "fastify"` y decorado | ✅                                                                           |
| `stop()` antes de `pool.end()` en el `onClose`                  | ✅                                                                           |
| `SENTINEL_INVENTORY` en `.env.example`, comentado y con prosa   | ✅                                                                           |
| Tests del describe de integración                               | ✅ 8 (el plan pide ≥ 7)                                                      |
| `it` de la query violadora dentro de `db.transaction(`          | ✅ con prueba negativa registrada                                            |
| `it` del trap con "proyección" en el nombre                     | ✅                                                                           |
| `afterAll` con `stop()` + `pool.end()`                          | ✅                                                                           |
| `git diff src/db/tenant-tables.ts`                              | ✅ sin cambios en este plan (la lista strict se inyecta por parámetro, D-07) |
| Humo: `test/tenancy/` + `test/finance/`                         | ✅ 423 tests passed (1 archivo con flake de provisioning, ver Issues)        |
| Diff acotado                                                    | ✅ 4 archivos, +541/-8                                                       |
| Migraciones de DB                                               | ✅ ninguna (numeración sigue reservada desde 0197)                           |
| `pnpm-lock.yaml`                                                | ✅ sin cambios — cero dependencias instaladas o actualizadas                 |
| `STATE.md` / `ROADMAP.md`                                       | ✅ NO modificados por este ejecutor                                          |

## User Setup Required

Ninguna. `SENTINEL_INVENTORY` es opcional y está comentada: sin ella el sentinel corre en modo normal. En `.env` de prod/staging no hace falta tocar nada — ahí el modo es `log` y nunca `throw`.

## Next Phase Readiness

**Listo para el plan 07/08:**

- El handle está expuesto como `app.dbSentinel`, así que el volcado del inventario de D-04 (correr la suite con `SENTINEL_INVENTORY=1` y leer `report()`) ya tiene de dónde agarrarse.
- Recordar el hallazgo de la 170-02 al leer ese inventario: las 9 exenciones `tenant-safe:` de la fase 169 **no viajan en el SQL** (D-17), así que van a aparecer como violaciones no-strict. Es correcto y es deuda real.
- **Dato nuevo para quien escriba código que atrape el error del sentinel:** llega envuelto en `DrizzleQueryError`; hay que mirar `cause`.
- **Para la fase 172 (adopción de finance):** el día que una tabla entre a `TENANT_STRICT_MODULES`, el `it` de runtime de este archivo (que hace un `select` sin filtro sobre `bookings`) sigue siendo seguro solo mientras `bookings` no sea strict. Está escrito en el propio test qué hacer entonces: filtrarlo con `tenantWhere`, no aflojar el guard.

**Sin blockers.** Nada se pusheó ni se mergeó: los cuatro commits viven en la rama local `feat/170-sentinel-lint` del worktree.

## Threat Flags

Ninguna superficie nueva: cero endpoints, cero rutas de auth, cero acceso a archivos nuevo, cero cambios de schema, cero dependencias. El plan **mitiga** T-170-01 (el `it` de la transacción, con prueba negativa), T-170-08 (comentario corregido en `src/db/index.ts` + guards de `.iterator(` y de segundo pool), T-170-18 (la transacción cumplidora commitea; en prod el modo es log y nunca throw), T-170-07 (`stop()` en el `onClose` + `afterAll` que cierra pool y handle) y T-170-19 (guard de orden por lectura del fuente, con prueba negativa demostrada). T-170-02 queda en `accept` como preveía el plan: el logger de este archivo es falso, `LOG_LEVEL` es silent y el SQL ya viene con placeholders. T-170-SC cerrado: cero paquetes instalados.

## Self-Check: PASSED

- Archivos: `el-templo-api/test/tenancy/con-05-sentinel.test.ts`, `el-templo-api/src/plugins/database.ts`, `el-templo-api/src/db/index.ts`, `el-templo-api/.env.example` y este SUMMARY existen en disco.
- Commits: `d04065ba`, `0efd19dc`, `0bc8e838` y `1ce71b83` existen en `feat/170-sentinel-lint`.
- `STATE.md` y `ROADMAP.md` NO fueron modificados por este ejecutor (los escribe el orquestador).

---

_Phase: 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci_
_Plan: 06_
_Completed: 2026-07-28_
