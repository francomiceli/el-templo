---
phase: 209-egresos
plan: 01
subsystem: finance
tags: [egresos, migracion-0331, drizzle, tenancy, permisos, audit]
requires: []
provides:
  - tablas expense_records, expense_allocations, expense_payments (migracion 0331)
  - schema Drizzle expense-records.ts (expenseRecords, expenseAllocations, expensePayments, relations)
  - EXPENSES_ROLES y EXPENSES_VOID_ROLES
  - literales de AuditAction y AuditTargetKind de Egresos
affects: [209-02, 209-03, 209-04, 209-07, 209-08, 209-10]
tech-stack:
  added: []
  patterns: [tablas gym-owned strict en finance, test de migracion por INFORMATION_SCHEMA]
key-files:
  created:
    - el-templo-api/src/db/migrations/0331_egresos_gastos_repartos_pagos.sql
    - el-templo-api/src/db/schema/expense-records.ts
    - el-templo-api/test/migrations/0331-egresos.test.ts
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/db/tenant-tables.ts
    - el-templo-api/test/db/tenant-tables.test.ts
    - el-templo-api/test/migrations/0192-0195-tenant-columns.test.ts
    - el-templo-api/test/migrations/0196-tenant-unique-contracts.test.ts
    - el-templo-api/test/helpers.ts
    - el-templo-api/test/fixtures/second-tenant.ts
    - el-templo-api/src/modules/shared/permissions.ts
    - el-templo-api/src/modules/shared/audit-log.ts
decisions:
  - payment_method varchar(20) validado en la API, no enum de DB
  - sin unique por (gasto, sede) en el reparto: la regla vive en el service
metrics:
  tasks: 3
  completed: 2026-11-11
---

# Phase 209 Plan 01: Base de Egresos Summary

Migracion 0331 con las 3 tablas de Egresos (gasto, reparto, pagos) con plata en enteros y `fx_rate` como unico decimal, schema Drizzle, los 5 conteos de tenancy en 132/137, limpiezas de test, dos sets de roles y los literales de audit.

## Que se hizo

1. **Task 1** (`4b39a494d`): migracion `0331_egresos_gastos_repartos_pagos.sql` escrita a mano (3 sentencias, sin `;` en comentarios), `schema/expense-records.ts` con relations, export en `schema/index.ts` y test `0331-egresos.test.ts` (INFORMATION_SCHEMA: columnas y nulabilidad, decimales, `char(7)`, enum, uniques con `tenant_id` al frente, indices, FKs de tenant, CASCADE solo en reparto, 3 sentencias del archivo).
2. **Task 2** (`75cbe54c9`): `GYM_OWNED_TABLES` y `TENANT_STRICT_MODULES.finance` con las 3 tablas; `tenant-tables.test.ts` 129 a 132 y 134 a 137 (valor y titulo, `MODULOS_DECLARADOS`); `0192-0195` y `0196` 129 a 132 (valor, titulo, comentarios y mensaje); `TABLES_TO_CLEAN` y `limpiarSegundoGimnasio` con las 3 tablas (pagos, reparto, gasto).
3. **Task 3** (`42d6c1ebf`): `EXPENSES_ROLES = [owner, admin, gestion]`, `EXPENSES_VOID_ROLES = [owner, admin]`; `AuditAction` += 5 acciones de Egresos; `AuditTargetKind` += `expense_record`.

## Verificacion

La migracion 0331 era el numero libre: la rama termina en 0329 y `origin/master` en 0330 (verificado con `git fetch` y `ls-tree`).

| Corrida | Resultado |
|---|---|
| `test/migrations/0331-egresos.test.ts` | 10 tests pasan |
| `test/db/tenant-tables.test.ts` | 18 tests pasan |
| `test/migrations/0192-0195-tenant-columns.test.ts` | 6 tests pasan |
| `test/migrations/0196-tenant-unique-contracts.test.ts` | 12 tests pasan |

Gates finales: `npx tsc --noEmit` = 0 errores; `npm run -s lint:tenant` = `DISCREPANCIAS: 0`; `npm run -s typecheck:tests` = `DISCREPANCIAS: 18` (linea base, sin sumar).

## Deviations from Plan

None - plan executed exactly as written.

Notas menores, no son desviaciones:
- El grep de asserts fijos (129/134) no encontro otros asserts numericos en `test/`: solo los de los 3 archivos del plan (busque `gymOwnedChecked`, `GYM_OWNED_TABLES.length` y `schemaTables.size`, que son los asserts de conteo).
- Las corridas de vitest superaron los 180 s de provisioning y el harness las paso a segundo plano. Se esperaron hasta su fin y se leyeron los resultados completos (no se usaron `pgrep` ni loops de espera: un unico `tail --pid` bloqueante).

## Decisiones del ejecutor

- `payment_method` es `varchar(20)` con la lista validada en la API (no enum de DB), como indicaba el plan.
- `amount > 0` lo valida el service (sin CHECK). `amount_status` sin DEFAULT: el alta siempre lo manda.
- `expense_allocations` solo tiene `created_at` (sin `updated_at`): el reparto se reemplaza entero al editar. `expense_records` y `expense_payments` tienen `created_at` y `updated_at`.
- Se agrego en el schema el tipo exportado `ExpenseReceiptLink` y `EXPENSE_AMOUNT_STATUSES`/`ExpenseAmountStatus` para que el service y los schemas Ajv de los planes siguientes los reutilicen.
- Relation `creator` del gasto con `relationName: "expenseRecordCreator"` para no chocar con otras relations de `users`.

## Para los planes siguientes

- Nombres de Drizzle: `schema.expenseRecords`, `schema.expenseAllocations`, `schema.expensePayments`. `fxRate` es `number | null` (`mode: "number"`); en SQL crudo un DECIMAL llega como string, envolver con `Number()` (DI-02).
- `paid_on` es `date` con `mode: "string"` (`AAAA-MM-DD`); `imputationMonth` es `char(7)` `AAAA-MM`.
- `expense_payments` tiene `uq_expense_payments_tenant_transaction`: una fila del ledger pertenece a un solo pago. `expense_allocations.branch_id` NULL = Casa Matriz y no hay unique en el reparto: el service valida destinos repetidos y a lo sumo una Casa Matriz.
- FKs de `expense_payments` y `expense_records` sin ON DELETE (restrict); solo el reparto cae en cascada con su gasto.
- Los tests nuevos de las rutas (209-07/08/10) tienen que chequear `EXPENSES_ROLES` / `EXPENSES_VOID_ROLES` en cada ruta: el hook del plugin finance deja pasar a `admin_sede` y `recepcion`.
- Los eventos de audit de los pagos usan `targetKind: "expense_record"` con `targetId` = id del gasto y el id del pago en el payload.
- Aun faltan los conteos de ISO-01/ISO-03 (`ENTRADAS_BASELINE`, `CASOS_BASELINE`) y el manifiesto: se tocan recien cuando haya rutas.

## Known Stubs

None.

## Threat Flags

None. Las 3 tablas son gym-owned strict (T-209-02), la migracion es solo CREATE TABLE sin datos (T-209-01) y los roles quedan declarados para que las rutas los apliquen (T-209-03).

## Self-Check: PASSED

- Archivos creados verificados en disco (migracion, schema, test).
- Commits `4b39a494d`, `75cbe54c9`, `42d6c1ebf` existen en la rama.
