---
phase: 166-fundaci-n-tenants-anclas-y-scope-server-side
plan: 03
subsystem: testing
tags: [vitest, mysql, information-schema, migrations, multi-tenancy, regression]

# Dependency graph
requires:
  - "166-01 (tablas tenants + tenant_settings, seed del tenant 1, constraints nombrados, RESERVED_TENANT_SLUGS)"
  - "166-02 (users.tenant_id y branches.tenant_id con FK, indice y backfill)"
provides:
  - "test/migrations/0190-0191-tenants.test.ts: 12 it() que introspeccionan INFORMATION_SCHEMA y fallan si una migracion se aplica a medias"
  - "Evidencia automatizada de FUND-01 y FUND-02 (ya no dependen de inspeccion manual por SQL)"
  - "Regresion dirigida verde: 32 archivos / 538 tests sin tocar una sola expectativa existente"
  - "Prueba viva del DEFAULT 1: insert Drizzle sin tenantId en las dos anclas resuelve a tenant 1"
affects:
  - "166-04 (attachScope se apoya en que users.tenant_id es NOT NULL y esta poblado, ahora probado)"
  - "166-05 (tests de suspension: este archivo deja explicito que NO toca tenants.status, para no pisarse)"
  - "167-176 (el patron de test de introspeccion es el molde para las ~85 tablas de la 167)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Test de introspeccion como red contra el provisioning tolerante de test/setup.ts: lo que prueba el DDL es INFORMATION_SCHEMA, no que el runner no haya tirado excepcion"
    - "Helper generico queryRows<T>() que normaliza el [rows, fields] de mysql2 una sola vez (evita repetir el cast as unknown as [Row[]] en cada assert)"
    - "Assert negativo de nombre de columna (NO existe tenant_status) como gate permanente de la trampa de mysqlEnum"
    - "Cleanup explicito de las filas insertadas en tablas que NO estan en TABLES_TO_CLEAN (branches), con try/finally"

key-files:
  created:
    - el-templo-api/test/migrations/0190-0191-tenants.test.ts
  modified: []

key-decisions:
  - "12 it() en vez de los 7 bloques minimos: cada bloque del plan se partio cuando mezclaba dos afirmaciones independientes (forma de columna vs indices vs backfill), para que un fallo apunte a una causa unica"
  - "El test se apoya en que branches y tenants NO estan en TABLES_TO_CLEAN: por eso el seed del tenant 1 sobrevive al beforeEach y por eso la branch de prueba se borra a mano"
  - "Se corrio la regresion dirigida local (excepcion consciente a 'los tests corren en CI'): el entregable de este plan ES un test, y el criterio de exito 4 de la fase exige demostrar que ningun test existente necesito ajuste"

patterns-established:
  - "Antes de commitear un archivo con gates de grep, correr los greps del plan contra el archivo terminado (comentarios incluidos) — tercera iteracion de la leccion en esta fase, esta vez aplicada de forma preventiva"
  - "Regresion dirigida por 'canario': elegir los archivos que insertan las anclas a mano en vez de correr la suite completa"

requirements-completed: [FUND-01, FUND-02]

# Metrics
duration: 15min
completed: 2026-07-26
---

# Phase 166 Plan 03: Test de introspección del DDL de las tandas A y B Summary

**FUND-01 y FUND-02 dejaron de depender de una inspección manual por SQL: 12 `it()` interrogan INFORMATION_SCHEMA por el DDL real (columnas, defaults, uniques, índices, FKs, seed, backfill) y la regresión dirigida de 32 archivos / 538 tests pasó sin ajustar una sola expectativa existente.**

## Performance

- **Duration:** ~15 min (de los cuales ~7 min son la corrida de la regresión dirigida)
- **Started:** 2026-07-26T20:14:00Z
- **Completed:** 2026-07-26T20:29:00Z
- **Tasks:** 2
- **Files modified:** 1 (1 creado, 0 modificados)

## Task Commits

1. **Task 1: Test de introspección del DDL de las tandas A y B** — incluido en `6183786c`
2. **Task 2: Regresión dirigida sobre las suites que más insertan anclas** — `6183786c` (test) — `test(166): DDL de tandas A y B (tenants, tenant_settings, anclas)`, 1 archivo, +435

> El commit vive en el Task 2 **por diseño del plan** (`<action>` del Task 2: "Commitear el test nuevo en el worktree"), y su criterio de aceptación exige que el último commit tenga **un solo archivo**. Commitear en el Task 1 habría dejado un test sin la evidencia de que la suite existente no se movió.

**Commit de código en:** worktree `/home/franco/projects/et-166-tenancy`, rama `feat/166-tenancy-fundacion`.
**Artefactos de planning** (este SUMMARY + STATE + ROADMAP + REQUIREMENTS): commiteados en el checkout principal.

## Accomplishments

- **El agujero de `test/setup.ts` quedó tapado.** El provisioning aplica las migraciones con `SET FOREIGN_KEY_CHECKS=0` y **tolera** 8 clases de error (`Duplicate`, `already exists`, `Unknown column`, `Table`, `doesn't exist`…), e igual escribe la fila de `_migrations`. Es deliberado, pero significa que **una migración de DDL rota puede pasar en silencio con la suite en verde**. Ahora hay un archivo que falla si el DDL no quedó: no mira si el runner tiró excepción, mira el resultado en INFORMATION_SCHEMA.
- **12 `it()` verdes** (`MAX_TEST_WORKERS=1 npx vitest run test/migrations/0190-0191-tenants.test.ts` → 12/12, 70 s), cubriendo los 7 bloques obligatorios del plan:

  | #   | Bloque                | Qué asserta                                                                                                                                                                   |
  | --- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | 1   | `tenants.status`      | `COLUMN_TYPE` = `enum('active','suspended','archived')` byte a byte, `NOT NULL`, default `active`                                                                             |
  | 1b  | Resto de `tenants`    | `slug varchar(50) NOT NULL` + los tres defaults (`AR` / `ARS` / `America/Argentina/Buenos_Aires`), todos `NOT NULL`                                                           |
  | 1c  | Trampa de `mysqlEnum` | existe la columna `status` y **NO** existe `tenant_status`                                                                                                                    |
  | 2   | Unique / índices / FK | `tenants_slug_unique` (NON_UNIQUE=0 sobre `slug`), `uq_tenant_setting` (dos filas, SEQ_IN_INDEX 1=`tenant_id` / 2=`setting_key`), `fk_tenant_settings_tenant` → `tenants(id)` |
  | 3   | Seed                  | exactamente **1** fila en `tenants` (`id=1`, `el-templo`, `El Templo`, `active`) y **0** en `tenant_settings`                                                                 |
  | 4   | Anclas — forma        | `users.tenant_id` y `branches.tenant_id`: `int`, `IS_NULLABLE='NO'`, `COLUMN_DEFAULT='1'`                                                                                     |
  | 4b  | Anclas — objetos      | `idx_users_tenant_id` / `idx_branches_tenant_id` sobre `tenant_id`, y `fk_users_tenant` / `fk_branches_tenant` → `tenants(id)`                                                |
  | 4c  | Backfill              | `COUNT(*) WHERE tenant_id <> 1 OR IS NULL` = 0 en las dos, **más** un sanity de que `branches` no está vacía (para que el 0 sea una afirmación sobre filas reales)            |
  | 5   | Round-trip branch     | `insert(branches).values({ name, code })` **sin `tenantId`** → la fila queda con `tenantId === 1`                                                                             |
  | 5b  | Round-trip user       | `insert(users)` con campos mínimos y **sin `tenantId`** → `tenantId === 1`                                                                                                    |
  | 6   | Idempotencia          | `_migrations` tiene `0190_tenants_core.sql` y `0191_tenant_anchors.sql`, **una vez cada uno** (GROUP BY, no un COUNT total que no distinguiría 2+0 de 1+1)                    |
  | 7   | Slugs reservados      | `RESERVED_TENANT_SLUGS` incluye `admin`/`api`/`www` y **no** incluye `el-templo` — además, ningún slug realmente presente en `tenants` está en la lista                       |

- **Regresión dirigida verde sin tocar nada:** `test/country-scope.test.ts`, `test/branch-access.test.ts`, `test/members/` y `test/finance/` → **32 archivos, 538 tests passed** (1 skipped, 2 todo), 406 s con `MAX_TEST_WORKERS=1`. Estos son los canarios de PATTERNS §0.3: los archivos que insertan branches y users **a mano, sin `tenant_id`**. Que pasen sin un solo cambio **es** la prueba de que el camino A (`NOT NULL DEFAULT 1`) cumplió su promesa.
- **Diff quirúrgico:** `git diff --name-only origin/master -- el-templo-api/test` devuelve **exactamente** `el-templo-api/test/migrations/0190-0191-tenants.test.ts`. Ni `setup.ts`, ni `helpers.ts`, ni ningún test existente fue modificado — el criterio de éxito 4 de la fase queda demostrado por el diff, no por una afirmación.

## Verificación contra `<verification>` del plan

| Criterio                                                  | Resultado                                                                                          |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| El test nuevo pasa y cubre los 7 bloques                  | OK — 12/12 `it()`, los 7 bloques mapeados en la tabla de arriba                                    |
| Al menos 7 `it()`                                         | OK — `grep -c "  it("` = **12**                                                                    |
| Assert explícito de que NO existe `tenant_status`         | OK — Test 1c                                                                                       |
| Assert de `COLUMN_DEFAULT='1'` en las dos anclas          | OK — Test 4, loop sobre `users` y `branches`                                                       |
| Insert Drizzle sin `tenantId` que afirma `tenantId === 1` | OK — Tests 5 y 5b (el plan pedía uno de cada, están los dos)                                       |
| `grep -nE ':\s*any\b'` sin líneas                         | OK — 0 hits                                                                                        |
| `grep -c "UPDATE tenants"` = 0                            | OK — 0 (el archivo lee el tenant, nunca lo escribe)                                                |
| `npx tsc --noEmit` limpio                                 | OK — antes del commit **y de nuevo después** del hook de prettier                                  |
| Suites dirigidas verdes                                   | OK — 32 archivos / 538 tests, exit 0                                                               |
| Cero cambios en archivos de test existentes               | OK — diff contra `origin/master` = 1 archivo nuevo, `git status --porcelain` limpio tras el commit |
| Commit con un solo archivo                                | OK — `6183786c`, 1 file changed, +435                                                              |

## Decisions Made

- **12 `it()` en vez de 7.** Cada bloque del plan que mezclaba dos afirmaciones independientes se partió (forma de columna / objetos del índice y la FK / estado del backfill). Un `it()` por causa raíz: cuando falle, el nombre del test ya dice qué migración y qué paso se rompió, sin leer el diff del assert.
- **Idempotencia por `GROUP BY name`, no por `COUNT(*)` total.** El plan pedía que el `COUNT(*)` de los dos nombres diera 2. Un total de 2 también se satisface con una migración duplicada y la otra ausente — que es exactamente el modo de falla que el test busca. Se asserta **una fila por nombre y `n = 1` en cada una**, que sí distingue los dos casos.
- **Sanity de que `branches` no está vacía** dentro del Test 4c: `COUNT(*) WHERE tenant_id <> 1` = 0 es trivialmente cierto sobre una tabla sin filas. El assert extra convierte un verde vacío en un verde real.
- **`branches` y `tenants` no están en `TABLES_TO_CLEAN`** (verificado en `test/helpers.ts:144-241`), y eso corta para los dos lados: el seed del tenant 1 **sobrevive** al `beforeEach` (por eso el Test 3 puede afirmar `COUNT(*) = 1`), pero la branch que inserta el Test 5 **queda colgada** si no se borra a mano — se borra en un `finally`, porque contaminaría a las suites vecinas del mismo worker (la DB es por worker y compartida entre archivos, `isolate: false`).
- **Se corrió la regresión local**, excepción consciente a la convención "los tests corren en CI, local sólo typecheck". Razón: el entregable de este plan **es** un test, y su criterio de aceptación exige demostrar que ningún test existente necesitó ajuste — eso no se puede afirmar sin correrlos. Las DBs de test (`eltemplo_test_*`) son descartables y `globalSetup` las dropea al arrancar: la DB de desarrollo `eltemplo` no se tocó.

## Deviations from Plan

### Auto-fixed Issues

Ninguno. **Cero desvíos**: no hubo bugs que arreglar, no hubo funcionalidad crítica faltante, no hubo bloqueos. Es el primer plan de la fase que ejecuta tal cual está escrito.

Vale registrar por qué: los dos planes anteriores tropezaron con el mismo patrón (un comentario que rompe el gate de `grep` del propio plan — `mysqlEnum("tenant_status"` en 166-01, `AFTER` en 166-02). Acá el patrón se aplicó **de forma preventiva**: la redacción del archivo evitó desde el principio los dos tokens grepeados (`: any` y `UPDATE tenants`), incluso en la prosa de los comentarios, y los greps del plan se corrieron contra el archivo terminado antes de commitear. El comentario del Test 1c, por ejemplo, explica la trampa de `mysqlEnum` **sin escribir** el literal del snippet del README.

### Nota de infraestructura (no es desvío)

Las notas de 166-01 y 166-02 advertían que correr la suite desde el worktree podía requerir `pnpm approve-builds` para `argon2` (el `pnpm install` saltó los build scripts). **No hizo falta**: `argon2` trae prebuilds para `linux-x64` y carga sin compilar (verificado con un `require` + `hash()` antes de correr nada). **Cero `pnpm add`, cero `pnpm approve-builds`, cero paquetes nuevos** — T-166-SC respetado. La advertencia queda anulada para el resto de la fase.

## Threat Model — cobertura verificada

| Threat ID                                                      | Disposición | Cómo quedó cubierto                                                                                                                                                                                                         |
| -------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-166-11 (migración aplicada a medias sin que nadie se entere) | mitigate    | **Cubierto.** El test no depende del resultado del runner: interroga INFORMATION_SCHEMA por columnas, tipos, defaults, uniques, índices y FKs con sus nombres exactos de contrato                                           |
| T-166-12 (estado residual en la DB de test)                    | mitigate    | **Cubierto.** `cleanAllTestData` en `beforeEach` y `afterAll`, borrado explícito en `finally` de la branch insertada (tabla no cubierta por el cleanup), y cero escrituras sobre `tenants` (`grep -c "UPDATE tenants"` = 0) |
| T-166-13 ("la suite pasa" ajustando expectativas)              | mitigate    | **Cubierto.** `git diff --name-only origin/master -- el-templo-api/test` = exactamente 1 archivo nuevo                                                                                                                      |
| T-166-SC (pnpm installs)                                       | mitigate    | **Cubierto.** Cero comandos de instalación (ver nota de infraestructura)                                                                                                                                                    |

## Threat Flags

Ninguno. El plan no agrega superficie de red, de auth ni de acceso a archivos: es un archivo de test que sólo lee INFORMATION_SCHEMA y hace inserts/deletes acotados en la DB de test.

## Known Stubs

Ninguno.

## Issues Encountered

- **El archivo tarda ~70 s para 12 asserts baratos.** El costo no son las queries a INFORMATION_SCHEMA (milisegundos) sino el `cleanAllTestData` del `beforeEach`, que hace ~100 `DELETE` por test × 12 tests. Es el precio estándar de la convención del repo y no se tocó — no vale la pena optimizar un archivo que corre en CI junto a otros 50. Anotado por si la 167 multiplica este patrón por muchas tablas: ahí sí convendría un `beforeAll` en vez de `beforeEach` para los archivos que sólo hacen introspección.
- **Prettier reformateó una firma** (`countRows`) en el hook de pre-commit. Se re-corrieron `tsc --noEmit` **y** el archivo de test completo **después** del hook: ambos verdes con el contenido efectivamente commiteado.

## User Setup Required

Ninguno.

## Next Phase Readiness

- **Listo para 166-04:** el test deja probado que `users.tenant_id` es `NOT NULL` y está poblado al 100%, que es la precondición de que `attachScope` pueda resolver `scope.tenantId` sin ramas para NULL, y que `tenants.status` existe con el enum exacto contra el que ese plan va a comparar.
- **Listo para 166-05:** este archivo declara explícitamente (en su header y en el `grep` de aceptación) que **no toca `tenants.status`**. El plan 166-05, que sí lo modifica y lo restaura, no se pisa con éste aunque compartan la DB del worker.
- **Molde para la 167:** el patrón `queryRows<T>()` + asserts por INFORMATION_SCHEMA es el que se replica para las ~85 tablas gym-owned.
- **Recordatorio de tren (sin cambios):** 0190 y 0191 siguen viviendo **sólo** en `feat/166-tenancy-fundacion`. Cualquier fase que reserve un número de migración antes del merge tiene que verificar también esta rama y el worktree `et-164-tv` (0189).
- **Sin blockers.**

## Self-Check: PASSED

- `el-templo-api/test/migrations/0190-0191-tenants.test.ts` — FOUND (worktree, 435 líneas, > 120 del `min_lines` del plan)
- Commit `6183786c` — FOUND en `feat/166-tenancy-fundacion` (1 archivo, sin deleciones, `git status --porcelain` limpio)
- `key_links` del plan verificados: el archivo importa `RESERVED_TENANT_SLUGS` de `src/db/schema/tenants.ts` (Test 7) y consulta `INFORMATION_SCHEMA` vía `app.db.execute(sql\`…\`)` (Tests 1, 1b, 1c, 2, 4, 4b, 4c)
- `166-03-SUMMARY.md` — FOUND (checkout principal)

---

_Phase: 166-fundaci-n-tenants-anclas-y-scope-server-side_
_Completed: 2026-07-26_
