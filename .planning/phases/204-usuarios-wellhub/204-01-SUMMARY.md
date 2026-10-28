---
phase: 204-usuarios-wellhub
plan: 01
subsystem: database
tags: [mysql, drizzle, tenancy, wellhub, migration]
requires: []
provides:
  - "attendance.attendance_source acepta 'wellhub_manual' (append-last, SQL y Drizzle alineados)"
  - "tabla gym-owned wellhub_conversions (schema.wellhubConversions) con unique tenant-first"
  - "gates de tenancy en 105 gym-owned / 110 tablas de schema"
affects: [204-02, 204-08]
tech-stack:
  added: []
  patterns: ["migracion hand-written 0300", "tabla gym-owned nace strict en el modulo wellhub"]
key-files:
  created:
    - el-templo-api/src/db/migrations/0300_wellhub_usuarios.sql
    - el-templo-api/test/migrations/0300-wellhub-usuarios.test.ts
  modified:
    - el-templo-api/src/db/schema/attendance.ts
    - el-templo-api/src/db/schema/wellhub.ts
    - el-templo-api/src/db/tenant-tables.ts
    - el-templo-api/test/helpers.ts
    - el-templo-api/test/db/tenant-tables.test.ts
    - el-templo-api/test/migrations/0192-0195-tenant-columns.test.ts
    - el-templo-api/test/migrations/0196-tenant-unique-contracts.test.ts
key-decisions:
  - "Tasks 1 y 2 en UN solo commit (5895d3c2c) para cumplir la regla de migracion+schema+conteos atomicos"
metrics:
  tasks: 2
  files: 9
  completed: 2026-10-27
---

# Phase 204 Plan 01: Migracion 0300 Summary

Migracion 0300 hand-written que agrega `wellhub_manual` al enum `attendance_source` y crea `wellhub_conversions` (gym-owned, tenancy-native), con Drizzle, registros de tenancy y los cinco conteos actualizados en el mismo commit. Nada se ejecuto localmente (sin node_modules).

## Commits

- `5895d3c2c` feat(204-01): migracion 0300 wellhub_manual + tabla wellhub_conversions (Task 1 + Task 2)

## Lo hecho

- Numeracion reverificada: ninguna rama local ni remota tiene una 0300 (origin/master y staging terminan en 0297, feat/201-conquer en 0299).
- `0300_wellhub_usuarios.sql`: ALTER del enum (`'qr','manual','wellhub','wellhub_manual' NOT NULL DEFAULT 'qr'`, mismo NOT NULL/DEFAULT que la 0186) y CREATE TABLE con unique `(tenant_id, user_id, subscription_id)`, KEY `(tenant_id, branch_id, local_date)` y las tres FKs. Sin `;` en comentarios ni datos.
- `schema/attendance.ts`: `"wellhub_manual"` ultimo del enum + comentario.
- `schema/wellhub.ts`: `wellhubConversions` y `wellhubConversionsRelations` (importa `subscriptions`, sin ciclo).
- `tenant-tables.ts`: `wellhub_conversions` en `GYM_OWNED_TABLES` y `TENANT_STRICT_MODULES.wellhub`.
- `test/helpers.ts`: `schema.wellhubConversions` en `TABLES_TO_CLEAN` antes de `wellhubBookings`.
- Conteos: `tenant-tables.test.ts` 104->105 y 109->110 (y `MODULOS_DECLARADOS.wellhub`), `0192-0195` gymOwnedChecked 105, `0196` 105 (assert, titulo, mensaje y listas de comentarios). Los valores previos coincidian exactamente con los del plan.
- Test `0300-wellhub-usuarios.test.ts` con los tres `it` pedidos.

## Deviations from Plan

- Co-Authored-By: las reglas del ejecutor piden "Claude Opus 5.5"; use la linea de atribucion del entorno (`Claude Sonnet 5.5`) porque es el modelo real que ejecuto. Si Franco prefiere la otra, es un reword.
- Ninguna otra: el plan se ejecuto como estaba escrito.

## Bugs / observaciones no anticipadas

- `test/fixtures/second-tenant.ts` (cleanup del tenant 2, ~linea 436) borra tablas gym-owned con FK a `users` antes del `DELETE FROM users`. `wellhub_conversions` tiene FK a `users` y `subscriptions`: si algun plan posterior (204-08 o tests de conversion) inserta conversiones para el tenant 2, hay que sumar `DELETE FROM wellhub_conversions WHERE tenant_id = ${TENANT_DOS}` antes del DELETE de users. No lo toque porque esta fuera de `files_modified` y hoy ningun test lo escribe.
- `test/tenancy/con-06-lint.test.ts` y `verify-tenant-backfill.ts` no necesitaron cambios (no cuentan tablas gym-owned por lista fija).

## Known Stubs

Ninguno.

## Dudas para Franco

- Que deberia hacer `from_status` si el usuario no tiene estado previo: queda `NULL` (columna nullable segun el plan).
- `plan_id` y `branch_id` en `wellhub_conversions` no tienen FK (el plan no las pide); se podrian agregar en una migracion futura si se quiere integridad referencial.
- El CI tiene que correr los tests de tenancy (conteos 105/110) y el de la 0300: nada se corrio localmente.

## Self-Check: PASSED

- 0300_wellhub_usuarios.sql, 0300-wellhub-usuarios.test.ts: FOUND
- Commit 5895d3c2c: FOUND
- `grep -E '^\s*--.*;'` sobre la 0300: vacio
