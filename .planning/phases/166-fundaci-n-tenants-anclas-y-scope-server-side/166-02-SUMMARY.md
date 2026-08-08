---
phase: 166-fundaci-n-tenants-anclas-y-scope-server-side
plan: 02
subsystem: database
tags: [drizzle, mysql, multi-tenancy, migrations, rolling-deploy, saas]

# Dependency graph
requires:
  - "166-01 (tabla tenants con la fila id=1 a la que apuntan las FK, y el numero 0191 reservado)"
provides:
  - "users.tenant_id INT NOT NULL DEFAULT 1 con FK fk_users_tenant a tenants(id) e indice idx_users_tenant_id"
  - "branches.tenant_id INT NOT NULL DEFAULT 1 con FK fk_branches_tenant a tenants(id) e indice idx_branches_tenant_id"
  - "schema.users.tenantId y schema.branches.tenantId (opcionales en el tipo de insert por el .default(1))"
  - "Migracion 0191_tenant_anchors.sql aplicada en la DB local (10 statements, backfill al 100%)"
  - "branches.ts estrena el tercer argumento de mysqlTable (callback de indices)"
affects:
  - "166-03 (tests de migracion: asserta fk_users_tenant / fk_branches_tenant e IS_NULLABLE por INFORMATION_SCHEMA)"
  - "166-04 (attachScope resuelve scope.tenantId leyendo users.tenant_id)"
  - "167 (las ~85 tablas gym-owned cuelgan de estas dos anclas)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ancla de tenancy con NOT NULL DEFAULT 1: la compatibilidad con codigo viejo se compra en el DDL, no parcheando test/setup.ts ni helpers"
    - "Ciclo incremental por tabla en una sola migracion: ADD COLUMN nullable, backfill guardado por IS NULL, MODIFY NOT NULL (repitiendo el DEFAULT), indice, FK nombrada"
    - "ADD COLUMN sin clausula de posicionamiento (columna al final) = INSTANT garantizado en MySQL 8, no solo desde 8.0.29"

key-files:
  created:
    - el-templo-api/src/db/migrations/0191_tenant_anchors.sql
  modified:
    - el-templo-api/src/db/schema/users.ts
    - el-templo-api/src/db/schema/branches.ts

key-decisions:
  - "tenant_id es NOT NULL DEFAULT 1 (camino A del PATTERNS 0.3): sin DEFAULT los INSERT IGNORE de test/setup.ts no insertan fila y el rolling deploy queda sin red"
  - "El DEFAULT 1 se repite explicitamente en el MODIFY COLUMN porque MySQL lo pierde si no se declara"
  - "branches primero y users despues: la FK de users no depende de branches, pero el orden deja la tabla mas chica como canario del ciclo completo"

patterns-established:
  - "Probe empirico de compatibilidad en la verificacion de la migracion: insertar SIN la columna nueva y assertar el default, mas un insert con FK invalida que DEBE fallar (1452), con cleanup y conteo final"
  - "Los comentarios de la migracion no pueden contener el token que grepea el gate del plan (segunda vez en la fase: un comentario que rompe su propio gate)"

requirements-completed: [FUND-02]

# Metrics
duration: 4min
completed: 2026-07-26
---

# Phase 166 Plan 02: Anclas de tenancy (tanda B) Summary

**`users` y `branches` pasan a ser tenant-aware: `tenant_id INT NOT NULL DEFAULT 1` con FK a `tenants`, índice propio y backfill al 100%, aplicado en local por la migración 0191 sin tocar un solo insert existente del repo.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-07-26T20:08:35Z
- **Completed:** 2026-07-26T20:12:30Z
- **Tasks:** 2
- **Files modified:** 3 (1 creado, 2 modificados)

## Task Commits

1. **Task 1: `tenantId` en los schemas Drizzle de `users` y `branches`** — incluido en `afe377ff`
2. **Task 2: Migración 0191 (tanda B) + aplicación y verificación local** — `afe377ff` (feat) — `feat(166): tenant_id en anclas users y branches (tanda B, FUND-02)`, 3 archivos, +139/-24

> El plan pide explícitamente commitear el `.sql` **junto** a los dos `.ts` (Hard Rule 3 del skill `el-templo-db-migrations`), por eso las dos tasks comparten commit — mismo criterio que 166-01.

**Commit de código en:** worktree `/home/franco/projects/et-166-tenancy`, rama `feat/166-tenancy-fundacion`.
**Artefactos de planning** (este SUMMARY + STATE + ROADMAP + REQUIREMENTS): commiteados en el checkout principal.

## Accomplishments

- **Columna idéntica en las dos anclas**, `int("tenant_id").notNull().default(1).references(() => tenants.id)`, colocada después de `id` con un comentario que documenta las tres cosas que un lector futuro necesita: que el valor **sale siempre del servidor** (nunca de payload/query/JWT), **por qué** lleva `DEFAULT 1`, y que el orden en el archivo es de lectura (el ALTER agrega la columna al final de la tabla física).
- **`branches.ts` estrena el tercer argumento de `mysqlTable`** (hasta hoy no tenía callback de índices): se introdujo copiando la forma de `users.ts`, con `index` agregado al import y `branchesRelations` intacto.
- **`tsc --noEmit` verde sin tocar un solo insert.** Ésta es la prueba dura de que `.default(1)` deja `tenantId` opcional en el tipo de insert: `createStaffUser` y las decenas de inserts de `users`/`branches` del repo compilan sin cambios.
- **Migración `0191_tenant_anchors.sql` hand-written**, 10 statements (5 por tabla), aplicada con el runner propio (`pnpm db:migrate`), **prohibido y no usado** `drizzle-kit push/migrate`.
- **Compatibilidad probada empíricamente, no argumentada:** un `INSERT INTO branches (name, code)` y un `INSERT INTO users (email, password_hash, ..., branch_id)` **sin `tenant_id`** (exactamente la forma del código viejo y de `test/setup.ts`) insertan con `tenant_id = 1`. Filas de prueba borradas y conteos finales verificados de vuelta en 53 users / 10 branches.
- **Integridad referencial probada por el lado negativo:** `INSERT INTO branches (..., tenant_id) VALUES (..., 999)` falla con `ERROR 1452 ... CONSTRAINT fk_branches_tenant` — T-166-08 no es una promesa del DDL, está ejercitado.

## Estado verificado de la DB local (`eltemplo`)

```
users.tenant_id     -> int  IS_NULLABLE=NO  COLUMN_DEFAULT=1   filas fuera de 1 o NULL: 0  (53 filas)
branches.tenant_id  -> int  IS_NULLABLE=NO  COLUMN_DEFAULT=1   filas fuera de 1 o NULL: 0  (10 filas)
FK   fk_users_tenant    users.tenant_id    -> tenants.id
FK   fk_branches_tenant branches.tenant_id -> tenants.id
IDX  idx_users_tenant_id, idx_branches_tenant_id
_migrations: 1 fila con name='0191_tenant_anchors.sql'
```

## Verificación contra `<verification>` del plan

| Criterio                                                     | Resultado                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit` verde en el worktree                      | OK — antes del commit y **de nuevo después** del hook de prettier                                 |
| Cero filas con `tenant_id` distinto de 1 o nulo              | OK — `COUNT(*)` = 0 en `users` y en `branches`                                                    |
| `NOT NULL` + `DEFAULT 1` + FK + índice en INFORMATION_SCHEMA | OK — las 4 consultas devuelven exactamente lo esperado (tabla de arriba)                          |
| Insert sin `tenant_id` sigue funcionando                     | OK — probado en **las dos** anclas (el plan sólo exigía `branches`), resuelve a 1, filas borradas |
| Migración idempotente                                        | OK — 2ª corrida: `No new migrations to apply`, y replay manual de los dos backfills: 0 filas      |
| Cero `;` en comentarios `--`                                 | OK — grep vacío + split real de `splitSqlStatements` = 10 statements limpios                      |
| `grep -c 'AFTER'` = 0 / `MODIFY ... DEFAULT 1` = 2           | OK (ver deviación 1)                                                                              |
| Commit único con los 3 archivos                              | OK — `afe377ff`, sin deleciones, sin untracked                                                    |

## Decisions Made

- **`NOT NULL DEFAULT 1` (camino A), no `NOT NULL` a secas.** Decisión ya tomada por el plan y confirmada empíricamente acá. Razón dura: `test/setup.ts:42-61` inserta anclas con `INSERT IGNORE` sin `tenant_id` — sin DEFAULT esas filas **no se insertan** (el error se degrada a warning) y toda la suite cae en cascada con errores crípticos de FK. Idéntico razonamiento para el código viejo durante el rolling deploy (D-04). El DEFAULT se re-evalúa cuando exista un tenant 2, fuera de v6.0.
- **`ADD COLUMN` sin cláusula de posicionamiento.** La columna va al final de la tabla: es la forma INSTANT garantizada en MySQL 8 (posicionarla detrás de otra columna recién es instant desde 8.0.29). El orden físico es irrelevante porque Drizzle nombra siempre las columnas — verificado además que en el repo **no existe** ningún `INSERT INTO users/branches VALUES (...)` sin lista de columnas ni ningún `SELECT *` crudo sobre las anclas, que serían los dos únicos patrones sensibles al orden.
- **`branches` antes que `users` en el archivo.** No hay dependencia entre ambos ciclos (las dos FK apuntan a `tenants`), pero poner primero la tabla de 10 filas hace que, si el ciclo estuviera mal, falle sobre la tabla chica antes de tocar `users`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] El header de la migración rompía el gate `grep -c 'AFTER' = 0` del propio plan**

- **Found during:** Task 2 (verificación pre-aplicación)
- **Issue:** El plan exige `grep -c 'AFTER' 0191_tenant_anchors.sql` = 0 — el gate existe para detectar una cláusula de posicionamiento en el DDL, que es lo que rompe la garantía INSTANT. Mi header **explicaba** la decisión citando el token literal dos veces, así que el grep devolvía `2` sobre dos líneas de comentario inofensivas. Un gate que se puede romper con prosa es un gate roto: la próxima corrida (o el plan 166-03) leería un falso positivo y no sabría distinguirlo de un ALTER realmente mal escrito.
- **Fix:** Reformulado el header para explicar exactamente lo mismo sin escribir el token ("sin cláusula de posicionamiento", "posicionarla detrás de otra columna recién es instant desde 8.0.29"), más una línea que deja constancia de por qué el comentario está redactado así.
- **Files modified:** `el-templo-api/src/db/migrations/0191_tenant_anchors.sql`
- **Verification:** `grep -c 'AFTER'` = 0, `grep -c 'MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1'` = 2, split real = 10 statements.
- **Committed in:** `afe377ff`

> Es la **segunda vez en esta fase** que un comentario rompe el gate que lo cubre (la #2 de 166-01 fue idéntica en naturaleza, con `mysqlEnum("tenant_status"`). Queda anotado como patrón de la fase: antes de commitear un archivo con gates de `grep`, correr los greps del plan contra el archivo terminado, comentarios incluidos.

### Verificaciones agregadas por encima de lo pedido (sin cambio de alcance)

Ninguna de estas modificó código ni el `.sql`; son evidencia extra sobre el mismo entregable:

- **Probe de compatibilidad también en `users`** (el plan sólo pedía `branches`). `users` es la tabla que `test/setup.ts` inserta con `INSERT IGNORE` **y** la que lee `attachScope` en 166-04: dejarla sin probar era el hueco más caro.
- **Probe negativo de la FK** (`tenant_id = 999` → 1452). Assertar que la FK existe en INFORMATION_SCHEMA no es lo mismo que assertar que rechaza.
- **Barrido de `INSERT ... VALUES` sin lista de columnas y de `SELECT *` crudo** sobre las anclas: 0 hits, que es lo que vuelve inocuo el orden físico de la columna nueva.
- **Replay manual de los dos backfills** fuera del runner: `0 rows affected` cada uno, que es la prueba real de que el `WHERE tenant_id IS NULL` los deja idempotentes.

---

**Total deviations:** 1 auto-fixed (bug de gate). Cero desvíos de alcance, cero dependencias nuevas (T-166-SC respetado: no se corrió ningún `pnpm add`).

## Threat Flags

Ninguno. Este plan no agrega superficie de red, de auth ni de acceso a archivos: es DDL + schema. El único vector nuevo (`tenant_id` escrito desde afuera, T-166-10) sigue siendo `accept`: la columna tiene DEFAULT pero **ninguna ruta la acepta de payload**, y la regla server-side se implementa y se testea en 166-04/166-05.

## Known Stubs

Ninguno. La columna está poblada al 100% en las dos anclas y con integridad referencial ejercitada. Lo que falta (que `scope.tenantId` la lea y que las queries filtren por ella) es el alcance explícito de 166-04 y de la fase 167, no un stub de este plan.

## Issues Encountered

- **La suite de tests no se corrió** (convención del proyecto: corre en CI, local sólo typecheck). El riesgo cubierto por esa suite en este plan es exactamente el provisioning de `test/setup.ts`, y se atacó por la vía más directa disponible: el probe empírico del insert sin `tenant_id` en las dos anclas contra la DB real. Sigue vigente la nota de 166-01 de que levantar la suite **desde el worktree** requeriría `pnpm approve-builds` para `argon2`.

## User Setup Required

Ninguno. La migración 0191 llegará a staging/prod por el pipeline normal cuando la fase viaje en su tren.

## Next Phase Readiness

- **Listo para 166-03:** los cuatro objetos que ese plan assertea por INFORMATION_SCHEMA existen con los nombres exactos del contrato (`fk_users_tenant`, `fk_branches_tenant`, `idx_users_tenant_id`, `idx_branches_tenant_id`) y `_migrations` tiene su fila única de `0191_tenant_anchors.sql`.
- **Listo para 166-04:** `users.tenant_id` es `NOT NULL` y está poblado, así que `attachScope` puede resolver `scope.tenantId` en la misma query que ya resuelve país y sede, sin ramas para NULL.
- **Recordatorio de tren:** **0190 y 0191 viven sólo en `feat/166-tenancy-fundacion`** — no están en `origin/staging` ni en `origin/master`. Cualquier fase que reserve un número entre hoy y el merge tiene que verificar también esta rama (y el worktree `et-164-tv`, que sigue abierto en 0189).
- **Sin blockers.**

## Self-Check: PASSED

- `el-templo-api/src/db/migrations/0191_tenant_anchors.sql` — FOUND (worktree)
- `el-templo-api/src/db/schema/users.ts` — FOUND (worktree, `tenantId` + `idx_users_tenant_id`)
- `el-templo-api/src/db/schema/branches.ts` — FOUND (worktree, `tenantId` + `idx_branches_tenant_id`)
- Commit `afe377ff` — FOUND en `feat/166-tenancy-fundacion` (3 archivos, sin deleciones)
- `166-02-SUMMARY.md` — FOUND (checkout principal)

---

_Phase: 166-fundaci-n-tenants-anclas-y-scope-server-side_
_Completed: 2026-07-26_
