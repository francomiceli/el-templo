---
phase: 215-regalar-aura
plan: 01
subsystem: api-db
tags: [aura, regalos, migracion, tenancy, drizzle]
requires: []
provides:
  - tabla `aura_gifts` (migración 0349), gym-owned strict en el módulo `aura-gifts`
  - schema `auraGifts` y tipos AuraGiftRow, NewAuraGiftRow, AuraGiftStatus, AuraGiftGiverKind, AuraGiftReason, AuraGiftVoidCause
affects:
  [215-02, 215-04, 215-05, 215-06, 215-07, 215-08, 215-09, 215-10, 215-11]
tech-stack:
  added: []
  patterns:
    [
      tabla strict nueva con tenant_id primero en los UNIQUE,
      varchar tipado en vez de mysqlEnum salvo el estado,
    ]
key-files:
  created:
    - el-templo-api/src/db/migrations/0349_aura_gifts.sql
    - el-templo-api/src/db/schema/aura-gifts.ts
    - el-templo-api/test/migrations/0349-aura-gifts.test.ts
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/db/tenant-tables.ts
    - el-templo-api/test/db/tenant-tables.test.ts
    - el-templo-api/test/migrations/0192-0195-tenant-columns.test.ts
    - el-templo-api/test/migrations/0196-tenant-unique-contracts.test.ts
    - el-templo-api/test/helpers.ts
    - el-templo-api/test/fixtures/second-tenant.ts
key-decisions:
  - "La migración usa el número 0349 (origin/master y origin/staging terminan en 0343, la rama en 0347, la 0348 sigue reservada para el repaso de la 214)"
  - "UNIQUE con tenant_id primero: no hizo falta tocar TENANT_UNIQUE_ALLOWLIST"
requirements-completed:
  [SC-1, SC-3, SC-7, D-02, D-03, D-08, D-10, D-11, D-16, D-20]
duration: 25 min
completed: 2026-11-18
---

# Fase 215 Plan 01: tabla `aura_gifts` Summary

Tabla `aura_gifts` (migración 0349), una fila por regalo de Aura, con los dos candados en la base (un regalo de alumno por asistencia y el profe una vez por día a cada persona) y todos los gates de tenancy movidos en el mismo plan.

## Tareas

| Tarea | Commit                                                                          | Contenido                                                                  |
| ----- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1     | `86b6c7aa0` feat(215-01): tabla aura_gifts (mig 0349)                           | `0349_aura_gifts.sql`, `schema/aura-gifts.ts`, export en `schema/index.ts` |
| 2     | `2b3718972` test(215-01): gates de tenancy de aura_gifts y test de la migración | registro de tenancy, conteos, limpieza de tests, test 0349                 |

## Qué quedó

- 18 columnas, 6 FKs nombradas (`fk_aura_gifts_tenant|giver|receiver|branch|schedule|voided_by`), 2 UNIQUE y 4 índices, todos con `tenant_id` primero. Sin FK a `attendance` a propósito.
- `status` es `mysqlEnum("aura_gift_status", ["vigente", "anulado"])` (columna física `aura_gift_status`); `giver_kind`, `reason` y `void_cause` son varchar tipados.
- Tenancy: `aura_gifts` en `GYM_OWNED_TABLES` (junto a las otras de Aura) y `"aura-gifts": ["aura_gifts"]` en `TENANT_STRICT_MODULES` y en `MODULOS_DECLARADOS`.
- Limpieza: `schema.auraGifts` en `TABLES_TO_CLEAN` (justo después de `memberPhotos`, antes de attendance, branches y users) y `DELETE FROM aura_gifts` en `limpiarSegundoGimnasio`.
- Test `0349-aura-gifts.test.ts` con 8 `it`: columnas y nulabilidad, enum y default, 6 FKs con ON DELETE, UNIQUE con sus columnas en orden, choque por asistencia duplicada, no choque de los NULL del profe, choque del profe el mismo día, guard de `;` en comentarios. Nunca corrió local (queda para CI).

## Conteos movidos (viejo a nuevo, verificados antes de sumar)

| Dónde                                               | Viejo     | Nuevo     |
| --------------------------------------------------- | --------- | --------- |
| `GYM_OWNED_TABLES.length` (`tenant-tables.test.ts`) | 136       | 137       |
| `schemaTables.size` (`tenant-tables.test.ts`)       | 141       | 142       |
| `gymOwnedChecked` (0192-0195, Test 2)               | 136       | 137       |
| `gymOwnedChecked` (0196, Test 10, `toBe` y mensaje) | 136       | 137       |
| títulos de los `it` (tres archivos)                 | 136 / 141 | 137 / 142 |

`grep` de `toBe(136)`, `toBe(141)` y `las 136` en los tres archivos: vacío.

## Control posterior

- API `npx tsc --noEmit`: 0 (base 0).
- `pnpm lint:tenant`: DISCREPANCIAS 0.
- `pnpm typecheck:tests`: 18 discrepancias, las mismas de la línea de base heredada (plan 32); ninguna en los archivos tocados.
- App y admin: no se tocaron ni se corrieron. Sin cambios en dependencias, sin push, sin bump de versión, migración NO aplicada en la base local.

## Desvíos respecto del plan

Ninguno. Plan ejecutado tal cual.

## Decisiones propias

- Orden alfabético: `aura-gifts` quedó antes de `branch-reassignments` en los dos registros de módulos.
- El test siembra la sede con el `branchId` del socio de prueba (por defecto la 1) y usa ids de asistencia arbitrarios, ya que no hay FK a `attendance`.

## Lecciones para los planes siguientes

- Los planes que insertan en `aura_gifts` deben pasar siempre `tenant_id` con `tenantValues`, y toda consulta lleva `tenantWhere` literal dentro de cada `.where(...)` (strict).
- `giver_attendance_id` NULL del profe y `coach_gift_date` NULL del alumno no chocan en los UNIQUE (MySQL trata los NULL como distintos): el servicio debe llenar `coach_gift_date` siempre que `giver_kind = 'profe'`.
- Un regalo anulado sigue ocupando el UNIQUE: para "no devuelve el cupo" basta con no borrar nunca la fila.
- Cualquier tabla nueva futura vuelve a mover los 4 conteos (137 y 142 hoy) y los dos listados de limpieza.

## Self-Check: PASSED

Archivos creados y commits `86b6c7aa0` y `2b3718972` verificados.
