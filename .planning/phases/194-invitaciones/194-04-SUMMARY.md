---
phase: 194-invitaciones
plan: 04
subsystem: api
tags: [invitations, schema, migration, tenancy, referrals]
requires: ["194-01"]
provides:
  - "Tabla `invitations` (schema + migración 0255) con enums invitationChannelEnum/invitationStatusEnum"
  - "Gates de tenancy: GYM_OWNED_TABLES + TENANT_STRICT_MODULES.referrals; conteos 100/104"
  - "Fábrica createInvitationRow en test/invitations/_helpers.ts"
affects: [194-05, 194-09]
tech-stack:
  added: []
  patterns:
    - "Tabla gym-owned nueva con índices simples y sin UNIQUE (no toca el mapa de derivadas de verify-uniques)"
key-files:
  created:
    - el-templo-api/src/db/schema/invitations.ts
    - el-templo-api/src/db/migrations/0255_invitations.sql
    - el-templo-api/test/invitations/schema.test.ts
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/db/tenant-tables.ts
    - el-templo-api/test/helpers.ts
    - el-templo-api/test/fixtures/second-tenant.ts
    - el-templo-api/test/invitations/_helpers.ts
    - el-templo-api/test/db/tenant-tables.test.ts
    - el-templo-api/test/migrations/0192-0195-tenant-columns.test.ts
    - el-templo-api/test/migrations/0196-tenant-unique-contracts.test.ts
key-decisions:
  - "Sin UNIQUE en 0255 (ni siquiera comentado con la palabra: el criterio grep -ci unique = 0)"
  - "El DELETE de invitations en limpiarSegundoGimnasio va antes de DELETE FROM users, no antes de subscriptions: el fixture no borra subscriptions"
requirements-completed: [D-04, SC-2, SC-6]
completed: 2026-10-06
---

# Phase 194 Plan 04: Tabla invitations Summary

La tabla `invitations` (D-04) existe en schema y en la migración 0255 escrita a mano, está declarada gym-owned en el módulo strict `referrals`, y los 5 conteos fijos de tenancy quedaron en 100/104.

## Commits

| Tarea | Commit | Contenido |
| ----- | ------ | --------- |
| 1 | `1160cc597` | schema + 0255 + `TABLES_TO_CLEAN` + `limpiarSegundoGimnasio` + `createInvitationRow` + `schema.test.ts` |
| 2 | `2f6b02e9a` | `tenant-tables.ts` + conteos en 3 tests |

Numeración verificada: 0255 libre en el árbol, `origin/master` y `origin/staging` (todas topean en 0254).

## Verificación

- `pnpm exec tsc --noEmit` 0; `pnpm lint:tenant` 0; `pnpm typecheck:tests`: ningún archivo tocado aparece en los errores (la deuda preexistente ajena sigue).
- `test/invitations/schema.test.ts`: 4/4 (insert/lectura con tenantValues/tenantWhere y status default; aislamiento El Templo vs gimnasio 2 + `limpiarSegundoGimnasio` con una invitación sembrada; FK impide borrar invitado/invitador; anulación `voided` conserva la fila).
- `test/db/tenant-tables.test.ts` 18/18, `0192-0195-tenant-columns` 6/6, `0196-tenant-unique-contracts` 12/12.
- Mutation testing: reemplazando el `DELETE FROM invitations` del fixture por `SELECT 1`, el test de aislamiento falla con `ER_ROW_IS_REFERENCED_2` (`invitations_inviter_id_fk` desde `DELETE FROM users`). Restaurado. (Un primer intento con un typo en el nombre de la tabla rompía los 4 tests por otra causa, se descartó.)
- Cross-check enums byte a byte: `channel` enum('self_service','assisted') y `status` enum('active','voided') iguales en schema y SQL; 0 líneas `--` con `;`; 0 apariciones de "unique" en el SQL.

## Deviations from Plan

- Task 1 acceptance dice "antes del DELETE de `subscriptions`" en `second-tenant.ts`: ese fixture no borra `subscriptions` (solo `cleanAllTestData`), así que el DELETE de `invitations` quedó antes de `DELETE FROM users` (donde sí revienta). Comentario ajustado.
- Task 2: el título del `it` de 0192-0195 Test 2 decía "98 tablas" (desactualizado desde 0241); lo dejé en "100". Sin otros conteos fijos nuevos: el barrido `toBe(99)|toBe(103)|99 tablas` no encontró un 6.º conteo.
- `schema.test.ts` usa `createMemberInPhysicalBranch` con `status: "activo"` para el invitador y `socios` del fixture del gimnasio 2 como invitador/invitado del tenant 2.

## Notas para integración

- El tren v6.1 también mueve los conteos de tenancy (y numera migraciones): el que integre segundo resuelve sumando.
- No se corrió `db:migrate`/`db:verify-uniques` contra la DB local; la provisión real la probó el test de schema (DB de worker con 0255 aplicada).

## Known Stubs

Ninguno.

## Self-Check: PASSED

- `invitations.ts`, `0255_invitations.sql`, `schema.test.ts` presentes; commits `1160cc597` y `2f6b02e9a` existen.
