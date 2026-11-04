---
phase: 206-tablero-semanal
plan: 01
subsystem: database
tags: [drizzle, mysql, migration, tenancy, weekly-board]
requires: []
provides:
  - Tablas weekly_board_snapshots y weekly_board_leads (schema Drizzle + migración 0319)
  - Módulo strict `weekly-board` en TENANT_STRICT_MODULES
affects: [206-02, 206-03, 206-04, 206-05, 206-06, 206-07]
tech-stack:
  added: []
  patterns: [tabla gym-owned strict desde el día 1, sellos de cierre independientes por bloque]
key-files:
  created:
    - el-templo-api/src/db/schema/weekly-board.ts
    - el-templo-api/src/db/migrations/0319_weekly_board.sql
    - el-templo-api/test/migrations/0319-weekly-board.test.ts
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/db/tenant-tables.ts
    - el-templo-api/test/db/tenant-tables.test.ts
    - el-templo-api/test/migrations/0192-0195-tenant-columns.test.ts
    - el-templo-api/test/migrations/0196-tenant-unique-contracts.test.ts
    - el-templo-api/test/helpers.ts
    - el-templo-api/test/fixtures/second-tenant.ts
key-decisions:
  - "Forma de almacenamiento: columnas tipadas (no JSON), conteos crudos"
  - "Leads en tabla propia, fuera de la foto (D-24)"
  - "Migración 0319 (origin/master y origin/staging terminan en 0318, reconfirmado con git fetch)"
requirements-completed: [SC-6, SC-7, SC-8, D-08, D-09, D-10, D-24, D-25]
duration: 20min
completed: 2026-11-03
---

# Phase 206 Plan 01: Almacenamiento del Tablero semanal Summary

Dos tablas strict (`weekly_board_snapshots`, `weekly_board_leads`) con migración 0319 escrita a mano, módulo de tenancy `weekly-board` y los conteos fijos de tenancy actualizados.

## Commits

| Commit | Subject |
| --- | --- |
| f9d13fc32 | feat(206-01): tablas weekly_board_snapshots y weekly_board_leads (mig 0319) |
| 9431ced17 | feat(206-01): gates de tenancy para weekly_board (conteos 123/128, módulo strict, limpieza de tests) |
| c21f6d60d | test(206-01): test de forma de la migración 0319 (weekly_board) |

## Qué se hizo

- `weekly-board.ts`: `weeklyBoardSnapshots` (unique `(tenant_id, week_start, branch_id)`, bloque principal + bloque tardío con `main_closed_at` / `late_closed_at` NULL DEFAULT NULL) y `weeklyBoardLeads` (unique `(tenant_id, branch_id, week_start)`, `updated_by` FK a users ON DELETE SET NULL). Tipos `WeeklyBoardSnapshotRow` / `WeeklyBoardLeadRow`.
- `0319_weekly_board.sql`: dos CREATE TABLE con `--> statement-breakpoint`, 5 FK nombradas (`fk_weekly_board_snapshots_tenant/_branch`, `fk_weekly_board_leads_tenant/_branch/_updated_by`), cero datos, sin `;` en comentarios.
- `tenant-tables.ts`: las dos tablas en `GYM_OWNED_TABLES` (antes de `weekly_rotator`, orden alfabético) y `"weekly-board"` en `TENANT_STRICT_MODULES`.
- Limpieza de tests: `TABLES_TO_CLEAN` (al inicio, antes de users/branches) y `limpiarSegundoGimnasio` (DELETE por `tenant_id = TENANT_DOS`, justo después de `audit_log`).

## Conteos de tenancy (para el merge con `feat/oficina` y el tren: SUMAR deltas, no elegir un lado)

| Conteo | Archivo | Antes | Ahora |
| --- | --- | --- | --- |
| `GYM_OWNED_TABLES.length` | test/db/tenant-tables.test.ts | 121 | 123 |
| `schemaTables.size` | test/db/tenant-tables.test.ts | 126 | 128 |
| `MODULOS_DECLARADOS` | test/db/tenant-tables.test.ts | sin `weekly-board` | + `weekly-board` |
| `gymOwnedChecked` | test/migrations/0192-0195-tenant-columns.test.ts | 121 | 123 |
| `gymOwnedChecked` (Test 10, título y mensaje incluidos) | test/migrations/0196-tenant-unique-contracts.test.ts | 121 | 123 |

Delta de este plan: +2 gym-owned, +2 tablas del schema. `feat/oficina` suma +4 (office_*) por su lado, así que al mergear los dos el resultado esperado es la suma de ambos deltas. No se tocaron los conteos de ISO-01 (rutas) ni CON-04 (jobs): van en 206-06 y 206-07. No apareció ningún otro test que cuente tablas gym-owned (búsqueda de 121/126 en `src/` y `test/`).

Notas de merge vs `feat/oficina`: los hunks en conflicto previsibles son (a) el final de `GYM_OWNED_TABLES` / `TENANT_STRICT_MODULES` en `tenant-tables.ts`, (b) el comentario de historial y los `toBe(...)` de los tres tests de conteo, (c) `TABLES_TO_CLEAN` y `limpiarSegundoGimnasio`, (d) `schema/index.ts` (ambas ramas agregan un `export *` al final). La migración 0319 no colisiona con la 0316 de oficina.

## Gates

| Gate | Resultado |
| --- | --- |
| `pnpm exec tsc --noEmit` | exit 0 |
| `pnpm lint:tenant` | exit 0 |
| `pnpm typecheck:tests` | exit 1, ver abajo |
| Prettier sobre los archivos tocados | OK |

`typecheck:tests` sale 1 con 17 discrepancias contra el baseline (14 errores nuevos, 1 empeorado, 2 obsoletos) en archivos que este plan NO toca (`test/unit/*`, `test/wellhub/*`, `test/analytics/analytics.test.ts`, `test/attendance/attendance.test.ts`, `test/subscriptions/lifecycle.test.ts`). Ninguna de las líneas del reporte menciona los archivos del plan (grep por `weekly`, `0319`, `helpers`, `second-tenant`, `tenant-tables`, `0192`, `0196` sin resultados). Se considera preexistente o de entorno del worktree y queda fuera de alcance (no se regeneró el baseline). El orquestador debería confirmar el estado del gate en `master` y/o CI.

## Tests pendientes de CI

No se corrió vitest local (regla del repo). No se aplicó la migración a ninguna base (`db:migrate` prohibido en esta ejecución).

- `el-templo-api/test/migrations/0319-weekly-board.test.ts`: pendiente de CI
- `el-templo-api/test/db/tenant-tables.test.ts`: pendiente de CI
- `el-templo-api/test/migrations/0192-0195-tenant-columns.test.ts`: pendiente de CI
- `el-templo-api/test/migrations/0196-tenant-unique-contracts.test.ts`: pendiente de CI

## Decisiones del ejecutor

- Se agregó un séptimo `it` al test de migración (los sellos son NULL sin default, para blindar el comportamiento del primer TIMESTAMP de MySQL) sobre los cinco que pedía el plan.
- Las comprobaciones de FK usan `KEY_COLUMN_USAGE` e incluyen el destino (`tabla.columna->referenciada`), no solo el nombre.
- En `limpiarSegundoGimnasio` los DELETE van justo tras `audit_log`, primeros del bloque, para que salgan antes de `branches` y `users`.

## Deviations from Plan

None - plan ejecutado tal como estaba escrito (salvo la nota sobre el gate `typecheck:tests` preexistente, arriba).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. Las tablas nuevas nacen con `tenant_id` NOT NULL + FK y en un módulo strict (mitigación T-206-01), la migración es a mano sin datos y con test de forma (T-206-02).

## Self-Check: PASSED
