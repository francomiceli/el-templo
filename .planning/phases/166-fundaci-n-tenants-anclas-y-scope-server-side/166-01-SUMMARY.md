---
phase: 166-fundaci-n-tenants-anclas-y-scope-server-side
plan: 01
subsystem: database
tags: [drizzle, mysql, multi-tenancy, migrations, git-worktree, saas]

# Dependency graph
requires: []
provides:
  - "Worktree aislado /home/franco/projects/et-166-tenancy (rama feat/166-tenancy-fundacion, base origin/master 8ac9ba9f) donde corre TODA la fase 166"
  - "Bloque de numeracion del milestone v6.0 reservado: 0190 (tanda A, aplicada) y 0191 (tanda B, plan 166-02)"
  - "Tabla tenants con El Templo sembrado como id=1 (slug el-templo, status active)"
  - "Tabla tenant_settings vacia con unique compuesta (tenant_id, setting_key) y FK a tenants"
  - "Schema Drizzle src/db/schema/tenants.ts exportando tenantStatusEnum, tenants, tenantSettings y RESERVED_TENANT_SLUGS"
  - "Constraints con nombre estable: tenants_slug_unique, uq_tenant_setting, fk_tenant_settings_tenant"
affects:
  - "166-02 (tanda B: tenant_id en users/branches, migracion 0191 con FK a tenants)"
  - "166-03 (tests de migracion + asserts por INFORMATION_SCHEMA sobre los constraints nombrados)"
  - "166-04 (attachScope: JOIN a tenants para leer status)"
  - "167-176 (toda la adopcion de tenancy cuelga de esta raiz)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Raiz de tenancy en la hoja del grafo de imports: tenants.ts NO importa users ni branches (evita el triangulo cuando las anclas importen tenants en 166-02)"
    - "Export del schema fundacional como PRIMERA linea del barrel (evita conflicto de merge con las ramas vivas que appendean al final)"
    - "Seed idempotente con id explicito: INSERT ... SELECT ... WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE id = 1)"

key-files:
  created:
    - el-templo-api/src/db/schema/tenants.ts
    - el-templo-api/src/db/migrations/0190_tenants_core.sql
  modified:
    - el-templo-api/src/db/schema/index.ts

key-decisions:
  - "Migraciones reservadas: 0190 (tanda A) y 0191 (tanda B). Maximo real 0189 confirmado en las 3 fuentes de D-06"
  - "tenants.status usa mysqlEnum con primer argumento 'status' (no 'tenant_status' como el snippet del README seccion 5) y el SQL lo espeja byte a byte"
  - "Todo el codigo de la fase vive en el worktree et-166-tenancy sobre origin/master; el checkout principal quedo intacto"

patterns-established:
  - "Verificacion de numeracion de migraciones en 3 fuentes antes de escribir un numero (arbol del worktree, _migrations local, todas las refs locales y remotas)"
  - "Gate anti-punto-y-coma: grep de ';' en lineas '--' + preview del split real con splitSqlStatements antes de aplicar"
  - "Idempotencia verificada de verdad: segunda corrida del runner + replay manual del .sql contra la DB (0 filas nuevas)"

requirements-completed: [FUND-01]

# Metrics
duration: 5min
completed: 2026-07-26
---

# Phase 166 Plan 01: Fundación de tenancy (tanda A) Summary

**Tablas `tenants` + `tenant_settings` creadas y aplicadas en local con El Templo sembrado como tenant `id=1`, sobre un worktree limpio en `origin/master` y con el bloque de migraciones 0190/0191 reservado contra el máximo real.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-07-26T20:00:08Z
- **Completed:** 2026-07-26T20:06:00Z
- **Tasks:** 3
- **Files modified:** 3 (2 creados, 1 modificado)

## Base de trabajo de la fase (dato operativo para los planes 166-02..06)

| Dato                        | Valor                                                        |
| --------------------------- | ------------------------------------------------------------ |
| Worktree                    | `/home/franco/projects/et-166-tenancy`                       |
| Rama                        | `feat/166-tenancy-fundacion`                                 |
| Base                        | `origin/master` @ `8ac9ba9f` (0 ahead / 0 behind al crearla) |
| Migración reservada tanda A | **`0190_tenants_core.sql`** — escrita y aplicada             |
| Migración reservada tanda B | **`0191`** — libre, la usa el plan 166-02                    |
| Commit de código            | **`9b27ed15`**                                               |

## Accomplishments

- **Worktree aislado creado** sobre `origin/master` actualizado (`git fetch` previo), con `.env`/`.env.development` copiados y `node_modules` materializados desde el lockfile commiteado (`--frozen-lockfile`, cero paquetes nuevos). El checkout compartido `/home/franco/projects/el-templo` quedó **byte a byte igual** que antes del plan (`git status --porcelain` idéntico, verificado por `diff` contra snapshot previo).
- **Bloque de numeración reservado con evidencia de las 3 fuentes de D-06:**
  - (a) árbol del worktree → último `0189_tv_screen.sql`
  - (b) `SELECT MAX(name) FROM _migrations` en la DB local `eltemplo` → `0189_tv_screen.sql` (192 filas)
  - (c) ramas vivas → `origin/staging`, `origin/master` y el worktree `et-164-tv` todos en `0189`; barrido de **todas** las refs locales y remotas confirma que ninguna supera 0189.
    → **0190 y 0191 libres**, tal como preveía el CONTEXT.
- **Schema Drizzle `tenants.ts`** con `tenantStatusEnum`, `tenants`, `tenantSettings` y `RESERVED_TENANT_SLUGS` (13 slugs, D-05), sin campos de billing (README §5), sin importar `users`/`branches`, sin `any`, `tsc --noEmit` verde.
- **Migración `0190_tenants_core.sql` hand-written** con 3 statements, aplicada al local con el runner propio (`pnpm db:migrate`) y verificada por SQL directo.
- **Idempotencia probada de verdad, no en teoría:** segunda corrida del runner (`No new migrations to apply`) **y** replay manual del `.sql` fuera del runner (`mysql < 0190_...sql`, exit 0) → `SELECT COUNT(*) FROM tenants` sigue en 1.

## Task Commits

1. **Task 1: Base de trabajo aislada + reserva del bloque de numeración** — sin commit por diseño del plan (no hay cambios de código: crea worktree y verifica numeración)
2. **Task 2: Schema Drizzle tenants + tenant_settings + slugs reservados** — incluido en `9b27ed15`
3. **Task 3: Migración 0190 hand-written + aplicación local** — `9b27ed15` (feat) — `feat(166): tenants + tenant_settings (tanda A, FUND-01)`, 3 archivos, 162 inserciones

> El plan pide explícitamente commitear el `.sql` **junto** al `.ts` del schema y el barrel (Hard Rule 3 del skill `el-templo-db-migrations`), por eso Tasks 2 y 3 comparten commit.

**Commit de código en:** worktree `/home/franco/projects/et-166-tenancy`, rama `feat/166-tenancy-fundacion`.
**Artefactos de planning** (este SUMMARY + STATE + ROADMAP + REQUIREMENTS): commiteados en el checkout principal.

## Files Created/Modified

- `el-templo-api/src/db/schema/tenants.ts` (nuevo, 106 líneas) — raíz de la jerarquía multi-tenant: `tenants`, `tenant_settings`, enum de status y los 13 slugs reservados
- `el-templo-api/src/db/migrations/0190_tenants_core.sql` (nuevo, 55 líneas) — DDL de ambas tablas + seed idempotente del tenant 1
- `el-templo-api/src/db/schema/index.ts` (modificado, +1) — `export * from "./tenants";` como primera línea

## Estado verificado de la DB local (`eltemplo`)

```
tenants:         1 fila -> id=1  slug=el-templo  status=active  AR / ARS / America/Argentina/Buenos_Aires
tenant_settings: 0 filas
_migrations:     1 fila con name='0190_tenants_core.sql'
```

`SHOW CREATE TABLE` confirma: `enum('active','suspended','archived') NOT NULL DEFAULT 'active'`,
`UNIQUE KEY tenants_slug_unique (slug)`, `UNIQUE KEY uq_tenant_setting (tenant_id, setting_key)`,
`CONSTRAINT fk_tenant_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)`.

## Decisions Made

- **`status` gana sobre `tenant_status`.** El snippet del README §5 pasa `tenant_status` como primer argumento de `mysqlEnum`, lo que crearía una columna física con ese nombre; el resto del diseño (README §5 notas, doc 03 §3, ROADMAP, CONTEXT) habla de `tenants.status`. Se adoptó `status` y la migración lo espeja byte a byte. Gate automatizado en el plan: `grep -c 'mysqlEnum("status"'` = 1 y `'mysqlEnum("tenant_status"'` = 0.
- **Export en la primera línea del barrel** (no al final): además de ser fundacional, evita el conflicto de merge con `et-164-tv`/`wellhub` que appendean al final del archivo.
- **`tenants.ts` en la hoja del grafo de imports:** no importa `users` ni `branches`. En 166-02 las anclas importarán `tenants`, no al revés.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Faltaba el `node_modules` de la raíz del repo para el hook de pre-commit**

- **Found during:** Task 3 (commit en el worktree)
- **Issue:** El plan sólo pedía `pnpm install --frozen-lockfile` en `el-templo-api/`. El hook `.husky/pre-commit` corre `lint-staged` desde la **raíz** del repo, y en un worktree nuevo la raíz no tiene `node_modules` (ni `pnpm-lock.yaml`, que está gitignoreado igual que los `.env`). El commit habría fallado, y usar `--no-verify` está prohibido.
- **Fix:** Copiado `pnpm-lock.yaml` de la raíz del checkout principal al worktree (mismo procedimiento que el plan define para los `.env` gitignoreados) + `pnpm install --frozen-lockfile` en la raíz. Instala sólo 3 devDeps ya commiteadas (`husky`, `lint-staged`, `prettier`) — la raíz no es un workspace pnpm, así que no arrastra los frontends. **Cero paquetes nuevos** (T-166-SC respetado).
- **Files modified:** ninguno del repo (`pnpm-lock.yaml` y `node_modules/` están gitignoreados)
- **Verification:** el commit corrió con hooks: `lint-staged` aplicó `prettier --write` a los 2 `.ts` y completó OK. `tsc --noEmit` re-verificado **después** del hook, verde.

**2. [Rule 1 - Bug] Comentario del schema violaba su propio gate de aceptación**

- **Found during:** Task 2 (verificación)
- **Issue:** El comentario que explica la trampa de `mysqlEnum` citaba textualmente `mysqlEnum("tenant_status", ...)`, con lo cual `grep -c 'mysqlEnum("tenant_status"' tenants.ts` devolvía **1** en vez de 0 — rompiendo el criterio de aceptación que existe justamente para detectar el nombre de columna equivocado. Un gate que se puede romper con un comentario es un gate roto: cualquier revisión futura (o el plan 166-03) leería un falso positivo.
- **Fix:** Reformulado el comentario para explicar lo mismo sin reproducir el literal (`el snippet del README §5 pasa 'tenant_status' como primer argumento…`).
- **Files modified:** `el-templo-api/src/db/schema/tenants.ts`
- **Verification:** `grep -c 'mysqlEnum("status"'` = 1, `grep -c 'mysqlEnum("tenant_status"'` = 0, `tsc --noEmit` verde.
- **Committed in:** `9b27ed15`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Ninguno sobre el alcance. La #1 es infraestructura del worktree (sin ella no se puede commitear respetando los hooks); la #2 preserva la utilidad de un gate del propio plan. Sin scope creep, sin dependencias nuevas.

## Issues Encountered

- **`pnpm install` reporta build scripts ignorados** (`argon2`, `esbuild`, `@firebase/util`, `protobufjs`). Es el comportamiento por defecto de pnpm 10 y ocurre igual en el checkout principal; no afecta `tsc` ni el runner de migraciones, que es todo lo que este plan necesita. Si un plan posterior de la fase 166 necesita **levantar el API o correr la suite** desde este worktree, puede requerir `pnpm approve-builds` para `argon2` (hash de passwords). Anotado, no accionado (no se instala ni aprueba nada sin permiso).

## Verificación contra `<verification>` del plan

| Criterio                                                       | Resultado                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Worktree en `feat/166-tenancy-fundacion` desde `origin/master` | OK — `rev-list --left-right --count origin/master...HEAD` = `0 0` al crearlo   |
| Checkout principal intacto                                     | OK — `diff` de `git status --porcelain` antes/después: sin diferencias         |
| `tenants` y `tenant_settings` con constraints nombrados        | OK — `SHOW CREATE TABLE` confirma los 3 nombres                                |
| Fila `id=1 / el-templo / active` única                         | OK — `COUNT(*)` = 1                                                            |
| `npx tsc --noEmit` verde                                       | OK (antes y después del hook de prettier)                                      |
| Migración idempotente                                          | OK — 2ª corrida del runner + replay manual del `.sql` (exit 0, 0 filas nuevas) |
| Cero `;` en comentarios `--`                                   | OK — grep vacío + split real produce exactamente 3 statements limpios          |

## Known Stubs

Ninguno. `tenant_settings` nace vacía **por diseño** (D-05: coexistencia gradual con `system_settings`, que no recibe `tenant_id` en todo el milestone) y `RESERVED_TENANT_SLUGS` no tiene consumidor de runtime **por diseño** (el alta de tenants es post-v6.0; el plan 166-03 la consume como assert). Ninguno de los dos bloquea el objetivo del plan.

## User Setup Required

Ninguno — no hay configuración de servicios externos. La migración 0190 se aplicará a staging/prod por el pipeline normal cuando la fase viaje en su tren.

## Next Phase Readiness

- **Listo para 166-02 (tanda B):** existe la tabla `tenants` a la que apuntar la FK de `users.tenant_id` y `branches.tenant_id`, existe la fila `id=1` que el backfill escribe literalmente, y el número **0191** está libre y reservado.
- **Listo para 166-04:** `tenants.status` está disponible para el JOIN de `attachScope`.
- **Recordatorio de tren:** la migración **0190 aún no está en `origin/staging` ni en `origin/master`** — vive sólo en la rama `feat/166-tenancy-fundacion`. Cualquier otra fase que reserve un número entre hoy y el merge tiene que verificar **también esta rama** (el worktree `et-164-tv` con 0189 sigue abierto por su propio carril).
- **Sin blockers.**

## Self-Check: PASSED

- `el-templo-api/src/db/schema/tenants.ts` — FOUND (worktree)
- `el-templo-api/src/db/migrations/0190_tenants_core.sql` — FOUND (worktree)
- `el-templo-api/src/db/schema/index.ts` — FOUND (worktree)
- `166-01-SUMMARY.md` — FOUND (checkout principal)
- Commit `9b27ed15` — FOUND en `feat/166-tenancy-fundacion`

---

_Phase: 166-fundaci-n-tenants-anclas-y-scope-server-side_
_Completed: 2026-07-26_
