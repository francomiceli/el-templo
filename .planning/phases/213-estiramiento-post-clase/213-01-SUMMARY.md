---
phase: 213-estiramiento-post-clase
plan: 01
subsystem: database
tags: [drizzle, mysql, migrations, tenancy, stretch]
requires: []
provides:
  - "Tabla stretch_catalog (lista curada, D-02) y stretch_offers (una fila por alumno y día, D-15/D-16)"
  - "Carga idempotente de los 20 ejercicios del SPEC 4.1 (mig 0331)"
  - "Módulo strict `stretch` declarado y los conteos fijos de tenancy al día"
  - "node_modules por symlink en el worktree"
affects: [213-02, 213-04, 213-05, 213-07]
tech-stack:
  added: []
  patterns:
    [
      "tabla gym-owned strict con UNIQUE tenant-first",
      "semilla INSERT IGNORE ... SELECT filtrada por id y nombre",
    ]
key-files:
  created:
    - el-templo-api/src/db/schema/stretch.ts
    - el-templo-api/src/db/migrations/0330_stretch_tables.sql
    - el-templo-api/src/db/migrations/0331_stretch_catalog_seed.sql
    - el-templo-api/test/migrations/0330-stretch.test.ts
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/db/tenant-tables.ts
    - el-templo-api/test/db/tenant-tables.test.ts
    - el-templo-api/test/migrations/0192-0195-tenant-columns.test.ts
    - el-templo-api/test/migrations/0196-tenant-unique-contracts.test.ts
    - el-templo-api/test/helpers.ts
    - el-templo-api/test/fixtures/second-tenant.ts
key-decisions:
  - "Migraciones 0330 (tablas) y 0331 (semilla): el máximo entre origin/master, origin/staging, egresos y el tren era 0329 (egresos)"
  - "class_end_at queda sin DEFAULT en el SQL (NOT NULL a secas), igual que el schema Drizzle"
requirements-completed: [SC-7, SC-8, D-01, D-02, D-15, D-16]
duration: ~25min
completed: 2026-11-11
---

# Phase 213 Plan 01: Tablas del estiramiento y gates de tenancy Summary

Dos tablas gym-owned strict (`stretch_catalog` y `stretch_offers`) con la lista curada de 20 ejercicios cargada por migración idempotente, el módulo `stretch` declarado y los conteos fijos de tenancy sumados.

## Tareas

| Tarea                             | Resultado                                                                                          | Commit       |
| --------------------------------- | -------------------------------------------------------------------------------------------------- | ------------ |
| 1. node_modules por symlink       | 4 `node_modules` + `.env` y `.env.development` de la API linkeados (ignorados por git, sin commit) | (sin commit) |
| 2. Schema + migraciones 0330/0331 | `stretch.ts`, `index.ts`, 2 `.sql`                                                                 | `eb41a126e`  |
| 3a. Gates de tenancy y limpieza   | `tenant-tables.ts`, 3 tests de conteos, `helpers.ts`, `second-tenant.ts`                           | `705ad3a33`  |
| 3b. Test de migración             | `0330-stretch.test.ts`                                                                             | `c0a511d7f`  |

## Task 1: symlinks (md5 del lockfile, idénticos en origen y destino)

- `el-templo-api/node_modules` -> `/home/franco/projects/el-templo/el-templo-api/node_modules` (`5762f05d4c3d343535472f93bd4d0b09`)
- `el-templo-admin/node_modules` -> `/home/franco/projects/el-templo/el-templo-admin/node_modules` (`8cd26e21a3f478d8abbb652f4802eb3c`)
- `el-templo-app/node_modules` -> `/home/franco/projects/et-202-carga/el-templo-app/node_modules` (`063bf7a8e6676a40ff5a72790afe2aad`)
- `node_modules` raíz -> `/home/franco/projects/el-templo/node_modules` (`package.json` raíz `def354cc8e57c80967cb903307710073`)
- `el-templo-api/.env.development` y `.env` -> los del checkout principal (`DB_HOST=localhost`).
- No se corrió ningún `pnpm install`.

## Numeración de migraciones

Máximo por ref: `origin/master` 0326, `origin/staging` 0326, `feat/egresos-rendiciones` 0329, `feat/v6.1-gimnasio` 0315. Tomadas: **0330** (tablas) y **0331** (semilla), tal como tentativos. Nota: `git ls-tree | sort | tail -1` devuelve `meta` (la carpeta); hay que filtrar `^[0-9]{4}_`.

## Conteos fijos (viejo -> nuevo)

| Test                                                   | Conteo                              | Viejo | Nuevo |
| ------------------------------------------------------ | ----------------------------------- | ----- | ----- |
| `test/db/tenant-tables.test.ts`                        | `GYM_OWNED_TABLES.length`           | 129   | 131   |
| `test/db/tenant-tables.test.ts`                        | `schemaTables.size`                 | 134   | 136   |
| `test/db/tenant-tables.test.ts`                        | `TENANT_EXEMPT_TABLES.length`       | 5     | 5     |
| `test/migrations/0192-0195-tenant-columns.test.ts`     | `gymOwnedChecked` (título + expect) | 129   | 131   |
| `test/migrations/0196-tenant-unique-contracts.test.ts` | Test 10 (título, mensaje, `toBe`)   | 129   | 131   |

Todos coincidían con los valores del plan. Además, `MODULOS_DECLARADOS.stretch` agregado. Para la integración con egresos o el tren: SUMAR deltas (+2 gym-owned, +2 tablas), no elegir un lado. `uniquesChecked` de la 0196 es `>= 48`, no se toca. ISO-01 y CON-04 no se tocaron (como pide el plan).

## Verificaciones

Corridas:

- `lint:tenant` sale 0.
- Checks estáticos de las migraciones (2 `CREATE TABLE`, 20 `INSERT IGNORE`, sin `;` en comentarios) OK.
- `prettier --check` sobre los archivos tocados OK (se corrigió formato del test nuevo y de `tenant-tables.test.ts`).
- `tsc --noEmit`: único ruido son 3 errores en `src/app.ts` (ver abajo), ninguno en archivos de este plan.

No corridas localmente (las cubre CI):

- `pnpm db:migrate` y el conteo de `stretch_catalog` en la base de dev: no hay MySQL local (`mysqladmin ping` falla). Queda sin confirmar que los 20 ids/nombres coincidan con la base de prod: CI no lo prueba (0 filas), hay que mirarlo en staging/prod tras el deploy.
- `0330-stretch.test.ts` y los tests de conteos (necesitan MySQL).

## Deviations from Plan

None - plan executed as written. Un ajuste menor de fidelidad: en la primera versión del SQL `class_end_at` llevaba `DEFAULT CURRENT_TIMESTAMP`; se quitó antes del commit para que coincida con el schema Drizzle (NOT NULL sin default).

## Decisiones tomadas en ejecución

- `stretchOffers` en `TABLES_TO_CLEAN` va justo antes de `schema.attendance` (FK a attendance, users y branches); `stretchCatalog` justo antes de `schema.exercises`.
- La limpieza de `limpiarSegundoGimnasio` va antes del bloque de Conquer y de `DELETE FROM users`.
- Los tests nuevos consultan por `app.dbPool` con `tenant_id = 1` literal en el conteo del catálogo, para no activar el sentinel.

## Problemas del entorno (no del plan)

- `tsc --noEmit` falla con 3 errores en `src/app.ts` (`Cannot find module '@fastify/rate-limit'`): el `node_modules` del checkout principal no tiene ese paquete aunque está en `package.json` y el lockfile coincide. Ya estaba así, no se instaló nada.
- `pnpm typecheck:tests` da DISCREPANCIAS: 20 contra su baseline (p. ej. `test/unit/stretching-selection.test.ts` TS2835/TS7006, `members.test.ts`, `lifecycle.test.ts`), todas de archivos que este plan no toca y con la misma causa probable (dependencias faltantes en ese `node_modules`). Ningún archivo del plan aparece. No se regeneró el baseline porque no es deuda de esta rama. CI tiene el `node_modules` correcto.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. Las dos tablas nuevas nacen con `tenant_id` NOT NULL + FK, módulo strict y UNIQUE con tenant primero (T-213-01); semilla filtrada por id y nombre (T-213-02); sin `;` en comentarios, validado (T-213-03); sin instalar nada (T-213-SC).

## Lecciones para los planes siguientes

- Referirse a las migraciones por nombre (`stretch_tables`, `stretch_catalog_seed`): los números pueden correrse al integrar con egresos (ya va por 0329).
- `stretch.ts` exporta `StretchFamily`, `StretchArm`, `StretchOfferExercise`, `StretchCatalogRow`, `StretchOfferRow`, `NewStretchOfferRow`, `stretchCatalog`, `stretchOffers`. `exercisesCompleted` es `number[]` nullable. Las marcas del embudo son `timestamp` nullable.
- Las consultas Drizzle a estas tablas necesitan `tenantWhere`/`tenantValues` (módulo strict).
- En el entorno local no hay MySQL ni `@fastify/rate-limit`: `tsc` mostrará siempre 3 errores en `src/app.ts`, ignorarlos si son solo esos.

## Self-Check: PASSED

Archivos creados y commits verificados (ver comandos abajo).
