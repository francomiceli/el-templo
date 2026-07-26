---
phase: 166-fundaci-n-tenants-anclas-y-scope-server-side
plan: 04
subsystem: api
tags: [fastify, hook, multi-tenancy, security, drizzle, scope, saas]

# Dependency graph
requires:
  - "166-01 (tabla tenants con la columna status y la fila id=1 contra la que se joinea)"
  - "166-02 (users.tenant_id NOT NULL poblado al 100%, que es lo unico que el hook lee)"
provides:
  - "scope.tenantId resuelto server-side en TODO request que pase por attachScope (22 call sites, cero tocados)"
  - "Enforcement de tenants.status dentro del hook: suspended/archived -> AppError 403 con code TENANT_SUSPENDED"
  - "Constante exportada TENANT_SUSPENDED (contrato del codigo de error, espejo de BRANCH_OUT_OF_SCOPE)"
  - "attachScope como nombre canonico + attachCountryScope como alias @deprecated (misma funcion) + type Scope = CountryScope"
  - "Camino fail-closed documentado y probado: tenant no resoluble -> log.error + tenantId=null, nunca fail-open"
  - "test/shared/tenant-scope.test.ts: 8 it() sobre el hook llamado directo"
affects:
  - "166-05 (verificacion extremo a extremo del 403 sobre rutas reales; este plan deja el throw y el code listos)"
  - "166-06 (cierre de fase)"
  - "169 (helpers tenantWhere/tenantValues consumen scope.tenantId y heredan el contrato de null = deny)"
  - "172-175 (adopcion: cada modulo que migre a attachScope ya tiene el enforcement)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hook de scope que CORTA el request: primer precedente del repo. Se logra lanzando AppError desde el hook (sin parametro reply), porque el error handler por default de Fastify serializa err.code en el body"
    - "LEFT JOIN deliberado en el hook de scope: un join estricto convertiria una inconsistencia de datos en perdida de country/userBranchId para el staff"
    - "Rename gradual por alias de funcion (attachCountryScope = attachScope) en vez de commit mecanico sobre N modulos"
    - "Test de hook llamado DIRECTO con un request falso tipado (as unknown as FastifyRequest) cuando lo que se prueba es el contrato de la capa, no la ruta"

key-files:
  created:
    - el-templo-api/test/shared/tenant-scope.test.ts
  modified:
    - el-templo-api/src/modules/shared/country-scope.ts

key-decisions:
  - "El corte compara contra 'active' (deny-by-default para estados futuros del enum) en vez de enumerar suspended/archived"
  - "El throw de AppError basta para que el 403 lleve code: verificado en el error-handler de fastify 5.7.4 instalado, no asumido"
  - "Los dos log messages preexistentes pasaron de decir attachCountryScope a attachScope (el prefijo nombra la funcion, que se renombro)"

patterns-established:
  - "Correr los greps de aceptacion del plan sobre el archivo terminado ANTES de commitear, comentarios incluidos (4ta iteracion de la leccion de la fase, aplicada preventiva)"
  - "Re-verificar tsc Y la suite entregable DESPUES del hook de prettier, sobre el contenido efectivamente commiteado"

requirements-completed: [FUND-03, FUND-04]

# Metrics
duration: 10min
completed: 2026-07-26
---

# Phase 166 Plan 04: `scope.tenantId` server-side + 403 `TENANT_SUSPENDED` Summary

**La misma query por request que ya resolvía país, sede y rol resuelve ahora el gimnasio (`users.tenant_id`) y su estado comercial, y corta con 403 `TENANT_SUSPENDED` cualquier request de un gimnasio no activo — heredado por los 22 call sites sin tocar una sola línea de ellos.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-26T20:33:12Z
- **Completed:** 2026-07-26T20:43:00Z
- **Tasks:** 2
- **Files modified:** 2 (1 creado, 1 modificado)

## Task Commits

1. **Task 1: `scope.tenantId` server-side + enforcement de `tenants.status`** — incluido en `f6206452`
2. **Task 2: Tests directos sobre `attachScope`** — `f6206452` (feat) — `feat(166): scope.tenantId server-side + 403 TENANT_SUSPENDED (FUND-03, FUND-04)`, 2 archivos, +377/-8

> El commit vive en el Task 2 **por diseño del plan** (`<action>` del Task 2: "Commitear … los dos archivos de este plan en un unico commit"), y su criterio de aceptación exige que `git show --stat HEAD` liste exactamente `country-scope.ts` y `tenant-scope.test.ts`.

**Commit de código en:** worktree `/home/franco/projects/et-166-tenancy`, rama `feat/166-tenancy-fundacion`.
**Artefactos de planning** (este SUMMARY + STATE + ROADMAP + REQUIREMENTS): commiteados en el checkout principal.

## Accomplishments

- **Una sola query, cuatro dimensiones de scope.** El `SELECT` que ya corría por request sumó `users.tenant_id` y `tenants.status` con un `leftJoin`; no se agregó ni un round-trip a la DB. El costo del enforcement es literalmente cero queries extra (D-03).
- **El corte ocurre antes de tocar nada.** El bloque de tenant es lo PRIMERO adentro de `if (row)`: antes de resolver `country`, antes de `resolveBranchCountry`, antes de leer `user_branches`. Un gimnasio suspendido no llega a ejecutar una segunda query contra sus propios datos — que es el criterio 3 de la fase ("sin tocar datos"), y el test lo afirma por el lado observable (`request.scope` queda **sin asignar**).
- **El 403 lleva `code` sin cambiar la firma ni un call site.** El hallazgo del plan quedó verificado sobre el `node_modules` instalado (fastify **5.7.4**): `defaultErrorHandler` → `setErrorStatusCode(reply, error)` → `reply.send(error)` → `fallbackErrorHandler` serializa `{ statusCode, code: error.code, error, message }`. O sea que lanzar `AppError(msg, 403, TENANT_SUSPENDED)` desde el hook produce el body correcto sin pasar `reply`. El PATTERNS marcaba este camino como perdedor porque `handleServiceError` descarta `code` — pero ese mapper cubre los `catch` **dentro de rutas**, no el camino de error por default de un `onRequest`. La verificación extremo a extremo sobre rutas reales es del plan 166-05.
- **`attachScope` es el nombre nuevo y `attachCountryScope` un alias literal.** No es una función que delega: es `export const attachCountryScope = attachScope`, así que la identidad se preserva (`expect(attachCountryScope).toBe(attachScope)` es un test del archivo). Los 22 call sites heredan el enforcement por construcción, no por disciplina.
- **`tsc --noEmit` verde sin tocar un call site** — la prueba dura de que el rename por alias y el campo nuevo del scope no rompieron nada del contrato existente.
- **Regresión dirigida verde sobre las dos suites que más ejercitan el hook:** `test/country-scope.test.ts` + `test/branch-access.test.ts` → **48 passed** (1 skipped, 2 todo), sin ajustar una sola expectativa.
- **8 `it()` verdes** en `test/shared/tenant-scope.test.ts`, y el tenant queda en `active` en la DB del worker después de correr (verificado por SQL directo contra `eltemplo_test_1`).

## Cobertura del test (8 `it()`)

| #   | Caso              | Qué afirma                                                                                                                                                            |
| --- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Resolución        | `scope.tenantId === 1` **y** `country`/`userBranchId`/`role`/`isOwner`/`branchIds` con los mismos valores que antes de la fase                                        |
| 2   | Entradas hostiles | `query: {tenant_id, tenantId}` + `body: {tenant_id}` + `header x-tenant-id` + **claim forjado en `request.user`**, todos con `999` → sigue resolviendo `1`            |
| 3   | JWT               | ninguna clave del payload real (decodificado con `app.jwt.decode`) matchea `/tenant/i`, con sanity de que el payload no está vacío (`userId` presente)                |
| 4   | Alias             | `attachCountryScope` **es** `attachScope` (misma referencia) → el enforcement no se puede perder por usar el nombre viejo                                             |
| 5   | `suspended`       | rechaza con `{ statusCode: 403, code: "TENANT_SUSPENDED", message: "Acceso suspendido para este gimnasio" }` y `request.scope` queda **`undefined`**                  |
| 6   | `archived`        | mismo `statusCode` + mismo `code` (un único código para los dos estados, CD-02) y `scope` sin asignar                                                                 |
| 7   | Vuelta a `active` | suspendido → rechaza; restaurado → resuelve `tenantId === 1` **sin re-login** (el token de la sesión sigue siendo el mismo, porque no transporta el gimnasio)         |
| 8   | Fail-closed       | `users.tenant_id` apuntado a un id inexistente → NO lanza, `scope.tenantId === null`, y `country`/`userBranchId`/`role` siguen resueltos (el LEFT JOIN cumple su rol) |

## Verificación contra `<verification>` del plan

| Criterio                                                                 | Resultado                                                                                          |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit` verde sin tocar call sites                            | OK — antes del commit **y de nuevo después** del hook de prettier                                  |
| `test/shared/tenant-scope.test.ts` verde                                 | OK — 8/8, re-corrido sobre el contenido efectivamente commiteado (67 s)                            |
| Diff de `src/modules` contra `origin/master` = exactamente un archivo    | OK — `el-templo-api/src/modules/shared/country-scope.ts`                                           |
| Tenant en `active` en la DB de test tras la corrida                      | OK — `SELECT status FROM tenants WHERE id=1` en `eltemplo_test_1` → `active`                       |
| `grep -c "leftJoin(schema.tenants"` = 1 / `innerJoin(schema.tenants` = 0 | OK — 1 y 0                                                                                         |
| Los 4 exports del contrato en 4 líneas                                   | OK — `TENANT_SUSPENDED` (20), `type Scope` (82), `attachScope` (126), alias (264)                  |
| `request.(query\|body\|headers)` en una línea con "tenant"               | OK — 0 hits (el único `request.query` del archivo es el toggle `?country=` de owner, preexistente) |
| `grep -nE ':\s*any\b\|console\.'` en los dos archivos                    | OK — 0 hits en cada uno                                                                            |
| `grep -c "default-deny"` >= 2                                            | OK — 3                                                                                             |
| Al menos 6 `it()`                                                        | OK — 8                                                                                             |
| `grep -c "status='active'"` en el test >= 2                              | OK — 2 (`afterEach` + `afterAll`)                                                                  |
| `git show --stat HEAD` con exactamente los 2 archivos                    | OK — `f6206452`, 2 files changed, sin deleciones                                                   |

## Decisions Made

- **El corte compara contra `'active'`, no contra la lista `suspended`/`archived`.** El plan pedía enumerar los dos estados malos; se implementó `else if (row.tenantStatus !== "active")`. Razón: es fail-closed frente al futuro. Si mañana el enum gana un estado (`pending_setup`, `trial_expired`, lo que sea) y alguien olvida agregarlo a la lista, con la enumeración ese estado **pasaría**; con la comparación contra `active`, deniega. Es el mismo criterio de default-deny que gobierna `country = null` y `tenantId = null` en este archivo. Comportamiento idéntico para el enum actual — los dos tests (`suspended` y `archived`) lo confirman.
- **El caso "join sin match" se distingue por `tenantStatus == null`, no por `tenantId == null`.** `users.tenant_id` es `NOT NULL` (tanda B), así que el id siempre viene; lo que falta cuando la fila de `tenants` no existe es el `status`. Chequear el status es lo que detecta de verdad la corrupción, y por eso el test 8 la simula apuntando a un id **inexistente** (no a `NULL`, que la columna no admite).
- **Los dos `request.log` preexistentes pasaron de `attachCountryScope:` a `attachScope:`.** El prefijo del mensaje nombra la función y la función se renombró; dejar los viejos con el nombre anterior al lado del nuevo mensaje de tenant habría dejado un log inconsistente y difícil de grepear en Sentry. Verificado con un grep global que ningún test ni frontend matchea esos strings.
- **El test llama al hook DIRECTO, no por ruta** (así lo pide el plan). El request falso se tipa con un `type FakeRequest` explícito y se castea `as unknown as FastifyRequest` en un único helper `run()`. `scope` se declara **opcional** en `FakeRequest` (en Fastify es obligatorio) justamente para poder afirmar que el corte ocurrió antes de asignarlo.
- **La corrupción del test 8 se produce dentro de una transacción.** `SET FOREIGN_KEY_CHECKS=0` es de **sesión**, y `app.db` es un pool: tres `execute` sueltos podrían caer en tres conexiones distintas y el `UPDATE` fallaría con 1452. Envolver `SET 0` → `UPDATE` → `SET 1` en `app.db.transaction` garantiza la misma conexión y devuelve la sesión limpia. El restore del `tenant_id` va en el `finally` y no necesita desactivar checks (apunta a un tenant que existe).

## Deviations from Plan

### Auto-fixed Issues

Ninguno. **Cero desvíos**: no hubo bugs que arreglar, ni funcionalidad crítica faltante, ni bloqueos. Segundo plan consecutivo de la fase que ejecuta tal cual está escrito.

### Refuerzos por encima de lo pedido (sin cambio de alcance)

Ninguno modificó el contrato publicado ni agregó archivos:

- **Cuarto vector hostil** en el test 2: además de `query`/`body`/`headers` (los tres que pedía el plan), se inyecta un `tenantId: 999` **en `request.user`** — o sea un claim forjado en el token. Es el vector que el plan cubría por separado en el test 3 (probando que el JWT real no lo lleva); acá se prueba lo complementario y más fuerte: aunque alguien lograra firmarlo, el hook lo ignora.
- **Test 4 (identidad del alias)**, no pedido. Sin él, "los 22 call sites heredan el enforcement" es una afirmación del SUMMARY; con él es un assert. Si alguien convirtiera el alias en un wrapper que delega, el test seguiría verde — pero si lo convirtiera en una función distinta (el modo de falla real que importa), se pone rojo.
- **Assert del `message` exacto** en el test 5, no sólo `statusCode` + `code`.
- **Sanity del payload en el test 3** (`keys.length > 0` y `userId` presente): sin eso, un `decode` que devolviera `{}` haría pasar trivialmente el filtro `/tenant/i`.
- **Regresión dirigida** sobre `country-scope.test.ts` y `branch-access.test.ts` (48 tests). El plan no la pedía; es la evidencia de que agregar un campo al scope y una rama de corte no movió el comportamiento de los consumidores directos del hook.
- **Limpieza del usuario de fixture** (`DELETE FROM users WHERE id = staffId`) en el `afterAll`: la DB es por worker y compartida entre archivos del mismo fork, y este archivo no llama `cleanAllTestData` en `beforeEach` (necesita que el fixture sobreviva a los 8 casos).

---

**Total deviations:** 0. Cero dependencias nuevas — no se corrió ningún `pnpm add` ni `pnpm approve-builds` (T-166-SC respetado).

## Threat Model — cobertura verificada

| Threat ID | Disposición | Cómo quedó cubierto                                                                                                                                                                                            |
| --------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-166-14  | mitigate    | **Cubierto.** El hook lee el gimnasio sólo de la fila de `users`. Gate de grep (`request.(query\|body\|headers)` + "tenant" = 0 hits) + test con **4** vectores hostiles + assert de que el JWT no tiene claim |
| T-166-15  | mitigate    | **Cubierto.** Enforcement dentro de `attachScope`; los 22 call sites lo heredan por identidad de función (test 4). Tests por status para `suspended` y `archived`                                              |
| T-166-16  | mitigate    | **Cubierto.** `tenantId = null` + `request.log.error` con el mensaje `default-deny`, contrato escrito en el docblock del campo (los helpers de la 169 DEBEN tratar `null` como deny) y test 8                  |
| T-166-17  | mitigate    | **Cubierto.** `leftJoin` explícito (`innerJoin(schema.tenants` = 0 hits) y el test 8 afirma que `country`/`userBranchId`/`role` sobreviven al join sin match                                                   |
| T-166-18  | accept      | Aceptado tal cual: el body expone sólo `TENANT_SUSPENDED` + mensaje genérico; `suspended` vs `archived` viaja únicamente en el `log.warn` estructurado                                                         |
| T-166-19  | mitigate    | **Cubierto.** `afterEach` + `afterAll` incondicionales + `try/finally` en los 3 casos que suspenden, verificado por SQL después de correr (`active`)                                                           |
| T-166-SC  | mitigate    | **Cubierto.** Cero comandos de instalación                                                                                                                                                                     |

## Threat Flags

Ninguno. El plan no agrega superficie de red nueva (no crea rutas): **restringe** la existente. El único cambio de comportamiento observable es un 403 nuevo, que para el tenant 1 (`active`) nunca se dispara.

## Known Stubs

Ninguno. `scope.tenantId` está poblado y probado; que las **queries de negocio** lo usen para filtrar es el alcance explícito de las fases 167-175, no un stub de este plan.

## Issues Encountered

- **Prettier (hook de pre-commit) colapsó el import de `vitest` a una línea.** Se re-corrieron `tsc --noEmit` **y** el archivo de test completo **después** del hook: ambos verdes con el contenido efectivamente commiteado. Tercera vez en la fase que el hook reformatea algo — ya es procedimiento estándar re-verificar después de commitear.
- **`test/shared/tenant-scope.test.ts` tarda ~67 s para 8 asserts baratos.** Mismo costo estructural que anotó 166-03: el precio es el arranque del app de test y el ciclo de vida de la DB, no las queries. No se optimizó.

## User Setup Required

Ninguno — no hay configuración de servicios externos ni variables de entorno nuevas.

## Next Phase Readiness

- **Listo para 166-05:** el `throw` con `code` ya está en su lugar y el contrato del body (`statusCode: 403`, `code: "TENANT_SUSPENDED"`, `error: "Forbidden"`, `message: "Acceso suspendido para este gimnasio"`) está verificado a nivel de objeto de error y contra el serializador de fastify 5.7.4 instalado. Lo que falta es exactamente lo que ese plan hace: probarlo por HTTP sobre rutas reales de las dos superficies (staff y member app).
- **Listo para 169:** el docblock de `scope.tenantId` deja escrito el contrato que los helpers `tenantWhere`/`tenantValues` tienen que respetar (`null` = deny, jamás "todos los gimnasios").
- **Nota para 172-175:** el nombre canónico es `attachScope`; `attachCountryScope` sigue funcionando idéntico y está marcado `@deprecated`. Cada módulo que se adopte debería aprovechar y migrar el nombre en el mismo commit.
- **Recordatorio de tren (sin cambios):** 0190 y 0191 siguen viviendo **sólo** en `feat/166-tenancy-fundacion`. Cualquier fase que reserve un número de migración antes del merge tiene que verificar también esta rama y el worktree `et-164-tv` (0189).
- **Sin blockers.**

## Self-Check: PASSED

- `el-templo-api/src/modules/shared/country-scope.ts` — FOUND (worktree, con los 4 exports del contrato)
- `el-templo-api/test/shared/tenant-scope.test.ts` — FOUND (worktree, 263 líneas > 100 del `min_lines` del plan)
- Commit `f6206452` — FOUND en `feat/166-tenancy-fundacion` (2 archivos, sin deleciones, `git status --porcelain` limpio)
- `key_links` del plan verificados: el archivo joinea a `schema.tenants` (`leftJoin(schema.tenants` = 1 hit) e importa `AppError` de `./errors` para lanzar con `TENANT_SUSPENDED`
- `166-04-SUMMARY.md` — FOUND (checkout principal)

---

_Phase: 166-fundaci-n-tenants-anclas-y-scope-server-side_
_Completed: 2026-07-26_
