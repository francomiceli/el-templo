---
phase: 166-fundaci-n-tenants-anclas-y-scope-server-side
plan: 05
subsystem: testing
tags: [vitest, fastify, integration, multi-tenancy, security, regression, saas]

# Dependency graph
requires:
  - "166-04 (attachScope con el throw de AppError 403 + la constante TENANT_SUSPENDED)"
  - "166-01/166-02 (tenants con status + users.tenant_id poblado)"
provides:
  - "test/shared/tenant-suspension-routes.test.ts: 11 it() que prueban el enforcement por HTTP sobre 3 rutas reales de 2 modulos distintos + login"
  - "Evidencia empirica de que el body del 403 lleva code TENANT_SUSPENDED y error Forbidden atravesando Fastify (ya no es una lectura del codigo del framework)"
  - "Evidencia de que la suspension alcanza la member app y NO al login (CD-01 verificado, no asumido)"
  - "Gate de regresion de la fase: 66 archivos / 863 tests verdes sin tocar una sola expectativa existente"
  - "Inventario cerrado del diff de la fase: exactamente 10 archivos contra origin/master"
affects:
  - "166-06 (cierre de fase: la evidencia de FUND-03/FUND-04 extremo a extremo ya esta producida)"
  - "167-176 (el molde de test de suspension por ruta se reusa cuando cada modulo adopte tenantWhere)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Snapshot de superficies (status + ids) capturado ANTES de suspender y comparado con toEqual despues de restaurar: la restauracion se prueba por igualdad estructural, no por 'volvio a dar 200'"
    - "El assert de statusCode va INLINE en cada it y solo el contrato del body vive en un helper — un helper que envuelva todo esconde cual ruta fallo"
    - "Login emitido CON el gimnasio suspendido y usado inmediatamente contra una ruta scoped: prueba que el corte es del scope y no de la sesion"

key-files:
  created:
    - el-templo-api/test/shared/tenant-suspension-routes.test.ts
  modified: []

key-decisions:
  - "Se seedea un plan AR en el beforeAll para que el catalogo de la member app devuelva contenido: un 200 sobre lista vacia no prueba nada"
  - "El caso de restauracion compara el snapshot completo (3 status + los ids del listado) contra el control, no solo los status"
  - "Cero commits en el Task 2: el plan lo declara 'ninguno (solo ejecucion y evidencia)'"

patterns-established:
  - "Correr los greps de aceptacion ANTES y DESPUES del hook de prettier (cuarta iteracion consecutiva de la leccion de la fase)"

requirements-completed: [FUND-03, FUND-04]

# Metrics
duration: 27min
completed: 2026-07-26
---

# Phase 166 Plan 05: Enforcement de tenant verificado extremo a extremo Summary

**Con el gimnasio suspendido, las tres superficies autenticadas probadas (dos rutas de admin de módulos distintos y el catálogo de la member app) responden exactamente 403 con `code: "TENANT_SUSPENDED"` en el body HTTP, el login sigue devolviendo 200, y al volver a `active` las respuestas son idénticas a las del control — con 66 archivos de test y 863 casos verdes sin ajustar una sola expectativa existente.**

## Performance

- **Duration:** ~27 min (de los cuales ~10 min son la corrida de la regresión dirigida y ~2 min las dos corridas del archivo nuevo)
- **Started:** 2026-07-26T20:47:26Z
- **Completed:** 2026-07-26T21:14:00Z
- **Tasks:** 2
- **Files modified:** 1 (1 creado, 0 modificados)

## Task Commits

1. **Task 1: Integración del enforcement por status sobre rutas reales** — `e6cab5f6` — `test(166): 403 TENANT_SUSPENDED extremo a extremo en rutas admin y member`, 1 archivo, +438
2. **Task 2: Gate de regresión dirigido de la fase** — sin commit **por diseño del plan** (`<files>ninguno (solo ejecucion y evidencia)</files>`). La evidencia vive en este SUMMARY.

**Commit de código en:** worktree `/home/franco/projects/et-166-tenancy`, rama `feat/166-tenancy-fundacion`.
**Artefactos de planning** (este SUMMARY + STATE + ROADMAP + REQUIREMENTS): commiteados en el checkout principal.

## Accomplishments

- **El hallazgo del plan 166-04 quedó confirmado por HTTP, no por lectura del framework.** El docblock de `AppError` dice explícitamente que "el error handler por default de las rutas NO serializa `code`" — y es cierto para el mapper de los `catch` dentro de rutas. El camino de un `throw` desde un hook `onRequest` es otro: la app no registra ningún `setErrorHandler` global (verificado con grep sobre `src/`), así que cae en el handler por default de Fastify 5.7.4, que sí serializa `{ statusCode, code, error, message }`. **Los 8 asserts de `code === TENANT_SUSPENDED` sobre respuestas HTTP reales lo prueban.** Si esto hubiera fallado, el fix era de `country-scope.ts`, no del test.
- **`error: "Forbidden"` confirmado.** El contrato completo del body que la fase publica es exactamente `{ statusCode: 403, code: "TENANT_SUSPENDED", error: "Forbidden", message: "Acceso suspendido para este gimnasio" }` — los cuatro campos asertados, en tres rutas de dos módulos distintos (`members` y `subscriptions`) más la member app.
- **CD-01 verificado en su punto más caro: la member app corta.** `GET /api/members/subscription/plans` con token de socio devuelve 403 igual que el admin. La suspensión no es "para el staff": es la palanca comercial completa. Éste era el T-166-20 del threat model.
- **La frontera del login es real y está probada.** Con el gimnasio suspendido, staff y socio hacen login y reciben token (200). Y —refuerzo por encima del plan— ese token **recién emitido** se usa inmediatamente contra `/api/admin/members/` y recibe 403: el corte es del scope, no de la sesión. Sin este assert, "el login vive" sería ambiguo respecto de si la sesión resultante sirve para algo.
- **La restauración se prueba por igualdad estructural.** El `beforeAll` captura un snapshot de las tres superficies (status de cada una + los ids que devuelve el listado de admin) **antes** de tocar el estado del gimnasio; el bloque de restauración compara con `toEqual` el snapshot completo. Un "volvió a dar 200" habría pasado aunque la suspensión hubiese dejado, por ejemplo, un listado vacío.
- **Entradas hostiles sobre rutas reales, no sobre un request falso** (T-166-21): `?tenant_id=999&tenantId=999` y el header `x-tenant-id: 999`, contra el admin y contra la member app, comparados contra la respuesta sin parámetros — mismo status y misma lista de ids en los dos casos. En la member app se compara además la lista de planes y se afirma que no está vacía, para que la igualdad no sea entre dos listas vacías.
- **Regresión dirigida verde a la primera:** `test/country-scope.test.ts`, `test/branch-access.test.ts`, `test/auth`, `test/subscriptions`, `test/members`, `test/finance` y `test/shared` → **66 archivos, 863 passed** (1 skipped, 2 todo), 603 s con `MAX_TEST_WORKERS=1`, exit 0. **Cero fallos, cero expectativas ajustadas** — el criterio de éxito 4 de la fase queda demostrado con la corrida, no con una afirmación.
- **El diff de la fase es exactamente el planificado:** 10 archivos contra `origin/master`, y las tres entradas de `test/` figuran como **`A` (añadidas)**. Ni `setup.ts` ni `helpers.ts` ni ningún test preexistente fue tocado.

## Cobertura del test (11 `it()`)

| #   | Caso                              | Qué afirma                                                                                                                      |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Control con tenant `active`       | Las 3 rutas responden **200** y el listado de admin trae al socio de fixture (el 200 no es un verde vacío)                      |
| 2   | `suspended` — admin/members       | `toBe(403)` + los 4 campos del body + **el email del socio no aparece** en la respuesta (el corte ocurre antes de tocar datos)  |
| 3   | `suspended` — admin/subscriptions | Idem sobre un **segundo módulo**: el contrato no depende de qué plugin registró el hook                                         |
| 4   | `suspended` — member app (CD-01)  | `GET /api/members/subscription/plans` con token de socio → 403 con el mismo código                                              |
| 5   | `archived` — superficie de staff  | Mismo `statusCode` y mismo `code` (CD-02: un único código para los dos estados)                                                 |
| 6   | `archived` — superficie de socios | Idem en la member app                                                                                                           |
| 7   | Login pre-scope (CD-01)           | Staff **y** socio hacen login (200 + `token`) con el gimnasio suspendido; el token emitido recibe 403 en la primera ruta scoped |
| 8   | Restauración                      | Suspendido → 403; reactivado → el snapshot de las 3 rutas es **`toEqual`** al del control, con los mismos tokens (sin re-login) |
| 9   | Hostil por query (FUND-03)        | `?tenant_id=999&tenantId=999` → mismo status y **misma lista de ids** que sin parámetros                                        |
| 10  | Hostil por header (FUND-03)       | `x-tenant-id: 999` en admin y en member app → misma respuesta; los planes devueltos son los mismos y la lista no está vacía     |
| 11  | Higiene de la DB del worker       | `SELECT status FROM tenants WHERE id=1` devuelve `active` al final del archivo                                                  |

## Verificación contra `<verification>` del plan

| Criterio                                                     | Resultado                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| El test de integración pasa y cubre admin + member + login   | OK — **11/11** verdes (64 s), las 3 superficies + login                                           |
| Al menos 6 `it()`                                            | OK — `grep -c "  it("` = **11**                                                                   |
| Las 3 rutas bajo `suspended`, al menos 2 bajo `archived`     | OK — tests 2/3/4 (suspended) y 5/6 (archived, una admin + una member)                             |
| `grep -c "toBe(403)"` >= 3                                   | OK — **8**                                                                                        |
| Importa `TENANT_SUSPENDED` en vez de hardcodear el string    | OK — `grep -c 'from "../../src/modules/shared/country-scope"'` = **1**, cero literales del string |
| Caso de login respondiendo con el tenant suspendido          | OK — test 7                                                                                       |
| Caso de entradas hostiles (query + header) sin efecto        | OK — tests 9 y 10                                                                                 |
| `SELECT status FROM tenants WHERE id=1` en `eltemplo_test_1` | OK — `active` (verificado por SQL directo **después** de las dos corridas)                        |
| `grep -nE ':\s*any\b\|console\.'` sin líneas                 | OK — 0 hits                                                                                       |
| `min_lines: 120` del artefacto                               | OK — **438** líneas                                                                               |
| Suites dirigidas verdes con `MAX_TEST_WORKERS=1`             | OK — 66 archivos / 863 tests, exit 0, 603 s                                                       |
| Diff contra `origin/master` = exactamente los 10 archivos    | OK — listados abajo                                                                               |
| Ningún archivo preexistente de `test/` modificado            | OK — `git diff --name-status origin/master -- el-templo-api/test` → **3 líneas, todas `A`**       |
| `npx tsc --noEmit` limpio                                    | OK — antes del commit **y de nuevo después** del hook de prettier                                 |

## Inventario del diff de la fase (`git diff --stat origin/master`)

```
 el-templo-api/src/db/migrations/0190_tenants_core.sql        |  55 +++
 el-templo-api/src/db/migrations/0191_tenant_anchors.sql      |  69 ++++
 el-templo-api/src/db/schema/branches.ts                      |  74 ++--
 el-templo-api/src/db/schema/index.ts                         |   1 +
 el-templo-api/src/db/schema/tenants.ts                       | 106 +++++
 el-templo-api/src/db/schema/users.ts                         |  20 +
 el-templo-api/src/modules/shared/country-scope.ts            | 122 +++++-
 el-templo-api/test/migrations/0190-0191-tenants.test.ts      | 435 ++++++++
 el-templo-api/test/shared/tenant-scope.test.ts               | 263 ++++++
 el-templo-api/test/shared/tenant-suspension-routes.test.ts   | 438 ++++++++
 10 files changed, 1551 insertions(+), 32 deletions(-)
```

Coincide exactamente con lo que el plan esperaba: 2 migraciones nuevas, 4 archivos de schema, `country-scope.ts` y 3 archivos de test nuevos. **Cero archivos de producción fuera de `src/db/schema` y `src/modules/shared/country-scope.ts`** — la fase fundacional no tocó una sola ruta, servicio ni módulo de negocio.

## Decisions Made

- **Se seedea un plan AR en el `beforeAll`.** El catálogo de la member app devuelve `{ plans: [...] }` y responde 200 aunque la lista esté vacía. Sin un plan sembrado, el control "responde 200" y la comparación de listas del test 10 serían afirmaciones sobre el vacío. Con el plan, el 200 es una afirmación sobre datos reales que el socio efectivamente ve.
- **El `expect(res.statusCode).toBe(403)` va inline en cada `it`, y sólo el contrato del body vive en el helper `expectSuspendedBody`.** Es a la vez lo que pide el criterio de aceptación (`grep -c "toBe(403)"` >= 3) y lo correcto: si un helper envolviera también el status, el stack del fallo apuntaría al helper y no a la ruta que se rompió.
- **La restauración compara un objeto, no tres números.** `Snapshot` lleva los 3 status **más** los ids del listado de admin, y el assert es `toEqual` contra el snapshot capturado en el `beforeAll`. Cubre el modo de falla sutil: que reactivar devuelva 200 pero con el scope degradado.
- **El test 7 va más allá del plan: usa el token emitido durante la suspensión.** El plan pedía sólo que el login respondiera. Se agregó el assert de que ese token recibe 403 en la primera ruta scoped, porque es lo que hace inequívoca la frontera (autenticar sí, operar no) y porque es lo que un frontend va a hacer el día que exista un tenant 2: loguear, pedir datos, mostrar el mensaje de `TENANT_SUSPENDED`.
- **Test 2 asserta también que el email del socio no aparece en el body del 403.** Defensa en profundidad barata: si un día el corte se moviera después de resolver datos, un cuerpo de error que arrastre información del gimnasio suspendido sería una fuga.
- **El Task 2 no genera commit.** Lo declara el propio plan (`<files>ninguno</files>`). Se resistió la tentación de "commitear algo" para dejar rastro: el rastro es este SUMMARY y la salida reproducible del comando de verificación.

## Deviations from Plan

### Auto-fixed Issues

Ninguno. **Cero desvíos**: no hubo bugs que arreglar, ni funcionalidad crítica faltante, ni bloqueos. **Tercer plan consecutivo de la fase que ejecuta tal cual está escrito.**

Vale registrar el riesgo que no se materializó: este plan existía en buena medida para descubrir si el `code` sobrevivía a la serialización HTTP. Si el 403 hubiera llegado sin `code`, el fix habría sido en `country-scope.ts` (por ejemplo, un `setErrorHandler` acotado) y habría sido un desvío de Rule 2. Llegó con `code`.

### Refuerzos por encima de lo pedido (sin cambio de alcance)

- **Assert de no-fuga** (`res.body` no contiene el email del socio) en el test 2.
- **Token emitido bajo suspensión usado contra una ruta scoped** en el test 7.
- **Segundo login (el del socio)** en el test 7: el plan pedía "el login responde"; se cubren las dos superficies.
- **Test 11 (higiene de la DB del worker)** como `it()` explícito, además del `afterEach`/`afterAll` y la verificación por SQL externa. Convierte la contaminación entre suites en un fallo con nombre propio en vez de un fallo misterioso en la suite siguiente.
- **Comparación de la lista de planes** (no sólo del status) en el test hostil de la member app, con `length > 0`.

---

**Total deviations:** 0. Cero dependencias nuevas — no se corrió ningún `pnpm add` ni `pnpm approve-builds` (T-166-SC respetado).

## Threat Model — cobertura verificada

| Threat ID | Disposición | Cómo quedó cubierto                                                                                                                                                      |
| --------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-166-20  | mitigate    | **Cubierto.** Tests 4 y 6: la member app con token de socio recibe 403 con `suspended` y con `archived`                                                                  |
| T-166-21  | mitigate    | **Cubierto.** Tests 9 y 10: `?tenant_id`/`?tenantId` y `x-tenant-id` sobre rutas reales, comparados contra la respuesta sin parámetros (status + ids)                    |
| T-166-22  | mitigate    | **Cubierto.** El `code` se asserta sobre **3 rutas reales de 2 módulos** (más la member app); ningún serializador de esas rutas lo descarta                              |
| T-166-23  | mitigate    | **Cubierto.** Test 7: staff y socio siguen autenticándose con el gimnasio suspendido; suspender no deja a nadie fuera del sistema, sólo sin datos                        |
| T-166-24  | mitigate    | **Cubierto.** `afterEach` + `afterAll` incondicionales, `try/finally` en los 7 casos que suspenden, test 11 dentro del archivo y verificación por SQL externa → `active` |
| T-166-SC  | mitigate    | **Cubierto.** Cero comandos de instalación                                                                                                                               |

## Threat Flags

Ninguno. El plan no agrega ni superficie de red, ni rutas, ni acceso a archivos: es un archivo de test que ejercita rutas ya existentes vía `app.inject` y hace `UPDATE`/restore acotados sobre `tenants` en la DB de test.

## Known Stubs

Ninguno.

## Issues Encountered

- **Prettier (hook de pre-commit) reformateó 3 líneas** (438 líneas commiteadas vs. 435 escritas). Se re-corrieron `npx tsc --noEmit`, los greps de aceptación **y** el archivo de test completo **después** del hook: todo verde sobre el contenido efectivamente commiteado (11/11, 64 s). Cuarta vez en la fase — ya es procedimiento estándar.
- **La regresión dirigida tarda 603 s** (66 archivos). Es el precio del `cleanAllTestData` por test multiplicado por la suite; no se optimizó. Se corrió en background con polling para no chocar contra el límite de timeout de un comando en foreground.
- **Excepción consciente a "los tests corren en CI, local sólo typecheck"** (misma que 166-03): el entregable de este plan **es** un test y su criterio de aceptación exige demostrar que ningún test existente necesitó ajuste. Las DBs `eltemplo_test_*` son descartables y el `globalSetup` las dropea al arrancar: la DB de desarrollo `eltemplo` no se tocó.

## User Setup Required

Ninguno.

## Next Phase Readiness

- **Listo para 166-06 (cierre de fase):** FUND-01..FUND-04 tienen evidencia automatizada. FUND-01/02 por introspección de INFORMATION_SCHEMA (166-03), FUND-03/04 por test de hook (166-04) **y** por test de integración HTTP (este plan). El criterio de éxito 4 ("la suite pasa sin ajustar expectativas") está demostrado con 66 archivos / 863 tests y un diff donde las tres entradas de `test/` son altas puras.
- **Contrato publicado para los frontends** (cuando exista un tenant 2): `403` con `{ statusCode: 403, code: "TENANT_SUSPENDED", error: "Forbidden", message: "Acceso suspendido para este gimnasio" }`. Un cliente debe matchear por `code`, nunca por `message`.
- **Molde para 172-175:** cuando cada módulo adopte `attachScope` + `tenantWhere`, este archivo es la plantilla del test de suspensión por ruta (snapshot de control → suspender → 403 estricto → restaurar → igualdad estructural).
- **Recordatorio de tren (sin cambios):** 0190 y 0191 siguen viviendo **sólo** en `feat/166-tenancy-fundacion`. Cualquier fase que reserve un número de migración antes del merge tiene que verificar también esta rama y el worktree `et-164-tv` (0189).
- **Sin blockers.**

## Self-Check: PASSED

- `el-templo-api/test/shared/tenant-suspension-routes.test.ts` — FOUND (worktree, 438 líneas > 120 del `min_lines` del plan)
- Commit `e6cab5f6` — FOUND en `feat/166-tenancy-fundacion` (1 archivo, sin deleciones, `git status --porcelain` limpio tras el commit)
- `key_links` del plan verificados: el archivo importa `TENANT_SUSPENDED` de `../../src/modules/shared/country-scope` (1 hit) y ejercita vía `app.inject` las 3 rutas cuyos hooks `onRequest` registran `attachCountryScope`
- `SELECT status FROM tenants WHERE id=1` en `eltemplo_test_1` — `active`
- `166-05-SUMMARY.md` — FOUND (checkout principal)

---

_Phase: 166-fundaci-n-tenants-anclas-y-scope-server-side_
_Completed: 2026-07-26_
