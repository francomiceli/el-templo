---
phase: 214-comunidad-anotados-aura
plan: 12
subsystem: aura-db
tags: [migrations, aura, member-photos, tenancy, D-30, D-31, D-34, D-45, D-50]
requires: ["214-11"]
provides:
  - "Fuente de Aura profile_photo (enums de aura_transactions y aura_config, AuraSourceType)"
  - "Tabla member_photos (strict en members) con schema Drizzle memberPhotos"
affects: ["214-13", "214-14", "214-15"]
key-files:
  created:
    - el-templo-api/src/db/migrations/0345_aura_source_profile_photo.sql
    - el-templo-api/src/db/migrations/0346_member_photos.sql
    - el-templo-api/src/db/schema/member-photos.ts
    - el-templo-api/test/migrations/0345-0346-profile-photo.test.ts
  modified:
    - el-templo-api/src/db/schema/aura-transactions.ts
    - el-templo-api/src/db/schema/aura-config.ts
    - el-templo-api/src/modules/aura/types.ts
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/db/tenant-tables.ts
    - el-templo-api/test/db/tenant-tables.test.ts
    - el-templo-api/test/migrations/0192-0195-tenant-columns.test.ts
    - el-templo-api/test/migrations/0196-tenant-unique-contracts.test.ts
    - el-templo-api/test/helpers.ts
    - el-templo-api/test/fixtures/second-tenant.ts
decisions:
  - "Numeración 0345 y 0346 confirmada libre con git fetch (origin/master y origin/staging terminan en 0343, el worktree tiene la 0344)"
  - "El test no afirma la fila viva de aura_config (otros archivos del worker la borran): guard estático sobre el SQL, como la 0342"
metrics:
  tasks: 2
  completed: 2026-11-17
---

# Phase 214 Plan 12: fuente profile_photo y tabla member_photos Summary

Migraciones 0345 (valor `profile_photo` al final de los dos enums de Aura + fila de config en 5) y 0346 (`member_photos`: tenant_id NOT NULL DEFAULT 1, 3 FKs nombradas, 2 índices con tenant primero, sin UNIQUE), con schema, registro de tenancy y los conteos fijos.

## Commits

- `5d34164ad` feat(214-12): fuente de Aura profile_photo y tabla member_photos
- `33b873ad3` test(214-12): gates de tenancy de member_photos y test de migraciones

## Conteos de tenancy (viejo -> nuevo)

- `GYM_OWNED_TABLES.length`: 135 -> 136
- `schemaTables.size`: 140 -> 141
- `gymOwnedChecked` (0192-0195 Test 2): 135 -> 136
- 0196 Test 10 (`gymOwnedChecked`, título y mensaje): 135 -> 136
- `member_photos` agregada a `GYM_OWNED_TABLES`, `TENANT_STRICT_MODULES.members` y `MODULOS_DECLARADOS.members`.
- Limpieza: `schema.memberPhotos` en `TABLES_TO_CLEAN` (antes de users) y `DELETE FROM member_photos` en `limpiarSegundoGimnasio`.

## Verificación

- API `npx tsc --noEmit`: 0. `pnpm lint:tenant`: DISCREPANCIAS 0 (allowlist sin cambios).
- `pnpm typecheck:tests`: 0 errores en los archivos tocados (el total sigue rojo por deuda ajena).
- Sin comentarios `--` con `;` en los dos `.sql`. Grep de "termina en" previo: solo el test 0300 (otro enum), sin relación.
- Migraciones NO aplicadas en la base local y tests NO corridos (orden del orquestador, quedan para CI).

## Deviations from Plan

- El caso (b) del test ("existe la fila profile_photo en aura_config") se resolvió con guard estático sobre el SQL (`INSERT IGNORE` y `('profile_photo', 5,`) y no contra la fila viva, igual que el test de la 0342.

## Notas para los planes siguientes

- Tipos exportados por `member-photos.ts`: `MemberPhotoOrigin`, `PhotoRejectionReason`, `MemberPhotoStatus`, `MemberPhotoRow`, `NewMemberPhotoRow`.
- Si falla algo en CI: mirar primero los conteos de tenancy y que el orden de borrado en `TABLES_TO_CLEAN` (memberPhotos antes de users) se respete.
- Plan 14 debe imponer la invariante (una pendiente y una aprobada por persona y origen) con `SELECT ... FOR UPDATE` y aplicar un reporte por persona usando `reporter_ids`.
- `AURA_AMOUNTS.profilePhoto` (5) ya existe en `aura/amounts.ts` (plan 02): el otorgamiento (planes 14/15) lo usa, no la fila de `aura_config`.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno.

## Self-Check: PASSED

Los 2 commits y los 4 archivos nuevos existen.
