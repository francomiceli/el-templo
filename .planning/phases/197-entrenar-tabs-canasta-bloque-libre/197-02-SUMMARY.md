---
phase: 197-entrenar-tabs-canasta-bloque-libre
plan: 02
subsystem: api-tenancy
tags: [tenancy, sentinel, tests, bloque-libre]
requires: ["197-01"]
provides:
  - extra_blocks_completed clasificada gym-owned y strict (módulo `free-blocks`)
  - conteos fijos 104 / 109 en los tres tests que los afirman
  - limpieza de la tabla en TABLES_TO_CLEAN y en limpiarSegundoGimnasio
affects: [197-06, 197-08, 197-09]
key-files:
  modified:
    - el-templo-api/src/db/tenant-tables.ts
    - el-templo-api/test/db/tenant-tables.test.ts
    - el-templo-api/test/migrations/0192-0195-tenant-columns.test.ts
    - el-templo-api/test/migrations/0196-tenant-unique-contracts.test.ts
    - el-templo-api/test/helpers.ts
    - el-templo-api/test/fixtures/second-tenant.ts
requirements: [D-13]
---

# Fase 197 Plan 02: Gates de tenancy de extra_blocks_completed — Summary

`extra_blocks_completed` entra a `GYM_OWNED_TABLES` y a `TENANT_STRICT_MODULES["free-blocks"]` (nace strict, igual que `sponsor_views`), los conteos fijos suben 103 -> 104 y 108 -> 109, y la tabla se limpia en los fixtures de test.

## Qué se hizo

1. **Registro** (`tenant-tables.ts`): `"extra_blocks_completed"` en orden alfabético (entre `exercises` y `financial_transactions`) con comentario de fase, y clave `"free-blocks"` en `TENANT_STRICT_MODULES` entre `communications` e `improvement-proposals`. Sin entradas en `TENANT_UNIQUE_ALLOWLIST` ni `TENANT_GLOBAL_UNIQUES` (la tabla no tiene uniques).
2. **Conteos**: `tenant-tables.test.ts` (104 gym-owned, 109 en schema, exentas siguen en 5, mapa strict esperado con `free-blocks`), `0192-0195-tenant-columns.test.ts` (título del Test 2, `toBe(104)`, historia en docblock y comentario) y `0196-tenant-unique-contracts.test.ts` (título del Test 10, mensaje, `toBe(104)`).
3. **Limpieza**: `schema.extraBlocksCompleted` antes de `schema.auraTransactions` en `TABLES_TO_CLEAN`, y `DELETE FROM extra_blocks_completed WHERE tenant_id = ${TENANT_DOS}` en `limpiarSegundoGimnasio` antes del DELETE de `users`.

## Commits

- `e45310b2b` feat(197-02): gates de tenancy de extra_blocks_completed (gym-owned strict) + conteos fijos
- `5b6419950` test(197-02): limpieza de extra_blocks_completed en fixtures

## Verificación (estática, sin node_modules)

- Script de la tarea 1: `OK` (104 entradas en GYM_OWNED_TABLES, clave strict, 104/109 en los tests, sin `toBe(103)` residual).
- Script de la tarea 2: `OK` (con la salvedad de abajo).
- Grep de higiene (`console.`, `any`) sobre el diff: sin salida. Las únicas líneas > 80 columnas agregadas son comentarios, títulos de `it(...)` y el string del mensaje (Prettier no los parte), igual que en el precedente `7ce1debd9`.
- Barrido de otros lugares con conteos 103/108 o que nombren las tablas de la fase 199 (`sponsor_views`): `test/tenant-manifest.ts` e `iso-01-manifiesto.test.ts` solo hablan de RUTAS, no se tocan hasta que existan los endpoints (planes 197-06/08).
- `git status --porcelain` vacío al cerrar (tras commitear este SUMMARY).

## Desvíos/decisiones

- El script `<verify>` de la tarea 2 busca `indexOf("DELETE FROM users")`, que matchea primero un comentario ya existente (línea ~389 de `second-tenant.ts`, anterior a todo). Con ese criterio literal el orden siempre "falla" o es trivial. Se verificó en cambio contra la sentencia real `sql\`DELETE FROM users WHERE tenant_id\``: el DELETE de la tabla nueva va antes. No es un problema del código, solo del verify del plan.
- Trailer de los commits: `Claude Opus 5.5` según el orquestador (las reglas decían Sonnet 5.5).
- Los comentarios de historia llevan fecha 2026-10-20 (fecha actual de la fase).

## Bugs encontrados

Ninguno.

## Para el orquestador / planes siguientes

- Con este plan debería volver a verde el gate de clasificación fail-closed en CI (conteos y strict). No pude correr nada local (regla de la fase).
- Al ser strict, cualquier query nueva sobre `extra_blocks_completed` sin `tenantWhere`/`tenantValues` hace throw en test/dev y falla `lint:tenant`: los planes 197-06/08/09 tienen que scopearla desde la primera línea.
- Los tests de rutas nuevas (planes siguientes) sumarán entradas al manifiesto de rutas ISO-01 (`test/tenant-manifest.ts` + `ENTRADAS_BASELINE`).

## Self-Check: PASSED

Archivos modificados presentes y commits `e45310b2b`, `5b6419950` en el log de `feat/197-entrenar`.
