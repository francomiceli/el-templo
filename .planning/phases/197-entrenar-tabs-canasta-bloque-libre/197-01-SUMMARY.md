---
phase: 197-entrenar-tabs-canasta-bloque-libre
plan: 01
subsystem: api-db
tags: [migrations, aura, drizzle, bloque-libre]
requires: []
provides:
  - fuente de AURA `extra_block` (SQL + 2 mysqlEnum + AuraSourceType)
  - tabla gym-owned `extra_blocks_completed` (SQL + schema Drizzle `extraBlocksCompleted`)
affects: [197-02, 197-06, 197-08, 197-09]
key-files:
  created:
    - el-templo-api/src/db/migrations/0285_aura_source_extra_block.sql
    - el-templo-api/src/db/migrations/0286_extra_blocks_completed.sql
    - el-templo-api/src/db/schema/extra-blocks-completed.ts
    - el-templo-api/test/migrations/0285-0286-extra-blocks.test.ts
  modified:
    - el-templo-api/src/db/schema/aura-config.ts
    - el-templo-api/src/db/schema/aura-transactions.ts
    - el-templo-api/src/modules/aura/types.ts
    - el-templo-api/src/db/schema/index.ts
requirements: [D-12, D-13]
---

# Fase 197 Plan 01: Base de datos del bloque libre — Summary

Fuente de AURA `extra_block` (monto 5) y tabla propia `extra_blocks_completed` con schema Drizzle y test de migración por INFORMATION_SCHEMA.

## Qué se hizo

1. **0285**: `MODIFY COLUMN ... ENUM(14 valores)` en `aura_transactions.source_type` y `aura_config.aura_config_source_type` (los 13 actuales en el mismo orden + `extra_block` al final), más `INSERT IGNORE` de `('extra_block', 5, ...)` en `aura_config`. Statements separados con `--> statement-breakpoint`. Mismo valor agregado a los dos `mysqlEnum` y a la unión `AuraSourceType`.
2. **0286**: `CREATE TABLE extra_blocks_completed` con las 13 columnas del contrato, índice `idx_extra_blocks_tenant_user_date (tenant_id, user_id, local_date)`, FK `fk_extra_blocks_completed_tenant` y FK cascada a `users`. Sin UNIQUE. Schema `extraBlocksCompleted` (+ tipos `ExtraBlockCompletedRow` / `NewExtraBlockCompleted`) exportado en `schema/index.ts` junto a `completed-sessions`.
3. **Test** `test/migrations/0285-0286-extra-blocks.test.ts` (corre en CI): ENUM de ambas tablas termina en `extra_block` y son idénticos, 13 columnas todas NOT NULL, `aura_awarded` default 0, índice con `tenant_id` en posición 1, único `PRIMARY` como unique, FK a `tenants`, y guard estático del seed (`('extra_block', 5,`) sobre el texto del SQL (no la fila viva, por el borrado de `aura_config` entre archivos del worker).

## Commits

- `ce3b07f4a` feat(197-01): fuente de AURA extra_block (0285)
- `9e61c53c6` feat(197-01): tabla extra_blocks_completed (0286)
- `afdd154a9` test(197-01): migraciones 0285-0286

## Verificación (estática, sin node_modules)

- Chequeo de numeración: 0285/0286 no existen ni en el worktree, ni en `origin/master`, ni en `origin/staging` (última: 0283).
- Script de la tarea 1: `OK` (las 4 listas SQL/mysqlEnum + la unión TS son idénticas, 14 valores, `extra_block` último; ningún `;` en comentarios `--`).
- Script de la tarea 2: `OK`; grep de higiene (`console.`, `any`) sin salida.
- Tarea 3: archivo presente, consulta INFORMATION_SCHEMA, guard del seed, sin `console.`/`any`.
- Sin `Record<AuraSourceType, ...>` ni switches exhaustivos en `src/` que la unión ampliada pueda romper (grep).
- Líneas > 80 columnas: ninguna en el schema; en el test solo strings largos de `it(...)`/`describe(...)` (Prettier no los parte).
- `git status --porcelain` vacío al cerrar.

## Desvíos/decisiones

- Ninguno de fondo. Decisiones menores:
  - La descripción del seed lleva tilde ("día"), tal cual el plan. Las demás líneas de comentario del SQL van sin tildes (estilo de las migraciones previas).
  - El trailer de los commits es `Co-Authored-By: Claude Opus 5.5` según el orquestador (las reglas decían Sonnet 5.5).
  - La rama del worktree es `feat/197-entrenar`, no `worktree-agent-*`: se commiteó ahí por instrucción explícita del orquestador.

## Bugs encontrados

Ninguno.

## Para el orquestador / planes siguientes

- **CI queda rojo hasta el plan 197-02**: la tabla nueva todavía no está en `GYM_OWNED_TABLES` / `TENANT_STRICT_MODULES` (`db/tenant-tables.ts`) ni en los conteos 103->104 / 108->109 de `test/db/tenant-tables.test.ts`, `0192-0195-tenant-columns.test.ts`, `0196-tenant-unique-contracts.test.ts`. Es lo que cubre 197-02 (no se hizo acá por estar fuera de `files_modified`).
- Al mismo plan: `TABLES_TO_CLEAN` y `limpiarSegundoGimnasio` deben sumar `extra_blocks_completed`.
- Los tests que dependan de la fuente `extra_block` deben re-sembrar `aura_config` en `beforeEach` (`INSERT ... ON DUPLICATE KEY UPDATE default_amount = 5`).

## Self-Check: PASSED

Archivos creados presentes y commits `ce3b07f4a`, `9e61c53c6`, `afdd154a9` en el log de `feat/197-entrenar`.
