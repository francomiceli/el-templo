---
phase: 201-conquer
plan: 01
subsystem: database
tags: [drizzle, mysql, tenancy, migrations, conquer]
requires: []
provides:
  - "10 tablas conquer_* (schema Drizzle + migraciones 0290 y 0291)"
  - "Módulo strict `conquer` en TENANT_STRICT_MODULES"
  - "Limpieza de tests para las 6 tablas de estado (no el catálogo)"
affects: [201-02, 201-03, 201-05, 201-07]
tech-stack:
  added: []
  patterns: ["unions de dominio como `as const` exportados (CONQUER_LEVELS, CONQUER_STEP_KEYS, CONQUER_MODES, CONQUER_UNITS)"]
key-files:
  created:
    - el-templo-api/src/db/schema/conquer.ts
    - el-templo-api/src/db/migrations/0290_conquer_catalog.sql
    - el-templo-api/src/db/migrations/0291_conquer_member_state.sql
    - el-templo-api/test/migrations/0290-0292-conquer.test.ts
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/db/tenant-tables.ts
    - el-templo-api/test/db/tenant-tables.test.ts
    - el-templo-api/test/migrations/0192-0195-tenant-columns.test.ts
    - el-templo-api/test/migrations/0196-tenant-unique-contracts.test.ts
    - el-templo-api/test/helpers.ts
    - el-templo-api/test/fixtures/second-tenant.ts
decisions:
  - "Columnas decimal (perímetros, peso) sin precedente en el repo: `decimal(..., { precision: 5, scale: 1 })`, Drizzle las devuelve como string"
  - "Tipos de dominio exportados además como arrays `as const` (CONQUER_*) para reusarlos en validación de rutas"
metrics:
  tasks: 3
  commits: 3
---

# Phase 201 Plan 01: Base de datos de Conquer v2 Summary

10 tablas `conquer_*` gym-owned (4 de catálogo en 0290, 6 de estado en 0291) con schema Drizzle, todos los gates de tenancy
(114 gym-owned / 119 de schema, módulo `conquer` strict) y test de estructura sobre INFORMATION_SCHEMA.

## Commits

- `feat(201-01): migraciones 0290-0291 de Conquer v2 + schema` (schema, index, 2 SQL)
- `test(201-01): estructura de las tablas conquer_*` (`0290-0292-conquer.test.ts`)
- `test(201-01): gates de tenancy y limpieza de tests para conquer_*`

## Chequeo de numeración (D-21)

- Local: tope 0288 (`0288_sissy_sq_ol_to_ss.sql`).
- `origin/master`: tope 0286. `origin/staging`: tope 0288.
- Worktrees `et-*` y checkout principal: ningún `029*.sql`.
- 0290, 0291 y 0292 libres. Sin choques.

## Gates corridos

- Pre-flight `node_modules` (3 paquetes): OK (son symlinks del orquestador).
- `npx tsc --noEmit` (api): OK.
- `pnpm lint:tenant`: exit 0, `DISCREPANCIAS: 0`.
- `pnpm typecheck:tests | grep -E "test/(conquer|unit/conquer|migrations/0290)"` (y además helpers, second-tenant,
  tenant-tables, 0192/0196): vacío.
- Greps de higiene (`console.*`, `any`): vacíos. SQL: sin `;` en comentarios, 4 + 6 CREATE TABLE, 10 FK a `tenants`.
- `prettier --check` sobre los archivos tocados: OK. Tests NO corridos (regla de la fase; corren en CI).

## Mutantes razonados

SQL mutado, test leído, archivo revertido (`git status --porcelain` limpio).

1. Quitar `DEFAULT 1` de `conquer_steps.tenant_id` (0291) -> falla `test/migrations/0290-0292-conquer.test.ts:108`
   (`expect(Number(rows[0].columnDefault)).toBe(1)`; el default pasaría a `null` y `Number(null)` es 0), caso `conquer_steps`.
2. Invertir el orden de `enum('abierta','vista','resuelta')` en `conquer_alerts.status` -> falla `...conquer.test.ts:161`
   (`toBe(expected)` con `enum('abierta','vista','resuelta')`), caso `conquer_alerts.status`.
3. UNIQUE de `conquer_members` como `(user_id, tenant_id)` -> falla `...conquer.test.ts:144`
   (`expect(row.columnName).toBe("tenant_id")`, la columna en `SEQ_IN_INDEX = 1` sería `user_id`).
4. Sacar una tabla conquer de `GYM_OWNED_TABLES` -> fallan `test/db/tenant-tables.test.ts:126` (`toBe(114)`) y `:131`
   (`toBe(119)` por la clasificación) más la comparación de `MODULOS_DECLARADOS`; `0192-0195...:184` y
   `0196...:650` (`gymOwnedChecked` 114) se enteran por la base real.

Sobre el mutante 1: el guard `toBeGreaterThan(0)` en `...conquer.test.ts:142` evita que el caso de UNIQUE pase "vacío" si una
tabla perdiera todos sus UNIQUE.

## Desvíos del plan

- Valores actuales de tenancy eran exactamente 104/109 (no hizo falta ajustar el +10).
- El test de enums cubre 11 columnas enum (el plan decía 8): se agregaron `status` de alerts y `step`/`mode` de
  `conquer_session_steps`, que también son enums físicos. Más cobertura, sin costo.
- Task 2 produjo dos commits en el orden pedido (schema + SQL, luego test); el Task 1 no tiene commit propio, como dice el plan.
- Ninguna ambigüedad nueva.

## Trampas / notas para los planes siguientes

- `node_modules` de api es un symlink a `et-199-mi-templo`; `npx prettier --write <rutas>` funciona desde `el-templo-api`
  (formato por defecto: coincide con el estilo de la API).
- `mysqlEnum("x", CONQUER_STEP_KEYS)` acepta el `as const` exportado: usarlos desde `schema/conquer.ts` en vez de redeclarar uniones.
- `decimal` devuelve `string` en Drizzle (`armCm`, `weightKg`, ...): convertir en el borde del servicio.
- Los `date` son `mode: "string"` (YYYY-MM-DD), como `avisos.starts_on`.
- `conquer_session_steps` solo tiene `created_at` (sin `updated_at`); `tenantValues` aplica igual.
- `TABLES_TO_CLEAN` y `limpiarSegundoGimnasio` ya limpian estado; el catálogo se siembra en 201-02 (0292) y el test de semilla va en
  el mismo `0290-0292-conquer.test.ts`.
- Queries de tests sobre `conquer_*` pasan por el sentinel strict: usar `tenantWhere(tabla, TEMPLO_CTX)` (lo exporta `_helpers.ts` en 201-05).

## Known Stubs

Ninguno.

## Self-Check: PASSED

Archivos creados y commits verificados con `git log` (3 commits `feat/test(201-01)`), `git status --porcelain` vacío tras el commit del SUMMARY.
